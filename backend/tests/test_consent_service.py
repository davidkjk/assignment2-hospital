from datetime import datetime
import pytest
from app.services import consent_service

pytestmark = pytest.mark.asyncio

TV = '2026-08-01'  # terms_version


async def _seed_patient(conn):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('김순자','1954-03-02','F','01011112222') returning id")


async def test_record_consents_writes_four_rows(db_conn):
    # CONSENT-LOG-01 — 프로필 생성 시 4줄(필수 3 true + 광고 선택) 기록
    pid = await _seed_patient(db_conn)
    await consent_service.record_consents(db_conn, pid, ads_agreed=False, terms_version=TV)
    rows = await db_conn.fetch(
        "select item, agreed from patient_consents where patient_id=$1", pid)
    items = {r['item']: r['agreed'] for r in rows}
    assert items == {'terms': True, 'privacy': True, 'sensitive': True, 'ads': False}


async def test_record_consents_sets_current_ads_flag(db_conn):
    # CONSENT-LOG-01 — 현재 상태 칸도 함께 맞춘다
    pid = await _seed_patient(db_conn)
    await consent_service.record_consents(db_conn, pid, ads_agreed=True, terms_version=TV)
    assert await db_conn.fetchval("select ads_consent from patients where id=$1", pid) is True


async def test_set_ads_consent_toggles_and_logs(db_conn):
    # CONSENT-LATER-01 — 가입 뒤 광고 동의를 켜면 현재 상태 + 이력 한 줄
    pid = await _seed_patient(db_conn)
    await consent_service.set_ads_consent(db_conn, pid, agreed=True, terms_version=TV)
    assert await db_conn.fetchval("select ads_consent from patients where id=$1", pid) is True
    n = await db_conn.fetchval(
        "select count(*) from patient_consents where patient_id=$1 and item='ads'", pid)
    assert n == 1


def test_no_service_path_to_toggle_required_consents():
    # CONSENT-LATER-02 — 필수 셋을 끄는 길은 없다(끄는 것이 곧 탈퇴). set_ads_consent는 item='ads'만 만진다.
    assert not hasattr(consent_service, 'set_required_consent')


def test_can_send_ads_gates_on_consent_and_night():
    # CONSENT-ADS-01 — 켠 사람에게만 + 21~08시 발송 금지(정보통신망법 50조)
    assert consent_service.can_send_ads(ads_consent=False, now=datetime(2026, 8, 17, 14, 0)) is False
    assert consent_service.can_send_ads(ads_consent=True, now=datetime(2026, 8, 17, 22, 0)) is False  # 야간
    assert consent_service.can_send_ads(ads_consent=True, now=datetime(2026, 8, 17, 7, 0)) is False   # 08시 전
    assert consent_service.can_send_ads(ads_consent=True, now=datetime(2026, 8, 17, 14, 0)) is True
