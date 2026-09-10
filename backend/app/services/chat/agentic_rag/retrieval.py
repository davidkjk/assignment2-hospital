import asyncpg

from app.db.pool import get_pool
from app.services.chat.query_normalizer import normalize_query
from app.services.chat.rag_service import (CANDIDATE_POOL, EXAMPLE_MATCH_COUNT,
                                           EXAMPLE_SIMILARITY_THRESHOLD, HYBRID_FLOOR,
                                           _rank_by_relevance)


async def retrieve(query: str, *, embedder, match_count: int = 5) -> dict:
    """rag_service.rag_answer의 검색부와 동일(단일출처=import한 상수·함수). A/B에서 검색을 동일하게 유지.

    반환: {chunks, sources, examples, top_restricted, below_floor}.
    """
    search_query = normalize_query(query)
    qvec = (await embedder.embed([search_query]))[0]
    vec = "[" + ",".join(map(str, qvec)) + "]"
    pool = await get_pool()
    pool_n = max(match_count, CANDIDATE_POOL)
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch(
                "select * from match_kb_chunks_hybrid($1::vector, $2, $3)", vec, search_query, pool_n)
            chunks = [dict(r) for r in rows]
        except asyncpg.UndefinedFunctionError:
            rows = await conn.fetch("select * from match_kb_chunks($1::vector, $2)", vec, pool_n)
            chunks = [dict(r) | {"keyword_sim": 0.0} for r in rows]
        chunks = _rank_by_relevance(chunks)[:match_count]
        example_rows = await conn.fetch(
            "select question, answer, 1 - (embedding <=> $1::vector) as similarity "
            "from public.qa_example_bank where is_active "
            "order by embedding <=> $1::vector limit $2", vec, EXAMPLE_MATCH_COUNT)
    examples = [dict(e) for e in example_rows if e["similarity"] >= EXAMPLE_SIMILARITY_THRESHOLD]
    below_floor = (not chunks) or max(chunks[0]["similarity"], chunks[0]["keyword_sim"]) < HYBRID_FLOOR
    top_restricted = bool(chunks) and chunks[0]["is_restricted"]
    sources = [{"chunk_id": c["id"], "title_snapshot": c["title"], "body_snapshot": c["content"],
                "rank": i, "similarity": float(c["similarity"])} for i, c in enumerate(chunks)]
    return {"chunks": chunks, "sources": sources, "examples": examples,
            "top_restricted": top_restricted, "below_floor": below_floor}
