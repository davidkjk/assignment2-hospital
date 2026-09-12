"""[배포·B안][SEND-RETRY-01] 재시도 워커 — next_retry_at이 지난 '재시도중' 줄을 다시 보낸다.

cron이 주기(10분) 실행한다. 여기선 due인 줄만 골라 send_now로 재발송하는지 못박는다.
제공자는 fake 주입(실 Solapi/FCM = 배포 env).
"""
from app.services import dispatch_service as ds
from app.services.dispatch_service import SmsOutcome


async def _retry_row(conn, *, due: bool, phone: str) -> str:
    pid = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('김환자','1990-01-01','F',$1) returning id", phone)
    when = "now() - interval '1 minute'" if due else "now() + interval '1 hour'"
    return await conn.fetchval(
        "insert into notification_log "
        "(patient_id, notification_type, channel, requested_channel, delivery_status, body, next_retry_at) "
        f"values ($1,'staff_direct','sms','sms','재시도중','안내', {when}) returning id", pid)


async def test_retry_worker_resends_only_due_rows(db_conn):
    """[SEND-RETRY-01] due(지난)만 재발송하고 아직 안 된 줄은 건드리지 않는다."""
    await _retry_row(db_conn, due=True, phone="01011112222")
    await _retry_row(db_conn, due=False, phone="01033334444")
    sent: list[str] = []

    def _sms(phone, body):
        sent.append(phone)
        return SmsOutcome(status="queued", provider_message_id="x")

    n = await ds.run_retry_worker(conn=db_conn, sms_send=_sms)

    assert n == 1
    assert sent == ["01011112222"]
