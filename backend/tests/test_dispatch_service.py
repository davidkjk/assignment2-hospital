"""[Task 30][SEND-RESULT-*·SEND-RETRY-*·SEND-DEAD-*] 디스패처 — 상태기계·폴백·재시도.

정본 = screen-behaviors 「발송 결과와 실패」 절. 제공자(푸시/문자)는 fake 경계로 주입한다
(실제 Twilio/FCM = 배포 env). 한 테스트 = 규칙 ID 하나 = assert 하나.
"""
import pytest

from app.services import dispatch_service as ds
from app.services.dispatch_service import PushUnregistered, SmsOutcome


async def _patient(conn, phone="01011112222", sms_dead=False):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone, sms_dead) "
        "values ('김환자', '1990-05-14', 'F', $1, $2) returning id", phone, sms_dead)


async def _log(conn, pid, requested="push_sms", channel="push", status="발송중"):
    return await conn.fetchval(
        "insert into notification_log "
        "(patient_id, notification_type, channel, requested_channel, delivery_status, body) "
        "values ($1, 'staff_direct', $2, $3, $4, '안내') returning id",
        pid, channel, requested, status)


async def _token(conn, pid, token="tok-1"):
    return await conn.fetchval(
        "insert into device_tokens (patient_id, token) values ($1, $2) returning id", pid, token)


def _push_ok(token, body):
    return "push-msg-id"


def _push_dead(token, body):
    raise PushUnregistered(token)


def _sms_queued(phone, body):
    return SmsOutcome(status="queued", provider_message_id="sms-sid")


# ── 상태기계(SEND-RESULT-05) ──────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_RESULT_05_push_delivered_becomes_dodal(db_conn):
    """[SEND-RESULT-05] 살아있는 푸시가 배달되면 '발송중'→'도달'."""
    pid = await _patient(db_conn)
    await _token(db_conn, pid)
    nid = await _log(db_conn, pid)
    await ds.send_now([nid], db_conn, push_send=_push_ok, sms_send=_sms_queued)
    status = await db_conn.fetchval("select delivery_status from notification_log where id=$1", nid)
    assert status == "도달"


@pytest.mark.asyncio
async def test_RESULT_03b_dead_push_token_row_is_deleted(db_conn):
    """[SEND-RESULT-03b] 죽은 토큰(UNREGISTERED)은 그 device_tokens 줄을 삭제한다."""
    pid = await _patient(db_conn)
    await _token(db_conn, pid)
    nid = await _log(db_conn, pid)
    await ds.send_now([nid], db_conn, push_send=_push_dead, sms_send=_sms_queued)
    left = await db_conn.fetchval("select count(*) from device_tokens where patient_id=$1", pid)
    assert left == 0


@pytest.mark.asyncio
async def test_RESULT_03c_falls_back_to_sms_flipping_channel(db_conn):
    """[SEND-RESULT-03c/09] 살아있는 배달이 없으면 문자 폴백 — 로그 channel을 'sms'로 뒤집는다."""
    pid = await _patient(db_conn)
    await _token(db_conn, pid)
    nid = await _log(db_conn, pid)
    await ds.send_now([nid], db_conn, push_send=_push_dead, sms_send=_sms_queued)
    channel = await db_conn.fetchval("select channel from notification_log where id=$1", nid)
    assert channel == "sms"


@pytest.mark.asyncio
async def test_RESULT_09_requested_channel_is_preserved_after_fallback(db_conn):
    """[SEND-RESULT-09] 폴백해도 사용자가 고른 원래 값(push_sms)은 requested_channel에 남는다."""
    pid = await _patient(db_conn)
    await _token(db_conn, pid)
    nid = await _log(db_conn, pid, requested="push_sms")
    await ds.send_now([nid], db_conn, push_send=_push_dead, sms_send=_sms_queued)
    req = await db_conn.fetchval("select requested_channel from notification_log where id=$1", nid)
    assert req == "push_sms"


@pytest.mark.asyncio
async def test_RESULT_05_sms_queued_stays_balsong(db_conn):
    """[SEND-RESULT-05] 문자는 접수(queued)까지만 즉시 안다 → '발송중' 유지(도달은 콜백으로)."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await ds.send_now([nid], db_conn, push_send=_push_ok, sms_send=_sms_queued)
    status = await db_conn.fetchval("select delivery_status from notification_log where id=$1", nid)
    assert status == "발송중"


@pytest.mark.asyncio
async def test_RESULT_02_provider_message_id_is_stored(db_conn):
    """[SEND-RESULT-02] 문자 접수 시 업체 메시지 id를 저장한다(콜백이 이 값으로 줄을 찾는다)."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await ds.send_now([nid], db_conn, push_send=_push_ok, sms_send=_sms_queued)
    val = await db_conn.fetchval("select provider_message_id from notification_log where id=$1", nid)
    assert val == "sms-sid"


# ── 문자 판정(_sms_eligible) / 죽은 번호 ──────────────────────────────────────
@pytest.mark.asyncio
async def test_RESULT_05_dead_number_no_delivery_becomes_silpae(db_conn):
    """[SEND-RESULT-05] 죽은 번호라 문자도 못 보내면 '실패'."""
    pid = await _patient(db_conn, sms_dead=True)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await ds.send_now([nid], db_conn, push_send=_push_ok, sms_send=_sms_queued)
    status = await db_conn.fetchval("select delivery_status from notification_log where id=$1", nid)
    assert status == "실패"


