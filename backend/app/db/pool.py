import json
from contextlib import asynccontextmanager

import asyncpg

from app.core.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        # C6-#10·#11(2026-08-20): 모든 연결 세션 시간대를 KST로 고정한다. 이 병원은 전부 KST로 돈다.
        #   안 하면 서버 OS(UTC) 기준이라 bare `current_date`/`now()::date`가 KST 자정~UTC 자정 사이에 하루 어긋난다
        #   (자정 부도 배치·doctor_can_view_*·환자 upcoming/슬롯 판정 등 `current_date` 소비자 전부). timestamptz는 UTC로
        #   저장되고 `at time zone 'Asia/Seoul'` 같은 절대 표현식은 이 설정과 무관하므로 이중 적용 없음.
        _pool = await asyncpg.create_pool(
            settings.database_url, server_settings={"timezone": "Asia/Seoul"})
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def acquire_as(auth_user_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "select set_config('request.jwt.claims', $1, true)",
                json.dumps({"sub": auth_user_id, "role": "authenticated"}),
            )
            await conn.execute("set local role authenticated")
            yield conn
