"""[Task 30][SEND-RESULT-*·SEND-BADGE-*·SEND-FAIL-*] 발송 결과 집계·배지·실패 명단·상태 콜백.

message_service의 Task 30 확장을 db_conn 주입으로 검증한다(라우터 가드는 test_messages_router).
"""
import pytest

from app.core.security import StaffContext
from app.services import message_service
from tests.conftest import seed_staff


async def _ctx(conn, role="receptionist") -> StaffContext:
    s = await seed_staff(conn, role=role)
    return StaffContext(id=s["staff_id"], auth_user_id=s["auth_user_id"],
                        role=role, department_id=None)


async def _patient(conn, name="김환자", phone="01011112222", sms_dead=False):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone, sms_dead) "
        "values ($1, '1990-05-14', 'F', $2, $3) returning id", name, phone, sms_dead)


async def _failed_log(conn, pid, staff_id, *, ntype="staff_direct", kind="transactional",
                      status="실패", handled=False, batch=None):
    return await conn.fetchval(
        "insert into notification_log "
        "(patient_id, notification_type, kind, channel, sender_staff_id, delivery_status, "
        " handled_at, batch_id, body) "
        "values ($1,$2,$3,'sms',$4,$5, case when $6 then now() else null end, $7, '안내') "
        "returning id",
        pid, ntype, kind, staff_id, status, handled, batch)


# ── enqueue: 원래 채널 보존 + 배치 키(SEND-RESULT-09/11) ──────────────────────
@pytest.mark.asyncio
async def test_RESULT_09_enqueue_stores_requested_channel(db_conn):
    """[SEND-RESULT-09] 즉시 발송이 사용자가 고른 원래 3값(push_sms)을 requested_channel에 남긴다."""
    staff = await _ctx(db_conn)
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push_sms", body="x", conn=db_conn)
    req = await db_conn.fetchval(
        "select requested_channel from notification_log where id=$1", res.notification_ids[0])
    assert req == "push_sms"


@pytest.mark.asyncio
async def test_RESULT_11_enqueue_shares_one_batch_id(db_conn):
    """[SEND-RESULT-11] 한 번의 발송(대상 N명)은 하나의 batch_id로 묶인다."""
    staff = await _ctx(db_conn)
    ids = [await _patient(db_conn, phone=f"0101111{n:04d}") for n in range(3)]
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": ids},
        channel="push", body="x", conn=db_conn)
    batches = await db_conn.fetch(
        "select distinct batch_id from notification_log where id = any($1::uuid[])",
        res.notification_ids)
    assert len(batches) == 1 and batches[0]["batch_id"] is not None


# ── 목록 집계(SEND-RESULT-12) ─────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_RESULT_12_list_aggregates_result_counts(db_conn):
    """[SEND-RESULT-12] 목록 줄이 배치별 도달/재시도중/실패 건수를 실어 준다."""
    staff = await _ctx(db_conn)
    ids = [await _patient(db_conn, phone=f"0102222{n:04d}") for n in range(4)]
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": ids},
        channel="sms", body="집계", conn=db_conn)
    nids = res.notification_ids
    await db_conn.execute("update notification_log set delivery_status='도달' where id=any($1::uuid[])", nids[:2])
    await db_conn.execute("update notification_log set delivery_status='재시도중' where id=$1", nids[2])
    await db_conn.execute("update notification_log set delivery_status='실패' where id=$1", nids[3])
    out = await message_service.list_messages(staff, conn=db_conn)
    line = next(r for r in out["sent"].rows if r["body"] == "집계")
    assert line["result"] == {"발송중": 0, "도달": 2, "재시도중": 1, "실패": 1}


# ── 배지(SEND-BADGE-*) ────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_BADGE_01_counts_call_needed_failures(db_conn):
    """[SEND-BADGE-01·02] 전화해야 할 실패(살아있는 번호·전화 대상 종류)만 센다."""
    staff = await _ctx(db_conn)
    pid = await _patient(db_conn)
    await _failed_log(db_conn, pid, staff.id, ntype="rescheduled")
    n = await message_service.badge_count(staff, conn=db_conn)
    assert n == 1


@pytest.mark.asyncio
async def test_BADGE_02_excludes_marketing(db_conn):
    """[SEND-BADGE-02] 광고 실패는 세지 않는다(전화할 일이 아니다)."""
    staff = await _ctx(db_conn)
    pid = await _patient(db_conn)
    await _failed_log(db_conn, pid, staff.id, ntype="staff_direct", kind="marketing")
    n = await message_service.badge_count(staff, conn=db_conn)
    assert n == 0


