"""[Task 30][SEND-RESULT-*] 발송 결과·재시도 원장 확장 스키마.

정본 = screen-behaviors 「발송 결과와 실패」 절. 00050_notification_log_dispatch.
⚠️ 대조: patients.sms_dead·dedup 인덱스는 이미 있었다(00014·00011) → 여기선 확인만.
"""
import pytest


async def _patient(conn, phone="01011112222"):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', $1) returning id", phone)


@pytest.mark.asyncio
async def test_RESULT_09_requested_channel_stores_push_sms(db_conn):
    """[SEND-RESULT-09] 사용자가 고른 원래 3값(push_sms)을 보존하는 칸이 있다."""
    pid = await _patient(db_conn)
    val = await db_conn.fetchval(
        "insert into notification_log "
        "(patient_id, notification_type, channel, requested_channel, delivery_status) "
        "values ($1, 'staff_direct', 'push', 'push_sms', '발송중') returning requested_channel",
        pid)
    assert val == "push_sms"


@pytest.mark.asyncio
async def test_RESULT_02_dispatch_columns_exist(db_conn):
    """[SEND-RESULT-01·02] 도달/실패 시각·다음 재시도·업체 메시지 id 칸이 있다."""
    pid = await _patient(db_conn)
    row = await db_conn.fetchrow(
        "insert into notification_log "
        "(patient_id, notification_type, channel, delivery_status) "
        "values ($1, 'staff_direct', 'sms', '발송중') "
        "returning next_retry_at, provider_message_id, delivered_at, failed_at", pid)
    assert row["next_retry_at"] is None
    assert row["provider_message_id"] is None
    assert row["delivered_at"] is None
    assert row["failed_at"] is None


@pytest.mark.asyncio
async def test_RESULT_03b_device_tokens_table_exists(db_conn):
    """[SEND-RESULT-03b] 죽은 토큰을 삭제할 대상(device_tokens 줄)이 실제로 존재한다."""
    pid = await _patient(db_conn)
    tid = await db_conn.fetchval(
        "insert into device_tokens (patient_id, token, platform) "
        "values ($1, 'tok-abc', 'ios') returning id", pid)
    assert tid is not None
    await db_conn.execute("delete from device_tokens where id = $1", tid)
    left = await db_conn.fetchval("select count(*) from device_tokens where id = $1", tid)
    assert left == 0


@pytest.mark.asyncio
async def test_RESULT_07_dedup_indexes_exclude_failed(db_conn):
    """[SEND-RESULT-07/#121] 자물쇠(dedup 유니크 인덱스)는 '실패' 줄을 정의상 제외한다.

    안 닿은 안내를 다시 보낼 수 있어야 한다 → 두 dedup 인덱스 모두 조건에 '실패' 제외가 박혀 있다.
    (00011 이 이미 만족 — 여기선 그 보장이 유지되는지 확인만.)
    """
    defs = await db_conn.fetch(
        "select indexdef from pg_indexes where tablename = 'notification_log' "
        "and indexname like 'idx_notification_log_dedup%'")
    assert len(defs) == 2
    for d in defs:
        assert "실패" in d["indexdef"]
