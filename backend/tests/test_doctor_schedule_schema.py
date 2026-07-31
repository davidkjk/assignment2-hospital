import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_admin_can_create_schedule_rule(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])

    await db_conn.execute(
        """
        insert into doctor_schedule_rules
            (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments)
        values ($1, 1, '09:00', '18:00', 20, 30)
        """,
        doctor["staff_id"],
    )
    rows = await db_conn.fetch("select * from doctor_schedule_rules")
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_doctor_cannot_create_schedule_rule(db_conn):
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, doctor["auth_user_id"])

    with pytest.raises(Exception):
        await db_conn.execute(
            """
            insert into doctor_schedule_rules
                (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments)
            values ($1, 1, '09:00', '18:00', 20, 30)
            """,
            doctor["staff_id"],
        )


@pytest.mark.asyncio
async def test_exception_date_unique_per_doctor(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])

    await db_conn.execute(
        "insert into doctor_schedule_exceptions (doctor_id, exception_date, is_closed) values ($1, '2026-08-15', true)",
        doctor["staff_id"],
    )
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into doctor_schedule_exceptions (doctor_id, exception_date, is_closed) values ($1, '2026-08-15', true)",
            doctor["staff_id"],
        )


@pytest.mark.asyncio
async def test_schedule_rule_is_day_off_defaults_false(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])

    await db_conn.execute(
        """
        insert into doctor_schedule_rules
            (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments)
        values ($1, 1, '09:00', '18:00', 20, 30)
        """,
        doctor["staff_id"],
    )
    row = await db_conn.fetchrow("select is_day_off from doctor_schedule_rules where doctor_id = $1", doctor["staff_id"])
    assert row["is_day_off"] is False


@pytest.mark.asyncio
async def test_schedule_rule_is_day_off_can_be_set_true(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])

    await db_conn.execute(
        """
        insert into doctor_schedule_rules
            (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments, is_day_off)
        values ($1, 3, '09:00', '18:00', 20, 30, true)
        """,
        doctor["staff_id"],
    )
    row = await db_conn.fetchrow(
        "select is_day_off from doctor_schedule_rules where doctor_id = $1 and weekday = 3",
        doctor["staff_id"],
    )
    assert row["is_day_off"] is True
