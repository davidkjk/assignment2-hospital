"""[배포·B안] OTP 단발 문자 경로(notify_clients)도 Solapi로 실배선.

가족연결·전화변경 OTP가 get_sms_client().send_sms를 쓴다. 키 없으면 로그 폴백 그대로.
"""
from app.integrations import notify_clients as nc
from app.integrations import solapi_client as sc
from app.integrations.notify_clients import _LoggingSmsClient
from app.services.dispatch_service import SmsOutcome


def test_get_sms_client_is_logging_when_unconfigured(monkeypatch):
    """[OTP-SMS] 키 미설정이면 개발 폴백(_LoggingSmsClient)."""
    monkeypatch.setattr(sc, "get_solapi_client", lambda: None)
    nc.reset_sms_client_cache()
    assert isinstance(nc.get_sms_client(), _LoggingSmsClient)


def test_get_sms_client_delegates_to_solapi_when_configured(monkeypatch):
    """[OTP-SMS] 키가 있으면 send_sms가 Solapi 실발송으로 위임된다."""
    sent = {}

    class _Fake:
        def send(self, to, text):
            sent["args"] = (to, text)
            return SmsOutcome(status="queued", provider_message_id="MSG-1")

    monkeypatch.setattr(sc, "get_solapi_client", lambda: _Fake())
    nc.reset_sms_client_cache()
    nc.get_sms_client().send_sms("01012345678", "인증번호 123456")
    assert sent["args"] == ("01012345678", "인증번호 123456")
