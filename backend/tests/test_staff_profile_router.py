"""[STAFF-PROFILE-04] 의사 프로필 저장 라우터 계약.

⚠️ 서비스 단위 테스트(`test_staff_profile_service.py`)는 `update_doctor_profile`을 직접 부르며
바꿀 칸만 넘긴다 — 안 넘긴 칸은 **서비스의** `_UNSET`으로 채워져 seam 버그가 보이지 않는다.
여기서는 **라우터를 실제로 경유**해, 라우터가 안 보낸 칸을 어떻게 넘기는지까지 확인한다.
(라이브 재현: 전문분야만 바꿔 PATCH 하면 HTTP 500 — bio·color 자리에 센티널 객체가 들어가
asyncpg가 "expected str, got object"로 거부했다.)
"""
import time as _time

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from jose import jwt

from app.core.config import settings
from app.core.errors import AppError, app_error_handler
from app.routers import staff as staff_router
from tests.conftest import seed_staff


def make_token(auth_user_id: str) -> str:
    payload = {"sub": auth_user_id, "aud": "authenticated", "role": "authenticated",
               "exp": int(_time.time()) + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _headers(staff: dict) -> dict:
    return {"Authorization": f"Bearer {make_token(str(staff['auth_user_id']))}"}


@pytest_asyncio.fixture
async def api_client():
    app = FastAPI()
    app.add_exception_handler(AppError, app_error_handler)
    app.include_router(staff_router.router)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.mark.asyncio
async def test_전문분야만_바꿔_보내도_다른_칸을_건드리지_않고_저장된다(api_client, committed_conn):
    """[STAFF-PROFILE-04] 부분 저장 — 안 보낸 칸(bio·color)은 그대로 두고 전문분야만 갱신한다.

    라우터가 안 보낸 칸을 센티널 객체로 넘겨 500이 나던 회귀를 막는다.
    """
    admin = await seed_staff(committed_conn, role="admin")
    doctor = await seed_staff(committed_conn, role="doctor")

    resp = await api_client.patch(
        f"/staff/{doctor['staff_id']}/profile",
        headers=_headers(admin),
        json={"specialty": "소화기내과"},
    )

    assert resp.status_code == 200, resp.text
    saved = await committed_conn.fetchval(
        "select specialty from staff where id = $1", doctor["staff_id"]
    )
    assert saved == "소화기내과"
