"""[Task 7C] 발송 cron — 예약발송·상담답변 배치·재시도를 한 번에 민다.

실행: python -m app.jobs.dispatch (배포 cron이 주기 실행 — 몇 분 간격).
세 갈래를 한 트랜잭션에서 처리한다:
  · run_scheduled_sends      — 예약시각이 된 직원 예약발송
  · dispatch_pending_batches — 상담 답변 알림 배치(등록환자·익명)
  · run_retry_worker         — 일시 실패한 문자/푸시 재시도(due)
실제 제공자(Solapi 문자·FCM 푸시)는 배포 env 키로 활성 — 키가 없으면 개발 폴백(로그만).
"""
import asyncio

from app.db.pool import get_pool
from app.services import dispatch_service, message_service
from app.services.chat import chat_notification_service


async def run(*, conn=None) -> dict:
    if conn is not None:
        return await _run_on_conn(conn)
    pool = await get_pool()
    async with pool.acquire() as c, c.transaction():
        return await _run_on_conn(c)


async def _run_on_conn(conn) -> dict:
    scheduled = await message_service.run_scheduled_sends(conn=conn)
    batches = await chat_notification_service.dispatch_pending_batches(conn)
    retried = await dispatch_service.run_retry_worker(conn=conn)
    result = {"scheduled": scheduled, "batches": batches, "retried": retried}
    print(f"[dispatch] {result}")
    return result


if __name__ == "__main__":
    asyncio.run(run())
