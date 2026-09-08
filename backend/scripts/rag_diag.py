"""RAG 검색 진단(읽기 전용) — 실패 질의의 top-5 하이브리드 결과와 점수를 그대로 출력.

봇이 no_answer를 내는 원인이 (1) HYBRID_FLOOR(0.30) 미달인지 (2) 제한/일반 혼합으로
LLM이 근거 없다고 판정하는 경로인지를 실제 점수로 가른다. DB 쓰기 없음.

실행(원격): cd backend && railway run -s gaonhospital-api .venv/bin/python -m scripts.rag_diag
"""
import asyncio

import asyncpg

from app.core.config import settings
from app.integrations.embedding_client import EmbeddingClient

QUERIES = [
    "CT 조영제 검사 전에 어떻게 준비하나요?",
    "바륨 검사 준비 방법 알려줘",
    "대장내시경 검사 전 준비 알려줘",
    "건강검진 전날 준비할 게 있나요?",   # 대조군(정상 동작)
]

HYBRID_FLOOR = 0.30  # rag_service.py와 동일


async def main() -> None:
    if not settings.openai_api_key:
        raise SystemExit("OPENAI_API_KEY 비어 있음")
    embedder = EmbeddingClient(settings.openai_api_key)
    conn = await asyncpg.connect(settings.database_url)
    try:
        for q in QUERIES:
            qvec = (await embedder.embed([q]))[0]
            vec = "[" + ",".join(map(str, qvec)) + "]"
            rows = await conn.fetch(
                "select * from match_kb_chunks_hybrid($1::vector, $2, $3)", vec, q, 5)
            print(f"\n■ 질의: {q}")
            if not rows:
                print("  (top-5 없음 — 트라이그램 0.2 컷과 벡터 top20 모두 비어 있음)")
                continue
            top = rows[0]
            passes_floor = max(top["similarity"], top["keyword_sim"]) >= HYBRID_FLOOR
            print(f"  최상위 floor 통과? {passes_floor} "
                  f"(max(vec={top['similarity']:.3f}, kw={top['keyword_sim']:.3f}) vs {HYBRID_FLOOR})")
            for i, r in enumerate(rows):
                flag = "🔒제한" if r["is_restricted"] else "일반"
                print(f"  [{i}] {flag} vec={r['similarity']:.3f} kw={r['keyword_sim']:.3f} "
                      f"rrf={r['rrf']:.4f} | {r['title']}")
            restricted = [r for r in rows if r["is_restricted"]]
            normal = [r for r in rows if not r["is_restricted"]]
            if passes_floor:
                if restricted and not normal:
                    print("  → 경로: 제한 전용 → restricted_block 직행(LLM 안 부름)")
                elif restricted and normal:
                    print("  → 경로: 제한+일반 혼합 → LLM이 '일반'만 근거로 봄. "
                          "일반이 답 없으면 NO_ANSWER로 제한원문까지 버려질 수 있음 ⚠️")
                else:
                    print("  → 경로: 일반 전용 → LLM 답변")
            else:
                print("  → 경로: floor 미달 → no_answer(관문1)")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
