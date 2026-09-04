from uuid import UUID

from langchain_core.prompts import ChatPromptTemplate

from app.db.pool import get_pool
from app.integrations.langchain_client import get_chat_model, resp_text

RAG_SIMILARITY_THRESHOLD = 0.70   # 최상위 조각이 이보다 낮으면 근거 부족 → no_answer 인계. 실측 튜닝 대상.
EXAMPLE_SIMILARITY_THRESHOLD = 0.80  # 참고 예시는 근거가 아니라 어투·정확도 힌트라 더 엄격히(엉뚱한 예시 주입 방지).
EXAMPLE_MATCH_COUNT = 2              # 품질 개선 사이클(오답 교정 → 예시은행) 산물을 few-shot으로 최대 2건.


async def rag_answer(message: str, *, embedder, model=None, match_count: int = 5) -> dict:
    qvec = (await embedder.embed([message]))[0]
    vec = "[" + ",".join(map(str, qvec)) + "]"
    pool = await get_pool()
    async with pool.acquire() as conn:
        chunks = await conn.fetch("select * from match_kb_chunks($1::vector, $2)", vec, match_count)
        # 품질 개선 사이클: 오답 교정으로 쌓인 활성 참고 예시 중 이 질문과 가장 비슷한 것(임베딩 코사인).
        example_rows = await conn.fetch(
            "select question, answer, 1 - (embedding <=> $1::vector) as similarity "
            "from public.qa_example_bank where is_active "
            "order by embedding <=> $1::vector limit $2", vec, EXAMPLE_MATCH_COUNT)
    examples = [e for e in example_rows if e["similarity"] >= EXAMPLE_SIMILARITY_THRESHOLD]
    if not chunks or chunks[0]["similarity"] < RAG_SIMILARITY_THRESHOLD:
        return {"no_answer": True}          # 근거 부족 → 인계(no_answer)
    restricted = [c for c in chunks if c["is_restricted"]]
    normal = [c for c in chunks if not c["is_restricted"]]
    sources = [{"chunk_id": c["id"], "title_snapshot": c["title"], "body_snapshot": c["content"],
                "rank": i, "similarity": float(c["similarity"])} for i, c in enumerate(chunks)]
    # A3: 질문 전체가 제한 주제(일반 근거 없음)면 제한 원문 + [직원 연결]만.
    if restricted and not normal:
        return {"reply": None, "restricted_block": restricted[0]["content"],
                "actions": ["직원 연결"], "sources": sources}
    # 일반 자료로 평소대로 답하고, 제한 자료가 함께 걸리면 원문 그대로 별도 블록으로 덧붙인다.
    context = "\n\n".join(c["content"] for c in normal)
    # 근거는 어디까지나 위 병원 자료다 — 예시는 어투·정확도 참고용 few-shot으로만 얹는다(예시로 답을 지어내지 않게).
    messages = [("system", "아래 병원 자료만 근거로 간결히 답하세요. 자료에 없으면 모른다고 하세요.\n{context}")]
    fmt = {"context": context, "q": message}
    if examples:
        few_shot = "\n\n".join(f"질문: {e['question']}\n답변: {e['answer']}" for e in examples)
        messages.append(("system",
                         "아래는 비슷한 질문에 직원이 검토·교정한 모범 답변입니다. 어투와 정확도의 참고로만 쓰고, "
                         "실제 답은 위 병원 자료를 근거로 하세요.\n{examples}"))
        fmt["examples"] = few_shot
    messages.append(("human", "{q}"))
    prompt = ChatPromptTemplate.from_messages(messages)
    # format_messages + ainvoke — 주입 가짜모델(langchain Runnable 아님) 호환(Task 5·6과 동일).
    resp = await (model or get_chat_model()).ainvoke(prompt.format_messages(**fmt))
    reply = resp_text(resp).strip()
    result = {"reply": reply, "sources": sources}
    if restricted:
        result["restricted_block"] = restricted[0]["content"]   # 봇이 살 붙이지 않은 원문 그대로
    return result


async def record_answer_sources(message_id: UUID, sources: list[dict]) -> None:
    # 봇 답변 근거를 당시 스냅샷으로 박제한다(Task 4 chat_message_sources). chunk_id는 소프트 참조.
    pool = await get_pool()
    async with pool.acquire() as conn:
        for s in sources:
            await conn.execute(
                "insert into chat_message_sources (message_id, chunk_id, rank, similarity, "
                "title_snapshot, body_snapshot) values ($1,$2,$3,$4,$5,$6)",
                message_id, s["chunk_id"], s["rank"], s["similarity"], s["title_snapshot"], s["body_snapshot"])


async def get_doctor_intro(doctor_id: UUID) -> dict:
    # 의사 소개는 KB가 아니라 staff 원본을 읽는다(item 7 — 중복 저장 금지).
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select id, name, specialty, bio, photo_url from staff where id=$1", doctor_id)
    return dict(row) if row else None
