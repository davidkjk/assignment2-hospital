import uuid
import pytest
import asyncpg

from tests.conftest import seed_staff, seed_patient
from tests.conftest_chat import seed_chat_thread


@pytest.mark.asyncio
async def test_quality_review_one_per_session(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    s = await db_conn.fetchval(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()) returning id", t)
    st = await seed_staff(db_conn, role="admin")
    await db_conn.execute(
        "insert into chat_quality_reviews (ai_chat_session_id, status, reviewed_by) values ($1,'ok',$2)",
        s, st["staff_id"])
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await db_conn.execute(
            "insert into chat_quality_reviews (ai_chat_session_id, status, reviewed_by) values ($1,'ok',$2)",
            s, st["staff_id"])


@pytest.mark.asyncio
async def test_answer_feedback_source_check(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    # 봇 메시지는 그 thread에 속한 실제 AI 세션이 필요(Task 2 sender_shape·상담방 일치 트리거).
    sess = await db_conn.fetchval(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()) returning id", t)
    m = await db_conn.fetchval(
        "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content) "
        "values ($1, $2, 'bot','text','답변') returning id", t, sess)
    st = await seed_staff(db_conn, role="admin")
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await db_conn.execute(
            "insert into answer_feedback (message_id, reported_by, source) values ($1,$2,'made_up')",
            m, st["staff_id"])
