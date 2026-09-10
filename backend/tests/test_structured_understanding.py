"""브랜치 A — 구조화 출력(structured output) 단위 테스트.

이해기 understand()가 LLM JSON을 손으로 파싱(raw.find("{")...json.loads)하던 것을, 진짜 모델의
with_structured_output으로 교체해 형식 위반(따옴표 깨짐·설명 덧붙임)에 강하게 만든다.

경계(위험 없음):
- 스위치(chat_structured_understanding) ON + 모델이 with_structured_output을 지원할 때만 구조화 경로.
- 스위치 OFF(기본) 또는 가짜 모델(테스트 주입)이면 기존 손파싱 그대로 → 기존 mock 테스트 전부 무회귀.
- 구조화 호출이 실패하면 None(레거시 폴백) — 기존 실패 처리와 동일.

DB·conftest 불필요 — `--noconftest`로 공용 DB를 건드리지 않고 돌린다.
"""
import pytest

from app.services.chat import conversation_understanding as cu


class StructuredModel:
    """with_structured_output을 지원하는 가짜 모델(진짜 ChatAnthropic 흉내).

    구조화 경로면 with_structured_output(schema).ainvoke가 schema 인스턴스를 돌려준다.
    손파싱 경로(스위치 OFF)면 plain ainvoke가 JSON 문자열을 돌려준다.
    """

    def __init__(self, schema_obj, json_text):
        self._obj = schema_obj
        self._json = json_text
        self.structured_schema = None
        self.plain_ainvoke_called = False

    def with_structured_output(self, schema):
        self.structured_schema = schema
        obj = self._obj

        class _Runnable:
            async def ainvoke(self, messages):
                return obj

        return _Runnable()

    async def ainvoke(self, messages):
        self.plain_ainvoke_called = True
        return type("R", (), {"content": self._json})()


_JSON = ('{"route":"agent","standalone_query":"","needs_clarification":false,'
         '"clarification_question":"","topic_shift":false,"confidence":0.8}')


def _schema_obj(route="agent"):
    return cu.UnderstandingSchema(
        route=route, standalone_query="", needs_clarification=False,
        clarification_question="", topic_shift=False, confidence=0.8)


@pytest.mark.asyncio
async def test_structured_path_used_when_flagged_and_supported():
    model = StructuredModel(_schema_obj("agent"), _JSON)
    result = await cu.understand("예약하고 싶어요", [], model=model, structured=True)
    assert result is not None
    assert result.route == "agent"
    # 구조화 경로를 탔다 — with_structured_output이 호출되고, 손파싱(plain ainvoke)은 안 쓴다.
    assert model.structured_schema is cu.UnderstandingSchema
    assert model.plain_ainvoke_called is False


@pytest.mark.asyncio
async def test_flag_off_uses_handparse_not_structured():
    model = StructuredModel(_schema_obj("agent"), _JSON)
    result = await cu.understand("예약하고 싶어요", [], model=model, structured=False)
    assert result is not None
    assert result.route == "agent"
    # 스위치 OFF → 손파싱(plain ainvoke) 사용, 구조화 호출 안 함.
    assert model.plain_ainvoke_called is True
    assert model.structured_schema is None


@pytest.mark.asyncio
async def test_fake_model_without_structured_falls_back_to_handparse():
    # with_structured_output이 없는 가짜 모델(기존 주입 mock) — 스위치 ON이어도 손파싱으로 폴백.
    class PlainModel:
        def __init__(self):
            self.called = False

        async def ainvoke(self, messages):
            self.called = True
            return type("R", (), {"content": _JSON})()

    model = PlainModel()
    result = await cu.understand("예약하고 싶어요", [], model=model, structured=True)
    assert result is not None
    assert result.route == "agent"
    assert model.called is True
