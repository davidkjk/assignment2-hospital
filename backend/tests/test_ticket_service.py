import uuid
from datetime import datetime, timezone

import pytest

from app.services.chat import ticket_service
from tests.conftest import seed_staff, seed_patient, set_session_auth
from tests.conftest_chat import seed_chat_thread


def test_sent_msg_to_dto_matches_detail_shape():
    # 회귀: 방금 보낸 메시지는 상세와 같은 DTO(sender·body·at·읽음 플래그)여야 한다.
    # 원본 행(sender_type·content·created_at)을 그대로 주면 프론트에서 body가 비어 글자가 안 떴다.
    row = {
        "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
        "sender_type": "staff",
        "content": "확인했습니다",
        "created_at": datetime(2026, 9, 2, 0, 34, tzinfo=timezone.utc),  # KST 09:34
    }
    dto = ticket_service._sent_msg_to_dto(row)
    assert dto == {
        "id": "11111111-1111-1111-1111-111111111111",
        "sender": "staff",
        "body": "확인했습니다",
        "at": "09:34",  # Asia/Seoul (UTC+9)
        "patient_read": False,
        "staff_unread": False,
        "sms_sent": False,
    }


async def _open_ticket(conn, thread_id):
    return await conn.fetchval(
        "insert into support_tickets (thread_id) values ($1) returning id", thread_id)


@pytest.mark.asyncio
async def test_two_staff_claim_only_one_wins(db_conn, monkeypatch):
    # §8-1. 같은 pending 티켓을 두 직원이 열면 한 명만 in_progress로 가져간다.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    a = await seed_staff(db_conn, role="doctor")
    b = await seed_staff(db_conn, role="doctor")
    # acquire_as를 우회해 같은 트랜잭션 db_conn에서 직접 함수를 부르며 직원만 바꿔 경쟁을 재현.
    await set_session_auth(db_conn, a["auth_user_id"])
    won = await db_conn.fetchrow("select * from claim_ticket($1)", ticket)
    assert won["status"] == "in_progress" and won["assigned_staff_id"] == a["staff_id"]
    await set_session_auth(db_conn, b["auth_user_id"])
    with pytest.raises(Exception) as exc:      # asyncpg RaiseError
        await db_conn.fetchrow("select * from claim_ticket($1)", ticket)
    assert "이미 다른 직원이 맡았어요" in str(exc.value)


@pytest.mark.asyncio
async def test_send_keeps_in_progress_only_close_answers(db_conn):
    # §8-2. 일반 보내기는 status 불변, close만 answered.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    st = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, st["auth_user_id"])
    await db_conn.fetchrow("select * from claim_ticket($1)", ticket)
    await db_conn.fetchrow("select * from staff_send_ticket_message($1, $2, null)", ticket, "확인했습니다")
    assert await db_conn.fetchval("select status from support_tickets where id=$1", ticket) == "in_progress"
    closed = await db_conn.fetchrow("select * from close_ticket($1)", ticket)
    assert closed["status"] == "answered" and closed["closed_by_staff_id"] == st["staff_id"]


@pytest.mark.asyncio
async def test_closed_ticket_rejects_message_and_reticket_makes_new(db_conn):
    # §8-3. 완료 티켓은 메시지 거부, 재문의는 새 티켓(previous_ticket_id로 연결).
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    st = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, st["auth_user_id"])
    await db_conn.fetchrow("select * from claim_ticket($1)", ticket)
    await db_conn.fetchrow("select * from close_ticket($1)", ticket)
    # 예상 실패는 savepoint로 감싼다 — 안 감싸면 raise 후 트랜잭션이 aborted 상태로 남아
    # 이어지는 create_support_ticket이 InFailedSQLTransactionError로 막힌다(Task 1 동일 보정).
    with pytest.raises(Exception) as exc:
        async with db_conn.transaction():
            await db_conn.fetchrow("select * from staff_send_ticket_message($1, $2, null)", ticket, "추가 답변")
    assert "종료된 상담" in str(exc.value)
    new = await db_conn.fetchrow("select * from create_support_ticket($1, null, null, $2)", t, ticket)
    assert new["id"] != ticket and new["previous_ticket_id"] == ticket and new["status"] == "pending"


@pytest.mark.asyncio
async def test_duplicate_client_message_id_makes_one_row(db_conn):
    # §8-4. 같은 client_message_id 재전송은 한 행만(멱등).
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    st = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, st["auth_user_id"])
    await db_conn.fetchrow("select * from claim_ticket($1)", ticket)
    cid = uuid.uuid4()
    m1 = await db_conn.fetchrow("select * from staff_send_ticket_message($1, $2, $3)", ticket, "답변", cid)
    m2 = await db_conn.fetchrow("select * from staff_send_ticket_message($1, $2, $3)", ticket, "답변", cid)
    assert m1["id"] == m2["id"]
    assert await db_conn.fetchval(
        "select count(*) from chat_messages where client_message_id=$1", cid) == 1


@pytest.mark.asyncio
async def test_list_tickets_latest_first_with_id_tiebreak(db_conn):
    # PTDET-SUPPORT-03. 같은 created_at이어도 id 내림차순 동점키로 안정 정렬.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    st = await seed_staff(db_conn, role="doctor")   # closed_by_staff_id FK — 실제 시드로.
    ids = []
    for _ in range(3):
        ids.append(await db_conn.fetchval(
            "insert into support_tickets (thread_id, status, closed_by_staff_id, closed_at, created_at) "
            "values ($1, 'answered', $2, now(), '2026-08-01T09:00:00Z') returning id", t, st["staff_id"]))
    rows = await db_conn.fetch(
        "select id from support_tickets where thread_id=$1 order by created_at desc, id desc", t)
    got = [r["id"] for r in rows]
    assert got == sorted(ids, reverse=True)
