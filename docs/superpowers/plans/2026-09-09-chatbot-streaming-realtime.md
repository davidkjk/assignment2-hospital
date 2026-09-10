# 상담봇 답변 스트리밍(실시간 채널 밀기) 구현 계획 — 백엔드 + webchat

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담봇 답변을 긴 HTTP 응답이 아니라 이미 구독 중인 Supabase 실시간 채널(`chat-typing:<threadId>`)로 흘려보내, 모바일에서 "끊김"을 없애고 첫 글자를 1~2초에 보이게 한다(백엔드 발행기 + webchat 수신).

**Architecture:** `/chat/messages`는 사용자 메시지만 저장하고 즉시 ack(~1초)를 반환한다. 답변 생성은 요청과 분리된 백그라운드 태스크(`asyncio.create_task`)가 수행하며, 생성 조각·완료를 service_role로 Supabase Broadcast REST 엔드포인트에 POST해 채널로 민다. 봇 답은 지금처럼 `chat_messages`(sender_type='bot')에 저장되어 DB가 정본이고, 실시간을 놓치면 클라가 재조회로 복구한다.

**Tech Stack:** FastAPI/asyncpg/httpx(백엔드), langchain-anthropic `astream`, Supabase Realtime Broadcast REST(`POST /realtime/v1/api/broadcast`), React/TypeScript + supabase-js(webchat), pytest-async / vitest+testing-library.

**Spec:** `docs/superpowers/specs/2026-09-09-chatbot-streaming-realtime-design.md`

## Global Constraints

- **한 토픽 2채널 금지**: 봇 이벤트는 **새 채널을 열지 말고** 이미 열린 `chat-typing:<threadId>` 채널에만 얹는다(같은 토픽 2채널=한쪽 유실 버그, `chat_repository.dart:165`).
- **앱이 임의로 요청을 끊지 않는다**(`BTN-TIME-01`): 클라 타임아웃/자동 재시도 도입 금지.
- **안전 게이트 무변경**: `safety_watchdog`(응급·직원요청·escalation)와 분류(`chat_router`/`conversation_understanding`)는 이 계획에서 건드리지 않는다.
- **멱등**: 사용자 메시지 insert는 `on conflict (client_message_id) do nothing`. **새로 저장된 경우에만** 생성 태스크를 기동한다(연타/재시도로 답이 2번 나지 않게).
- **DB가 정본**: 봇 답은 `chat_messages`에 저장. 실시간은 빠른 전달 경로일 뿐 — 놓치면 재조회로 복구.
- **broadcast는 best-effort**: 발행 실패가 DB 저장·응답을 막지 않는다(예외 삼키고 로깅).
- **YAGNI(범위 밖)**: 분류 모델 Haiku 교체·이해기 통합(3→2)·환자앱 수신은 이 계획에 없다(각자 별도).

## 채널 이벤트 프로토콜 (webchat이 의존하는 계약)

기존 채널 `chat-typing:<threadId>`에 아래 3개 broadcast 이벤트를 추가한다.

| event | payload | 의미 |
|---|---|---|
| `bot_typing` | `{ gen: str, on: bool }` | AI 답변 생성 중(점 세 개) |
| `bot_delta` | `{ gen: str, seq: int, text: str }` | 답 텍스트 **조각(델타)**. 클라가 `seq` 순서로 누적 |
| `bot_done` | `{ gen: str, messageId: str\|null, routeTaken: str, card: obj\|null, outage: bool }` | 완료. `outage:true`면 AI 일시장애(빈 답 503 경로) — 클라가 OutageNotice 표시, 봇 말풍선 저장 안 됨 |

- `gen` = 답변 1건 식별 uuid(요청이 생성해 ack로 돌려주고, 태스크가 모든 이벤트에 실어 보냄). 클라는 자기 `gen`이 아닌 조각을 폐기한다.
- 스트리밍 없는 빠른 경로(emergency·handoff·no_answer·agent/dept 카드·intent DB답)는 `bot_typing on` → (델타 없음) → `bot_done`으로 균일 처리.

## File Structure

- **Create** `backend/app/services/chat/realtime_broadcast.py` — Supabase Broadcast REST로 이벤트 1건을 미는 얇은 발행기(best-effort).
- **Modify** `backend/app/services/chat/rag_service.py` — `rag_answer(..., on_delta=None)`: 콜백 있으면 `astream`으로 조각 출력.
- **Modify** `backend/app/services/chat/chat_flow_service.py` — `handle_message`를 (a) 사용자 저장+ack 반환 (b) 백그라운드 `run_generation`(생성+저장+emit)으로 분리.
- **Modify** `backend/app/routers/chat.py` — `/chat/messages`가 ack를 반환하고, 새 메시지일 때만 생성 태스크를 기동.
- **Modify** `backend/app/core/config.py` — (변경 없음, `supabase_url`·`supabase_service_role_key` 재사용 확인만).
- **Modify** `webchat/src/widget/useStaffPresence.ts` — 같은 채널에서 `bot_typing/bot_delta/bot_done` 수신 → 콜백으로 전달.
- **Modify** `webchat/src/state/useWebchat.ts` — 동기 응답 대신 실시간 봇 스트림을 메시지 상태에 반영 + 재조회 폴백.
- **Modify** `webchat/src/api/webchatApi.ts` — `sendMessage` 반환을 ack(`{accepted, gen}`)로 조정.
- **Modify** `webchat/src/widget/WebchatWidget.tsx` — 두 훅 배선(봇 이벤트 콜백 연결).

