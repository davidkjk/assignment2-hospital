import asyncio
import json
from uuid import UUID

from app.core.config import settings
from app.core.errors import AppError, log_error
from app.db.pool import get_pool
from app.services import opening_hours
from app.integrations.langchain_client import classify_model_for
from app.services.chat import (orchestrator, rag_service, quality_service, card_builder,
                               booking_agent_service, intent_precheck, dept_guide_service,
                               conversation_understanding, realtime_broadcast)
from app.services.chat.agentic_rag import service as agentic_rag_service


class _EmptyAiResponse(Exception):
    """AI가 빈 응답(비-handoff 라우트에 본문 없음 = 일시 장애)을 냈다. 봇 메시지를 저장하지 않는다.

    동기 경로(handle_message)는 이걸 잡아 503(outage)으로 올리고, 스트리밍 경로(run_generation)는
    bot_done(outage=True) 이벤트로 변환한다 — 두 프론트의 outage 화면 동작은 동일하다(Q19 결정).
    """


# rag_fn 호출 형태 구분 sentinel(전면 통합). orchestrate가 legacy 모드면 rag_fn(s, m)로 2-arg 호출
#   → 여기서 스스로 후속질문을 재작성한다(계약 무변경). llm 모드면 이해기가 낸 검색질의를
#   retrieval_query=... 로 넘겨 이 재작성을 건너뛴다(질문 이해가 한 곳으로 통합됐으므로 중복 방지).
_LEGACY_REWRITE = object()


def _build_rag_fn(*, embedder, model, classify_model, history_texts, on_delta):
    # rag 갈래 실행 함수. 플래그(CHAT_AGENTIC_RAG) ON이면 에이전트형 RAG 그래프로, OFF면 현행 단발 경로로.
    #   두 경로 모두 orchestrate가 준 retrieval_query(멀티턴 재작성)를 최초 검색질의로 쓴다. 반환 dict 동형.
    async def rag_fn(s, m, retrieval_query=_LEGACY_REWRITE):
        if retrieval_query is _LEGACY_REWRITE:
            retrieval_query = None
            if conversation_understanding.has_followup_signal(m, history_texts):
                standalone = await conversation_understanding.rewrite_standalone(
                    m, history_texts, model=classify_model)
                retrieval_query = conversation_understanding.build_search_query(m, standalone)
        if settings.chat_agentic_rag:
            return await agentic_rag_service.agentic_rag_answer(
                m, embedder=embedder, model=model, judge_model=classify_model,
                retrieval_query=retrieval_query, on_delta=on_delta)
        return await rag_service.rag_answer(m, embedder=embedder, model=model,
                                            retrieval_query=retrieval_query, on_delta=on_delta)
    return rag_fn


# 발신자 종류별 소유 컬럼(§4.3 발신자↔상담방 소유권 트리거가 이 짝을 강제한다).
#   ⚠️ DB sender_type은 둘 다 'patient'다 — chat_messages_sender_shape는 'patient'일 때
#      sender_patient_id XOR sender_anonymous_session_id를 요구한다('anonymous_web'은 sender_type 값이 아님).
#   patient       = 로그인 환자(sender_patient_id = 상담방 patient_id)
#   anonymous_web = 웹 위젯 익명 세션(sender_anonymous_session_id = 상담방 anonymous_session_id)
_SENDER_ID_COL = {
    "patient": ("sender_patient_id", "t.patient_id"),
    "anonymous_web": ("sender_anonymous_session_id", "t.anonymous_session_id"),
}


def build_history(rows, current_id) -> list[str]:
    # 최근 이력 윈도우(최신순 fetch)에서 방금 저장한 현재 메시지(current_id)를 빼고 시간순으로 돌려준다.
    #   현재 메시지가 이 목록에 남으면 진료과 흐름이 [*history, message]로 현재 발화를 두 번 넣고
    #   (리포트 §2.2), 반복 감지가 현재를 세어 threshold를 1 일찍 친다. 둘 다 제외로 바로잡는다.
    #   ⚠️ 내용이 아니라 id로 제외한다 — 같은 말을 반복하면 이전 발화는 보존해야 한다.
    return [r["content"] for r in reversed(rows) if r["id"] != current_id]


