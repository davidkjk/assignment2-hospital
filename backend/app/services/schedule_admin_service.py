"""진료과 CRUD · 주간 규칙 일괄 저장 · 병원 휴무·의사 예외 저장 (Task 17).

⭐ save_week_rules는 전부 되거나 전부 안 되거나다(갭 #95). 일곱 줄 중 넷째에서 실패하면
   셋만 저장된 채로 남으면 안 된다 — 관리자는 「저장했다」고 믿고, 어긋난 것은 예약이 들어온
   뒤에 드러난다. 그래서 모든 줄을 먼저 검증하고(하나라도 나쁘면 쓰기 전에 거절), 쓰기는
   한 트랜잭션으로 묶는다.

⭐ list_week_rules는 늘 7행을 준다(SCHED-WEEK-02). 규칙이 없는 요일은 is_day_off=True 빈 줄로
   서버가 채운다 — 화면이 빈 줄을 지어내면 「한 요일만 낡은 값」을 비교로 발견한다는 근거가 무너진다.

⭐ 진료과 사용 중지(SCHED-DEPT-04): 활성 의사가 있으면 막고 /admin/staff로 보낸다.
   끄는 것은 예약을 아무것도 막지 못하기 때문이다(예약 트리거는 departments.is_active를 안 본다).
"""
from __future__ import annotations

from datetime import date, time
from uuid import UUID

from app.core.errors import AppError
from app.services.department_service import list_departments  # noqa: F401 (재노출)
from app.services.opening_hours import _staff_id

WEEKDAYS = tuple(range(7))   # Python date.weekday(): 월=0 … 일=6


# ══ 진료과 CRUD ══════════════════════════════════════════════════════
# ⛔ delete_department는 두지 않는다(SCHED-DEPT-02) — 지운 진료과를 참조하는 지난 예약·
#    문진표가 통째로 깨진다(appointments.department_id·questionnaire_templates.department_id 둘 다 not null).

async def create_department(conn, name: str, staff=None) -> UUID:
    return await conn.fetchval(
        "insert into departments (name) values ($1) returning id", name
    )


async def rename_department(conn, dept_id: UUID, name: str, staff=None) -> None:
    """[SCHED-DEPT-11] 참조이지 복사가 아니다 — 이름 한 줄만 바꾸면 지난 예약에도 반영된다."""
    await conn.execute("update departments set name = $2 where id = $1", dept_id, name)


async def deactivate_department(conn, dept_id: UUID, staff=None) -> None:
    """[SCHED-DEPT-03][SCHED-DEPT-04] 활성 의사가 있으면 막고 갈 길(/admin/staff)을 준다.

    ⛔ affected_appointments 인자를 두지 않는다(SCHED-DEPT-06) — 의사를 끄면 그 의사에게는
       예약이 만들어지지 않으므로(같은 트리거), 진료과 쪽에 경고 장치를 하나 더 만들 이유가 없다.
    """
    active_doctors = await conn.fetch(
        "select name from staff where department_id = $1 and role = 'doctor' and is_active order by name",
        dept_id,
    )
    if active_doctors:
        names = [row["name"] for row in active_doctors]
        raise AppError(
            "이 진료과에 진료 중인 의사가 있어 사용을 중지할 수 없습니다. "
            "먼저 의사를 다른 과로 옮기거나 사용 중지해 주세요.",
            detail={"active_doctors": names, "next": "/admin/staff"},
        )
    await conn.execute("update departments set is_active = false where id = $1", dept_id)


async def reactivate_department(conn, dept_id: UUID, staff=None) -> None:
    """[SCHED-DEPT-05] 끌 수 없는 스위치를 두지 않는다 — 되살리기 경로."""
    await conn.execute("update departments set is_active = true where id = $1", dept_id)


# ══ 주간 규칙 ════════════════════════════════════════════════════════

def _pick(row: dict, *keys, default=None):
    for key in keys:
        if key in row and row[key] is not None:
            return row[key]
    return default


def _normalise_row(row: dict) -> dict:
    return {
        "weekday": row.get("weekday"),
        "is_day_off": bool(row.get("is_day_off", False)),
        "start": _pick(row, "start", "start_time"),
        "end": _pick(row, "end", "end_time"),
        "slot_minutes": _pick(row, "slot_minutes", "slot_duration_minutes"),
        "lunch_start": row.get("lunch_start"),
        "lunch_end": row.get("lunch_end"),
        "max_daily": _pick(row, "max_daily", "max_daily_appointments"),
        "booking_deadline": row.get("booking_deadline"),
    }


