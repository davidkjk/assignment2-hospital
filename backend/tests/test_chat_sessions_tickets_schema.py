import uuid
from datetime import datetime, timedelta, timezone

import pytest
import asyncpg

from tests.conftest import seed_staff, seed_patient
from tests.conftest_chat import seed_chat_thread


async def _new_session(conn, thread_id, **cols):
    cols.setdefault("expires_at", datetime.now(timezone.utc) + timedelta(minutes=30))
    keys = list(cols)
    ph = ", ".join(f"${i+2}" for i in range(len(keys)))
    return await conn.fetchval(
        f"insert into ai_chat_sessions (thread_id, {', '.join(keys)}) values ($1, {ph}) returning id",
        thread_id, *[cols[k] for k in keys])


@pytest.mark.asyncio
async def test_ai_session_active_forbids_ended_fields(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _new_session(db_conn, t, status="active", ended_at=datetime.now(timezone.utc))


@pytest.mark.asyncio
async def test_ai_session_expired_requires_inactivity_reason(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _new_session(db_conn, t, status="expired",
                           ended_at=datetime.now(timezone.utc), end_reason="staff_handoff")


@pytest.mark.asyncio
async def test_only_one_active_session_per_thread(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    await _new_session(db_conn, t, status="active")
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await _new_session(db_conn, t, status="active")


@pytest.mark.asyncio
async def test_ai_session_continuation_source_xor(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    prev = await _new_session(db_conn, t, status="expired",
                              ended_at=datetime.now(timezone.utc), end_reason="inactivity_timeout")
    # continuation_source_type=ai_session인데 티켓 출처까지 채우면 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _new_session(db_conn, t, continuation_source_type="ai_session",
                           continued_from_ai_session_id=prev, continued_from_ticket_id=uuid.uuid4())


async def _new_ticket(conn, thread_id, **cols):
    keys = list(cols)
    ph = ", ".join(f"${i+2}" for i in range(len(keys))) if keys else ""
    sql = (f"insert into support_tickets (thread_id, {', '.join(keys)}) values ($1, {ph}) returning id"
           if keys else "insert into support_tickets (thread_id) values ($1) returning id")
    return await conn.fetchval(sql, thread_id, *[cols[k] for k in keys])


@pytest.mark.asyncio
async def test_ticket_answered_requires_closed_fields(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    # answered인데 종료 주체·시각 없음 → 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _new_ticket(db_conn, t, status="answered")


@pytest.mark.asyncio
async def test_only_one_open_ticket_per_thread(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    await _new_ticket(db_conn, t, status="pending")
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await _new_ticket(db_conn, t, status="pending")


@pytest.mark.asyncio
async def test_message_session_thread_must_match(db_conn):
    p = await seed_patient(db_conn)
    t1 = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    t2 = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    s2 = await _new_session(db_conn, t2, status="active")
    # 메시지 thread=t1인데 세션은 t2 소속 → 트리거가 막는다(§4.3).
    with pytest.raises(asyncpg.exceptions.RaiseError):
        await db_conn.execute(
            "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content) "
            "values ($1, $2, 'bot', 'text', '엇갈린 상담방')", t1, s2)
