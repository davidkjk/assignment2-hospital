"""상담봇 검색·답변 품질 평가 러너 (리포트 §4.1 · §2.10 복원).

골든 케이스(evals/chatbot_cases.jsonl)를 실제 파이프라인에 돌려 검색 Recall@k·근거 충실성을
측정한다. 순수 채점은 app/services/chat/eval_scoring.py(단위 테스트 있음), 이 파일은 드라이버.

실행(로컬 DB + OpenAI/Anthropic 키 필요 — API 비용 발생):
    cd backend && .venv/bin/python -m scripts.rag_eval
    .venv/bin/python -m scripts.rag_eval --route rag        # 특정 expected_route만
    .venv/bin/python -m scripts.rag_eval --verbose          # 케이스별 상세

주의:
- 키가 없으면 아무 것도 호출하지 않고 안내만 출력한다(자동 테스트·CI 안전).
- v1은 expected_route=="rag" 케이스의 검색/답변 품질을 잰다. 라우팅 정확도(경로가 맞는 갈래로
  갔는가)와 멀티턴 재작성 반영은 대화 이해기(Sprint 2) 도입 후 확장한다. 지금은 마지막 user 발화를
  질의로 쓰므로, multiturn 케이스의 낮은 점수는 "재작성 미도입"을 그대로 드러낸다(의도된 신호).
"""
import argparse
import asyncio
import json
from collections import defaultdict
from pathlib import Path

from app.core.config import settings
from app.integrations.embedding_client import EmbeddingClient
from app.integrations.langchain_client import get_chat_model
from app.services.chat import rag_service, eval_scoring as sc

CASES_PATH = Path(__file__).resolve().parent.parent / "evals" / "chatbot_cases.jsonl"


def load_cases() -> list[dict]:
    return [json.loads(line) for line in CASES_PATH.read_text().splitlines() if line.strip()]


def standalone_query(case: dict) -> str:
    # v1: 마지막 user 발화를 질의로 쓴다(재작성 미도입 — Sprint 2에서 이력+재작성으로 교체).
    return [t["content"] for t in case["turns"] if t["role"] == "user"][-1]


async def run_rag_case(case: dict, embedder, model) -> dict:
    query = standalone_query(case)
    result = await rag_service.rag_answer(query, embedder=embedder, model=model)
    titles = [s["title_snapshot"] for s in result.get("sources", [])]
    reply = result.get("reply") or result.get("restricted_block") or ""
    return {
        "query": query,
        "no_answer": result.get("no_answer", False),
        "recall": sc.recall_at_k(case.get("expected_source_titles", []), titles),
        "missing_facts": sc.missing_facts(reply, case.get("required_facts", [])),
        "forbidden": sc.forbidden_hits(reply, case.get("forbidden_claims", [])),
        "missing_query_terms": sc.missing_query_terms(query, case.get("expected_query_contains", [])),
        "titles": titles,
        "reply": reply,
    }


async def main(route_filter: str | None, verbose: bool) -> None:
    if not settings.openai_api_key or not settings.anthropic_api_key:
        print("⚠️ OPENAI_API_KEY·ANTHROPIC_API_KEY가 필요합니다(로컬 DB도). 키를 넣고 다시 실행하세요.")
        print("   케이스 무결성은 키 없이 `pytest tests/test_rag_eval.py`로 검증됩니다.")
        return

    cases = load_cases()
    embedder = EmbeddingClient(settings.openai_api_key)
    model = get_chat_model()

    rag_cases = [c for c in cases if c.get("expected_route") == "rag"
                 and (route_filter in (None, "rag"))]
    by_cat = defaultdict(list)
    n_recall_ok = n_fact_ok = n_forbidden_ok = 0

    for c in rag_cases:
        r = await run_rag_case(c, embedder, model)
        by_cat[c.get("category", "-")].append(r["recall"])
        recall_ok = r["recall"] >= 0.999 or not c.get("expected_source_titles")
        fact_ok = not r["missing_facts"]
        forbidden_ok = not r["forbidden"]
        n_recall_ok += recall_ok
        n_fact_ok += fact_ok
        n_forbidden_ok += forbidden_ok
        flag = "" if (recall_ok and fact_ok and forbidden_ok) else "  ← 확인"
        print(f"[{c['id']:<28}] recall={r['recall']:.2f} "
              f"facts={'OK' if fact_ok else '누락'+str(r['missing_facts'])} "
              f"forbidden={'OK' if forbidden_ok else str(r['forbidden'])}{flag}")
        if verbose:
            print(f"    q={r['query']!r}  titles={r['titles']}")
            print(f"    reply={r['reply'][:160]!r}")

    n = len(rag_cases) or 1
    print("\n── 요약(expected_route=rag) ──")
    print(f"  케이스 {len(rag_cases)}개")
    print(f"  Recall@5 통과율   : {n_recall_ok}/{len(rag_cases)} ({n_recall_ok/n*100:.0f}%)")
    print(f"  근거 충실성(사실) : {n_fact_ok}/{len(rag_cases)} ({n_fact_ok/n*100:.0f}%)")
    print(f"  금지 주장 없음    : {n_forbidden_ok}/{len(rag_cases)} ({n_forbidden_ok/n*100:.0f}%)")
    print("  카테고리별 평균 Recall:")
    for cat, vals in sorted(by_cat.items()):
        print(f"    {cat:<12} {sum(vals)/len(vals):.2f}  (n={len(vals)})")
    print("\n  ※ 라우팅 정확도·멀티턴 재작성 반영은 Sprint 2(대화 이해기) 후 확장.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--route", default=None, help="특정 expected_route만(현재 rag만 지원)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    asyncio.run(main(args.route, args.verbose))