def _validate_row(r: dict) -> None:
    if r["weekday"] not in WEEKDAYS:
        raise AppError("요일이 올바르지 않습니다.")
    if r["is_day_off"]:
        return   # 쉬는 날은 진료시간 값을 요구하지 않는다(판정기·재생성이 건너뛴다).
    if r["start"] is None or r["end"] is None:
        raise AppError("진료 시작·종료 시간을 정해 주세요.")
    if r["end"] <= r["start"]:
        raise AppError("진료 종료 시간이 시작 시간보다 이릅니다.")
    if r["slot_minutes"] is None or r["slot_minutes"] <= 0:
        raise AppError("한 칸 길이를 정해 주세요.")
    if r["max_daily"] is None:
        raise AppError("하루 최대 예약 수를 정해 주세요.")
    ls, le = r["lunch_start"], r["lunch_end"]
    if (ls is None) != (le is None):
        raise AppError("점심시간은 시작과 끝을 함께 정해야 합니다.")
    if ls is not None:
        if le <= ls:
            raise AppError("점심 종료 시간이 시작 시간보다 이릅니다.")
        if ls < r["start"] or le > r["end"]:
            raise AppError("점심시간이 진료시간 밖에 있습니다.")


async def save_week_rules(conn, doctor_id: UUID, rows: list[dict], staff=None) -> dict:
    """여섯 칸+요일 줄들을 원자로 저장한다(전부 되거나 전부 안 되거나, 갭 #95)."""
    normed = [_normalise_row(row) for row in rows]
    for r in normed:
        _validate_row(r)   # ⭐ 모든 줄을 먼저 검증 — 하나라도 나쁘면 쓰기 전에 거절한다.

    async with conn.transaction():
        for r in normed:
            # 쉬는 날 줄도 NOT NULL 칸(start/end/slot/max_daily)을 채워야 하므로 중립값을 넣는다.
            # 이 값들은 is_day_off=True인 동안 판정기·재생성이 읽지 않는다(둘 다 먼저 닫힘으로 답한다).
            start = r["start"] or time(9)
            end = r["end"] or time(18)
            slot = r["slot_minutes"] or 30
            max_daily = r["max_daily"] if r["max_daily"] is not None else 0
            await conn.execute(
                """
                insert into doctor_schedule_rules
                  (doctor_id, weekday, start_time, end_time, slot_duration_minutes,
                   lunch_start, lunch_end, max_daily_appointments, booking_deadline, is_day_off)
                values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                on conflict (doctor_id, weekday) do update set
                  start_time = excluded.start_time,
                  end_time = excluded.end_time,
                  slot_duration_minutes = excluded.slot_duration_minutes,
                  lunch_start = excluded.lunch_start,
                  lunch_end = excluded.lunch_end,
                  max_daily_appointments = excluded.max_daily_appointments,
                  booking_deadline = excluded.booking_deadline,
                  is_day_off = excluded.is_day_off
                """,
                doctor_id, r["weekday"], start, end, slot,
                r["lunch_start"], r["lunch_end"], max_daily, r["booking_deadline"],
                r["is_day_off"],
            )
    return {"saved": len(normed)}


def _empty_week_row(weekday: int) -> dict:
    return {
        "weekday": weekday, "is_day_off": True, "start": None, "end": None,
        "slot_minutes": None, "lunch_start": None, "lunch_end": None,
        "max_daily": None, "booking_deadline": None,
    }


async def list_week_rules(conn, doctor_id: UUID) -> list[dict]:
    """[SCHED-WEEK-02] 요일 0~6이 늘 일곱 줄 다 온다. 없는 요일은 쉬는 날 빈 줄로 채워 온다."""
    rows = await conn.fetch(
        """
        select weekday, is_day_off, start_time, end_time, slot_duration_minutes,
               lunch_start, lunch_end, max_daily_appointments, booking_deadline
        from doctor_schedule_rules
        where doctor_id = $1
        """,
        doctor_id,
    )
    by_weekday = {row["weekday"]: row for row in rows}
    result = []
    for weekday in range(7):
        row = by_weekday.get(weekday)
        if row is None:
            result.append(_empty_week_row(weekday))
        else:
            result.append({
                "weekday": weekday,
                "is_day_off": row["is_day_off"],
                "start": row["start_time"],
                "end": row["end_time"],
                "slot_minutes": row["slot_duration_minutes"],
                "lunch_start": row["lunch_start"],
                "lunch_end": row["lunch_end"],
                "max_daily": row["max_daily_appointments"],
                "booking_deadline": row["booking_deadline"],
            })
    return result


