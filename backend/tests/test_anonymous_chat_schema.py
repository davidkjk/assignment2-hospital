import uuid
import pytest
import asyncpg

from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread


@pytest.mark.asyncio
async def test_anonymous_session_token_hash_unique(db_conn):
    h = "hash-" + uuid.uuid4().hex
    await db_conn.execute("insert into anonymous_chat_sessions (token_hash) values ($1)", h)
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await db_conn.execute("insert into anonymous_chat_sessions (token_hash) values ($1)", h)


@pytest.mark.asyncio
async def test_anonymous_thread_fk_now_enforced(db_conn):
    # Task 1은 anonymous_session_id를 FK 없는 uuid로 뒀다. Task 3이 FK를 채웠으니 없는 세션은 거부된다.
    with pytest.raises(asyncpg.exceptions.ForeignKeyViolationError):
        await db_conn.execute(
            "insert into chat_threads (owner_type, anonymous_session_id) values ('anonymous_web', $1)",
            uuid.uuid4())


@pytest.mark.asyncio
async def test_anonymous_contact_stores_hash_and_ciphertext(db_conn):
    sid = await db_conn.fetchval(
        "insert into anonymous_chat_sessions (token_hash) values ($1) returning id", "h-" + uuid.uuid4().hex)
    cid = await db_conn.fetchval(
        "insert into anonymous_chat_contacts (anonymous_session_id, contact_kind, "
        "contact_value_ciphertext, contact_value_hash) values ($1,'phone','ENC','PHASH') returning id", sid)
    row = await db_conn.fetchrow("select * from anonymous_chat_contacts where id=$1", cid)
    assert row["contact_value_ciphertext"] == "ENC" and row["contact_value_hash"] == "PHASH"
    assert row["verified_at"] is None  # 검증 전엔 알림·복원 불가(§4.5)


@pytest.mark.asyncio
async def test_batch_recipient_patient_shape(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await db_conn.fetchval("insert into support_tickets (thread_id) values ($1) returning id", t)
    st = await seed_staff(db_conn, role="doctor")
    m = await db_conn.fetchval(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, sender_staff_id, "
        "message_type, content) values ($1,$2,'staff',$3,'text','답변') returning id", t, tk, st["staff_id"])
    # recipient_type=patient인데 익명 연락처까지 채우면 위반(§4.7).
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await db_conn.execute(
            "insert into chat_notification_batches (thread_id, ticket_id, recipient_type, "
            "recipient_patient_id, recipient_anonymous_contact_id, first_message_id, last_message_id) "
            "values ($1,$2,'patient',$3,$4,$5,$5)", t, tk, p["patient_id"], uuid.uuid4(), m)


@pytest.mark.asyncio
async def test_one_open_batch_per_ticket_recipient(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await db_conn.fetchval("insert into support_tickets (thread_id) values ($1) returning id", t)
    st = await seed_staff(db_conn, role="doctor")
    m = await db_conn.fetchval(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, sender_staff_id, "
        "message_type, content) values ($1,$2,'staff',$3,'text','답변') returning id", t, tk, st["staff_id"])
    await db_conn.execute(
        "insert into chat_notification_batches (thread_id, ticket_id, recipient_type, "
        "recipient_patient_id, first_message_id, last_message_id) values ($1,$2,'patient',$3,$4,$4)",
        t, tk, p["patient_id"], m)
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await db_conn.execute(
            "insert into chat_notification_batches (thread_id, ticket_id, recipient_type, "
            "recipient_patient_id, first_message_id, last_message_id) values ($1,$2,'patient',$3,$4,$4)",
            t, tk, p["patient_id"], m)
