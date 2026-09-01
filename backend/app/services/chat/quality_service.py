from uuid import UUID
from app.db.pool import get_pool


async def mark_reviewed(session_id: UUID, staff_id: UUID, *, status: str = "ok") -> None:
    # 신고가 없어도 "문제없음"을 저장한다(SD-08). 재검토는 status만 갱신.
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "insert into chat_quality_reviews (ai_chat_session_id, status, reviewed_by) values ($1,$2,$3) "
            "on conflict (ai_chat_session_id) do update set status=excluded.status, "
            "reviewed_by=excluded.reviewed_by, reviewed_at=now()", session_id, status, staff_id)


async def list_sessions_unreviewed_first(limit: int = 20) -> list[dict]:
    # 미검토 우선 → 최신 우선(SD-08). 검토 행이 없으면 미검토.
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select s.id, s.created_at, r.status as review_status "
            "from ai_chat_sessions s left join chat_quality_reviews r on r.ai_chat_session_id = s.id "
            "order by (r.id is null) desc, s.created_at desc, s.id desc limit $1", limit)
        return [dict(r) for r in rows]


async def record_unresolved(ticket_id: UUID, question: str, embedder) -> None:
    # 봇이 못 답해 인계된 질문을 임베딩과 함께 저장(클러스터 대상).
    vec = (await embedder.embed([question]))[0]
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "insert into unresolved_questions (ticket_id, question_text, question_embedding) values ($1,$2,$3::vector)",
            ticket_id, question, "[" + ",".join(map(str, vec)) + "]")
