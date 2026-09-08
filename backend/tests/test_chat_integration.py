import uuid
import pytest

from app.services.chat import chat_flow_service
from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread, FakeEmbedder


class _RagModel:
    async def ainvoke(self, _):
        class R: content = "rag"      # 라우터가 rag로 분류
        return R()


@pytest.mark.asyncio
async def test_empty_ai_response_signals_outage_not_forced_handoff(committed_conn, monkeypatch):
    # Q19(결정 2026-09-08 — 장애 안내로 통일): AI가 빈 응답(비-handoff 라우트에 본문 없음 = 일시 장애)을 주면
    #   예전처럼 강제 직원인계·자동 티켓을 만들지 않는다. 그건 "AI 일시 장애"를 "직원 인계"로 오인시켜
    #   막다른 길처럼 보였다(스샷 2026-09-08). 대신 503(outage)으로 내려 두 프론트가 장애 화면을 띄운다
    #   (webchat=OutageNotice 기존 5xx 경로, 환자앱=ChatOutageView). 티켓 X · AI 세션 active 유지 · 발신 멱등.
    from app.services.chat import orchestrator
    from app.core.errors import AppError
    async def empty_orchestrate(*a, **k):
        return {"route_taken": "rag", "reply": ""}   # AI가 답을 못 만든 상태(빈 응답)
    monkeypatch.setattr(orchestrator, "orchestrate", empty_orchestrate)

    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)

    with pytest.raises(AppError) as ei:
        await chat_flow_service.handle_patient_message(
            s, "아무 질문", thread_id=t, client_message_id=uuid.uuid4(),
            embedder=FakeEmbedder(), model=_RagModel())
    assert ei.value.status_code == 503   # 5xx → 두 프론트의 outage 경로가 동일하게 반응

    # 강제 인계 안 함: 티켓 0, 세션 active 유지, 빈 봇 메시지 미저장.
    assert await committed_conn.fetchval("select count(*) from support_tickets where thread_id=$1", t) == 0
    assert await committed_conn.fetchval("select status from ai_chat_sessions where id=$1", s["id"]) == "active"
    assert await committed_conn.fetchval(
        "select count(*) from chat_messages where thread_id=$1 and sender_type='bot'", t) == 0
    # 환자 발신 메시지는 저장돼 있다(멱등 — 재시도 대비).
    assert await committed_conn.fetchval(
        "select count(*) from chat_messages where thread_id=$1 and sender_type='patient'", t) == 1
    # cleanup
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])


@pytest.mark.asyncio
async def test_no_answer_message_returns_chips_keeps_session_and_logs_unresolved(committed_conn):
    # WEBCHAT-NOANS: 봇이 못 답하면(빈 KB → no_answer) 자동 인계·자동 티켓을 만들지 않는다(폐기) →
    #   봇 안내 말풍선 + quick_replies 카드(FAQ 칩 + [직원에게 연결]). 세션은 active 유지, 미해결은 티켓 없이(null) 기록.
    q = "우리 동네 약국 어디"
    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)
    out = await chat_flow_service.handle_patient_message(
        s, q, thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=_RagModel())
    assert out["route_taken"] == "no_answer"
    assert out["card"]["card_type"] == "quick_replies" and out["card"]["handoff_chip"] == "직원에게 연결"
    # 자동 인계 없음 — 티켓 0, 세션 active 유지.
    assert await committed_conn.fetchval("select count(*) from support_tickets where thread_id=$1", t) == 0
    assert await committed_conn.fetchval("select status from ai_chat_sessions where id=$1", s["id"]) == "active"
    # 봇 안내 말풍선(text) 1 + quick_replies 카드(card) 1 저장.
    assert await committed_conn.fetchval(
        "select count(*) from chat_messages where thread_id=$1 and sender_type='bot' and message_type='text'", t) == 1
    assert await committed_conn.fetchval(
        "select count(*) from chat_messages where thread_id=$1 and message_type='card'", t) == 1
    # 미해결 질문은 티켓 없이(null) 기록(모든 no_answer 로깅 = 결정 B).
    assert await committed_conn.fetchval(
        "select count(*) from unresolved_questions where ticket_id is null and question_text=$1", q) == 1
    # cleanup
    await committed_conn.execute("delete from unresolved_questions where question_text=$1", q)
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])