---

## Track ① — 백엔드 (공통 발행기 + 생성 분리)

### Task 1: 실시간 발행기 `realtime_broadcast`

**Files:**
- Create: `backend/app/services/chat/realtime_broadcast.py`
- Test: `backend/tests/test_realtime_broadcast.py`

**Interfaces:**
- Produces: `async def broadcast(thread_id: UUID, event: str, payload: dict) -> None` — best-effort, 예외를 밖으로 내지 않음.

- [ ] **Step 1: 실패 테스트 작성** — POST가 올바른 URL·헤더·바디로 나가는지, 실패해도 raise 안 하는지.

```python
# backend/tests/test_realtime_broadcast.py
import uuid
import httpx
import pytest
from app.services.chat import realtime_broadcast
from app.core.config import settings


@pytest.mark.asyncio
async def test_broadcast_posts_to_supabase_endpoint(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://ref.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "svc-key")
    captured = {}

    class FakeResp:
        status_code = 202
        def raise_for_status(self): pass

    class FakeClient:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, json=None, headers=None):
            captured["url"] = url; captured["json"] = json; captured["headers"] = headers
            return FakeResp()

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    tid = uuid.uuid4()
    await realtime_broadcast.broadcast(tid, "bot_typing", {"gen": "g1", "on": True})

    assert captured["url"] == "https://ref.supabase.co/realtime/v1/api/broadcast"
    assert captured["headers"]["apikey"] == "svc-key"
    assert captured["headers"]["Authorization"] == "Bearer svc-key"
    msg = captured["json"]["messages"][0]
    assert msg["topic"] == f"chat-typing:{tid}"
    assert msg["event"] == "bot_typing"
    assert msg["payload"] == {"gen": "g1", "on": True}


@pytest.mark.asyncio
async def test_broadcast_swallows_errors(monkeypatch):
    class BoomClient:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k): raise httpx.ConnectError("down")
    monkeypatch.setattr(httpx, "AsyncClient", BoomClient)
    # raise되면 테스트 실패 — best-effort라 조용히 넘어가야 한다.
    await realtime_broadcast.broadcast(uuid.uuid4(), "bot_done", {"gen": "g1"})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_realtime_broadcast.py -v`
Expected: FAIL (`ModuleNotFoundError: realtime_broadcast`)

- [ ] **Step 3: 최소 구현**

```python
# backend/app/services/chat/realtime_broadcast.py
from uuid import UUID
import httpx
from app.core.config import settings
from app.core.errors import log_error  # 기존 로깅 헬퍼(없으면 print로 대체 금지 — 아래 주석 참고)


async def broadcast(thread_id: UUID, event: str, payload: dict) -> None:
    """`chat-typing:<thread_id>` 채널로 이벤트 1건을 민다(Supabase Broadcast REST).

    best-effort: 발행 실패가 DB 저장·응답을 막지 않는다(전달 실패 시 클라는 DB 재조회로 복구).
    """
    url = f"{settings.supabase_url.rstrip('/')}/realtime/v1/api/broadcast"
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    body = {"messages": [{"topic": f"chat-typing:{thread_id}", "event": event, "payload": payload}]}
    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.post(url, json=body, headers=headers)
            resp.raise_for_status()
    except Exception:
        # best-effort. 로깅만(있으면). log_error 시그니처가 다르면 이 줄을 프로젝트 로거로 맞춘다.
        pass
```

> 참고: `log_error` import가 이 파일에서 순환/미사용이면 제거하고 `pass`만 둔다(실제 로깅은 Task 3의 outage 경로가 담당). 목표는 "발행 실패로 절대 안 터진다".

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_realtime_broadcast.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: 커밋**

```bash
git add backend/app/services/chat/realtime_broadcast.py backend/tests/test_realtime_broadcast.py
git commit -m "feat(상담봇 스트리밍): Supabase Broadcast REST 발행기(best-effort) 추가"
```

---

### Task 2: `rag_answer` 델타 스트리밍(`astream`)

**Files:**
- Modify: `backend/app/services/chat/rag_service.py:65-125`
- Test: `backend/tests/test_rag_stream.py`

**Interfaces:**
- Consumes: (없음)
- Produces: `rag_answer(message, *, embedder, model=None, match_count=5, retrieval_query=None, on_delta=None)` — `on_delta`가 주어지고 모델이 `astream`을 지원하면 조각을 흘리며 `on_delta(text_chunk)`를 호출한다. 반환 계약은 기존과 동일(`{"reply": ...}` 등).

- [ ] **Step 1: 실패 테스트 작성** — on_delta가 조각마다 불리고, 최종 reply는 조각들의 합인지. 검색·게이트는 기존 mock 그대로.

