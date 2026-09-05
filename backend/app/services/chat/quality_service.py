from uuid import UUID
from app.core.errors import AppError
from app.db.pool import get_pool
from app.services.chat import answer_feedback_service

PAGE_SIZE = 20  # QUALITY-REPORT-02: 미검토 우선 최신순 20건


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


# ── 품질 리포트 목록(QUALITY-REPORT-02·03) — 개인정보 없이 일시/질문요약/경로/근거유무/신고유무/검토상태 ──

_SESSIONS_SQL = """
select s.id, s.created_at,
       case th.owner_type when 'patient' then 'app' when 'anonymous_web' then 'web' else th.owner_type end as channel,
       coalesce(r.status, 'unreviewed') as review_status,
       (select pm.content from chat_messages pm where pm.ai_chat_session_id = s.id and pm.sender_type = 'patient'
          order by pm.created_at asc, pm.id asc limit 1) as question_summary,
       exists(select 1 from chat_messages bm join chat_message_sources cs on cs.message_id = bm.id
                where bm.ai_chat_session_id = s.id) as has_kb_source,
       exists(select 1 from answer_feedback f join chat_messages bm on bm.id = f.message_id
                where bm.ai_chat_session_id = s.id) as reported
from ai_chat_sessions s
join chat_threads th on th.id = s.thread_id
left join chat_quality_reviews r on r.ai_chat_session_id = s.id
where ($1::text is null or $1 = '' or (s.created_at at time zone 'Asia/Seoul')::date >= $1::date)
  and ($2::text is null or $2 = '' or (s.created_at at time zone 'Asia/Seoul')::date <= $2::date)
order by (r.id is null) desc, s.created_at desc, s.id desc
limit $3 offset $4
"""


async def list_sessions(date_from: str | None, date_to: str | None, page: int = 1) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_SESSIONS_SQL, date_from, date_to, PAGE_SIZE, max(page - 1, 0) * PAGE_SIZE)
    return [{
        "id": str(r["id"]), "at": r["created_at"].isoformat(), "channel": r["channel"],
        "review_status": r["review_status"], "question_summary": r["question_summary"],
        "has_kb_source": bool(r["has_kb_source"]), "reported": bool(r["reported"]),
    } for r in rows]


async def _first_bot_message(conn, session_id: UUID):
    return await conn.fetchrow(
        "select id, content from chat_messages where ai_chat_session_id=$1 and sender_type='bot' "
        "order by created_at asc, id asc limit 1", session_id)


async def get_session(session_id: UUID) -> dict:
    # 상세 원문(QUALITY-REPORT-04·12) — 환자 질문·봇 답변·답변에 쓴 안내(근거 제목). 없는 세션은 404.
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval("select 1 from ai_chat_sessions where id=$1", session_id)
        if exists is None:
            raise AppError("없는 상담입니다.", 404)
        q = await conn.fetchval(
            "select content from chat_messages where ai_chat_session_id=$1 and sender_type='patient' "
            "order by created_at asc, id asc limit 1", session_id)
        bot = await _first_bot_message(conn, session_id)
        kb = None
        if bot is not None:
            kb = await conn.fetchval(
                "select title_snapshot from chat_message_sources where message_id=$1 order by rank asc limit 1", bot["id"])
    return {"question": q, "answer": bot["content"] if bot else None, "kb_source": kb,
            "bot_message_id": str(bot["id"]) if bot else None}


async def correct(session_id: UUID, staff_id: UUID, correction_text: str) -> dict:
    # 교정 저장(QUALITY-REPORT-05·08) — source=quality_review로 오답 처리함에 등록 + 검토 상태 corrected.
    # 교정만으로 승인 자료를 바꾸지 않는다(B3·G-06). 봇 답변이 없는 상담은 교정 대상이 없다(409).
    pool = await get_pool()
    async with pool.acquire() as conn:
        bot = await _first_bot_message(conn, session_id)
    if bot is None:
        raise AppError("교정할 봇 답변이 없는 상담입니다.", 409)
    fb = await answer_feedback_service.report(bot["id"], staff_id, correction_text=correction_text, source="quality_review")
    await mark_reviewed(session_id, staff_id, status="corrected")
    return {"feedback_id": str(fb["id"])}


async def record_unresolved(ticket_id: UUID | None, question: str, embedder) -> None:
    # 봇이 못 답한 질문을 임베딩과 함께 저장(클러스터 대상). WEBCHAT-NOANS 결정 B: 인계로 티켓이 생겼든(ticket_id)
    # 사용자가 조용히 포기했든(ticket_id=None) 모든 no_answer를 기록한다 — 가장 큰 KB 구멍(포기한 다수)을 놓치지 않게.
    vec = (await embedder.embed([question]))[0]
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "insert into unresolved_questions (ticket_id, question_text, question_embedding) values ($1,$2,$3::vector)",
            ticket_id, question, "[" + ",".join(map(str, vec)) + "]")
