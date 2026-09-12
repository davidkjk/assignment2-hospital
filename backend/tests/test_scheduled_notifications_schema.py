import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_defaults_and_status_check(db_conn):
    staff = await seed_staff(db_conn, role="admin")
    row = await db_conn.fetchrow(
        "insert into scheduled_notifications (notification_type, scheduled_at, created_by) "
        "values ('promo', now() + interval '1 day', $1) returning status, kind",
        staff["staff_id"],
    )
    assert row["status"] == "pending"
    assert row["kind"] == "transactional"


@pytest.mark.asyncio
async def test_status_rejects_unknown(db_conn):
    staff = await seed_staff(db_conn, role="admin")
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into scheduled_notifications (notification_type, scheduled_at, created_by, status) "
            "values ('promo', now(), $1, '보냄')",
            staff["staff_id"],
        )


@pytest.mark.asyncio
async def test_staff_can_read_receptionist_can_insert_doctor_cannot(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    await db_conn.execute(
        "insert into scheduled_notifications (notification_type, scheduled_at, created_by) "
        "values ('promo', now() + interval '1 hour', $1)",
        receptionist["staff_id"],
    )
    rows = await db_conn.fetch("select * from scheduled_notifications")
    assert len(rows) == 1

    await set_session_auth(db_conn, doctor["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into scheduled_notifications (notification_type, scheduled_at, created_by) "
            "values ('promo', now(), $1)",
            doctor["staff_id"],
        )