@pytest.mark.asyncio
async def test_handoff_stores_ai_summary_in_payload(committed_conn, monkeypatch):
    # Q28: 인계(handoff) 시 대화 요약 3항목(bot_confirmed·already_guided·staff_should_check)을
    #   staff_handoff 시스템 메시지 payload에 함께 저장한다 → 직원 상세가 읽어 「인계 요약」 3칸을 채운다.
    import json
    from app.services.chat import orchestrator
    async def to_handoff(*a, **k):
        return {"route_taken": "handoff", "handoff_reason": "medical_judgment", "reply": ""}
    async def fake_summary(history_text, model=None):
        return {"bot_confirmed": "진료시간을 안내함", "already_guided": "예약 방법을 안내함",
                "staff_should_check": "환자 증상 상세 확인"}
    monkeypatch.setattr(orchestrator, "orchestrate", to_handoff)
    monkeypatch.setattr(orchestrator, "make_handoff_summary", fake_summary)

    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)
    out = await chat_flow_service.handle_patient_message(
        s, "상담 요청", thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=_RagModel())
    assert out["route_taken"] == "handoff"

    payload = await committed_conn.fetchval(
        "select payload from chat_messages where thread_id=$1 and sender_type='system' "
        "and payload->>'event'='staff_handoff'", t)
    data = json.loads(payload) if isinstance(payload, str) else payload
    assert data["reason"] == "medical_judgment"       # 기존 필드 유지
    assert data["bot_confirmed"] == "진료시간을 안내함"
    assert data["already_guided"] == "예약 방법을 안내함"
    assert data["staff_should_check"] == "환자 증상 상세 확인"
    # cleanup
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
    await committed_conn.execute("delete from support_tickets where thread_id=$1", t)
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])


# 나머지 §8 추적: 아래는 단위 테스트가 이미 보증한다. 통합에서 재확인할 항목만 여기에 둔다.
#  §8-1 두 직원 claim 한 명 승 ......... test_ticket_service.test_two_staff_claim_only_one_wins
#  §8-2 send 유지·close만 answered ...... test_ticket_service.test_send_keeps_in_progress_only_close_answers
#  §8-3 완료 티켓 재개불가·재문의 새 PK .. test_ticket_service.test_closed_ticket_rejects_message_and_reticket_makes_new
#  §8-4 동일 client_message_id 한 행 ..... test_ticket_service.test_duplicate_client_message_id_makes_one_row
#  §8-5 만료 배치↔활동 상호배제 ......... test_ai_session_service.test_expire_batch_and_activity_are_mutually_exclusive
#  §8-6 연속 답변 한 배치 ............... test_chat_notification_batching.test_consecutive_replies_make_one_batch
#  §8-7 확인 후 새 배치 ................. test_chat_notification_batching.test_ack_then_new_reply_makes_new_batch
#  §8-8 보고 있으면 배치 없음 ........... test_chat_notification_batching.test_viewing_makes_no_batch_and_marks_read
#  §8-9 익명 해시=환자여도 미연결 ....... test_chat_notification_batching.test_anonymous_hash_matching_patient_does_not_link
#  §8-11 익명도 SMS 대상·patient_id null . test_chat_notification_batching.test_anonymous_verified_contact_gets_batch_with_null_patient
#  §8-12 두 경로 같은 파이프라인 ........ (위 6·11이 함께 보증) + notification_recipient.resolve_recipient
#  §8-10 Realtime 재연결 커서 복원 ...... 구현 시 통합(커서 조회는 chat_messages(thread_id, created_at, id) 인덱스)


@pytest.mark.asyncio
async def test_booking_intent_app_reaches_wizard_card_not_handoff(committed_conn, monkeypatch):
    # [WEBBOOK-05][BOOK-BOT-WIZARD] 앱(patient) 예약 의도 → 예약 마법사 인계 카드(대화 내 예약 아님, 결정 B).
    #   막다른 길 action_unavailable 아님. 라우터 agent·인계감시 없음 고정(LLM 비의존).
    from app.services.chat import chat_router, safety_watchdog
    async def fake_classify(*a, **k): return "agent"
    async def no_escalation(*a, **k): return None
    monkeypatch.setattr(chat_router, "classify", fake_classify)
    monkeypatch.setattr(safety_watchdog, "check_escalation", no_escalation)

    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)
    out = await chat_flow_service.handle_patient_message(
        s, "예약하고 싶어요", thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=_RagModel())

    assert out["route_taken"] == "agent"
    assert out["card"]["card_type"] == "open_booking_wizard"   # 앱은 마법사로 인계
    assert out.get("reason") != "action_unavailable"
    # 봇 안내 말풍선(text) 1 + 진료과 카드(card) 1 저장, 세션 active 유지(막다른 길 아님).
    assert await committed_conn.fetchval(
        "select count(*) from chat_messages where thread_id=$1 and message_type='card'", t) == 1
    assert await committed_conn.fetchval("select status from ai_chat_sessions where id=$1", s["id"]) == "active"
    assert await committed_conn.fetchval("select count(*) from support_tickets where thread_id=$1", t) == 0
    # cleanup
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])


