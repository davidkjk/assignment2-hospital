import pytest

from app.services.chat import card_builder as cb


def test_booking_confirm_button_is_fixed_regardless_of_settings():
    # 버튼 문구는 auto_confirm 설정과 무관하게 "예약 신청하기"로 통일(카탈로그 §2 상태1).
    assert cb.BOOKING_CONFIRM_BUTTON == "예약 신청하기"


def test_booking_confirm_card_shows_relation_and_optional_reason():
    card = cb.build_booking_confirm_card(
        for_patient_id="p1", patient_name="김OO", relation="어머니",
        department_name="내과", doctor_name="이의사", slot_at="2026-08-20T14:00:00+09:00",
        visit_reason="두통")
    assert card["card_type"] == "booking_confirm"
    assert card["relation"] == "어머니" and card["visit_reason"] == "두통"
    assert card["button"] == "예약 신청하기"


def test_booking_confirm_does_not_invent_empty_reason():
    # 방문이유가 비면 없는 값을 만들어 채우지 않는다(카탈로그 §2 정합성).
    card = cb.build_booking_confirm_card(
        for_patient_id="p1", patient_name="김OO", relation=None,
        department_name="내과", doctor_name="이의사", slot_at="2026-08-20T14:00:00+09:00",
        visit_reason=None)
    assert card["visit_reason"] is None


def test_visit_reason_capped_at_100_chars():
    # BOOK-WHY: 최대 100자 선택 입력(#8).
    assert len(cb.collect_visit_reason("가" * 200)) == 100
    assert cb.collect_visit_reason("   ") == ""   # 공백만이면 빈 값(선택 입력)


def test_booking_done_distinguishes_apply_vs_confirm():
    applied = cb.build_booking_done_card(status="예약신청", number="A-123")
    confirmed = cb.build_booking_done_card(status="예약확정", number="R-777")
    assert applied["number_label"] == "신청번호" and confirmed["number_label"] == "예약번호"
    assert applied["headline"] != confirmed["headline"]


def test_booking_done_zero_questionnaire_has_no_button():
    # 0문항이면 [사전문진 작성하기] 버튼·(0/0)·독립 문진 카드를 만들지 않는다(카탈로그 §3 상태4).
    card = cb.build_booking_done_card(status="예약확정", number="R-1", question_count=0)
    assert card["questionnaire_button"] is None
    assert card["questionnaire_note"] == "작성할 문진이 없습니다"


def test_questionnaire_card_uses_server_progress_not_recomputed():
    # 진행률은 서버 계산값을 그대로 담는다(자체 계산 금지, QNR-PROG 재현).
    card = cb.build_questionnaire_card(state="작성중", answered=3, total=8)
    assert card["answered"] == 3 and card["total"] == 8 and card["state"] == "작성중"


def test_validate_rejects_unknown_card_type():
    with pytest.raises(ValueError):
        cb.validate_card_payload({"card_type": "made_up"})
