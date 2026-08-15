import pytest
from tests.conftest import seed_staff


async def _seed_appointment(conn):
    """지원 요청 컬럼을 붙일 대상 예약 하나를 소유자 역할로 만든다(RLS 우회)."""
    dept_id = await conn.fetchval(
        "insert into departments (name) values ('내과') returning id"
    )
    doctor = await seed_staff(conn, role="doctor", department_id=dept_id)
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appt_id = await conn.fetchval(
        """
        insert into appointments
          (account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $1, $2, $3, '예약확정', 'app')
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"],
    )
    return appt_id


@pytest.mark.asyncio
async def test_support_request_columns_exist_and_default_null(db_conn):
    appt_id = await _seed_appointment(db_conn)
    row = await db_conn.fetchrow(
        "select support_requested_at, request_type from appointments where id = $1",
        appt_id,
    )
    assert row["support_requested_at"] is None
    assert row["request_type"] is None


@pytest.mark.asyncio
async def test_request_type_accepts_cancel_and_change(db_conn):
    appt_id = await _seed_appointment(db_conn)
    await db_conn.execute(
        "update appointments set support_requested_at = now(), request_type = '취소' where id = $1",
        appt_id,
    )
    await db_conn.execute("update appointments set request_type = '변경' where id = $1", appt_id)
    val = await db_conn.fetchval("select request_type from appointments where id = $1", appt_id)
    assert val == '변경'


@pytest.mark.asyncio
async def test_request_type_rejects_unknown_value(db_conn):
    appt_id = await _seed_appointment(db_conn)
    with pytest.raises(Exception):
        await db_conn.execute(
            "update appointments set request_type = '반려' where id = $1", appt_id
        )
