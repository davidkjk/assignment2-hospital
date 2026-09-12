import pytest
from tests.conftest import seed_staff, set_session_auth


async def _seed_staff_and_patient(conn):
    staff = await seed_staff(conn, role="receptionist")
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    return staff, patient_id


@pytest.mark.asyncio
async def test_phone_reveal_is_accepted(db_conn):
    # access_audit_log의 SELECT 정책은 admin 전용(admin_can_read_audit_log)이라,
    # INSERT ... RETURNING은 접수 담당자 세션에서 RLS로 막힌다(RETURNING도 SELECT
    # 정책을 통과해야 하는 Postgres RLS 동작). 이 테스트가 검증할 것은 오직
    # resource_type CHECK 제약이므로 RETURNING 없이 삽입하고, 삽입 성공 여부는
    # RLS를 우회하는 postgres 역할로 되돌려 직접 확인한다.
    staff, patient_id = await _seed_staff_and_patient(db_conn)
    await set_session_auth(db_conn, staff["auth_user_id"])
    await db_conn.execute(
        "insert into access_audit_log (staff_id, patient_id, resource_type) "
        "values ($1, $2, 'phone_reveal')",
        staff["staff_id"], patient_id,
    )
    await db_conn.execute("reset role")
    count = await db_conn.fetchval(
        "select count(*) from access_audit_log where patient_id = $1 and resource_type = 'phone_reveal'",
        patient_id,
    )
    assert count == 1


@pytest.mark.asyncio
async def test_existing_resource_types_still_accepted(db_conn):
    staff, patient_id = await _seed_staff_and_patient(db_conn)
    await set_session_auth(db_conn, staff["auth_user_id"])
    await db_conn.execute(
        "insert into access_audit_log (staff_id, patient_id, resource_type) "
        "values ($1, $2, 'patient_detail')",
        staff["staff_id"], patient_id,
    )
    await db_conn.execute("reset role")
    count = await db_conn.fetchval(
        "select count(*) from access_audit_log where patient_id = $1 and resource_type = 'patient_detail'",
        patient_id,
    )
    assert count == 1


@pytest.mark.asyncio
async def test_unknown_resource_type_rejected(db_conn):
    staff, patient_id = await _seed_staff_and_patient(db_conn)
    await set_session_auth(db_conn, staff["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into access_audit_log (staff_id, patient_id, resource_type) "
            "values ($1, $2, 'phone_number') ",   # 오타/미허용 값
            staff["staff_id"], patient_id,
        )
