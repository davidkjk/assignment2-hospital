"""[Task 28][SEND-*][MSGX-*] /messages 발송 만들기 — enqueue·수신자 해석·목록·예약 취소.

⭐ 실제 인프라 대조(플랜 스캐폴딩 드리프트 교정, 2026-08-27):
  - `seed_patient`/`require_role_ctx`/`ValidationError`(errors.py)는 없다 →
    환자는 인라인 insert, 역할 검사는 서비스가 `AppError(403)`, `ValidationError`는
    message_service가 정의(AppError 파생).
  - `seed_staff`는 `{"auth_user_id","staff_id"}` dict → StaffContext를 조립한다.
  - 서비스는 `conn=None` 주입 패턴(merge/schedule과 동일) → db_conn(롤백 트랜잭션)을 주입해
    미커밋 seed 데이터를 보게 한다. acquire_as는 별도 연결이라 seed를 못 본다.
  - 예약 시각은 오늘(테스트 실행일) 기준 미래여야 검증을 통과한다 → _future()로 계산한다.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import message_service
from app.services.message_service import ValidationError
from app.services.slot_generator import REGENERATION_WEEKS
from tests.conftest import seed_staff

KST = ZoneInfo("Asia/Seoul")


async def _ctx(conn, role) -> StaffContext:
    s = await seed_staff(conn, role=role)
    return StaffContext(id=s["staff_id"], auth_user_id=s["auth_user_id"],
                        role=role, department_id=None)


async def _patient(conn, name="김환자", phone="01011112222"):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ($1, '1990-05-14', 'F', $2) returning id",
        name, phone,
    )


def _future(*, days=3, hour=9, minute=5) -> datetime:
    """실행일 기준 미래의 5분 경계 시각(예약 범위 안)."""
    base = datetime.now(KST) + timedelta(days=days)
    return base.replace(hour=hour, minute=minute, second=0, microsecond=0)


@pytest.mark.asyncio
async def test_KIND_02_기본_안내는_저장값_transactional로_들어간다(db_conn):
    """[SEND-KIND-02] 화면 '안내' → 저장 'transactional'. 기본이 광고 아님(실수 방향이 합법 쪽)."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push_sms", body="안내드립니다", conn=db_conn)
    kind = await db_conn.fetchval(
        "select kind from notification_log where id = $1", res.notification_ids[0])
    assert kind == "transactional"


@pytest.mark.asyncio
async def test_CH_04_문자_건수를_대상수만큼_돌려준다(db_conn):
    """[SEND-CH-04] 돈 드는 문자 건수를 세어 준다(토큰 원천은 환자앱 — 지금은 상한 계약)."""
    staff = await _ctx(db_conn, "receptionist")
    ids = [await _patient(db_conn, phone=f"0101111{n:04d}") for n in range(3)]
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": ids},
        channel="push_sms", body="x", conn=db_conn)
    assert res.sms_count == 3


