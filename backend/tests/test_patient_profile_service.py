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
async def test_deactivate는_Auth삭제와_SQL을_함께_한다(committed_conn):
    """[SET-QUIT-09][갭 #64] 탈퇴 = ① Auth 계정 삭제(admin) ② SQL로 auth_user_id 비우기·흔적.
    둘 다 해야 「번호는 풀리고 흔적은 남는」 B-37 상태가 된다(옛 ban 방식에서 뒤집음)."""
    p = await seed_patient(committed_conn)
    fake = MagicMock()
    with patch("app.services.patient_profile_service.get_admin_client", return_value=fake):
        await patient_profile_service.deactivate_self(
            PatientContext(id=p["patient_id"], auth_user_id=p["auth_user_id"]))
    fake.auth.admin.delete_user.assert_called_once_with(str(p["auth_user_id"]))  # ① Auth 삭제
    row = await committed_conn.fetchrow(
        "select is_active, auth_user_id, former_auth_user_id from patients where id=$1", p["patient_id"])
    assert row["is_active"] is False
    assert row["auth_user_id"] is None                          # ② SQL 반영
    assert row["former_auth_user_id"] == p["auth_user_id"]      # 흔적


@pytest.mark.asyncio
async def test_차단이_있으면_Auth를_건드리기_전에_멈춘다(committed_conn):
    """[SET-QUIT-11] 차단이면 SQL이 예외 → Auth를 삭제하지 않는다(부분 실행 방지)."""
    p = await seed_patient(committed_conn)
    dept = await committed_conn.fetchval("insert into departments (name) values ('차단과') returning id")
    doc_uid = await committed_conn.fetchval(
        "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id", f"d-{dept}@test.local")
    doctor = await committed_conn.fetchval(
        "insert into staff (auth_user_id, name, role, department_id, is_active) "
        "values ($1,'의사','doctor',$2,true) returning id", doc_uid, dept)
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, current_date + 3, '10:00', '예약됨') returning id", doctor)
    await committed_conn.execute(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source) "
        "values ($1,$2,$2,$3,$4,'감기','예약확정','app')", slot, p["patient_id"], dept, doctor)
    fake = MagicMock()
    with patch("app.services.patient_profile_service.get_admin_client", return_value=fake):
        with pytest.raises(Exception):
            await patient_profile_service.deactivate_self(
                PatientContext(id=p["patient_id"], auth_user_id=p["auth_user_id"]))
    fake.auth.admin.delete_user.assert_not_called()               # Auth 안 건드림


@pytest.mark.asyncio
async def test_patient_cannot_directly_update_sensitive_columns(db_conn):
    # [SDB-18] 직접 UPDATE 정책 없음 — auth_user_id·is_active 자가변경/자가재활성 불가.
    # RLS는 정책 없는 UPDATE를 예외가 아니라 0행으로 조용히 막는다.
    p = await seed_patient(db_conn); await set_session_auth(db_conn, p["auth_user_id"])
    res = await db_conn.execute("update patients set is_active = false where id=$1", p["patient_id"])
    assert res == "UPDATE 0"
