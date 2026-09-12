"""추천 자리(격자) 재생성 (Task 17, SCHED-SLOT-01~10).

⭐ 격자는 「환자에게 보여줄 목록」이다(SCHED-SLOT-02). 직원은 격자 밖 5분 단위 어디에나 잡는다
   (CAL-TIME-09) — 격자를 예약의 근거로 착각한 것이 갭 #97이었다.
⭐ 재생성도 판정 함수(resolve_day)를 부른다 — 휴진·병원 휴무·의사 예외를 예약·캘린더·상담봇과
   같은 자로 본다(SCHED-EXC-12). 그래서 여기서 새 계산을 만들지 않는다.
⭐ 이미 예약된 자리(status != '빈시간')는 새 격자에 없어도 지우지 않는다(SCHED-SLOT-05) —
   지우면 그 예약이 몇 시인지를 잃는다. 의사는 그 시각에 그대로 진료한다.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from uuid import UUID

from app.services.opening_hours import resolve_day

REGENERATION_WEEKS = 8   # [SCHED-SLOT-09] 오늘부터 8주치. 그 너머는 새 규칙으로 자연히 생긴다.


def _slot_start_times(start: time, end: time, step_minutes: int,
                      lunch: tuple[time, time] | None) -> list[time]:
    """진료시간을 한 칸 길이로 끊어 자리 시작 시각을 만든다. 점심 창에 걸리는 시작은 건너뛴다."""
    times: list[time] = []
    cursor = datetime.combine(date.min, start)
    end_dt = datetime.combine(date.min, end)
    step = timedelta(minutes=step_minutes)
    while cursor < end_dt:
        candidate = cursor.time()
        if lunch is None or not (lunch[0] <= candidate < lunch[1]):
            times.append(candidate)
        cursor += step
    return times


async def regenerate_slots(
    conn, doctor_id: UUID, weeks: int = REGENERATION_WEEKS, dry_run: bool = False
) -> dict:
    """오늘부터 `weeks`주치 추천 자리를 규칙대로 다시 만든다.

    반환: { removed, created, step_minutes }. ⚠️ step_minutes를 빼면 SCHED-SLOT-01의 두 테스트가
    서로 어긋난다 — 「추천 자리 간격」을 확인하는 값이다.
    """
    today: date = await conn.fetchval("select current_date")
    last_day = today + timedelta(weeks=weeks)

    # 한 칸 길이(추천 자리 간격) — 요일 규칙의 slot_duration. 요일마다 다를 수 있어 대표값을 준다.
    rule_rows = await conn.fetch(
        "select weekday, slot_duration_minutes, is_day_off from doctor_schedule_rules where doctor_id = $1",
        doctor_id,
    )
    rules = {row["weekday"]: row for row in rule_rows}
    step_minutes = None
    for weekday in range(7):
        rule = rules.get(weekday)
        if rule is not None and not rule["is_day_off"]:
            step_minutes = rule["slot_duration_minutes"]
            break

    # 만들어야 할 자리 집합(날짜, 시작시각) — 판정기가 연 날만, 그 요일의 한 칸 길이로.
    desired: set[tuple[date, time]] = set()
    day = today
    while day <= last_day:
        schedule = await resolve_day(conn, doctor_id, day)
        rule = rules.get(day.weekday())
        if schedule.is_open and schedule.start is not None and schedule.end is not None and rule is not None:
            step = rule["slot_duration_minutes"]
            for start_time in _slot_start_times(schedule.start, schedule.end, step, schedule.lunch):
                desired.add((day, start_time))
        day += timedelta(days=1)

    # 이미 있는 자리 — 빈 자리만 지울 수 있고, 예약된 자리는 격자 밖이라도 남긴다.
    existing_rows = await conn.fetch(
        """
        select slot_date, start_time, status
        from appointment_slots
        where doctor_id = $1 and slot_date >= $2 and slot_date <= $3
        """,
        doctor_id, today, last_day,
    )
    existing_all = {(row["slot_date"], row["start_time"]) for row in existing_rows}
    existing_empty = {
        (row["slot_date"], row["start_time"])
        for row in existing_rows if row["status"] == "빈시간"
    }

    to_remove = existing_empty - desired          # 빈 자리 중 새 격자에 없는 것
    to_create = desired - existing_all            # 새 격자 중 아직 없는 것(예약된 자리는 재생성 안 함)

    if not dry_run:
        for slot_date, start_time in to_remove:
            await conn.execute(
                "delete from appointment_slots "
                "where doctor_id = $1 and slot_date = $2 and start_time = $3 and status = '빈시간'",
                doctor_id, slot_date, start_time,
            )
        for slot_date, start_time in to_create:
            await conn.execute(
                "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
                "values ($1, $2, $3, '빈시간') "
                "on conflict (doctor_id, slot_date, start_time) do nothing",
                doctor_id, slot_date, start_time,
            )

    return {
        "removed": len(to_remove),
        "created": len(to_create),
        "step_minutes": step_minutes,
    }


async def regenerate_all_doctors(conn, weeks: int) -> dict:
    """[SCHED-WINDOW-03·04] 예약 가능 기간이 바뀌면 전 활성 의사의 격자를 새로 만든다.

    - 늘릴 때: regenerate_slots가 새 주에 빈칸을 추가한다(기존 로직 그대로).
    - ⭐ 줄일 때: regenerate_slots는 「새 범위 안」만 청소하므로 범위 밖(잘려나간 주)의 빈칸이
      DB에 남는다 — 환자가 그 빈칸을 눌렀다 예약 검증에 거절당하는 막다른 길이 된다. 그래서
      여기서 범위 밖 **빈 자리만** 지운다. 예약된 자리(status != '빈시간')는 절대 건드리지
      않는다(SCHED-SLOT-05) — 그 예약은 유효하고 의사는 그 시각에 그대로 진료한다.
    """
    today: date = await conn.fetchval("select current_date")
    last_day = today + timedelta(weeks=weeks)
    doctors = await conn.fetch(
        "select id from staff where role = 'doctor' and is_active order by id"
    )
    created = removed = pruned = 0
    for row in doctors:
        result = await regenerate_slots(conn, row["id"], weeks)
        created += result["created"]
        removed += result["removed"]
        # 범위 밖(줄인 뒤 잘려나간 구간)의 빈 자리 삭제 — 예약된 자리는 남긴다.
        tag = await conn.execute(
            "delete from appointment_slots "
            "where doctor_id = $1 and slot_date > $2 and status = '빈시간'",
            row["id"], last_day,
        )
        pruned += int(tag.split()[-1]) if tag.startswith("DELETE") else 0
    return {"doctors": len(doctors), "created": created, "removed": removed, "pruned": pruned}