@pytest.mark.asyncio
async def test_CH_04_앱알림만이면_문자건수는_0이다(db_conn):
    """[SEND-CH-04] '앱 알림만'(push)은 문자 비용이 0."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push", body="x", conn=db_conn)
    assert res.sms_count == 0


@pytest.mark.asyncio
async def test_ADS_04_광고는_광고접두를_저장body에_박는다(db_conn):
    """[SEND-ADS-04] (광고) 접두가 저장 body에 박힌다(정보통신망법 50조)."""
    staff = await _ctx(db_conn, "admin")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="marketing", recipients_spec={"patient_ids": [pid]},
        channel="sms", body="여름 이벤트", conn=db_conn)
    body = await db_conn.fetchval(
        "select body from notification_log where id = $1", res.notification_ids[0])
    assert body.startswith("(광고)")


@pytest.mark.asyncio
async def test_ADS_04_광고는_무료수신거부를_저장body에_박는다(db_conn):
    """[SEND-ADS-04] 무료 수신거부 문구가 저장 body에 박힌다(지울 수 없다)."""
    staff = await _ctx(db_conn, "admin")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="marketing", recipients_spec={"patient_ids": [pid]},
        channel="sms", body="여름 이벤트", conn=db_conn)
    body = await db_conn.fetchval(
        "select body from notification_log where id = $1", res.notification_ids[0])
    assert "무료 수신거부" in body


@pytest.mark.asyncio
async def test_ADS_03_광고_대상이_0명이면_이유와_함께_막힌다(db_conn):
    """[SEND-ADS-03] 광고 대상이 0명이면 발송이 꺼지고 이유를 준다 — 조용히 통과 금지."""
    staff = await _ctx(db_conn, "admin")
    with pytest.raises(AppError) as e:
        await message_service.enqueue_send(
            staff, kind="marketing", recipients_spec={"patient_ids": []},
            channel="sms", body="x", conn=db_conn)
    assert "동의한 환자가 없습니다" in e.value.message


@pytest.mark.asyncio
async def test_NIGHT_02_야간_광고_즉시발송은_막고_night_blocked를_준다(db_conn, monkeypatch):
    """[SEND-NIGHT-02] 21~익일8시 광고 즉시발송은 막되 돌려보내지 않는다(night_blocked=True)."""
    monkeypatch.setattr(message_service, "_now_kst",
                        lambda: datetime(2026, 8, 17, 22, 0, tzinfo=KST))
    staff = await _ctx(db_conn, "admin")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="marketing", recipients_spec={"patient_ids": [pid]},
        channel="sms", body="x", scheduled_at=None, conn=db_conn)
    assert res.night_blocked is True


@pytest.mark.asyncio
async def test_NIGHT_02_야간_차단은_내일_08시를_제안한다(db_conn, monkeypatch):
    """[SEND-NIGHT-02] 야간 차단 시 '내일 08:00' 제안 시각을 준다(문구 보존 근거)."""
    monkeypatch.setattr(message_service, "_now_kst",
                        lambda: datetime(2026, 8, 17, 22, 0, tzinfo=KST))
    staff = await _ctx(db_conn, "admin")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="marketing", recipients_spec={"patient_ids": [pid]},
        channel="sms", body="x", scheduled_at=None, conn=db_conn)
    assert res.suggested_at.astimezone(KST).hour == 8


@pytest.mark.asyncio
async def test_LATER_01_예약은_pending으로_scheduled표에_저장된다(db_conn):
    """[SEND-LATER-01][MSGX-SCHED-01] 광고 아니어도 예약 가능, pending으로 별도 큐에 저장."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push_sms", body="x", scheduled_at=_future(), conn=db_conn)
    status = await db_conn.fetchval(
        "select status from scheduled_notifications where id = $1", res.scheduled_id)
    assert status == "pending"


@pytest.mark.asyncio
async def test_SCHED_01_5분단위가_아니면_거절한다(db_conn):
    """[MSGX-SCHED-01] 예약 시각은 5분 단위여야 한다."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    with pytest.raises(ValidationError):
        await message_service.enqueue_send(
            staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
            channel="push_sms", body="x", scheduled_at=_future(minute=3), conn=db_conn)


@pytest.mark.asyncio
async def test_SCHED_01_예약범위_밖은_거절한다(db_conn):
    """[MSGX-SCHED-01] 최대 미래 범위는 REGENERATION_WEEKS(8주). 그 밖은 거절."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    too_far = (datetime.now(KST) + timedelta(weeks=REGENERATION_WEEKS + 2)).replace(
        hour=9, minute=0, second=0, microsecond=0)
    with pytest.raises(ValidationError):
        await message_service.enqueue_send(
            staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
            channel="push_sms", body="x", scheduled_at=too_far, conn=db_conn)


