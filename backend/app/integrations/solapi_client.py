"""Solapi 문자 제공자 — 실 발송 클라이언트(배포 env 키로 활성).

인증은 HMAC-SHA256: 서명 = HMAC(api_secret, date+salt)의 hex. 서명 조립을 순수 함수로 떼어
테스트로 못박는다(실발송 성패가 이 서명 정확도에 달려 있다).
"""
import hashlib
import hmac
import secrets
from datetime import datetime, timezone

import httpx

from app.services.dispatch_service import SmsOutcome

_SEND_PATH = "/messages/v4/send"


def build_auth_header(*, api_key: str, api_secret: str, date: str, salt: str) -> str:
    """Solapi Authorization 헤더 문자열을 만든다(HMAC-SHA256 서명 포함)."""
    signature = hmac.new(
        api_secret.encode(), (date + salt).encode(), hashlib.sha256).hexdigest()
    return (
        f"HMAC-SHA256 apiKey={api_key}, date={date}, "
        f"salt={salt}, signature={signature}"
    )


class SolapiClient:
    """Solapi 문자 한 통 발송. 실제 네트워크(httpx)는 주입 가능(테스트는 MockTransport)."""

    def __init__(self, *, api_key: str, api_secret: str, sender: str,
                 http_client: httpx.Client | None = None,
                 base_url: str = "https://api.solapi.com") -> None:
        self._api_key = api_key
        self._api_secret = api_secret
        self._sender = sender
        self._base_url = base_url
        self._http = http_client or httpx.Client(timeout=10.0)

    def send(self, to: str, text: str) -> SmsOutcome:
        date = datetime.now(timezone.utc).isoformat()
        salt = secrets.token_hex(16)
        auth = build_auth_header(
            api_key=self._api_key, api_secret=self._api_secret, date=date, salt=salt)
        try:
            resp = self._http.post(
                self._base_url + _SEND_PATH,
                headers={"Authorization": auth, "Content-Type": "application/json"},
                json={"message": {"to": to, "from": self._sender, "text": text}},
            )
        except httpx.TransportError:
            # 네트워크 오류(타임아웃·연결 실패)는 일시 실패 — 디스패처가 재시도한다(SEND-RETRY-01).
            return SmsOutcome(status="failed", failure_code="timeout")
        data = resp.json()
        status_code = str(data.get("statusCode", ""))
        if status_code.startswith("2"):
            return SmsOutcome(status="queued", provider_message_id=data.get("messageId"))
        # 접수 단계 거절은 재시도해도 같으므로 재시도 어휘 밖의 코드로 둔다(SEND-RETRY-02).
        return SmsOutcome(status="failed", failure_code="provider_rejected")


# ── 설정 기반 팩토리(배포 env로 활성) ─────────────────────────────────────────
_cache: SolapiClient | None = None
_cache_built = False


def reset_client_cache() -> None:
    """설정을 바꿔 다시 만들게 한다(테스트·재구성용)."""
    global _cache, _cache_built
    _cache, _cache_built = None, False


def get_solapi_client() -> SolapiClient | None:
    """세 설정(key·secret·발신번호)이 다 차 있으면 클라이언트를, 아니면 None을 돌려준다."""
    global _cache, _cache_built
    if not _cache_built:
        from app.core.config import settings
        if settings.solapi_api_key and settings.solapi_api_secret and settings.sms_sender_number:
            _cache = SolapiClient(
                api_key=settings.solapi_api_key,
                api_secret=settings.solapi_api_secret,
                sender=settings.sms_sender_number)
        _cache_built = True
    return _cache
