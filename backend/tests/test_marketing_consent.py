"""[보안 F-04] 광고 발송이 수신 동의를 지킨다 — SEND-ADS-01 미구현 스텁 구현.

정본: docs/security-audit-2026-09-04/ F-04(Medium, confirmed) + 규칙 SEND-ADS-01.
광고(kind=marketing)는 ① 수신자 해석 시점에 ads_consent=true만 남기고 ② 발송 시점에도
현재 동의를 재확인한다(그새 철회했으면 조용히 누락하지 않고 '제외'로 기록). 거래성 알림은
동의와 무관하게 발송된다.
"""
import pytest

from app.services import message_service
from app.services import dispatch_service as ds
from app.services.dispatch_service import SmsOutcome


async def _patient(conn, *, ads: bool, phone="01011112222"):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone, ads_consent, sms_dead) "
        "values ('김환자','1990-05-14','F',$1,$2,false) returning id", phone, ads)


async def _log(conn, pid, *, kind, requested="sms", channel="sms"):
    return await conn.fetchval(
        "insert into notification_log "
        "(patient_id, notification_type, kind, channel, requested_channel, delivery_status, body) "
        "values ($1,'staff_direct',$2,$3,$4,'발송중','행사 안내') returning id",
        pid, kind, channel, requested)


def _sms_ok(phone, body):
    return SmsOutcome(status="queued", provider_message_id="sms-sid")


# ── ① 수신자 해석 시점 필터 ───────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_resolve_recipients_excludes_non_consenters_for_marketing(db_conn):
    yes = await _patient(db_conn, ads=True, phone="01010001000")
    no = await _patient(db_conn, ads=False, phone="01020002000")
    ids, excluded = await message_service.resolve_recipients(
        {"patient_ids": [str(yes), str(no)]}, "marketing", db_conn)
    assert ids == [yes]
    assert excluded == 1


@pytest.mark.asyncio
async def test_resolve_recipients_keeps_all_for_transactional(db_conn):
    yes = await _patient(db_conn, ads=True, phone="01010001000")
    no = await _patient(db_conn, ads=False, phone="01020002000")
    ids, excluded = await message_service.resolve_recipients(
        {"patient_ids": [str(yes), str(no)]}, "notice", db_conn)
    assert set(ids) == {yes, no}
    assert excluded == 0


# ── ② 발송 시점 재확인(스케줄 후 철회 대비) ───────────────────────────────────
@pytest.mark.asyncio
async def test_dispatch_excludes_marketing_when_consent_withdrawn(db_conn):
    # 예약 순간엔 동의했으나 발송 시점엔 철회한 환자 — 조용히 누락하지 않고 '제외'로 기록, 발송 안 함.
    pid = await _patient(db_conn, ads=False)
    nid = await _log(db_conn, pid, kind="marketing")
    sent = []
    await ds.send_now([nid], db_conn, sms_send=lambda p, b: sent.append(p) or _sms_ok(p, b))
    assert sent == []  # 실제 발송 안 됨
    assert await db_conn.fetchval(
        "select delivery_status from notification_log where id=$1", nid) == "제외"


@pytest.mark.asyncio
async def test_dispatch_sends_transactional_regardless_of_consent(db_conn):
    # 거래성(비광고) 알림은 동의와 무관하게 발송된다.
    pid = await _patient(db_conn, ads=False)
    await db_conn.execute("update hospital_settings set sms_enabled=true")
    nid = await _log(db_conn, pid, kind="transactional")
    sent = []
    await ds.send_now([nid], db_conn, sms_send=lambda p, b: (sent.append(p), _sms_ok(p, b))[1])
    assert sent != []  # 발송됨
    assert await db_conn.fetchval(
        "select delivery_status from notification_log where id=$1", nid) != "제외"