@pytest.mark.asyncio
async def test_SCHED_02_예약취소는_pending을_cancelled로_바꾸고_취소자를_남긴다(db_conn):
    """[MSGX-SCHED-02][SEND-LATER-05] pending 예약만 취소, 취소자를 기록한다."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push_sms", body="x", scheduled_at=_future(), conn=db_conn)
    await message_service.cancel_scheduled(
        staff, res.scheduled_id, expected_status="pending", conn=db_conn)
    row = await db_conn.fetchrow(
        "select status, cancelled_by from scheduled_notifications where id = $1", res.scheduled_id)
    assert row["status"] == "cancelled" and row["cancelled_by"] == staff.id


@pytest.mark.asyncio
async def test_SCHED_02_이미_취소된_예약을_다시_취소하면_409(db_conn):
    """[MSGX-SCHED-02] 이미 종료된 예약은 재취소되지 않는다(경합·중복 방지)."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push_sms", body="x", scheduled_at=_future(), conn=db_conn)
    await message_service.cancel_scheduled(
        staff, res.scheduled_id, expected_status="pending", conn=db_conn)
    with pytest.raises(AppError) as e:
        await message_service.cancel_scheduled(
            staff, res.scheduled_id, expected_status="pending", conn=db_conn)
    assert e.value.status_code == 409


@pytest.mark.asyncio
async def test_LATER_02_예약은_scheduled_notification_recipients에_명단을_고정한다(db_conn):
    """[SEND-LATER-02] 결정#5 ⓐ — 수신자 명단을 예약 순간 고정한다(발송 때 재해석 X)."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push_sms", body="x", scheduled_at=_future(), conn=db_conn)
    n = await db_conn.fetchval(
        "select count(*) from scheduled_notification_recipients "
        "where scheduled_notification_id = $1", res.scheduled_id)
    assert n == 1


@pytest.mark.asyncio
async def test_LATER_02_예약은_notification_log를_건드리지_않는다(db_conn):
    """[SEND-LATER-02][SEND-LATER-03] 예약은 별도 큐로 — 즉시 원장에 안 들어간다."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push_sms", body="x", scheduled_at=_future(), conn=db_conn)
    assert res.notification_ids is None
    n = await db_conn.fetchval(
        "select count(*) from notification_log where sender_staff_id = $1", staff.id)
    assert n == 0


@pytest.mark.asyncio
async def test_LATER_04_예약_광고는_kind를_보존해_배달때_동의_재확인_근거를_남긴다(db_conn):
    """[SEND-LATER-04] 예약 행에 kind='marketing'을 보존한다(배달=Task30이 재확인)."""
    staff = await _ctx(db_conn, "admin")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="marketing", recipients_spec={"patient_ids": [pid]},
        channel="sms", body="이벤트", scheduled_at=_future(hour=10), conn=db_conn)
    kind = await db_conn.fetchval(
        "select kind from scheduled_notifications where id = $1", res.scheduled_id)
    assert kind == "marketing"


@pytest.mark.asyncio
async def test_ALL_05_전환자_발송은_보낸직원을_남긴다(db_conn):
    """[SEND-ALL-05][SEND-ALL-06] 전 환자 발송은 보낸 직원(sender_staff_id)을 기록한다."""
    staff = await _ctx(db_conn, "receptionist")
    for n in range(3):
        await _patient(db_conn, phone=f"0102222{n:04d}")
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"all": True},
        channel="push_sms", body="전체 공지", conn=db_conn)
    sender = await db_conn.fetchval(
        "select sender_staff_id from notification_log where id = $1", res.notification_ids[0])
    assert sender == staff.id


@pytest.mark.asyncio
async def test_ALL_08_전환자_발송은_열람기록을_쌓지_않는다(db_conn):
    """[SEND-ALL-08][SEND-ALL-09] 발송은 열람이 아니다 — access_audit_log에 안 쌓인다."""
    staff = await _ctx(db_conn, "receptionist")
    for n in range(3):
        await _patient(db_conn, phone=f"0103333{n:04d}")
    before = await db_conn.fetchval("select count(*) from access_audit_log")
    await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"all": True},
        channel="push_sms", body="전체 공지", conn=db_conn)
    after = await db_conn.fetchval("select count(*) from access_audit_log")
    assert after == before


@pytest.mark.asyncio
async def test_DOOR_07_접수직원과_관리자는_전환자_발송이_된다(db_conn):
    """[SEND-ALL-01][SEND-ALL-02][SEND-DOOR-07] 접수직원·관리자 전환자 발송 가능."""
    await _patient(db_conn)
    for role in ("receptionist", "admin"):
        staff = await _ctx(db_conn, role)
        res = await message_service.enqueue_send(
            staff, kind="transactional", recipients_spec={"all": True},
            channel="push_sms", body="x", conn=db_conn)
        assert res.target_count >= 1