_ROLE_LABEL = {"patient": "환자", "bot": "상담봇", "staff": "직원", "system": "안내"}


def format_roled_history(rows, current_id) -> list[str]:
    # build_history와 같되 화자 라벨을 붙인다(리포트 §2.2 — content만이면 누가 말했는지 모델이 구분 못 함).
    #   직원 인계 요약 LLM이 "환자가 말한 것"과 "봇이 답한 것"을 구분하도록 "환자:/상담봇:/직원:/안내:"를 접두.
    return [f"{_ROLE_LABEL.get(r['sender_type'], '발화')}: {r['content']}"
            for r in reversed(rows) if r["id"] != current_id]


def next_active_flow(out: dict) -> str | None:
    # 진료과 문진을 다음 턴까지 유지할지 결정한다(리포트 §2.3 — active_flow 지속으로 멀티턴 유지).
    #   봇이 불편을 되물었을 때(route=department_guide인데 아직 추천이 없음)만 흐름을 이어가고,
    #   추천 완료·다른 갈래·인계·응급이면 종료(None)한다. 응급 플래그는 방어적으로 함께 배제한다.
    if (out.get("route_taken") == "department_guide"
            and not out.get("suggested_department")
            and not out.get("emergency")):
        return "department_guide"
    return None


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


def _sid(session):
    # session은 서비스가 넘긴 객체(.id)일 수도, 라우터/테스트가 넘긴 asyncpg Record(["id"])일 수도 있다.
    return session.id if hasattr(session, "id") else session["id"]


def _insert_patient_sql(sender_kind: str) -> str:
    # 발신 메시지 저장 SQL(멱등). AI 세션 문맥. sender_type은 'patient', 소유 컬럼만 종류에 맞춘다.
    #   ⚠️ 사용자 입력 아님(sender_col/sender_src는 내부 상수) — f-string 안전.
    sender_col, sender_src = _SENDER_ID_COL[sender_kind]
    return (
        f"insert into chat_messages (thread_id, ai_chat_session_id, sender_type, {sender_col}, "
        f"message_type, content, client_message_id) "
        f"select $1,$2,'patient', {sender_src}, 'text', $3, $4 from chat_threads t where t.id=$1 "
        "on conflict (client_message_id) where client_message_id is not null do nothing returning id")


