import time
import uuid

import pytest
from fastapi import HTTPException
from jose import jwt
from starlette.requests import Request

from app.core.config import settings
from app.core.security import StaffContext, get_current_staff
from app.db.admin_client import get_admin_client
from app.main import app as main_app
from app.routers.auth_staff import (
    RESET_MESSAGE,
    ResetRateLimiter,
    get_auth_client,
    get_reset_limiter,
    router,
)
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


def test_직원_인증_라우터가_실제_앱에_배선된다():
    """Task 4 seam: 단위 라우터가 통과해도 main.py에 빠지면 실제 API는 404다."""
    paths = {route.path for route in main_app.routes}
    assert {"/auth/staff/password-reset", "/me/password"} <= paths


@pytest.mark.asyncio
async def test_손상된_토큰도_같은_인증_실패_문장이다():
    """[STAFF-LOGIN-11] 토큰 오류도 계정 상태 대조 단서를 주지 않는다."""
    with pytest.raises(HTTPException) as exc_info:
        await get_current_staff(_request_with_token("not-a-jwt"))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "로그인 정보를 확인해 주세요."


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
        self.sign_out_error = False
        self.list_users_error = False
        self.users = [
            type("User", (), {"id": "active-user", "email": "real@hospital.kr"})(),
            type("User", (), {"id": "inactive-user", "email": "inactive@hospital.kr"})(),
            type("User", (), {"id": "no-staff-user", "email": "nostaff@hospital.kr"})(),
            type("User", (), {"id": "broken-mail-user", "email": "broken@hospital.kr"})(),
        ]

    def get_user_by_id(self, _user_id):
        return type("Result", (), {"user": type("User", (), {"email": "me@hospital.kr"})()})()

    def update_user_by_id(self, user_id, attributes):
        self.updated.append((user_id, attributes))

    def sign_out(self, user_id, scope="global"):
        if self.sign_out_error:
            raise RuntimeError("sign out failed")
        self.signed_out.append((user_id, scope))

    def list_users(self, page=None, per_page=None):
        if self.list_users_error:
            raise RuntimeError("user lookup failed")
        page = page or 1
        per_page = per_page or len(self.users)
        start = (page - 1) * per_page
        return self.users[start : start + per_page]


class FakeAuth:
    def __init__(self):
        self.admin = FakeAuthAdmin()
        self.reset_requests = []
        self.reset_errors = {"nobody@x.kr", "broken@hospital.kr"}

    def reset_password_for_email(self, email, options=None):
        self.reset_requests.append((email, options))
        if email in self.reset_errors:
            raise RuntimeError("user not found")

    def sign_in_with_password(self, credentials):
        if credentials["password"] != "old-password":
            raise RuntimeError("invalid credentials")
        return object()


class FakeAdminClient:
    def __init__(self):
        self.auth = FakeAuth()
        self.active_staff = {
            "active-user": True,
            "inactive-user": False,
            "broken-mail-user": True,
        }
        self.staff_lookup_error = False

    def table(self, table_name):
        assert table_name == "staff"
        return FakeStaffQuery(self)


class FakeStaffQuery:
    def __init__(self, client):
        self.client = client
        self.filters = {}

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def limit(self, _count):
        return self

    def execute(self):
        if self.client.staff_lookup_error:
            raise RuntimeError("staff lookup failed")
        auth_user_id = self.filters.get("auth_user_id")
        is_active = self.client.active_staff.get(auth_user_id)
        data = [{"id": "staff-id"}] if is_active is True else []
        return type("Result", (), {"data": data})()


def make_auth_client(*, raise_server_exceptions=True):
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
    return TestClient(app, raise_server_exceptions=raise_server_exceptions), admin, staff


def test_재설정_요청은_가입_여부와_무관하게_같은_응답이다():
    """[STAFF-LOGIN-10] 등록 여부와 무관하게 같은 응답을 돌려 계정 열거를 막는다."""
    client, _, _ = make_auth_client()
    unknown = client.post("/auth/staff/password-reset", json={"email": "nobody@x.kr"})
    known = client.post("/auth/staff/password-reset", json={"email": "real@hospital.kr"})
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()


