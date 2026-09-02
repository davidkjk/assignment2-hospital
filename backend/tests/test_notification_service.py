import pytest
from datetime import date, time

from app.services import dispatch_service, notification_service
from tests.conftest import seed_patient, seed_staff

# notify_patient는 get_pool().acquire()(서비스 역할)로 별도 커넥션을 여니 시드는 committed_conn으로
# 한다(커밋돼야 그 커넥션이 본다. Task 5~8 하네스 패턴). committed_conn은 postgres 역할이라 RLS를
# 우회해 set_session_auth 없이 departments·appointments를 넣을 수 있다.


@pytest.fixture
def sent(monkeypatch):
    """직원웹 T30의 배달 계층을 스텁한다 — 이 태스크는 '판정'만 검증한다."""
    calls = []

    async def fake_send_now(notification_ids, conn):
        calls.append(list(notification_ids))

    monkeypatch.setattr(dispatch_service, "send_now", fake_send_now)
    return calls


async def _appt(conn, patient_id, *, slot=None):
    # committed_conn(postgres 역할=RLS 우회)이라 set_session_auth 불필요. 담당의 소속 과=예약 과(정합성 트리거).
    dept = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor = await seed_staff(conn, role="doctor")
    await conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    slot_id = None
    if slot is not None:
        slot_date, start_time = slot
        slot_id = await conn.fetchval(
            "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,$3) returning id",
            doctor["staff_id"], slot_date, start_time)
    return await conn.fetchval(
        "insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, slot_id, status, source) "
        "values ($1,$1,$2,$3,$4,'예약확정','app') returning id",
        patient_id, dept, doctor["staff_id"], slot_id)


