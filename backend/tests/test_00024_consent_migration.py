import pytest

pytestmark = pytest.mark.asyncio


async def test_patient_consents_table_exists(db_conn):
    # CONSENT-LOG-02 — 동의 이력 표가 통째로 없었다(갭 #108). 새로 생긴다.
    reg = await db_conn.fetchval("select to_regclass('public.patient_consents')")
    assert reg is not None


async def test_consent_item_check_constraint(db_conn):
    # CONSENT-ITEM-01 — 줄 넷: 약관·개인정보·민감정보·광고. item은 이 넷만 허용.
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into patient_consents (patient_id, item, agreed, terms_version) "
            "values (gen_random_uuid(), 'garbage', true, 'v1')")


async def test_patients_has_ads_consent_column(db_conn):
    # CONSENT-LOG-01 파생 — 광고 동의 '현재 상태' 칸(LATER 토글용). 기본 false.
    col = await db_conn.fetchval(
        "select column_default from information_schema.columns "
        "where table_name='patients' and column_name='ads_consent'")
    assert col is not None and 'false' in col.lower()


def test_config_password_and_otp_tightened():
    from pathlib import Path
    cfg = Path(__file__).resolve().parents[2] / 'supabase' / 'config.toml'
    text = cfg.read_text()
    assert 'minimum_password_length = 8' in text          # AUTH-PROFILE-02: 6 → 8
    assert 'password_requirements = "letters_digits"' in text  # 영문·숫자 함께
    # AUTH-OTP-04: phone OTP가 화면(5분)과 어긋나지 않게 반영/주석으로 남긴다.
    assert 'otp_exp' in text or 'OTP expiry' in text
