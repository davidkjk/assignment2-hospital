import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread


async def _ticket(conn, thread_id):
    return await conn.fetchval("insert into support_tickets (thread_id, status) values ($1,'in_progress') returning id", thread_id)


async def _staff_msg(conn, thread_id, ticket_id, staff_id):
    return await conn.fetchval(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, sender_staff_id, "
        "message_type, content) values ($1,$2,'staff',$3,'text','답변') returning id", thread_id, ticket_id, staff_id)


@pytest.mark.asyncio
async def test_consecutive_replies_make_one_batch(db_conn):
    # §8-6. 연속 직원 답변 둘은 한 배치로 묶이고 알림은 한 번만 요청된다.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await _ticket(db_conn, t); st = await seed_staff(db_conn, role="doctor")
    b1 = await db_conn.fetchval("select enqueue_staff_reply_notification($1)",
                                await _staff_msg(db_conn, t, tk, st["staff_id"]))
    b2 = await db_conn.fetchval("select enqueue_staff_reply_notification($1)",
                                await _staff_msg(db_conn, t, tk, st["staff_id"]))
    assert b1 == b2
    row = await db_conn.fetchrow("select message_count, notification_requested_at from chat_notification_batches where id=$1", b1)
    assert row["message_count"] == 2 and row["notification_requested_at"] is not None
    assert await db_conn.fetchval("select count(*) from chat_notification_batches where ticket_id=$1", tk) == 1


@pytest.mark.asyncio
async def test_ack_then_new_reply_makes_new_batch(db_conn):
    # §8-7. 확인 뒤 새 답변은 이전 배치를 다시 열지 않고 새 배치.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await _ticket(db_conn, t); st = await seed_staff(db_conn, role="doctor")
    b1 = await db_conn.fetchval("select enqueue_staff_reply_notification($1)",
                                await _staff_msg(db_conn, t, tk, st["staff_id"]))
    await db_conn.execute("select acknowledge_chat_batches($1,'patient',$2)", t, p["patient_id"])
    b2 = await db_conn.fetchval("select enqueue_staff_reply_notification($1)",
                                await _staff_msg(db_conn, t, tk, st["staff_id"]))
    assert b2 is not None and b2 != b1


@pytest.mark.asyncio
async def test_viewing_makes_no_batch_and_marks_read(db_conn):
    # §8-8. 상담방을 보고 있으면 배치·알림 없이 즉시 읽음.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await _ticket(db_conn, t); st = await seed_staff(db_conn, role="doctor")
    await db_conn.execute(
        "insert into chat_read_states (thread_id, reader_type, reader_patient_id, active_view_until) "
        "values ($1,'patient',$2,$3)", t, p["patient_id"], datetime.now(timezone.utc) + timedelta(seconds=30))
    m = await _staff_msg(db_conn, t, tk, st["staff_id"])
    b = await db_conn.fetchval("select enqueue_staff_reply_notification($1)", m)
    assert b is None
    assert await db_conn.fetchval("select count(*) from chat_notification_batches where ticket_id=$1", tk) == 0
    assert await db_conn.fetchval(
        "select last_read_message_id from chat_read_states where thread_id=$1 and reader_patient_id=$2",
        t, p["patient_id"]) == m


@pytest.mark.asyncio
async def test_anonymous_hash_matching_patient_does_not_link(db_conn):
    # §8-9. 익명 연락처 해시가 기존 환자 전화와 같아도 chat_thread.patient_id가 자동 연결되지 않는다.
    p = await seed_patient(db_conn, phone="010-5555-5555")
    sid = await db_conn.fetchval("insert into anonymous_chat_sessions (token_hash) values ($1) returning id", "h"+uuid.uuid4().hex)
    # 같은 번호 해시로 익명 연락처를 검증해도 익명 상담방은 여전히 patient_id=null.
    await db_conn.execute("select record_verified_anonymous_contact($1,'ENC','SAME-AS-PATIENT-HASH')", sid)
    t = await seed_chat_thread(db_conn, anonymous_session_id=sid)
    row = await db_conn.fetchrow("select owner_type, patient_id from chat_threads where id=$1", t)
    assert row["owner_type"] == "anonymous_web" and row["patient_id"] is None


@pytest.mark.asyncio
async def test_anonymous_verified_contact_gets_batch_with_null_patient(db_conn):
    # §8-11·12. patients 행·기기 토큰이 없는 익명도 검증 연락처로 배치가 생기고 patient_id=null.
    sid = await db_conn.fetchval("insert into anonymous_chat_sessions (token_hash) values ($1) returning id", "h"+uuid.uuid4().hex)
    await db_conn.execute("select record_verified_anonymous_contact($1,'ENC','PHASH')", sid)
    t = await seed_chat_thread(db_conn, anonymous_session_id=sid)
    tk = await _ticket(db_conn, t); st = await seed_staff(db_conn, role="doctor")
    b = await db_conn.fetchval("select enqueue_staff_reply_notification($1)",
                               await _staff_msg(db_conn, t, tk, st["staff_id"]))
    row = await db_conn.fetchrow("select recipient_type, recipient_patient_id, recipient_anonymous_contact_id from chat_notification_batches where id=$1", b)
    assert row["recipient_type"] == "anonymous_chat_contact"
    assert row["recipient_patient_id"] is None and row["recipient_anonymous_contact_id"] is not None
