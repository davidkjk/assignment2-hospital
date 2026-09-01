"""웹 위젯(익명) 백엔드 엔드포인트 — ⑦ 배선.

webchat(`webchat/src/api/webchatApi.ts`)이 소비하는 익명 웹 채널의 서버 본문.
Task 9 Produces가 서명만 선언하고 비워 둔 표면(`/chat/sessions`·`/chat/threads/{id}/messages`·
`/chat/read`·`/chat/threads/{id}/handoff`·`/chat/messages`(익명)·카드 4종)을 채운다.

보안 모델(프론트 계약과 일치):
 - `/chat/sessions`: X-Anon-Token 선택(있으면 복원·없으면 새 토큰 발급).
 - 읽기/전송/인계상태/읽음: thread UUID가 능력토큰(추측 불가), 토큰 불요.
 - 카드 4종(revalidate/execute/handoff/attribute): X-Anon-Token 필수.
"""
import asyncio
import json
import uuid

import asyncpg
import pytest
import pytest_asyncio

from app.core.config import settings
from app.main import app
from app.routers import chat as chat_routes
from tests.conftest import seed_staff
from tests.conftest_chat import FakeEmbedder


class _FakeModel:
    """오프라인 테스트용 가짜 LLM — 라우터가 rag로 분류하게 한다(빈 KB → no_answer → 인계)."""
    def __init__(self, label="rag"):
        self._label = label

    async def ainvoke(self, _):
        class R:
            content = self._label
        return R()


def _run(coro):
    return asyncio.run(coro)


async def _connect():
    return await asyncpg.connect(settings.database_url)

# 순환 FK(ai_chat_sessions↔chat_messages↔support_tickets)라 replica 역할로 FK 트리거를 끄고 지운다.
_CHAT_WIPE = [
    "chat_message_sources", "chat_notification_batches", "chat_read_states",
    "answer_feedback", "qa_example_bank", "chat_quality_reviews", "unresolved_questions",
    "chat_messages", "support_tickets", "ai_chat_sessions",
    "anonymous_chat_contacts", "chat_threads", "anonymous_chat_sessions",
]


@pytest_asyncio.fixture(autouse=True)
async def _wipe_chat():
    yield
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute("set session_replication_role='replica'")
        for table in _CHAT_WIPE:
            await conn.execute(f"delete from {table}")
        await conn.execute("set session_replication_role='origin'")
    finally:
        await conn.close()


# ── POST /chat/sessions ──────────────────────────────────────────────────────

