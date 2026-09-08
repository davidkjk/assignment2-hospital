"""KB 원격 상태 읽기 전용 진단 — 개별 검사문서 적재/임베딩 여부 확인.

실행(원격): cd backend && railway run -s gaonhospital-api .venv/bin/python -m scripts.kb_diag
아무것도 쓰지 않는다(SELECT만).
"""
import asyncio

import asyncpg

from app.core.config import settings

# 봇이 no_answer를 낸다고 보고된 개별 검사 안내 제목들(seed_kb_bulk.sql 기준)
TARGET_TITLES = [
    "CT(조영제) 검사 전 준비",
    "위장조영(바륨) 검사 전 준비",
    "검사 준비사항 종합 안내",
    "대장암 검진 안내",
    "건강검진 종합 안내",
]


async def main() -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        total_docs = await conn.fetchval("select count(*) from kb_documents")
        approved = await conn.fetchval(
            "select count(*) from kb_documents where status='approved'")
        total_chunks = await conn.fetchval("select count(*) from kb_chunks")
        embedded_chunks = await conn.fetchval(
            "select count(*) from kb_chunks where embedding is not null")
        print(f"kb_documents 총 {total_docs}건 (approved {approved})")
        print(f"kb_chunks 총 {total_chunks}건 (embedding 있는 것 {embedded_chunks})")
        print("--- 대상 개별 검사문서 상태 ---")
        for t in TARGET_TITLES:
            row = await conn.fetchrow(
                "select id, status, is_restricted from kb_documents where title=$1", t)
            if row is None:
                print(f"  ❌ 미적재: {t}")
                continue
            n = await conn.fetchval(
                "select count(*) from kb_chunks where document_id=$1", row["id"])
            emb = await conn.fetchval(
                "select count(*) from kb_chunks where document_id=$1 and embedding is not null",
                row["id"])
            print(f"  ✅ 적재: {t} | status={row['status']} restricted={row['is_restricted']} "
                  f"chunks={n} (임베딩 {emb})")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
