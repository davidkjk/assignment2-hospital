import pytest

from tests.conftest import seed_patient, set_session_auth


@pytest.mark.asyncio
async def test_patients_auth_user_id_and_phone_nullable(db_conn):
    # #3 — 전화 없는 가족을 담기 위해 phone은 nullable이어야 한다.
    cols = await db_conn.fetch(
        "select column_name, is_nullable from information_schema.columns "
        "where table_name = 'patients' and column_name in ('auth_user_id','phone')")
    by = {c["column_name"]: c["is_nullable"] for c in cols}
    assert by.get("auth_user_id") == "YES"
    assert by.get("phone") == "YES"
    # 칸은 00044가 순수 uuid로 먼저 뒀고, 00017이 auth.users FK를 더한다(00044의 이월 지시). FK가 실제로 걸렸는지 확인.
    # pg_constraint로 본다 — information_schema.constraint_column_usage는 auth.users(타 스키마) 참조 FK를 노출하지 않는다.
    fk = await db_conn.fetchval(
        "select count(*) from pg_constraint "
        "where conrelid = 'patients'::regclass and contype = 'f' "
        "and confrelid = 'auth.users'::regclass")
    assert fk == 1


@pytest.mark.asyncio
async def test_patient_owns_only_counts_active_links(db_conn):
    # [R5-02] is_active=false 링크는 patient_owns가 인정하지 않는다.
    acct = await seed_patient(db_conn, with_auth=True)
    fam = await seed_patient(db_conn, with_auth=False)
    await db_conn.execute(
        "insert into patient_family_links (account_patient_id, family_patient_id, relation, is_active) "
        "values ($1,$2,'자녀',false)", acct["patient_id"], fam["patient_id"])  # 1단계 00003 칼럼명=relation
    await set_session_auth(db_conn, acct["auth_user_id"])
    owns = await db_conn.fetchval("select patient_owns($1)", fam["patient_id"])
    assert owns is False


@pytest.mark.asyncio
async def test_deactivated_patient_is_blocked_by_current_patient_id(db_conn):
    p = await seed_patient(db_conn, with_auth=True, is_active=False)
    await set_session_auth(db_conn, p["auth_user_id"])
    # 비활성 환자는 current_patient_id()가 NULL → 본인 예약도 못 만든다.
    assert await db_conn.fetchval("select private.current_patient_id()") is None