async def prepare_turn(session, content: str, *, thread_id: UUID,
                       client_message_id: UUID | None, sender_kind: str = "patient") -> dict:
    """요청 스코프(빠름): 환자 메시지 저장(멱등)·활동갱신·인계(open_ticket) 판정.

    반환 `{accepted, route_taken, user_message_id, is_new}`.
    - `route_taken=="staff"`면 사람 상담 모드(생성하지 않는다).
    - `is_new=False`면 중복 전송(생성하지 않는다 — 연타/재시도로 답이 2번 나지 않게).
    """
    sid = _sid(session)
    insert_sql = _insert_patient_sql(sender_kind)
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 인계됨(사람 상담 모드): 이 스레드에 처리 중 티켓(pending/in_progress)이 있으면 AI를 돌리지 않고
        #   환자 메시지만 저장한다(직원이 실시간으로 본다. 직원 상세는 thread 기준 조회 = _DETAIL_MESSAGES_SQL).
        #   ⭐ 이 검사는 record_ai_activity보다 **먼저** 와야 한다 — 진짜 인계는 AI 세션을 status='ended'로 만들고
        #   (아래 handoff 분기) 티켓을 생성하는데, ended 세션에선 record_ai_activity가 raise하며 트랜잭션을 통째
        #   롤백시켜 예전엔 이 억제 검사에 도달조차 못 했다(2026-09-09 실기기: 인계 후 환자 답장이 직원에게 안
        #   이어지고 소실됐다). 여기선 만료 연장(record_ai_activity)을 하지 않는다 — 죽은 세션을 되살리지 않는다.
        open_ticket = await conn.fetchval(
            "select 1 from support_tickets where thread_id=$1 and status in ('pending','in_progress') limit 1",
            thread_id)
        if open_ticket:
            inserted = await conn.fetchrow(insert_sql, thread_id, sid, content, client_message_id)
            current_id = inserted["id"] if inserted else await conn.fetchval(
                "select id from chat_messages where thread_id=$1 and client_message_id=$2",
                thread_id, client_message_id)
            return {"accepted": True, "route_taken": "staff",
                    "user_message_id": current_id, "is_new": bool(inserted)}
        # 1+2 원자적으로(C6-#8 F05): 메시지 저장과 활동갱신이 한 트랜잭션 — 만료면 record_ai_activity가 raise하며
        #   방금 넣은 발신 메시지도 함께 롤백된다(만료 세션에 고아 메시지 + 409 방지).
        async with conn.transaction():
            inserted = await conn.fetchrow(insert_sql, thread_id, sid, content, client_message_id)
            # 2. 30분 연장(만료됐으면 record_ai_activity가 막는다 → 상위에서 새 세션 안내).
            await conn.execute("select record_ai_activity($1)", sid)
        # 방금 저장한 현재 메시지 id — 멱등 재시도로 insert가 no-op이면(None) client_message_id로 되찾는다.
        current_id = inserted["id"] if inserted else await conn.fetchval(
            "select id from chat_messages where thread_id=$1 and client_message_id=$2",
            thread_id, client_message_id)
    return {"accepted": True, "route_taken": None,
            "user_message_id": current_id, "is_new": bool(inserted)}


async def handle_message(session, content: str, *, thread_id: UUID,
                         client_message_id: UUID | None, embedder, model,
                         sender_kind: str = "patient") -> dict:
    """동기 호환 경로(기존 계약 보존). prepare_turn 후 생성을 그 자리에서 await해 결과 dict를 돌려준다.

    스트리밍은 라우터가 prepare_turn + run_generation(백그라운드)으로 분리해 쓴다. 이 래퍼는 인계 후
    사람상담(staff)·빈 응답(503)·no_answer 등 기존 반환·예외 계약을 그대로 유지한다(무회귀).
    """
    prep = await prepare_turn(session, content, thread_id=thread_id,
                              client_message_id=client_message_id, sender_kind=sender_kind)
    if prep["route_taken"] == "staff":
        return {"route_taken": "staff", "message_id": prep["user_message_id"], "reply": None}
    try:
        return await _generate(session, content, thread_id=thread_id, sender_kind=sender_kind,
                               embedder=embedder, model=model)
    except _EmptyAiResponse:
        # 기존 계약: 빈 응답은 503(두 프론트의 outage 경로가 동일하게 반응). 로깅은 _generate가 이미 했다.
        raise AppError("잠시 AI 상담을 이용할 수 없어요. 잠시 후 다시 시도해 주세요.", status_code=503)


