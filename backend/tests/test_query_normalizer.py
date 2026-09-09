"""검색용 질의 정규화(동의어 확장) — 순수 단위 테스트(DB 불필요).

리포트 §4.3(병원 용어 정규화)·§9.6 Sprint 1.2. 목적: 환자가 쓰는 표현(씨티·엠알아이·바륨)을
KB 원문의 표준어(CT·MRI·위장조영)와 이어 붙여, 임베딩·트라이그램 검색이 같은 문서를 찾게 한다.
표시·LLM 질문에는 원문을 그대로 쓰고, 검색 질의에만 이 확장을 쓴다(rag_service가 분리 적용).
"""
from app.services.chat.query_normalizer import normalize_query


def test_lowercases_latin_abbreviations():
    # 트라이그램·임베딩이 대소문자로 갈리지 않게. "CT" 원문 KB와 "ct" 질의를 같게.
    assert "ct" in normalize_query("CT 준비물")


def test_nfkc_folds_fullwidth_latin():
    # 전각 입력(ＣＴ)도 반각 ct로 접힌다 — 모바일 IME가 전각을 내는 경우.
    assert "ct" in normalize_query("ＣＴ 검사")


def test_collapses_repeated_whitespace():
    assert normalize_query("CT   조영제") == normalize_query("CT 조영제")


def test_korean_transliteration_bridges_to_english_abbrev():
    # 가장 큰 이득: 한글 음역 "씨티"는 KB 원문 "CT"와 트라이그램 겹침이 0 → 영문 약어를 함께 실어 준다.
    out = normalize_query("씨티 조영제 검사")
    assert "ct" in out          # KB 원문 표준어가 검색 질의에 실린다
    assert "씨티" in out         # 원문 토큰도 보존(의미 임베딩용)


def test_english_abbrev_bridges_to_korean_variants():
    # 역방향도 대칭: "mri"만 쳐도 한글 변형이 실려 한글 위주 KB 문장과도 맞는다.
    out = normalize_query("mri 찍어요")
    assert "자기공명영상" in out


def test_barium_bridges_to_upper_gi_series():
    # 위장조영(바륨) — 환자는 "바륨", KB 제목은 "위장조영(바륨)". 서로 이어 준다.
    out = normalize_query("바륨 검사 준비")
    assert "위장조영" in out


def test_unrelated_query_is_not_expanded():
    # 동의어에 안 걸리는 질의는 확장하지 않는다(검색 오염 방지). 주차 → CT/MRI 주입 금지.
    out = normalize_query("주차 되나요")
    assert "ct" not in out
    assert "mri" not in out
    assert "위장조영" not in out


def test_does_not_inject_ct_into_unrelated_latin_word():
    # 짧은 라틴 약어(ct)를 다른 단어 속에서 오탐하지 않는다(단어 경계). "contact"에 CT 그룹 주입 금지.
    out = normalize_query("contact lens 문의")
    assert "컴퓨터단층촬영" not in out


def test_does_not_duplicate_terms_already_present():
    # 원문에 표준어와 변형이 다 있으면 중복 append 안 한다(질의 비대·트라이그램 희석 방지).
    out = normalize_query("위장조영 바륨 검사")
    assert out.count("위장조영") == 1
    assert out.count("바륨") == 1
