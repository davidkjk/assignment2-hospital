from datetime import date
from unittest.mock import patch, MagicMock
import uuid, pytest
from app.core.patient_security import PatientContext
from app.services import patient_profile_service
from tests.conftest import seed_patient, set_session_auth

# ⚠️ register_profile/deactivate_self는 자기 커넥션(get_pool/acquire_as)을 연다 → db_conn 미커밋 데이터는
#    안 보이고, auth.users insert는 authenticated 역할로 막힌다. 시딩은 committed_conn(postgres·autocommit)으로.


def _mock_verified_phone(phone):
    m = MagicMock(); m.auth.admin.get_user_by_id.return_value.user.phone = phone; return m


@pytest.mark.asyncio
async def test_register_links_single_unlinked_match(committed_conn):
    # [R5-05] 검증번호+생년월일+이름이 일치하는 미연결 1건이면 새 행을 만들지 않고 연결(과거 이력 승계).
    legacy = await committed_conn.fetchval("insert into patients (name, birth_date, gender, phone) values ('홍길동','1985-03-01','M','01012345678') returning id")
    uid = uuid.uuid4()
    await committed_conn.execute("insert into auth.users (id,email,aud,role,created_at,updated_at) values ($1,$2,'authenticated','authenticated',now(),now())", uid, f"{uid}@test.local")
    with patch("app.services.patient_profile_service.get_admin_client", return_value=_mock_verified_phone("01012345678")):
        pid = await patient_profile_service.register_profile(auth_user_id=uid, name="홍길동", birth_date=date(1985,3,1), gender="M")
    assert pid == legacy
    assert await committed_conn.fetchval("select count(*) from patients where phone='01012345678'") == 1


@pytest.mark.asyncio
async def test_register_new_row_when_ambiguous(committed_conn):
    # [R5-05] 후보 0건 또는 2건 이상이면 자동 연결하지 않고 새 행(관리자 수동 병합 대상).
    for _ in range(2):
        await committed_conn.execute("insert into patients (name,birth_date,gender,phone) values ('홍길동','1985-03-01','M','01012345678')")
    uid = uuid.uuid4()
    await committed_conn.execute("insert into auth.users (id,email,aud,role,created_at,updated_at) values ($1,$2,'authenticated','authenticated',now(),now())", uid, f"{uid}@test.local")
    with patch("app.services.patient_profile_service.get_admin_client", return_value=_mock_verified_phone("01012345678")):
        await patient_profile_service.register_profile(auth_user_id=uid, name="홍길동", birth_date=date(1985,3,1), gender="M")
    assert await committed_conn.fetchval("select count(*) from patients where phone='01012345678'") == 3


@pytest.mark.asyncio
async def test_deactivate_self_bans_and_inactivates(committed_conn):
    p = await seed_patient(committed_conn)
    fake = MagicMock()
    with patch("app.services.patient_profile_service.get_admin_client", return_value=fake):
        await patient_profile_service.deactivate_self(PatientContext(id=p["patient_id"], auth_user_id=p["auth_user_id"]))
    fake.auth.admin.update_user_by_id.assert_called_once()
    assert await committed_conn.fetchval("select is_active from patients where id=$1", p["patient_id"]) is False


@pytest.mark.asyncio
async def test_patient_cannot_directly_update_sensitive_columns(db_conn):
    # [SDB-18] 직접 UPDATE 정책 없음 — auth_user_id·is_active 자가변경/자가재활성 불가.
    # RLS는 정책 없는 UPDATE를 예외가 아니라 0행으로 조용히 막는다.
    p = await seed_patient(db_conn); await set_session_auth(db_conn, p["auth_user_id"])
    res = await db_conn.execute("update patients set is_active = false where id=$1", p["patient_id"])
    assert res == "UPDATE 0"