```python
# backend/tests/test_rag_stream.py
import pytest
from app.services.chat import rag_service

class FakeChunk:
    def __init__(self, text): self.content = text

class StreamModel:
    """astream을 지원하는 가짜 모델 — 조각을 순서대로 흘린다."""
    def __init__(self, parts): self._parts = parts
    async def astream(self, messages):
        for p in self._parts:
            yield FakeChunk(p)

@pytest.mark.asyncio
async def test_rag_answer_streams_deltas(monkeypatch, fake_embedder, patched_kb_hits):
    # patched_kb_hits: match_count 청크가 게이트를 통과하도록 세팅하는 기존 픽스처(없으면 test_rag_service.py 패턴 재사용)
    seen = []
    model = StreamModel(["안녕", "하세요"])
    out = await rag_service.rag_answer(
        "진료시간 알려줘", embedder=fake_embedder, model=model,
        on_delta=lambda t: seen.append(t))
    assert seen == ["안녕", "하세요"]
    assert out["reply"] == "안녕하세요"
```

> `fake_embedder`/`patched_kb_hits`는 기존 `backend/tests/test_rag_service.py`의 픽스처·mock 패턴을 그대로 가져와 쓴다(검색이 청크를 반환하고 `HYBRID_FLOOR`를 넘도록). 없으면 그 파일에서 복사한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_rag_stream.py -v`
Expected: FAIL (`rag_answer() got an unexpected keyword argument 'on_delta'`)

- [ ] **Step 3: 구현** — `rag_service.py`의 최종 생성부(현재 124행 `resp = await (model or get_chat_model()).ainvoke(...)`)를 분기.

```python
# rag_service.py: 함수 시그니처(65행)에 on_delta 추가
async def rag_answer(message: str, *, embedder, model=None, match_count: int = 5,
                     retrieval_query: str | None = None, on_delta=None) -> dict:
    ...
    # 124행 부근 교체:
    llm = model or get_chat_model()
    prompt_messages = prompt.format_messages(**fmt)
    if on_delta is not None and hasattr(llm, "astream"):
        parts: list[str] = []
        async for chunk in llm.astream(prompt_messages):
            piece = resp_text(chunk)
            if piece:
                parts.append(piece)
                on_delta(piece)
        reply = "".join(parts).strip()
    else:
        resp = await llm.ainvoke(prompt_messages)
        reply = resp_text(resp).strip()
    # 이후 기존 로직(_NO_ANSWER_SENTINEL 검사 등)은 reply를 그대로 사용 — 변경 없음.
```

> 주의: 센티넬(`NO_ANSWER`/`NEEDS_CLARIFY`) 검사는 **누적 완성본**(reply)에 대해 기존대로 수행한다. 델타를 흘렸더라도 최종 판정이 no_answer면 반환은 `{"no_answer": True}` — 클라는 `bot_done`으로 정정(아래 Task 3). 델타가 이미 화면에 났다가 no_answer로 바뀌는 드문 경우는 Task 6에서 bot_done이 스트림 버블을 최종본으로 대체하며 처리.

- [ ] **Step 4: 테스트 통과 + 회귀 확인**

Run: `cd backend && pytest tests/test_rag_stream.py tests/test_rag_service.py -v`
Expected: PASS (신규 통과 + 기존 rag 테스트 무회귀 — `on_delta` 미지정 경로가 기존 `ainvoke`와 동일)

- [ ] **Step 5: 커밋**

```bash
git add backend/app/services/chat/rag_service.py backend/tests/test_rag_stream.py
git commit -m "feat(상담봇 스트리밍): rag_answer on_delta 델타 스트리밍(astream) + ainvoke 폴백"
```

---

### Task 3: `handle_message` 분리 — ack 부분 + 백그라운드 `run_generation`

**Files:**
- Modify: `backend/app/services/chat/chat_flow_service.py:82-295`
- Test: `backend/tests/test_chat_flow_stream.py` (+ 기존 `test_chat_flow_service.py` 무회귀)

**Interfaces:**
- Consumes: `realtime_broadcast.broadcast` (Task 1), `rag_answer(..., on_delta=...)` (Task 2)
- Produces:
  - `async def prepare_turn(session, content, *, thread_id, client_message_id, sender_kind) -> dict` — 사용자 메시지 저장(멱등)·활동갱신·open_ticket 판정. 반환 `{"accepted": bool, "route_taken": str|None, "user_message_id": UUID|None, "is_new": bool}`. `route_taken=="staff"`면 인계 모드(생성 안 함). `is_new=False`면 중복(생성 안 함).
  - `async def run_generation(session, content, *, thread_id, gen: str, embedder, model, sender_kind) -> None` — 히스토리·orchestrate·봇 저장·이벤트 emit. 요청과 분리돼 돌아도 안전(자체 풀 커넥션).

- [ ] **Step 1: 실패 테스트 작성(멱등 게이트)** — 같은 client_message_id로 두 번 prepare_turn하면 두 번째는 `is_new=False`.

```python
# backend/tests/test_chat_flow_stream.py
import uuid, pytest
from app.services.chat import chat_flow_service

@pytest.mark.asyncio
async def test_prepare_turn_idempotent(anon_session, clean_thread):
    cid = uuid.uuid4()
    a = await chat_flow_service.prepare_turn(anon_session, "안녕", thread_id=clean_thread,
                                             client_message_id=cid, sender_kind="anonymous_web")
    b = await chat_flow_service.prepare_turn(anon_session, "안녕", thread_id=clean_thread,
                                             client_message_id=cid, sender_kind="anonymous_web")
    assert a["is_new"] is True and b["is_new"] is False
