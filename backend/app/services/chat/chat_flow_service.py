import json
from uuid import UUID

from app.db.pool import get_pool
from app.services import opening_hours
from app.services.chat import (orchestrator, rag_service, quality_service, card_builder,
                               booking_agent_service, intent_precheck, dept_guide_service)


# 발신자 종류별 소유 컬럼(§4.3 발신자↔상담방 소유권 트리거가 이 짝을 강제한다).
#   ⚠️ DB sender_type은 둘 다 'patient'다 — chat_messages_sender_shape는 'patient'일 때
#      sender_patient_id XOR sender_anonymous_session_id를 요구한다('anonymous_web'은 sender_type 값이 아님).
#   patient       = 로그인 환자(sender_patient_id = 상담방 patient_id)
#   anonymous_web = 웹 위젯 익명 세션(sender_anonymous_session_id = 상담방 anonymous_session_id)
_SENDER_ID_COL = {
    "patient": ("sender_patient_id", "t.patient_id"),
    "anonymous_web": ("sender_anonymous_session_id", "t.anonymous_session_id"),
}


def _guide_booking_card(sender_kind: str, matched: list[dict]) -> dict:
    # 웹=진료과 선택 카드(대화 내 예약, 증상칩 숨김), 앱=예약 마법사 인계 카드(첫 후보 프리필, 결정 B).
    if sender_kind == "anonymous_web":
        return card_builder.build_department_select_card(departments=matched, allow_symptom_guide=False)
    d0 = matched[0]
    return card_builder.build_open_booking_wizard_card(department_id=d0["id"], department_name=d0["name"])


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

    async def agent_fn(s, m):
        # 행동형(예약). 채널로 갈린다(사용자 결정 B):
        #  · 웹(anonymous_web) = 대화 내 예약 → 진료과 선택 카드(WEBBOOK-05).
        #  · 앱(patient) = 대화 안에서 예약하지 않고 예약 마법사로 인계 → open_booking_wizard 카드.
        if sender_kind == "anonymous_web":
            return await booking_agent_service.booking_agent(s, m)
        return await booking_agent_service.booking_wizard_handoff(s, m)

    async def intent_fn(s, m, intent):
        # B1·B2: 진료시간·의사명단은 DB 단일원본에서 읽는다(KBADM-EDITOR-17). 빈값이면 None → RAG 폴백.
        # Q15: 진료시간 답변 끝 안내 문구를 채널별로 — 웹은 "여기서 바로 예약", 앱은 "앱 예약 화면".
        channel = "web" if sender_kind == "anonymous_web" else "app"
        async with pool.acquire() as c:
            if intent == "hospital_hours":
                # Q8: 질문에 의사 이름이 있으면 그 의사 개인 진료시간(doctor_schedule_rules)으로 답한다.
                #     이름이 없으면(=일반 "진료시간") 병원 전체 시간을 유지한다(퇴행 방지).
                doctors = await c.fetch(
                    "select s.id, s.name, coalesce(d.name, s.specialty) as specialty "
                    "from staff s left join departments d on d.id = s.department_id "
                    "where s.role = 'doctor' and s.is_active")
                matched = intent_precheck.match_doctor_names(m, [dict(r) for r in doctors])
                if matched:
                    parts = []
                    for doc in matched:
                        rules = await c.fetch(
                            "select weekday, start_time, end_time, lunch_start, lunch_end "
                            "from doctor_schedule_rules where doctor_id = $1 order by weekday", doc["id"])
                        parts.append(intent_precheck.format_doctor_schedule(
                            doc["name"], doc.get("specialty"), [dict(r) for r in rules]))
                    return {"reply": "\n\n".join(parts)}
                return {"reply": intent_precheck.format_hours(
                    await opening_hours.list_hospital_hours(c), channel=channel)}
            if intent == "doctor_list":
                rows = await c.fetch(
                    "select s.name, coalesce(d.name, s.specialty) as specialty "
                    "from staff s left join departments d on d.id = s.department_id "
                    "where s.role = 'doctor' and s.is_active "
                    "order by coalesce(d.name, s.specialty) nulls last, s.name")
                return {"reply": intent_precheck.format_doctors([dict(r) for r in rows])}
        return None

    async def dept_guide_fn(s, m):
        # Q3: 증상 대화는 진단식 다단질문 없이 한 번에 답한다 — 진료과 목록을 넘겨 respond가 추천하게 하고,
        #     추천된 진료과(suggested_department)를 함께 돌려준다(하이브리드①이 예약 카드 재료로 쓴다).
        from app.services import department_service
        async with pool.acquire() as conn:
            departments = await department_service.list_departments(conn)
        result = await dept_guide_service.guide(
            message=m, history=history_texts, departments=departments, model=model)
        return {"reply": result["reply"], "suggested_department": result.get("suggested_department")}

    out = await orchestrator.orchestrate(session, content, history_texts=history_texts,
                                         rag_fn=rag_fn, agent_fn=agent_fn, intent_fn=intent_fn,
                                         dept_guide_fn=dept_guide_fn, model=model)
    # 하이브리드 ①(WEBBOOK-08): 증상 대화(department_guide)가 진료과를 추천하면 예약으로 잇는 카드를 함께 낸다.
    #   웹=진료과 선택 카드(대화 내 예약), 앱=예약 마법사 인계 카드(결정 B). 추천이 없으면(1회 질문 단계) 카드 없음.
    if out["route_taken"] == "department_guide" and out.get("suggested_department") and not out.get("card"):
        out = {**out, "card": _guide_booking_card(sender_kind, [out["suggested_department"]])}
    # 봇 메시지 본문 결정: 평소 답(reply). 제한 주제 전용이면 reply가 비고 원문(restricted_block)이 본문이 된다(A3).
    body = (out.get("reply") or "").strip() or (out.get("restricted_block") or "").strip()
    # 행동형(agent)·증상추천(department_guide)이 카드를 냈으면 막다른 길이 아니다 — 봇 말풍선 + 카드를 저장·반환한다.
    if out["route_taken"] in ("agent", "department_guide") and out.get("card"):
        rt = out["route_taken"]
        async with pool.acquire() as conn:
            bmsg = await conn.fetchrow(
                "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content, route_taken) "
                "values ($1,$2,'bot','text',$3,$4) returning id", thread_id, sid, body, rt)
            await conn.execute(
                "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, payload, route_taken) "
                "values ($1,$2,'bot','card',$3::jsonb,$4)", thread_id, sid, json.dumps(out["card"]), rt)
            await conn.execute(
                "update ai_chat_sessions set last_activity_at=now(), expires_at=now()+interval '30 minutes' "
                "where id=$1 and status='active' and now() < expires_at", sid)
        return {"route_taken": rt, "message_id": bmsg["id"], "reply": body, "card": out["card"]}
    # 본문이 비면(카드도 없는 행동형/빈 응답) 빈 봇 메시지는 chat_messages_type_shape CHECK 위반 500 →
    # 막다른 길 금지 원칙대로 직원 인계로 되돌린다.
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
        if out["route_taken"] == "no_answer":
            # WEBCHAT-NOANS: 자동 인계·자동 티켓 폐기 → 봇 안내 말풍선 + quick_replies 카드(FAQ 칩 + [직원에게 연결]).
            #   세션은 유지(active)하고, 미해결 질문은 티켓 없이(null) 기록(결정 B — 조용히 포기한 다수까지 KB 구멍으로 잡는다).
            bmsg = await conn.fetchrow(
                "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content, route_taken) "
                "values ($1,$2,'bot','text',$3,'no_answer') returning id", thread_id, sid, body)
            card = card_builder.build_quick_replies_card(
                replies=out["quick_replies"], handoff_chip=out["handoff_chip"])
            await conn.execute(
                "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, payload, route_taken) "
                "values ($1,$2,'bot','card',$3::jsonb,'no_answer')", thread_id, sid, json.dumps(card))
            # 봇 답변도 활동이다(정본 last_activity) → 세션 만료 시각 갱신(만료였으면 갱신 안 됨 — 상위가 새 세션 안내).
            await conn.execute(
                "update ai_chat_sessions set last_activity_at=now(), expires_at=now()+interval '30 minutes' "
                "where id=$1 and status='active' and now() < expires_at", sid)
            await quality_service.record_unresolved(None, content, embedder)
            return {"route_taken": "no_answer", "message_id": bmsg["id"], "reply": body, "card": card}
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
