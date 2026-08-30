import pytest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from uuid import uuid4, UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_booking_service
from tests.conftest import seed_patient, seed_staff

# 예약 서비스는 create_booking/change_booking이 acquire_as(patient)로 별도 커넥션을 연다 →
# 시드는 committed_conn으로(커밋돼야 그 별도 커넥션이 본다. Task 2~4 하네스 패턴). set_session_auth는
# 불필요하다 — 서비스가 자기 커넥션에서 환자 세션(RLS)을 스스로 세운다. auth.users insert는
# committed_conn(postgres 역할)에서 일어나므로 권한 문제도 없다.


def _ctx(seed: dict) -> PatientContext:
    return PatientContext(id=seed["patient_id"], auth_user_id=seed["auth_user_id"])


async def _seed_base(committed_conn):
    """예약 한 건을 만들 수 있는 최소 데이터. 담당의 소속 과 = 예약 과(1단계 정합성 트리거)."""
    doctor = await seed_staff(committed_conn, role="doctor")
    dept_id = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    slot_id = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2999-08-01', '09:00') returning id",
        doctor["staff_id"])
    return {"dept_id": dept_id, "doctor_id": doctor["staff_id"], "slot_id": slot_id,
            "patient": _ctx(await seed_patient(committed_conn))}


@pytest.mark.asyncio
async def test_migration_adds_request_id_and_qnr_mover(committed_conn):
    # 멱등 키 칸 + 계정별 유니크 + 문진 이동 함수가 실재해야 한다.
    assert await committed_conn.fetchval(
        "select 1 from information_schema.columns "
        "where table_name='appointments' and column_name='request_id'") == 1
    assert await committed_conn.fetchval(
        "select 1 from information_schema.columns "
        "where table_name='hospital_settings' and column_name='auto_confirm_app_bookings'") == 1
    assert await committed_conn.fetchval(
        "select 1 from pg_proc where proname='move_questionnaire_response'") == 1


@pytest.mark.asyncio
async def test_create_booking_auto_confirms_by_default(committed_conn):
    # #29(AD-051): auto_confirm 기본값 true → 앱 예약의 기본 결과는 예약확정.
    # hospital_settings는 싱글턴이라 autouse cleanup 대상이 아니다 — 공용 DB의 잔여값에 기대지 말고
    # 이 테스트가 검증할 상태(true)를 스스로 세운다(다른 테스트가 false로 바꿔놨을 수 있다).
    await committed_conn.execute("update hospital_settings set auto_confirm_app_bookings=true")
    ctx = await _seed_base(committed_conn)
    aid = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=uuid4())
    row = await committed_conn.fetchrow("select status, source from appointments where id=$1", aid)
    assert row["status"] == "예약확정" and row["source"] == "app"
    assert await committed_conn.fetchval("select status from appointment_slots where id=$1", ctx["slot_id"]) == "예약됨"


@pytest.mark.asyncio
async def test_create_booking_requests_when_auto_confirm_off(committed_conn):
    ctx = await _seed_base(committed_conn)
    await committed_conn.execute("update hospital_settings set auto_confirm_app_bookings=false")
    try:
        aid = await patient_booking_service.create_booking(
            ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
            doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=uuid4())
        assert await committed_conn.fetchval("select status from appointments where id=$1", aid) == "예약신청"
    finally:
        # 싱글턴을 데모 기본값(#29 true)으로 되돌린다 — 이 테스트가 공용 DB를 false로 남기지 않게.
        await committed_conn.execute("update hospital_settings set auto_confirm_app_bookings=true")


@pytest.mark.asyncio
async def test_create_booking_is_idempotent_on_same_request_id(committed_conn):
    # 갭 #15: 같은 request_id로 두 번 → 같은 예약 하나만. 두 번째는 book_slot 없이 기존 걸 돌려준다.
    ctx = await _seed_base(committed_conn)
    rid = uuid4()
    first = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=rid)
    second = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=rid)
    assert first == second
    assert await committed_conn.fetchval("select count(*) from appointments where account_patient_id=$1", ctx["patient"].id) == 1


