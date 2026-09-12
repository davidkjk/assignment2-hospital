from uuid import UUID
from app.db.pool import get_pool


async def enqueue_after_reply(message_id: UUID) -> UUID | None:
    """staff_send 후 배칭. 수신자가 상담방을 보고 있으면 즉시읽음(None), 아니면 배치 생성/확장(§8-6~8)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval("select enqueue_staff_reply_notification($1)", message_id)
