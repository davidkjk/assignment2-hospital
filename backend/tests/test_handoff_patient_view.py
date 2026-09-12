# Q18②④: 환자에게 보이는 인계 상태 매핑(순수 함수, DB 없음).
#   배정(in_progress)은 환자에게 숨긴다 — "직원이 확인 중"은 실제 열람(presence, 별도)만이고,
#   단순 배정은 기대만 키우므로 여전히 "직원 확인 전(connecting)". 담당자 정보는 answered일 때만 노출.
from app.services.chat.webchat_service import patient_handoff_view


def test_no_ticket_is_none():
    assert patient_handoff_view(None, "김직원", "doctor") == (None, None, None)


def test_pending_is_connecting_without_assignee():
    assert patient_handoff_view("pending", None, None) == ("connecting", None, None)


def test_in_progress_is_hidden_as_connecting_no_assignee():
    # Q18②: 배정됐어도 환자에겐 '직원 확인 전(connecting)'으로 보이고 담당자를 노출하지 않는다.
    assert patient_handoff_view("in_progress", "김직원", "doctor") == ("connecting", None, None)


def test_answered_reveals_assignee():
    # 직원이 답했을 때만 담당자 이름·역할을 노출한다(직원 말풍선).
    assert patient_handoff_view("answered", "김직원", "doctor") == ("answered", "김직원", "doctor")


def test_staff_reply_upgrades_in_progress_to_answered():
    # #8: 직원이 답장을 보내면 티켓 status는 in_progress에 머물지만(함수가 안 바꿈), 환자에겐
    #     '답변 도착'으로 올려 '직원 확인 전이에요' 배너가 영영 안 사라지던 버그를 막는다.
    assert patient_handoff_view("in_progress", "김직원", "doctor", has_staff_reply=True) \
        == ("answered", "김직원", "doctor")
    # 답장 전이면 그대로 connecting(대기).
    assert patient_handoff_view("in_progress", "김직원", "doctor", has_staff_reply=False) \
        == ("connecting", None, None)
