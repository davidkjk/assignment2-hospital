# 상담봇 평가 하네스의 순수 채점 함수 + 골든 케이스 파일 무결성. 키·네트워크 없이 돈다.
# (실제 파이프라인 실행은 scripts/rag_eval.py가 API 키가 있을 때 수행 — 여기선 채점 로직과 케이스 품질만 검증.)
import json
from pathlib import Path

from app.services.chat import eval_scoring as sc
from scripts import rag_eval

CASES_PATH = Path(__file__).resolve().parent.parent / "evals" / "chatbot_cases.jsonl"


# ── 순수 채점 함수 ──

def test_route_match():
    assert sc.route_match("rag", "rag") is True
    assert sc.route_match("rag", "handoff") is False


def test_recall_at_k_full_partial_and_empty_expected():
    assert sc.recall_at_k(["A", "B"], ["A", "B", "C"]) == 1.0
    assert sc.recall_at_k(["A", "B"], ["A", "Z"]) == 0.5
    assert sc.recall_at_k([], ["A"]) == 1.0        # 기대 근거가 없으면 만점(분모 0 회피)


def test_missing_facts_lists_absent_required():
    assert sc.missing_facts("4시간 금식이 필요합니다", ["4시간 금식", "물은 소량"]) == ["물은 소량"]
    assert sc.missing_facts("전부 포함", []) == []


def test_forbidden_hits_lists_violations():
    assert sc.forbidden_hits("모든 CT는 금식입니다", ["모든 CT는 금식"]) == ["모든 CT는 금식"]
    assert sc.forbidden_hits("안전한 답", ["위험문구"]) == []


def test_missing_query_terms_is_case_insensitive():
    # 재작성 질의에 CT·조영제가 들어갔는지(대소문자 무시).
    assert sc.missing_query_terms("ct 조영제 검사 준비", ["CT", "조영제", "준비"]) == []
    assert sc.missing_query_terms("물 마셔도 돼요", ["CT", "조영제"]) == ["CT", "조영제"]


def test_department_match_scores_triage_recommendation():
    # triage 진료과 추천 정확도(증상→과). expected_department가 과 이름이면 실제 추천이 그 과여야 통과.
    assert sc.department_match("정형외과", "정형외과") is True
    assert sc.department_match("내과", "정형외과") is False


def test_department_match_none_means_honest_no_department():
    # 없는 과(피부·생리·마음건강 등)는 '추천 없음(정직 안내)'이 정답 → 둘 다 없음일 때만 통과.
    #   빈 문자열과 None을 동치로 본다(추천 미매칭 = 없음).
    assert sc.department_match(None, None) is True
    assert sc.department_match(None, "") is True
    assert sc.department_match(None, "피부과") is False       # 없는 과를 억지로 추천하면 실패
    assert sc.department_match("내과", None) is False          # 있는 과를 못 잡아도 실패


# ── 러너 헬퍼: 케이스 turns → 현재 메시지 + 이력 (프로덕션 build_history와 동형, 순수) ──

def test_case_message_and_history_single_turn_has_empty_history():
    # 단일 발화 케이스: 마지막 user 발화가 현재 메시지, 이력은 비어 있다(첫 질문 → 재작성 안 됨).
    case = {"turns": [{"role": "user", "content": "CT 조영제 검사 준비물이 뭐예요?"}]}
    message, history = rag_eval.case_message_and_history(case)
    assert message == "CT 조영제 검사 준비물이 뭐예요?"
    assert history == []


def test_case_message_and_history_multiturn_keeps_prior_turns_in_order():
    # 멀티턴: 마지막 user 발화가 현재 메시지, 그 앞의 모든 턴(사용자·봇)이 시간순 이력으로 남는다.
    #   이 이력이 has_followup_signal(비어있지 않음)·rewrite_standalone(지시어 해소)의 입력이 된다.
    case = {"turns": [
        {"role": "user", "content": "씨티 찍어요"},
        {"role": "assistant", "content": "조영제를 사용하는 CT 검사인가요?"},
        {"role": "user", "content": "응 그거 몇 시간 굶어야 해?"},
    ]}
    message, history = rag_eval.case_message_and_history(case)
    assert message == "응 그거 몇 시간 굶어야 해?"
    assert history == ["씨티 찍어요", "조영제를 사용하는 CT 검사인가요?"]


