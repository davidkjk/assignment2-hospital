import pytest

from app.services.chat import conversation_understanding as cu


# ── has_followup_signal: 재작성 LLM을 태울지 결정하는 결정적 게이트 (LLM·DB 없음) ──

def test_first_message_has_no_followup_signal():
    # 첫 발화(이전 대화 없음)는 풀 맥락이 없으니 재작성하지 않는다(낭비 방지).
    assert cu.has_followup_signal("CT 검사 준비물이 뭐예요?", []) is False


def test_demonstrative_with_history_is_followup():
    # 지시어("그럼")가 있고 이전 대화가 있으면 후속 질문 신호.
    history = ["CT 조영제 검사 준비물이 뭐예요?", "검사 전 6시간 금식이 필요합니다."]
    assert cu.has_followup_signal("그럼 물은 마셔도 돼요?", history) is True


def test_short_message_with_history_is_followup():
    # 아주 짧은 생략형 질의도 후속 신호로 본다("물은?").
    history = ["CT 조영제 검사 준비물이 뭐예요?"]
    assert cu.has_followup_signal("물은?", history) is True


def test_selfcontained_question_with_history_is_not_followup():
    # 지시어·생략 없이 그 자체로 완결된 긴 질문은 재작성하지 않는다(이전 대화가 있어도).
    history = ["주차는 어디에 하나요?"]
    assert cu.has_followup_signal("건강검진은 예약을 어떻게 하나요?", history) is False


def test_empty_message_is_not_followup():
    assert cu.has_followup_signal("", ["이전 질문"]) is False
    assert cu.has_followup_signal("   ", ["이전 질문"]) is False


# ── rewrite_standalone: 후속 질문을 독립형 검색 질의로 (LLM 주입) ──

class _RewriteModel:
    def __init__(self, text): self._text = text
    async def ainvoke(self, _):
        class R: pass
        r = R(); r.content = self._text
        return r


class _RaisingModel:
    async def ainvoke(self, _):
        raise RuntimeError("LLM down")


@pytest.mark.asyncio
async def test_rewrite_returns_standalone_query():
    history = ["CT 조영제 검사 준비물이 뭐예요?", "검사 전 6시간 금식이 필요합니다."]
    model = _RewriteModel("CT 조영제 검사 전에 물을 마셔도 되나요?")
    out = await cu.rewrite_standalone("그럼 물은?", history, model=model)
    assert out == "CT 조영제 검사 전에 물을 마셔도 되나요?"


@pytest.mark.asyncio
async def test_rewrite_returns_none_when_model_echoes_message():
    # 모델이 원문을 그대로 돌려주면(재작성 가치 없음) None → 호출부가 원문으로 검색.
    out = await cu.rewrite_standalone("그럼 물은?", ["이전"], model=_RewriteModel("그럼 물은?"))
    assert out is None


@pytest.mark.asyncio
async def test_rewrite_returns_none_on_model_error():
    # best-effort: LLM 실패는 삼키고 None(재작성은 검색 보조일 뿐, 실패해도 원문으로 진행).
    out = await cu.rewrite_standalone("그럼 물은?", ["이전"], model=_RaisingModel())
    assert out is None


@pytest.mark.asyncio
async def test_rewrite_returns_none_on_empty_reply():
    out = await cu.rewrite_standalone("그럼 물은?", ["이전"], model=_RewriteModel("   "))
    assert out is None


# ── build_search_query: 재작성 독립질의 + 원문 concat (리포트 §9.4) ──

def test_build_search_query_concats_standalone_and_original():
    # 재작성=지시어 해소, 원문=사용자 표면 표현 보존 → 둘을 함께 실어야 단독보다 낫다(§9.4).
    q = cu.build_search_query("그럼 물은?", "CT 조영제 검사 전에 물을 마셔도 되나요?")
    assert "CT 조영제 검사 전에 물을 마셔도 되나요?" in q
    assert "그럼 물은?" in q


def test_build_search_query_falls_back_to_message_when_no_standalone():
    assert cu.build_search_query("그럼 물은?", None) == "그럼 물은?"
