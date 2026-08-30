"""동의 기록·광고 동의 토글·광고 발송 자격(CONSENT-*, 갭 #108·#104).

동의는 가입 맨 앞(전화번호 전)이라 이 서비스는 세션 밖에서 불릴 수 없다 — 프로필 생성 시점에
patient_id가 생긴 뒤 `register_profile`이 record_consents를 부른다.
"""
from datetime import datetime

REQUIRED_ITEMS = ('terms', 'privacy', 'sensitive')  # CONSENT-ITEM-01·02 — 민감정보는 별도(개인정보보호법 23조)

# CONSENT-LOG-01의 '어느 판' — 병원이 약관을 갱신하면 올린다. register_profile·라우터가 공유하는 정본.
TERMS_VERSION = "2026-08-01"


async def record_consents(conn, patient_id, *, ads_agreed: bool, terms_version: str) -> None:
    """CONSENT-LOG-01 — 프로필 생성 시 무엇에·언제·어느 판에 동의했는지 4줄을 남긴다.
    필수 3개는 여기 도달했다는 것 자체가 동의다(CONSENT-BTN-01: 필수 셋이 켜져야 [다음]이 살아난다)."""
    rows = [(patient_id, item, True, terms_version) for item in REQUIRED_ITEMS]
    rows.append((patient_id, 'ads', ads_agreed, terms_version))
    await conn.executemany(
        "insert into patient_consents (patient_id, item, agreed, terms_version) "
        "values ($1, $2, $3, $4)",
        rows,
    )
    await conn.execute(
        "update patients set ads_consent = $1 where id = $2", ads_agreed, patient_id)


async def set_ads_consent(conn, patient_id, *, agreed: bool, terms_version: str) -> None:
    """CONSENT-LATER-01 — 가입 뒤 [선택] 광고 동의만 켜고 끈다(설정 > 알림 설정).
    CONSENT-LATER-02: 필수 셋을 끄는 함수는 두지 않는다 — 끄는 것이 곧 탈퇴이기 때문(탈퇴 경로로 안내)."""
    await conn.execute(
        "update patients set ads_consent = $1 where id = $2", agreed, patient_id)
    await conn.execute(
        "insert into patient_consents (patient_id, item, agreed, terms_version) "
        "values ($1, 'ads', $2, $3)",
        patient_id, agreed, terms_version,
    )


def can_send_ads(*, ads_consent: bool, now: datetime) -> bool:
    """CONSENT-ADS-01 — 광고는 켠 사람에게만 + 21~08시 발송 금지. (광고) 접두어·무료 수신거부
    방법은 발송측(직원웹 Task 28)이 본문에 붙인다 — 여기서는 자격만 판정한다."""
    if not ads_consent:
        return False
    return 8 <= now.hour < 21
