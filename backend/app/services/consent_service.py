"""동의 기록·광고 동의 토글·광고 발송 자격(CONSENT-*, 갭 #108·#104).

동의는 가입 맨 앞(전화번호 전)이라 이 서비스는 세션 밖에서 불릴 수 없다 — 프로필 생성 시점에
patient_id가 생긴 뒤 `register_profile`이 record_consents를 부른다.
"""
from datetime import datetime

from app.core.errors import AppError

REQUIRED_ITEMS = ('terms', 'privacy', 'sensitive')  # CONSENT-ITEM-01·02 — 민감정보는 별도(개인정보보호법 23조)

# 문서별 정본 버전 — 병원이 특정 문서를 개정하면 그 항목만 올린다(단일 TERMS_VERSION 폐기).
# 앱 매니페스트(legal_documents.dart)와 반드시 일치(test_legal_version_sync가 드리프트를 막는다).
DOCUMENT_VERSIONS: dict[str, str] = {
    'terms': 'v1.0', 'privacy': 'v1.0', 'sensitive': 'v1.0', 'ads': 'v1.0',
}


def validate_registration_consents(consents: dict, document_versions: dict) -> None:
    """[보안 F-05 벡터1] 서버측 가입 불변식 — 필수 동의를 클라이언트가 실제로 단언했는지 강제한다.

    이전엔 「엔드포인트 도달=동의」(CONSENT-BTN-01)로 서버가 무조건 true를 기록해, 화면을 우회한
    요청도 거짓 동의 증적을 만들 수 있었다. 이제 요청이 필수 항목을 present+true로 단언하고,
    각 문서의 제시 버전이 현재판(DOCUMENT_VERSIONS)과 일치할 때만 통과시킨다. 아니면 거절한다.
    """
    for item in REQUIRED_ITEMS:
        if consents.get(item) is not True:
            raise AppError("필수 항목에 모두 동의해야 가입할 수 있습니다.", status_code=400)
    for item, current in DOCUMENT_VERSIONS.items():
        if document_versions.get(item) != current:
            # 앱이 옛 약관을 보여줬을 수 있다 — 최신판 동의로 둔갑시키지 않고 막는다(fail-closed).
            raise AppError(
                "약관 버전이 올바르지 않습니다. 앱을 최신 버전으로 업데이트해 주세요.",
                status_code=400)


async def record_consents(conn, patient_id, *, mandatory: dict, ads_agreed: bool,
                          document_versions: dict) -> None:
    """CONSENT-LOG-01 — 프로필 생성 시 무엇에·언제·어느 판에 동의했는지 4줄을 남긴다.
    각 행에 그 문서의 버전을 기록한다(행마다 항목 하나라 스키마 변경 없이 문서별 버전 저장).

    [보안 F-05 벡터1] 필수 3개도 무조건 true로 박지 않고 요청이 실제 단언한 값을 기록한다.
    (register_profile이 validate_registration_consents로 이미 전부 true임을 강제하지만, 기록은
    「서버가 만든 값」이 아니라 「사용자가 단언한 값」이어야 증적이 정직하다.)"""
    rows = [(patient_id, item, bool(mandatory.get(item)), document_versions[item])
            for item in REQUIRED_ITEMS]
    rows.append((patient_id, 'ads', ads_agreed, document_versions['ads']))
    await conn.executemany(
        "insert into patient_consents (patient_id, item, agreed, terms_version) "
        "values ($1, $2, $3, $4)",
        rows,
    )
    await conn.execute(
        "update patients set ads_consent = $1 where id = $2", ads_agreed, patient_id)


async def set_ads_consent(conn, patient_id, *, agreed: bool) -> None:
    """CONSENT-LATER-01 — 가입 뒤 [선택] 광고 동의만 켜고 끈다(설정 > 알림 설정). 버전은 정본 상수에서 읽는다.
    CONSENT-LATER-02: 필수 셋을 끄는 함수는 두지 않는다 — 끄는 것이 곧 탈퇴이기 때문(탈퇴 경로로 안내)."""
    await conn.execute(
        "update patients set ads_consent = $1 where id = $2", agreed, patient_id)
    await conn.execute(
        "insert into patient_consents (patient_id, item, agreed, terms_version) "
        "values ($1, 'ads', $2, $3)",
        patient_id, agreed, DOCUMENT_VERSIONS['ads'],
    )


def can_send_ads(*, ads_consent: bool, now: datetime) -> bool:
    """CONSENT-ADS-01 — 광고는 켠 사람에게만 + 21~08시 발송 금지. (광고) 접두어·무료 수신거부
    방법은 발송측(직원웹 Task 28)이 본문에 붙인다 — 여기서는 자격만 판정한다."""
    if not ads_consent:
        return False
    return 8 <= now.hour < 21
