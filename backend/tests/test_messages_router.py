"""[Task 28][SEND-DOOR-07] /messages 라우터 권한 가드 — 접수직원·관리자만, 의사는 403.

⚠️ main.py는 코디가 배선한다. 여기서는 최소 FastAPI 앱에 messages.router만 얹어, 역할 가드와
   빈 목록 조회 배선을 응답 코드로 검증한다. 발송·취소의 실동작은 test_message_compose.py가
   db_conn 주입으로 커버한다(라우터 테스트에서 notification_log를 커밋하면 patients 정리와
   FK가 충돌하므로 여기서는 쓰기 없는 GET·가드만 확인한다).
"""
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.routers import messages
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
    app.include_router(messages.router)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    return TestClient(app, raise_server_exceptions=False)


async def test_의사는_안내보내기_화면을_못_연다(client, committed_conn):
    """[SEND-DOOR-07] 의사는 목록 조회부터 403 — 메뉴 숨김이 아니라 서버가 거절한다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    res = client.get("/messages", headers=_auth(doctor))
    assert res.status_code == 403


async def test_의사는_발송도_못_한다(client, committed_conn):
    """[SEND-DOOR-07] 의사는 POST 발송 요청을 직접 만들어도 막힌다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    res = client.post("/messages", headers=_auth(doctor),
                      json={"kind": "transactional", "recipients_spec": {"all": True},
                            "channel": "push", "body": "x"})
    assert res.status_code == 403


async def test_접수직원은_목록을_연다(client, committed_conn):
    """[SEND-DOOR-02][SEND-LIST-01] 접수직원은 예약/보낸 두 구역 목록을 200으로 받는다."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    res = client.get("/messages", headers=_auth(receptionist))
    assert res.status_code == 200
    body = res.json()
    assert "scheduled" in body and "sent" in body and "auto_count" in body


async def test_관리자도_목록을_연다(client, committed_conn):
    """[SEND-DOOR-07] 관리자도 화면 권한이 있다."""
    admin = await seed_staff(committed_conn, role="admin")
    res = client.get("/messages", headers=_auth(admin))
    assert res.status_code == 200
