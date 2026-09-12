import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_hospital_settings_has_wait_threshold(db_conn):
    value = await db_conn.fetchval("select long_wait_threshold_minutes from hospital_settings")
    assert value == 30


@pytest.mark.asyncio
async def test_doctor_can_create_own_quick_phrase(db_conn):
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, doctor["auth_user_id"])

    phrase_id = await db_conn.fetchval(
        "insert into doctor_quick_phrases (doctor_id, text) values ($1, '충분한 휴식과 수분 섭취를 권장합니다') returning id",
        doctor["staff_id"],
    )
    assert phrase_id is not None


@pytest.mark.asyncio
async def test_doctor_cannot_create_phrase_for_other_doctor(db_conn):
    doctor_a = await seed_staff(db_conn, role="doctor")
    doctor_b = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, doctor_a["auth_user_id"])

    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into doctor_quick_phrases (doctor_id, text) values ($1, '문구')",
            doctor_b["staff_id"],
        )


@pytest.mark.asyncio
async def test_receptionist_can_read_but_not_write_phrases(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, doctor["auth_user_id"])
    await db_conn.execute(
        "insert into doctor_quick_phrases (doctor_id, text) values ($1, '문구')", doctor["staff_id"],
    )

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    rows = await db_conn.fetch("select * from doctor_quick_phrases")
    assert len(rows) == 1

    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into doctor_quick_phrases (doctor_id, text) values ($1, '새문구')", doctor["staff_id"],
        )
