from app.services.chat.ticket_service import _row_to_inbox


def _row(**over):
    base = {
        "id": "t1",
        "status": "pending",
        "patient_question": "두통이 심해요",
        "created_at": "2026-08-22T08:42:00",
        "reason_code": None,
        "assignee_name": None,
        "is_mine": False,
        "appointment_summary": None,
    }
    base.update(over)
    return base


def test_medical_judgment_maps_to_type_and_korean_reason():
    dto = _row_to_inbox(_row(reason_code="medical_judgment"))
    assert dto["request_type"] == "medical_judgment"
    assert dto["handoff_reason"] == "진단·치료 판단이 필요합니다"


def test_cancel_and_change_booking_map_to_cancel_reschedule():
    assert _row_to_inbox(_row(reason_code="cancel_booking"))["request_type"] == "cancel"
    assert _row_to_inbox(_row(reason_code="late_cancellation"))["request_type"] == "cancel"
    assert _row_to_inbox(_row(reason_code="change_booking"))["request_type"] == "reschedule"


def test_non_booking_reason_has_no_request_type_but_readable_reason():
    dto = _row_to_inbox(_row(reason_code="no_answer"))
    assert dto["request_type"] is None
    assert dto["handoff_reason"] == "상담봇이 답하지 못한 질문입니다"


def test_unknown_or_missing_reason_falls_back_and_is_never_raw_code():
    # 모르는 코드/누락은 원시 코드를 그대로 노출하지 않고 안전한 한 줄로(§0 모르는 상태 금지의 표시 짝).
    assert _row_to_inbox(_row(reason_code=None))["handoff_reason"] == "직원 확인이 필요합니다"
    assert _row_to_inbox(_row(reason_code="weird_new_code"))["handoff_reason"] == "직원 확인이 필요합니다"
    assert _row_to_inbox(_row(reason_code="weird_new_code"))["request_type"] is None


def test_passthrough_fields_are_carried_verbatim():
    dto = _row_to_inbox(_row(id="abc", status="in_progress", assignee_name="박지민", is_mine=True,
                             appointment_summary="8/20 10:30 · 내과 · 이정훈"))
    assert dto["id"] == "abc"
    assert dto["status"] == "in_progress"
    assert dto["assignee_name"] == "박지민"
    assert dto["is_mine"] is True   # 이관 알림: 내 담당 여부 전달
    assert dto["appointment_summary"] == "8/20 10:30 · 내과 · 이정훈"
    assert dto["patient_question"] == "두통이 심해요"
    assert dto["created_at"] == "2026-08-22T08:42:00"
