"""[SEND-RESULT-02][보안 F-03] SOLAPI 실제 웹훅 형식으로 상태 콜백 수신.

SOLAPI 웹훅은 커스텀 시크릿 헤더가 아니라 **등록 URL에 심은 토큰**(`?token=`)으로 인증한다.
⭐ 본문 형식은 SOLAPI 콘솔 실측상 **{"data": [ {messageId, statusCode, …} ]}** 래퍼다
(맨 배열·단일 객체도 방어적으로 받는다). 전달 결과는 `statusCode`로 오며 `"4000"`이
수신완료(도달), 그 외 종결 코드는 실패다.

⚠️ 정확한 성공/실패 코드 표는 실발송 1건으로 최종 확정 대상 — 여기서는 성공코드 `4000`만
도달로, 나머지는 실패로 보수적으로 매핑한다(원 statusCode를 failure_code로 보존).
"""
import pytest

from app.core.config import settings
from app.routers.messages import _extract_reports
from app.services import message_service


# ── 순수: 본문에서 리포트 목록 추출(래퍼/배열/단일/미상) ─────────────────────
def test_extract_reports_from_solapi_data_envelope():
    payload = {"data": [{"messageId": "M-1", "statusCode": "4000"},
                        {"messageId": "M-2", "statusCode": "3040"}]}
    assert [r["messageId"] for r in _extract_reports(payload)] == ["M-1", "M-2"]


def test_extract_reports_from_bare_array():
    assert _extract_reports([{"messageId": "M-3", "statusCode": "4000"}])[0]["messageId"] == "M-3"


def test_extract_reports_from_single_object():
    assert _extract_reports({"messageId": "M-4", "statusCode": "4000"})[0]["messageId"] == "M-4"


def test_extract_reports_unknown_shape_is_empty():
    assert _extract_reports({"foo": 1}) == []
    assert _extract_reports("nonsense") == []
    assert _extract_reports(None) == []


@pytest.fixture
def spy_handler(monkeypatch):
    calls = []

    async def _spy(**kw):
        calls.append(kw)
        return {"status": "ok"}

    monkeypatch.setattr(message_service, "handle_status_callback", _spy)
    return calls


def _report(message_id="M-1", status_code="4000"):
    return {"messageId": message_id, "statusCode": status_code, "statusMessage": "x"}


# ── 인증: URL 토큰(?token=) ────────────────────────────────────────────────
def test_callback_ignored_when_no_secret_configured(client, monkeypatch, spy_handler):
    monkeypatch.setattr(settings, "solapi_webhook_secret", "")
    res = client.post("/messages/status-callback?token=anything", json=[_report()])
    assert res.status_code == 200
    assert spy_handler == []  # fail-closed: 시크릿 미설정이면 처리 안 함


def test_callback_ignored_without_token(client, monkeypatch, spy_handler):
    monkeypatch.setattr(settings, "solapi_webhook_secret", "whsec_test")
    res = client.post("/messages/status-callback", json=[_report()])
    assert res.status_code == 200
    assert spy_handler == []


def test_callback_ignored_with_wrong_token(client, monkeypatch, spy_handler):
    monkeypatch.setattr(settings, "solapi_webhook_secret", "whsec_test")
    res = client.post("/messages/status-callback?token=whsec_wrong", json=[_report()])
    assert res.status_code == 200
    assert spy_handler == []


# ── 형식: 리포트 배열 + statusCode 매핑 ─────────────────────────────────────
def test_report_4000_is_delivered(client, monkeypatch, spy_handler):
    monkeypatch.setattr(settings, "solapi_webhook_secret", "whsec_test")
    res = client.post("/messages/status-callback?token=whsec_test",
                      json=[_report(message_id="M-abc", status_code="4000")])
    assert res.status_code == 200
    assert len(spy_handler) == 1
    assert spy_handler[0]["provider_message_id"] == "M-abc"
    assert spy_handler[0]["status"] == "delivered"


def test_report_non_4000_is_failed_with_code(client, monkeypatch, spy_handler):
    monkeypatch.setattr(settings, "solapi_webhook_secret", "whsec_test")
    res = client.post("/messages/status-callback?token=whsec_test",
                      json=[_report(message_id="M-fail", status_code="3040")])
    assert res.status_code == 200
    assert len(spy_handler) == 1
    assert spy_handler[0]["provider_message_id"] == "M-fail"
    assert spy_handler[0]["status"] == "failed"
    assert spy_handler[0]["failure_code"] == "3040"


def test_multiple_reports_each_processed(client, monkeypatch, spy_handler):
    monkeypatch.setattr(settings, "solapi_webhook_secret", "whsec_test")
    res = client.post("/messages/status-callback?token=whsec_test",
                      json=[_report(message_id="M-1", status_code="4000"),
                            _report(message_id="M-2", status_code="3040")])
    assert res.status_code == 200
    assert [c["provider_message_id"] for c in spy_handler] == ["M-1", "M-2"]
    assert [c["status"] for c in spy_handler] == ["delivered", "failed"]


def test_solapi_data_envelope_is_processed(client, monkeypatch, spy_handler):
    # ⭐ SOLAPI 실측 형식: 본문이 {"data": [ ... ]} 래퍼. 이걸 처리 못 하던 게 '발송중' 멈춤 원인.
    monkeypatch.setattr(settings, "solapi_webhook_secret", "whsec_test")
    res = client.post("/messages/status-callback?token=whsec_test",
                      json={"data": [_report(message_id="M-env", status_code="4000")]})
    assert res.status_code == 200
    assert len(spy_handler) == 1
    assert spy_handler[0]["provider_message_id"] == "M-env"
    assert spy_handler[0]["status"] == "delivered"
