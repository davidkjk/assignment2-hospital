import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import pytest

from app.services.chat import realtime_broadcast, ticket_service
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


@pytest.mark.asyncio
async def test_staff_send_message_broadcasts_staff_message_to_thread_channel(monkeypatch):
    # 인계 후 익명 웹챗은 chat_messages 테이블을 구독할 수 없다(RLS) — 직원 답장이 환자 화면에
    # 실시간으로 닿는 유일한 경로가 이 broadcast다. 저장 성공 후 같은 chat-typing:<threadId>
    # 채널로 'staff_message' 이벤트를 밀어야 한다(봇 스트리밍과 동형, 새 채널 금지).
    tid = uuid.uuid4()
    mid = uuid.uuid4()
    created = datetime(2026, 9, 10, 0, 34, tzinfo=timezone.utc)
    row = {"id": mid, "thread_id": tid, "sender_type": "staff",
           "content": "확인했습니다", "created_at": created}

    class _Conn:
        async def fetchrow(self, *a):
            return row

    @asynccontextmanager
    async def _fake_acquire(_auth):
        yield _Conn()

    monkeypatch.setattr(ticket_service, "acquire_as", _fake_acquire)
    captured = {}

    async def _fake_broadcast(thread_id, event, payload):
        captured.update(thread_id=thread_id, event=event, payload=payload)

    monkeypatch.setattr(realtime_broadcast, "broadcast", _fake_broadcast)

    dto = await ticket_service.staff_send_message("auth-1", uuid.uuid4(), "확인했습니다")

    assert captured["thread_id"] == tid
    assert captured["event"] == "staff_message"
    assert captured["payload"] == {
        "id": str(mid), "content": "확인했습니다",
        "senderType": "staff", "createdAt": created.isoformat()}
    # 회귀: 발행이 반환 DTO(프론트 계약)를 바꾸지 않는다.
    assert dto["id"] == str(mid) and dto["body"] == "확인했습니다"


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


@pytest.mark.asyncio
async def test_detail_anonymous_applicant_name_in_header_not_body(db_conn):
    # G3(2026-09-11 사용자 결정, F7 뒤집음): 익명 웹 상담 인계의 신청자 이름은 이제 **헤더 배지**로 온다
    #   (_DETAIL_HEADER_SQL.applicant_name → contact.name, 직원웹이 '신청자 {이름}'). 대화 **본문**은 이름 없는
    #   중립 연결 안내다(전화 원문·본문 이름 미노출). ~~옛 Q26: 본문에 '상담 신청자: {이름}'~~.
    import json
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    # 시스템 메시지 insert는 서비스 경로(create_anonymous_handoff) 몫이라, 직원 세션 설정 전에 넣는다
    #   (staff 세션에선 RLS로 chat_messages INSERT가 막힌다). 인계는 한 티켓당 한 번이라 하나만 넣는다.
    await db_conn.execute(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, message_type, payload) "
        "values ($1, $2, 'system', 'system', $3::jsonb)", t, ticket,
        json.dumps({"event": "anonymous_handoff", "name": "홍길동", "summary": "예약 문의"}))
    st = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, st["auth_user_id"])
    # 본문: 이름 없는 중립 연결 안내(F7). '상담 신청자: 이름'은 본문에 없다.
    bodies = [r["body"] for r in await db_conn.fetch(ticket_service._DETAIL_MESSAGES_SQL, t)
              if r["sender"] == "system"]
    assert "상담이 직원에게 연결되었습니다" in bodies
    assert not any("상담 신청자" in (b or "") for b in bodies)
    # 헤더: 신청자 이름이 applicant_name으로 온다(직원웹 헤더 배지 = contact.name).
    header = await db_conn.fetchrow(ticket_service._DETAIL_HEADER_SQL, ticket)
    assert header["applicant_name"] == "홍길동"


@pytest.mark.asyncio
async def test_detail_summary_reads_ai_summary_from_handoff_payload(db_conn):
    # Q28: staff_handoff payload에 실린 3항목(bot_confirmed/already_guided/staff_should_check)을
    #   상세 「인계 요약」이 읽어 채운다(TICKET-DETAIL-SUM-01). 나머지 2항목은 기존대로 파생.
    import json
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    await db_conn.execute(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, message_type, payload) "
        "values ($1, $2, 'system', 'system', $3::jsonb)", t, ticket,
        json.dumps({"event": "staff_handoff", "reason": "medical_judgment",
                    "bot_confirmed": "진료시간을 안내함", "already_guided": "예약 방법을 안내함",
                    "staff_should_check": "환자 증상 상세 확인"}))
    st = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, st["auth_user_id"])
    header = await db_conn.fetchrow(ticket_service._DETAIL_HEADER_SQL, ticket)
    summary = ticket_service._detail_summary(header)
    assert summary["bot_confirmed"] == "진료시간을 안내함"
    assert summary["already_guided"] == "예약 방법을 안내함"
    assert summary["staff_should_check"] == "환자 증상 상세 확인"


@pytest.mark.asyncio
async def test_detail_summary_absent_ai_fields_stay_none(db_conn):
    # SUM-02: payload에 3항목이 없으면(옛 인계·best-effort 실패) 지어내지 않고 None → 화면 '없음'.
    import json
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    await db_conn.execute(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, message_type, payload) "
        "values ($1, $2, 'system', 'system', $3::jsonb)", t, ticket,
        json.dumps({"event": "staff_handoff", "reason": "no_answer"}))
    st = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, st["auth_user_id"])
    header = await db_conn.fetchrow(ticket_service._DETAIL_HEADER_SQL, ticket)
    summary = ticket_service._detail_summary(header)
    assert summary["bot_confirmed"] is None
    assert summary["already_guided"] is None
    assert summary["staff_should_check"] is None
