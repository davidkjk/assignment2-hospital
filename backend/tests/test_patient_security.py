import time, uuid
import pytest
from fastapi import HTTPException
from jose import jwt
from starlette.requests import Request
from app.core.config import settings
from tests.conftest import seed_patient

# ⚠️ 이 서비스들은 자기 커넥션(acquire_as)을 열어 조회한다 → db_conn(롤백 트랜잭션)의 미커밋 데이터는
#    별도 커넥션에서 안 보인다. 그래서 시딩은 committed_conn(autocommit)으로 한다(autouse cleanup이 뒷정리).


def make_patient_token(auth_user_id: str) -> str:
    return jwt.encode(
        {"sub": auth_user_id, "aud": "authenticated", "role": "authenticated", "exp": int(time.time()) + 3600},
        settings.supabase_jwt_secret, algorithm="HS256")


def _req(token: str) -> Request:
    return Request({"type": "http", "headers": [(b"authorization", f"Bearer {token}".encode())]})


@pytest.mark.asyncio
async def test_get_current_patient_returns_context(committed_conn):
    from app.core.patient_security import get_current_patient
    p = await seed_patient(committed_conn)
    ctx = await get_current_patient(_req(make_patient_token(str(p["auth_user_id"]))))
    assert ctx.id == p["patient_id"]


@pytest.mark.asyncio
async def test_get_current_patient_rejects_unregistered_403(committed_conn):
    from app.core.patient_security import get_current_patient
    uid = uuid.uuid4()
    await committed_conn.execute(
        "insert into auth.users (id, email, aud, role, created_at, updated_at) "
        "values ($1,$2,'authenticated','authenticated',now(),now())", uid, f"{uid}@test.local")
    with pytest.raises(HTTPException) as e:
        await get_current_patient(_req(make_patient_token(str(uid))))
    assert e.value.status_code == 403  # 등록 안 됨/사용중지를 한 문장으로(개인정보 열거 방지)


@pytest.mark.asyncio
async def test_list_accessible_excludes_inactive_links(committed_conn):
    from app.core.patient_security import PatientContext, list_accessible_patient_ids
    me = await seed_patient(committed_conn)
    child = await seed_patient(committed_conn, with_auth=False)
    gone = await seed_patient(committed_conn, with_auth=False)
    await committed_conn.execute("insert into patient_family_links (account_patient_id, family_patient_id, relation, is_active) values ($1,$2,'자녀',true)", me["patient_id"], child["patient_id"])
    await committed_conn.execute("insert into patient_family_links (account_patient_id, family_patient_id, relation, is_active) values ($1,$2,'자녀',false)", me["patient_id"], gone["patient_id"])
    ids = await list_accessible_patient_ids(PatientContext(id=me["patient_id"], auth_user_id=me["auth_user_id"]))
    assert set(ids) == {me["patient_id"], child["patient_id"]}  # [R5-02] 해제 링크(gone) 제외