@pytest.mark.asyncio
async def test_DOOR_07_의사는_서버가_거절한다(db_conn):
    """[SEND-DOOR-07] 의사는 발송 자체가 서버에서 403으로 막힌다."""
    doctor = await _ctx(db_conn, "doctor")
    await _patient(db_conn)
    with pytest.raises(AppError) as e:
        await message_service.enqueue_send(
            doctor, kind="transactional", recipients_spec={"all": True},
            channel="push_sms", body="x", conn=db_conn)
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_LIST_08_목록은_사람이_보낸_것만_보이고_자동은_건수로_접힌다(db_conn):
    """[SEND-LIST-08][SEND-LIST-09][MSGX-LIST-01] 자동 발송(sender null)은 건수로만 접힌다."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push_sms", body="손으로 보냄", conn=db_conn)
    await db_conn.execute(
        "insert into notification_log (patient_id, notification_type, kind, channel, "
        "sender_staff_id, body) values ($1,'reminder_today','transactional','push',NULL,'자동')",
        pid)
    out = await message_service.list_messages(staff, conn=db_conn)
    bodies = [r["body"] for r in out["sent"].rows]
    assert "손으로 보냄" in bodies and "자동" not in bodies


@pytest.mark.asyncio
async def test_LIST_08_자동_발송은_건수로_집계된다(db_conn):
    """[SEND-LIST-08] 자동 발송은 목록에서 빠지고 auto_count로만 센다."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    await db_conn.execute(
        "insert into notification_log (patient_id, notification_type, kind, channel, "
        "sender_staff_id, body) values ($1,'reminder_today','transactional','push',NULL,'자동')",
        pid)
    out = await message_service.list_messages(staff, conn=db_conn)
    assert out["auto_count"] == 1


@pytest.mark.asyncio
async def test_LIST_02_예약이_0건이면_예약구역이_빈다(db_conn):
    """[SEND-LIST-02] 예약해 둔 것 0건이면 예약 구역이 사라진다(빈 리스트)."""
    staff = await _ctx(db_conn, "receptionist")
    out = await message_service.list_messages(staff, conn=db_conn)
    assert out["scheduled"] == []


@pytest.mark.asyncio
async def test_LIST_01_예약해_둔_것이_예약구역에_보인다(db_conn):
    """[SEND-LIST-01] pending 예약은 위 구역(scheduled)에 담긴다."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push_sms", body="예약 안내", scheduled_at=_future(), conn=db_conn)
    out = await message_service.list_messages(staff, conn=db_conn)
    ids = [str(r["id"]) for r in out["scheduled"]]
    assert res.scheduled_id in ids


@pytest.mark.asyncio
async def test_CH_02_기본채널_push_sms는_실제채널을_배달때_확정한다(db_conn):
    """[SEND-CH-02] push_sms 저장 채널은 배달 때 확정될 실채널(push/sms) — 상수 박기 아님."""
    staff = await _ctx(db_conn, "receptionist")
    pid = await _patient(db_conn)
    res = await message_service.enqueue_send(
        staff, kind="transactional", recipients_spec={"patient_ids": [pid]},
        channel="push_sms", body="x", conn=db_conn)
    ch = await db_conn.fetchval(
        "select channel from notification_log where id = $1", res.notification_ids[0])
    assert ch in ("push", "sms")


@pytest.mark.asyncio
async def test_WHO_빈_수신자는_한명_이상_고르라고_막는다(db_conn):
    """[SEND-WHO-03] 안내여도 수신자 0명이면 보내지 않는다(빈 발송 금지)."""
    staff = await _ctx(db_conn, "receptionist")
    with pytest.raises(AppError) as e:
        await message_service.enqueue_send(
            staff, kind="transactional", recipients_spec={"patient_ids": []},
            channel="push_sms", body="x", conn=db_conn)
    assert e.value.status_code == 422
