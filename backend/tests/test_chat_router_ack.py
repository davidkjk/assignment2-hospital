"""POST /chat/messages 는 이제 ack만 반환하고(~1초) 생성은 백그라운드로 기동한다(스트리밍).

- 응답에 accepted/gen 이 담긴다.
- 같은 clientMessageId로 두 번 보내도 생성 태스크는 1회만(멱등 게이트 — 연타로 답 2번 방지).
"""
import uuid

import pytest

from app.main import app
from app.routers import chat as chat_routes
from app.services.chat import chat_flow_service
from tests.conftest_chat import FakeEmbedder


class _FakeModel:
    async def ainvoke(self, _):
        class R:
            content = "rag"
        return R()


@pytest.fixture
def _fake_llm():
    app.dependency_overrides[chat_routes.get_model_dep] = lambda: _FakeModel()
    app.dependency_overrides[chat_routes.get_embedder_dep] = lambda: FakeEmbedder()
    yield
    app.dependency_overrides.clear()


def test_messages_returns_ack_and_generates_once(client, _fake_llm, monkeypatch):
    calls = {"n": 0}

    async def _noop():
        return None

    def fake_run_generation(*a, **k):
        calls["n"] += 1          # 생성 기동 횟수를 호출 시점(동기)에 센다
        return _noop()

    monkeypatch.setattr(chat_flow_service, "run_generation", fake_run_generation)

    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        cid = str(uuid.uuid4())
        r1 = c.post("/chat/messages", json={
            "threadId": sess["threadId"], "aiSessionId": sess["aiSessionId"],
            "content": "진료시간 알려줘", "clientMessageId": cid})
        r2 = c.post("/chat/messages", json={
            "threadId": sess["threadId"], "aiSessionId": sess["aiSessionId"],
            "content": "진료시간 알려줘", "clientMessageId": cid})   # 같은 cid(연타)

    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    assert b1["accepted"] is True
    assert b1["gen"]                       # 생성 식별 uuid
    assert b1["threadId"] == sess["threadId"]
    assert b1["routeTaken"] is None        # 정상 생성 경로(인계 아님)
    assert r2.status_code == 200, r2.text
    assert calls["n"] == 1                  # 멱등: 두 번 보내도 생성은 1회