@pytest.mark.asyncio
async def test_booking_intent_web_reaches_department_card(committed_conn, monkeypatch):
    # [WEBBOOK-05] 웹(anonymous_web) 예약 의도 → 대화 내 예약(진료과 선택 카드). 앱과 달리 마법사 인계 아님(결정 B).
    from app.services.chat import chat_router, safety_watchdog
    from app.services.chat import webchat_service
    async def fake_classify(*a, **k): return "agent"
    async def no_escalation(*a, **k): return None
    monkeypatch.setattr(chat_router, "classify", fake_classify)
    monkeypatch.setattr(safety_watchdog, "check_escalation", no_escalation)
    await committed_conn.execute("insert into departments (name, is_active) values ('테스트웹예약과', true)")

    # 익명 세션·상담방 확보(웹 위젯 경로).
    sess = await webchat_service.start_or_restore_session(None)
    from uuid import UUID
    thread_id = UUID(sess["threadId"])
    s = await webchat_service.load_anonymous_session(UUID(sess["aiSessionId"]), thread_id)
    out = await chat_flow_service.handle_anonymous_message(
        s, "예약하고 싶어요", thread_id=thread_id, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=_RagModel())

    assert out["route_taken"] == "agent"
    assert out["card"]["card_type"] == "department_select"     # 웹은 대화 내 예약
    assert any(d["name"] == "테스트웹예약과" for d in out["card"]["departments"])
    # cleanup(익명 클러스터는 전역 _cleanup_committed_data가 truncate하지만 명시 정리)
    await committed_conn.execute("delete from chat_messages where thread_id=$1", thread_id)


@pytest.mark.asyncio
async def test_department_guide_web_attaches_department_card(committed_conn, monkeypatch):
    # [WEBBOOK-08] 웹: 증상 대화가 진료과를 추천하면 진료과 선택 카드를 함께 낸다(하이브리드 ①)
    from app.services.chat import chat_router, department_guide_chain, webchat_service
    async def to_guide(*a, **k): return "department_guide"
    async def rec(*a, **k): return "증상을 보면 내과 진료가 좋겠어요."
    monkeypatch.setattr(chat_router, "classify", to_guide)
    monkeypatch.setattr(department_guide_chain, "ask_next_question", rec)
    await committed_conn.execute("insert into departments (name, is_active) values ('내과', true)")

    sess = await webchat_service.start_or_restore_session(None)
    from uuid import UUID
    thread_id = UUID(sess["threadId"])
    s = await webchat_service.load_anonymous_session(UUID(sess["aiSessionId"]), thread_id)
    out = await chat_flow_service.handle_anonymous_message(
        s, "배가 아파요", thread_id=thread_id, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=_RagModel())

    assert out["route_taken"] == "department_guide"
    assert out["card"]["card_type"] == "department_select"
    assert [d["name"] for d in out["card"]["departments"]] == ["내과"]
    assert out["card"]["guide_chip"] is None            # 이미 좁혀졌으니 증상칩 숨김
    await committed_conn.execute("delete from chat_messages where thread_id=$1", thread_id)


@pytest.mark.asyncio
async def test_department_guide_app_attaches_wizard_card(committed_conn, monkeypatch):
    # [WEBBOOK-08][BOOK-BOT-WIZARD] 앱: 증상 대화가 진료과를 추천하면 예약 마법사 인계 카드(대화 내 예약 아님, 결정 B)
    from app.services.chat import chat_router, department_guide_chain
    async def to_guide(*a, **k): return "department_guide"
    async def rec(*a, **k): return "증상을 보면 내과 진료가 좋겠어요."
    monkeypatch.setattr(chat_router, "classify", to_guide)
    monkeypatch.setattr(department_guide_chain, "ask_next_question", rec)
    await committed_conn.execute("insert into departments (name, is_active) values ('내과', true)")

    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)
    out = await chat_flow_service.handle_patient_message(
        s, "배가 아파요", thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=_RagModel())

    assert out["route_taken"] == "department_guide"
    assert out["card"]["card_type"] == "open_booking_wizard"
    assert out["card"]["department_name"] == "내과"
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])
