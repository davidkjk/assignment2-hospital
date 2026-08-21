import asyncpg
from fastapi import Request
from fastapi.responses import JSONResponse

from app.db.pool import get_pool


class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code


async def log_error(feature: str, message: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "insert into system_error_log (feature, message) values ($1, $2)",
            feature, message,
        )


async def pg_error_to_app_error(exc: asyncpg.PostgresError, feature: str) -> AppError:
    """DB 예외를 사용자 안내(AppError)로 변환한다.

    트리거·RPC가 `raise exception … using errcode='P0…'`으로 던진 메시지는 이미
    한글 도메인 안내문이므로(SQLSTATE PL/pgSQL 클래스 `P0`) 그대로 노출한다.
    P0003(낙관적 잠금 충돌)만 409로 맞춘다. 그 밖의 드라이버 오류(무결성·연결 등)는
    원문을 사용자 응답에 넣지 않고 `system_error_log`에만 남긴 뒤, 고정 한글 문구로
    바꾼다 — 「사용자에게는 한글 안내 메시지만 노출」 규칙(스펙 섹션 3).
    """
    sqlstate = getattr(exc, "sqlstate", None) or ""
    if sqlstate.startswith("P0"):
        status_code = 409 if sqlstate == "P0003" else 400
        return AppError(str(exc), status_code=status_code)
    await log_error(feature, str(exc))
    return AppError("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", status_code=400)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    await log_error(feature=request.url.path, message=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의하세요."},
    )
