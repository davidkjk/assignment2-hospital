from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import seed_patient
from tests.conftest_chat import seed_chat_thread


@pytest.mark.asyncio
async def test_expire_batch_and_activity_are_mutually_exclusive(db_conn):
    # §8-5. 만료 지난 active를 배치가 expired로 만들면, 그 세션의 record_ai_activity는 거부된다.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    sid = await db_conn.fetchval(
        "insert into ai_chat_sessions (thread_id, status, expires_at) values ($1, 'active', $2) returning id",
        t, past)
    n = await db_conn.fetchval("select expire_idle_ai_sessions()")
    assert n >= 1
    assert await db_conn.fetchval("select status from ai_chat_sessions where id=$1", sid) == "expired"
    with pytest.raises(Exception) as exc:
        await db_conn.execute("select record_ai_activity($1)", sid)
    assert "만료" in str(exc.value)


@pytest.mark.asyncio
async def test_only_one_active_session_via_create(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    await db_conn.fetchrow("select * from create_ai_session($1, null, null, null, null)", t)
    with pytest.raises(Exception) as exc:
        await db_conn.fetchrow("select * from create_ai_session($1, null, null, null, null)", t)
    assert "이미 진행 중인 AI 상담" in str(exc.value)
