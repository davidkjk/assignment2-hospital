"""[CAL-SLOT-*][SCHED-EXC-12] 캘린더 조립 — 빗금은 resolve_day 하나로만 판정한다.

⭐ 판정 함수는 하나뿐이다(SCHED-EXC-12) — 캘린더가 자기 계산을 가지면 같은 날이
   캘린더에서는 진료중, 예약에서는 휴무가 된다. 그래서 빗금(점심·휴진)은 resolve_day가,
   ⚠ 확인 필요는 list_affected_appointments가 판정한 것을 그대로 실어 나른다.
"""
import uuid
from datetime import date, time, timedelta

import pytest

from app.services import dashboard_service
from tests.conftest import seed_staff
from tests.task13_fixtures import (
    seed_department,
    seed_doctor,
    seed_patient,
    seed_slot,
    seed_appointment,
    to_context,
)

# 2026-08-17 = 월요일(weekday 0), 2026-08-22 = 토요일.
MON = date(2026, 8, 17)
SAT = date(2026, 8, 22)


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


@pytest.mark.asyncio
async def test_캘_슬롯_09_점심_빗금은_의사마다_다른_시각에_그려진다(db_conn):
    """[CAL-SLOT-08·09] 점심은 doctor_schedule_rules에서 의사별로 읽는다 — 빗금이 열마다 다르다."""
    dept = await seed_department(db_conn)
    doc1 = await seed_doctor(db_conn, dept)
    doc2 = await seed_doctor(db_conn, dept)
    await _rule(db_conn, doc1["staff_id"], MON.weekday(), lunch_start=time(12), lunch_end=time(13))
    await _rule(db_conn, doc2["staff_id"], MON.weekday(), lunch_start=time(13), lunch_end=time(14))
    staff = to_context(await seed_staff(db_conn, "receptionist"), "receptionist")

    result = await dashboard_service.get_calendar(
        staff, from_=MON, to=MON, doctor_ids=[doc1["staff_id"], doc2["staff_id"]], conn=db_conn
    )

    lunches = {
        (b["doctor_id"], b["start"], b["end"])
        for b in result["blocks"] if b["kind"] == "lunch"
    }
    assert (doc1["staff_id"], time(12), time(13)) in lunches
    assert (doc2["staff_id"], time(13), time(14)) in lunches  # 의사마다 다른 시각


@pytest.mark.asyncio
async def test_캘_슬롯_03_휴진일은_한_덩어리_휴진_빗금이_된다(db_conn):
    """[CAL-SLOT-03] 요일 규칙이 없는(=휴진) 날은 resolve_day가 닫고 closed 빗금 한 줄이 나온다."""
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    # MON 규칙은 넣고 SAT 규칙은 안 넣는다 → SAT는 휴진.
    await _rule(db_conn, doc["staff_id"], MON.weekday())
    staff = to_context(await seed_staff(db_conn, "receptionist"), "receptionist")

    result = await dashboard_service.get_calendar(
        staff, from_=MON, to=SAT, doctor_ids=[doc["staff_id"]], conn=db_conn
    )

    closed = {b["date"] for b in result["blocks"] if b["kind"] == "closed"}
    assert SAT in closed  # 휴진일은 빗금
    assert MON not in closed  # 진료일은 빗금 없음


@pytest.mark.asyncio
async def test_캘_슬롯_05_확인필요_예약은_affected로_표시된다(db_conn):
    """[CAL-SLOT-05] 일정 변경 영향 예약은 list_affected_appointments 판정을 그대로 싣는다."""
    from tests.task13_fixtures import db_today

    # list_affected_appointments는 미래 예약만 본다 — 오늘 이후 날짜로 잡는다.
    today = await db_today(db_conn)
    future = today + timedelta(days=7)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _rule(db_conn, doc["staff_id"], future.weekday())
    patient = await seed_patient(db_conn)
    slot = await seed_slot(db_conn, doc["staff_id"], future, start_time=time(10))
    appt = await seed_appointment(
        db_conn, doctor_id=doc["staff_id"], department_id=dept, patient_id=patient,
        slot_id=slot, status="예약확정",
    )
    # 그 날 그 의사를 종일 휴진으로 덮는다 → 그 예약이 영향권에 든다.
    await db_conn.execute(
        "insert into doctor_schedule_exceptions (doctor_id, exception_date, is_closed) values ($1,$2,true)",
        doc["staff_id"], future,
    )
    staff = to_context(await seed_staff(db_conn, "receptionist"), "receptionist")

    result = await dashboard_service.get_calendar(
        staff, from_=future, to=future, doctor_ids=[doc["staff_id"]], conn=db_conn
    )

    assert appt in set(result["affected_appointment_ids"])


@pytest.mark.asyncio
async def test_마스크_예약_막대는_이름을_가려_싣는다(db_conn):
    """[MASK-SRV-01] 예약 막대의 환자 이름은 마스킹돼야 한다 — 원본 name 키는 없다."""
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _rule(db_conn, doc["staff_id"], MON.weekday())
    patient = await seed_patient(db_conn, name="홍길동")
    slot = await seed_slot(db_conn, doc["staff_id"], MON, start_time=time(10))
    appt = await seed_appointment(
        db_conn, doctor_id=doc["staff_id"], department_id=dept, patient_id=patient,
        slot_id=slot, status="예약확정",
    )
    staff = to_context(await seed_staff(db_conn, "receptionist"), "receptionist")

    result = await dashboard_service.get_calendar(
        staff, from_=MON, to=MON, doctor_ids=[doc["staff_id"]], conn=db_conn
    )

    bar = next(b for b in result["appointments"] if b["appointment_id"] == appt)
    assert bar["masked_name"] == "홍*동"
    assert "name" not in bar and "patient_name" not in bar
