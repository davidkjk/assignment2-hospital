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
async def test_rag_no_answer_becomes_handoff():
    async def rag_fn(s, m): return {"no_answer": True}
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "우리 동네 약국 어디", rag_fn=rag_fn, model=_Model("rag"))
    assert out["route_taken"] == "handoff" and out["handoff_reason"] == "no_answer"


def test_length_nudge_threshold():
    assert orchestrator.should_nudge_length(40) is True
    assert orchestrator.should_nudge_length(39) is False
