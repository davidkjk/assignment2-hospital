# 상담봇 채팅 카드의 서버 계약. 카드는 앱의 판단·상태·문구를 재현하는 표시 스냅샷이며 실행의 진실이 아니다.
# (실제 예약은 [예약 신청하기] → 환자앱 create_booking. 카드 payload를 위변조해도 서버가 재검증.)
CARD_TYPES = {
    "time_select", "booking_confirm", "booking_done",
    "cancel_confirm", "cancel_done", "cancel_reject",
    "questionnaire", "quick_replies",
}

BOOKING_CONFIRM_BUTTON = "예약 신청하기"     # auto_confirm 설정과 무관하게 고정(카탈로그 §2)
VISIT_REASON_MAX = 100                        # BOOK-WHY: 최대 100자 선택 입력(#8)


def collect_visit_reason(text: str | None) -> str:
    if not text or not text.strip():
        return ""                             # 선택 입력 — 비면 빈 값(없는 값 만들지 않음)
    return text.strip()[:VISIT_REASON_MAX]


def build_booking_confirm_card(*, for_patient_id, patient_name, relation,
                               department_name, doctor_name, slot_at, visit_reason) -> dict:
    # 여섯 항목 한 묶음 재확인(대상·과·의사·일시·방문이유·장소). 방문이유 비면 그대로 None.
    return {
        "card_type": "booking_confirm",
        "for_patient_id": for_patient_id, "patient_name": patient_name, "relation": relation,
        "department_name": department_name, "doctor_name": doctor_name, "slot_at": slot_at,
        "visit_reason": (visit_reason or None),
        "button": BOOKING_CONFIRM_BUTTON, "state": "정상",
    }


def build_time_select_card(*, candidates: list[dict], state: str = "정상") -> dict:
    # candidates는 환자앱 list_bookable_slots 결과(당일 지난 시각·마감·30분 이내 제외는 서버가 판정).
    # 0개면 state="빈" + reason + [다른 날짜 고르기](카탈로그 §1 상태2). 카드가 "가능"을 자체 확정하지 않는다.
    return {"card_type": "time_select", "candidates": candidates, "state": state}


def build_booking_done_card(*, status: str, number: str, question_count: int | None = None) -> dict:
    is_applied = status == "예약신청"
    card = {
        "card_type": "booking_done",
        "headline": "예약이 신청되었습니다" if is_applied else "예약이 확정되었습니다",
        "number_label": "신청번호" if is_applied else "예약번호",
        "number": number,
        "questionnaire_button": None, "questionnaire_note": None,
    }
    if question_count == 0:
        card["questionnaire_note"] = "작성할 문진이 없습니다"     # 0문항: 버튼·(0/0) 없음(카탈로그 §3 상태4)
    elif question_count is None or question_count >= 1:
        card["questionnaire_button"] = "사전문진 작성하기"
    return card


def build_cancel_confirm_card(*, appointment_id, target_summary) -> dict:
    # 마감 전/30분 이내만. 사유 입력·"취소" 타이핑 요구 없음. [아니요]/[취소합니다](카탈로그 §4).
    return {"card_type": "cancel_confirm", "appointment_id": appointment_id,
            "target_summary": target_summary, "buttons": ["아니요", "취소합니다"], "state": "정상"}


def build_cancel_done_card(*, cancelled_by, relation, name, at) -> dict:
    # 취소결과(카탈로그 §5): 누가·누구·언제 + [새로 예약하기]. 환자 노출 문구는 "상담 연결"만(취소 접수 표현 금지).
    return {"card_type": "cancel_done", "cancelled_by": cancelled_by, "relation": relation,
            "name": name, "at": at, "button": "새로 예약하기"}


def build_cancel_reject_card(*, reject_reason) -> dict:
    # 취소반려(카탈로그 §6): 사유 + [확인]/[다시 문의하기]. 반려도 막다른 길을 만들지 않는다.
    return {"card_type": "cancel_reject", "reject_reason": reject_reason,
            "buttons": ["확인", "다시 문의하기"]}


def build_questionnaire_card(*, state: str, answered: int, total: int,
                             appointment_id=None) -> dict:
    # 상태·서버 진행률·진입만. 문항을 대화문으로 나열하지 않는다(카탈로그 §7). 진행률은 서버값 그대로.
    return {"card_type": "questionnaire", "appointment_id": appointment_id,
            "state": state, "answered": answered, "total": total}


def validate_card_payload(payload: dict) -> None:
    ct = payload.get("card_type")
    if ct not in CARD_TYPES:
        raise ValueError(f"알 수 없는 카드 종류입니다: {ct}")
