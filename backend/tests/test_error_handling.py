import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import AppError, app_error_handler, unhandled_exception_handler


def build_test_app() -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    @app.get("/boom-app-error")
    def boom_app_error():
        raise AppError("이미 취소된 예약입니다.", status_code=409)

    @app.get("/boom-unhandled")
    def boom_unhandled():
        raise ValueError("unexpected db failure")

    return app


def test_app_error_returns_korean_message_and_status():
    client = TestClient(build_test_app())
    response = client.get("/boom-app-error")
    assert response.status_code == 409
    assert response.json() == {"detail": "이미 취소된 예약입니다."}


def test_unhandled_exception_hides_internal_message():
    client = TestClient(build_test_app(), raise_server_exceptions=False)
    response = client.get("/boom-unhandled")
    assert response.status_code == 500
    assert "unexpected db failure" not in response.text


@pytest.mark.asyncio
async def test_unhandled_exception_is_logged(db_conn):
    from app.core.errors import log_error

    await log_error(feature="/boom-unhandled", message="unexpected db failure")
    row = await db_conn.fetchrow(
        "select feature, message from system_error_log where feature = '/boom-unhandled'"
    )
    assert row["message"] == "unexpected db failure"
