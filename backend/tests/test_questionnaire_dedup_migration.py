import pytest

from tests.conftest import seed_staff


@pytest.mark.asyncio
async def test_dedup_repoints_responses_before_deleting_duplicate_template(db_conn):
    """[정합성 검토 R5-09] 정리 대상(오래된) 템플릿을 이미 questionnaire_responses가 참조하고
    있어도, 00008 마이그레이션의 정리 스텝이 FK 위반 없이 끝나야 한다. UNIQUE 제약이 이미 걸린
    스키마에서는 중복을 직접 만들 수 없으므로, 제약을 임시로 뗀 뒤 마이그레이션의 정리 SQL만
    재현해 검증한다."""
    dept_id = await db_conn.fetchval("insert into departments (name) values ('소아과') returning id")

    await db_conn.execute(
        "alter table questionnaire_templates drop constraint questionnaire_templates_department_id_key"
    )
    old_template_id = await db_conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) values ($1, '[{\"text\": \"old\"}]'::jsonb) returning id",
        dept_id,
    )
    new_template_id = await db_conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) values ($1, '[{\"text\": \"new\"}]'::jsonb) returning id",
        dept_id,
    )
    dept_id2 = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor_seed = await seed_staff(db_conn, role="doctor", department_id=dept_id2)
    doctor = doctor_seed["staff_id"]
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $1, $2, $3, '예약확정', 'app')
        returning id
        """,
        patient_id, dept_id2, doctor,
    )
    # 과거 응답이 정리 대상(오래된) 템플릿을 참조하는 상황을 재현한다.
    await db_conn.execute(
        "insert into questionnaire_responses (appointment_id, template_id, answers) values ($1, $2, '[]'::jsonb)",
        appointment_id, old_template_id,
    )

    # 00008 마이그레이션의 정리 SQL을 그대로 재현한다.
    await db_conn.execute(
        """
        update questionnaire_responses r
        set template_id = keep.keep_id
        from (
            select department_id, max(id::text)::uuid as keep_id from questionnaire_templates group by department_id
        ) keep
        join questionnaire_templates t on t.department_id = keep.department_id
        where r.template_id = t.id and t.id <> keep.keep_id
        """
    )
    await db_conn.execute(
        "delete from questionnaire_templates a using questionnaire_templates b "
        "where a.department_id = b.department_id and a.id < b.id"
    )  # FK 위반 없이 끝나야 한다(위 UPDATE로 참조를 먼저 옮겼으므로)

    remaining_rows = await db_conn.fetch(
        "select id from questionnaire_templates where department_id = $1", dept_id,
    )
    assert len(remaining_rows) == 1
    surviving_id = remaining_rows[0]["id"]
    assert surviving_id in (old_template_id, new_template_id)  # 생성 순서를 보장하지 않는 UUID 정렬이라 둘 중 하나만 남으면 됨
    response_template = await db_conn.fetchval(
        "select template_id from questionnaire_responses where appointment_id = $1", appointment_id,
    )
    assert response_template == surviving_id  # 참조가 반드시 살아남은 행으로 옮겨져 있어야 함(삭제된 행을 가리키면 안 됨)

    await db_conn.execute(
        "alter table questionnaire_templates add constraint questionnaire_templates_department_id_key unique (department_id)"
    )