# ── 러너 헬퍼: needs_clarification(되묻기)은 recall/근거 집계 대상이 아니다(리포트 §7) ──

def test_scorable_excludes_clarification_but_keeps_no_answer():
    # needs_clarification(정상 되묻기)은 '답변 시도'가 아니라 recall/근거 집계에서 뺀다.
    #   no_answer(근거 부족)는 기존대로 집계 대상으로 남긴다(기준선 비교 가능성 보존).
    assert sc.scorable(no_answer=False, needs_clarification=True) is False
    assert sc.scorable(no_answer=True, needs_clarification=False) is True
    assert sc.scorable(no_answer=False, needs_clarification=False) is True


# ── 러너 A/B: 모드(legacy|llm)별 검색질의·검색-전 되묻기 결정 (mock LLM) ──
# legacy = has_followup+rewrite(Sprint 2), llm = understand() 1콜. llm 실패는 legacy로 폴백(프로덕션 동형).

import pytest


class _Model:
    """지정 문자열을 content로 돌려주는 mock LLM(호출 카운트 포함)."""
    def __init__(self, text):
        self._text = text
        self.call_count = 0
    async def ainvoke(self, _):
        self.call_count += 1
        class R: pass
        r = R(); r.content = self._text
        return r


def _ujson(**kw):
    base = {"route": "rag", "standalone_query": "", "needs_clarification": False,
            "clarification_question": "", "topic_shift": False, "confidence": 0.9}
    base.update(kw)
    return json.dumps(base, ensure_ascii=False)


@pytest.mark.asyncio
async def test_resolve_understanding_legacy_rewrites_followup():
    model = _Model("CT 조영제 검사 전 물 섭취 가능 여부")
    rq, needs_clarify = await rag_eval.resolve_understanding(
        "legacy", "그럼 물은?", ["CT 조영제 검사 준비물이 뭐예요?"], model)
    assert "CT 조영제 검사 전 물 섭취 가능 여부" in rq and "그럼 물은?" in rq
    assert needs_clarify is False


@pytest.mark.asyncio
async def test_resolve_understanding_legacy_first_question_no_rewrite():
    model = _Model("무시됨")
    rq, needs_clarify = await rag_eval.resolve_understanding(
        "legacy", "CT 검사 준비물이 뭐예요?", [], model)
    assert rq is None and needs_clarify is False
    assert model.call_count == 0                # 첫 질문은 재작성 LLM 안 태움


@pytest.mark.asyncio
async def test_resolve_understanding_llm_uses_understand_standalone():
    model = _Model(_ujson(standalone_query="CT 조영제 검사 전 물 섭취 가능 여부"))
    rq, needs_clarify = await rag_eval.resolve_understanding(
        "llm", "그럼 물은?", ["CT 조영제 검사 준비물이 뭐예요?"], model)
    assert "CT 조영제 검사 전 물 섭취 가능 여부" in rq and "그럼 물은?" in rq
    assert needs_clarify is False


@pytest.mark.asyncio
async def test_resolve_understanding_llm_needs_clarification():
    model = _Model(_ujson(needs_clarification=True, clarification_question="어떤 검사를 말씀하시나요?"))
    rq, needs_clarify = await rag_eval.resolve_understanding(
        "llm", "준비물이요?", ["안녕하세요"], model)
    assert rq is None and needs_clarify is True    # 검색-전 되묻기 → 검색 안 함, 집계 제외