@pytest.mark.asyncio
async def test_create_booking_rejects_source_staff(committed_conn):
    # source는 4단계 챗봇과 공유하는 계약이지만 환자 경로는 'app'/'chatbot'만. 'staff'는 거부.
    ctx = await _seed_base(committed_conn)
    with pytest.raises(AppError) as e:
        await patient_booking_service.create_booking(
            ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
            doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=uuid4(), source="staff")
    assert e.value.status_code == 400


@pytest.mark.asyncio
async def test_create_booking_fails_when_slot_taken(committed_conn):
    ctx = await _seed_base(committed_conn)
    await committed_conn.execute("update appointment_slots set status='예약됨' where id=$1", ctx["slot_id"])
    with pytest.raises(AppError) as e:
        await patient_booking_service.create_booking(
            ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
            doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=uuid4())
    assert e.value.status_code == 409


async def _make_appointment(committed_conn, ctx, slot_id):
    return await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=slot_id, reason="감기", request_id=uuid4())


@pytest.mark.asyncio
async def test_change_booking_moves_questionnaire_keeping_submitted_at(committed_conn):
    # APPT-CHG-10·11 / C-6: 문진이 새 예약으로 옮겨지고 작성 시각은 그대로.
    ctx = await _seed_base(committed_conn)
    new_slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-08-03','10:00') returning id",
        ctx["doctor_id"])
    old_id = await _make_appointment(committed_conn, ctx, ctx["slot_id"])
    tid = await committed_conn.fetchval("insert into questionnaire_templates (department_id, questions) values ($1, '[]'::jsonb) returning id", ctx["dept_id"])
    orig_at = await committed_conn.fetchval(
        "insert into questionnaire_responses (appointment_id, template_id, answers, submitted_at) "
        "values ($1,$2,'{}'::jsonb, '2999-07-30 08:00+00') returning submitted_at", old_id, tid)
    updated_at = await committed_conn.fetchval("select updated_at from appointments where id=$1", old_id)

    new_id = await patient_booking_service.change_booking(
        ctx["patient"], old_id, new_slot, reason="시간 변경", expected_updated_at=updated_at)

    assert await committed_conn.fetchval("select status from appointments where id=$1", old_id) == "환자취소"
    assert await committed_conn.fetchval("select status from appointment_slots where id=$1", ctx["slot_id"]) == "빈시간"
    moved = await committed_conn.fetchrow("select appointment_id, submitted_at from questionnaire_responses where template_id=$1", tid)
    assert moved["appointment_id"] == new_id and moved["submitted_at"] == orig_at  # 시각 유지


@pytest.mark.asyncio
async def test_change_booking_rejects_stale_updated_at(committed_conn):
    # APPT-RACE-01 (갭 #12): 화면이 보낸 updated_at이 서버와 다르면 409, 슬롯은 그대로.
    ctx = await _seed_base(committed_conn)
    new_slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-08-03','10:00') returning id",
        ctx["doctor_id"])
    old_id = await _make_appointment(committed_conn, ctx, ctx["slot_id"])
    stale = datetime.fromisoformat("2000-01-01T00:00:00+00:00")
    with pytest.raises(AppError) as e:
        await patient_booking_service.change_booking(
            ctx["patient"], old_id, new_slot, reason="시간 변경", expected_updated_at=stale)
    assert e.value.status_code == 409
    assert await committed_conn.fetchval("select status from appointment_slots where id=$1", new_slot) == "빈시간"  # 점유 안 함


# ── Task 6: 취소(30분 유예 C-5·낙관적 잠금) + 마감 후 지원요청 ──────────────

async def _make_future_appt(committed_conn, ctx, *, days=10):
    """마감(기본 24h 전)에 여유 있는 미래 슬롯 예약 하나."""
    d = (datetime.now(ZoneInfo("Asia/Seoul")) + timedelta(days=days)).date()
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,'09:00') returning id",
        ctx["doctor_id"], d)
    aid = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=slot, reason="감기", request_id=uuid4())
    return aid, slot


