from uuid import UUID

from langchain_core.prompts import ChatPromptTemplate

from app.db.pool import get_pool
from app.integrations.langchain_client import get_chat_model, resp_text

# 하이브리드 검색 바닥(floor): 최상위 조각이 벡터·키워드 둘 다 이보다 낮으면 근거 부족 → LLM 부르지 않고 바로 인계.
# 벡터(의미)·키워드(트라이그램 글자) 중 하나라도 이 선을 넘으면 후보로 인정하고, 실제 답변/인계는
# 아래 생성 프롬프트의 NO_ANSWER 판정(모델이 근거에 답이 없다고 하면 인계)이 최종 결정한다.
# 왜 단일 코사인 임계값을 버렸나(2026-09-04): text-embedding-3-small·한국어 짧은 질의에선 관련 문서도
#   0.35~0.6대라 코사인 컷 하나로는 "답변 vs 인계"를 못 가른다. 하이브리드로 올바른 문서를 최상위로
#   끌어올린 뒤, 관련성 판단은 모델(근거만 근거로 답)에게 맡긴다 — 의료 맥락에서 오답 위험을 낮추는 정석.
HYBRID_FLOOR = 0.30
EXAMPLE_SIMILARITY_THRESHOLD = 0.80  # 참고 예시는 근거가 아니라 어투·정확도 힌트라 더 엄격히(엉뚱한 예시 주입 방지).
EXAMPLE_MATCH_COUNT = 2              # 품질 개선 사이클(오답 교정 → 예시은행) 산물을 few-shot으로 최대 2건.

# 근거에 답이 없을 때 모델이 이 토큰만 내도록 지시 → 인계로 전환(엉뚱한 답 방지, 문자열 판정보다 안정).
_NO_ANSWER_SENTINEL = "NO_ANSWER"


async def rag_answer(message: str, *, embedder, model=None, match_count: int = 5) -> dict:
    qvec = (await embedder.embed([message]))[0]
    vec = "[" + ",".join(map(str, qvec)) + "]"
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 하이브리드(벡터+트라이그램 RRF). 순수 벡터 match_kb_chunks는 근거 확인용으로 남겨둔다.
        chunks = await conn.fetch(
            "select * from match_kb_chunks_hybrid($1::vector, $2, $3)", vec, message, match_count)
        # 품질 개선 사이클: 오답 교정으로 쌓인 활성 참고 예시 중 이 질문과 가장 비슷한 것(임베딩 코사인).
        example_rows = await conn.fetch(
            "select question, answer, 1 - (embedding <=> $1::vector) as similarity "
            "from public.qa_example_bank where is_active "
            "order by embedding <=> $1::vector limit $2", vec, EXAMPLE_MATCH_COUNT)
    examples = [e for e in example_rows if e["similarity"] >= EXAMPLE_SIMILARITY_THRESHOLD]
    if not chunks or max(chunks[0]["similarity"], chunks[0]["keyword_sim"]) < HYBRID_FLOOR:
        return {"no_answer": True}          # 벡터·키워드 둘 다 바닥 미만 → 근거 부족(인계)
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
    messages = [("system",
                 "아래 병원 자료만 근거로 간결히 답하세요. 자료를 벗어나 지어내지 마세요.\n"
                 f"자료에 질문의 답이 없으면 다른 말 없이 정확히 '{_NO_ANSWER_SENTINEL}'만 출력하세요.\n"
                 "{context}")]
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
    # 모델이 근거에 답이 없다고 판정 → 인계(no_answer). 코사인 컷 대신 모델을 관련성 판정자로 쓴다.
    if reply == _NO_ANSWER_SENTINEL or reply.startswith(_NO_ANSWER_SENTINEL):
        return {"no_answer": True}
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
