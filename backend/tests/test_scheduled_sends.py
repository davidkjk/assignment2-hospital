"""[배포·B안][SEND-LATER-01] 예약발송 구동부 — 예약시각이 된 pending을 실제로 보낸다.

cron이 주기 실행한다. due(예약시각 지남)인 pending만 골라, 예약 때 고정한 수신자 명단으로
notification_log를 만들고 send_now로 보낸 뒤 status를 'sent'로 넘긴다.
"""
from tests.conftest import seed_patient, seed_staff
from app.services import message_service as ms
from app.services.dispatch_service import SmsOutcome


async def _scheduled(conn, staff_id, *, due: bool, patient_ids, channel="sms"):
    when = "now() - interval '1 minute'" if due else "now() + interval '1 hour'"
    sid = await conn.fetchval(
        "insert into scheduled_notifications "
        "(notification_type, kind, body, channel, scheduled_at, created_by, target_count, status) "
        f"values ('staff_direct','transactional','안내',$1,{when},$2,$3,'pending') returning id",
        channel, staff_id, len(patient_ids))
    for pid in patient_ids:
        await conn.execute(
            "insert into scheduled_notification_recipients "
            "(scheduled_notification_id, patient_id) values ($1,$2)", sid, pid)
    return sid


async def test_scheduled_driver_sends_due_only_and_marks_sent(db_conn):
    """[SEND-LATER-01] due만 보내고 'sent'로 넘긴다. 아직 안 된 예약은 pending 그대로."""
    staff = await seed_staff(db_conn, "receptionist")
    p1 = (await seed_patient(db_conn, phone="010-1111-1111"))["patient_id"]
    p2 = (await seed_patient(db_conn, phone="010-2222-2222"))["patient_id"]
    due = await _scheduled(db_conn, staff["staff_id"], due=True, patient_ids=[p1])
    notdue = await _scheduled(db_conn, staff["staff_id"], due=False, patient_ids=[p2])
    sent: list[str] = []

    def _sms(phone, body):
        sent.append(phone)
        return SmsOutcome(status="queued", provider_message_id="x")

    n = await ms.run_scheduled_sends(conn=db_conn, sms_send=_sms)

    assert n == 1
    assert len(sent) == 1
    assert await db_conn.fetchval(
        "select status from scheduled_notifications where id=$1", due) == "sent"
    assert await db_conn.fetchval(
        "select status from scheduled_notifications where id=$1", notdue) == "pending"
    assert await db_conn.fetchval(
        "select count(*) from notification_log where patient_id=$1", p1) == 1
