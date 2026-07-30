import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_hospital_settings_is_singleton(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])

    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into hospital_settings (id, cancellation_deadline_hours) values (false, 12)"
        )


@pytest.mark.asyncio
async def test_receptionist_cannot_read_error_log(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, receptionist["auth_user_id"])

    rows = await db_conn.fetch("select * from system_error_log")
    assert rows == []


@pytest.mark.asyncio
async def test_staff_can_insert_internal_note_for_self(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, receptionist["auth_user_id"])
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )

    note_id = await db_conn.fetchval(
        "insert into patient_internal_notes (patient_id, staff_id, content) values ($1, $2, '연락처 확인 필요') returning id",
        patient_id, receptionist["staff_id"],
    )
    assert note_id is not None
