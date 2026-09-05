"""[배포·B안][§5·§8] dispatch_pending_batches — 상담 답변 알림 배치를 실제로 보낸다.

notification_requested_at이 있고 아직 안 보낸 배치를 돌며, 등록환자는 계정 알림으로·익명은
검증 연락처(복호화)로 문자를 만들어 send_now로 보낸다. 배치당 log 한 줄(재실행 시 중복 방지).
"""
import uuid

from cryptography.fernet import Fernet

from app.services.chat import chat_notification_service as cns
from app.services.dispatch_service import SmsOutcome
from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread


async def _ticket(conn, thread_id):
    return await conn.fetchval(
        "insert into support_tickets (thread_id, status) values ($1,'in_progress') returning id",
        thread_id)


async def _staff_msg(conn, thread_id, ticket_id, staff_id):
    return await conn.fetchval(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, sender_staff_id, "
        "message_type, content) values ($1,$2,'staff',$3,'text','답변') returning id",
        thread_id, ticket_id, staff_id)


async def test_dispatch_pending_batches_sends_patient_and_anonymous(db_conn, monkeypatch):
    """[§5·§8] 등록환자·익명 배치를 각각 문자로 보내고, 재실행 시 다시 보내지 않는다."""
    from app.core.config import settings as cfg
    from app.services.chat import anonymous_contact_codec as codec
    monkeypatch.setattr(cfg, "anon_contact_encryption_key", Fernet.generate_key().decode())
    codec._fernet = None
    try:
        st = await seed_staff(db_conn, role="doctor")
        # 등록환자 배치
        p = await seed_patient(db_conn, phone="010-1111-2222")
        tp = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
        tkp = await _ticket(db_conn, tp)
        bp = await db_conn.fetchval(
            "select enqueue_staff_reply_notification($1)",
            await _staff_msg(db_conn, tp, tkp, st["staff_id"]))
        # 익명 배치(검증 연락처=암호화된 전화)
        sid = await db_conn.fetchval(
            "insert into anonymous_chat_sessions (token_hash) values ($1) returning id",
            "h" + uuid.uuid4().hex)
        ct = codec.encrypt_contact("01099998888")
        await db_conn.execute("select record_verified_anonymous_contact($1,$2,'PHASH')", sid, ct)
        ta = await seed_chat_thread(db_conn, anonymous_session_id=sid)
        tka = await _ticket(db_conn, ta)
        ba = await db_conn.fetchval(
            "select enqueue_staff_reply_notification($1)",
            await _staff_msg(db_conn, ta, tka, st["staff_id"]))

        sent: list[str] = []

        def _sms(phone, body):
            sent.append(phone)
            return SmsOutcome(status="queued", provider_message_id="x")

        n = await cns.dispatch_pending_batches(db_conn, sms_send=_sms)

        assert n == 2
        assert set(sent) == {"010-1111-2222", "01099998888"}
        assert await db_conn.fetchval(
            "select count(*) from notification_log where chat_notification_batch_id=$1", bp) == 1
        assert await db_conn.fetchval(
            "select count(*) from notification_log where chat_notification_batch_id=$1", ba) == 1
        # 재실행 = 중복 발송 없음
        assert await cns.dispatch_pending_batches(db_conn, sms_send=_sms) == 0
    finally:
        codec._fernet = None
