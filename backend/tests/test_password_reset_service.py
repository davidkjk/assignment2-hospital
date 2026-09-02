import types
import uuid
import pytest
from app.core.errors import AppError
from app.services import password_reset_service as prs

pytestmark = pytest.mark.asyncio


def _admin_stub():
    stub = types.SimpleNamespace(updated=None)

    # admin_client는 동기(supabase-py) — 서비스도 await 없이 부른다(register_profile과 동일).
    def update_user_by_id(uid, attrs):
        stub.updated = (uid, attrs["password"])

    stub.auth = types.SimpleNamespace(
        admin=types.SimpleNamespace(update_user_by_id=update_user_by_id))
    return stub


async def _seed(conn, name):
    # 00017이 patients.auth_user_id에 auth.users FK를 걸었다 → auth.users 행을 먼저 만든다.
    uid = uuid.uuid4()
    await conn.execute(
        "insert into auth.users (id, email) values ($1, $2)", uid, f"{uid}@test.local")
    await conn.execute(
        "insert into patients (name, birth_date, gender, phone, auth_user_id) "
        "values ($1,'1954-03-02','F','01011112222',$2)", name, uid)
    return uid


async def test_reset_succeeds_with_matching_name(db_conn):
    # AUTH-PWNEW-09b — 이름이 맞으면 서버 경유(admin API)로 비밀번호가 갱신된다
    uid = await _seed(db_conn, '홍길동')
    admin = _admin_stub()
    await prs.verify_name_and_reset(db_conn, admin, uid, name_input='홍길동', new_password='newpass12')
    assert admin.updated == (str(uid), 'newpass12')


async def test_name_match_ignores_spaces(db_conn):
    # AUTH-PWNEW-10 — '홍 길동'과 '홍길동'을 다르다고 하지 않는다(앞뒤·가운데 공백 제거 후 완전일치)
    uid = await _seed(db_conn, '홍길동')
    admin = _admin_stub()
    await prs.verify_name_and_reset(db_conn, admin, uid, name_input='  홍 길동 ', new_password='newpass12')
    assert admin.updated is not None


async def test_wrong_name_raises_without_revealing_stored(db_conn):
    # AUTH-PWNEW-11 — '등록된 이름과 다릅니다' / AUTH-PWNEW-09 — 저장된 이름을 노출하지 않는다
    uid = await _seed(db_conn, '홍길동')
    admin = _admin_stub()
    with pytest.raises(AppError) as e:
        await prs.verify_name_and_reset(db_conn, admin, uid, name_input='김철수', new_password='newpass12')
    assert '등록된 이름과 다릅니다' in str(e.value.message)  # AppError.message가 사람이 읽는 한 줄
    assert '홍길동' not in str(e.value.message)   # 저장 이름 미노출
    assert admin.updated is None                 # 비밀번호를 건드리지 않았다
    cnt = await db_conn.fetchval(
        "select fail_count from password_reset_locks where phone='01011112222'")
    assert cnt == 1


async def test_locks_after_five_wrong_names(db_conn):
    # AUTH-PWNEW-15 — 5회 틀리면 그 번호의 재설정을 잠근다. 이후엔 맞는 이름도 막힌다.
    uid = await _seed(db_conn, '홍길동')
    admin = _admin_stub()
    for _ in range(5):
        with pytest.raises(AppError):
            await prs.verify_name_and_reset(db_conn, admin, uid, name_input='틀림', new_password='newpass12')
    with pytest.raises(AppError) as e:
        await prs.verify_name_and_reset(db_conn, admin, uid, name_input='홍길동', new_password='newpass12')
    assert e.value.status_code == 423   # 잠김(맞는 이름이어도)
    assert admin.updated is None
