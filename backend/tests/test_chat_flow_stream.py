import uuid

import pytest

from app.services.chat import chat_flow_service
from tests.conftest import seed_patient
from tests.conftest_chat import seed_chat_thread, FakeEmbedder


class _RagModel:
    async def ainvoke(self, _):
        class R:
            content = "rag"
        return R()


async def _seed_session(conn):
    p = await seed_patient(conn)
    t = await seed_chat_thread(conn, patient_id=p["patient_id"])
    s = await conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)
    return p, t, s


async def _cleanup(conn, p, t, s):
    await conn.execute("delete from chat_messages where thread_id=$1", t)
    await conn.execute("delete from support_tickets where thread_id=$1", t)
    await conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await conn.execute("delete from chat_threads where id=$1", t)
    await conn.execute("delete from patients where id=$1", p["patient_id"])


@pytest.mark.asyncio
async def test_prepare_turn_idempotent(committed_conn):
    p, t, s = await _seed_session(committed_conn)
    cid = uuid.uuid4()
    a = await chat_flow_service.prepare_turn(
        s, "안녕", thread_id=t, client_message_id=cid, sender_kind="patient")
    b = await chat_flow_service.prepare_turn(
        s, "안녕", thread_id=t, client_message_id=cid, sender_kind="patient")
    assert a["is_new"] is True and b["is_new"] is False
    assert a["route_taken"] is None
    # 같은 client_message_id로 두 번 저장해도 환자 메시지는 1건뿐(멱등).
    assert await committed_conn.fetchval(
        "select count(*) from chat_messages where thread_id=$1 and sender_type='patient'", t) == 1
    await _cleanup(committed_conn, p, t, s)


@pytest.mark.asyncio
async def test_run_generation_emits_typing_and_done(committed_conn, monkeypatch):
    from app.services.chat import orchestrator
    async def rag_orchestrate(*a, **k):
        return {"route_taken": "rag", "reply": "안녕하세요", "sources": []}
    monkeypatch.setattr(orchestrator, "orchestrate", rag_orchestrate)

    events = []
    async def fake_broadcast(tid, event, payload):
        events.append((event, payload))
    monkeypatch.setattr(chat_flow_service.realtime_broadcast, "broadcast", fake_broadcast)

    p, t, s = await _seed_session(committed_conn)
    cid = uuid.uuid4()
    gen = str(uuid.uuid4())
    await chat_flow_service.prepare_turn(
        s, "진료시간 알려줘", thread_id=t, client_message_id=cid, sender_kind="patient")
    await chat_flow_service.run_generation(
        s, "진료시간 알려줘", thread_id=t, gen=gen,
        embedder=FakeEmbedder(), model=_RagModel(), sender_kind="patient")

    names = [e for e, _ in events]
    assert names[0] == "bot_typing" and events[0][1] == {"gen": gen, "on": True}
    assert "bot_done" in names
    done = next(pl for e, pl in events if e == "bot_done")
    assert done["gen"] == gen and done["outage"] is False
    # 봇 메시지가 DB에 저장됐는지(기존 저장 로직 유지)
    assert await committed_conn.fetchval(
        "select count(*) from chat_messages where thread_id=$1 and sender_type='bot'", t) >= 1
    await _cleanup(committed_conn, p, t, s)
