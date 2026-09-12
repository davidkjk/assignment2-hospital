"""[SCHED-EXC-09~12][SCHED-HOURS-03·05][SCHED-WEEK-04] 운영시간 단일 판정기.

⭐ 판정 함수는 하나뿐(resolve_day)이라, 여기서 새면 예약·캘린더·상담봇 세 곳이 한꺼번에 샌다.
우선순위(좁은 쪽이 이긴다): 의사별 예외 > 병원 휴무 > 요일 규칙.
is_open(at)은 다른 자다 — 접수 창구(hospital_hours) 기준(상담봇용).
"""
import uuid
from datetime import date, datetime, time

import pytest

from app.core.errors import AppError
from app.services.opening_hours import resolve_day, is_open, save_hospital_hours
from tests.conftest import seed_staff

MON = date(2026, 8, 17)   # weekday=0 (월)
SAT = date(2026, 8, 15)   # weekday=5 (토)


async def _dept(conn) -> uuid.UUID:
    return await conn.fetchval("insert into departments (name) values ('내과') returning id")


async def _doctor(conn, dept) -> uuid.UUID:
    return (await seed_staff(conn, "doctor", department_id=dept))["staff_id"]


async def _rule(conn, doctor, weekday, **kw):
    await conn.execute(
        """
        insert into doctor_schedule_rules
          (doctor_id, weekday, start_time, end_time, slot_duration_minutes,
           lunch_start, lunch_end, max_daily_appointments, is_day_off)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        """,
        doctor, weekday,
        kw.get("start", time(9)), kw.get("end", time(18)),
        kw.get("slot", 20), kw.get("lunch_start"), kw.get("lunch_end"),
        kw.get("max_daily", 30), kw.get("is_day_off", False),
    )


async def _closure(conn, day):
    await conn.execute("insert into hospital_closures (closure_date) values ($1)", day)


async def _exception(conn, doctor, day, *, is_closed, start=None, end=None):
    await conn.execute(
        """
        insert into doctor_schedule_exceptions
          (doctor_id, exception_date, is_closed, override_start_time, override_end_time)
        values ($1,$2,$3,$4,$5)
        """,
        doctor, day, is_closed, start, end,
    )


# ── resolve_day: 우선순위 ──────────────────────────────────────────────

async def test_의사별_지정이_병원_휴무를_이긴다(db_conn):
    """[SCHED-EXC-09][SCHED-EXC-10] 좁은 쪽이 이긴다.
    병원 휴무는 기본값, 의사별은 그 사람을 콕 집은 지시다."""
    dept = await _dept(db_conn)
    doc1 = await _doctor(db_conn, dept)
    doc2 = await _doctor(db_conn, dept)
    await _closure(db_conn, SAT)
    await _exception(db_conn, doc1, SAT, is_closed=False, start=time(9), end=time(13))
    assert (await resolve_day(db_conn, doc1, SAT)).is_open is True
    assert (await resolve_day(db_conn, doc2, SAT)).is_open is False


async def test_이긴_것이_source에_담긴다(db_conn):
    """[SCHED-EXC-11] 덮였다는 사실이 안 보이면 그게 더 위험하다."""
    dept = await _dept(db_conn)
    doc1 = await _doctor(db_conn, dept)
    doc2 = await _doctor(db_conn, dept)
    await _closure(db_conn, SAT)
    await _exception(db_conn, doc1, SAT, is_closed=False, start=time(9), end=time(13))
    assert (await resolve_day(db_conn, doc1, SAT)).source == "doctor_exception"
    assert (await resolve_day(db_conn, doc2, SAT)).source == "hospital_closure"


async def test_정상_요일은_규칙의_진료시간을_돌려준다(db_conn):
    """[SCHED-EXC-12] 셋째 층(요일 규칙)이 진료시간·점심을 돌려준다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    await _rule(db_conn, doc, 0, start=time(9), end=time(18),
               lunch_start=time(12), lunch_end=time(13))
    day = await resolve_day(db_conn, doc, MON)
    assert day.is_open is True
    assert day.start == time(9)
    assert day.end == time(18)
    assert day.lunch == (time(12), time(13))
    assert day.source == "weekly_rule"


async def test_휴진_요일은_판정기가_닫혔다고_답한다(db_conn):
    """[SCHED-WEEK-04][SCHED-SLOT-11] is_day_off를 읽는 자리 — 여기서 닫아야
    격자 밖 5분 단위 예약(CAL-TIME-09)이 휴진일에 들어오지 않는다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    await _rule(db_conn, doc, 0, is_day_off=True)
    day = await resolve_day(db_conn, doc, MON)
    assert day.is_open is False
    assert day.source == "weekly_rule"


