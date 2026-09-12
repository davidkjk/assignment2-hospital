# 상담봇 평가 채점 — 순수 함수(키·DB·네트워크 없음). scripts/rag_eval.py가 실제 파이프라인
# 결과를 이 함수들로 채점한다. 리포트 §4.1 평가축(경로/Recall/근거 충실성/직접답변)을 구현.


def route_match(expected: str, actual: str) -> bool:
    return expected == actual


def recall_at_k(expected_titles: list[str], retrieved_titles: list[str]) -> float:
    # 기대 근거 문서가 검색 top-k 안에 들어온 비율. 기대가 없으면 만점(분모 0 회피).
    if not expected_titles:
        return 1.0
    hit = sum(1 for t in expected_titles if t in retrieved_titles)
    return hit / len(expected_titles)


def missing_facts(answer: str, required: list[str]) -> list[str]:
    # 답에 반드시 있어야 할 사실 중 빠진 것(근거 충실성 — 핵심 사실 누락 검출).
    return [f for f in (required or []) if f not in (answer or "")]


def forbidden_hits(answer: str, forbidden: list[str]) -> list[str]:
    # 답에 있으면 안 되는 주장 중 등장한 것(과잉 일반화·환각 검출).
    return [f for f in (forbidden or []) if f in (answer or "")]


def missing_query_terms(query: str, required_terms: list[str]) -> list[str]:
    # (재작성) 검색 질의에 포함돼야 할 핵심어 중 빠진 것 — 대소문자 무시(CT/ct).
    q = (query or "").lower()
    return [t for t in (required_terms or []) if t.lower() not in q]


def department_match(expected, actual) -> bool:
    # triage 진료과 추천 정확도(증상→과). 러너가 dept_guide 결과의 suggested_department 이름을 채점한다.
    #   · expected=None(빈 문자열 포함): '우리 병원에 없는 과 → 정직 안내(추천 없음)'가 정답 →
    #     실제도 추천이 없어야(None/'') 통과한다. 없는 과를 억지로 추천하면 실패(정직 안내 위반).
    #   · expected=진료과명: 실제 추천이 정확히 그 과여야 통과한다.
    #   빈 문자열과 None은 동치(추천 미매칭 = 없음)로 본다.
    return (expected or None) == (actual or None)


def scorable(*, no_answer: bool, needs_clarification: bool) -> bool:
    # 이 케이스 결과를 recall·근거 충실성 집계에 넣을지. needs_clarification(애매한 질문에 대한
    #   되묻기)은 정상 rag 흐름이라 '답변 실패'가 아니다(리포트 §7) → 집계에서 뺀다.
    #   no_answer(근거 부족)는 기존대로 집계 대상으로 남긴다(기준선 비교 가능성 보존).
    return not needs_clarification