def test_start_session_without_token_issues_token_and_creates_thread(client):
    # [WEBCHAT-SESSION] 토큰 없이 시작하면 서버가 익명 토큰을 발급하고 상담방·AI세션을 만든다.
    resp = client.post("/chat/sessions", json={"channel": "web"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["anonToken"]            # 새 토큰 발급(클라가 저장)
    assert body["threadId"]
    assert body["aiSessionId"]
    assert body["messages"] == []       # 새 세션은 빈 이력


def test_start_session_with_existing_token_restores_same_thread(client):
    # [WEBCHAT-SESSION] 같은 토큰으로 다시 시작하면 같은 상담방을 복원한다(새로 만들지 않음).
    # with client: 한 번 들어가면 요청들이 포털 루프 하나를 공유한다(앱 전역 풀 루프 충돌 방지).
    with client as c:
        first = c.post("/chat/sessions", json={"channel": "web"}).json()
        again = c.post("/chat/sessions", json={"channel": "web"},
                       headers={"X-Anon-Token": first["anonToken"]}).json()
    assert again["threadId"] == first["threadId"]
    assert again["anonToken"] == first["anonToken"]


# ── GET /chat/threads/{id}/messages ──────────────────────────────────────────

def test_fetch_thread_messages_returns_camel_shape_with_decoded_payload(client):
    # [WEBCHAT-HISTORY] thread UUID로 이력을 조회한다. payload(jsonb)는 객체로 디코드돼 나온다.
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        thread_id = sess["threadId"]
        # 봇 카드 메시지 한 건을 직접 심는다(전송 파이프라인은 Unit B).
        _insert_bot_card(thread_id, sess["aiSessionId"])
        resp = c.get(f"/chat/threads/{thread_id}/messages")
    assert resp.status_code == 200, resp.text
    msgs = resp.json()["messages"]
    assert len(msgs) == 1
    m = msgs[0]
    assert m["senderType"] == "bot"
    assert m["messageType"] == "card"
    assert m["content"] is None
    assert m["payload"] == {"card_type": "booking_confirm"}   # 문자열 아니라 객체


def _insert_bot_card(thread_id: str, ai_session_id: str):
    import asyncio
    from uuid import UUID

    async def go():
        conn = await asyncpg.connect(settings.database_url)
        try:
            await conn.execute(
                "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, "
                "message_type, content, payload) values ($1,$2,'bot','card',null,$3::jsonb)",
                UUID(thread_id), UUID(ai_session_id), '{"card_type":"booking_confirm"}')
        finally:
            await conn.close()

    asyncio.run(go())


# ── POST /chat/messages (익명) ────────────────────────────────────────────────

@pytest.fixture
def _fake_llm():
    # 라우터가 실 LLM 대신 가짜를 쓰도록 의존성 오버라이드(get_chat_model()은 생성만 하고
    # ainvoke 때 네트워크를 타므로 오프라인에선 반드시 주입해야 한다).
    app.dependency_overrides[chat_routes.get_model_dep] = lambda: _FakeModel()
    app.dependency_overrides[chat_routes.get_embedder_dep] = lambda: FakeEmbedder()
    yield
    app.dependency_overrides.clear()


def test_anonymous_message_stored_as_user_sender_and_handoff_on_empty_kb(client, _fake_llm):
    # [WEBCHAT-SEND] 익명 위젯이 인증 없이 camelCase 본문으로 메시지를 보낸다.
    # 빈 KB라 봇이 못 답해(no_answer) 인계로 전환된다. 저장된 발신 메시지의 senderType은
    # 'patient'(DB sender_type='patient' + sender_anonymous_session_id) — 프론트도 자기 말풍선은 'patient'.
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        r = c.post("/chat/messages", json={
            "threadId": sess["threadId"], "aiSessionId": sess["aiSessionId"],
            "content": "우리 동네 약국 어디", "clientMessageId": str(uuid.uuid4())})
        assert r.status_code == 200, r.text
        assert r.json()["route_taken"] == "handoff"
        msgs = c.get(f"/chat/threads/{sess['threadId']}/messages").json()["messages"]
    mine = [m for m in msgs if m["content"] == "우리 동네 약국 어디"]
    assert len(mine) == 1
    assert mine[0]["senderType"] == "patient"


# ── POST /chat/read ──────────────────────────────────────────────────────────

def test_read_acknowledges_open_anonymous_batch(client):
    # [WEBCHAT-READ] 사용자가 상담방을 확인하면 열린 알림 배치가 닫힌다(acknowledged_at 채워짐).
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        batch_id = _seed_open_anon_batch(sess["threadId"], sess["aiSessionId"])
        resp = c.post("/chat/read", json={"threadId": sess["threadId"]})
        assert resp.status_code == 200, resp.text
    acked = _run(_batch_acknowledged(batch_id))
    assert acked is not None


# ── GET /chat/threads/{id}/handoff ───────────────────────────────────────────

def test_handoff_status_pending_maps_to_connecting(client):
    # [WEBCHAT-HANDOFF] 티켓 pending → phase 'connecting'. isOpen(운영시간)은 불리언으로 온다.
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        _seed_ticket(sess["threadId"], sess["aiSessionId"])
        st = c.get(f"/chat/threads/{sess['threadId']}/handoff").json()
    assert st["phase"] == "connecting"
    assert isinstance(st["isOpen"], bool)


def test_handoff_status_in_progress_includes_assignee(client):
    # [WEBCHAT-HANDOFF] 티켓 in_progress + 담당자 → phase 'inProgress' + 담당자 이름.
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        _seed_ticket_in_progress(sess["threadId"], sess["aiSessionId"])
        st = c.get(f"/chat/threads/{sess['threadId']}/handoff").json()
    assert st["phase"] == "inProgress"
    assert st["assigneeName"] == "Test Staff"


# ── POST /chat/handoff (익명 인계 — X-Anon-Token 필수) ────────────────────────

def test_handoff_requires_anon_token(client):
    # [WEBCHAT-HANDOFF] 인계는 민감 동작 — X-Anon-Token 없으면 401.
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        r = c.post("/chat/handoff", json={"threadId": sess["threadId"], "name": "홍길동"})
    assert r.status_code == 401


def test_handoff_attaches_to_existing_open_ticket_and_stores_name(client):
    # [WEBANON-HANDOFF] 익명 no_answer가 이미 만든 열린 티켓에 붙는다(새로 만들지 않음).
    # 이름·요약은 상담방 시스템 메시지로 남아 직원이 답변 대상을 식별한다.
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        existing = _seed_ticket(sess["threadId"], sess["aiSessionId"])
        r = c.post("/chat/handoff", headers={"X-Anon-Token": sess["anonToken"]},
                   json={"threadId": sess["threadId"], "name": "홍길동", "summary": ["증상 문의", "예약 원함"]})
        assert r.status_code == 200, r.text
        assert r.json()["ticketId"] == existing        # 붙였다(중복 생성 아님)
    n_open, name = _run(_open_ticket_count_and_handoff_name(sess["threadId"]))
    assert n_open == 1
    assert name == "홍길동"


def test_handoff_with_phone_records_verified_contact(client, monkeypatch):
    # [WEBANON-HANDOFF-03] 전화번호는 검증 연락처로 저장된다(평문 아님 — 암호화+해시).
    from cryptography.fernet import Fernet

    from app.core.config import settings as cfg
    from app.services.chat import anonymous_contact_codec as codec
    monkeypatch.setattr(cfg, "anon_contact_encryption_key", Fernet.generate_key().decode())
    codec._fernet = None
    try:
        with client as c:
            sess = c.post("/chat/sessions", json={"channel": "web"}).json()
            r = c.post("/chat/handoff", headers={"X-Anon-Token": sess["anonToken"]},
                       json={"threadId": sess["threadId"], "name": "홍길동",
                             "phone": "010-1234-5678", "summary": []})
            assert r.status_code == 200, r.text
        assert _run(_contact_count_for_thread(sess["threadId"])) == 1
    finally:
        codec._fernet = None    # 다른 테스트로 키 누수 방지


# ── 원시 DB 헬퍼(테스트 전용) ────────────────────────────────────────────────

async def _open_ticket_count_and_handoff_name(thread_id: str):
    conn = await _connect()
    try:
        tid = uuid.UUID(thread_id)
        n = await conn.fetchval(
            "select count(*) from support_tickets where thread_id=$1 and status in ('pending','in_progress')", tid)
        payload = await conn.fetchval(
            "select payload from chat_messages where thread_id=$1 and message_type='system' "
            "order by created_at desc limit 1", tid)
        name = json.loads(payload)["name"] if payload else None
        return n, name
    finally:
        await conn.close()


async def _contact_count_for_thread(thread_id: str):
    conn = await _connect()
    try:
        sid = await conn.fetchval(
            "select anonymous_session_id from chat_threads where id=$1", uuid.UUID(thread_id))
        return await conn.fetchval(
            "select count(*) from anonymous_chat_contacts where anonymous_session_id=$1", sid)
    finally:
        await conn.close()

async def _batch_acknowledged(batch_id):
    conn = await _connect()
    try:
        return await conn.fetchval(
            "select acknowledged_at from chat_notification_batches where id=$1", uuid.UUID(batch_id))
    finally:
        await conn.close()


def _seed_open_anon_batch(thread_id: str, ai_session_id: str) -> str:
    async def go():
        conn = await _connect()
        try:
            tid = uuid.UUID(thread_id)
            sess_id = await conn.fetchval(
                "select anonymous_session_id from chat_threads where id=$1", tid)
            contact = await conn.fetchrow(
                "select * from record_verified_anonymous_contact($1,$2,$3)", sess_id, "ciph", "hash")
            ticket = await conn.fetchrow(
                "select * from create_support_ticket($1,$2,null,null)", tid, uuid.UUID(ai_session_id))
            # first/last_message_id FK용 유효 메시지 한 건(bot text — sender/type shape 만족).
            msg_id = await conn.fetchval(
                "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content) "
                "values ($1,$2,'bot','text','x') returning id", tid, uuid.UUID(ai_session_id))
            return str(await conn.fetchval(
                "insert into chat_notification_batches (thread_id, ticket_id, recipient_type, "
                "recipient_anonymous_session_id, recipient_anonymous_contact_id, first_message_id, last_message_id) "
                "values ($1,$2,'anonymous_chat_contact',$3,$4,$5,$5) returning id",
                tid, ticket["id"], sess_id, contact["id"], msg_id))
        finally:
            await conn.close()

    return _run(go())


def _seed_ticket(thread_id: str, ai_session_id: str) -> str:
    async def go():
        conn = await _connect()
        try:
            row = await conn.fetchrow(
                "select * from create_support_ticket($1,$2,null,null)",
                uuid.UUID(thread_id), uuid.UUID(ai_session_id))
            return str(row["id"])
        finally:
            await conn.close()

    return _run(go())


def _seed_ticket_in_progress(thread_id: str, ai_session_id: str) -> str:
    async def go():
        conn = await _connect()
        try:
            staff = await seed_staff(conn, "receptionist")
            ticket = await conn.fetchrow(
                "select * from create_support_ticket($1,$2,null,null)",
                uuid.UUID(thread_id), uuid.UUID(ai_session_id))
            await conn.execute(
                "update support_tickets set status='in_progress', assigned_staff_id=$2, "
                "assigned_at=now(), started_at=now() where id=$1", ticket["id"], staff["staff_id"])
            return str(ticket["id"])
        finally:
            await conn.close()

    return _run(go())
