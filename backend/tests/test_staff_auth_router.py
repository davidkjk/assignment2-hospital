import time
import uuid

import pytest
from fastapi import HTTPException
from jose import jwt
from starlette.requests import Request

from app.core.config import settings
from app.core.security import StaffContext, get_current_staff
from app.db.admin_client import get_admin_client
from app.routers.auth_staff import ResetRateLimiter, get_auth_client, get_reset_limiter, router
from tests.conftest import seed_staff
from fastapi import FastAPI
from fastapi.testclient import TestClient


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


class FakeAuthAdmin:
    def __init__(self):
        self.updated = []
        self.signed_out = []

    def get_user_by_id(self, _user_id):
        return type("Result", (), {"user": type("User", (), {"email": "me@hospital.kr"})()})()

    def update_user_by_id(self, user_id, attributes):
        self.updated.append((user_id, attributes))

    def sign_out(self, user_id, scope="global"):
        self.signed_out.append((user_id, scope))


class FakeAuth:
    def __init__(self):
        self.admin = FakeAuthAdmin()
        self.reset_requests = []

    def reset_password_for_email(self, email, options=None):
        self.reset_requests.append((email, options))
        if email.startswith("nobody"):
            raise RuntimeError("user not found")

    def sign_in_with_password(self, credentials):
        if credentials["password"] != "old-password":
            raise RuntimeError("invalid credentials")
        return object()


class FakeAdminClient:
    def __init__(self):
        self.auth = FakeAuth()


def make_auth_client():
    app = FastAPI()
    app.include_router(router)
    admin = FakeAdminClient()
    limiter = ResetRateLimiter(limit=5, window_seconds=900)
    staff = StaffContext(
        id=uuid.uuid4(),
        auth_user_id=uuid.uuid4(),
        role="receptionist",
        department_id=None,
    )
    app.dependency_overrides[get_admin_client] = lambda: admin
    app.dependency_overrides[get_auth_client] = lambda: admin
    app.dependency_overrides[get_current_staff] = lambda: staff
    app.dependency_overrides[get_reset_limiter] = lambda: limiter
    return TestClient(app), admin, staff


def test_재설정_요청은_가입_여부와_무관하게_같은_응답이다():
    """[STAFF-LOGIN-10] 등록 여부와 무관하게 같은 응답을 돌려 계정 열거를 막는다."""
    client, _, _ = make_auth_client()
    unknown = client.post("/auth/staff/password-reset", json={"email": "nobody@x.kr"})
    known = client.post("/auth/staff/password-reset", json={"email": "real@hospital.kr"})
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()


def test_재설정_요청은_다섯_번_뒤_시도_제한을_건다():
    """[STAFF-LOGIN-10] 반복 복구 요청은 메일 폭탄이 되지 않도록 제한한다."""
    client, _, _ = make_auth_client()
    for _ in range(5):
        assert client.post("/auth/staff/password-reset", json={"email": "real@hospital.kr"}).status_code == 202
    limited = client.post("/auth/staff/password-reset", json={"email": "real@hospital.kr"})
    assert limited.status_code == 429
    assert "병원" in limited.json()["detail"]


def test_현재_비밀번호가_틀리면_비밀번호를_바꾸지_않는다():
    """[SHELL-PW-01] 현재 비밀번호 검증에 실패하면 계정 변경을 하지 않는다."""
    client, admin, _ = make_auth_client()
    response = client.post(
        "/me/password",
        headers={"Authorization": "Bearer current-token"},
        json={"current_password": "wrong", "new_password": "brand-new-one1"},
    )
    assert response.status_code == 400
    assert admin.auth.admin.updated == []


def test_비밀번호를_바꾸면_현재_세션을_남기고_다른_세션만_끊는다():
    """[SHELL-PW-04] 비밀번호 변경 뒤 scope=others로 다른 기기의 세션만 종료한다."""
    client, admin, staff = make_auth_client()
    response = client.post(
        "/me/password",
        headers={"Authorization": "Bearer current-token"},
        json={"current_password": "old-password", "new_password": "brand-new-one1"},
    )
    assert response.status_code == 204
    assert admin.auth.admin.updated == [(str(staff.auth_user_id), {"password": "brand-new-one1"})]
    assert admin.auth.admin.signed_out == [("current-token", "others")]
