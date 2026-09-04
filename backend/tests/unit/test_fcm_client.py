"""[배포·B안] FCM 푸시 제공자 — HTTP v1 실 발송 클라이언트.

OAuth 액세스토큰은 주입 가능(token_provider) — 테스트는 가짜 토큰, 네트워크는 MockTransport.
성공→메시지 이름 반환 / 죽은 토큰(UNREGISTERED)→PushUnregistered(디스패처가 그 토큰을 지움).
"""
import json

import httpx
import pytest

from app.integrations.fcm_client import FcmClient
from app.services.dispatch_service import PushUnregistered


def _client(handler, project_id="proj-1"):
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return FcmClient(project_id=project_id, token_provider=lambda: "ACCESS", http_client=http)


def test_send_posts_to_fcm_v1_and_returns_message_name():
    """[FCM-SEND] v1 messages:send에 Bearer+토큰·본문을 싣고 message name을 돌려준다."""
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization", "")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"name": "projects/proj-1/messages/0:123"})

    name = _client(handler).send("device-tok", "예약이 확정됐습니다")

    assert seen["url"] == "https://fcm.googleapis.com/v1/projects/proj-1/messages:send"
    assert seen["auth"] == "Bearer ACCESS"
    assert seen["body"]["message"]["token"] == "device-tok"
    assert seen["body"]["message"]["notification"]["body"] == "예약이 확정됐습니다"
    assert name == "projects/proj-1/messages/0:123"


def test_send_raises_push_unregistered_on_dead_token():
    """[FCM-DEAD] UNREGISTERED 응답이면 PushUnregistered — 디스패처가 그 토큰을 지운다."""
    def handler(request):
        return httpx.Response(404, json={"error": {"status": "UNREGISTERED"}})
    with pytest.raises(PushUnregistered):
        _client(handler).send("dead-tok", "본문")


def test_get_fcm_client_none_when_unconfigured(monkeypatch):
    """[FCM-CFG] 서비스계정·프로젝트가 비면 팩토리는 None(개발 폴백)."""
    from app.core.config import settings
    from app.integrations import fcm_client as fc
    monkeypatch.setattr(settings, "fcm_credentials_json", "")
    monkeypatch.setattr(settings, "fcm_project_id", "")
    fc.reset_client_cache()
    assert fc.get_fcm_client() is None
