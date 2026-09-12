from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest

from app.core.security import StaffContext
from app.services.schedule_change import (
    get_appointment,
    list_affected_appointments,
    mark_change_handled,
    reschedule_appointment,
)
from tests.conftest import seed_staff, set_session_auth


async def _future_date(conn, days=30) -> date:
    today = await conn.fetchval("select current_date")
    return today + timedelta(days=days)


async def _seed_appointment(conn, *, start_time=time(10, 0), slot_date=None, status="예약확정"):
    if slot_date is None:
        slot_date = await _future_date(conn)
    department_id = await conn.fetchval(
        "insert into departments (name) values ($1) returning id",
        f"내과-{slot_date}-{start_time}",
    )
    patient_id = await conn.fetchval(
        """
        insert into patients (name, birth_date, gender, phone)
        values ('홍길동', '1985-03-01', 'M', '01012345678')
        returning id
        """
    )
    admin = await seed_staff(conn, role="admin")
    doctor = await seed_staff(conn, role="doctor", department_id=department_id)
    slot_id = await conn.fetchval(
        """
        insert into appointment_slots (doctor_id, slot_date, start_time, status)
        values ($1, $2, $3, '예약됨')
        returning id
        """,
        doctor["staff_id"], slot_date, start_time,
    )
    appointment_id = await conn.fetchval(
        """
        insert into appointments
            (slot_id, account_patient_id, for_patient_id, department_id, doctor_id,
             status, source, created_by)
        values ($1, $2, $2, $3, $4, $5, 'staff', $6)
        returning id
        """,
        slot_id,
        patient_id,
        department_id,
        doctor["staff_id"],
        status,
        admin["staff_id"],
    )
    return SimpleNamespace(
        id=appointment_id,
        doctor_id=doctor["staff_id"],
        admin=StaffContext(
            id=admin["staff_id"],
            auth_user_id=admin["auth_user_id"],
            role="admin",
            department_id=None,
        ),
        date=slot_date,
        start_time=start_time,
    )


async def _save_exception(conn, doctor_id, exception_date, *, is_closed=True, start=None, end=None):
    return await conn.fetchval(
        """
        insert into doctor_schedule_exceptions
            (doctor_id, exception_date, is_closed, override_start_time, override_end_time)
        values ($1, $2, $3, $4, $5)
        returning id
        """,
        doctor_id,
        exception_date,
        is_closed,
        start,
        end,
    )


@pytest.mark.asyncio
async def test_affected_list_is_calculated_and_ignores_cancelled_appointments(db_conn):
    appt = await _seed_appointment(db_conn)
    exception_id = await _save_exception(db_conn, appt.doctor_id, appt.date)

    rows = await list_affected_appointments(db_conn)
    assert appt.id in [row["id"] for row in rows]

    await db_conn.execute("update appointments set status = '환자취소' where id = $1", appt.id)
    assert appt.id not in [row["id"] for row in await list_affected_appointments(db_conn)]
    assert await db_conn.fetchval(
        "select count(*) from schedule_change_acks where exception_id = $1", exception_id
    ) == 0


@pytest.mark.asyncio
async def test_candidate_and_saved_exception_use_the_same_calculation(db_conn):
    pushed = await _seed_appointment(db_conn, start_time=time(10, 0))
    stays = await _seed_appointment(db_conn, start_time=time(15, 0))
    assert pushed.date == stays.date

    candidate = {
        "doctor_id": pushed.doctor_id,
        "date": pushed.date,
        "is_day_off": False,
        "start_time": time(14, 0),
        "end_time": time(18, 0),
    }
    preview = await list_affected_appointments(db_conn, candidate_exception=candidate)
    assert [row["id"] for row in preview] == [pushed.id]

    exception_id = await _save_exception(
        db_conn,
        pushed.doctor_id,
        pushed.date,
        is_closed=False,
        start=time(14, 0),
        end=time(18, 0),
    )
    saved = await list_affected_appointments(db_conn, exception_id=exception_id)
    assert [row["id"] for row in saved] == [pushed.id]


