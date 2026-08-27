"""[Task 21a][MERGE-SHELL-01·02] 병합 라우터 권한 가드 — 관리자만.

⚠️ main.py는 코디가 배선한다. 여기서는 최소 FastAPI 앱에 patient_merge.router만 얹은
   로컬 TestClient로, 접수직원·의사가 후보 한 줄도 못 받는 것을 응답 코드로 검증한다.
"""
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.routers import patient_merge
from tests.conftest import seed_staff


def _make_token(auth_user_id: str) -> str:
    payload = {"sub": auth_user_id, "aud": "authenticated", "role": "authenticated",
               "exp": int(time.time()) + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _auth(seed):
    return {"Authorization": f"Bearer {_make_token(str(seed['auth_user_id']))}"}


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(patient_merge.router)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    return TestClient(app, raise_server_exceptions=False)


async def test_접수직원은_후보를_못_연다(client, committed_conn):
    """[MERGE-SHELL-02] 메뉴를 숨기는 것으로 끝내지 않는다 — 서버가 403으로 거절한다."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    res = client.get("/admin/merge-candidates", headers=_auth(receptionist))
    assert res.status_code == 403


async def test_의사는_후보를_못_연다(client, committed_conn):
    """[MERGE-SHELL-02] 의사도 관리자 전용 화면을 열 수 없다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    res = client.get("/admin/merge-candidates", headers=_auth(doctor))
    assert res.status_code == 403


async def test_비관리자_병합_요청도_거절된다(client, committed_conn):
    """[MERGE-SHELL-01] 병합 실행 엔드포인트도 관리자만 — 요청을 직접 만들어도 막힌다."""
    import uuid
    receptionist = await seed_staff(committed_conn, role="receptionist")
    res = client.post(
        "/admin/merge-candidates/merge",
        json={"primary_id": str(uuid.uuid4()), "duplicate_id": str(uuid.uuid4()),
              "expected_counts": {}},
        headers=_auth(receptionist))
    assert res.status_code == 403


async def test_관리자는_후보_목록을_연다(client, committed_conn):
    """[MERGE-SHELL-01] 관리자는 200으로 목록을 받는다(가드 통과 확인)."""
    admin = await seed_staff(committed_conn, role="admin")
    res = client.get("/admin/merge-candidates", headers=_auth(admin))
    assert res.status_code == 200
    assert isinstance(res.json(), list)
