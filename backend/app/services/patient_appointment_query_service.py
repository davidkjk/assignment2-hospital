from uuid import UUID

from app.core.patient_security import PatientContext
from app.db.pool import acquire_as
from app.services.patient_questionnaire_service import compute_progress, _load  # ⭐ 같은 함수 = 같은 숫자(QNR-PROG-04)

# support_requested_at·request_type(④ 00010)로 폐기된 cancellation_requested_at을 대체한다.
_LIVE = "('환자취소','병원취소','예약부도')"

# QNR-PROG-07·09: 홈 줄·상세가 쓸 문진 상태·진행률. 조인 원재료는 밑줄(_qnr_*)로 받아 응답에서 뺀다.
_QNR_JOIN = (
    "  qr.answers as _qnr_answers, qr.completed_at as _qnr_completed_at, "
    "  qt.questions as _qnr_questions, p.gender as _qnr_gender "
)
_QNR_FROM = (
    "left join questionnaire_responses qr on qr.appointment_id = a.id "
    # 양식은 진료과당 1개(00008 유니크) → 행이 불어나지 않는다.
    "left join questionnaire_templates qt on qt.department_id = a.department_id "
)


def _qnr_fields(row: dict) -> dict:
    """QNR-PROG-07·09: 홈 줄이 쓸 상태·진행률. 갭 #50 — 행 존재가 아니라 completed_at으로 갈린다."""
    questions = _load(row.get("_qnr_questions") or [])
    answers = _load(row.get("_qnr_answers") or [])
    prog = compute_progress(questions, row.get("_qnr_gender") or "", answers)
    if row.get("_qnr_answers") is None:
        state = "미작성"  # 행 없음
    elif row.get("_qnr_completed_at") is not None:
        state = "작성완료"  # [제출하기]를 누른 것만(QNR-STATE-04)
    else:
        state = "작성 중"  # ⭐ 1문항만 쓴 사람이 여기 — 갭 #50이 닫힌다
    return {"questionnaire_state": state,
            "questionnaire_answered": prog["answered"], "questionnaire_total": prog["total"]}


def _strip_private(d: dict) -> dict:
    """밑줄로 시작하는 조인 원재료(_qnr_*)는 응답에서 뺀다 — 화면은 3필드만 본다."""
    return {k: v for k, v in d.items() if not k.startswith("_")}


