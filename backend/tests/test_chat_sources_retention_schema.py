from datetime import datetime, timedelta, timezone

import uuid
import pytest
import asyncpg

from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread


async def _bot_msg(conn, thread_id):
    # 봇 메시지는 그 thread에 속한 실제 AI 세션이 있어야 한다(Task 2 sender_shape·상담방 일치 트리거).
    sess = await conn.fetchval(
        "insert into ai_chat_sessions (thread_id, status, expires_at) values ($1, 'active', $2) returning id",
        thread_id, datetime.now(timezone.utc) + timedelta(minutes=30))
    return await conn.fetchval(
        "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content) "
        "values ($1, $2, 'bot', 'text', '주차는 지하 1층입니다') returning id", thread_id, sess)


@pytest.mark.asyncio
async def test_source_stores_snapshot_and_soft_chunk_ref(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    m = await _bot_msg(db_conn, t)
    # chunk_id는 소프트 참조 — 존재하지 않는 uuid를 넣어도 FK 위반이 아니다(조각표는 Task 7).
    sid = await db_conn.fetchval(
        "insert into chat_message_sources (message_id, chunk_id, rank, similarity, title_snapshot, body_snapshot) "
        "values ($1,$2,1,0.87,'주차 안내','지하 1층 30분 무료') returning id", m, uuid.uuid4())
    row = await db_conn.fetchrow("select * from chat_message_sources where id=$1", sid)
    assert row["title_snapshot"] == "주차 안내" and row["rank"] == 1
    assert float(row["similarity"]) == pytest.approx(0.87)


@pytest.mark.asyncio
async def test_source_must_reference_bot_message(db_conn):
    p = await seed_patient(db_conn)
    st = await seed_staff(db_conn, role="doctor")
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await db_conn.fetchval("insert into support_tickets (thread_id) values ($1) returning id", t)
    staff_m = await db_conn.fetchval(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, sender_staff_id, "
        "message_type, content) values ($1,$2,'staff',$3,'text','직원 답변') returning id", t, tk, st["staff_id"])
    # 근거는 봇 답변에만 붙는다. 직원 메시지에 붙이면 트리거가 막는다.
    with pytest.raises(asyncpg.exceptions.RaiseError):
        await db_conn.execute(
            "insert into chat_message_sources (message_id, rank, title_snapshot, body_snapshot) "
            "values ($1,1,'x','y')", staff_m)


@pytest.mark.asyncio
async def test_retention_classes_seeded(db_conn):
    n = await db_conn.fetchval("select count(*) from retention_classes")
    assert n == 6
    med = await db_conn.fetchrow("select * from retention_classes where id='medical_record'")
    assert med["enforcement"] == "code_forced"
    assert med["retention_period"].days >= 3650  # 10년 = 코드 강제(의료법 시규 §15)
    cons = await db_conn.fetchrow("select * from retention_classes where id='consultation_message'")
    assert cons["enforcement"] == "policy_default"  # 방침값(법정 없음, 기본 1년)


@pytest.mark.asyncio
async def test_chat_message_defaults_to_consultation_retention(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    m = await _bot_msg(db_conn, t)
    assert await db_conn.fetchval(
        "select retention_class from chat_messages where id=$1", m) == "consultation_message"
