import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_admin_can_create_template(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await db_conn.fetchval("insert into departments (name) values ('소아과') returning id")

    template_id = await db_conn.fetchval(
        """
        insert into questionnaire_templates (department_id, questions)
        values ($1, '[{"text": "오늘 불편한 증상은?", "type": "text", "required": true}]'::jsonb)
        returning id
        """,
        dept_id,
    )
    assert template_id is not None


@pytest.mark.asyncio
async def test_doctor_cannot_create_template(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await db_conn.fetchval("insert into departments (name) values ('소아과') returning id")

    await set_session_auth(db_conn, doctor["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            """
            insert into questionnaire_templates (department_id, questions)
            values ($1, '[]'::jsonb)
            """,
            dept_id,
        )


@pytest.mark.asyncio
async def test_doctor_cannot_read_other_doctors_questionnaire_response(db_conn):
    """[정합성 검토 R2-02] 사전문진도 doctor_can_view_appointment() 범위를 그대로 따른다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('소아과') returning id")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor_a = await seed_staff(db_conn, role="doctor", department_id=dept_id)
    doctor_b = await seed_staff(db_conn, role="doctor", department_id=dept_id)
    await set_session_auth(db_conn, admin["auth_user_id"])
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor_a["staff_id"], receptionist["staff_id"],
    )
    template_id = await db_conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) values ($1, '[]'::jsonb) returning id",
        dept_id,
    )
    await db_conn.execute(
        "insert into questionnaire_responses (appointment_id, template_id, answers) values ($1, $2, '{}'::jsonb)",
        appointment_id, template_id,
    )

    await set_session_auth(db_conn, doctor_b["auth_user_id"])
    rows = await db_conn.fetch(
        "select id from questionnaire_responses where appointment_id = $1", appointment_id
    )
    assert len(rows) == 0
