"""[배포·B안][Task 7C] 발송 cron 진입점 — 예약발송·상담배치·재시도를 한 번에 민다.

cron이 주기 실행한다(python -m app.jobs.dispatch). 세 갈래를 한 트랜잭션에서 처리하고
각 처리 건수를 돌려준다. 여기선 예약발송 한 건이 실제로 밀리는지로 배선을 못박는다.
"""
from app.jobs import dispatch as dispatch_job
from tests.conftest import seed_patient, seed_staff


async def test_dispatch_job_pushes_due_scheduled_send(db_conn):
    """[Task 7C] due 예약발송이 발송 cron 한 번에 처리된다."""
    staff = await seed_staff(db_conn, "receptionist")
    p = (await seed_patient(db_conn, phone="010-1111-1111"))["patient_id"]
    sid = await db_conn.fetchval(
        "insert into scheduled_notifications "
        "(notification_type, kind, body, channel, scheduled_at, created_by, target_count, status) "
        "values ('staff_direct','transactional','안내','sms', now()-interval '1 minute', $1, 1, 'pending') "
        "returning id", staff["staff_id"])
    await db_conn.execute(
        "insert into scheduled_notification_recipients (scheduled_notification_id, patient_id) "
        "values ($1,$2)", sid, p)

    result = await dispatch_job.run(conn=db_conn)

    assert result["scheduled"] == 1
    assert result["batches"] == 0
    assert result["retried"] == 0
    assert await db_conn.fetchval(
        "select status from scheduled_notifications where id=$1", sid) == "sent"