```

> `anon_session`/`clean_thread`는 기존 `test_chat_flow_service.py`가 세션·스레드를 만드는 픽스처를 재사용한다(DB 접속 테스트셋업). 없으면 그 파일 상단 픽스처를 복사.

- [ ] **Step 2: 실패 테스트 작성(생성이 이벤트를 emit)** — `run_generation`이 bot_typing on→…→bot_done을 순서대로 발행하고, 봇 메시지를 DB에 저장하는지(broadcast를 mock으로 캡처).

```python
@pytest.mark.asyncio
async def test_run_generation_emits_typing_and_done(monkeypatch, anon_session, clean_thread, fake_embedder):
    events = []
    async def fake_broadcast(tid, event, payload): events.append((event, payload))
    monkeypatch.setattr(chat_flow_service.realtime_broadcast, "broadcast", fake_broadcast)

    # 사용자 메시지 선저장(prepare_turn) 후 생성.
    cid = uuid.uuid4(); gen = str(uuid.uuid4())
    await chat_flow_service.prepare_turn(anon_session, "진료시간 알려줘", thread_id=clean_thread,
                                         client_message_id=cid, sender_kind="anonymous_web")
    model = _StubIntentModel()  # 기존 테스트가 쓰는, 특정 route를 강제하는 주입 모델(intent/rag)
    await chat_flow_service.run_generation(anon_session, "진료시간 알려줘", thread_id=clean_thread,
                                           gen=gen, embedder=fake_embedder, model=model,
                                           sender_kind="anonymous_web")
    names = [e for e, _ in events]
    assert names[0] == "bot_typing" and events[0][1] == {"gen": gen, "on": True}
    assert names[-1] == "bot_done"
    assert events[-1][1]["gen"] == gen
    # 봇 메시지가 DB에 저장됐는지(기존 저장 로직 유지)
```

- [ ] **Step 3: 구현 — 현행 `handle_message`를 세 조각으로 분리**

원칙: 현행 82~295행의 **앞부분(사용자 저장·open_ticket·활동갱신)** → `prepare_turn`, **뒷부분(히스토리·orchestrate·봇 저장·반환)** → `run_generation`. 뒷부분의 **모든 기존 분기(agent/dept 카드·빈답 503·handoff·no_answer·rag)를 그대로 보존**하되, 반환 dict를 만들던 자리에서 **대신 `bot_done`을 emit**하고, 빈답 503 자리는 **`bot_done(outage=True)` + 저장 안 함**으로 바꾼다.

```python
# chat_flow_service.py 상단 import 추가
import asyncio
from app.services.chat import realtime_broadcast

# ── prepare_turn: 요청 스코프(빠름) ──
async def prepare_turn(session, content, *, thread_id, client_message_id, sender_kind):
    sid = session.id if hasattr(session, "id") else session["id"]
    sender_col, sender_src = _SENDER_ID_COL[sender_kind]
    _insert_patient_msg = (  # (현행 89~93행 그대로)
        f"insert into chat_messages (thread_id, ai_chat_session_id, sender_type, {sender_col}, "
        f"message_type, content, client_message_id) "
        f"select $1,$2,'patient', {sender_src}, 'text', $3, $4 from chat_threads t where t.id=$1 "
        "on conflict (client_message_id) where client_message_id is not null do nothing returning id")
    pool = await get_pool()
    async with pool.acquire() as conn:
        open_ticket = await conn.fetchval(
            "select 1 from support_tickets where thread_id=$1 and status in ('pending','in_progress') limit 1",
            thread_id)
        if open_ticket:
            inserted = await conn.fetchrow(_insert_patient_msg, thread_id, sid, content, client_message_id)
            return {"accepted": True, "route_taken": "staff", "user_message_id": inserted["id"] if inserted else None,
                    "is_new": bool(inserted)}
        async with conn.transaction():
            inserted = await conn.fetchrow(_insert_patient_msg, thread_id, sid, content, client_message_id)
            await conn.execute("select record_ai_activity($1)", sid)
        current_id = inserted["id"] if inserted else await conn.fetchval(
            "select id from chat_messages where thread_id=$1 and client_message_id=$2", thread_id, client_message_id)
    return {"accepted": True, "route_taken": None, "user_message_id": current_id, "is_new": bool(inserted)}


