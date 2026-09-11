"""Realtime 원격 상태 읽기 전용 진단 — chat_messages 실시간 전달 배선 확인.

배경(세션3, 환자앱 "직원→환자 한 번만 오고 끊김"): 앱 streamThread·직원웹 useTicketDetailRealtime
둘 다 postgres_changes 로 chat_messages 를 구독한다. 이 테이블이 supabase_realtime
publication 에 없으면(마이그 00096 미적용) 초기 스냅샷만 오고 이후 INSERT 는 영영 안 온다.
봇 스트리밍·직원 답장(세션1)·typing 은 전부 broadcast 라 publication 과 무관 →
postgres_changes 경로가 프로덕션에서 검증된 적이 없을 수 있다.

실행(원격): cd backend && railway run -s gaonhospital-api .venv/bin/python -m scripts.realtime_diag
아무것도 쓰지 않는다(SELECT만).
"""
import asyncio

import asyncpg

from app.core.config import settings

# 실시간 관심 대상 — 있어야 postgres_changes(.stream()) 로 라이브 전달된다.
TARGET_TABLES = ["chat_messages", "support_tickets", "appointments"]

# relreplident 코드 → 사람이 읽을 뜻. INSERT 전달은 default(d) 로 충분(PK 기반).
REPLICA_IDENTITY = {
    "d": "default (PK) — INSERT 전달 OK",
    "f": "full",
    "n": "nothing — UPDATE/DELETE old값 안 옴",
    "i": "index",
}


async def main() -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        rows = await conn.fetch(
            "select tablename from pg_publication_tables "
            "where pubname='supabase_realtime' order by 1"
        )
        pub = {r["tablename"] for r in rows}
        print(f"supabase_realtime publication 등록 테이블 {len(pub)}건:")
        for t in sorted(pub):
            print(f"  - {t}")
        print("--- 실시간 관심 대상 ---")
        for t in TARGET_TABLES:
            in_pub = t in pub
            ri = await conn.fetchval(
                "select relreplident::text from pg_class where relname=$1", t
            )
            ri_txt = REPLICA_IDENTITY.get(ri, f"?({ri})")
            mark = "✅" if in_pub else "❌ 미등록 → postgres_changes 전달 안 됨"
            print(f"  {mark} {t} | publication={in_pub} | replica_identity={ri_txt}")
        if "chat_messages" not in pub:
            print(
                "\n⭐ 판정: chat_messages 가 publication 에 없다 → 마이그 00096 미적용."
                "\n   = 환자앱/직원웹 라이브 메시지 안 옴의 유력 근본원인."
                "\n   조치: supabase/migrations/00096 을 원격에 적용(alter publication ... add table chat_messages)."
            )
        else:
            print(
                "\n⭐ 판정: chat_messages 는 publication 에 있음 → 마이그 00096 적용됨."
                "\n   = '한 번만 오고 끊김'은 publication 문제가 아님 → 연결/재구독(F2) 계측으로 넘어간다."
            )
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
