"""Resend 이메일 제공자 — 실 발송 클라이언트(직원 초대·재초대·비번재설정 메일).

실제 네트워크는 httpx MockTransport로 대체(실 클라이언트 코드를 그대로 태운다 — 계약만 고정).
발송은 best-effort라 실패는 예외가 아니라 False로 온다.
"""
import json

import httpx

from app.integrations.resend_client import ResendClient


def _client(handler, sender="가온병원 <hospital@withlog.app>"):
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return ResendClient(api_key="K", sender=sender, http_client=http)


def test_send_posts_to_emails_with_bearer_and_returns_true():
    """[RESEND-SEND] 접수(2xx)면 True + from/to/subject/html/text를 그대로 싣는다."""
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization", "")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"id": "email-123"})

    ok = _client(handler).send(
        to="a@b.com", subject="제목", html="<p>본문</p>", text="본문")

    assert ok is True
    assert seen["method"] == "POST"
    assert seen["url"] == "https://api.resend.com/emails"
    assert seen["auth"] == "Bearer K"
    assert seen["body"] == {
        "from": "가온병원 <hospital@withlog.app>",
        "to": ["a@b.com"],
        "subject": "제목",
        "html": "<p>본문</p>",
        "text": "본문",
    }


def test_send_returns_false_on_non_2xx():
    """[RESEND-SEND] 도메인 미인증·잘못된 발신주소 등 4xx는 예외 없이 False(하이브리드 폴백)."""
    def handler(request):
        return httpx.Response(403, json={"message": "domain not verified"})
    assert _client(handler).send(to="a@b.com", subject="s", html="h", text="t") is False


def test_send_returns_false_on_transport_error():
    """[RESEND-SEND] 네트워크 오류도 삼켜 False — 초대 흐름을 깨지 않는다."""
    def handler(request):
        raise httpx.ConnectTimeout("boom")
    assert _client(handler).send(to="a@b.com", subject="s", html="h", text="t") is False


def test_get_resend_client_none_when_unconfigured(monkeypatch):
    """[RESEND-CFG] 키가 비면 팩토리는 None(개발 폴백 — 발송 안 함)."""
    from app.core.config import settings
    from app.integrations import resend_client as rc
    monkeypatch.setattr(settings, "resend_api_key", "")
    rc.reset_client_cache()
    assert rc.get_resend_client() is None


def test_get_resend_client_built_from_settings(monkeypatch):
    """[RESEND-CFG] 키가 있으면 그 값으로 클라이언트를 만든다."""
    from app.core.config import settings
    from app.integrations import resend_client as rc
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(settings, "mail_from", "가온병원 <hospital@withlog.app>")
    rc.reset_client_cache()
    client = rc.get_resend_client()
    assert isinstance(client, rc.ResendClient)
    assert client._sender == "가온병원 <hospital@withlog.app>"
