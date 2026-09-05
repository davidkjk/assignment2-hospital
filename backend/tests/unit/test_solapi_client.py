"""[배포·B안][SEND-RESULT] Solapi 문자 제공자 — 실 발송 클라이언트.

인증 서명(HMAC-SHA256)이 정확해야 실발송이 된다. 서명은 순수 함수로 분리해 여기서 못박고,
실제 네트워크는 httpx MockTransport로 대체(실 클라이언트 코드를 그대로 태운다 — 계약만 고정).
"""
import hashlib
import hmac
import json

import httpx

from app.integrations.solapi_client import SolapiClient, build_auth_header
from app.services.dispatch_service import SmsOutcome


def _client(handler, sender="029302266"):
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return SolapiClient(api_key="K", api_secret="S", sender=sender, http_client=http)


def test_auth_header_is_hmac_sha256_of_date_plus_salt():
    """[SOLAPI-AUTH] Authorization 헤더 = HMAC-SHA256(hex(date+salt), api_secret)."""
    header = build_auth_header(
        api_key="KEYID", api_secret="SECRET",
        date="2026-09-03T00:00:00Z", salt="abc123")
    expected_sig = hmac.new(
        b"SECRET", b"2026-09-03T00:00:00Zabc123", hashlib.sha256).hexdigest()
    assert header == (
        "HMAC-SHA256 apiKey=KEYID, date=2026-09-03T00:00:00Z, "
        f"salt=abc123, signature={expected_sig}"
    )


def test_send_posts_to_v4_send_and_returns_queued():
    """[SOLAPI-SEND] 접수(statusCode 2000)면 queued + provider_message_id=messageId."""
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization", "")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200, json={"messageId": "MSG-123", "statusCode": "2000",
                       "statusMessage": "정상 접수"})

    outcome = _client(handler).send("01012345678", "안녕하세요")

    assert seen["method"] == "POST"
    assert seen["url"] == "https://api.solapi.com/messages/v4/send"
    assert seen["auth"].startswith("HMAC-SHA256 apiKey=K,")
    assert seen["body"]["message"] == {
        "to": "01012345678", "from": "029302266", "text": "안녕하세요"}
    assert outcome == SmsOutcome(status="queued", provider_message_id="MSG-123")


def test_send_maps_non_2xxx_statuscode_to_failed():
    """[SOLAPI-SEND] 접수 거절(2xxx 아님)은 failed — 재시도 안 하는 코드로."""
    def handler(request):
        return httpx.Response(200, json={"statusCode": "4000", "statusMessage": "잘못된 요청"})
    outcome = _client(handler).send("01012345678", "본문")
    assert outcome.status == "failed"
    assert outcome.failure_code == "provider_rejected"


def test_send_maps_transport_error_to_retryable_timeout():
    """[SOLAPI-SEND] API 호출 자체가 네트워크 오류면 timeout(일시 실패)→재시도 대상."""
    def handler(request):
        raise httpx.ConnectTimeout("boom")
    outcome = _client(handler).send("01012345678", "본문")
    assert outcome == SmsOutcome(status="failed", failure_code="timeout")


def test_get_solapi_client_none_when_unconfigured(monkeypatch):
    """[SOLAPI-CFG] 키가 비면 팩토리는 None(개발 폴백으로 처리됨)."""
    from app.core.config import settings
    from app.integrations import solapi_client as sc
    monkeypatch.setattr(settings, "solapi_api_key", "")
    monkeypatch.setattr(settings, "solapi_api_secret", "")
    monkeypatch.setattr(settings, "sms_sender_number", "")
    sc.reset_client_cache()
    assert sc.get_solapi_client() is None


def test_get_solapi_client_built_from_settings(monkeypatch):
    """[SOLAPI-CFG] 세 값이 다 차면 그 값으로 클라이언트를 만든다."""
    from app.core.config import settings
    from app.integrations import solapi_client as sc
    monkeypatch.setattr(settings, "solapi_api_key", "K")
    monkeypatch.setattr(settings, "solapi_api_secret", "S")
    monkeypatch.setattr(settings, "sms_sender_number", "029302266")
    sc.reset_client_cache()
    client = sc.get_solapi_client()
    assert isinstance(client, sc.SolapiClient)
    assert client._sender == "029302266"
