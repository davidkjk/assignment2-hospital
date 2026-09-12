"""[배포·B안] 디스패처 제공자 경계 실배선 — 키 있으면 실발송, 없으면 개발 폴백.

DB 불필요(제공자 경계 함수만). 실 제공자는 팩토리(get_solapi_client)로 주입한다.
"""
from app.services import dispatch_service as ds
from app.services.dispatch_service import SmsOutcome
from app.integrations import solapi_client as sc


def test_provider_sms_dev_fallback_when_unconfigured(monkeypatch):
    """[SMS-FALLBACK] 키 미설정이면 실발송 없이 queued(dev-fallback)로 흐름을 잇는다."""
    monkeypatch.setattr(sc, "get_solapi_client", lambda: None)
    outcome = ds._provider_sms("01012345678", "본문")
    assert outcome == SmsOutcome(status="queued", provider_message_id="dev-fallback")


def test_provider_sms_delegates_to_solapi_when_configured(monkeypatch):
    """[SMS-REAL] 키가 있으면 Solapi 클라이언트로 실제 발송을 위임한다."""
    sent = {}

    class _Fake:
        def send(self, to, text):
            sent["args"] = (to, text)
            return SmsOutcome(status="queued", provider_message_id="MSG-9")

    monkeypatch.setattr(sc, "get_solapi_client", lambda: _Fake())
    outcome = ds._provider_sms("01012345678", "본문")
    assert sent["args"] == ("01012345678", "본문")
    assert outcome == SmsOutcome(status="queued", provider_message_id="MSG-9")


def test_provider_push_dev_fallback_when_unconfigured(monkeypatch):
    """[PUSH-FALLBACK] FCM 미설정이면 개발 폴백 id로 흐름을 잇는다."""
    from app.integrations import fcm_client as fc
    monkeypatch.setattr(fc, "get_fcm_client", lambda: None)
    assert ds._provider_push("tok", "본문") == "dev-fallback-push"


def test_provider_push_delegates_to_fcm_when_configured(monkeypatch):
    """[PUSH-REAL] FCM 설정 시 실제 발송으로 위임하고 메시지 이름을 돌려준다."""
    from app.integrations import fcm_client as fc
    sent = {}

    class _Fake:
        def send(self, token, body):
            sent["args"] = (token, body)
            return "projects/p/messages/1"

    monkeypatch.setattr(fc, "get_fcm_client", lambda: _Fake())
    assert ds._provider_push("tok", "본문") == "projects/p/messages/1"
    assert sent["args"] == ("tok", "본문")
