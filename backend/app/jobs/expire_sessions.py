"""[Task 7C] 만료 cron — 오래 방치된 AI 상담 세션을 닫는다.

실행: python -m app.jobs.expire_sessions (배포 cron이 주기 실행).
세션 만료는 서버 주체 실행이다(무활동 기준은 expire_idle_ai_sessions SQL 함수 안). 지금 프로덕션엔
이 cron이 없어 방치 세션이 영영 안 닫혔다 — 이 진입점이 그 구멍을 메운다.
"""
import asyncio

from app.services.chat import ai_session_service


async def run() -> int:
    n = await ai_session_service.expire_idle_sessions()
    print(f"[expire-sessions] expired {n} idle session(s)")
    return n


if __name__ == "__main__":
    asyncio.run(run())
