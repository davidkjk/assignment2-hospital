"""[보안 F-03] 알림 상태 콜백 서명 검증 — 무서명 위조 콜백 차단.

정본: docs/security-audit-2026-09-04/ F-03(Medium, confirmed).
서명 없는 /messages/status-callback로 위조 콜백을 보내 특정 환자를 sms_dead로 만들거나
재시도를 유발할 수 있었다. 공유 시크릿 헤더(X-Solapi-Secret) 상수시간 비교로 막는다.
시크릿 미설정 시 fail-closed(콜백 무시). ID oracle 제거(응답 균일).
"""
import pytest
from app.core.config import settings
from app.services import message_service
from tests.conftest import seed_patient


async def _log(conn, *, status="발송중", pmid="sid-r"):
    p = await seed_patient(conn)
    return await conn.fetchval(
        "insert into notification_log (patient_id, notification_type, channel, "
        "delivery_status, provider_message_id, body) "
        "values ($1,'staff_direct','sms',$2,$3,'x') returning id",
        p["patient_id"], status, pmid)

_BODY = {"provider_message_id": "sid-x", "status": "failed", "failure_code": "invalid_number"}


@pytest.fixture
def spy_handler(monkeypatch):
    calls = []

    async def _spy(**kw):
        calls.append(kw)
        return {"status": "ok"}

    monkeypatch.setattr(message_service, "handle_status_callback", _spy)
    return calls


def test_callback_ignored_when_no_secret_configured(client, monkeypatch, spy_handler):
    # fail-closed: 웹훅 시크릿이 설정 안 됐으면 어떤 콜백도 처리하지 않는다.
    monkeypatch.setattr(settings, "solapi_webhook_secret", "")
    res = client.post("/messages/status-callback", json=_BODY,
                      headers={"X-Solapi-Secret": "anything"})
    assert res.status_code == 200
    assert spy_handler == []  # 서비스 미호출 = 상태 변화 없음


def test_callback_ignored_without_secret_header(client, monkeypatch, spy_handler):
    monkeypatch.setattr(settings, "solapi_webhook_secret", "whsec_test")
    res = client.post("/messages/status-callback", json=_BODY)
    assert res.status_code == 200
    assert spy_handler == []


def test_callback_ignored_with_wrong_secret(client, monkeypatch, spy_handler):
    monkeypatch.setattr(settings, "solapi_webhook_secret", "whsec_test")
    res = client.post("/messages/status-callback", json=_BODY,
                      headers={"X-Solapi-Secret": "whsec_wrong"})
    assert res.status_code == 200
    assert spy_handler == []


def test_callback_processed_with_valid_secret(client, monkeypatch, spy_handler):
    monkeypatch.setattr(settings, "solapi_webhook_secret", "whsec_test")
    res = client.post("/messages/status-callback", json=_BODY,
                      headers={"X-Solapi-Secret": "whsec_test"})
    assert res.status_code == 200
    assert len(spy_handler) == 1
    assert spy_handler[0]["provider_message_id"] == "sid-x"
    assert spy_handler[0]["status"] == "failed"


# ── 서비스 단: 종결상태 allowlist + replay 멱등 ────────────────────────────────
@pytest.mark.asyncio
async def test_unknown_status_is_rejected(db_conn):
    # 종결상태 allowlist: 모르는 status는 실패 처리로 흘리지 않는다('발송중' 유지).
    nid = await _log(db_conn, status="발송중", pmid="sid-unknown")
    await message_service.handle_status_callback(
        provider_message_id="sid-unknown", status="정체불명", failure_code=None, conn=db_conn)
    assert await db_conn.fetchval(
        "select delivery_status from notification_log where id=$1", nid) == "발송중"


@pytest.mark.asyncio
async def test_replay_on_terminal_notification_is_ignored(db_conn):
    # replay 멱등: 이미 '도달'(종결)인 줄에 다시 온 실패 콜백은 상태를 뒤집지 않는다.
    nid = await _log(db_conn, status="도달", pmid="sid-terminal")
    await message_service.handle_status_callback(
        provider_message_id="sid-terminal", status="failed", failure_code="invalid_number", conn=db_conn)
    assert await db_conn.fetchval(
        "select delivery_status from notification_log where id=$1", nid) == "도달"
