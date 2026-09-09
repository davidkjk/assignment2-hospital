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
