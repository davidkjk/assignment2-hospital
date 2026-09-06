"""#35 — KB 재임베딩 배치(원격 kb_chunks 채우기).

원격 DB에 kb_documents는 있으나 kb_chunks(임베딩)가 0건이라 RAG가 항상 no_answer를 낸다.
approved 문서를 순회하며 기존 kb_service._reembed(제목 포함 임베딩)로 kb_chunks를 채운다.

실행(원격, 실 OpenAI 키 필요):
  cd backend && set -a && source .env.railway && set +a
  OPENAI_API_KEY=<실키> .venv/bin/python -m scripts.reembed_kb --dry-run
  OPENAI_API_KEY=<실키> .venv/bin/python -m scripts.reembed_kb
"""
import argparse
import asyncio

import asyncpg

from app.core.config import settings
from app.integrations.embedding_client import EmbeddingClient
from app.services.chat import kb_service


async def run(status: str, dry_run: bool) -> None:
    if not settings.openai_api_key:
        raise SystemExit("OPENAI_API_KEY 비어 있음 — 재임베딩엔 실제 임베딩 호출이 필요합니다.")
    embedder = EmbeddingClient(settings.openai_api_key)
    # ⚠️ 원격 세션 풀러는 클라이언트 15개 한도라 배치용으로 풀(기본 10개)을 열면 EMAXCONNSESSION.
    #    일회성 배치는 단일 연결 1개만 쓴다(라이브 백엔드 커넥션과 경합 최소화).
    conn = await asyncpg.connect(settings.database_url)
    try:
        docs = await conn.fetch(
            "select id, title from kb_documents where status=$1 order by created_at", status)
        print(f"대상 문서 {len(docs)}건(status={status}).")
        if dry_run:
            for d in docs:
                print("  -", d["id"], d["title"])
            return
        for i, d in enumerate(docs, 1):
            content = await conn.fetchval("select content from kb_documents where id=$1", d["id"])
            async with conn.transaction():
                await kb_service._reembed(conn, d["id"], content, embedder)
                n = await conn.fetchval(
                    "select count(*) from kb_chunks where document_id=$1", d["id"])
            print(f"  [{i}/{len(docs)}] {d['title']} → {n} chunks")
        total = await conn.fetchval("select count(*) from kb_chunks")
        print("완료 — kb_chunks 총", total, "건.")
    finally:
        await conn.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", default="approved")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    asyncio.run(run(a.status, a.dry_run))


if __name__ == "__main__":
    main()
