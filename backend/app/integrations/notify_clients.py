"""외부 발송 제공자(문자·푸시)의 얇은 경계.

⚠️ 실제 제공자 호출(Twilio 문자 등)은 배포(env)에서 주입한다 — 이 모듈은 「무엇을 보낼지」의
   계약(SmsClient.send_sms)만 정하고, 기본 구현은 서버 로그에만 남기는 개발용 폴백이다.
   (직원웹 T30이 실 발송 디스패처를 붙일 때 이 get_sms_client가 실 제공자를 돌려주게 갈아끼운다.
    dispatch_service의 `_provider_sms` 주입 경계와 같은 뜻 — 그쪽은 결과 상태기계, 여기는
    가족 연결 OTP처럼 "보내기만 하면 되는" 단발 문자용.)

가족 연결 OTP(환자앱 T26)는 이 send_sms를 소비한다. 배관까지만 — 실 문자는 배포에서 나간다.
"""
import logging

logger = logging.getLogger("sms")


class SmsClient:
    """문자 한 통을 보낸다. 실 제공자는 이 인터페이스를 구현해 주입한다."""

    def send_sms(self, phone: str, body: str) -> None:  # pragma: no cover - 하위 클래스가 구현
        raise NotImplementedError


class _LoggingSmsClient(SmsClient):
    """개발용 폴백 — 실제로 문자를 보내지 않고 서버 로그에만 남긴다.

    실 제공자가 붙기 전(로컬·데모)에도 흐름이 500으로 끊기지 않게 한다. 로컬에서 OTP 코드를
    눈으로 확인하려면 서버 로그를 본다(Supabase inbucket이 메일을 보여주는 것과 같은 개발 편의).
    """

    def send_sms(self, phone: str, body: str) -> None:
        logger.info("[SMS 미연결·개발폴백] to=%s body=%s", phone, body)


class _SolapiSmsClient(SmsClient):
    """단발 문자(OTP 등)를 Solapi 실 클라이언트로 보낸다(SmsOutcome는 로그로만 반영)."""

    def __init__(self, client) -> None:
        self._client = client

    def send_sms(self, phone: str, body: str) -> None:
        outcome = self._client.send(phone, body)
        if outcome.status == "failed":
            logger.warning("[SMS 실패] to=%s code=%s", phone, outcome.failure_code)


_logging_client = _LoggingSmsClient()
_cache: SmsClient | None = None
_cache_built = False


def reset_sms_client_cache() -> None:
    """설정을 바꿔 다시 고르게 한다(테스트·재구성용)."""
    global _cache, _cache_built
    _cache, _cache_built = None, False


def get_sms_client() -> SmsClient:
    """키가 설정돼 있으면 Solapi 실 클라이언트, 아니면 개발 폴백(로그만)."""
    global _cache, _cache_built
    if not _cache_built:
        from app.integrations.solapi_client import get_solapi_client
        client = get_solapi_client()
        _cache = _SolapiSmsClient(client) if client is not None else _logging_client
        _cache_built = True
    return _cache
