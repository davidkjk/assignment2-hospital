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