# ── run_generation: 요청과 분리된 백그라운드 ──
async def run_generation(session, content, *, thread_id, gen, embedder, model, sender_kind):
    sid = session.id if hasattr(session, "id") else session["id"]
    await realtime_broadcast.broadcast(thread_id, "bot_typing", {"gen": gen, "on": True})
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            hist = await conn.fetch(
                "select id, sender_type, content from chat_messages where thread_id=$1 and content is not null "
                "order by created_at desc, id desc limit $2", thread_id, orchestrator.CHAT_CONTEXT_TURN_WINDOW + 1)
        current_id = await _current_message_id(thread_id)  # 최근 patient 메시지 id(build_history 제외용)
        history_texts = build_history(hist, current_id)

        seq = {"n": 0}
        def on_delta(text):
            seq["n"] += 1
            # 발행은 fire-and-forget(생성 루프를 막지 않게). best-effort.
            asyncio.create_task(
                realtime_broadcast.broadcast(thread_id, "bot_delta", {"gen": gen, "seq": seq["n"], "text": text}))

        async def rag_fn(s, m, retrieval_query=_LEGACY_REWRITE):
            if retrieval_query is _LEGACY_REWRITE:
                retrieval_query = None
                if conversation_understanding.has_followup_signal(m, history_texts):
                    standalone = await conversation_understanding.rewrite_standalone(m, history_texts, model=model)
                    retrieval_query = conversation_understanding.build_search_query(m, standalone)
            return await rag_service.rag_answer(m, embedder=embedder, model=model,
                                                retrieval_query=retrieval_query, on_delta=on_delta)
        # agent_fn·intent_fn·dept_guide_fn 은 현행 handle_message 안의 정의를 그대로 옮긴다(변경 없음).
        ...
        out = await orchestrator.orchestrate(session, content, history_texts=history_texts,
                                             rag_fn=rag_fn, agent_fn=agent_fn, intent_fn=intent_fn,
                                             dept_guide_fn=dept_guide_fn, model=model)
        # (active_flow 지속·하이브리드① 카드 등 현행 196~206행 그대로)
        result = await _persist_and_result(conn_pool=pool, session=session, thread_id=thread_id, sid=sid,
                                            out=out, content=content, hist=hist, current_id=current_id,
                                            sender_kind=sender_kind, embedder=embedder, model=model)
        # result = 현행 반환 dict({route_taken, message_id?, card?, ...}) — 저장까지 끝낸 값
        await realtime_broadcast.broadcast(thread_id, "bot_done", {
            "gen": gen, "messageId": str(result.get("message_id")) if result.get("message_id") else None,
            "routeTaken": result["route_taken"], "card": result.get("card"), "outage": False})
    except _EmptyAiResponse:  # 현행 231~236행의 503 자리 → 저장 안 함 + outage 이벤트
        await realtime_broadcast.broadcast(thread_id, "bot_done",
                                           {"gen": gen, "messageId": None, "routeTaken": "outage", "card": None, "outage": True})
    finally:
        await realtime_broadcast.broadcast(thread_id, "bot_typing", {"gen": gen, "on": False})
```

> **`_persist_and_result`**: 현행 `handle_message`의 207~295행(봇 저장 분기 전체 — agent/dept 카드·handoff·no_answer·rag·sources 기록)을 **그대로** 이 헬퍼로 옮긴다. 단 231~236행의 `raise AppError(503)`은 내부 예외 `raise _EmptyAiResponse()`로 바꿔 위 except가 잡게 한다(HTTP 503은 더 이상 없음 — ack는 이미 200). 반환 dict에 `card`가 있으면 bot_done에 실린다. 로직·SQL은 변경 없음.

> **`_current_message_id`**: prepare_turn이 넣은 최근 patient 메시지 id를 되읽는 얇은 헬퍼(현행은 같은 트랜잭션 내 inserted였음 — 분리됐으니 thread의 최신 patient content 메시지로 조회). build_history의 현재-제외 용도라 근사로 충분.

- [ ] **Step 4: 테스트 통과 + 전체 무회귀**

Run: `cd backend && pytest tests/test_chat_flow_stream.py tests/test_chat_flow_service.py tests/test_orchestrator.py -v`
Expected: PASS. 기존 `test_chat_flow_service.py`가 `handle_message` 반환을 검사했다면, 그 호출을 `prepare_turn`+`run_generation`로 바꾸거나, 얇은 호환 `handle_message`(prepare_turn 후 run_generation을 await)를 남겨 무회귀시킨다(둘 중 택1을 이 스텝에서 명시적으로 처리).

- [ ] **Step 5: 커밋**

```bash
git add backend/app/services/chat/chat_flow_service.py backend/tests/test_chat_flow_stream.py
git commit -m "feat(상담봇 스트리밍): 생성을 요청과 분리(prepare_turn+run_generation) + bot 이벤트 emit"
```

---

### Task 4: `/chat/messages`가 ack 반환 + 생성 태스크 기동

**Files:**
- Modify: `backend/app/routers/chat.py:92-105`
- Test: `backend/tests/test_chat_router_ack.py`

**Interfaces:**
- Consumes: `prepare_turn`, `run_generation` (Task 3)
- Produces: `POST /chat/messages` → `{ "accepted": true, "threadId": ..., "userMessageId": ..., "gen": ... }` (~1초). 새 메시지일 때만 백그라운드 생성 기동.

- [ ] **Step 1: 실패 테스트 작성** — 응답이 ack 형태이고 gen을 포함, 중복 전송 시 생성 태스크가 1회만.

```python
# backend/tests/test_chat_router_ack.py
# TestClient로 /chat/sessions → /chat/messages 두 번(같은 clientMessageId) 호출,
# run_generation을 monkeypatch로 카운트해 1회만 불리는지 + 응답에 accepted/gen 포함 검증.
```

- [ ] **Step 2: 실패 확인** → Run: `cd backend && pytest tests/test_chat_router_ack.py -v` → FAIL

- [ ] **Step 3: 구현**

```python
# chat.py send_message 교체
import asyncio, uuid
_bg_tasks: set = set()  # create_task 참조 유지(GC 방지)

