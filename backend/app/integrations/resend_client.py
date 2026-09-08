"""Resend 이메일 제공자 — 실 발송 클라이언트(배포 env 키로 활성).

직원 초대·재초대·비밀번호 재설정 메일을 백엔드가 직접 보낸다(Supabase 내장 발송 대신).
왜 직접 보내나: ⑴ 메일 문구를 코드에서 한국어로 완전히 제어 ⑵ 메일에 담기는 링크와 화면에
노출하는 링크가 **똑같은 하나**라 하이브리드(메일 실패·스팸 대비 링크 보관)가 깔끔하다.

발송은 **best-effort**다 — 실패해도 예외를 던지지 않고 False를 돌려준다. 초대·재초대는 링크를
화면에도 노출하므로(하이브리드) 메일이 실패해도 관리자가 링크로 전달할 수 있다(막다른 길 아님).
"""
import logging

import httpx

logger = logging.getLogger(__name__)

_SEND_PATH = "/emails"


class ResendClient:
    """Resend로 메일 한 통 발송. 실제 네트워크(httpx)는 주입 가능(테스트는 MockTransport)."""

    def __init__(self, *, api_key: str, sender: str,
                 http_client: httpx.Client | None = None,
                 base_url: str = "https://api.resend.com") -> None:
        self._api_key = api_key
        self._sender = sender
        self._base_url = base_url
        self._http = http_client or httpx.Client(timeout=10.0)

    def send(self, *, to: str, subject: str, html: str, text: str) -> bool:
        """메일 한 통을 보낸다. 접수 성공(2xx)이면 True, 그 외/오류면 False(예외 삼킴)."""
        try:
            resp = self._http.post(
                self._base_url + _SEND_PATH,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": self._sender,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text,
                },
            )
        except httpx.TransportError:
            logger.warning("resend: 네트워크 오류로 메일 발송 실패 to=%s", to, exc_info=True)
            return False
        if 200 <= resp.status_code < 300:
            return True
        # 도메인 미인증·잘못된 발신주소 등은 4xx로 온다 — 삼키되 원인을 로그로 남긴다.
        logger.warning(
            "resend: 메일 발송 거절 status=%s to=%s body=%s",
            resp.status_code, to, resp.text[:500],
        )
        return False


# ── 설정 기반 팩토리(배포 env로 활성) ─────────────────────────────────────────
_cache: ResendClient | None = None
_cache_built = False


def reset_client_cache() -> None:
    """설정을 바꿔 다시 만들게 한다(테스트·재구성용)."""
    global _cache, _cache_built
    _cache, _cache_built = None, False


def get_resend_client() -> ResendClient | None:
    """API 키가 있으면 클라이언트를, 없으면 None(개발 폴백 — 발송 안 함)을 돌려준다."""
    global _cache, _cache_built
    if not _cache_built:
        from app.core.config import settings
        if settings.resend_api_key and settings.mail_from:
            _cache = ResendClient(
                api_key=settings.resend_api_key,
                sender=settings.mail_from,
            )
        _cache_built = True
    return _cache
