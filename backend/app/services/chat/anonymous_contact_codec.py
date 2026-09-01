"""익명 웹 상담 연락처(전화) 대칭 암복호 codec (C1-3, 2026-08-20).

저장 시 `encrypt_contact(phone)` → `record_verified_contact`의 ciphertext,
발송 시 dispatcher(문자 폴백)가 `resolve_recipient`의 `contact_ciphertext`를 `decrypt_contact(...)`로 푼다.
상수명은 배포 env와 일치(ANON_CONTACT_ENCRYPTION_KEY, deployment:2315).

⚠️ 실행 보정: Fernet은 지연 초기화한다. 키(env)가 비어도 모듈 import는 성공하고,
실제 암복호를 호출할 때만 실패한다 — 「키는 배포에서만 꽂는다」 계약(§4.5)에 맞춘다.
플랜의 모듈-레벨 Fernet은 빈 키에서 import 자체가 깨진다.
"""
from cryptography.fernet import Fernet

from app.core.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.anon_contact_encryption_key
        if not key:
            raise RuntimeError(
                "ANON_CONTACT_ENCRYPTION_KEY 미설정 — 익명 연락처 암복호 불가(배포 env에 Fernet 키를 넣어야 함).")
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt_contact(plaintext: str) -> str:
    """저장 시: 검증된 전화번호 원문 → ciphertext(record_verified_contact 인자). 평문 저장 금지(§4.5)."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_contact(ciphertext: str) -> str:
    """발송 시: dispatcher(문자 폴백)가 resolve_recipient의 contact_ciphertext를 실제 전화번호로."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()
