from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as

# [SET-NOTI-04] 7토글 = 2묶음. 각 토글이 덮는 notification_type(T9 MESSAGES와 일치, 서버 한 곳).
#   예약에 관한 알림: 변경·취소 / 신청·확정 / 전날·당일
#   그 밖의 알림:     사전문진 안내 / 진료 후 안내 / 상담 답변 / 가족 연결
# ⚠️ support_answered(4단계 챗봇)는 아직 MESSAGES에 없는 「예정 종류」다 — 토글을 미리 두어야
#    그 기능이 그 이름으로 notify_patient를 부를 때 이 선호가 이미 걸린다(HANDOVERS 등록).
#    (questionnaire_partial·family_linked는 이제 MESSAGES에 들어와 실제 발송 종류가 됐다.)
#    지금 발송되는 종류는 전부 정확히 한 토글씩에 든다.
TOGGLE_GROUPS: dict[str, list[str]] = {
    # ── 예약에 관한 알림 ──
    "appt_change":   ["changed", "hospital_cancelled", "cancellation_approved", "cancellation_rejected"],
    "appt_status":   ["requested", "confirmed"],
    "appt_reminder": ["reminder_day_before", "reminder_today"],
    # ── 그 밖의 알림 ──
    "questionnaire": ["questionnaire_missing", "questionnaire_partial"],
    "visit_note":    ["visit_completed"],
    "support_reply": ["support_answered"],  # 4단계 챗봇 예정
    "family":        ["family_linked"],     # 직원 대행 가족 연결 통보(배포 T7E · SET-NOTI-01: 끌 수 있어야)
}
# 종류 → 토글(역인덱스). GET에서 저장된 off 행을 토글로 접을 때 쓴다.
_TYPE_TO_GROUP = {t: g for g, types in TOGGLE_GROUPS.items() for t in types}


async def get_prefs(patient: PatientContext) -> dict[str, bool]:
    """[SET-NOTI-01] 6토글 상태. 줄이 없으면 켜짐(00012 기본). 그룹 안 종류는 늘 함께 쓰이므로 일치한다."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select notification_type, enabled from notification_preferences where patient_id=$1",
            patient.id)
    result = {g: True for g in TOGGLE_GROUPS}                 # 기본 전부 켜짐
    for r in rows:
        g = _TYPE_TO_GROUP.get(r["notification_type"])
        if g is not None and not r["enabled"]:
            result[g] = False                                # 그룹 안 하나라도 off면 토글 off
    return result


async def set_pref(patient: PatientContext, group: str, enabled: bool) -> dict[str, bool]:
    """[SET-NOTI-12] 토글 하나 = 그 그룹의 모든 종류를 upsert. 즉시 저장(호출측이 [저장] 버튼을 안 둔다)."""
    if group not in TOGGLE_GROUPS:
        raise AppError("unknown_notification_group", status_code=400)  # [SET-NOTI-12] 화면에 없는 키 거부
    async with acquire_as(str(patient.auth_user_id)) as conn:
        async with conn.transaction():
            for ntype in TOGGLE_GROUPS[group]:
                await conn.execute(
                    "insert into notification_preferences (patient_id, notification_type, enabled) "
                    "values ($1,$2,$3) "
                    "on conflict (patient_id, notification_type) do update set enabled=excluded.enabled",
                    patient.id, ntype, enabled)
    return await get_prefs(patient)
