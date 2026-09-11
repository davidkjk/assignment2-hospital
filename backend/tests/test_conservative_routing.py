"""브랜치 A — 라우팅 원칙 좁히기(보수적 라우팅) 단위 테스트.

프로덕션(chat_understanding_mode=llm) 라우팅이 정보 질문을 예약(agent)으로 오라우팅한다(세션52 실측):
"진단서 발급 받고 싶어요"·"사전문진 어떻게"·"CT 물 먹어도 되나요"가 agent로 새어 막다른 길로 간다.
보수 원칙 = "정보를 묻는 것이면 애매해도 agent가 아니라 rag, 확실한 예약·취소·변경·문진 행동일 때만 agent".

on/off 스위치(chat_conservative_routing). 기본 OFF면 프롬프트가 현재와 동일(되돌리기).
이 테스트는 스위치→프롬프트 배선만 결정적으로 검증한다(LLM 분류 정확도는 재측정=rag_eval의 몫).

DB·conftest 불필요 — `--noconftest`로 공용 DB를 건드리지 않고 돌린다.
"""
import pytest

from app.services.chat import conversation_understanding as cu
from app.services.chat import chat_router


def test_builder_appends_principle_only_when_conservative():
    on = cu.understand_system_prompt(conservative=True)
    off = cu.understand_system_prompt(conservative=False)
    # 스위치 ON이면 보수 원칙이 프롬프트에 들어간다.
    assert cu._CONSERVATIVE_ROUTING_PRINCIPLE in on
    # 스위치 OFF면 들어가지 않고, 기존 시스템 프롬프트와 완전히 동일해야 한다(현재 동작 보존).
    assert cu._CONSERVATIVE_ROUTING_PRINCIPLE not in off
    assert off == cu._UNDERSTAND_SYSTEM


class CapturingModel:
    """ainvoke에 넘어온 메시지를 기록하고 정해진 JSON을 돌려주는 가짜 모델."""

    def __init__(self, json_reply):
        self._json = json_reply
        self.seen_messages = None

    async def ainvoke(self, messages):
        # ChatPromptTemplate.format_messages는 Message 객체 리스트(각자 .content)를 준다.
        self.seen_messages = messages
        return type("R", (), {"content": self._json})()


@pytest.mark.asyncio
async def test_understand_injects_principle_into_system_prompt_when_flagged():
    reply = '{"route":"rag","standalone_query":"","needs_clarification":false,' \
            '"clarification_question":"","topic_shift":false,"confidence":0.9}'
    model = CapturingModel(reply)
    await cu.understand("진단서 발급 어떻게 하나요", [], model=model, conservative_routing=True)
    system_text = "".join(getattr(m, "content", "") for m in model.seen_messages)
    assert cu._CONSERVATIVE_ROUTING_PRINCIPLE in system_text


@pytest.mark.asyncio
async def test_understand_omits_principle_when_flag_off():
    reply = '{"route":"rag","standalone_query":"","needs_clarification":false,' \
            '"clarification_question":"","topic_shift":false,"confidence":0.9}'
    model = CapturingModel(reply)
    await cu.understand("진단서 발급 어떻게 하나요", [], model=model, conservative_routing=False)
    system_text = "".join(getattr(m, "content", "") for m in model.seen_messages)
    assert cu._CONSERVATIVE_ROUTING_PRINCIPLE not in system_text


@pytest.mark.asyncio
async def test_classify_injects_principle_when_flagged():
    class _Model:
        def __init__(self):
            self.seen = None

        async def ainvoke(self, messages):
            self.seen = messages
            return type("R", (), {"content": "rag"})()

    m = _Model()
    await chat_router.classify("진단서 발급 어떻게", model=m, conservative_routing=True)
    system_text = "".join(getattr(x, "content", "") for x in m.seen)
    assert chat_router._CONSERVATIVE_ROUTING_PRINCIPLE in system_text
