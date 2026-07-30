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


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    await log_error(feature=request.url.path, message=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의하세요."},
    )
