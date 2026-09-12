import asyncio

import pytest

from app.core.security import StaffContext
from app.services import slot_service
from tests.conftest import seed_staff


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


@pytest.mark.asyncio
async def test_book_slot_succeeds_on_empty_slot(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    staff = _to_context(admin, "admin")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-01', '09:00') returning id",
        doctor["staff_id"],
    )

    booked = await slot_service.book_slot(slot_id, staff, conn=db_conn)
    assert booked is True
    status = await db_conn.fetchval("select status from appointment_slots where id = $1", slot_id)
    assert status == "예약됨"


@pytest.mark.asyncio
async def test_book_slot_fails_when_already_booked(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    staff = _to_context(admin, "admin")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '예약됨') returning id",
        doctor["staff_id"],
    )

    booked = await slot_service.book_slot(slot_id, staff, conn=db_conn)
    assert booked is False


@pytest.mark.asyncio
async def test_release_slot_returns_to_empty(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    staff = _to_context(admin, "admin")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '예약됨') returning id",
        doctor["staff_id"],
    )
    await slot_service.release_slot(slot_id, staff, conn=db_conn)
    status = await db_conn.fetchval("select status from appointment_slots where id = $1", slot_id)
    assert status == "빈시간"


@pytest.mark.asyncio
async def test_only_one_concurrent_booking_succeeds(db_pool):
    async with db_pool.acquire() as setup_conn:
        admin_auth_id = await _seed_admin(setup_conn)
        doctor_id = await _seed_doctor(setup_conn)
        slot_id = await setup_conn.fetchval(
            "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-02', '10:00') returning id",
            doctor_id,
        )

    admin_a = StaffContext(id=None, auth_user_id=admin_auth_id, role="admin", department_id=None)
    admin_b = StaffContext(id=None, auth_user_id=admin_auth_id, role="admin", department_id=None)

    results = await asyncio.gather(
        slot_service.book_slot(slot_id, admin_a),
        slot_service.book_slot(slot_id, admin_b),
    )

    assert sorted(results) == [False, True]


async def _seed_admin(conn) -> "uuid.UUID":
    import uuid

    auth_user_id = uuid.uuid4()
    await conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_user_id, f"{auth_user_id}@test.local",
    )
    await conn.execute(
        "insert into staff (auth_user_id, name, role) values ($1, 'Concurrency Admin', 'admin')",
        auth_user_id,
    )
    return auth_user_id


async def _seed_doctor(conn) -> "uuid.UUID":
    import uuid

    auth_user_id = uuid.uuid4()
    await conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_user_id, f"{auth_user_id}@test.local",
    )
    return await conn.fetchval(
        "insert into staff (auth_user_id, name, role) values ($1, 'Concurrency Doctor', 'doctor') returning id",
        auth_user_id,
    )
