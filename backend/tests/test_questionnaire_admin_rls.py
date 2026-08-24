import pytest
from tests.conftest import seed_staff, set_session_auth


async def _seed_response(conn, doctor_id, receptionist_id):
    """의사 소유 예약 1건 + 그 예약의 문진 응답 1건을 심고 예약 ID를 준다.

    RLS를 켠 채로 심어야 정책이 실제로 도는 것을 본다. 삽입 권한이 있는 역할
    (`receptionist_admin_can_insert_responses` — 접수직원·관리자)의 세션에서 부를 것.
    담당의 소속 진료과와 예약 진료과가 같아야 한다(`trg_enforce_appointment_consistency`).
    """
    dept_id = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    await conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor_id)
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appointment_id = await conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '진료중', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor_id, receptionist_id,
    )
    template_id = await conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) "
        "values ($1, $2::jsonb) returning id",
        dept_id, '[{"id": "Q-SYMPTOM-01", "text": "오늘 가장 불편한 증상을 알려주세요."}]',
    )
    await conn.execute(
        "insert into questionnaire_responses (appointment_id, template_id, answers) "
        "values ($1, $2, $3::jsonb)",
        appointment_id, template_id, '{"Q-SYMPTOM-01": "기침이 2주째 납니다"}',
    )
    return appointment_id


@pytest.mark.asyncio
async def test_00007의_옛_정책이_실제로_사라졌다(db_conn):
    """⭐⭐ 이 마이그레이션이 **조용히 아무것도 안 할 수 있는** 자리다.

    `drop policy if exists`는 이름이 틀려도 오류를 내지 않는다. 이름을 잘못 쓰면
    `private.is_admin()` 예외를 품은 옛 정책이 그대로 남고, **RLS 정책은 OR로 합쳐지므로**
    새 정책을 아무리 좁혀도 관리자는 계속 읽는다. 그래서 이름을 눈이 아니라 검사로 못박는다.
    """
    names = [
        r["policyname"]
        for r in await db_conn.fetch(
            "select policyname from pg_policies where tablename = 'questionnaire_responses'"
        )
    ]
    assert "assigned_doctor_can_read_responses" not in names
    assert "assigned_doctor_can_read_questionnaire_responses" in names


@pytest.mark.asyncio
async def test_관리자는_문진_답변을_DB에서도_못_읽는다(db_conn):
    """[PTDET-QNR-03][AD-050] 결정 #14 — 화면뿐 아니라 DB 레벨에서 막는다.

    00007이 private.is_admin()을 예외로 열어 뒀다. 화면만 막으면 API·psql·
    다른 화면이 우회로가 된다. 근거: 요구사항 420 + 개인정보 최소화(USER-FINAL).
    """
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await _seed_response(db_conn, doctor["staff_id"], receptionist["staff_id"])

    rows = await db_conn.fetch("select * from questionnaire_responses")
    assert rows == []


@pytest.mark.asyncio
async def test_담당_의사는_읽을_수_있다(db_conn):
    """[PTDET-QNR-03] 막는 것이 목적이 아니라 「담당 의사만」이 목적이다.

    ⭐ 이 테스트가 앞 테스트의 짝이다 — 앞의 `rows == []`가 **막혀서 빈 것**인지
    **애초에 안 심겨서 빈 것**인지는 앞 테스트 혼자서는 구별하지 못한다.
    """
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await _seed_response(db_conn, doctor["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor["auth_user_id"])
    assert len(await db_conn.fetch("select * from questionnaire_responses")) == 1


@pytest.mark.asyncio
async def test_접수직원은_진료기록은_읽고_문진_답변은_못_읽는다(db_conn):
    """[ROLE-READ-01][PTDET-QNR-03] 둘은 다른 규칙이다.

    ROLE-READ-01: 접수직원의 진료기록 열람은 "구멍이 아니라 고른 방식" —
    요구사항 :82는 막으라는 것이 아니라 흔적을 남기라는 요구다(ROLE-READ-02).
    문진 답변은 그와 별개로 담당 의사 전용이다.
    """
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    appointment_id = await _seed_response(db_conn, doctor["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor["auth_user_id"])
    await db_conn.execute(
        "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침')",
        appointment_id, doctor["staff_id"],
    )

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    assert len(await db_conn.fetch("select * from medical_records")) == 1
    assert await db_conn.fetch("select * from questionnaire_responses") == []
