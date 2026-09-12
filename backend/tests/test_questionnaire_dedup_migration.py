"""[00008 → 00046] 진료과당 1행 dedup은 결정 12로 폐기됐다.

~~[정합성 검토 R5-09] 00008은 진료과당 중복 행을 정리하고 unique (department_id)를 걸었다.
그 정리 SQL이 questionnaire_responses의 참조를 삭제 전에 옮겨 FK 위반을 피하는지 검증했다.~~
✅ **뒤집힘(2026-08-10, 결정 12 / 00046)** — 문진표를 불변 버전으로 바꾸면서 「진료과당 1행」
자체를 폐기했다. 이제는 여러 버전이 정상이고, 과거 답변이 가리키는 버전 행은 **삭제되지
않는다**(AD-065 트리거가 delete 자체를 막는다). 그래서 옛 dedup의 「참조를 옮기고 삭제」라는
전제가 통째로 사라졌다 — 이 파일은 그 폐기를 못박는다.
"""
import pytest

from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_old_single_row_unique_constraint_is_gone(db_conn):
    """[00046] 00008의 unique (department_id) 제약이 더는 없다(다중 버전이 정상이 됐다)."""
    exists = await db_conn.fetchval(
        "select count(*) from pg_constraint where conname = 'questionnaire_templates_department_id_key'"
    )
    assert exists == 0


@pytest.mark.asyncio
async def test_version_rows_cannot_be_deleted_so_dedup_cannot_recur(db_conn):
    """[AD-065 / 00046] 옛 dedup은 중복 행을 delete했다 — 이제 그 delete 자체가 금지된다.

    과거 답변이 당시 문항을 계속 가리켜야 하므로 어떤 버전 행도 지울 수 없다.
    「참조를 옮기고 삭제」라는 dedup의 전제가 성립할 수 없다.
    """
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await db_conn.fetchval("insert into departments (name) values ('소아과') returning id")
    v1 = await db_conn.fetchval(
        "select save_questionnaire_version($1, $2::jsonb, $3, $4)",
        dept_id, '[{"id": "Q-A-01", "text": "가"}]', None, admin["staff_id"],
    )

    with pytest.raises(Exception):
        await db_conn.execute("delete from questionnaire_templates where id = $1", v1)
