import pytest

from app.services.chat import chat_flow_service


@pytest.mark.asyncio
async def test_rag_fn_uses_agentic_when_flag_on(monkeypatch):
    monkeypatch.setattr(chat_flow_service.settings, "chat_agentic_rag", True)
    called = {}

    async def fake_agentic(message, **kw):
        called["agentic"] = True
        called["judge_model"] = kw.get("judge_model")
        return {"reply": "agentic"}

    async def fake_legacy(*a, **kw):
        called["legacy"] = True
        return {"reply": "legacy"}

    monkeypatch.setattr(chat_flow_service.agentic_rag_service, "agentic_rag_answer", fake_agentic)
    monkeypatch.setattr(chat_flow_service.rag_service, "rag_answer", fake_legacy)

    rag_fn = chat_flow_service._build_rag_fn(
        embedder=object(), model=object(), classify_model=object(), history_texts=[], on_delta=None)
    out = await rag_fn(None, "주차 되나요", retrieval_query="주차")
    assert out == {"reply": "agentic"}
    assert called.get("agentic") and not called.get("legacy")
    assert called["judge_model"] is not None


@pytest.mark.asyncio
async def test_rag_fn_uses_legacy_when_flag_off(monkeypatch):
    monkeypatch.setattr(chat_flow_service.settings, "chat_agentic_rag", False)

    async def fake_legacy(message, **kw):
        return {"reply": "legacy"}

    monkeypatch.setattr(chat_flow_service.rag_service, "rag_answer", fake_legacy)
    rag_fn = chat_flow_service._build_rag_fn(
        embedder=object(), model=object(), classify_model=object(), history_texts=[], on_delta=None)
    out = await rag_fn(None, "주차 되나요", retrieval_query="주차")
    assert out == {"reply": "legacy"}
