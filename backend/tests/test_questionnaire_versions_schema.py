"""[Task 22a][QADM-*] 문진표 불변 버전 스키마 — 결정 12(덮어쓰지 않고 새 버전).

⚠️ 00008이 정확히 반대(진료과당 1행 upsert)로 못박아 뒀던 자리다. 00046이 그 unique
   제약을 뒤집고, 불변 트리거·부분 unique 인덱스·save_questionnaire_version 원자 함수를 얹는다.
"""
import json

import pytest
from tests.conftest import seed_staff, set_session_auth


async def _dept(conn, name="내과"):
    return await conn.fetchval("insert into departments (name) values ($1) returning id", name)


async def _save(conn, dept_id, questions, base_version_id, staff_id):
    return await conn.fetchval(
        "select save_questionnaire_version($1, $2::jsonb, $3, $4)",
        dept_id, json.dumps(questions), base_version_id, staff_id,
    )


@pytest.mark.asyncio
async def test_QADM_VERSION_01_저장은_덮어쓰지_않고_새_행을_만든다(db_conn):
    """[QADM-VERSION-01] 결정 12 — 기존 활성 행을 수정하지 않는다.

    ⚠️ 00008이 정확히 반대(진료과당 1행 upsert)로 못박아 뒀던 자리다.
    """
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await _dept(db_conn)

    v1 = await _save(db_conn, dept_id, [{"id": "Q-A-01", "text": "가", "type": "short_text", "required": False, "show_to": "all"}], None, admin["staff_id"])
    v2 = await _save(db_conn, dept_id, [{"id": "Q-A-01", "text": "가(수정)", "type": "short_text", "required": False, "show_to": "all"}], v1, admin["staff_id"])

    assert v1 != v2
    rows = await db_conn.fetch(
        "select id, version_no, is_active, questions from questionnaire_templates where department_id = $1 order by version_no",
        dept_id,
    )
    assert [r["version_no"] for r in rows] == [1, 2]
    assert [r["is_active"] for r in rows] == [False, True]
    # ⭐ v1의 질문 글자가 그대로다 — 이것이 「참조가 곧 스냅샷」의 근거다
    assert json.loads(rows[0]["questions"])[0]["text"] == "가"


@pytest.mark.asyncio
async def test_QADM_VERSION_01_활성_버전은_진료과당_하나뿐이다(db_conn):
    """[QADM-VERSION-01] `현재 사용` 배지가 두 개 뜨는 화면은 있을 수 없다.

    부분 unique 인덱스로 DB가 스스로 지킨다 — 서비스 코드의 성실함에 기대지 않는다.
    """
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await _dept(db_conn)
    v1 = await _save(db_conn, dept_id, [], None, admin["staff_id"])
    await _save(db_conn, dept_id, [], v1, admin["staff_id"])

    with pytest.raises(Exception):
        await db_conn.execute(
            "update questionnaire_templates set is_active = true where department_id = $1 and version_no = 1",
            dept_id,
        )


@pytest.mark.asyncio
async def test_AD_065_과거_버전은_지울_수도_고칠_수도_없다(db_conn):
    """[QADM-VERSION-01][AD-065] 「안 만드는 것」도 결정이므로 테스트로 못박는다.

    과거 답변이 당시 문항을 계속 가리켜야 하므로 삭제·숨김 기능을 신설하지 않는다.
    API를 안 만드는 것만으로는 부족하다 — psql·다른 서비스가 우회로가 된다.
    """
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await _dept(db_conn)
    v1 = await _save(db_conn, dept_id, [{"id": "Q-A-01", "text": "가", "type": "short_text", "required": False, "show_to": "all"}], None, admin["staff_id"])

    with pytest.raises(Exception):
        await db_conn.execute("delete from questionnaire_templates where id = $1", v1)
    with pytest.raises(Exception):
        await db_conn.execute("update questionnaire_templates set questions = '[]'::jsonb where id = $1", v1)
    with pytest.raises(Exception):
        await db_conn.execute("update questionnaire_templates set version_no = 99 where id = $1", v1)


@pytest.mark.asyncio
async def test_AD_066_버전에_이름_칸이_없다(db_conn):
    """[QADM-VERSION-03][AD-066] 번호·저장 시각·저장 직원으로만 식별한다.

    칸이 있으면 누군가 반드시 채운다. 그래서 칸 자체를 두지 않는다.
    """
    cols = [r["column_name"] for r in await db_conn.fetch(
        "select column_name from information_schema.columns where table_name = 'questionnaire_templates'"
    )]
    assert "version_label" not in cols
    assert "name" not in cols
    assert {"version_no", "is_active", "created_at", "created_by"} <= set(cols)


