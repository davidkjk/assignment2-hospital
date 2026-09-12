"""[보안 F-03] 알림 상태 콜백 — 서비스 계층 종결상태 allowlist + replay 멱등.

정본: docs/security-audit-2026-09-04/ F-03(Medium, confirmed).
⚠️ 라우터 인증·형식 테스트는 SOLAPI 실제 웹훅(리포트 배열 + URL 토큰)으로 이관됐다
→ tests/test_solapi_status_callback.py. (옛 헤더 시크릿 + 단일객체 계약은 Twilio 형태
자리표시자였고, SOLAPI가 커스텀 시크릿 헤더를 보내지 않아 폐기.) 이 파일은 SOLAPI와
무관한 서비스 단 불변식(모르는 status 무시·종결줄 replay 무시)만 남긴다.
"""
import pytest

from app.services import message_service
from tests.conftest import seed_patient


async def _log(conn, *, status="발송중", pmid="sid-r"):
    p = await seed_patient(conn)
    return await conn.fetchval(
        "insert into notification_log (patient_id, notification_type, channel, "
        "delivery_status, provider_message_id, body) "
        "values ($1,'staff_direct','sms',$2,$3,'x') returning id",
        p["patient_id"], status, pmid)


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
