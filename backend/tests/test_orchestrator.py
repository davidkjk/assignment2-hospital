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
async def test_free_text_staff_request_asks_confirmation_not_auto_handoff():
    # #6: 자유 입력으로 사람 연결을 말하면 바로 인계하지 않고 확인 프롬프트(칩)를 낸다.
    #   질문("직원에게 연결하면 뭘 해주나요")이 인계로 오작동하던 것을 막는다 — 세션 유지(escalated False).
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "직원에게 연결하면 뭘 해주나요", model=_Model("rag"))
    assert out["route_taken"] == "no_answer"                # no_answer 카드 경로 재사용(렌더 동일)
    assert out["escalated"] is False                        # 아직 인계 안 됨
    assert out["confirm_handoff"] is True                   # 미해결 기록은 건너뛴다(KB 구멍 아님)
    assert out["handoff_chip"] == orchestrator.HANDOFF_CONFIRM_CHIP


@pytest.mark.asyncio
async def test_confirm_chip_triggers_real_handoff():
    # #6: 확인 칩(정확히 그 문구)을 누르면 그때 실제 인계된다(칩 탭 = 명시적 선택 → 재확인 없음).
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         orchestrator.HANDOFF_CONFIRM_CHIP)
    assert out["route_taken"] == "handoff"
    assert out["handoff_reason"] == "staff_request" and out["escalated"] is True


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
    assert out["handoff_chip"] == "직원에게 연결하기"          # 콜백 칩(인계 폼 열기)


@pytest.mark.asyncio
async def test_rag_needs_clarification_routes_as_normal_reply():
    # Sprint 2 no_answer 세분화: 애매한 질문의 확인 질문은 실패(no_answer)가 아니라 정상 rag 답변으로
    #   흘러야 한다 → 티켓·미해결 기록을 만드는 no_answer 경로를 타지 않는다(리포트 §7 "실패 집계 제외").
    async def rag_fn(s, m): return {"needs_clarification": True, "reply": "어떤 검사를 말씀하시나요?"}
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "준비물이요?", rag_fn=rag_fn, model=_Model("rag"))
    assert out["route_taken"] == "rag"                   # no_answer 아님 → 미해결 기록 안 됨
    assert out["reply"] == "어떤 검사를 말씀하시나요?"
    assert out.get("needs_clarification") is True


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


# ── Q28: 인계 요약 3항목 AI 생성(make_handoff_summary) ───────────────────────────
# 직원 티켓 상세의 「상담봇이 확인한 정보·이미 안내한 내용·직원이 확인할 사항」 3칸을
# 인계 시점 대화 요약으로 채운다(TICKET-DETAIL-SUM-01). 진단 금지·없으면 None(SUM-02).

@pytest.mark.asyncio
async def test_handoff_summary_parses_three_fields():
    model = _Model('{"bot_confirmed": "예약 가능 시간대를 확인했어요", '
                   '"already_guided": "앱 예약 화면 위치를 안내했어요", '
                   '"staff_should_check": "환자가 원하는 정확한 날짜"}')
    out = await orchestrator.make_handoff_summary("환자: 예약하고 싶어요\n봇: 앱에서 예약하실 수 있어요",
                                                  model=model)
    assert out == {
        "bot_confirmed": "예약 가능 시간대를 확인했어요",
        "already_guided": "앱 예약 화면 위치를 안내했어요",
        "staff_should_check": "환자가 원하는 정확한 날짜",
    }


@pytest.mark.asyncio
async def test_handoff_summary_empty_or_missing_fields_become_none():
    # SUM-02: 값이 없거나 빈 문자열이면 지어내지 않고 None(화면 '없음').
    model = _Model('{"bot_confirmed": "진료시간을 확인했어요", "already_guided": "   "}')
    out = await orchestrator.make_handoff_summary("환자: 진료시간요?\n봇: 평일 9시-6시예요", model=model)
    assert out == {
        "bot_confirmed": "진료시간을 확인했어요",
        "already_guided": None,
        "staff_should_check": None,
    }


@pytest.mark.asyncio
async def test_handoff_summary_parses_markdown_fenced_json():
    # 실제 모델이 ```json … ``` 펜스로 감싸도 3항목을 뽑아낸다.
    model = _Model('```json\n{"bot_confirmed": "예약 가능 여부 확인", '
                   '"already_guided": null, "staff_should_check": "환자 희망 날짜"}\n```')
    out = await orchestrator.make_handoff_summary("환자: 예약\n봇: 네", model=model)
    assert out["bot_confirmed"] == "예약 가능 여부 확인"
    assert out["already_guided"] is None
    assert out["staff_should_check"] == "환자 희망 날짜"


@pytest.mark.asyncio
async def test_handoff_summary_failure_is_best_effort_all_none():
    # LLM 호출·파싱 실패는 세 항목 전부 None — 인계는 이 요약 때문에 막히지 않는다.
    class _Boom:
        async def ainvoke(self, _):
            raise RuntimeError("LLM down")
    out = await orchestrator.make_handoff_summary("환자: ...", model=_Boom())
    assert out == {"bot_confirmed": None, "already_guided": None, "staff_should_check": None}


