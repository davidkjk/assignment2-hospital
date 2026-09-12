# 인계 확인 프롬프트의 원래 사유 보존(2026-09-09, SUPPORT-HANDOFF-CONFIRM-ALL).
# 안전 감시가 확인 프롬프트를 낼 때 pending_handoff_reason을 세션에 저장했다가, 다음 턴 [직원에게 연결하기]
# 칩 클릭 시 그 사유로 인계해야 관리자 '직원 연결 현황' 통계가 의료판단/불만/불일치를 구분한다(요구사항 L67).
# active_flow 지속 배선(test_active_flow_lifecycle)과 동일한 「세션에 다음 턴 상태를 못박는」 패턴.
import uuid

import pytest

from app.services.chat import orchestrator


@pytest.mark.asyncio
async def test_handle_message_persists_and_clears_pending_handoff_reason(committed_conn, monkeypatch):
    from app.services.chat import chat_flow_service
    from tests.conftest import seed_patient
    from tests.conftest_chat import seed_chat_thread, FakeEmbedder

    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)

    # 턴1: 안전 감시가 확인 프롬프트를 냄(route=no_answer·confirm_handoff·pending_handoff_reason).
    #      → 세션에 원래 사유가 'medical_judgment'로 저장돼야 한다.
    async def confirm(*a, **k):
        return {"route_taken": "no_answer", "reply": orchestrator.HANDOFF_CONFIRM_REPLY,
                "quick_replies": [], "handoff_chip": orchestrator.HANDOFF_CONFIRM_CHIP,
                "confirm_handoff": True, "escalated": False,
                "pending_handoff_reason": "medical_judgment"}
    monkeypatch.setattr(orchestrator, "orchestrate", confirm)
    await chat_flow_service.handle_patient_message(
        s, "이 약 먹어도 되나요?", thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=None)
    assert await committed_conn.fetchval(
        "select pending_handoff_reason from ai_chat_sessions where id=$1", s["id"]) == "medical_judgment"

    # 턴2: 이후 평범한 안내 답(rag)이 나오면 대기 중이던 사유는 해제(null)돼야 한다(칩을 안 누르고 딴 걸 물음).
    s2 = await committed_conn.fetchrow("select * from ai_chat_sessions where id=$1", s["id"])
    async def normal(*a, **k):
        return {"route_taken": "rag", "reply": "주차는 지하 1층입니다", "escalated": False}
    monkeypatch.setattr(orchestrator, "orchestrate", normal)
    await chat_flow_service.handle_patient_message(
        s2, "주차 되나요?", thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=None)
    assert await committed_conn.fetchval(
        "select pending_handoff_reason from ai_chat_sessions where id=$1", s["id"]) is None

    # cleanup
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])


class _FakeModel:
    async def ainvoke(self, _):
        class R: content = "rag"
        return R()


@pytest.mark.asyncio
async def test_confirm_chip_creates_ticket_with_preserved_reason(committed_conn, monkeypatch):
    # 전체 체인: 세션에 대기 사유(complaint)가 저장된 상태에서 환자가 [직원에게 연결하기] 칩을 누르면,
    #   실제 orchestrate가 그 사유를 읽어 인계하고 티켓 staff_handoff payload에 reason='complaint'로 남는다.
    #   (사유 보존 X면 payload reason이 'staff_request'가 돼 관리자 현황에서 불만 인계가 사라진다.)
    import json
    from app.services.chat import chat_flow_service
    from tests.conftest import seed_patient
    from tests.conftest_chat import seed_chat_thread, FakeEmbedder

    async def fake_summary(history_text, model=None):
        return {"bot_confirmed": None, "already_guided": None, "staff_should_check": None}
    monkeypatch.setattr(orchestrator, "make_handoff_summary", fake_summary)

    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at, pending_handoff_reason) "
        "values ($1, now()+interval '30 min', 'complaint') returning *", t)

    out = await chat_flow_service.handle_patient_message(
        s, orchestrator.HANDOFF_CONFIRM_CHIP, thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=_FakeModel())
    assert out["route_taken"] == "handoff"
    assert out["reason"] == "complaint"                 # 원래 사유 보존

    payload = await committed_conn.fetchval(
        "select payload from chat_messages where thread_id=$1 and sender_type='system' "
        "and payload->>'event'='staff_handoff'", t)
    data = json.loads(payload) if isinstance(payload, str) else payload
    assert data["reason"] == "complaint"               # 관리자 '직원 연결 현황'이 불만 인계로 집계

    # cleanup
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
    await committed_conn.execute("delete from support_tickets where thread_id=$1", t)
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])