@pytest.mark.asyncio
async def test_QADM_FORM_09_문항은_0개도_30개도_되지만_31개는_안_된다(db_conn):
    """[QADM-FORM-09][QADM-VERSION-07] 0개는 「문진을 받지 않는다」는 정상 상태다.

    0을 막으면 문진을 그만두는 유일한 방법이 「버전 삭제」가 되어 AD-065와 정면충돌한다.
    """
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await _dept(db_conn)

    v0 = await _save(db_conn, dept_id, [], None, admin["staff_id"])
    assert v0 is not None

    q30 = [{"id": f"Q-{i:02d}", "text": f"질문{i}", "type": "short_text", "required": False, "show_to": "all"} for i in range(30)]
    v30 = await _save(db_conn, dept_id, q30, v0, admin["staff_id"])
    assert v30 is not None

    q31 = q30 + [{"id": "Q-30", "text": "하나 더", "type": "short_text", "required": False, "show_to": "all"}]
    with pytest.raises(Exception):
        await _save(db_conn, dept_id, q31, v30, admin["staff_id"])


@pytest.mark.asyncio
async def test_QADM_SAVE_05_먼저_저장한_사람이_이긴다(db_conn):
    """[QADM-SAVE-05] P-07 — 최신 서버 상태가 우선이다.

    두 관리자가 같은 진료과를 열어 두는 일은 드물지 않다. 낡은 base_version_id로
    저장하면 상대의 버전을 **소리 없이 덮어쓴다** — 불변 버전이라 데이터는 남지만
    「현재 사용」이 조용히 바뀌는 것은 여전히 사고다.
    """
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await _dept(db_conn)
    v1 = await _save(db_conn, dept_id, [], None, admin["staff_id"])
    await _save(db_conn, dept_id, [], v1, admin["staff_id"])  # 다른 관리자가 v2를 만들었다

    with pytest.raises(Exception):  # 내 화면은 아직 v1을 base로 들고 있다
        await _save(db_conn, dept_id, [], v1, admin["staff_id"])


@pytest.mark.asyncio
async def test_QADM_VERSION_06_과거_답변은_당시_버전을_그대로_가리킨다(db_conn):
    """[QADM-VERSION-06][QADM-FORM-03] 질문 글자를 고쳐도 과거 기록이 안 바뀐다.

    ⭐ answers에 질문 글자를 복사해 넣는 이중 보관을 **하지 않는** 근거가 이 테스트다.
    행이 불변이므로 template_id 참조가 곧 스냅샷이다.
    """
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await _dept(db_conn)
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    v1 = await _save(db_conn, dept_id, [{"id": "Q-A-01", "text": "원래 질문", "type": "short_text", "required": False, "show_to": "all"}], None, admin["staff_id"])

    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '진료중', 'staff', $4) returning id
        """,
        patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    await db_conn.execute(
        "insert into questionnaire_responses (appointment_id, template_id, answers) values ($1, $2, $3::jsonb)",
        appointment_id, v1, '{"Q-A-01": "답"}',
    )

    await _save(db_conn, dept_id, [{"id": "Q-A-01", "text": "고친 질문", "type": "short_text", "required": False, "show_to": "all"}], v1, admin["staff_id"])

    await set_session_auth(db_conn, doctor["auth_user_id"])
    row = await db_conn.fetchrow(
        """
        select t.questions from questionnaire_responses r
        join questionnaire_templates t on t.id = r.template_id
        where r.appointment_id = $1
        """,
        appointment_id,
    )
    assert json.loads(row["questions"])[0]["text"] == "원래 질문"


@pytest.mark.asyncio
async def test_QADM_SHELL_01_관리자만_양식을_바꾼다(db_conn):
    """[QADM-SHELL-01][ROLE-ADM-03] 메뉴를 숨기는 것으로 끝내지 않는다.

    00007의 admin_can_manage_templates가 최종 방어선이다 — 화면·API를 모두 지나쳐도
    DB가 거절한다.
    """
    doctor = await seed_staff(db_conn, role="doctor")
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await _dept(db_conn)

    await set_session_auth(db_conn, doctor["auth_user_id"])
    with pytest.raises(Exception):
        await _save(db_conn, dept_id, [], None, doctor["staff_id"])
