# 상담봇 채팅 카드의 서버 계약. 카드는 앱의 판단·상태·문구를 재현하는 표시 스냅샷이며 실행의 진실이 아니다.
# (실제 예약은 [예약 신청하기] → 환자앱 create_booking. 카드 payload를 위변조해도 서버가 재검증.)
CARD_TYPES = {
    "time_select", "booking_confirm", "booking_done",
    "cancel_confirm", "cancel_done", "cancel_reject",
    "questionnaire", "quick_replies",
    "department_select", "doctor_select", "date_select", "target_select",  # 예약 앞흐름(WEBCARD-DEPT/DOC/DATE/TARGET)
    "open_booking_wizard",   # 앱 AI 상담(patient/app): 대화 내 예약 대신 예약 마법사로 인계(사용자 결정 B)
}

BOOKING_CONFIRM_BUTTON = "예약 신청하기"     # auto_confirm 설정과 무관하게 고정(카탈로그 §2)
VISIT_REASON_MAX = 100                        # BOOK-WHY: 최대 100자 선택 입력(#8)
DEPT_GUIDE_CHIP = "잘 모르겠어요 · 증상으로 찾기"   # [WEBCARD-DEPT-01] 하이브리드(결정 ①)


def collect_visit_reason(text: str | None) -> str:
    if not text or not text.strip():
        return ""                             # 선택 입력 — 비면 빈 값(없는 값 만들지 않음)
    return text.strip()[:VISIT_REASON_MAX]


def build_booking_confirm_card(*, for_patient_id, patient_name, relation,
                               department_name, doctor_name, slot_at, visit_reason,
                               department_id=None, doctor_id=None, slot_id=None,
                               state: str = "정상") -> dict:
    # 여섯 항목 한 묶음 재확인(대상·과·의사·일시·방문이유·장소). 방문이유 비면 그대로 None.
    # department_id·doctor_id·slot_id는 화면엔 안 보이지만 execute가 재검증·실행에 쓴다(위변조해도 서버가 재검증).
    return {
        "card_type": "booking_confirm",
        "for_patient_id": for_patient_id, "patient_name": patient_name, "relation": relation,
        "department_name": department_name, "doctor_name": doctor_name, "slot_at": slot_at,
        "visit_reason": (visit_reason or None),
        "department_id": department_id, "doctor_id": doctor_id, "slot_id": slot_id,
        "button": BOOKING_CONFIRM_BUTTON, "state": state,
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


def build_cancel_confirm_card(*, appointment_id, target_summary, updated_at=None) -> dict:
    # 마감 전/30분 이내만. 사유 입력·"취소" 타이핑 요구 없음. [아니요]/[취소합니다](카탈로그 §4).
    # updated_at은 화면 비노출 — execute가 APPT-RACE-01 낙관적 잠금(그 사이 병원·가족이 먼저 바꿨나)에 쓴다.
    return {"card_type": "cancel_confirm", "appointment_id": appointment_id,
            "target_summary": target_summary, "updated_at": updated_at,
            "buttons": ["아니요", "취소합니다"], "state": "정상"}


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


def build_quick_replies_card(*, replies: list[str], handoff_chip: str | None = None) -> dict:
    # 빠른답변 묶음(WEBCARD-QUICK). no_answer 안내에선 FAQ 칩(텍스트 전송) + [직원에게 연결] 콜백 칩(handoff_chip)을
    # 함께 낸다 — 봇이 답을 못 찾아도 자동 인계·자동 티켓을 만들지 않고, 인계는 사용자가 칩을 눌러야 시작한다(WEBCHAT-NOANS).
    # options 키는 프론트(웹 QuickReplies·앱 chat_quick_replies)가 읽는 계약 이름. handoff_chip 없으면 None(시작 칩 등).
    return {"card_type": "quick_replies", "options": replies, "handoff_chip": handoff_chip, "state": "정상"}


def build_department_select_card(*, departments: list[dict], allow_symptom_guide: bool = True) -> dict:
    # [WEBCARD-DEPT-01] 진료과 버튼 카드 + (선택)증상으로 찾기 칩. 선택값은 다음 카드 payload가 누적한다(서버 무상태).
    return {"card_type": "department_select",
            "departments": [{"id": str(d["id"]), "name": d["name"]} for d in departments],
            "guide_chip": DEPT_GUIDE_CHIP if allow_symptom_guide else None, "state": "정상"}


def build_doctor_select_card(*, department_id: str, department_name: str, doctors: list[dict]) -> dict:
    # [WEBCARD-DOC-01] 의사가 1명이어도 항상 표시(결정 ②). 0명이면 빈(막다른 길 문구는 프론트가 렌더).
    return {"card_type": "doctor_select", "department_id": str(department_id), "department_name": department_name,
            "doctors": [{"id": str(d["id"]), "name": d["name"], "specialty": d.get("specialty"),
                         "schedule_summary": d.get("schedule_summary")} for d in doctors],
            "state": "정상" if doctors else "빈"}


def build_date_select_card(*, department_id: str, doctor_id: str, doctor_name: str, dates: list[dict]) -> dict:
    # [WEBCARD-DATE-01] 예약 가능 날짜 버튼. dates=[{date, label}]. 0일이면 빈(다른 의사 경로는 프론트).
    return {"card_type": "date_select", "department_id": str(department_id), "doctor_id": str(doctor_id),
            "doctor_name": doctor_name, "dates": list(dates), "state": "정상" if dates else "빈"}


def build_target_select_card(*, department_id: str, doctor_id: str, slot_id: str, slot_at: str,
                             targets: list[dict]) -> dict:
    # [WEBCARD-TARGET-01] 로그인 후 대상 선택(본인/가족) + 앞 선택값(dep·doc·slot) 누적(payload가 상태를 나른다).
    return {"card_type": "target_select", "department_id": str(department_id), "doctor_id": str(doctor_id),
            "slot_id": str(slot_id), "slot_at": slot_at,
            "targets": [{"for_patient_id": str(t["for_patient_id"]), "name": t["name"],
                         "relation": t.get("relation")} for t in targets], "state": "정상"}


OPEN_WIZARD_BUTTON = "예약하러 가기"   # 앱 카드 버튼(앱이 렌더·네비게이션 소유)


def build_open_booking_wizard_card(*, department_id=None, department_name=None) -> dict:
    # [BOOK-BOT-WIZARD] 앱 AI 상담(patient/app)은 대화 안에서 예약하지 않는다(사용자 결정 B) — 예약 마법사로 인계.
    # 추천 진료과가 있으면 실어 앱이 마법사 2단계를 미리 선택한다(선택 프리필). 앱 렌더·이동은 patient-app 트랙 소유.
    return {"card_type": "open_booking_wizard",
            "department_id": str(department_id) if department_id else None,
            "department_name": department_name,
            "button": OPEN_WIZARD_BUTTON}


def validate_card_payload(payload: dict) -> None:
    ct = payload.get("card_type")
    if ct not in CARD_TYPES:
        raise ValueError(f"알 수 없는 카드 종류입니다: {ct}")