@pytest.mark.asyncio
async def test_cancel_before_deadline_cancels_immediately(committed_conn):
    # CANCEL-PRE: 마감 전이면 즉시 환자취소 + 슬롯 반납.
    ctx = await _seed_base(committed_conn)
    aid, slot = await _make_future_appt(committed_conn, ctx)
    uat = await committed_conn.fetchval("select updated_at from appointments where id=$1", aid)
    result = await patient_booking_service.cancel_appointment(ctx["patient"], aid, expected_updated_at=uat)
    assert result == {"cancelled": True, "after_deadline": False}
    assert await committed_conn.fetchval("select status from appointments where id=$1", aid) == "환자취소"
    assert await committed_conn.fetchval("select cancelled_by from appointments where id=$1", aid) == "patient"
    assert await committed_conn.fetchval("select status from appointment_slots where id=$1", slot) == "빈시간"


@pytest.mark.asyncio
async def test_cancel_within_30min_grace_ignores_deadline(committed_conn):
    # CANCEL-NEW(C-5): 마감이 지난 오늘 슬롯이라도 만든 지 30분 이내면 즉시 취소된다.
    ctx = await _seed_base(committed_conn)
    soon = (datetime.now(ZoneInfo("Asia/Seoul")) + timedelta(hours=1))
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,$3) returning id",
        ctx["doctor_id"], soon.date(), soon.time().replace(microsecond=0))
    aid = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=slot, reason="감기", request_id=uuid4())  # 방금 생성 → 30분 이내
    uat = await committed_conn.fetchval("select updated_at from appointments where id=$1", aid)
    result = await patient_booking_service.cancel_appointment(ctx["patient"], aid, expected_updated_at=uat)
    assert result == {"cancelled": True, "after_deadline": False}
    assert await committed_conn.fetchval("select status from appointments where id=$1", aid) == "환자취소"


@pytest.mark.asyncio
async def test_cancel_after_deadline_does_not_cancel(committed_conn):
    # CANCEL-LATE: 마감 후 + 30분 유예도 지났으면 취소하지 않고 after_deadline만 알린다(예약·슬롯 유지).
    ctx = await _seed_base(committed_conn)
    soon = (datetime.now(ZoneInfo("Asia/Seoul")) + timedelta(hours=1))
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,$3) returning id",
        ctx["doctor_id"], soon.date(), soon.time().replace(microsecond=0))
    aid = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=slot, reason="감기", request_id=uuid4())
    await committed_conn.execute("update appointments set created_at = now() - interval '1 hour' where id=$1", aid)  # 30분 유예 소진
    uat = await committed_conn.fetchval("select updated_at from appointments where id=$1", aid)
    result = await patient_booking_service.cancel_appointment(ctx["patient"], aid, expected_updated_at=uat)
    assert result == {"cancelled": False, "after_deadline": True}
    assert await committed_conn.fetchval("select status from appointments where id=$1", aid) in ("예약신청", "예약확정")
    assert await committed_conn.fetchval("select status from appointment_slots where id=$1", slot) == "예약됨"


@pytest.mark.asyncio
async def test_cancel_rejects_stale_updated_at(committed_conn):
    # APPT-RACE-01: 취소도 낙관적 잠금. 화면이 본 버전과 다르면 409, 예약 그대로.
    ctx = await _seed_base(committed_conn)
    aid, slot = await _make_future_appt(committed_conn, ctx)
    stale = datetime.fromisoformat("2000-01-01T00:00:00+00:00")
    with pytest.raises(AppError) as e:
        await patient_booking_service.cancel_appointment(ctx["patient"], aid, expected_updated_at=stale)
    assert e.value.status_code == 409
    assert await committed_conn.fetchval("select status from appointments where id=$1", aid) in ("예약신청", "예약확정")


