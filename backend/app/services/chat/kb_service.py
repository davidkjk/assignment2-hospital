from uuid import UUID

from app.core.errors import AppError
from app.db.pool import get_pool


def chunk_text(content: str, *, max_len: int = 500) -> list[str]:
    # 단순 청킹: 빈 줄 문단 우선, 너무 길면 max_len로 자른다(검색 단위).
    parts, buf = [], ""
    for para in content.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        if len(buf) + len(para) + 2 > max_len and buf:
            parts.append(buf); buf = para
        else:
            buf = f"{buf}\n\n{para}" if buf else para
    if buf:
        parts.append(buf)
    return parts or [content.strip()]


async def _reembed(conn, doc_id: UUID, content: str, embedder) -> None:
    # 옛 조각 삭제 + 새 조각 삽입을 같은 트랜잭션에서. 실패하면 옛 조각·옛 답 유지(A2).
    chunks = chunk_text(content)
    vectors = await embedder.embed(chunks)
    await conn.execute("delete from kb_chunks where document_id=$1", doc_id)
    for i, (c, v) in enumerate(zip(chunks, vectors)):
        await conn.execute(
            "insert into kb_chunks (document_id, chunk_index, content, embedding) values ($1,$2,$3,$4::vector)",
            doc_id, i, c, "[" + ",".join(map(str, v)) + "]")


async def approve_document(doc_id: UUID, embedder) -> None:
    # draft → approved(최초 승인): 청킹+임베딩 후 승인. 재임베딩 실패 시 승인도 롤백.
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            doc = await conn.fetchrow("select content, status from kb_documents where id=$1", doc_id)
            if doc is None:
                raise AppError("없는 자료입니다.", 404)
            await _reembed(conn, doc_id, doc["content"], embedder)
            await conn.execute(
                "update kb_documents set status='approved', approved_at=now(), updated_at=now() where id=$1", doc_id)


async def submit_edit(doc_id: UUID, *, title, category, content, is_restricted, staff_id) -> None:
    # 승인된 문서 수정 → pending_*에 담고 라이브는 그대로. 챗봇은 계속 라이브로 답한다(A2·R4-01).
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "update kb_documents set has_pending_edit=true, pending_title=$2, pending_category=$3, "
            "pending_content=$4, pending_is_restricted=$5, pending_updated_by=$6, pending_updated_at=now() "
            "where id=$1", doc_id, title, category, content, is_restricted, staff_id)


async def approve_pending_edit(doc_id: UUID, embedder) -> None:
    # 라이브를 이력에 저장 → pending을 라이브로 → 재청킹·재임베딩. 전부 한 트랜잭션(G-06·A2).
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            d = await conn.fetchrow("select * from kb_documents where id=$1 and has_pending_edit", doc_id)
            if d is None:
                raise AppError("반영할 수정 내용이 없습니다.", 409)
            await conn.execute(
                "insert into kb_document_revisions (document_id, previous_title, previous_category, "
                "previous_content, previous_is_restricted, changed_by) values ($1,$2,$3,$4,$5,$6)",
                doc_id, d["title"], d["category"], d["content"], d["is_restricted"], d["pending_updated_by"])
            await conn.execute(
                "update kb_documents set title=pending_title, category=pending_category, content=pending_content, "
                "is_restricted=pending_is_restricted, has_pending_edit=false, pending_title=null, "
                "pending_category=null, pending_content=null, pending_is_restricted=null, "
                "approved_at=now(), updated_at=now() where id=$1", doc_id)
            new_content = d["pending_content"]
            await _reembed(conn, doc_id, new_content, embedder)
