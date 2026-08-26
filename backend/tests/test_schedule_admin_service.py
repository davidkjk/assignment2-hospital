"""[SCHED-WEEK-02·03·07][SCHED-SAVE-03][SCHED-GRID-01][SCHED-EXC-16] 일정 저장·읽기 층.

- save_week_rules: 전부 되거나 전부 안 되거나(갭 #95). 여섯 칸+요일 한 줄.
- list_week_rules: 늘 7행(없는 요일은 is_day_off 빈 줄로 서버가 채운다).
- overview_grid: 활성 의사 × 7칸.
- upsert_closure / upsert_doctor_exception: 병원 휴무·의사 예외 저장.
"""
import uuid
from datetime import date, time

import pytest

from app.core.errors import AppError
from app.services.opening_hours import resolve_day
from app.services.schedule_admin_service import (
    copy_monday_to_rest,
    list_week_rules,
    overview_grid,
    save_week_rules,
    upsert_closure,
    upsert_doctor_exception,
)

MON = date(2026, 8, 17)   # weekday=0


async def _dept(conn, name="내과") -> uuid.UUID:
    return await conn.fetchval("insert into departments (name) values ($1) returning id", name)


async def _doctor(conn, name, dept, is_active=True) -> uuid.UUID:
    auth_id = uuid.uuid4()
    await conn.execute(
        "insert into auth.users (id, email, encrypted_password, email_confirmed_at, "
        "created_at, updated_at, aud, role) "
        "values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')",
        auth_id, f"{auth_id}@test.local",
    )
    return await conn.fetchval(
        "insert into staff (auth_user_id, name, role, department_id, is_active) "
        "values ($1, $2, 'doctor', $3, $4) returning id",
        auth_id, name, dept, is_active,
    )


def _row(weekday, **kw) -> dict:
    return {
        "weekday": weekday,
        "is_day_off": kw.get("is_day_off", False),
        "start": kw.get("start", time(9)),
        "end": kw.get("end", time(18)),
        "slot_minutes": kw.get("slot_minutes", 20),
        "lunch_start": kw.get("lunch_start"),
        "lunch_end": kw.get("lunch_end"),
        "max_daily": kw.get("max_daily", 30),
        "booking_deadline": kw.get("booking_deadline"),
    }


async def _count_rules(conn, doctor) -> int:
    return await conn.fetchval(
        "select count(*) from doctor_schedule_rules where doctor_id=$1", doctor
    )


# ── save_week_rules: 원자 저장 ────────────────────────────────────────

async def test_여러_줄_저장은_전부_되거나_전부_안_된다(db_conn):
    """[SCHED-SAVE-03] 갭 #95 — 일곱 줄 중 넷째에서 실패하면 셋만 저장된 채로 남으면 안 된다.
    관리자는 「저장했다」고 믿고, 어긋난 것은 예약이 들어온 뒤에 드러난다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, "김의사", dept)
    bad = _row(2, end=time(8))   # 종료 < 시작 = 나쁜 줄
    with pytest.raises(AppError):
        await save_week_rules(db_conn, doc, [_row(0), _row(1), bad], staff=None)
    assert await _count_rules(db_conn, doc) == 0


async def test_좋은_줄만_있으면_모두_저장된다(db_conn):
    """[SCHED-WEEK-03] 여섯 칸+요일 한 줄이 그대로 저장된다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, "김의사", dept)
    await save_week_rules(db_conn, doc, [_row(0, start=time(9), end=time(17))], staff=None)
    assert await _count_rules(db_conn, doc) == 1


