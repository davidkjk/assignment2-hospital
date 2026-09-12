import pytest
from tests.conftest import seed_staff


@pytest.mark.asyncio
async def test_pgvector_and_kb_tables_exist(db_conn):
    ext = await db_conn.fetchval("select 1 from pg_extension where extname='vector'")
    assert ext == 1
    for t in ("kb_documents", "kb_chunks", "kb_document_revisions"):
        assert await db_conn.fetchval(
            "select 1 from information_schema.tables where table_name=$1", t) == 1


@pytest.mark.asyncio
async def test_match_returns_approved_chunks_only(db_conn):
    # 승인 자료 1건 + 초안 1건 → 검색에 승인 조각만.
    vec = "[" + ",".join(["0.1"] * 1536) + "]"
    ap = await db_conn.fetchval(
        "insert into kb_documents (title, content, status) values ('주차','지하1층','approved') returning id")
    dr = await db_conn.fetchval(
        "insert into kb_documents (title, content, status) values ('초안','승인전','draft') returning id")
    await db_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) values ($1,0,'지하 1층 주차장',$2::vector)", ap, vec)
    await db_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) values ($1,0,'승인 전 내용',$2::vector)", dr, vec)
    rows = await db_conn.fetch("select content from match_kb_chunks($1::vector, 10)", vec)
    contents = {r["content"] for r in rows}
    assert "지하 1층 주차장" in contents and "승인 전 내용" not in contents