@pytest.mark.asyncio
async def test_admin_preview_groups_count_times_and_weekday_without_patient_data(db_conn):
    appt = await _seed_appointment(db_conn)
    candidate = {
        "doctor_id": appt.doctor_id,
        "exception_date": appt.date,
        "is_closed": True,
    }

    preview = await list_affected_appointments(
        db_conn, candidate_exception=candidate, for_role="admin"
    )
    assert len(preview) == 1
    assert set(preview[0]) == {"count", "times", "weekday"}
    assert preview[0]["count"] == 1
    assert preview[0]["times"] == [{"date": appt.date.isoformat(), "time": "10:00"}]
    assert preview[0]["weekday"] in {"월", "화", "수", "목", "금", "토", "일"}
    assert "홍길동" not in repr(preview)


@pytest.mark.asyncio
async def test_admin_preview_keeps_multiple_candidate_lines_in_order(db_conn):
    today = await db_conn.fetchval("select current_date")
    monday = today + timedelta(days=(7 - today.weekday()) % 7 + 7)
    wednesday = monday + timedelta(days=2)
    monday_appt = await _seed_appointment(db_conn, slot_date=monday)
    wednesday_appt = await _seed_appointment(
        db_conn, slot_date=wednesday, start_time=time(11, 0)
    )

    preview = await list_affected_appointments(
        db_conn,
        candidate_exception=[
            {"doctor_id": monday_appt.doctor_id, "date": monday, "is_day_off": True},
            {"doctor_id": wednesday_appt.doctor_id, "date": wednesday, "is_day_off": True},
        ],
        for_role="admin",
    )
    assert [row["weekday"] for row in preview] == ["월", "수"]
    assert sum(row["count"] for row in preview) == 2


@pytest.mark.asyncio
async def test_handling_stamp_is_manual_and_is_scoped_to_exception(db_conn):
    appt = await _seed_appointment(db_conn)
    first_exception = await _save_exception(db_conn, appt.doctor_id, appt.date)
    admin = appt.admin
    await set_session_auth(db_conn, admin.auth_user_id)

    assert await list_affected_appointments(db_conn)
    assert await db_conn.fetchval(
        "select count(*) from schedule_change_acks where appointment_id = $1", appt.id
    ) == 0

    await mark_change_handled(
        db_conn, appt.id, exception_id=first_exception, action="kept"
    )
    ack = await db_conn.fetchrow(
        "select action, handled_by from schedule_change_acks where appointment_id = $1",
        appt.id,
    )
    assert ack["action"] == "kept"
    assert ack["handled_by"] == admin.id
    assert await list_affected_appointments(db_conn) == []

    await db_conn.execute("set local role postgres")
    await db_conn.execute(
        "delete from doctor_schedule_exceptions where id = $1", first_exception
    )
    second_exception = await _save_exception(db_conn, appt.doctor_id, appt.date)
    assert second_exception != first_exception
    assert appt.id in [row["id"] for row in await list_affected_appointments(db_conn)]


@pytest.mark.asyncio
async def test_inactive_doctor_is_a_second_calculated_cause_and_can_recover(db_conn):
    appt = await _seed_appointment(db_conn)
    preview = await list_affected_appointments(
        db_conn, deactivating_doctor_id=appt.doctor_id, for_role="admin"
    )
    assert preview[0]["count"] == 1

    await db_conn.execute(
        "update staff set is_active = false where id = $1", appt.doctor_id
    )
    rows = await list_affected_appointments(db_conn)
    assert [row["id"] for row in rows] == [appt.id]

    await db_conn.execute("update staff set is_active = true where id = $1", appt.doctor_id)
    assert await list_affected_appointments(db_conn) == []


@pytest.mark.asyncio
async def test_reschedule_accepts_arbitrary_five_minute_time_and_keeps_status(db_conn):
    appt = await _seed_appointment(db_conn)
    new_start = datetime.combine(appt.date, time(10, 5))

    await reschedule_appointment(
        appt.id,
        new_start_at=new_start,
        staff=appt.admin,
        reason="의사 휴진",
        conn=db_conn,
    )

    moved = await get_appointment(db_conn, appt.id)
    assert moved["status"] == "예약확정"
    assert moved["start_at"].replace(tzinfo=None) == new_start
    assert moved["end_at"].replace(tzinfo=None) == datetime.combine(appt.date, time(10, 25))
    card = await db_conn.fetchrow(
        "select hospital_change_prev_time, hospital_change_kind from appointments where id = $1",
        appt.id,
    )
    assert card["hospital_change_kind"] == "changed"
    assert card["hospital_change_prev_time"].astimezone(timezone(timedelta(hours=9))).replace(
        tzinfo=None
    ) == datetime.combine(appt.date, appt.start_time)
