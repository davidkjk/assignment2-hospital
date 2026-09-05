"""자정 크론이 실행하는 부도 처리 배치. 실행: python -m app.jobs.overdue
갭 #28 · 원장 CARD-LATE-10: 예약확정인 채 시각이 지난 예약을 예약부도로 전환한다.
⭐ 날짜 경계는 SQL의 current_date로 판정한다. ⚠️ C6-#10·#11(2026-08-20): current_date는 「DB 세션 타임존」이라
   서버 OS가 UTC면 KST 자정~UTC 자정 사이 하루 어긋난다 → **연결 풀이 세션 시간대를 KST로 고정**한다
   (`backend/app/db/pool.py` `create_pool(server_settings={"timezone":"Asia/Seoul"})`). 이 계약 위에서만
   current_date=KST가 보장되므로 Python KST 계산이 불필요하다(같은 풀을 쓰는 doctor_can_view_*·환자 upcoming/슬롯 등
   모든 current_date 소비자도 함께 KST가 된다)."""
import asyncio

from app.db.pool import get_pool


async def run() -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        count = await conn.fetchval("select mark_overdue_no_shows()")
    print(f"[overdue] marked {count} no-show(s)")
    return count


if __name__ == "__main__":
    asyncio.run(run())