@router.post("/messages")
async def send_message(body: SendMessageRequest, request: Request,
                       model=Depends(get_model_dep), embedder=Depends(get_embedder_dep)):
    if request.headers.get("authorization", "").startswith("Bearer "):
        patient = await get_current_patient(request)
        session = await ai_session_service.load_owned_session(patient, body.ai_chat_session_id, body.thread_id)
        sender_kind = "patient"
    else:
        session = await webchat_service.load_anonymous_session(body.ai_chat_session_id, body.thread_id)
        sender_kind = "anonymous_web"
    prep = await chat_flow_service.prepare_turn(
        session, body.content, thread_id=body.thread_id,
        client_message_id=body.client_message_id, sender_kind=sender_kind)
    gen = str(uuid.uuid4())
    # 인계 모드(staff)나 중복(is_new=False)이면 생성하지 않는다.
    if prep["route_taken"] is None and prep["is_new"]:
        t = asyncio.create_task(chat_flow_service.run_generation(
            session, body.content, thread_id=body.thread_id, gen=gen,
            embedder=embedder, model=model, sender_kind=sender_kind))
        _bg_tasks.add(t); t.add_done_callback(_bg_tasks.discard)
    return {"accepted": True, "threadId": str(body.thread_id),
            "userMessageId": str(prep["user_message_id"]) if prep["user_message_id"] else None,
            "gen": gen, "routeTaken": prep["route_taken"]}
