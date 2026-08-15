import pytest


@pytest.mark.asyncio
async def test_sms_dead_defaults_false(db_conn):
    row = await db_conn.fetchrow(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') "
        "returning sms_dead, sms_dead_checked_at"
    )
    assert row["sms_dead"] is False
    assert row["sms_dead_checked_at"] is None


@pytest.mark.asyncio
async def test_sms_dead_can_be_set(db_conn):
    pid = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('김철수', '1990-01-01', 'M', '01099998888') returning id"
    )
    await db_conn.execute(
        "update patients set sms_dead = true, sms_dead_checked_at = now() where id = $1", pid
    )
    row = await db_conn.fetchrow("select sms_dead, sms_dead_checked_at from patients where id = $1", pid)
    assert row["sms_dead"] is True
    assert row["sms_dead_checked_at"] is not None
