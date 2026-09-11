import pytest

from app.services.chat.agentic_rag import nodes


class _Model:
    def __init__(self, content): self._c = content
    async def ainvoke(self, msgs):
        self.msgs = msgs
        class R: pass
        r = R(); r.content = self._c
        return r


# ── grade ──
@pytest.mark.asyncio
async def test_grade_true_when_model_says_relevant():
    out = await nodes.grade_documents("주차 되나요", [{"content": "지하 주차 가능"}], model=_Model("RELEVANT"))
    assert out is True


@pytest.mark.asyncio
async def test_grade_false_when_model_says_not_relevant():
    out = await nodes.grade_documents("주차 되나요", [{"content": "입원 생활 안내"}], model=_Model("NO"))
    assert out is False


@pytest.mark.asyncio
async def test_grade_prompt_includes_question_and_docs():
    m = _Model("RELEVANT")
    await nodes.grade_documents("CT 금식", [{"content": "CT 6시간 금식"}], model=m)
    text = " ".join(getattr(x, "content", str(x)) for x in m.msgs)
    assert "CT 금식" in text and "CT 6시간 금식" in text


# ── rewrite ──
@pytest.mark.asyncio
async def test_rewrite_returns_model_query():
    out = await nodes.rewrite_query("CT 물", [{"content": "무관"}], model=_Model("CT 조영제 검사 금식 준비"))
    assert out == "CT 조영제 검사 금식 준비"


@pytest.mark.asyncio
async def test_rewrite_falls_back_to_original_when_blank():
    out = await nodes.rewrite_query("CT 물", [], model=_Model("   "))
    assert out == "CT 물"


# ── decompose ──
@pytest.mark.asyncio
async def test_decompose_splits_compound():
    out = await nodes.decompose_question("주차랑 면회시간 알려줘", model=_Model("주차 안내\n면회 시간"))
    assert out == ["주차 안내", "면회 시간"]


@pytest.mark.asyncio
async def test_decompose_single_returns_original():
    out = await nodes.decompose_question("주차 되나요", model=_Model("주차 되나요"))
    assert out == ["주차 되나요"]


@pytest.mark.asyncio
async def test_decompose_blank_falls_back_to_original():
    out = await nodes.decompose_question("주차 되나요", model=_Model("  "))
    assert out == ["주차 되나요"]


# ── verify ──
@pytest.mark.asyncio
async def test_verify_true_when_grounded():
    out = await nodes.verify_grounding("지하 주차 가능합니다", [{"content": "지하 주차 가능"}], model=_Model("GROUNDED"))
    assert out is True


@pytest.mark.asyncio
async def test_verify_false_when_unsupported():
    out = await nodes.verify_grounding("옥상 주차 가능합니다", [{"content": "지하 주차 가능"}], model=_Model("NO"))
    assert out is False


@pytest.mark.asyncio
async def test_verify_prompt_includes_draft_and_docs():
    m = _Model("GROUNDED")
    await nodes.verify_grounding("답 초안X", [{"content": "근거Y"}], model=m)
    text = " ".join(getattr(x, "content", str(x)) for x in m.msgs)
    assert "답 초안X" in text and "근거Y" in text


# ── generate ──
@pytest.mark.asyncio
async def test_generate_returns_draft_when_answered():
    out = await nodes.generate_answer("주차 되나요", [{"content": "지하 주차 가능", "is_restricted": False}],
                                      [], model=_Model("지하에 주차하실 수 있습니다."))
    assert out["draft"] == "지하에 주차하실 수 있습니다."
    assert out["sentinel"] is None


@pytest.mark.asyncio
async def test_generate_detects_no_answer_sentinel_anywhere():
    out = await nodes.generate_answer("CT 준비물", [{"content": "주차 안내", "is_restricted": False}],
                                      [], model=_Model("자료에 없습니다.\n\nNO_ANSWER"))
    assert out["sentinel"] == "no_answer"


@pytest.mark.asyncio
async def test_generate_detects_needs_clarify_and_strips_sentinel():
    out = await nodes.generate_answer("준비물이요?", [{"content": "검사별로 다름", "is_restricted": False}],
                                      [], model=_Model("NEEDS_CLARIFY: 어떤 검사를 말씀하시나요?"))
    assert out["sentinel"] == "needs_clarify"
    assert out["clarify_question"] == "어떤 검사를 말씀하시나요?"


@pytest.mark.asyncio
async def test_generate_no_answer_takes_priority_over_clarify():
    out = await nodes.generate_answer("x", [{"content": "y", "is_restricted": False}],
                                      [], model=_Model("NEEDS_CLARIFY: 뭐요?\nNO_ANSWER"))
    assert out["sentinel"] == "no_answer"


@pytest.mark.asyncio
async def test_generate_prompt_carries_persona_grounding_and_examples():
    m = _Model("답")
    await nodes.generate_answer("주차 되나요", [{"content": "지하 주차", "is_restricted": False}],
                                [{"question": "주차 어디", "answer": "지하 2층"}], model=m)
    text = " ".join(getattr(x, "content", str(x)) for x in m.msgs)
    assert "가온병원" in text and "지어내" in text and "NO_ANSWER" in text
    assert "주차 어디" in text and "지하 2층" in text
