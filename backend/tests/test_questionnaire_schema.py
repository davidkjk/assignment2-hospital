import json

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


@pytest.mark.asyncio
async def test_second_template_for_same_department_rejected(db_conn):
    """[00046] 같은 진료과에 (버전 번호 없이) 두 번째 행을 직접 INSERT하면 거부된다.

    ~~[R5-09] 진료과당 두 번째 행 자체를 unique (department_id)로 막는다~~
    ✅ **뒤집힘(결정 12 / 00046)** — 이제는 여러 버전이 정상이고, 대신 unique (department_id,
    version_no)가 지킨다. 직접 INSERT 두 번은 default 1로 같은 version_no가 되어 충돌한다
    (실제 저장은 save_questionnaire_version이 max+1로 번호를 올려 이 경로를 쓰지 않는다).
    """
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await db_conn.fetchval("insert into departments (name) values ('소아과') returning id")
    await db_conn.execute(
        "insert into questionnaire_templates (department_id, questions) values ($1, '[]'::jsonb)",
        dept_id,
    )

    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into questionnaire_templates (department_id, questions) values ($1, '[]'::jsonb)",
            dept_id,
        )


@pytest.mark.asyncio
async def test_new_version_supersedes_previous_active(db_conn):
    """[결정 12 / 00046] 저장하면 upsert로 덮어쓰지 않고 새 불변 버전을 만들어 즉시 활성화한다.

    ~~[R5-09] on conflict (department_id) upsert로 유일한 행을 갱신한다~~
    ✅ **뒤집힘(2026-08-10, 결정 12 / 00046)** — 덮어쓰기가 과거 답변이 가리키는 문항 글자를
    슬그머니 바꾸던 문제 때문에 「진료과당 1행 upsert」를 폐기하고 불변 버전으로 갔다. 이제
    save_questionnaire_version이 옛 버전은 읽기 전용으로 보존한 채 새 활성 버전을 올린다.
    """
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await db_conn.fetchval("insert into departments (name) values ('소아과') returning id")

    v1 = await db_conn.fetchval(
        "select save_questionnaire_version($1, $2::jsonb, $3, $4)",
        dept_id, '[{"text": "old"}]', None, admin["staff_id"],
    )
    await db_conn.fetchval(
        "select save_questionnaire_version($1, $2::jsonb, $3, $4)",
        dept_id, '[{"text": "new"}]', v1, admin["staff_id"],
    )

    rows = await db_conn.fetch(
        "select questions, is_active from questionnaire_templates where department_id = $1 order by version_no",
        dept_id,
    )
    # 덮어쓰지 않았다 — 옛 버전은 그대로 남고(읽기 전용), 활성은 하나뿐이며 최신 글자를 가리킨다.
    assert len(rows) == 2
    assert [r["is_active"] for r in rows] == [False, True]
    assert json.loads(rows[0]["questions"])[0]["text"] == "old"
    assert json.loads(rows[1]["questions"])[0]["text"] == "new"