@pytest.mark.asyncio
async def test_preference_off_sends_nothing(committed_conn, sent):
    # #5: enabled=false면 푸시·문자·알림함(로그) 어디에도 생성하지 않는다.
    p = await seed_patient(committed_conn)
    await committed_conn.execute(
        "insert into notification_preferences (patient_id, notification_type, enabled) values ($1,'confirmed',false)",
        p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed")
    assert sent == []
    assert await committed_conn.fetchval(
        "select count(*) from notification_log where patient_id=$1", p["patient_id"]) == 0


@pytest.mark.asyncio
async def test_push_when_token_exists(committed_conn, sent):
    p = await seed_patient(committed_conn)
    await committed_conn.execute("insert into device_tokens (patient_id, token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed")
    row = await committed_conn.fetchrow(
        "select channel, delivery_status, body from notification_log where patient_id=$1", p["patient_id"])
    assert row["channel"] == "push"                 # #120: 실제 채널
    assert row["delivery_status"] == "발송중"        # #119: 기록이 발송보다 먼저
    assert row["body"] == "예약이 확정되었습니다."
    assert len(sent) == 1                            # 배달 계층으로 넘어갔다


@pytest.mark.asyncio
async def test_sms_fallback_when_no_token(committed_conn, sent):
    # SEND-CH-01 기본값: 토큰 없으면 문자 폴백. #120: 'push' 상수로 안 박힌다.
    await committed_conn.execute("update hospital_settings set sms_enabled=true")  # 다른 테스트가 off로 남겼을 수 있다
    p = await seed_patient(committed_conn)
    await notification_service.notify_patient(p["patient_id"], "confirmed")
    assert await committed_conn.fetchval(
        "select channel from notification_log where patient_id=$1", p["patient_id"]) == "sms"
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_hospital_sms_off_blocks_fallback(committed_conn, sent):
    # #111: 병원이 문자를 끄면 토큰 없는 사람에게도 아무것도 나가지 않는다(발송 시도 자체를 막는다).
    prev = await committed_conn.fetchval("select sms_enabled from hospital_settings limit 1")
    await committed_conn.execute("update hospital_settings set sms_enabled=false")
    try:
        p = await seed_patient(committed_conn)
        await notification_service.notify_patient(p["patient_id"], "confirmed")
        assert sent == []
        assert await committed_conn.fetchval(
            "select count(*) from notification_log where patient_id=$1", p["patient_id"]) == 0
    finally:
        await committed_conn.execute("update hospital_settings set sms_enabled=$1", True if prev is None else prev)


@pytest.mark.asyncio
async def test_sms_dead_blocks_sms(committed_conn, sent):
    # 00014: 번호가 죽은(sms_dead) 사람에게 문자 폴백을 시도하지 않는다.
    await committed_conn.execute("update hospital_settings set sms_enabled=true")
    p = await seed_patient(committed_conn)
    await committed_conn.execute("update patients set sms_dead=true where id=$1", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed")
    assert sent == []


@pytest.mark.asyncio
async def test_dedup_same_appointment_and_type(committed_conn, sent):
    # 00011 부분 유니크 인덱스: 같은 예약·같은 종류는 한 번만.
    p = await seed_patient(committed_conn)
    appt = await _appt(committed_conn, p["patient_id"])
    await committed_conn.execute("insert into device_tokens (patient_id, token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed", appointment_id=appt)
    await notification_service.notify_patient(p["patient_id"], "confirmed", appointment_id=appt)
    assert await committed_conn.fetchval("select count(*) from notification_log where appointment_id=$1", appt) == 1
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_failed_row_bypasses_dedup(committed_conn, sent):
    # #121: delivery_status='실패' 줄은 부분 인덱스 조건(delivery_status<>'실패')이 비켜가 재발송이 가능하다.
    p = await seed_patient(committed_conn)
    appt = await _appt(committed_conn, p["patient_id"])
    await committed_conn.execute(
        "insert into notification_log (appointment_id, patient_id, notification_type, kind, channel, delivery_status) "
        "values ($1,$2,'confirmed','transactional','sms','실패')", appt, p["patient_id"])
    await committed_conn.execute("insert into device_tokens (patient_id, token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed", appointment_id=appt)
    assert await committed_conn.fetchval("select count(*) from notification_log where appointment_id=$1", appt) == 2


@pytest.mark.asyncio
async def test_target_name_prefixes_body(committed_conn, sent):
    # R2-05: 가족 예약이면 대상자 이름을 본문 앞에 붙인다.
    p = await seed_patient(committed_conn)
    await committed_conn.execute("insert into device_tokens (patient_id, token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "confirmed", target_name="민준")
    body = await committed_conn.fetchval("select body from notification_log where patient_id=$1", p["patient_id"])
    assert body.startswith("민준님")


@pytest.mark.asyncio
async def test_reminder_includes_date_and_time(committed_conn, sent):
    # #125: 리마인더 본문에 날짜·시각이 채워진다(중장년층이 앱을 안 열어도 몇 시인지 안다).
    p = await seed_patient(committed_conn)
    appt = await _appt(committed_conn, p["patient_id"], slot=(date(2026, 8, 20), time(14, 0)))
    await committed_conn.execute("insert into device_tokens (patient_id, token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "reminder_day_before", appointment_id=appt)
    body = await committed_conn.fetchval("select body from notification_log where patient_id=$1", p["patient_id"])
    assert "8월 20일" in body and "오후 2시" in body


@pytest.mark.asyncio
async def test_reminder_without_slot_emits_no_null(committed_conn, sent):
    # #125: slot이 없으면(당일 워크인) 시각 자리만 조용히 빠지고 빈칸·null·'{when}'이 나가지 않는다.
    p = await seed_patient(committed_conn)
    appt = await _appt(committed_conn, p["patient_id"], slot=None)
    await committed_conn.execute("insert into device_tokens (patient_id, token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(p["patient_id"], "reminder_today", appointment_id=appt)
    body = await committed_conn.fetchval("select body from notification_log where patient_id=$1", p["patient_id"])
    assert body == "오늘 예약이 있습니다." and "{when}" not in body and "None" not in body


@pytest.mark.asyncio
async def test_body_override_from_settings(committed_conn, sent):
    # #126: notification_type_settings.body가 있으면 코드 기본 문구를 덮어쓴다(줄 없으면 코드값).
    # ⚠️ notification_type_settings는 autouse cleanup 대상이 아니라 finally로 직접 지운다(다음 테스트로 새지 않게).
    await committed_conn.execute(
        "insert into notification_type_settings (notification_type, body) values ('confirmed','예약 확정! 방문 잊지 마세요.') "
        "on conflict (notification_type) do update set body=excluded.body")
    try:
        p = await seed_patient(committed_conn)
        await committed_conn.execute("insert into device_tokens (patient_id, token) values ($1,'t')", p["patient_id"])
        await notification_service.notify_patient(p["patient_id"], "confirmed")
        assert await committed_conn.fetchval(
            "select body from notification_log where patient_id=$1", p["patient_id"]) == "예약 확정! 방문 잊지 마세요."
    finally:
        await committed_conn.execute("delete from notification_type_settings where notification_type='confirmed'")
