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


# ── understand(): 질문 이해 통합(라우터+재작성)을 LLM 1회로 (전면 통합, mode='llm') ──
# 구조화 출력: {route, standalone_query, needs_clarification, clarification_question, topic_shift, confidence}.
# 안전(응급·직원요청·check_escalation)은 이 앞에서 이미 결정적으로 끝났으므로 여기 route에 없다.

class _JsonModel:
    """지정한 문자열을 그대로 content로 돌려주는 mock LLM(1회 호출 검증용 call_count 포함)."""
    def __init__(self, text):
        self._text = text
        self.call_count = 0

    async def ainvoke(self, _):
        self.call_count += 1
        class R: pass
        r = R(); r.content = self._text
        return r


def _json(**kw):
    import json
    return json.dumps(kw, ensure_ascii=False)


@pytest.mark.asyncio
async def test_understand_parses_route_and_standalone():
    model = _JsonModel(_json(route="rag", standalone_query="CT 조영제 검사 전 물 섭취 가능 여부",
                             needs_clarification=False, clarification_question="",
                             topic_shift=False, confidence=0.9))
    u = await cu.understand("그럼 물은?", ["CT 조영제 검사 준비물이 뭐예요?"], model=model)
    assert u is not None
    assert u.route == "rag"
    assert u.standalone_query == "CT 조영제 검사 전 물 섭취 가능 여부"
    assert u.needs_clarification is False
    assert u.confidence == 0.9


@pytest.mark.asyncio
async def test_understand_invalid_route_defaults_to_rag():
    # 허용 route(rag·department_guide·agent) 밖이면 안전한 안내형(rag)으로 강등한다.
    model = _JsonModel(_json(route="delete_everything", standalone_query="",
                             needs_clarification=False, clarification_question="",
                             topic_shift=False, confidence=0.5))
    u = await cu.understand("아무거나", [], model=model)
    assert u.route == "rag"


@pytest.mark.asyncio
async def test_understand_returns_none_on_model_error():
    # best-effort: 이해기 실패는 삼키고 None → 호출부가 레거시(classify+rewrite)로 폴백한다.
    u = await cu.understand("질문", [], model=_RaisingModel())
    assert u is None


@pytest.mark.asyncio
async def test_understand_returns_none_when_no_json():
    u = await cu.understand("질문", [], model=_JsonModel("여기엔 json이 없습니다"))
    assert u is None


@pytest.mark.asyncio
async def test_understand_needs_clarification():
    model = _JsonModel(_json(route="rag", standalone_query="",
                             needs_clarification=True, clarification_question="어떤 검사를 말씀하시나요?",
                             topic_shift=False, confidence=0.4))
    u = await cu.understand("준비물이요?", ["안녕하세요"], model=model)
    assert u.needs_clarification is True
    assert u.clarification_question == "어떤 검사를 말씀하시나요?"


@pytest.mark.asyncio
async def test_understand_empty_clarification_question_is_not_clarify():
    # 되묻기 True인데 질문 본문이 비면 빈 되묻기(막다른 길) → 안전하게 되묻기 해제, 검색으로 진행.
    model = _JsonModel(_json(route="rag", standalone_query="",
                             needs_clarification=True, clarification_question="   ",
                             topic_shift=False, confidence=0.4))
    u = await cu.understand("질문", ["이전"], model=model)
    assert u.needs_clarification is False
    assert u.clarification_question is None


@pytest.mark.asyncio
async def test_understand_standalone_echo_is_none():
    # 재작성 질의가 원문과 같으면(재작성 가치 없음) None → 원문으로 검색.
    model = _JsonModel(_json(route="rag", standalone_query="그럼 물은?",
                             needs_clarification=False, clarification_question="",
                             topic_shift=False, confidence=0.8))
    u = await cu.understand("그럼 물은?", ["이전"], model=model)
    assert u.standalone_query is None


@pytest.mark.asyncio
async def test_understand_active_flow_skips_llm():
    # 진행 중 문진(active_flow=department_guide)은 재분류하지 않는다 — LLM 호출 없이 그 갈래 유지.
    model = _JsonModel(_json(route="rag"))
    u = await cu.understand("네 3일 됐어요", ["어디가 불편하세요?"],
                            active_flow="department_guide", model=model)
    assert u.route == "department_guide"
    assert model.call_count == 0


@pytest.mark.asyncio
async def test_understand_parses_topic_shift_and_clamps_confidence():
    model = _JsonModel(_json(route="agent", standalone_query="",
                             needs_clarification=False, clarification_question="",
                             topic_shift=True, confidence=1.7))
    u = await cu.understand("예약 취소할래요", ["주차 안내"], model=model)
    assert u.route == "agent"
    assert u.topic_shift is True
    assert u.confidence == 1.0   # [0,1] 밖 값은 클램프