```

- [ ] **Step 4: 통과 확인** → Run: `cd backend && pytest tests/test_chat_router_ack.py -v` → PASS

- [ ] **Step 5: 커밋 + 백엔드 마일스톤 회귀**

```bash
cd backend && pytest -q   # 백엔드 전체 무회귀
git add backend/app/routers/chat.py backend/tests/test_chat_router_ack.py
git commit -m "feat(상담봇 스트리밍): /chat/messages ack 반환 + 생성 백그라운드 기동(멱등 게이트)"
```

> ⚠️ 백엔드 push=Railway 프로덕션 즉시 반영. webchat(Track ②)이 실시간 수신을 붙이기 전까지, ack 반환은 **현 webchat을 깨뜨린다**(동기 응답의 botMessage가 사라짐). 따라서 **Track ①은 브랜치에 두고, Track ②까지 끝난 뒤 함께 배포**한다(중간 배포 금지).

---

## Track ② — webchat 수신

### Task 5: 채널 훅이 봇 이벤트 수신

**Files:**
- Modify: `webchat/src/widget/useStaffPresence.ts`
- Test: `webchat/src/widget/useStaffPresence.bot.test.tsx`

**Interfaces:**
- Consumes: 채널 `chat-typing:<threadId>`(이미 소유)
- Produces: `useStaffPresence(threadId, handlers?)` — `handlers?: { onBotTyping?(on:boolean, gen:string): void; onBotDelta?(gen:string, seq:number, text:string): void; onBotDone?(p: BotDone): void }`. 같은 채널에 `.on('broadcast', {event:'bot_*'})` 3개를 추가(새 채널 금지).

- [ ] **Step 1: 실패 테스트 작성** — 채널로 bot_delta broadcast가 오면 onBotDelta가 불리는지(supabase.channel mock).

```tsx
// useStaffPresence.bot.test.tsx: supabase.channel을 mock해 .on 콜백을 캡처,
// bot_typing/bot_delta/bot_done 페이로드를 흘려 핸들러 호출을 검증.
```

- [ ] **Step 2: 실패 확인** → Run: `cd webchat && npx vitest run src/widget/useStaffPresence.bot.test.tsx` → FAIL

- [ ] **Step 3: 구현** — 기존 `useEffect` 안, `ch.on('broadcast', {event:'viewing'}, ...)` **바로 아래**에 3줄 추가(같은 `ch`).

```tsx
export type BotDone = { gen: string; messageId: string | null; routeTaken: string; card: unknown; outage: boolean };
export function useStaffPresence(threadId: string | undefined, handlers?: {
  onBotTyping?: (on: boolean, gen: string) => void;
  onBotDelta?: (gen: string, seq: number, text: string) => void;
  onBotDone?: (p: BotDone) => void;
}) {
  const hRef = useRef(handlers); hRef.current = handlers;  // 최신 핸들러 참조(재구독 방지)
  ...
  // viewing 리스너 아래에 추가:
  ch.on('broadcast', { event: 'bot_typing' }, (msg: { payload?: any }) => {
    const d = (msg.payload ?? msg); hRef.current?.onBotTyping?.(!!d.on, d.gen);
  });
  ch.on('broadcast', { event: 'bot_delta' }, (msg: { payload?: any }) => {
    const d = (msg.payload ?? msg); hRef.current?.onBotDelta?.(d.gen, d.seq, d.text ?? '');
  });
  ch.on('broadcast', { event: 'bot_done' }, (msg: { payload?: any }) => {
    const d = (msg.payload ?? msg); hRef.current?.onBotDone?.(d as BotDone);
  });
```

> 반환 객체·presence 로직은 그대로. `self:false`라 서버 발행은 클라가 정상 수신(발행자는 서버, 구독자는 클라).

- [ ] **Step 4: 통과 확인** → Run: `cd webchat && npx vitest run src/widget/useStaffPresence.bot.test.tsx` → PASS

- [ ] **Step 5: 커밋**

```bash
git add webchat/src/widget/useStaffPresence.ts webchat/src/widget/useStaffPresence.bot.test.tsx
git commit -m "feat(상담봇 스트리밍): webchat 채널 훅이 bot_typing/bot_delta/bot_done 수신"
```

---

### Task 6: `useWebchat`가 실시간 봇 스트림을 메시지에 반영

**Files:**
- Modify: `webchat/src/state/useWebchat.ts`, `webchat/src/api/webchatApi.ts:94-104`
- Test: `webchat/src/state/useWebchat.stream.test.ts`

**Interfaces:**
- Consumes: 채널 훅의 봇 이벤트(Task 5)
- Produces: `useWebchat` 반환에 `applyBotTyping(on)`, `applyBotDelta(gen, seq, text)`, `applyBotDone(p)` 추가. `sendMessage`는 이제 ack만 받으므로 `dispatchSend`는 낙관적 사용자 말풍선만 올리고 봇 답은 실시간이 채운다.

- [ ] **Step 1: 실패 테스트 작성** — applyBotDelta 두 번 → 스트리밍 봇 말풍선에 누적, applyBotDone → 최종화(+card). outage=true면 outage 상태 on.

```ts
// useWebchat.stream.test.ts: renderHook(useWebchat, mockApi)로 send 후
// applyBotDelta(gen,1,'안녕')·applyBotDelta(gen,2,'하세요')·applyBotDone({..card})를 불러
// messages에 '안녕하세요' 봇 버블 + 카드가 생기는지, 다른 gen 조각은 무시되는지 검증.
```

- [ ] **Step 2: 실패 확인** → Run: `cd webchat && npx vitest run src/state/useWebchat.stream.test.ts` → FAIL

- [ ] **Step 3: 구현**
  - `webchatApi.sendMessage`: 반환 타입을 `{ accepted: boolean; gen: string; routeTaken: string | null; userMessageId: string | null }`로. `reply/card` 매핑 제거(봇은 실시간).
  - `useWebchat.dispatchSend`: 성공 왕복에서 `markSent`로 봇/카드 붙이던 부분 삭제 → 사용자 말풍선만 `sent`. `out.gen`을 현재 진행 gen(`activeGen` ref)에 저장. `setBotTyping(true)` 유지(bot_typing 이벤트가 off로 내림).
  - 신규 상태: `streaming` = `{ gen, text }`(진행 중 봇 버블). `applyBotDelta(gen,seq,text)`: `gen`이 `activeGen`과 다르면 무시, 같으면 누적. `applyBotDone(p)`: 스트리밍 버블을 확정 봇 메시지로 커밋(messageId 사용), `p.card` 있으면 카드 메시지 추가, `p.outage`면 `setOutage('idle')`+스트리밍 버블 폐기, `p.routeTaken`으로 urgent/handoff/guide 전이(현행 53~58행 로직을 여기로 이동). `applyBotTyping(on)`: `setBotTyping(on)`.
  - **폴백**: bot_done을 일정 시간(예: 45초) 못 받으면 `fetchMessages(threadId)`로 재조회해 봇 답을 복구(실시간 유실 대비). 타이머는 dispatchSend에서 걸고 applyBotDone에서 해제.

```ts
// 핵심 스케치(누적·gen 가드·최종화). 전체는 위 인터페이스대로 구현.
const activeGen = useRef<string | null>(null);
const [streaming, setStreaming] = useState<{ gen: string; text: string } | null>(null);

const applyBotDelta = useCallback((gen: string, _seq: number, text: string) => {
  if (activeGen.current !== gen) return;               // 남의 답 조각 폐기
  setStreaming((s) => ({ gen, text: (s?.gen === gen ? s.text : '') + text }));
}, []);

const applyBotDone = useCallback((p: BotDone) => {
  if (activeGen.current !== p.gen) return;
  setStreaming(null); setBotTyping(false); activeGen.current = null;
  if (p.outage) { setOutage('idle'); return; }         // 봇 말풍선 없음(빈 답)
  setMessages((m) => {
    const bot = p.messageId
      ? { id: p.messageId, senderType: 'bot' as const, messageType: 'text' as const, content: /*누적본*/ '' }
      : undefined;
    // 누적본은 streaming.text를 클로저로 참조하기 어려우니, 최종 content는 done 직전 streaming.text를 별도 ref로 보관해 사용.
    return [...m, ...(bot ? [bot] : []), ...(p.card ? [{ id: `card-${p.gen}`, senderType: 'bot' as const, messageType: 'card' as const, payload: p.card }] : [])];
  });
  setUrgent(p.routeTaken === 'emergency');
  if (p.routeTaken === 'handoff') onHandoffRequested?.(/*threadId*/);
});
```

> 구현 노트: 최종 봇 content는 `streaming.text`를 `latestText` ref에 함께 저장해 `applyBotDone`에서 사용(상태 클로저 지연 회피). 진행 중 봇 버블 렌더는 Task 7에서 `streaming`을 messages 뒤에 합성.

- [ ] **Step 4: 통과 확인 + 무회귀** → Run: `cd webchat && npx vitest run src/state src/widget` → PASS

- [ ] **Step 5: 커밋**

```bash
git add webchat/src/state/useWebchat.ts webchat/src/api/webchatApi.ts webchat/src/state/useWebchat.stream.test.ts
git commit -m "feat(상담봇 스트리밍): useWebchat 실시간 봇 스트림 반영 + 45초 재조회 폴백"
```

---

### Task 7: 배선 + 스트리밍 버블 렌더

**Files:**
- Modify: `webchat/src/widget/WebchatWidget.tsx:35-69`, `webchat/src/widget/ChatRoom.tsx:60-80`
- Test: `webchat/src/widget/WebchatWidget.stream.test.tsx`

**Interfaces:**
- Consumes: Task 5(핸들러 있는 채널 훅), Task 6(apply* + streaming)

- [ ] **Step 1: 실패 테스트(통합)** — send 후 채널 mock으로 bot_delta/bot_done을 흘리면 화면에 흐르는 봇 텍스트 → 최종 봇 버블이 뜨는지(RTL).

- [ ] **Step 2: 실패 확인** → FAIL

- [ ] **Step 3: 구현**
  - `WebchatWidget`: `useStaffPresence(w.session?.threadId, { onBotTyping: w.applyBotTyping, onBotDelta: w.applyBotDelta, onBotDone: w.applyBotDone })`.
  - `ChatRoom`: 진행 중 스트리밍 버블 렌더 — `messages` 뒤에 `streaming?.text`가 있으면 `senderType:'bot'` 임시 버블로 표시(botTyping 점은 delta가 시작되면 텍스트로 대체). `streaming` prop을 ChatRoom에 추가하거나 WebchatWidget에서 `messages`에 합성해 넘긴다(후자가 ChatRoom 변경 최소).

```tsx
// WebchatWidget: streaming을 messages 뒤에 합성(ChatRoom 무변경 최소화)
const streamBubble = w.streaming
  ? [{ id: `stream-${w.streaming.gen}`, senderType: 'bot' as const, messageType: 'text' as const, content: w.streaming.text }]
  : [];
<ChatRoom messages={[...w.messages, ...streamBubble, ...extraCards]}
          botTyping={w.botTyping && !w.streaming}   // 델타 시작 전만 점 표시
          onTyping={notifyTyping} ... />
```

- [ ] **Step 4: 통과 + 무회귀** → Run: `cd webchat && npx vitest run` → PASS

- [ ] **Step 5: 커밋**

```bash
git add webchat/src/widget/WebchatWidget.tsx webchat/src/widget/ChatRoom.tsx webchat/src/widget/WebchatWidget.stream.test.tsx
git commit -m "feat(상담봇 스트리밍): webchat 배선 + 진행 중 스트리밍 버블 렌더"
```

---

## 마무리(수동, 계획 밖 검증)

- **실도달 e2e(실기기/실브라우저)**: 배포(백엔드 Railway + webchat Vercel 함께)한 뒤 실제 webchat에서 질문 → 첫 글자 1~2초, 요청을 중간에 끊어도(모바일 시늉) 답이 실시간으로 도착하는지 눈으로 확인(단위론 realtime 못 잡음 — 기존 typing 교훈).
- **screen-behaviors 규칙 추가**: `CHAT-STREAM-01`(봇 답 실시간 스트리밍), `CHAT-STREAM-OUTAGE-01`(bot_done outage), `CHAT-STREAM-FALLBACK-01`(45초 재조회). 근거는 스펙 역참조.
- **다음 계획**: 환자앱 수신(Track ③) — 같은 프로토콜을 `chat_repository`(streamStaffLive/streamThread)에 `bot_typing/bot_delta` 핸들만 추가.

## Self-Review 메모(작성자 점검 결과)

- **Spec 커버리지**: §3.1 흐름=Task 3·4, §3.2 프로토콜=본 계획 프로토콜 표(+ outage 이벤트를 §4 오류처리의 실시간판으로 구체화), §3.3 백엔드=Task 1~4, §3.4 webchat=Task 5~7, §4 폴백=Task 6(45초 재조회)·멱등=Task 3·4·안전무변경=Global Constraints, §5 테스트=각 Task, §6 단계·§7 YAGNI 반영.
- **스펙 대비 추가**: 빈 답 503→ `bot_done(outage=true)` 실시간 이벤트(HTTP 5xx가 사라졌으므로 필수). 스펙 §4의 "실시간 놓침 복구"와 모순 없음(전달 방식 구체화).
- **타입 일관성**: `gen`(str), `bot_done` payload 키(gen/messageId/routeTaken/card/outage)를 백엔드 emit(Task 3)·webchat 수신(Task 5 `BotDone`)·소비(Task 6)에서 동일하게 사용.
- **열린 항목(구현 중 확정)**: `_persist_and_result`가 현행 반환에 `card`를 싣는 분기는 agent/dept/no_answer뿐 — rag 경로는 card 없음(현행 294행). bot_done card=null 정상.