async def copy_monday_to_rest(conn, doctor_id: UUID, staff=None) -> None:
    """[SCHED-WEEK-07] 월요일(weekday=0) 값을 나머지 요일에 복사한다.

    ⛔ 쉬는 날로 꺼둔 줄은 건드리지 않는다 — 복사로 되살리면 「이 요일은 진료 안 함」이 조용히 뒤집힌다.
    """
    monday = await conn.fetchrow(
        """
        select start_time, end_time, slot_duration_minutes, lunch_start, lunch_end,
               max_daily_appointments, booking_deadline, is_day_off
        from doctor_schedule_rules where doctor_id = $1 and weekday = 0
        """,
        doctor_id,
    )
    if monday is None or monday["is_day_off"]:
        return   # 원본이 없거나 쉬는 날이면 복사할 것이 없다.

    for weekday in range(1, 7):
        existing = await conn.fetchval(
            "select is_day_off from doctor_schedule_rules where doctor_id = $1 and weekday = $2",
            doctor_id, weekday,
        )
        if existing:
            continue   # 꺼둔 줄은 그대로 둔다.
        await conn.execute(
            """
            insert into doctor_schedule_rules
              (doctor_id, weekday, start_time, end_time, slot_duration_minutes,
               lunch_start, lunch_end, max_daily_appointments, booking_deadline, is_day_off)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false)
            on conflict (doctor_id, weekday) do update set
              start_time = excluded.start_time,
              end_time = excluded.end_time,
              slot_duration_minutes = excluded.slot_duration_minutes,
              lunch_start = excluded.lunch_start,
              lunch_end = excluded.lunch_end,
              max_daily_appointments = excluded.max_daily_appointments,
              booking_deadline = excluded.booking_deadline,
              is_day_off = false
            """,
            doctor_id, weekday, monday["start_time"], monday["end_time"],
            monday["slot_duration_minutes"], monday["lunch_start"], monday["lunch_end"],
            monday["max_daily_appointments"], monday["booking_deadline"],
        )


async def overview_grid(conn) -> list[dict]:
    """[SCHED-GRID-01] 행=활성 의사·열=요일 7칸. 꺼진 의사는 격자에도 없다(SCHED-WEEK-08)."""
    doctors = await conn.fetch(
        """
        select s.id, s.name, d.name as department
        from staff s
        left join departments d on d.id = s.department_id
        where s.role = 'doctor' and s.is_active
        order by s.name
        """
    )
    grid = []
    for doctor in doctors:
        grid.append({
            "doctor_id": doctor["id"],
            "name": doctor["name"],
            "department": doctor["department"],
            "days": await list_week_rules(conn, doctor["id"]),
        })
    return grid


# ══ 병원 휴무 · 의사 예외 ════════════════════════════════════════════

async def upsert_closure(conn, day: date, memo: str | None, staff=None) -> None:
    """[SCHED-EXC-16] 병원 전체 종일 휴무 한 줄(날짜 기본키)."""
    await conn.execute(
        """
        insert into hospital_closures (closure_date, memo, created_by)
        values ($1, $2, $3)
        on conflict (closure_date) do update set
          memo = excluded.memo,
          created_by = excluded.created_by
        """,
        day, memo, _staff_id(staff),
    )


async def upsert_doctor_exception(
    conn,
    doctor_id: UUID,
    day: date,
    *,
    is_closed: bool,
    override_start: time | None = None,
    override_end: time | None = None,
    staff=None,
) -> None:
    """[SCHED-EXC-09] 의사별 지정 예외(하루 한 줄). 판정기에서 병원 휴무·요일 규칙을 이긴다."""
    await conn.execute(
        """
        insert into doctor_schedule_exceptions
          (doctor_id, exception_date, is_closed, override_start_time, override_end_time)
        values ($1, $2, $3, $4, $5)
        on conflict (doctor_id, exception_date) do update set
          is_closed = excluded.is_closed,
          override_start_time = excluded.override_start_time,
          override_end_time = excluded.override_end_time
        """,
        doctor_id, day, is_closed, override_start, override_end,
    )
