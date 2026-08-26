"""[ROLE-ADM-03][ROLE-READ][MASK-SRV-01] 역할 경계 — 화면만 막으면 API가 우회로가 된다.

⚠️ main.py는 손대지 않는다(라우터 등록은 코디가 배선). 최소 FastAPI 앱에 dashboard·stats
   라우터만 얹은 로컬 TestClient로 검증한다.
"""
import time
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.routers import dashboard, stats
from tests.conftest import seed_staff


def _make_token(auth_user_id: str) -> str:
    payload = {"sub": auth_user_id, "aud": "authenticated", "role": "authenticated",
               "exp": int(time.time()) + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _auth(seed):
    return {"Authorization": f"Bearer {_make_token(str(seed['auth_user_id']))}"}


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(dashboard.router)
    app.include_router(stats.router)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    return app


@pytest.fixture
def client():
    return TestClient(_build_app(), raise_server_exceptions=False)


async def test_롤_애드엠_03_통계는_관리자만_부를_수_있다(client, committed_conn):
    receptionist = await seed_staff(committed_conn, role="receptionist")
    resp = client.get("/stats", params={"from": "2026-08-01", "to": "2026-08-26"}, headers=_auth(receptionist))
    assert resp.status_code == 403


async def test_롤_애드엠_03_관리자는_통계를_연다(client, committed_conn):
    admin = await seed_staff(committed_conn, role="admin")
    resp = client.get("/stats", params={"from": "2026-08-01", "to": "2026-08-26"}, headers=_auth(admin))
    assert resp.status_code == 200


async def test_롤_리드_02_의사는_남의_환자_이력을_못_받는다(client, committed_conn):
    """[R2-02][ROLE-READ] RLS가 담당 아닌 환자의 기록을 걸러 빈 목록만 남긴다 —
    존재 여부를 드러내는 403/404 대신 열거 방지형으로 빈 결과를 준다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    other_patient = await committed_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('남환자','1990-01-01','M','01011112222') returning id"
    )
    resp = client.get(f"/patients/{other_patient}/medical-records", headers=_auth(doctor))
    assert resp.status_code == 200 and resp.json()["rows"] == []


def test_라우트_충돌이_없다():
    app = _build_app()
    paths = [(r.path, tuple(sorted(getattr(r, "methods", []) or []))) for r in app.routes]
    assert len(paths) == len(set(paths))
