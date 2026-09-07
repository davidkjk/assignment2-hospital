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


def test_quick_replies_card_carries_options_and_handoff_chip():
    # no_answer 안내: FAQ 칩(텍스트 전송) + [직원에게 연결] 콜백 칩(WEBCHAT-NOANS).
    # 프론트(웹 QuickReplies.p.options)가 읽는 키는 options다.
    card = cb.build_quick_replies_card(
        replies=["진료시간이 어떻게 되나요", "예약하려면 어떻게 하나요", "오시는 길이 궁금해요"],
        handoff_chip="직원에게 연결")
    assert card["card_type"] == "quick_replies"
    assert card["options"] == ["진료시간이 어떻게 되나요", "예약하려면 어떻게 하나요", "오시는 길이 궁금해요"]
    assert card["handoff_chip"] == "직원에게 연결"
    cb.validate_card_payload(card)   # 알려진 카드 종류(예외 없음)


def test_quick_replies_card_handoff_chip_optional():
    # 시작 칩 등 인계 없는 묶음은 handoff_chip 없이도 만든다(None).
    card = cb.build_quick_replies_card(replies=["진료시간이 어떻게 되나요"])
    assert card["handoff_chip"] is None
    assert card["options"] == ["진료시간이 어떻게 되나요"]


# ── 예약 앞흐름 카드 4종 (WEBCARD-DEPT/DOC/DATE/TARGET) ──────────────────────

def test_department_select_card_carries_departments_and_guide_chip():
    # [WEBCARD-DEPT-01] 진료과 버튼 + 맨 아래 증상으로 찾기 칩
    card = cb.build_department_select_card(
        departments=[{"id": "d1", "name": "내과"}, {"id": "d2", "name": "정형외과"}])
    assert card["card_type"] == "department_select"
    assert [d["name"] for d in card["departments"]] == ["내과", "정형외과"]
    assert card["guide_chip"] == "잘 모르겠어요 · 증상으로 찾기"
    cb.validate_card_payload(card)


def test_department_select_card_can_hide_guide_chip():
    # [WEBCARD-DEPT-02] 증상 대화로 이미 좁혀졌으면 칩을 숨긴다
    card = cb.build_department_select_card(departments=[{"id": "d1", "name": "내과"}], allow_symptom_guide=False)
    assert card["guide_chip"] is None


def test_doctor_select_card_empty_state_when_no_doctors():
    # [WEBCARD-DOC-02] 가용 의사 0 → 빈 상태(막다른 길 문구는 프론트가 렌더)
    card = cb.build_doctor_select_card(department_id="d1", department_name="내과", doctors=[])
    assert card["card_type"] == "doctor_select" and card["state"] == "빈"


def test_doctor_select_card_lists_doctors_always_even_single():
    # [WEBCARD-DOC-01] 의사가 1명이어도 항상 표시(결정 ②)
    card = cb.build_doctor_select_card(
        department_id="d1", department_name="내과",
        doctors=[{"id": "s1", "name": "김의사", "specialty": "소화기", "schedule_summary": "월·수·금"}])
    assert card["state"] == "정상" and len(card["doctors"]) == 1
    assert card["doctors"][0]["name"] == "김의사"


def test_date_select_card_empty_state():
    # [WEBCARD-DATE-02] 가용일 0 → 빈 상태
    card = cb.build_date_select_card(department_id="d1", doctor_id="s1", doctor_name="김의사", dates=[])
    assert card["card_type"] == "date_select" and card["state"] == "빈"


def test_target_select_card_carries_self_and_family():
    # [WEBCARD-TARGET-01] 본인/가족 + 앞 선택값(dep·doc·slot) 누적
    card = cb.build_target_select_card(
        department_id="d1", doctor_id="s1", slot_id="sl1", slot_at="2026-09-11T10:00:00",
        targets=[{"for_patient_id": "p1", "name": "홍길동", "relation": None},
                 {"for_patient_id": "p2", "name": "홍자녀", "relation": "자녀"}])
    assert card["card_type"] == "target_select"
    assert card["slot_id"] == "sl1" and card["department_id"] == "d1"
    assert [t["name"] for t in card["targets"]] == ["홍길동", "홍자녀"]
