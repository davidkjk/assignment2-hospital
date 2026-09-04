"""FCM 푸시 제공자 — HTTP v1 실 발송(배포 env: 서비스계정 JSON + 프로젝트 ID로 활성).

인증은 서비스계정으로 OAuth2 액세스토큰을 받아 Bearer로 싣는다. 토큰 발급은 주입 가능한
경계(token_provider)로 둔다 — 테스트는 가짜 토큰을 주입하고, 실제 발급은 배포에서 검증한다.
"""
import json
import time
from typing import Callable

import httpx

from app.services.dispatch_service import PushUnregistered

_OAUTH_URL = "https://oauth2.googleapis.com/token"
_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
# 죽은 토큰으로 보는 오류 status — 그 device_tokens 줄을 지운다(SEND-RESULT-03b).
_DEAD_STATUSES = {"UNREGISTERED", "NOT_FOUND"}


class FcmClient:
    """푸시 한 통 발송. 성공→메시지 이름 / 죽은 토큰→PushUnregistered / 그 외 실패→None(문자 폴백)."""

    def __init__(self, *, project_id: str, token_provider: Callable[[], str],
                 http_client: httpx.Client | None = None,
                 base_url: str = "https://fcm.googleapis.com") -> None:
        self._project_id = project_id
        self._token_provider = token_provider
        self._base_url = base_url
        self._http = http_client or httpx.Client(timeout=10.0)

    def send(self, token: str, body: str) -> str | None:
        url = f"{self._base_url}/v1/projects/{self._project_id}/messages:send"
        try:
            resp = self._http.post(
                url,
                headers={"Authorization": f"Bearer {self._token_provider()}"},
                json={"message": {"token": token, "notification": {"body": body}}},
            )
        except httpx.TransportError:
            return None  # 일시 오류 — 문자로 폴백(토큰은 살려 둔다)
        if resp.status_code == 200:
            return resp.json().get("name")
        status = (resp.json().get("error", {}) or {}).get("status", "")
        if resp.status_code == 404 or status in _DEAD_STATUSES:
            raise PushUnregistered(token)
        return None  # 그 외 오류 — 문자 폴백


# ── 설정 기반 팩토리 + 기본 토큰 발급 ─────────────────────────────────────────
_cache: FcmClient | None = None
_cache_built = False


def reset_client_cache() -> None:
    global _cache, _cache_built
    _cache, _cache_built = None, False


def _make_token_provider(sa: dict) -> Callable[[], str]:
    """서비스계정으로 OAuth2 액세스토큰을 받아온다(만료 전까지 캐시)."""
    state: dict = {"token": None, "exp": 0}

    def provider() -> str:
        now = int(time.time())
        if state["token"] and now < state["exp"] - 60:
            return state["token"]
        from jose import jwt  # 이미 선언된 python-jose[cryptography] — RS256 서명
        assertion = jwt.encode(
            {"iss": sa["client_email"], "scope": _SCOPE, "aud": _OAUTH_URL,
             "iat": now, "exp": now + 3600},
            sa["private_key"], algorithm="RS256")
        resp = httpx.post(_OAUTH_URL, timeout=10.0, data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion})
        data = resp.json()
        state["token"] = data["access_token"]
        state["exp"] = now + int(data.get("expires_in", 3600))
        return state["token"]

    return provider


def get_fcm_client() -> FcmClient | None:
    """서비스계정 JSON과 프로젝트 ID가 다 있으면 클라이언트를, 아니면 None."""
    global _cache, _cache_built
    if not _cache_built:
        from app.core.config import settings
        raw, project = settings.fcm_credentials_json, settings.fcm_project_id
        if raw and project:
            sa = json.loads(raw)
            _cache = FcmClient(project_id=project, token_provider=_make_token_provider(sa))
        _cache_built = True
    return _cache