async def run_generation(session, content: str, *, thread_id: UUID, gen: str,
                         embedder, model, sender_kind: str = "patient") -> None:
    """요청과 분리된 백그라운드 생성. 조각·완료를 실시간 채널로 민다(요청이 끊겨도 완주).

    bot_typing(on) → (rag면 bot_delta 조각들) → bot_done → bot_typing(off). 빈 응답은 bot_done(outage).
    """
    await realtime_broadcast.broadcast(thread_id, "bot_typing", {"gen": gen, "on": True})
    seq = {"n": 0}
    _delta_tasks: set = set()

    def on_delta(text: str) -> None:
        seq["n"] += 1
        # 발행은 fire-and-forget(생성 루프를 막지 않게). best-effort.
        task = asyncio.create_task(
            realtime_broadcast.broadcast(thread_id, "bot_delta", {"gen": gen, "seq": seq["n"], "text": text}))
        _delta_tasks.add(task)
        task.add_done_callback(_delta_tasks.discard)

    try:
        result = await _generate(session, content, thread_id=thread_id, sender_kind=sender_kind,
                                 embedder=embedder, model=model, on_delta=on_delta)
        await realtime_broadcast.broadcast(thread_id, "bot_done", {
            "gen": gen,
            "messageId": str(result["message_id"]) if result.get("message_id") else None,
            "routeTaken": result["route_taken"],
            "card": result.get("card"),
            "outage": False,
        })
    except _EmptyAiResponse:
        # 빈 응답 = AI 일시 장애 → 봇 말풍선 저장 없이 outage 이벤트(클라가 장애 화면). 로깅은 _generate가 했다.
        await realtime_broadcast.broadcast(thread_id, "bot_done", {
            "gen": gen, "messageId": None, "routeTaken": "outage", "card": None, "outage": True})
    finally:
        await realtime_broadcast.broadcast(thread_id, "bot_typing", {"gen": gen, "on": False})


