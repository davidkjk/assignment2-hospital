from uuid import UUID
from app.core.errors import AppError
from app.db.pool import get_pool
from app.services.chat import kb_service


async def report(message_id: UUID, staff_id: UUID, *, correction_text=None,
                 source: str = "realtime_report", add_to_example_bank: bool = False) -> dict:  # C3-3 정본(2026-08-20): 화면 명세와 통일
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "insert into answer_feedback (message_id, reported_by, source, correction_text, add_to_example_bank) "
            "values ($1,$2,$3,$4,$5) returning *", message_id, staff_id, source, correction_text, add_to_example_bank)
        return dict(row)


async def list_bad_inbox(limit: int = 20) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select * from answer_feedback where status='pending' order by created_at desc limit $1", limit)
        return [dict(r) for r in rows]


async def apply(feedback_id: UUID, staff_id: UUID, embedder, *, kb_document_id=None,
                kb_fields: dict | None = None) -> None:
    # 적용: 예시은행 축적 + (교정이 KB 대상이면) KB submit_edit로 보낸다. 즉시 라이브 아님 — KB 승인 경유(B3).
    pool = await get_pool()
    async with pool.acquire() as conn:
        fb = await conn.fetchrow("select * from answer_feedback where id=$1 and status='pending'", feedback_id)
        if fb is None:
            raise AppError("이미 처리된 신고입니다.", 409)
        if fb["add_to_example_bank"] and fb["correction_text"]:
            q = await conn.fetchval("select content from chat_messages where id=$1", fb["message_id"])
            vec = (await embedder.embed([q or ""]))[0]
            await conn.execute(
                "insert into qa_example_bank (question, answer, embedding, source_feedback_id) "
                "values ($1,$2,$3::vector,$4)", q or "", fb["correction_text"],
                "[" + ",".join(map(str, vec)) + "]", feedback_id)
        await conn.execute(
            "update answer_feedback set status='applied', resolved_by=$2, resolved_at=now() where id=$1",
            feedback_id, staff_id)
    if kb_document_id and kb_fields:
        await kb_service.submit_edit(kb_document_id, staff_id=staff_id, **kb_fields)   # 승인은 별도(Task 7)


async def reject(feedback_id: UUID, staff_id: UUID) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "update answer_feedback set status='rejected', resolved_by=$2, resolved_at=now() "
            "where id=$1 and status='pending'", feedback_id, staff_id)