@pytest.mark.asyncio
async def test_BADGE_03_excludes_dead_numbers(db_conn):
    """[SEND-BADGE-03] 죽은 번호는 세지 않는다 — 전화가 안 걸리는 사람은 다음 방문에 잡는다."""
    staff = await _ctx(db_conn)
    pid = await _patient(db_conn, sms_dead=True)
    await _failed_log(db_conn, pid, staff.id, ntype="rescheduled")
    n = await message_service.badge_count(staff, conn=db_conn)
    assert n == 0


@pytest.mark.asyncio
async def test_BADGE_06_mark_handled_decrements(db_conn):
    """[SEND-BADGE-06] 처리 표시하면 배지에서 빠진다(열기만으로는 안 빠진다)."""
    staff = await _ctx(db_conn)
    pid = await _patient(db_conn)
    nid = await _failed_log(db_conn, pid, staff.id, ntype="rescheduled")
    await message_service.mark_handled(staff, nid, conn=db_conn)
    n = await message_service.badge_count(staff, conn=db_conn)
    assert n == 0


# ── 실패 명단 두 무리(SEND-FAIL-02·06) ────────────────────────────────────────
@pytest.mark.asyncio
async def test_FAIL_02_splits_call_now_and_fix_number(db_conn):
    """[SEND-FAIL-02·06] 실패 명단이 '지금 전화'(번호 살아있음)와 '번호 고쳐야 함'(죽음)으로 갈린다."""
    staff = await _ctx(db_conn)
    batch = await db_conn.fetchval("select gen_random_uuid()")
    alive = await _patient(db_conn, name="살아있음", phone="01033334444")
    dead = await _patient(db_conn, name="죽음", phone="01055556666", sms_dead=True)
    await _failed_log(db_conn, alive, staff.id, batch=batch)
    await _failed_log(db_conn, dead, staff.id, batch=batch)
    out = await message_service.failed_list(staff, batch, conn=db_conn)
    assert len(out["call_now"]) == 1 and len(out["fix_number"]) == 1


@pytest.mark.asyncio
async def test_FAIL_07_row_has_name_phone_reason(db_conn):
    """[SEND-FAIL-07] 실패 줄은 이름·번호·왜 안 갔나 셋을 담는다."""
    staff = await _ctx(db_conn)
    batch = await db_conn.fetchval("select gen_random_uuid()")
    alive = await _patient(db_conn, name="홍길동", phone="01033334444")
    nid = await _failed_log(db_conn, alive, staff.id, batch=batch)
    await db_conn.execute(
        "update notification_log set failure_code='blocked' where id=$1", nid)
    out = await message_service.failed_list(staff, batch, conn=db_conn)
    row = out["call_now"][0]
    assert row["name"] == "홍길동" and row["phone"] and row["failure_code"] == "blocked"


# ── 상태 콜백(SEND-RESULT-02) ─────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_RESULT_02_callback_marks_delivered(db_conn):
    """[SEND-RESULT-02] 업체 도달 콜백이 provider_message_id로 줄을 찾아 '도달'로 바꾼다."""
    staff = await _ctx(db_conn)
    pid = await _patient(db_conn)
    nid = await db_conn.fetchval(
        "insert into notification_log (patient_id, notification_type, channel, "
        "delivery_status, provider_message_id, body) "
        "values ($1,'staff_direct','sms','발송중','sid-1','x') returning id", pid)
    await message_service.handle_status_callback(
        provider_message_id="sid-1", status="delivered", failure_code=None, conn=db_conn)
    status = await db_conn.fetchval("select delivery_status from notification_log where id=$1", nid)
    assert status == "도달"


@pytest.mark.asyncio
async def test_RESULT_02_callback_failure_permanent_marks_silpae(db_conn):
    """[SEND-RESULT-02][SEND-RETRY-02] 영구 실패 콜백은 '실패'로 못 박는다."""
    staff = await _ctx(db_conn)
    pid = await _patient(db_conn)
    nid = await db_conn.fetchval(
        "insert into notification_log (patient_id, notification_type, channel, "
        "delivery_status, provider_message_id, body) "
        "values ($1,'staff_direct','sms','발송중','sid-2','x') returning id", pid)
    await message_service.handle_status_callback(
        provider_message_id="sid-2", status="failed", failure_code="invalid_number", conn=db_conn)
    status = await db_conn.fetchval("select delivery_status from notification_log where id=$1", nid)
    assert status == "실패"
