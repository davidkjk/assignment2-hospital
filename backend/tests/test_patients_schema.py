import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_receptionist_can_register_patient(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, receptionist["auth_user_id"])

    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    assert patient_id is not None


@pytest.mark.asyncio
async def test_doctor_cannot_register_patient(db_conn):
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, doctor["auth_user_id"])

    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678')"
        )


@pytest.mark.asyncio
async def test_receptionist_can_read_patients(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678')"
    )

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    rows = await db_conn.fetch("select * from patients")
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_doctor_cannot_read_patients_without_appointment_link(db_conn):
    """[정합성 검토 SDB-06] 이 마이그레이션(Task 3) 시점에는 appointments가 아직 없어 의사에게
    범위 제한된 조회 권한을 줄 수 없다. 의사의 담당 환자 조회 권한은 Task 4에서
    doctor_can_view_patient()와 함께 추가되며, 그때 별도 테스트로 검증한다."""
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678')"
    )

    await set_session_auth(db_conn, doctor["auth_user_id"])
    rows = await db_conn.fetch("select * from patients")
    assert len(rows) == 0
