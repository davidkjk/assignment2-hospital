from uuid import UUID

from app.core.patient_security import PatientContext
from app.db.pool import acquire_as

# support_requested_at·request_type(④ 00010)로 폐기된 cancellation_requested_at을 대체한다.
_LIVE = "('환자취소','병원취소','예약부도')"


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
            "  exists (select 1 from questionnaire_responses q where q.appointment_id=a.id) as has_questionnaire "
            "from appointments a "
            "join patients p on p.id=a.for_patient_id "
            "join departments d on d.id=a.department_id "
            "join staff st on st.id=a.doctor_id "
            "left join appointment_slots s on s.id=a.slot_id "
            "left join patient_family_links fl "
            "  on fl.family_patient_id=a.for_patient_id and fl.account_patient_id=$1 and fl.is_active "
            # CARD-CXL-05·06: 홈은 「오늘」 취소·부도 카드를 자정까지 붙잡는다(예약 목록 탭 LIST-ST-21과 별개 — 홈 전용 창구).
            f"where (a.status not in {_LIVE} or s.slot_date = current_date) "
            "  and (s.slot_date is null or s.slot_date >= current_date) "
            "order by s.slot_date nulls last, s.start_time nulls last", patient.id)
    return [dict(r) for r in rows]


async def get_appointment_detail(patient: PatientContext, appointment_id: UUID) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select a.id, a.status, a.support_requested_at, a.request_type, a.updated_at, a.queue_position, "
            "  a.doctor_id, a.booking_code, a.booking_code_expires_at, a.reason, "  # 갭 #49 — APPT-INFO-03(방문이유)
            "  a.hospital_change_prev_time, a.hospital_change_kind, "  # CARD-CHG(직원웹 T2가 채움·환자 [확인]이 비움)
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
            "  s.slot_date, s.start_time "
            "from appointments a "
            "join patients p on p.id=a.for_patient_id "
            "join departments d on d.id=a.department_id "
            "join staff st on st.id=a.doctor_id "
            "left join appointment_slots s on s.id=a.slot_id "
            "left join patient_family_links fl "
            "  on fl.family_patient_id=a.for_patient_id and fl.account_patient_id=$2 and fl.is_active "
            "where a.id=$1", appointment_id, patient.id)
    return dict(row) if row else {}


async def get_queue_status(patient: PatientContext, appointment_id: UUID) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow("select * from patient_wait_estimate($1)", appointment_id)
    return {"patients_ahead": row["patients_ahead"] or 0,
            "estimated_wait_minutes": row["estimated_wait_minutes"]}  # None이면 화면은 인원만