async def test_휴진_스위치가_저장된다(db_conn):
    """[SCHED-WEEK-03][SCHED-WEEK-04] 저장 창구가 is_day_off를 받지 않으면
    화면이 아무리 잠가도 다음 저장에서 false로 되돌아간다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, "김의사", dept)
    await save_week_rules(db_conn, doc, [_row(0, is_day_off=True)], staff=None)
    rules = {r["weekday"]: r for r in await list_week_rules(db_conn, doc)}
    assert rules[0]["is_day_off"] is True


# ── list_week_rules: 늘 7행 ──────────────────────────────────────────

async def test_규칙을_읽는_창구가_요일_일곱_줄을_늘_다_준다(db_conn):
    """[SCHED-WEEK-02][SCHED-GRID-01] 저장만 있고 읽기가 없으면 격자·주간 표는
    그릴 값이 없다. 없는 요일을 화면이 지어내게 두지 않는다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, "김의사", dept)
    await save_week_rules(db_conn, doc, [_row(1), _row(2)], staff=None)
    rules = await list_week_rules(db_conn, doc)
    assert [r["weekday"] for r in rules] == [0, 1, 2, 3, 4, 5, 6]
    assert rules[0]["is_day_off"] is True     # 규칙을 안 넣은 요일은 쉬는 날로 채워 온다
    assert rules[1]["is_day_off"] is False    # 넣은 요일은 그대로


# ── copy_monday_to_rest: 월요일 복사(SCHED-WEEK-07) ───────────────────

async def test_월요일_값_복사는_휴진으로_꺼둔_줄을_건드리지_않는다(db_conn):
    """[SCHED-WEEK-07] 요일마다 값이 거의 같아 7벌을 손으로 채우면 한 요일이 낡는다.
    다만 쉬는 날을 되살리면 안 된다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, "김의사", dept)
    await save_week_rules(db_conn, doc, [
        _row(0, start=time(9), end=time(18)),      # 월(원본)
        _row(3, is_day_off=True),                  # 목은 쉬는 날
    ], staff=None)
    await copy_monday_to_rest(db_conn, doc, staff=None)
    rules = {r["weekday"]: r for r in await list_week_rules(db_conn, doc)}
    assert rules[2]["start"] == time(9) and rules[2]["end"] == time(18)   # 나머지 요일
    assert rules[3]["is_day_off"] is True                                # 꺼둔 줄은 그대로


# ── upsert_closure / upsert_doctor_exception ─────────────────────────

async def test_병원_휴무_저장은_판정기에_반영된다(db_conn):
    """[SCHED-EXC-16] 종일 휴무 한 줄이 resolve_day를 닫는다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, "김의사", dept)
    await save_week_rules(db_conn, doc, [_row(0)], staff=None)
    await upsert_closure(db_conn, MON, "창립기념일", staff=None)
    day = await resolve_day(db_conn, doc, MON)
    assert day.is_open is False
    assert day.source == "hospital_closure"


async def test_같은_날_휴무를_두_번_저장하면_메모만_갱신된다(db_conn):
    """[SCHED-EXC-16] closure_date 기본키 — 두 줄이 되지 않는다."""
    await upsert_closure(db_conn, MON, "창립기념일", staff=None)
    await upsert_closure(db_conn, MON, "임시휴진", staff=None)
    rows = await db_conn.fetch("select memo from hospital_closures where closure_date=$1", MON)
    assert len(rows) == 1
    assert rows[0]["memo"] == "임시휴진"


async def test_의사_예외_저장은_판정기가_이긴다(db_conn):
    """[SCHED-EXC-09] 의사별 지정이 병원 휴무를 이긴다 — upsert가 그 지시를 심는다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, "김의사", dept)
    await upsert_closure(db_conn, MON, "병원 휴무", staff=None)
    await upsert_doctor_exception(db_conn, doc, MON, is_closed=False,
                                  override_start=time(9), override_end=time(13))
    day = await resolve_day(db_conn, doc, MON)
    assert day.is_open is True
    assert day.source == "doctor_exception"


# ── overview_grid ────────────────────────────────────────────────────

async def test_전체_현황_격자는_활성_의사만_준다(db_conn):
    """[SCHED-GRID-01][SCHED-WEEK-08] 행=의사·열=요일 7개. 꺼진 의사는 격자에도 없다."""
    dept = await _dept(db_conn)
    doc1 = await _doctor(db_conn, "가의사", dept)
    await _doctor(db_conn, "나의사", dept, is_active=False)   # 비활성
    grid = await overview_grid(db_conn)
    assert [g["doctor_id"] for g in grid] == [doc1]
    assert len(grid[0]["days"]) == 7


async def test_의사가_없으면_격자는_빈_배열이다(db_conn):
    """[SCHED-GRID-07] 빈 상태 — 의사가 0명이면 빈 배열."""
    await _dept(db_conn)
    assert await overview_grid(db_conn) == []
