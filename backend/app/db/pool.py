"""DB 연결 풀 — 두 접근 경로를 구분한다(C6-#9, 2026-08-20).

- `async with (await get_pool()).acquire() as conn:` (raw) = **서비스역할 경로**: RLS를 우회한다.
  디스패처(`send_now`)·시스템 배치(`mark_overdue_no_shows`·`expire_idle_ai_sessions`)·상담봇 발송 다리처럼
  「인증 사용자 세션 없이 도는」 특권 쓰기가 이 경로를 쓴다.
  ⚠️ **운영 계약**: `DATABASE_URL`은 반드시 **RLS를 우회하는 DB 역할**(연결 소유자 또는 `BYPASSRLS`)로 접속해야
     이 경로가 의도대로 동작한다. authenticated로 접속하면 디스패처/배치가 조용히 RLS에 막힌다(2D-F13).
- `async with acquire_as(auth_user_id) as conn:` = **인증 사용자 경로**: `set local role authenticated`로
  내려 RLS 적용. 사용자 범위 읽기/쓰기(환자 본인·직원 역할 정책 대상)가 이 경로를 쓴다.
"""
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
        #
        # ⚠️ #33(2026-09-06 라이브 실측): `server_settings={"timezone": ...}`(연결 startup 파라미터)는
        #   Supabase 풀러(Supavisor)가 통째로 버린다 → 라이브 세션이 UTC로 떨어져 `current_date`가
        #   KST 자정이 아니라 UTC 자정(=KST 09:00)에 넘어갔다("오늘 예약이 아침 9시에 사라짐").
        #   실측: asyncpg server_settings timezone=Asia/Seoul → `show timezone` = UTC.
        #   → 매 acquire마다 도는 setup 콜백의 런타임 `SET TIME ZONE`으로 바꾼다(startup 파라미터가 아니라
        #   일반 쿼리라 풀러가 그대로 전달, asyncpg가 release 때 RESET ALL로 지워도 다음 acquire에서 재적용).
        #   이 한 곳이 SQL 함수(doctor_can_view_*·mark_overdue_no_shows 등) 안의 current_date까지 함께 고친다.
        async def _set_session_tz(conn: asyncpg.Connection) -> None:
            await conn.execute("SET TIME ZONE 'Asia/Seoul'")

        # min/max_size를 작게(기본 1/4) 잡는다 — asyncpg 기본값(10/10)은 API + cron 프로세스가
        # 각자 10을 잡아 Supavisor 세션 모드 한도(15)를 넘겨 EMAXCONNSESSION을 냈다(config 참조).
        _pool = await asyncpg.create_pool(
            settings.database_url,
            setup=_set_session_tz,
            min_size=settings.db_pool_min_size,
            max_size=settings.db_pool_max_size,
        )
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