@pytest.mark.parametrize(
    "request_headers",
    [
        {"Origin": "https://attacker.test", "Host": "attacker.test"},
        {"Host": "attacker.test"},
    ],
)
def test_재설정_링크는_요청_origin이나_host가_아닌_서버_설정으로_돌아온다(
    monkeypatch, request_headers
):
    """[STAFF-LOGIN-10] 공격자가 고른 요청 헤더를 복구 링크에 반사하지 않는다."""
    monkeypatch.setitem(
        settings.__dict__, "staff_web_origin", "https://staff.hospital.test"
    )
    client, admin, _ = make_auth_client()

    response = client.post(
        "/auth/staff/password-reset",
        headers=request_headers,
        json={"email": "real@hospital.kr"},
    )

    assert response.status_code == 202
    assert response.json() == {"message": RESET_MESSAGE}
    assert admin.auth.reset_requests == [
        (
            "real@hospital.kr",
            {"redirect_to": "https://staff.hospital.test/reset-password/new"},
        )
    ]


@pytest.mark.parametrize(
    "configured_origin",
    [None, "", "https://staff.hospital.test/untrusted-path", "javascript:alert(1)"],
)
def test_신뢰_origin_설정이_없거나_잘못되면_요청값으로_fallback하지_않는다(
    monkeypatch, configured_origin
):
    monkeypatch.setitem(settings.__dict__, "staff_web_origin", configured_origin)
    client, admin, _ = make_auth_client()

    response = client.post(
        "/auth/staff/password-reset",
        headers={"Origin": "https://attacker.test", "Host": "attacker.test"},
        json={"email": "real@hospital.kr"},
    )

    assert response.status_code == 202
    assert response.json() == {"message": RESET_MESSAGE}
    assert admin.auth.reset_requests == []


@pytest.mark.parametrize(
    "email",
    ["nobody@x.kr", "inactive@hospital.kr", "nostaff@hospital.kr", "not-an-email"],
)
def test_활성_staff가_아니면_복구메일을_보내지_않고_같은_응답을_돌려준다(
    monkeypatch, email
):
    monkeypatch.setitem(
        settings.__dict__, "staff_web_origin", "https://staff.hospital.test"
    )
    client, admin, _ = make_auth_client()

    response = client.post("/auth/staff/password-reset", json={"email": email})

    assert response.status_code == 202
    assert response.json() == {"message": RESET_MESSAGE}
    assert admin.auth.reset_requests == []


@pytest.mark.parametrize("failure", ["auth_lookup", "staff_lookup", "mail_send"])
def test_재설정_조회나_발송_실패도_같은_응답을_돌려준다(monkeypatch, failure):
    monkeypatch.setitem(
        settings.__dict__, "staff_web_origin", "https://staff.hospital.test"
    )
    client, admin, _ = make_auth_client()
    email = "real@hospital.kr"
    if failure == "auth_lookup":
        admin.auth.admin.list_users_error = True
    elif failure == "staff_lookup":
        admin.staff_lookup_error = True
    else:
        email = "broken@hospital.kr"

    response = client.post("/auth/staff/password-reset", json={"email": email})

    assert response.status_code == 202
    assert response.json() == {"message": RESET_MESSAGE}
    if failure != "mail_send":
        assert admin.auth.reset_requests == []


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


def test_현재_세션_token이_없으면_비밀번호를_바꾸지_않는다():
    client, admin, _ = make_auth_client()

    response = client.post(
        "/me/password",
        json={"current_password": "old-password", "new_password": "brand-new-one1"},
    )

    assert response.status_code == 401
    assert admin.auth.admin.updated == []
    assert admin.auth.admin.signed_out == []


def test_다른_세션_종료가_실패하면_비밀번호를_바꾸지_않는다():
    client, admin, _ = make_auth_client(raise_server_exceptions=False)
    admin.auth.admin.sign_out_error = True

    response = client.post(
        "/me/password",
        headers={"Authorization": "Bearer current-token"},
        json={"current_password": "old-password", "new_password": "brand-new-one1"},
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
    assert admin.auth.admin.updated == []
    assert admin.auth.admin.signed_out == []


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
