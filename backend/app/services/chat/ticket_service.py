from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.db.pool import acquire_as


def _to_dict(row) -> dict:
    return dict(row) if row is not None else None


async def claim_ticket(auth_user_id: str, ticket_id: UUID) -> dict:
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow("select * from claim_ticket($1)", ticket_id)
        except asyncpg.exceptions.RaiseError as e:
            # 경쟁 패자·권한 없음은 한글 메시지 그대로 409로. 파이썬 예외 원문 노출 금지.
            raise AppError(str(e), 409)
        return _to_dict(row)


async def close_ticket(auth_user_id: str, ticket_id: UUID) -> dict:
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow("select * from close_ticket($1)", ticket_id)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)
        return _to_dict(row)


async def staff_send_message(auth_user_id: str, ticket_id: UUID, content: str,
                             client_message_id: UUID | None = None) -> dict:
    if not content or not content.strip():
        raise AppError("보낼 내용을 입력해 주세요.", 400)
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow(
                "select * from staff_send_ticket_message($1, $2, $3)", ticket_id, content, client_message_id)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)
        return _to_dict(row)


async def list_thread_tickets(auth_user_id: str, thread_id: UUID) -> list[dict]:
    # PTDET-SUPPORT-03: 최신순 + ID 동점키 서버 정렬. 화면(Task 19)이 계산하지 않는다.
    async with acquire_as(auth_user_id) as conn:
        rows = await conn.fetch(
            "select * from support_tickets where thread_id = $1 order by created_at desc, id desc", thread_id)
        return [dict(r) for r in rows]