@pytest.mark.asyncio
async def test_resolve_understanding_llm_failure_falls_back_to_legacy():
    # 이해기가 JSON을 못 내면(None) legacy 재작성 경로로 폴백(프로덕션 orchestrate와 동형).
    model = _Model("CT 조영제 검사 전 물 섭취 가능 여부")   # JSON 아님 → understand None → legacy rewrite가 이 문자열 사용
    rq, needs_clarify = await rag_eval.resolve_understanding(
        "llm", "그럼 물은?", ["CT 조영제 검사 준비물이 뭐예요?"], model)
    assert rq is not None and "CT 조영제 검사 전 물 섭취 가능 여부" in rq
    assert needs_clarify is False


# ── 골든 케이스 파일 무결성 ──

def test_cases_file_exists_and_parses():
    assert CASES_PATH.exists(), f"골든 케이스 파일이 없습니다: {CASES_PATH}"
    cases = [json.loads(line) for line in CASES_PATH.read_text().splitlines() if line.strip()]
    assert len(cases) >= 40, f"골든 케이스가 40개 이상이어야 합니다(현재 {len(cases)})"
    ids = [c["id"] for c in cases]
    assert len(ids) == len(set(ids)), "케이스 id가 중복됩니다"


def test_every_case_has_required_shape():
    cases = [json.loads(line) for line in CASES_PATH.read_text().splitlines() if line.strip()]
    valid_routes = {"rag", "department_guide", "agent", "handoff", "no_answer", "emergency"}
    for c in cases:
        assert c.get("turns"), f"{c['id']}: turns 필요"
        assert c["turns"][-1]["role"] == "user", f"{c['id']}: 마지막 턴은 user여야(현재 질문)"
        assert c.get("expected_route") in valid_routes, f"{c['id']}: expected_route 부정확({c.get('expected_route')})"


def test_expected_source_titles_reference_known_kb_docs():
    # 케이스가 가리키는 근거 문서 제목은 실제 seed KB에 있어야 한다(오타·유령 문서 방지).
    seed = (CASES_PATH.parent.parent.parent / "supabase" / "seed_kb_bulk.sql").read_text()
    cases = [json.loads(line) for line in CASES_PATH.read_text().splitlines() if line.strip()]
    for c in cases:
        for title in c.get("expected_source_titles", []):
            assert f"'{title}'" in seed, f"{c['id']}: KB에 없는 근거 제목 '{title}'"


def test_triage_cases_have_valid_expected_department():
    # triage(증상→과) 케이스는 expected_department가 있어야 하고, 값은 데모 4개 과 이름이거나
    #   null(우리 병원에 없는 과 → 정직 안내 = 추천 없음)이어야 한다(seed_demo.sql 진료과 대조).
    demo_depts = {"내과", "정형외과", "이비인후과", "소아과"}
    cases = [json.loads(line) for line in CASES_PATH.read_text().splitlines() if line.strip()]
    triage = [c for c in cases if c.get("category", "").startswith("triage")]
    assert triage, "triage 케이스가 골든셋에 있어야 합니다"
    for c in triage:
        assert "expected_department" in c, f"{c['id']}: triage 케이스는 expected_department 필요"
        assert c["expected_route"] == "department_guide", f"{c['id']}: triage는 department_guide 경로"
        dept = c["expected_department"]
        assert dept is None or dept in demo_depts, f"{c['id']}: 진료과는 데모 4과 또는 null이어야(현재 {dept!r})"


@pytest.mark.asyncio
async def test_resolve_understanding_skips_understanding_for_intent_message():
    # 프로덕션은 진료시간·의사명단을 이해기 앞단(intent_precheck ①-b)이 DB로 답한다 → 이해기·재작성 둘 다
    #   건너뛴다. 러너도 이를 재현해 intent 케이스가 llm에서만 되묻기로 빠지는 왜곡(후6 진단)을 없앤다.
    model = _Model(_ujson(needs_clarification=True, clarification_question="어느 진료과요?"))
    rq, needs_clarify = await rag_eval.resolve_understanding("llm", "진료시간이 어떻게 되나요?", [], model)
    assert rq is None and needs_clarify is False
    assert model.call_count == 0     # intent 케이스는 이해기 LLM 안 태움
