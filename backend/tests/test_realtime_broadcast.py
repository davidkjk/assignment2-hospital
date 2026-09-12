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

        def raise_for_status(self):
            pass

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None, headers=None):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
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
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "AsyncClient", BoomClient)
    # raise되면 테스트 실패 — best-effort라 조용히 넘어가야 한다.
    await realtime_broadcast.broadcast(uuid.uuid4(), "bot_done", {"gen": "g1"})