@pytest.mark.asyncio
async def test_sms_eligible_false_when_hospital_sms_off(db_conn):
    """[HSET-SMS-05] 병원 문자 스위치가 꺼져 있으면 문자 대상이 아니다(코드가 갈라지지 않는다)."""
    await db_conn.execute("update hospital_settings set sms_enabled = false where id")
    pid = await _patient(db_conn)
    assert await ds._sms_eligible(db_conn, pid) is False


# ── 재시도(SEND-RETRY-*) ──────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_RETRY_01_temporary_failure_schedules_retry(db_conn):
    """[SEND-RETRY-01] 일시 실패는 '재시도중'으로 바뀌고 다음 재시도 시각(≈1분 뒤)이 잡힌다."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await ds.mark_failed(db_conn, nid, "congestion")
    status = await db_conn.fetchval("select delivery_status from notification_log where id=$1", nid)
    assert status == "재시도중"


@pytest.mark.asyncio
async def test_RETRY_01_first_delay_is_one_minute(db_conn):
    """[SEND-RETRY-01] 첫 재시도는 1분 뒤."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await ds.mark_failed(db_conn, nid, "congestion")
    secs = await db_conn.fetchval(
        "select extract(epoch from (next_retry_at - now())) from notification_log where id=$1", nid)
    assert 50 <= secs <= 65


@pytest.mark.asyncio
async def test_RETRY_01_second_delay_is_five_minutes(db_conn):
    """[SEND-RETRY-01] 두 번째 재시도는 5분 뒤(retry_count=1에서 실패했을 때)."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await db_conn.execute("update notification_log set retry_count=1 where id=$1", nid)
    await ds.mark_failed(db_conn, nid, "congestion")
    secs = await db_conn.fetchval(
        "select extract(epoch from (next_retry_at - now())) from notification_log where id=$1", nid)
    assert 290 <= secs <= 305


@pytest.mark.asyncio
async def test_RETRY_02_permanent_failure_no_retry(db_conn):
    """[SEND-RETRY-02] 영구 실패(없는 번호)는 한 번도 재시도하지 않고 '실패'."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await ds.mark_failed(db_conn, nid, "invalid_number")
    status = await db_conn.fetchval("select delivery_status from notification_log where id=$1", nid)
    assert status == "실패"


@pytest.mark.asyncio
async def test_RETRY_02_permanent_keeps_retry_count_zero(db_conn):
    """[SEND-RETRY-02] 영구 실패는 retry_count를 올리지 않는다."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await ds.mark_failed(db_conn, nid, "invalid_number")
    rc = await db_conn.fetchval("select retry_count from notification_log where id=$1", nid)
    assert rc == 0


@pytest.mark.asyncio
async def test_DEAD_07_invalid_number_marks_patient_sms_dead(db_conn):
    """[SEND-DEAD-07] 없는 번호로 판정되면 환자에 문자 죽음 표식을 붙인다."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await ds.mark_failed(db_conn, nid, "invalid_number")
    dead = await db_conn.fetchval("select sms_dead from patients where id=$1", pid)
    assert dead is True


@pytest.mark.asyncio
async def test_RETRY_03_unknown_code_does_not_retry(db_conn):
    """[SEND-RETRY-03] 모르는 오류 코드는 일시 실패로 보지 않는다(안전 = 돈 안 씀) → '실패'."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await ds.mark_failed(db_conn, nid, "some_unknown_code")
    status = await db_conn.fetchval("select delivery_status from notification_log where id=$1", nid)
    assert status == "실패"


@pytest.mark.asyncio
async def test_RETRY_01_max_two_retries_then_fail(db_conn):
    """[SEND-RETRY-01] 2번까지만 자동 — retry_count=2에서 또 일시 실패면 '실패'로 끝난다."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await db_conn.execute("update notification_log set retry_count=2 where id=$1", nid)
    await ds.mark_failed(db_conn, nid, "congestion")
    status = await db_conn.fetchval("select delivery_status from notification_log where id=$1", nid)
    assert status == "실패"


@pytest.mark.asyncio
async def test_RESULT_01_mark_delivered_becomes_dodal(db_conn):
    """[SEND-RESULT-01] 콜백이 진짜 도달을 알리면 '도달' + delivered_at 기록."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms")
    await ds.mark_delivered(db_conn, nid)
    row = await db_conn.fetchrow(
        "select delivery_status, delivered_at from notification_log where id=$1", nid)
    assert row["delivery_status"] == "도달"


@pytest.mark.asyncio
async def test_RETRY_claim_due_returns_ready_rows(db_conn):
    """[MSGX-SCHED-03] claim 쿼리는 next_retry_at이 지난 '재시도중' 줄을 잡아 온다."""
    pid = await _patient(db_conn)
    nid = await _log(db_conn, pid, requested="sms", channel="sms", status="재시도중")
    await db_conn.execute(
        "update notification_log set next_retry_at = now() - interval '1 minute' where id=$1", nid)
    ids = await ds.claim_due_retries(db_conn, limit=10)
    assert nid in ids
