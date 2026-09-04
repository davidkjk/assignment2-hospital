import json
from uuid import UUID

from app.db.pool import get_pool
from app.services.chat import orchestrator, rag_service, quality_service


# 발신자 종류별 소유 컬럼(§4.3 발신자↔상담방 소유권 트리거가 이 짝을 강제한다).
#   ⚠️ DB sender_type은 둘 다 'patient'다 — chat_messages_sender_shape는 'patient'일 때
#      sender_patient_id XOR sender_anonymous_session_id를 요구한다('anonymous_web'은 sender_type 값이 아님).
#   patient       = 로그인 환자(sender_patient_id = 상담방 patient_id)
#   anonymous_web = 웹 위젯 익명 세션(sender_anonymous_session_id = 상담방 anonymous_session_id)
_SENDER_ID_COL = {
    "patient": ("sender_patient_id", "t.patient_id"),
    "anonymous_web": ("sender_anonymous_session_id", "t.anonymous_session_id"),
}


async def handle_patient_message(session, content: str, *, thread_id: UUID,
                                 client_message_id: UUID | None, embedder, model) -> dict:
    return await handle_message(session, content, thread_id=thread_id,
                                client_message_id=client_message_id, embedder=embedder,
                                model=model, sender_kind="patient")


async def handle_anonymous_message(session, content: str, *, thread_id: UUID,
                                   client_message_id: UUID | None, embedder, model) -> dict:
    return await handle_message(session, content, thread_id=thread_id,
                                client_message_id=client_message_id, embedder=embedder,
                                model=model, sender_kind="anonymous_web")


async def handle_message(session, content: str, *, thread_id: UUID,
                         client_message_id: UUID | None, embedder, model,
                         sender_kind: str = "patient") -> dict:
    # session은 서비스가 넘긴 객체(.id)일 수도, 라우터/테스트가 넘긴 asyncpg Record(["id"])일 수도 있다.
    sid = session.id if hasattr(session, "id") else session["id"]
    sender_col, sender_src = _SENDER_ID_COL[sender_kind]  # 내부 상수 — 사용자 입력 아님(f-string 안전)
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1+2 원자적으로(C6-#8 F05): 메시지 저장과 활동갱신이 한 트랜잭션 — 만료면 record_ai_activity가 raise하며
        #   방금 넣은 발신 메시지도 함께 롤백된다(만료 세션에 고아 메시지 + 409 방지).
        async with conn.transaction():
            # 1. 발신 메시지 저장(멱등). AI 세션 문맥. sender_type은 'patient', 소유 컬럼만 종류에 맞춘다.
            await conn.fetchrow(
                f"insert into chat_messages (thread_id, ai_chat_session_id, sender_type, {sender_col}, "
                f"message_type, content, client_message_id) "
                f"select $1,$2,'patient', {sender_src}, 'text', $3, $4 from chat_threads t where t.id=$1 "
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
    # 봇 메시지 본문 결정: 평소 답(reply). 제한 주제 전용이면 reply가 비고 원문(restricted_block)이 본문이 된다(A3).
    body = (out.get("reply") or "").strip() or (out.get("restricted_block") or "").strip()
    # 본문이 비면(예: 예약 등 행동형 요청 — 이 대화 파이프라인엔 에이전트 도구가 주입되지 않는다) 빈 봇 메시지는
    # chat_messages_type_shape CHECK를 위반해 500난다 → 막다른 길 금지 원칙대로 직원 인계로 되돌린다.
    if out["route_taken"] != "handoff" and not body:
        out = {**out, "route_taken": "handoff", "handoff_reason": "action_unavailable"}
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
            body, out["route_taken"])  # bmsg (제한 주제면 body=restricted_block 원문)
        # C6-#8 F04: 봇 답변도 활동이다(정본 last_activity=환자|봇 메시지 시각) → expires_at 갱신.
        #   best-effort(raise 안 함): 응답 저장이 만료 때문에 500나면 안 되므로 record_ai_activity 대신 직접 UPDATE.
        await conn.execute(
            "update ai_chat_sessions set last_activity_at=now(), expires_at=now()+interval '30 minutes' "
            "where id=$1 and status='active' and now() < expires_at", sid)
    if out.get("sources"):
        await rag_service.record_answer_sources(bmsg["id"], out["sources"])
    return {"route_taken": out["route_taken"], "message_id": bmsg["id"],
            "reply": out.get("reply"), "restricted_block": out.get("restricted_block")}