async def list_my_appointments(patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:  # RLS가 본인+가족만 거른다
        rows = await conn.fetch(
            "select a.id, a.status, a.support_requested_at, a.request_type, a.updated_at, "
            "  a.booking_code, a.booking_code_expires_at, "
            "  a.hospital_change_prev_time, a.hospital_change_kind, "  # CARD-CHG(직원웹 T2가 채움·환자 [확인]이 비움)
            "  a.cancelled_by, a.cancelled_by_relation, a.cancelled_by_name, a.cancelled_at, "  # CARD-CXL-09(갭 #11): 화면 3갈래(병원/가족/본인)가 성립하려면 주체+시각이 필요
            "  (a.for_patient_id = $1) as is_self, "  # HOME-CARD-03: 본인 카드 먼저 · 제목 관계 표시
            "  case when a.for_patient_id = $1 then '본인' else coalesce(fl.relation, '가족') end as relation, "  # CARD-COMMON-01: 이름 · 관계(예: '어머니')
            "  p.name as for_patient_name, d.name as department_name, st.name as doctor_name, "
            "  s.slot_date, s.start_time, "
            "  exists (select 1 from questionnaire_responses q where q.appointment_id=a.id) as has_questionnaire, "
            + _QNR_JOIN +  # QNR-PROG-07·09: 상태·진행률 3필드의 원재료
            "from appointments a "
            "join patients p on p.id=a.for_patient_id "
            "join departments d on d.id=a.department_id "
            "join staff st on st.id=a.doctor_id "
            "left join appointment_slots s on s.id=a.slot_id "
            + _QNR_FROM +
            "left join patient_family_links fl "
            "  on fl.family_patient_id=a.for_patient_id and fl.account_patient_id=$1 and fl.is_active "
            # CARD-CXL-05·06: 홈은 「오늘」 취소·부도 카드를 자정까지 붙잡는다(예약 목록 탭 LIST-ST-21과 별개 — 홈 전용 창구).
            f"where (a.status not in {_LIVE} or s.slot_date = current_date) "
            "  and (s.slot_date is null or s.slot_date >= current_date) "
            # LIST-LIST-02·03(갭 #76): 같은 날 같은 시각이면 본인 → 가족 → 이름 순으로 고정한다
            # (없으면 새로고침마다 두 줄이 뒤바뀐다). 홈은 selectHomeDay가 재정렬하므로 무해.
            "order by s.slot_date nulls last, s.start_time nulls last, "
            "  (a.for_patient_id = $1) desc, p.name", patient.id)
    # 갭 #50: has_questionnaire(행 존재)는 남기되, 화면은 questionnaire_state(completed_at 판정)를 쓴다.
    return [{**_strip_private(dict(r)), **_qnr_fields(dict(r))} for r in rows]


async def get_appointment_detail(patient: PatientContext, appointment_id: UUID) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select a.id, a.status, a.support_requested_at, a.request_type, a.updated_at, a.created_at, a.queue_position, "
            "  a.for_patient_id, "  # NAV-HIST-05(환자앱 T27b): 알림 딥링크가 소유자 칩을 찾는다
            "  a.doctor_id, a.department_id, a.booking_code, a.booking_code_expires_at, a.reason, "  # 갭 #49 — APPT-INFO-03(방문이유) · doctor_id·department_id·created_at는 변경 마법사(T22)가 소비(마감·30분 유예 판정)
            "  a.hospital_change_prev_time, a.hospital_change_kind, "  # CARD-CHG(직원웹 T2가 채움·환자 [확인]이 비움)
            "  a.cancel_rejected_at, a.cancel_rejected_reason, "  # CANCEL-REJ(직원웹 반려가 채움·환자 [확인]이 비움, 00027)
            "  get_cancellation_deadline_hours() as cancellation_deadline_hours, "  # CANCEL-LATE-02 — 마감 N시간 문구(환자 세션은 hospital_settings 못 읽어 definer 창구)
            "  a.cancelled_by, a.cancelled_by_relation, a.cancelled_by_name, a.cancelled_at, "  # CARD-CXL-09(갭 #11)
            # APPT-QNR — 완료 문진 유무 + 진료 진입 여부로 문진 줄 상태를 서버가 정한다(none/writable/readonly).
            "  case "
            "    when not exists (select 1 from questionnaire_responses q "
            "                     where q.appointment_id=a.id and q.completed_at is not null) then 'none' "
            "    when a.status in ('진료중','진료완료','환자취소','병원취소') then 'readonly' "
            "    else 'writable' end as questionnaire_status, "
            "  (a.for_patient_id = $2) as is_self, "
            "  case when a.for_patient_id = $2 then '본인' else coalesce(fl.relation, '가족') end as relation, "
            "  p.name as for_patient_name, d.name as department_name, st.name as doctor_name, "
            "  s.slot_date, s.start_time, "
            + _QNR_JOIN +  # QNR-PROG-07·09: 상세도 진행률 3필드를 소급으로 싣는다
            "from appointments a "
            "join patients p on p.id=a.for_patient_id "
            "join departments d on d.id=a.department_id "
            "join staff st on st.id=a.doctor_id "
            "left join appointment_slots s on s.id=a.slot_id "
            + _QNR_FROM +
            "left join patient_family_links fl "
            "  on fl.family_patient_id=a.for_patient_id and fl.account_patient_id=$2 and fl.is_active "
            "where a.id=$1", appointment_id, patient.id)
    if not row:
        return {}
    return {**_strip_private(dict(row)), **_qnr_fields(dict(row))}


async def get_queue_status(patient: PatientContext, appointment_id: UUID) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow("select * from patient_wait_estimate($1)", appointment_id)
    return {"patients_ahead": row["patients_ahead"] or 0,
            "estimated_wait_minutes": row["estimated_wait_minutes"]}  # None이면 화면은 인원만
