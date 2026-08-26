"""[STAT-METRIC][STAT-SCOPE-03][STAT-DRILL][STAT-AUDIT][STAT-MASK-01] 집계·드릴다운·감사.

⭐ 결정5: 지표마다 기준일이 다르고 이름(basis)에 드러난다 — 기준이 다른 지표를 한 날짜
   사건으로 합치면 숫자가 조용히 틀린다. 결정21: 서버는 소수 억제를 하지 않는다(k=5는 CSV
   전용, Task 12). 결정22: 집계 표 조회는 감사 행을 만들지 않고 드릴다운·CSV만 남긴다.
"""
from datetime import date

from app.core.dto import patient_row_dto
from app.core.pagination import Page, paginate
from app.core.security import StaffContext
from app.db.pool import acquire_as
from app.services import audit_service

_KST_DATE = "at time zone 'Asia/Seoul'"
_CANCEL_STATUSES = ("환자취소", "병원취소")


async def _dispatch(staff: StaffContext, conn, fn):
    if conn is not None:
        return await fn(conn)
    async with acquire_as(str(staff.auth_user_id)) as c:
        return await fn(c)


async def get_stats(from_date: date, to_date: date, staff: StaffContext, by: str | None = None, *, conn=None) -> dict:
    """운영 지표 묶음. by가 주어지면 진료과·의사별 표(표시명만, UUID 미노출)를 대신 준다.

    ⚠️ 감사 행을 만들지 않는다(STAT-AUDIT-01·결정22) — 특정 환자 겨냥 열람이 아니다."""
    if by in ("doctor", "department"):
        return await _get_stats_by(from_date, to_date, staff, by, conn)

    async def _run(c):
        source_rows = await c.fetch(
            f"""
            select source, count(*) as n from appointments
            where (created_at {_KST_DATE})::date between $1 and $2
            group by source
            """,
            from_date, to_date,
        )
        cancelled = await c.fetchval(
            f"""
            select count(*) from appointment_status_history
            where to_status = any($3::text[]) and from_status is distinct from to_status
              and (changed_at {_KST_DATE})::date between $1 and $2
            """,
            from_date, to_date, list(_CANCEL_STATUSES),
        )
        no_show = await c.fetchval(
            f"""
            select count(*) from appointment_status_history
            where to_status = '예약부도' and from_status is distinct from to_status
              and (changed_at {_KST_DATE})::date between $1 and $2
            """,
            from_date, to_date,
        )
        visits = await c.fetchval(
            f"""
            select count(*) from appointment_status_history
            where to_status = '진료완료' and from_status is distinct from to_status
              and (changed_at {_KST_DATE})::date between $1 and $2
            """,
            from_date, to_date,
        )
        hour_rows = await c.fetch(
            f"""
            select s.start_time, (s.id is null) as no_slot
            from appointments a
            left join appointment_slots s on s.id = a.slot_id
            where a.status = '진료완료'
              and coalesce(s.slot_date, (a.created_at {_KST_DATE})::date) between $1 and $2
            """,
            from_date, to_date,
        )
        return source_rows, cancelled, no_show, visits, hour_rows

    source_rows, cancelled, no_show, visits, hour_rows = await _dispatch(staff, conn, _run)

    source_mix = {"app": 0, "staff": 0, "chatbot": 0}
    for r in source_rows:
        if r["source"] in source_mix:
            source_mix[r["source"]] += r["n"]

    unknown_time = 0
    by_hour: dict[int, int] = {}
    for r in hour_rows:
        if r["no_slot"]:
            unknown_time += 1
        else:
            hour = r["start_time"].hour
            by_hour[hour] = by_hour.get(hour, 0) + 1

    return {
        "source_mix": {"basis": "created_at", "rows": source_mix, "total": sum(source_mix.values())},
        "cancelled": {"basis": "status_changed_at", "value": cancelled},
        "no_show": {"basis": "status_changed_at", "value": no_show},
        "visits": {"basis": "status_changed_at", "value": visits},
        "visits_by_hour": {"basis": "slot_start_time", "by_hour": by_hour, "unknown_time": unknown_time},
        # STAT-METRIC-06: 4단계 계약이 없다 — 0으로 위장하지 않는다(None).
        "bot": None,
    }


async def _get_stats_by(from_date: date, to_date: date, staff: StaffContext, by: str, conn) -> dict:
    """[STAT-METRIC-02] 진료과·의사별 예약 현황. 이름은 표시명으로, UUID는 안 나간다."""
    group = "st.name" if by == "doctor" else "d.name"
    join = ("join staff st on st.id = a.doctor_id" if by == "doctor"
            else "join departments d on d.id = a.department_id")

    async def _run(c):
        return await c.fetch(
            f"""
            select {group} as label, count(*) as value
            from appointments a
            {join}
            where (a.created_at {_KST_DATE})::date between $1 and $2
            group by {group}
            order by value desc, label
            """,
            from_date, to_date,
        )

    fetched = await _dispatch(staff, conn, _run)
    return {"by": by, "rows": [{"label": r["label"], "value": r["value"]} for r in fetched]}


async def get_stats_detail(metric: str, from_date: date, to_date: date, staff: StaffContext, *, cursor=None, conn=None) -> Page:
    """[STAT-DRILL-01·02] 드릴다운 명단 — 마스킹된 값만(원본은 응답에 아예 없다).

    ⚠️ 통계 감사는 조회 성공 뒤에 남긴다 — 권한 거절·기간 오류로 아무것도 못 본 요청까지
       stats_drilldown으로 남기면 기록장이 "열어봤다"고 거짓 증언한다."""
    if metric == "cancelled":
        statuses = list(_CANCEL_STATUSES)
    elif metric == "no_show":
        statuses = ["예약부도"]
    elif metric == "visits":
        statuses = ["진료완료"]
    else:
        statuses = [metric]

    async def _run(c):
        return await c.fetch(
            f"""
            select distinct a.id, a.for_patient_id, p.name, p.phone, p.birth_date,
                   h.changed_at as occurred_at
            from appointment_status_history h
            join appointments a on a.id = h.appointment_id
            join patients p on p.id = a.for_patient_id
            where h.to_status = any($3::text[]) and h.from_status is distinct from h.to_status
              and (h.changed_at {_KST_DATE})::date between $1 and $2
            """,
            from_date, to_date, statuses,
        )

    fetched = await _dispatch(staff, conn, _run)
    rows = [
        patient_row_dto(
            patient_id=r["for_patient_id"], name=r["name"], phone=r["phone"], birth_date=r["birth_date"],
            id=r["id"], occurred_at=r["occurred_at"],
        )
        for r in fetched
    ]
    page = paginate(rows, cursor=cursor, order="occurred_at desc")

    # 조회 성공 뒤에 감사(환자 없는 관리자 활동 행).
    await _dispatch(staff, conn, lambda c: audit_service.log_stats_drilldown(staff, conn=c))
    return page


async def log_stats_export(staff: StaffContext, *, metric: str, rows: int, suppressed: bool, conn=None) -> None:
    """[ALOG-LIST-13] CSV 내보내기 감사(환자 없는 행). 실제 저장은 audit_service가 한다."""
    await audit_service.log_stats_export(
        staff, metric=metric, rows=rows, suppressed=suppressed, conn=conn
    )
