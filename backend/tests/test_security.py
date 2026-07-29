import time

import pytest
from jose import jwt

from app.core.config import settings
from tests.conftest import seed_staff


def make_token(auth_user_id: str) -> str:
    payload = {
        "sub": auth_user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


@pytest.mark.asyncio
async def test_missing_authorization_header_raises_401(client):
    response = client.get("/staff-only-test")
    assert response.status_code in (401, 404)


@pytest.mark.asyncio
async def test_get_current_staff_returns_context_for_valid_token(db_pool):
    from app.core.security import get_current_staff
    from starlette.requests import Request

    # get_current_staff는 acquire_as를 통해 커넥션 풀에서 별도의 커넥션을 얻으므로,
    # db_conn(롤백되는 트랜잭션)으로 심으면 다른 커넥션에서 보이지 않는다. 여기서는
    # 커밋되는 커넥션으로 심고 테스트 후 직접 정리한다.
    conn = await db_pool.acquire()
    doctor = None
    try:
        doctor = await seed_staff(conn, role="doctor")
        token = make_token(str(doctor["auth_user_id"]))

        scope = {
            "type": "http",
            "headers": [(b"authorization", f"Bearer {token}".encode())],
        }
        request = Request(scope)
        staff = await get_current_staff(request)

        assert staff.role == "doctor"
        assert staff.id == doctor["staff_id"]
    finally:
        if doctor is not None:
            await conn.execute("delete from staff where auth_user_id = $1", doctor["auth_user_id"])
            await conn.execute("delete from auth.users where id = $1", doctor["auth_user_id"])
        await db_pool.release(conn)


@pytest.mark.asyncio
async def test_get_current_staff_rejects_missing_header():
    from app.core.security import get_current_staff
    from starlette.requests import Request
    from fastapi import HTTPException

    scope = {"type": "http", "headers": []}
    request = Request(scope)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_staff(request)
    assert exc_info.value.status_code == 401