async def test_그날만_나오기로_한_지정은_정기_휴진도_이긴다(db_conn):
    """[SCHED-EXC-09] 의사별 지정 > 병원 휴무 > 요일 규칙.
    「평소 쉬는 요일인데 이번 주만 나온다」를 표현할 수 있어야 막다른 길이 아니다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    await _rule(db_conn, doc, 0, is_day_off=True)
    await _exception(db_conn, doc, MON, is_closed=False, start=time(9), end=time(13))
    day = await resolve_day(db_conn, doc, MON)
    assert day.is_open is True
    assert day.source == "doctor_exception"


async def test_규칙이_없는_요일은_닫혀_있다(db_conn):
    """[SCHED-WEEK-02] 규칙을 안 넣은 요일은 진료 없음 = 닫힘."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    assert (await resolve_day(db_conn, doc, MON)).is_open is False


# ── is_open: 접수 창구(상담봇), 의사 진료시간과 다른 값 ────────────────────

async def test_병원_운영시간은_의사_진료시간과_다른_값이다(db_conn):
    """[SCHED-HOURS-03][SCHED-HOURS-05] 창구는 1시에 닫혀도 의사는 6시까지 진료한다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    await save_hospital_hours(db_conn, weekday=5, open_time=time(9), close_time=time(13))
    await _rule(db_conn, doc, 5, start=time(9), end=time(18))
    assert await is_open(db_conn, datetime(2026, 8, 15, 14)) is False       # 창구는 닫혔고
    assert (await resolve_day(db_conn, doc, SAT)).end == time(18)           # 진료는 계속된다


async def test_창구_시간_안이면_열려있다(db_conn):
    """[SCHED-HOURS-05] 여는~닫는 사이면 True."""
    await save_hospital_hours(db_conn, weekday=5, open_time=time(9), close_time=time(13))
    assert await is_open(db_conn, datetime(2026, 8, 15, 10)) is True


async def test_창구_점심시간에는_닫혀있다(db_conn):
    """[SCHED-HOURS-05] 점심 창은 닫힘으로 답한다."""
    await save_hospital_hours(db_conn, weekday=0, open_time=time(9), close_time=time(18),
                              lunch_start=time(12), lunch_end=time(13))
    assert await is_open(db_conn, datetime(2026, 8, 17, 12, 30)) is False
    assert await is_open(db_conn, datetime(2026, 8, 17, 11)) is True


async def test_병원_휴무일은_창구도_닫힌다(db_conn):
    """[SCHED-HOURS-03] 종일 휴무면 창구시간이 있어도 닫힘이다(상담봇 오답 방지)."""
    await save_hospital_hours(db_conn, weekday=0, open_time=time(9), close_time=time(18))
    await _closure(db_conn, MON)
    assert await is_open(db_conn, datetime(2026, 8, 17, 11)) is False


async def test_창구시간이_없는_요일은_닫혀있다(db_conn):
    """[SCHED-HOURS-03] hospital_hours 줄이 없는 요일은 닫힘."""
    assert await is_open(db_conn, datetime(2026, 8, 17, 11)) is False


# ── save_hospital_hours: 시각 검증 ────────────────────────────────────

async def test_닫는_시간이_여는_시간보다_이르면_거절한다(db_conn):
    """[SCHED-HOURS-09] 종료 ≤ 시작은 저장 거절."""
    with pytest.raises(AppError, match="닫는 시간이 여는 시간보다 이릅니다"):
        await save_hospital_hours(db_conn, weekday=1, open_time=time(18), close_time=time(9))


async def test_점심이_운영시간_밖이면_거절한다(db_conn):
    """[SCHED-HOURS-10] 점심이 문 여는 시간 밖에 있으면 저장 거절."""
    with pytest.raises(AppError, match="점심시간이 문 여는 시간 밖에 있습니다"):
        await save_hospital_hours(db_conn, weekday=1, open_time=time(9), close_time=time(18),
                                  lunch_start=time(19), lunch_end=time(20))