async def _generate(session, content: str, *, thread_id: UUID, sender_kind: str,
                    embedder, model, on_delta=None) -> dict:
    # prepare_turn이 이미 환자 메시지를 저장했다(별도 트랜잭션). 여기선 이력만 읽어 답을 만든다.
    sid = _sid(session)
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 방금 저장된 현재(환자) 메시지 = 최신 patient content 메시지. build_history가 이걸 제외하도록 id를 잡는다.
        current_id = await conn.fetchval(
            "select id from chat_messages where thread_id=$1 and sender_type='patient' and content is not null "
            "order by created_at desc, id desc limit 1", thread_id)
        # 최근 히스토리(롤링 윈도우). 현재 메시지를 뺀 이전 발화만 필요하므로 +1개를 더 가져와
        #    build_history가 현재(current_id)를 제외한 뒤에도 윈도우 크기를 유지한다.
        hist = await conn.fetch(
            "select id, sender_type, content from chat_messages where thread_id=$1 and content is not null "
            "order by created_at desc, id desc limit $2", thread_id, orchestrator.CHAT_CONTEXT_TURN_WINDOW + 1)
    history_texts = build_history(hist, current_id)
    # 이해 계층(분류·라우팅·재작성·인계판정)은 빠른 모델(Haiku)로, 답변 생성은 model(Sonnet) 유지 —
    #   답변 앞단 지연 절감(스트리밍 설계 §98). 주입 가짜 모델은 그대로(테스트 오프라인 무회귀).
    classify_model = classify_model_for(model)

    # rag 갈래 실행(멀티턴 재작성 + 플래그 분기)은 모듈수준 _build_rag_fn으로 추출(플래그 분기 단위 테스트용).
    rag_fn = _build_rag_fn(embedder=embedder, model=model, classify_model=classify_model,
                           history_texts=history_texts, on_delta=on_delta)

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
                                         dept_guide_fn=dept_guide_fn, model=classify_model)
    # active_flow 지속(리포트 §2.3): 봇이 되물으면 진료과 문진을 다음 턴까지 유지하고, 추천·다른 갈래·인계면
    #   해제한다. pending_handoff_reason 지속(SUPPORT-HANDOFF-CONFIRM-ALL, 2026-09-09): 안전 감시가 인계
    #   확인 프롬프트를 낼 때 원래 사유를 세션에 저장했다가 다음 턴 [직원에게 연결하기] 칩 클릭에서 그 사유로
    #   인계한다. 확인 프롬프트가 아닌 턴은 out에 키가 없어 None → 해제(칩 안 누르고 딴 걸 물으면 대기 취소).
    #   둘 다 값이 바뀔 때만 한 UPDATE로(대부분 턴은 무변경 → 커넥션 절약, Supavisor 풀 한도 고려).
    next_flow = next_active_flow(out)
    next_pending = out.get("pending_handoff_reason")
    if (next_flow != orchestrator.session_value(session, "active_flow")
            or next_pending != orchestrator.session_value(session, "pending_handoff_reason")):
        async with pool.acquire() as conn:
            await conn.execute(
                "update ai_chat_sessions set active_flow=$1, pending_handoff_reason=$2 "
                "where id=$3 and status='active'", next_flow, next_pending, sid)
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
    # 본문이 비면(카드도 없는 행동형/빈 응답 = AI가 답을 못 만든 상태) — Q19(결정 2026-09-08).
    #   예전엔 이걸 강제 handoff+자동 티켓으로 되돌렸다(action_unavailable). 그러나 그건 "AI 일시 장애"를
    #   "직원 인계"로 오인시켜 막다른 길처럼 보였다(스샷 2026-09-08: 증상 답변 직후 "직원에게 연결하고 있어요").
    #   → 장애 안내로 통일: 티켓·강제 handoff 없이 503(outage)으로 내려 두 프론트가 장애 화면을 띄운다
    #   (webchat=OutageNotice 기존 5xx 경로 그대로, 환자앱=ChatOutageView). 발신 메시지는 이미 저장(멱등)이라
    #   재시도 가능하고, AI 세션은 active로 유지한다(재시도 왕복 성공 시 복구). 빈 봇 메시지는 저장하지 않는다
    #   (chat_messages_type_shape CHECK 위반 500 회피 = 저장 자체를 안 하므로 자연 해소).
    #   ⛔ 진짜 인계 사유(medical_judgment·직원요청 등 orchestrator가 준 route_taken='handoff')는 아래에서 그대로.
    if out["route_taken"] != "handoff" and not body:
        await log_error("chat.ai_empty_response",
                        f"empty AI body (route={out['route_taken']}) thread={thread_id}",
                        safe_summary="AI 상담이 일시적으로 답변을 만들지 못했습니다.",
                        is_service_outage=True)
        # 동기 경로는 이걸 503으로, 스트리밍 경로는 bot_done(outage=True)로 변환한다(둘 다 outage 화면).
        raise _EmptyAiResponse()
    # Q28: 인계 요약 3항목(상담봇이 확인한 정보·이미 안내한 내용·직원이 확인할 사항)을 LLM으로 만들어
    #   staff_handoff payload에 함께 실어 직원 상세가 채우게 한다(TICKET-DETAIL-SUM-01). DB 커넥션을 잡기 전에
    #   생성한다 — LLM 왕복 동안 풀을 점유하지 않는다(Supavisor 15/풀 4 한도). 실패해도 make_handoff_summary가
    #   전부 None을 돌려주므로(best-effort) 인계는 이 요약 때문에 막히지 않는다(SUM-02: 없으면 '없음').
    handoff_summary = {}
    if out["route_taken"] == "handoff":
        # 인계 요약엔 화자 라벨을 붙인 이력을 준다(리포트 §2.2 — 누가 말했는지 구분). 현재(인계를 부른)
        #   발화도 포함한다(history는 현재 제외 → 환자 발화로 다시 붙인다).
        roled_history = format_roled_history(hist, current_id)
        handoff_summary = await orchestrator.make_handoff_summary(
            "\n".join([*roled_history, f"환자: {content}"]), model=model)
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
                json.dumps({"event": "staff_handoff", "reason": out["handoff_reason"], **handoff_summary}))
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
            # #6: 사람 연결 확인 프롬프트(confirm_handoff)는 KB 구멍이 아니므로 미해결로 기록하지 않는다.
            if not out.get("confirm_handoff"):
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