@pytest.mark.asyncio
async def test_request_support_records_and_is_idempotent(committed_conn):
    # CANCEL-LATE-11: [상담 채팅 연결]을 눌러야 support_requested_at+request_type 기록. 감사 note 1행(from=to).
    ctx = await _seed_base(committed_conn)
    aid, _ = await _make_future_appt(committed_conn, ctx)
    first = await patient_booking_service.request_support(ctx["patient"], aid, request_type="취소")
    assert first == {"support_requested": True, "already_requested": False}
    row = await committed_conn.fetchrow("select support_requested_at, request_type from appointments where id=$1", aid)
    assert row["support_requested_at"] is not None and row["request_type"] == "취소"
    # 상태는 안 바뀐다(예약 유지). 지원요청 감사 note는 from=to로 1행(생성 트리거 note는 from=null이라 제외).
    notes = await committed_conn.fetch(
        "select from_status, to_status from appointment_status_history "
        "where appointment_id=$1 and changed_by_patient_id is not null and from_status = to_status", aid)
    assert len(notes) == 1 and notes[0]["from_status"] == notes[0]["to_status"]
    # CANCEL-LATE-14: 이미 요청했으면 멱등(두 번째는 already_requested).
    second = await patient_booking_service.request_support(ctx["patient"], aid, request_type="취소")
    assert second == {"support_requested": True, "already_requested": True}


@pytest.mark.asyncio
async def test_request_support_rejects_bad_type(committed_conn):
    ctx = await _seed_base(committed_conn)
    aid, _ = await _make_future_appt(committed_conn, ctx)
    with pytest.raises(AppError) as e:
        await patient_booking_service.request_support(ctx["patient"], aid, request_type="기타")
    assert e.value.status_code == 400


# ── Task 9: 알림 배관(dispatcher는 스텁; 판정은 test_notification_service가 따로 검증) ──────────────
@pytest.mark.asyncio
async def test_create_booking_notifies_confirmed(committed_conn, monkeypatch):
    # 갭 #1 계보: 예약이 확정되면 알림을 부른다(auto_confirm 기본 true → confirmed).
    from app.services import notification_service
    calls = []

    async def fake(pid, ntype, **kw):
        calls.append(ntype)

    monkeypatch.setattr(notification_service, "notify_patient", fake)
    await committed_conn.execute("update hospital_settings set auto_confirm_app_bookings=true")
    ctx = await _seed_base(committed_conn)
    await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기", request_id=uuid4())
    assert calls == ["confirmed"]


@pytest.mark.asyncio
async def test_change_booking_notifies_changed(committed_conn, monkeypatch):
    # 변경이 성사되면 changed 알림을 부른다. (create가 부른 confirmed는 제외하고 change만 본다.)
    from app.services import notification_service
    calls = []

    async def fake(pid, ntype, **kw):
        calls.append(ntype)

    monkeypatch.setattr(notification_service, "notify_patient", fake)
    ctx = await _seed_base(committed_conn)
    new_slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-08-05','11:00') returning id",
        ctx["doctor_id"])
    old_id = await _make_appointment(committed_conn, ctx, ctx["slot_id"])
    calls.clear()   # create_booking이 부른 confirmed를 지우고 change만 관찰한다
    updated_at = await committed_conn.fetchval("select updated_at from appointments where id=$1", old_id)
    await patient_booking_service.change_booking(
        ctx["patient"], old_id, new_slot, reason="시간 변경", expected_updated_at=updated_at)
    assert calls == ["changed"]


# ── Task 15: 병원발 변경 안내문 [확인] (CARD-CHG-04) ──────────────────────

@pytest.mark.asyncio
async def test_acknowledge_hospital_change_clears_both_columns(committed_conn):
    # CARD-CHG-04: 환자가 [확인]하면 두 칸이 비고, 그래야 앱을 껐다 켜도 안내문이 다시 뜨지 않는다.
    ctx = await _seed_base(committed_conn)
    aid = await _make_appointment(committed_conn, ctx, ctx["slot_id"])
    # 병원발 변경을 시뮬레이션: 직원웹 reschedule/병원발취소가 채우는 두 칸(경계 #17).
    await committed_conn.execute(
        "update appointments set hospital_change_prev_time=now(), hospital_change_kind='changed' where id=$1",
        aid)

    await patient_booking_service.acknowledge_hospital_change(ctx["patient"], aid)

    row = await committed_conn.fetchrow(
        "select hospital_change_prev_time, hospital_change_kind from appointments where id=$1", aid)
    assert row["hospital_change_prev_time"] is None and row["hospital_change_kind"] is None
