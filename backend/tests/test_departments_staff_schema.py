import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_departments_table_has_is_active_column(db_conn):
    row = await db_conn.fetchrow(
        "select column_name from information_schema.columns "
        "where table_name = 'departments' and column_name = 'is_active'"
    )
    assert row is not None


@pytest.mark.asyncio
async def test_active_staff_can_read_departments(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await db_conn.execute("insert into departments (name) values ('내과')")
    await set_session_auth(db_conn, admin["auth_user_id"])

    rows = await db_conn.fetch("select * from departments")
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_receptionist_cannot_create_department(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, receptionist["auth_user_id"])

    with pytest.raises(Exception):
        await db_conn.execute("insert into departments (name) values ('정형외과')")


@pytest.mark.asyncio
async def test_inactive_staff_cannot_read_staff_list(db_conn):
    inactive = await seed_staff(db_conn, role="receptionist", is_active=False)
    await set_session_auth(db_conn, inactive["auth_user_id"])

    rows = await db_conn.fetch("select * from staff")
    assert rows == []
