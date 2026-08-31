from datetime import date
from uuid import UUID

from app.core.patient_security import PatientContext
from app.db.pool import acquire_as

# 종료 상태 + '예약신청'인 채 지난 예약(확정되지않음, HIST-ROW 계열 09). 예약확정+지남은 규칙 미정의라 제외.
_HISTORY_WHERE = (
    "(a.status in ('진료완료','환자취소','병원취소','예약부도') "
    " or (a.status = '예약신청' and s.slot_date < current_date))")


def _encode(slot_date, aid) -> str:
    return f"{slot_date.isoformat() if slot_date else ''}|{aid}"


def _decode(cursor: str):
    d, aid = cursor.split("|", 1)
    return (d or None), aid


async def list_visit_history(patient: PatientContext, for_patient_id: UUID,
                             cursor: str | None = None, limit: int = 20) -> dict:
    params = [for_patient_id]
    keyset = ""
    if cursor:
        cdate, cid = _decode(cursor)
        # cdate는 커서 문자열이라 date로 되돌린다($2::date에 asyncpg가 date 객체를 요구).
        params += [date.fromisoformat(cdate) if cdate else None, cid]
        # (slot_date, id) 내림차순 keyset. 안정 동점키 = id(HIST-LIST 안정정렬).
        keyset = "and (s.slot_date, a.id) < ($2::date, $3::uuid) "
    params.append(limit + 1)  # 다음 페이지 존재 여부 판정용 +1
    async with acquire_as(str(patient.auth_user_id)) as conn:  # RLS가 소유 필터
        rows = await conn.fetch(
            "select a.id, a.status, s.slot_date, d.name as department_name, st.name as doctor_name, "
            "  n.patient_visible_notes, "
            "  a.cancelled_by, a.cancelled_by_relation, a.cancelled_by_name, a.cancelled_at, "  # 갭 #11 이력분(HIST-ROW-02·03)
            "  (a.account_patient_id = a.for_patient_id) as is_self, "                           # HIST-ROW-02 본인/가족 갈래
            "  case a.status when '진료완료' then '진료완료' "
            "       when '환자취소' then '취소됨' when '병원취소' then '취소됨' "
            "       when '예약부도' then '방문하지않음' else '확정되지않음' end as visit_status, "
            "  exists (select 1 from questionnaire_responses q where q.appointment_id=a.id) as has_questionnaire "
            "from appointments a "
            "join departments d on d.id=a.department_id "
            "join staff st on st.id=a.doctor_id "
            "left join appointment_slots s on s.id=a.slot_id "
            "left join patient_medical_notes n on n.appointment_id=a.id "
            f"where a.for_patient_id = $1 and {_HISTORY_WHERE} {keyset}"
            "order by s.slot_date desc nulls last, a.id desc "
            f"limit ${len(params)}", *params)
    items = [dict(r) for r in rows]
    next_cursor = None
    if len(items) > limit:                       # +1이 잡혔으면 다음 페이지가 있다
        items = items[:limit]
        last = items[-1]
        next_cursor = _encode(last["slot_date"], str(last["id"]))
    return {"items": items, "next_cursor": next_cursor}
