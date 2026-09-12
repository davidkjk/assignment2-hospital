def test_get_chat_model_uses_settings(monkeypatch):
    from app.core.config import settings
    from app.integrations.langchain_client import get_chat_model

    monkeypatch.setattr(settings, "chat_model", "claude-sonnet-5")
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    model = get_chat_model()
    assert model.model == "claude-sonnet-5"  # 기본 대화 모델은 Sonnet 5


def test_get_chat_model_accepts_override():
    from app.integrations.langchain_client import get_chat_model

    model = get_chat_model(model="claude-opus-5")
    assert model.model == "claude-opus-5"
