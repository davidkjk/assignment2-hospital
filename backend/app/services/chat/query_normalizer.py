"""검색용 질의 정규화와 병원 용어 동의어 확장(리포트 §4.3 · §9.6 Sprint 1.2).

목적: 환자가 쓰는 표현("씨티·엠알아이·바륨")을 KB 원문의 표준어("CT·MRI·위장조영")와
한 문장에 함께 실어, 임베딩(의미)·트라이그램(글자) 검색이 같은 문서를 찾게 한다.

왜 필요한가: pg_trgm은 연속 세 글자 유사도라 한글 음역("씨티")과 영문 약어("CT")를 같은 말로
못 본다(겹치는 트라이그램 0). 임베딩도 짧은 한국어 음역·약어에선 정렬이 약하다. 명시적 사전이
가장 값싸고 설명 가능한 해결책이다(리포트 §4.3).

경계:
- 이 확장은 **검색 질의(search_query)에만** 쓴다. 화면 표시·로그·LLM에 주는 질문은 원문을 쓴다
  (rag_service가 분리 적용). 확장된 질의가 환자에게 보이면 안 된다.
- 동의어군은 지금 코드 상수(데모 규모 ~20개, 검사·영상 중심). 운영이 커지면 관리자 승인형
  테이블(kb_aliases)로 승격한다(리포트 §4.3 "관리자 승인 대상 데이터", 데모 이후 defer).
- 진료과·진료시간·의사 질의는 RAG 전에 intent_precheck가 결정적으로 처리하므로 여기 넣지 않는다
  (넣어도 그 질의는 RAG에 안 오지만, 해부어 substring 오탐 위험이 커 제외).
"""
import re
import unicodedata

# 각 군의 첫 항목이 대표어(표준어). 매칭은 라틴 약어=단어경계, 한글=부분일치.
# KB 원문에 실제로 등장하는 표준어를 대표어로 둔다(seed_kb_bulk.sql 대조: CT·MRI·위장조영·위내시경 등).
_SYNONYM_GROUPS: list[list[str]] = [
    ["ct", "씨티", "컴퓨터단층촬영", "전산화단층촬영"],
    ["mri", "엠알아이", "자기공명영상"],
    ["위장조영", "바륨"],
    ["위내시경", "위카메라", "위 카메라"],
    ["대장내시경", "대장카메라", "대장 카메라"],
    ["유방촬영", "맘모그램", "맘모그라피"],
    ["심전도", "ekg", "ecg"],
    ["초음파", "소노"],
]


def _is_latin(term: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9]+", term))


def _present(term: str, text: str) -> bool:
    # 라틴 약어는 단어 경계로(짧은 ct가 contact 안에서 오탐하지 않게), 한글은 부분일치.
    if _is_latin(term):
        return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None
    return term in text


def normalize_query(text: str) -> str:
    """검색용으로 정규화한 질의를 돌려준다(NFKC·소문자·공백 정리 + 동의어 확장).

    원문 토큰은 보존하고, 매칭된 동의어군의 빠진 표준어·변형만 뒤에 덧붙인다.
    """
    # NFKC: 전각 ＣＴ → 반각 ct 등 호환분해·정규결합. 이어서 소문자·공백 정리.
    norm = unicodedata.normalize("NFKC", text or "").lower()
    norm = re.sub(r"\s+", " ", norm).strip()

    # 확장은 각 군의 **대표어(group[0])만** 덧붙인다. 대표어는 KB 원문이 실제 쓰는 표준어라
    #   트라이그램·임베딩 둘 다에 도움이 된다. 긴 대체형(컴퓨터단층촬영 등)은 KB 원문에 없어
    #   word_similarity를 오히려 희석시킨다(2026-09-09 실측: 씨티 확장이 0.400→0.333로 하락).
    #   그래서 대체형은 **탐지용**으로만 쓰고(그 표현을 환자가 써도 대표어를 실어 줌) 출력엔 안 넣는다.
    extra: list[str] = []
    seen: set[str] = set()
    for group in _SYNONYM_GROUPS:
        if not any(_present(t, norm) for t in group):
            continue  # 이 군은 질의에 없음 → 확장 안 함(검색 오염 방지)
        canonical = group[0]
        if canonical in seen or _present(canonical, norm):
            continue  # 대표어가 이미 있으면 그대로(중복·희석 방지)
        seen.add(canonical)
        extra.append(canonical)
    if not extra:
        return norm
    return norm + " " + " ".join(extra)
