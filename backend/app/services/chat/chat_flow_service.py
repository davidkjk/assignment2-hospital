import json
from uuid import UUID

from app.db.pool import get_pool
from app.services.chat import orchestrator, rag_service, quality_service


async def handle_patient_message(session, content: str, *, thread_id: UUID,
                                 client_message_id: UUID | None, embedder, model) -> dict:
    # session은 서비스가 넘긴 객체(.id)일 수도, 라우터/테스트가 넘긴 asyncpg Record(["id"])일 수도 있다.
    sid = session.id if hasattr(session, "id") else session["id"]
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1+2 원자적으로(C6-#8 F05): 메시지 저장과 활동갱신이 한 트랜잭션 — 만료면 record_ai_activity가 raise하며
        #   방금 넣은 환자 메시지도 함께 롤백된다(만료 세션에 고아 메시지 + 409 방지).
        async with conn.transaction():
            # 1. 환자 메시지 저장(멱등). AI 세션 문맥.
            await conn.fetchrow(
                "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, sender_patient_id, "
                "message_type, content, client_message_id) "
                "select $1,$2,'patient', t.patient_id, 'text', $3, $4 from chat_threads t where t.id=$1 "
                "on conflict (client_message_id) where client_message_id is not null do nothing returning *",
                thread_id, sid, content, client_message_id)
            # 2. 30분 연장(만료됐으면 record_ai_activity가 막는다 → 상위에서 새 세션 안내).
            await conn.execute("select record_ai_activity($1)", sid)
        # 3. 최근 히스토리(롤링 윈도우).
        hist = await conn.fetch(
            "select content from chat_messages where thread_id=$1 and content is not null "
            "order by created_at desc, id desc limit $2", thread_id, orchestrator.CHAT_CONTEXT_TURN_WINDOW)
    history_texts = [h["content"] for h in reversed(hist)]

    async def rag_fn(s, m):
        return await rag_service.rag_answer(m, embedder=embedder, model=model)

    out = await orchestrator.orchestrate(session, content, history_texts=history_texts,
                                         rag_fn=rag_fn, model=model)
    async with pool.acquire() as conn:
        if out["route_taken"] == "handoff":
            # AI 세션 종료 + 티켓 생성 + 시스템 메시지. no_answer면 미해결 기록.
            await conn.execute(
                "update ai_chat_sessions set status='ended', ended_at=now(), end_reason='staff_handoff' where id=$1",
                sid)
            ticket = await conn.fetchrow(
                "select * from create_support_ticket($1, $2, null, null)", thread_id, sid)
            await conn.execute(
                "insert into chat_messages (thread_id, support_ticket_id, sender_type, message_type, payload) "
                "values ($1,$2,'system','system', $3::jsonb)", thread_id, ticket["id"],
                json.dumps({"event": "staff_handoff", "reason": out["handoff_reason"]}))
            if out["handoff_reason"] == "no_answer":
                await quality_service.record_unresolved(ticket["id"], content, embedder)
            return {"route_taken": "handoff", "ticket_id": ticket["id"], "reason": out["handoff_reason"]}
        # 봇 답변(응급·rag·department_guide). route_taken 기록 + 근거 스냅샷.
        bmsg = await conn.fetchrow(
            "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content, route_taken) "
            "values ($1,$2,'bot','text',$3,$4) returning id", thread_id, sid,
            out.get("reply") or "", out["route_taken"])  # bmsg
        # C6-#8 F04: 봇 답변도 활동이다(정본 last_activity=환자|봇 메시지 시각) → expires_at 갱신.
        #   best-effort(raise 안 함): 응답 저장이 만료 때문에 500나면 안 되므로 record_ai_activity 대신 직접 UPDATE.
        await conn.execute(
            "update ai_chat_sessions set last_activity_at=now(), expires_at=now()+interval '30 minutes' "
            "where id=$1 and status='active' and now() < expires_at", sid)
    if out.get("sources"):
        await rag_service.record_answer_sources(bmsg["id"], out["sources"])
    return {"route_taken": out["route_taken"], "message_id": bmsg["id"],
            "reply": out.get("reply"), "restricted_block": out.get("restricted_block")}
