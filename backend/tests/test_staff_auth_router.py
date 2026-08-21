import time
import uuid

import pytest
from fastapi import HTTPException
from jose import jwt
from starlette.requests import Request

from app.core.config import settings
from app.core.security import get_current_staff
from tests.conftest import seed_staff


def make_token(auth_user_id: str) -> str:
    payload = {
        "sub": auth_user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _request_with_token(token: str) -> Request:
    scope = {
        "type": "http",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
    }
    return Request(scope)


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["없는 계정", "비활성 직원", "staff 행 없음"])
async def test_인증_실패는_원인을_알려주지_않는다(db_pool, case):
    """[STAFF-LOGIN-07][STAFF-LOGIN-11] 인증 실패 응답은 계정 상태를 드러내지 않는다.

    지금 security.py:43은 미등록·비활성을 `사용 중지된 계정이거나 등록되지 않은
    계정입니다.`로 응답해 로그인 화면을 「이 이메일이 이 병원 직원인지 확인하는
    도구」로 만든다. 화면 문구만 바꿔서는 못 막는다 — 세 경우 모두 status와
    본문이 같아야 한다.
    """
    conn = await db_pool.acquire()
    seeded = None
    try:
        if case == "비활성 직원":
            # get_current_staff는 acquire_as로 별도 커넥션을 얻으므로 커밋되는
            # 커넥션(db_pool.acquire)으로 심어야 다른 커넥션에서 보인다.
            seeded = await seed_staff(conn, role="doctor", is_active=False)
            auth_user_id = str(seeded["auth_user_id"])
        else:
            # 없는 계정 / staff 행 없음: staff 행이 아예 존재하지 않는다.
            auth_user_id = str(uuid.uuid4())

        token = make_token(auth_user_id)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_staff(_request_with_token(token))

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "로그인 정보를 확인해 주세요."
    finally:
        if seeded is not None:
            await conn.execute(
                "delete from staff where auth_user_id = $1", seeded["auth_user_id"]
            )
            await conn.execute(
                "delete from auth.users where id = $1", seeded["auth_user_id"]
            )
        await db_pool.release(conn)