# ── 전면 통합(understanding_mode='llm') — 질문 이해 1콜 라우팅 ──────────────────────
# 안전(⓪ⓠ①)·프리체크(①-b)는 앞단 그대로. ② 라우터 classify + 후속질문 rewrite만 이해기 1콜로.
# 실패·형식 위반이면 레거시(classify)로 자동 폴백.

class _JsonModel:
    """understand용 JSON을 content로 돌려주는 mock. check_escalation도 이 model을 쓰지만
    JSON 문자열은 escalation 라벨이 아니라 None(=인계 없음)이 된다."""
    def __init__(self, text): self._text = text
    async def ainvoke(self, _):
        class R: pass
        r = R(); r.content = self._text
        return r


def _ujson(**kw):
    import json
    base = {"route": "rag", "standalone_query": "", "needs_clarification": False,
            "clarification_question": "", "topic_shift": False, "confidence": 0.9}
    base.update(kw)
    return json.dumps(base, ensure_ascii=False)


@pytest.mark.asyncio
async def test_llm_mode_passes_rewritten_query_to_rag_fn():
    # 이해기가 준 독립형 검색 질의가 rag_fn에 retrieval_query로 전달된다(재작성은 검색에만).
    seen = {}
    async def rag_fn(s, m, retrieval_query="__2arg__"):
        seen["rq"] = retrieval_query
        return {"reply": "검사 전 6시간 금식입니다", "no_answer": False}
    model = _JsonModel(_ujson(route="rag", standalone_query="CT 조영제 검사 전 물 섭취 가능 여부"))
    out = await orchestrator.orchestrate(
        SimpleNamespace(active_flow=None, flow_step=0), "그럼 물은?",
        history_texts=["CT 조영제 검사 준비물이 뭐예요?"],
        rag_fn=rag_fn, model=model, understanding_mode="llm")
    assert out["route_taken"] == "rag"
    assert "CT 조영제 검사 전 물 섭취 가능 여부" in seen["rq"]   # 재작성 질의 전달됨
    assert "그럼 물은?" in seen["rq"]                          # 원문도 concat(§9.4)


@pytest.mark.asyncio
async def test_llm_mode_search_before_clarification_skips_rag():
    # 이해기가 애매하다고 판정하면 검색 없이 되묻는다(검색-전 되묻기). route_taken은 rag 유지(실패 아님).
    called = {"rag": False}
    async def rag_fn(s, m, retrieval_query="__2arg__"):
        called["rag"] = True
        return {"reply": "x", "no_answer": False}
    model = _JsonModel(_ujson(needs_clarification=True, clarification_question="어떤 검사를 말씀하시나요?"))
    out = await orchestrator.orchestrate(
        SimpleNamespace(active_flow=None, flow_step=0), "준비물이요?",
        history_texts=["안녕하세요"], rag_fn=rag_fn, model=model, understanding_mode="llm")
    assert out["route_taken"] == "rag"
    assert out["needs_clarification"] is True
    assert out["reply"] == "어떤 검사를 말씀하시나요?"
    assert called["rag"] is False                              # 검색 안 함


@pytest.mark.asyncio
async def test_llm_mode_falls_back_to_legacy_classify_on_failure():
    # 이해기가 JSON을 못 내면(None) 레거시 classify로 폴백 → rag_fn을 2-arg로 부른다(retrieval_query 없음).
    seen = {}
    async def rag_fn(s, m, retrieval_query="__2arg__"):
        seen["rq"] = retrieval_query
        return {"reply": "주차는 지하 1층입니다", "no_answer": False}
    model = _JsonModel("rag")                                  # JSON 아님 → understand None, classify는 'rag'
    out = await orchestrator.orchestrate(
        SimpleNamespace(active_flow=None, flow_step=0), "주차 어디에요?",
        rag_fn=rag_fn, model=model, understanding_mode="llm")
    assert out["route_taken"] == "rag"
    assert seen["rq"] == "__2arg__"                            # 2-arg 레거시 호출(재작성은 rag_fn 내부가 담당)


@pytest.mark.asyncio
async def test_llm_mode_active_flow_stays_department_guide_without_llm_route():
    # 진행 중 문진은 이해기가 재분류하지 않고 department_guide 유지 → dept_guide_fn 실행.
    async def dept_guide_fn(s, m): return {"reply": "정형외과를 추천드려요"}
    model = _JsonModel(_ujson(route="rag"))                    # 이해기가 llm을 태우면 rag가 되지만, active_flow라 안 태움
    out = await orchestrator.orchestrate(
        SimpleNamespace(active_flow="department_guide", flow_step=1), "3일 됐어요",
        history_texts=["어디가 불편하세요?"], dept_guide_fn=dept_guide_fn,
        model=model, understanding_mode="llm")
    assert out["route_taken"] == "department_guide"
    assert "정형외과" in out["reply"]
