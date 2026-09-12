from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.db.pool import acquire_as, get_pool


async def create_session(auth_user_id: str, thread_id: UUID, *,
                         continuation_source_type: str | None = None,
                         continued_from_ai_session_id: UUID | None = None,
                         continued_from_ticket_id: UUID | None = None,
                         continuation_summary: str | None = None) -> dict:
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow(
                "select * from create_ai_session($1, $2, $3, $4, $5)",
                thread_id, continuation_source_type,
                continued_from_ai_session_id, continued_from_ticket_id, continuation_summary)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)
        return dict(row)


async def load_owned_session(patient, session_id: UUID, thread_id: UUID) -> dict:
    # 라우터 얇게: 환자 소유권은 RLS(patient_owns)로 검증한다. 소유 아니면 조회에서 사라져 404.
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select s.* from ai_chat_sessions s join chat_threads t on t.id = s.thread_id "
            "where s.id = $1 and s.thread_id = $2", session_id, thread_id)
    if row is None:
        raise AppError("상담 세션을 찾을 수 없습니다.", 404)
    return dict(row)


async def record_activity(auth_user_id: str, session_id: UUID) -> None:
    async with acquire_as(auth_user_id) as conn:
        try:
            await conn.execute("select record_ai_activity($1)", session_id)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)


async def expire_idle_sessions() -> int:
    # 만료 배치는 서버 주체 실행(배포 cron). 여기선 풀 커넥션으로 직접 부른다(RLS 우회 함수).
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval("select expire_idle_ai_sessions()")
