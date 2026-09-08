import pytest
from types import SimpleNamespace

from app.services.chat import orchestrator
from app.services.chat.chat_router import classify as _real_classify


class _Model:
    def __init__(self, label): self._label = label
    async def ainvoke(self, _):
        class R: content = self._label
        return R()


@pytest.mark.asyncio
async def test_emergency_wins_even_in_restricted_mode():
    # 제한모드여도 응급 안전 안내는 항상 작동(정본 §0).
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "숨을 못 쉬겠어요", restricted=True)
    assert out["route_taken"] == "emergency" and "119" in out["reply"]


@pytest.mark.asyncio
async def test_handoff_condition_beats_routing():
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "답이 도움이 안 됐어요", unhelpful_flagged=True)
    assert out["route_taken"] == "handoff" and out["handoff_reason"] == "unhelpful" and out["escalated"]


@pytest.mark.asyncio
async def test_restricted_mode_downgrades_agent_to_rag():
    # 예약 중 상담: 행동형 금지 → 안내형으로. rag_fn 주입.
    async def rag_fn(s, m): return {"reply": "주차는 지하 1층입니다", "no_answer": False}
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "예약 잡아줘", restricted=True, rag_fn=rag_fn, model=_Model("agent"))
    assert out["route_taken"] == "rag" and "주차" in out["reply"]


@pytest.mark.asyncio
async def test_rag_no_answer_returns_chips_not_auto_handoff():
    # WEBCHAT-NOANS: 봇이 못 찾으면 자동 인계·자동 티켓 폐기 → 봇 말풍선 + FAQ 칩 + [직원에게 연결] 콜백 칩.
    # 세션은 유지되고(escalated False), 인계는 사용자가 칩을 눌러야 시작한다.
    async def rag_fn(s, m): return {"no_answer": True}
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "우리 동네 약국 어디", rag_fn=rag_fn, model=_Model("rag"))
    assert out["route_taken"] == "no_answer"
    assert out["escalated"] is False
    assert out["reply"]                                  # 봇 말풍선(안내 문구) 존재
    assert len(out["quick_replies"]) == 3                # FAQ 3개(텍스트 전송)
    assert out["handoff_chip"] == "직원에게 연결"          # 콜백 칩(인계 폼 열기)


@pytest.mark.asyncio
async def test_hours_intent_answered_from_db_before_rag():
    # B1: 진료시간 질문은 RAG(안내자료) 대신 DB 단일원본에서 답한다(KBADM-EDITOR-17). RAG 우회.
    called = {"rag": False}
    async def rag_fn(s, m):
        called["rag"] = True
        return {"reply": "평일 낮에 합니다", "no_answer": False}
    async def intent_fn(s, m, intent):
        assert intent == "hospital_hours"
        return {"reply": "월요일 09:00~18:00"}
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
        "진료시간이 어떻게 되나요", rag_fn=rag_fn, intent_fn=intent_fn, model=_Model("rag"))
    assert out["route_taken"] == "rag" and "09:00" in out["reply"]
    assert called["rag"] is False


@pytest.mark.asyncio
async def test_doctor_list_intent_answered_from_db():
    # B2: 의사명단 질문은 staff DB에서 답한다.
    async def intent_fn(s, m, intent):
        return {"reply": "내과: 김서준"} if intent == "doctor_list" else None
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
        "진료하는 의사가 누구예요", intent_fn=intent_fn, model=_Model("rag"))
    assert out["route_taken"] == "rag" and "김서준" in out["reply"]


@pytest.mark.asyncio
async def test_intent_falls_back_to_rag_when_db_empty():
    # intent_fn이 빈값 반환(데이터 없음) → 기존 RAG로 폴백(막다른 길 방지).
    async def rag_fn(s, m): return {"reply": "안내자료 답", "no_answer": False}
    async def intent_fn(s, m, intent): return None
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
        "진료시간 알려줘", rag_fn=rag_fn, intent_fn=intent_fn, model=_Model("rag"))
    assert out["route_taken"] == "rag" and out["reply"] == "안내자료 답"


@pytest.mark.asyncio
async def test_intent_precheck_skipped_during_active_flow():
    # 진행 중 문진(active_flow) 중엔 intent 프리체크를 건너뛰어 흐름을 지킨다.
    called = {"intent": False}
    async def intent_fn(s, m, intent):
        called["intent"] = True
        return {"reply": "X"}
    out = await orchestrator.orchestrate(
        SimpleNamespace(active_flow="department_guide", flow_step=1),
        "진료시간 알려줘", intent_fn=intent_fn, model=_Model("department_guide"))
    assert out["route_taken"] == "department_guide"
    assert called["intent"] is False


def test_length_nudge_threshold():
    assert orchestrator.should_nudge_length(40) is True
    assert orchestrator.should_nudge_length(39) is False
