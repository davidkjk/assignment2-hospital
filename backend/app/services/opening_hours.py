"""운영시간 단일 판정기 (Task 17, SCHED-EXC-09~12·SCHED-HOURS-03·05).

⭐⭐ 판정 함수는 하나뿐이다(SCHED-EXC-12). 예약을 받을 때·캘린더를 그릴 때·상담봇이 답할 때
    모두 이 `resolve_day`를 부른다. 화면마다 따로 계산하면 같은 날이 어떤 화면에서는 휴무,
    어떤 화면에서는 진료중이 되고, 그 어긋남은 환자가 병원에 와서야 드러난다.

⭐ 겹쳤을 때는 좁은 쪽이 이긴다 — 의사별 지정 예외 > 병원 휴무 > 요일 규칙(SCHED-EXC-09).
   병원 휴무는 기본값이고 의사별은 그 사람을 콕 집은 지시다. 반대로 정하면
   「휴무일인데 나오기로 한 의사」를 표현할 방법이 없어져 막다른 길이 된다.

⭐ is_open(at)은 resolve_day와 다른 자다 — 접수 창구(hospital_hours)가 열린 시간이고
   상담봇의 "지금 문 열었나" 판정만 읽는다. 의사가 여럿이면 교대로 진료하므로 의사 점심은
   여럿인데 병원 점심은 없을 수 있다. 그래서 자동 계산하지 않고 hospital_hours를 따로 둔다.

weekday 규약: Python date.weekday() — 월=0 … 일=6 (doctor_schedule_rules·hospital_hours 공통).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from uuid import UUID

from app.core.errors import AppError

# resolve_day가 돌려주는 source 값(무엇이 이겼는가) — 화면·로그가 이 세 글자열에 기댄다.
SOURCE_DOCTOR_EXCEPTION = "doctor_exception"
SOURCE_HOSPITAL_CLOSURE = "hospital_closure"
SOURCE_WEEKLY_RULE = "weekly_rule"


@dataclass(frozen=True)
class DaySchedule:
    """resolve_day의 유일한 반환형. source가 「무엇이 이겼는지」를 담는다."""

    is_open: bool
    start: time | None
    end: time | None
    lunch: tuple[time, time] | None
    source: str


async def resolve_day(conn, doctor_id: UUID, day: date) -> DaySchedule:
    """이 의사가 이 날 진료하는지·몇 시부터 몇 시까지인지를 한 곳에서 판정한다.

    우선순위(좁은 쪽이 이긴다): ① 의사별 예외 → ② 병원 휴무 → ③ 요일 규칙.
    """
    # ── ① 의사별 지정 예외(가장 좁다 — 병원 휴무·요일 규칙을 모두 이긴다) ──
    exc = await conn.fetchrow(
        """
        select is_closed, override_start_time, override_end_time
        from doctor_schedule_exceptions
        where doctor_id = $1 and exception_date = $2
        """,
        doctor_id, day,
    )
    if exc is not None:
        if exc["is_closed"]:
            return DaySchedule(False, None, None, None, SOURCE_DOCTOR_EXCEPTION)
        return DaySchedule(
            True, exc["override_start_time"], exc["override_end_time"], None,
            SOURCE_DOCTOR_EXCEPTION,
        )

    # ── ② 병원 휴무(기본값 — 이 날은 원장이 병원 전체를 닫았다) ──
    closed = await conn.fetchval(
        "select 1 from hospital_closures where closure_date = $1", day
    )
    if closed is not None:
        return DaySchedule(False, None, None, None, SOURCE_HOSPITAL_CLOSURE)

    # ── ③ 요일 규칙(평소의 진료시간) ──
    rule = await conn.fetchrow(
        """
        select is_day_off, start_time, end_time, lunch_start, lunch_end
        from doctor_schedule_rules
        where doctor_id = $1 and weekday = $2
        """,
        doctor_id, day.weekday(),
    )
    if rule is None or rule["is_day_off"]:
        # 규칙이 없는 요일도, 휴진(is_day_off)으로 꺼둔 요일도 「진료 없음」이다.
        return DaySchedule(False, None, None, None, SOURCE_WEEKLY_RULE)

    lunch = None
    if rule["lunch_start"] is not None and rule["lunch_end"] is not None:
        lunch = (rule["lunch_start"], rule["lunch_end"])
    return DaySchedule(True, rule["start_time"], rule["end_time"], lunch, SOURCE_WEEKLY_RULE)


async def is_open(conn, at: datetime) -> bool:
    """상담봇의 "지금 문 열었나" — 접수 창구(hospital_hours) 기준.

    ⚠️ resolve_day(의사 진료시간)와 다른 값이다. 창구가 닫혀도 의사는 예약 환자를 마저 볼 수 있다.
    """
    day = at.date()
    # 종일 휴무면 창구시간이 있어도 닫힘이다(상담봇이 "열려 있다"고 오답하지 않게).
    closed = await conn.fetchval(
        "select 1 from hospital_closures where closure_date = $1", day
    )
    if closed is not None:
        return False

    row = await conn.fetchrow(
        "select open_time, close_time, lunch_start, lunch_end from hospital_hours where weekday = $1",
        day.weekday(),
    )
    if row is None:
        return False

    now = at.time()
    if not (row["open_time"] <= now < row["close_time"]):
        return False
    if (
        row["lunch_start"] is not None
        and row["lunch_end"] is not None
        and row["lunch_start"] <= now < row["lunch_end"]
    ):
        return False
    return True


async def save_hospital_hours(
    conn,
    *,
    weekday: int,
    open_time: time,
    close_time: time,
    lunch_start: time | None = None,
    lunch_end: time | None = None,
    staff=None,
) -> None:
    """접수 창구 시간을 한 요일에 저장(upsert)한다.

    화면은 인라인 오류로 보여주지만 서버도 같은 판정을 한다(SCHED-HOURS-09·10).
    """
    if close_time <= open_time:
        raise AppError("닫는 시간이 여는 시간보다 이릅니다.")
    if (lunch_start is not None) != (lunch_end is not None):
        raise AppError("점심시간은 시작과 끝을 함께 정해야 합니다.")
    if lunch_start is not None:
        if lunch_end <= lunch_start:
            raise AppError("점심 닫는 시간이 여는 시간보다 이릅니다.")
        if lunch_start < open_time or lunch_end > close_time:
            raise AppError("점심시간이 문 여는 시간 밖에 있습니다.")

    updated_by = _staff_id(staff)
    await conn.execute(
        """
        insert into hospital_hours
          (weekday, open_time, close_time, lunch_start, lunch_end, updated_by, updated_at)
        values ($1, $2, $3, $4, $5, $6, now())
        on conflict (weekday) do update set
          open_time = excluded.open_time,
          close_time = excluded.close_time,
          lunch_start = excluded.lunch_start,
          lunch_end = excluded.lunch_end,
          updated_by = excluded.updated_by,
          updated_at = now()
        """,
        weekday, open_time, close_time, lunch_start, lunch_end, updated_by,
    )


def _staff_id(staff) -> UUID | None:
    if staff is None:
        return None
    if isinstance(staff, UUID):
        return staff
    for attr in ("id", "staff_id"):
        value = getattr(staff, attr, None)
        if value is None and isinstance(staff, dict):
            value = staff.get(attr)
        if value is not None:
            return value if isinstance(value, UUID) else UUID(str(value))
    return None
