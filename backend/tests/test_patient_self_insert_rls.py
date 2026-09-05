"""[보안 F-05 벡터2] 환자 자가 INSERT RLS 봉인 — 동의 불변식 우회 경로 제거.

정본: docs/security-audit-2026-09-04/ F-05(Medium, confirmed).
00017의 patients_can_register_self / patients_can_insert_family_members가 authenticated
자가 INSERT를 허용해, 환자가 Supabase Data API로 patients에 직접 행을 만들어(동의 0건)
활성 환자 권한을 얻을 수 있었다. 정상 가입·가족추가는 백엔드(service-role)만 거치므로
이 RLS 정책들을 없앤다. 직원 등록 정책(receptionist_admin_can_insert_patients)은 유지.
"""
import uuid
import pytest
import asyncpg

from app.db.pool import acquire_as


@pytest.mark.asyncio
async def test_authenticated_patient_cannot_self_insert_patient_row(committed_conn):
    # F-05 v2: authenticated 세션(환자 JWT)이 patients에 직접 insert하면 RLS로 막혀야 한다.
    auth_id = await committed_conn.fetchval(
        "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
        f"self-insert-{uuid.uuid4().hex}@test.local")
    async with acquire_as(str(auth_id)) as conn:
        with pytest.raises(asyncpg.PostgresError):
            await conn.execute(
                "insert into patients (auth_user_id, name, birth_date, gender, phone) "
                "values ($1, '우회가입', '1980-01-01', 'F', '01000000000')", auth_id)


@pytest.mark.asyncio
async def test_authenticated_cannot_insert_family_patient_row(committed_conn):
    # F-05 v2: authenticated 세션이 auth_user_id=null 가족 프로필도 직접 insert할 수 없어야 한다.
    auth_id = await committed_conn.fetchval(
        "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
        f"fam-insert-{uuid.uuid4().hex}@test.local")
    async with acquire_as(str(auth_id)) as conn:
        with pytest.raises(asyncpg.PostgresError):
            await conn.execute(
                "insert into patients (auth_user_id, name, birth_date, gender, phone) "
                "values (null, '우회가족', '1950-01-01', 'F', null)")
