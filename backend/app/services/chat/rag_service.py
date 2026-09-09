from uuid import UUID

import asyncpg
from langchain_core.prompts import ChatPromptTemplate

from app.db.pool import get_pool
from app.integrations.langchain_client import get_chat_model, resp_text
from app.services.chat.query_normalizer import normalize_query

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
# 질문이 무엇을 가리키는지 불명확할 때(어떤 검사·진료과인지 빠짐) 모델이 확인 질문 하나를
#   "NEEDS_CLARIFY: 질문" 형식으로 낸다(Sprint 2 no_answer 세분화). "못 찾음"(kb_gap)과 구분해
#   미해결로 집계하지 않고 정상 답변으로 되묻는다(리포트 §7 — needs_clarification은 실패 아님).
_NEEDS_CLARIFY_SENTINEL = "NEEDS_CLARIFY"

# 답변 작성 지침(리포트 §4.6·§9.6 Sprint 1.3). 얇은 한 줄 프롬프트 → 페르소나 + 대화 원칙.
#   목적: "분기마다 다른 인격"(§2.5)과 "지나치게 얇은 프롬프트"(§2.4)를 함께 해소.
#   ⚠️ 의료 안전 두 축은 그대로 유지한다 — ① 병원 자료만 근거(지어내기 금지) ② 답 없으면 NO_ANSWER.
#   {context}는 ChatPromptTemplate 변수라 이 문자열 안의 유일한 중괄호여야 한다(다른 { } 쓰지 말 것).
_ANSWER_SYSTEM_PROMPT = (
    "<역할>\n"
    "당신은 가온병원 AI 상담봇입니다. 병원 이용·예약·진료과 안내를 돕습니다. "
    "진단이나 처방은 하지 않습니다.\n"
    "</역할>\n"
    "<대화_원칙>\n"
    "- 사용자가 물은 핵심을 첫 문장에 직접 답합니다.\n"
    "- 아래 <병원_자료>만 근거로 삼고, 자료를 벗어나 지어내지 않습니다.\n"
    "- 단순 정보 질문에는 과한 공감 표현 없이 바로 답합니다.\n"
    "- 불편이나 불안이 드러날 때만 짧게 공감한 뒤 안내합니다.\n"
    "- 핵심 답 뒤에 필요한 설명은 2~4개의 짧은 문장으로만 덧붙입니다.\n"
    f"- 자료에 질문의 답이 없으면 다른 말 없이 정확히 '{_NO_ANSWER_SENTINEL}'만 출력합니다.\n"
    "- 질문이 무엇을 가리키는지 불명확해(예: 어떤 검사·어떤 진료과인지 빠짐) 자료에서 무엇을 찾아야 할지 "
    f"모를 때만, 확인 질문 하나를 '{_NEEDS_CLARIFY_SENTINEL}: 질문' 형식으로 출력합니다(증상을 캐묻지는 않습니다).\n"
    "</대화_원칙>\n"
    "<병원_자료>\n{context}\n</병원_자료>"
)


async def rag_answer(message: str, *, embedder, model=None, match_count: int = 5,
                     retrieval_query: str | None = None) -> dict:
    # 검색용 질의는 동의어 확장(Sprint 1.2): "씨티"→"CT"도 함께 실어 임베딩·트라이그램이 KB 원문을 찾게 한다.
    # 화면·로그·LLM 질문에는 원문(message)을 그대로 쓴다 — 확장어가 환자에게 보이면 안 된다.
    # retrieval_query(Sprint 2): 후속 질문이면 orchestrate가 지시어를 푼 독립형 질의(+원문 concat)를 준다.
    #   그때는 원문 대신 그 질의를 정규화해 검색한다. LLM 질문·화면은 여전히 message(원문)를 쓴다.
    search_query = normalize_query(retrieval_query or message)
    qvec = (await embedder.embed([search_query]))[0]
    vec = "[" + ",".join(map(str, qvec)) + "]"
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 하이브리드(벡터+트라이그램 RRF). 순수 벡터 match_kb_chunks는 근거 확인용으로 남겨둔다.
        # ⚠️ 폴백: 원격 DB에 하이브리드 함수(마이그 00084)가 아직 없으면(db push 전) 순수 벡터로 내려간다.
        #   코드 배포(Railway)가 마이그 적용보다 앞설 수 있어, 그 창에서도 봇이 안 깨지게 한다.
        try:
            chunks = await conn.fetch(
                "select * from match_kb_chunks_hybrid($1::vector, $2, $3)", vec, search_query, match_count)
        except asyncpg.UndefinedFunctionError:
            rows = await conn.fetch("select * from match_kb_chunks($1::vector, $2)", vec, match_count)
            chunks = [dict(r) | {"keyword_sim": 0.0} for r in rows]   # 키워드 신호 없음 → floor는 벡터만
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
    # A3(결정 2026-08-12·spec §3): 검색 1위가 제한 자료면 Claude 호출 없이 원문을 별도 블록에 그대로.
    #   ⚠️ "일반 청크가 0개일 때만"이 아니다 — 엉뚱한 일반 청크가 top-5에 1개라도 끼면(제한+일반 혼합)
    #   LLM 경로로 새고, 근거로 준 일반 청크에 답이 없으면 NO_ANSWER가 되어 제한 원문까지 폐기되던 버그가
    #   있었다(2026-09-08 rag_diag 실측: CT조영·바륨·대장 모두 1위 제한자료인데 no_answer). 1위 기준이 정본.
    #   "일반 자료가 함께 걸리면 일반 주제는 답한다"는 1위가 '일반'일 때 아래 LLM 경로(:76)가 처리한다.
    if chunks[0]["is_restricted"]:
        return {"reply": None, "restricted_block": chunks[0]["content"],
                "actions": ["직원 연결"], "sources": sources}
    # 일반 자료로 평소대로 답하고, 제한 자료가 함께 걸리면 원문 그대로 별도 블록으로 덧붙인다.
    context = "\n\n".join(c["content"] for c in normal)
    # 근거는 어디까지나 위 병원 자료다 — 예시는 어투·정확도 참고용 few-shot으로만 얹는다(예시로 답을 지어내지 않게).
    messages = [("system", _ANSWER_SYSTEM_PROMPT)]
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
    #   ⚠️ 센티넬이 문장 「어디에 있든」 잡는다: "…없습니다.\n\nNO_ANSWER"처럼 모델이 지시를 어기고
    #   설명을 먼저 붙이면 == / startswith 는 놓쳐 센티넬 원문이 환자에게 그대로 노출됐다(2026-09-08 실측).
    if _NO_ANSWER_SENTINEL in reply:
        return {"no_answer": True}
    # 확인 질문(needs_clarification): "NEEDS_CLARIFY: 질문"에서 질문만 벗겨 정상 답변으로 되묻는다.
    #   NO_ANSWER가 함께 있으면 위에서 이미 no_answer로 나갔다(근거 부재가 우선 — 되묻기 루프·안전).
    #   질문 본문이 비면 빈 되묻기(막다른 길)라 안전하게 no_answer로 폴백한다.
    if _NEEDS_CLARIFY_SENTINEL in reply:
        question = reply.split(_NEEDS_CLARIFY_SENTINEL, 1)[1].lstrip(":：").strip()
        if not question:
            return {"no_answer": True}
        return {"needs_clarification": True, "reply": question}
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
