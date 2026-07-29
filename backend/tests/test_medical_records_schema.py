import pytest
from tests.conftest import seed_staff, set_session_auth


async def _seed_appointment_for_doctor(conn, doctor_id, receptionist_id, status="진료중"):
    dept_id = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    # 담당의 소속 진료과와 예약 진료과가 일치해야 하므로(trg_enforce_appointment_consistency),
    # doctor_id에 해당 department_id를 부여한다.
    await conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor_id)
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appointment_id = await conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, $4, 'staff', $5)
        returning id
        """,
        patient_id, dept_id, doctor_id, status, receptionist_id,
    )
    return appointment_id


@pytest.mark.asyncio
async def test_doctor_can_create_own_medical_record(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    appointment_id = await _seed_appointment_for_doctor(db_conn, doctor["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor["auth_user_id"])
    record_id = await db_conn.fetchval(
        "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침') returning id",
        appointment_id, doctor["staff_id"],
    )
    assert record_id is not None


@pytest.mark.asyncio
async def test_other_doctor_cannot_create_record_for_appointment(db_conn):
    """치명적 규칙은 DB가 최종 심판 — doctor_id를 자기 id로 채워도 '남의 예약'이면 트리거가 거부한다."""
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor_a = await seed_staff(db_conn, role="doctor")
    doctor_b = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    appointment_id = await _seed_appointment_for_doctor(db_conn, doctor_a["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor_b["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침')",
            appointment_id, doctor_b["staff_id"],
        )


@pytest.mark.asyncio
async def test_receptionist_can_read_but_not_insert_records(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    appointment_id = await _seed_appointment_for_doctor(db_conn, doctor["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor["auth_user_id"])
    await db_conn.execute(
        "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침')",
        appointment_id, doctor["staff_id"],
    )

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    rows = await db_conn.fetch("select * from medical_records")
    assert len(rows) == 1

    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침')",
            appointment_id, doctor["staff_id"],
        )


@pytest.mark.asyncio
async def test_doctor_cannot_read_other_doctors_medical_record(db_conn):
    """[정합성 검토 R2-02] 의사는 본인 담당이 아닌 예약의 진료기록을 조회할 수 없다."""
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor_a = await seed_staff(db_conn, role="doctor")
    doctor_b = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    appointment_id = await _seed_appointment_for_doctor(db_conn, doctor_a["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor_a["auth_user_id"])
    await db_conn.execute(
        "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침')",
        appointment_id, doctor_a["staff_id"],
    )

    await set_session_auth(db_conn, doctor_b["auth_user_id"])
    rows = await db_conn.fetch("select id from medical_records where appointment_id = $1", appointment_id)
    assert len(rows) == 0


@pytest.mark.asyncio
async def test_completed_record_direct_update_blocked_but_rpc_allowed(db_conn):
    """완료된 기록은 직접 UPDATE로 우회할 수 없고, revise_medical_record() RPC로만 고칠 수 있다."""
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    appointment_id = await _seed_appointment_for_doctor(db_conn, doctor["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor["auth_user_id"])
    record_id = await db_conn.fetchval(
        "insert into medical_records (appointment_id, doctor_id, symptoms, is_completed) "
        "values ($1, $2, '기침', true) returning id",
        appointment_id, doctor["staff_id"],
    )
    expected_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id
    )

    # Use savepoint to handle transaction abort
    sp = db_conn.transaction()
    await sp.start()
    with pytest.raises(Exception):
        await db_conn.execute(
            "update medical_records set symptoms = '몰래 수정' where id = $1", record_id
        )
    await sp.rollback()

    await db_conn.execute(
        "select revise_medical_record($1, '기침(수정)', null, null, null, '오타 수정', $2)",
        record_id, expected_updated_at,
    )
    row = await db_conn.fetchrow("select symptoms from medical_records where id = $1", record_id)
    assert row["symptoms"] == "기침(수정)"

    revision_count = await db_conn.fetchval(
        "select count(*) from medical_record_revisions where record_id = $1", record_id
    )
    assert revision_count == 1


@pytest.mark.asyncio
async def test_revise_medical_record_requires_reason_and_checks_optimistic_lock(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    appointment_id = await _seed_appointment_for_doctor(db_conn, doctor["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor["auth_user_id"])
    record_id = await db_conn.fetchval(
        "insert into medical_records (appointment_id, doctor_id, symptoms, is_completed) "
        "values ($1, $2, '기침', true) returning id",
        appointment_id, doctor["staff_id"],
    )
    expected_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id
    )

    with pytest.raises(Exception):  # 사유 없음
        await db_conn.execute(
            "select revise_medical_record($1, '기침(수정)', null, null, null, '', $2)",
            record_id, expected_updated_at,
        )

    with pytest.raises(Exception):  # 낙관적 잠금 위반(오래된 updated_at)
        await db_conn.execute(
            "select revise_medical_record($1, '기침(수정)', null, null, null, '사유', $2)",
            record_id, expected_updated_at - __import__("datetime").timedelta(seconds=1),
        )
