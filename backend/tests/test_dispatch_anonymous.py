"""[배포·B안][§5] 디스패처가 익명 웹상담 연락처로 문자를 보낸다(ciphertext 복호화).

익명 답변 알림은 환자 계정이 없다 — notification_log의 anonymous_contact_id가 가리키는
검증 연락처(암호문)를 dispatcher가 복호화해 보낸다. 병원 문자 스위치·계정 판정을 타지 않는다.
"""
from cryptography.fernet import Fernet

from app.services import dispatch_service as ds
from app.services.dispatch_service import SmsOutcome


async def _anon_contact(conn, phone: str):
    from app.core.config import settings as cfg
    from app.services.chat import anonymous_contact_codec as codec
    ct = codec.encrypt_contact(phone)
    sid = await conn.fetchval(
        "insert into anonymous_chat_sessions (token_hash) values ('h') returning id")
    cid = await conn.fetchval(
        "insert into anonymous_chat_contacts "
        "(anonymous_session_id, contact_value_ciphertext, contact_value_hash) "
        "values ($1,$2,'h') returning id", sid, ct)
    return sid, cid


async def test_send_now_to_anonymous_contact_decrypts_and_sends(db_conn, monkeypatch):
    """[§5] 익명 연락처(암호문)를 복호화해 그 번호로 문자를 보낸다."""
    from app.core.config import settings as cfg
    from app.services.chat import anonymous_contact_codec as codec
    monkeypatch.setattr(cfg, "anon_contact_encryption_key", Fernet.generate_key().decode())
    codec._fernet = None
    try:
        sid, cid = await _anon_contact(db_conn, "01099998888")
        nid = await db_conn.fetchval(
            "insert into notification_log "
            "(notification_type, kind, channel, requested_channel, delivery_status, "
            " anonymous_session_id, anonymous_contact_id, body) "
            "values ('support_answered','transactional','sms','sms','발송중',$1,$2,'답변 도착') returning id",
            sid, cid)
        sent: list[str] = []

        def _sms(phone, body):
            sent.append(phone)
            return SmsOutcome(status="queued", provider_message_id="x")

        await ds.send_now([nid], db_conn, sms_send=_sms)
        assert sent == ["01099998888"]
    finally:
        codec._fernet = None
