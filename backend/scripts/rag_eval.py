"""상담봇 검색·답변 품질 평가 러너 (리포트 §4.1 · §2.10 복원).

골든 케이스(evals/chatbot_cases.jsonl)를 실제 파이프라인에 돌려 검색 Recall@k·근거 충실성을
측정한다. 순수 채점은 app/services/chat/eval_scoring.py(단위 테스트 있음), 이 파일은 드라이버.

실행(로컬 DB + OpenAI/Anthropic 키 필요 — API 비용 발생):
    cd backend && .venv/bin/python -m scripts.rag_eval
    .venv/bin/python -m scripts.rag_eval --route rag        # 특정 expected_route만
    .venv/bin/python -m scripts.rag_eval --verbose          # 케이스별 상세
    .venv/bin/python -m scripts.rag_eval --mode llm         # 전면 통합 이해기(A/B: legacy와 비교)

주의:
- 키가 없으면 아무 것도 호출하지 않고 안내만 출력한다(자동 테스트·CI 안전).
- expected_route=="rag" 케이스의 검색/답변 품질을 잰다. 라우팅 정확도(경로가 맞는 갈래로
  갔는가)는 대화 이해기 전면 통합 후 확장한다.
- 멀티턴 재작성 반영(Sprint 2): 이력이 있고 후속 신호가 있으면 프로덕션 chat_flow_service.rag_fn과
  똑같이 conversation_understanding으로 독립형 검색 질의를 만들어 검색에 쓴다(원문은 LLM 질문·채점에).
- no_answer 세분화(Sprint 2): needs_clarification(되묻기)은 정상 흐름이라 recall/근거 집계에서 뺀다.
"""
import argparse
import asyncio
import json
from collections import defaultdict
from pathlib import Path

from app.core.config import settings
from app.integrations.embedding_client import EmbeddingClient
from app.integrations.langchain_client import get_chat_model
from app.services.chat import (rag_service, eval_scoring as sc, conversation_understanding as cu,
                               intent_precheck)

CASES_PATH = Path(__file__).resolve().parent.parent / "evals" / "chatbot_cases.jsonl"


def load_cases() -> list[dict]:
    return [json.loads(line) for line in CASES_PATH.read_text().splitlines() if line.strip()]


def case_message_and_history(case: dict) -> tuple[str, list[str]]:
    # 마지막 턴(=현재 user 질문)을 현재 메시지로, 그 앞의 모든 턴을 시간순 이력으로 나눈다.
    #   프로덕션 chat_flow_service.build_history가 현재 메시지를 뺀 이력을 만드는 것과 동형이라
    #   has_followup_signal·rewrite_standalone에 그대로 물릴 수 있다.
    turns = case["turns"]
    message = turns[-1]["content"]
    history = [t["content"] for t in turns[:-1]]
    return message, history


async def resolve_understanding(mode: str, message: str, history: list[str], model):
    """A/B: 모드별로 검색 질의(재작성)와 검색-전 되묻기를 결정한다. 반환 (retrieval_query|None, needs_clarify).

    - legacy: 프로덕션 chat_flow_service.rag_fn과 동형 — 후속 신호면 rewrite_standalone.
    - llm: conversation_understanding.understand() 1콜 — standalone_query를 검색질의로,
      needs_clarification이면 검색-전 되묻기(검색 안 함). 이해기 실패(None)는 legacy로 폴백(orchestrate 동형).
    """
    # 프로덕션 orchestrate 순서 재현: ①-b intent 프리체크가 진료시간·의사명단을 DB로 답하면
    #   ② 라우팅(classify/understand)·재작성에 도달하지 않는다. 러너도 이를 재현해 intent 케이스가
    #   llm 모드에서만 이해기 되묻기로 빠지는 왜곡(후6 진단)을 없앤다 — 두 모드 모두 이해기 건너뜀.
    if intent_precheck.detect_intent(message):
        return None, False
    if mode == "llm":
        u = await cu.understand(message, history, model=model)
        if u is not None:
            if u.needs_clarification:
                return None, True
            rq = cu.build_search_query(message, u.standalone_query) if u.standalone_query else None
            return rq, False
        # 이해기 실패 → legacy로 폴백(아래 공통 경로)
    if cu.has_followup_signal(message, history):
        standalone = await cu.rewrite_standalone(message, history, model=model)
        return cu.build_search_query(message, standalone), False
    return None, False


async def run_rag_case(case: dict, embedder, model, mode: str = "legacy") -> dict:
    message, history = case_message_and_history(case)
    # 모드별 질문 이해(A/B). 검색-전 되묻기면 검색 없이 되묻기로 집계(프로덕션 llm 모드 동형).
    retrieval_query, pre_clarify = await resolve_understanding(mode, message, history, model)
    if pre_clarify:
        return {
            "query": message, "no_answer": False, "needs_clarification": True,
            "rewritten": False, "recall": 0.0, "missing_facts": [], "forbidden": [],
            "missing_query_terms": [], "titles": [], "reply": "",
        }
    result = await rag_service.rag_answer(message, embedder=embedder, model=model,
                                          retrieval_query=retrieval_query)
    # 검색 질의(재작성됐으면 그것) — expected_query_contains는 실제 검색에 들어간 질의로 채점한다.
    search_query = retrieval_query or message
    titles = [s["title_snapshot"] for s in result.get("sources", [])]
    reply = result.get("reply") or result.get("restricted_block") or ""
    return {
        "query": search_query,
        "no_answer": result.get("no_answer", False),
        "needs_clarification": result.get("needs_clarification", False),
        "rewritten": retrieval_query is not None,
        "recall": sc.recall_at_k(case.get("expected_source_titles", []), titles),
        "missing_facts": sc.missing_facts(reply, case.get("required_facts", [])),
        "forbidden": sc.forbidden_hits(reply, case.get("forbidden_claims", [])),
        "missing_query_terms": sc.missing_query_terms(search_query, case.get("expected_query_contains", [])),
        "titles": titles,
        "reply": reply,
    }


async def main(route_filter: str | None, verbose: bool, mode: str = "legacy") -> None:
    if not settings.openai_api_key or not settings.anthropic_api_key:
        print("⚠️ OPENAI_API_KEY·ANTHROPIC_API_KEY가 필요합니다(로컬 DB도). 키를 넣고 다시 실행하세요.")
        print("   케이스 무결성은 키 없이 `pytest tests/test_rag_eval.py`로 검증됩니다.")
        return

    cases = load_cases()
    embedder = EmbeddingClient(settings.openai_api_key)
    model = get_chat_model()
    print(f"질문 이해 모드: {mode}  (legacy=classify+rewrite / llm=understand 1콜, A/B 비교용)")

    rag_cases = [c for c in cases if c.get("expected_route") == "rag"
                 and (route_filter in (None, "rag"))]
    by_cat = defaultdict(list)
    n_recall_ok = n_fact_ok = n_forbidden_ok = 0
    n_clarify = n_rewritten = 0

    for c in rag_cases:
        r = await run_rag_case(c, embedder, model, mode=mode)
        rw = "↻" if r["rewritten"] else " "        # 재작성 태운 케이스 표시
        n_rewritten += r["rewritten"]
        # needs_clarification(되묻기)은 정상 흐름 → recall/근거 집계에서 뺀다(리포트 §7).
        if not sc.scorable(no_answer=r["no_answer"], needs_clarification=r["needs_clarification"]):
            n_clarify += 1
            print(f"{rw}[{c['id']:<28}] 되묻기(needs_clarification) — 집계 제외")
            if verbose:
                print(f"    q={r['query']!r}")
                print(f"    reply={r['reply'][:160]!r}")
            continue
        by_cat[c.get("category", "-")].append(r["recall"])
        recall_ok = r["recall"] >= 0.999 or not c.get("expected_source_titles")
        fact_ok = not r["missing_facts"]
        forbidden_ok = not r["forbidden"]
        n_recall_ok += recall_ok
        n_fact_ok += fact_ok
        n_forbidden_ok += forbidden_ok
        flag = "" if (recall_ok and fact_ok and forbidden_ok) else "  ← 확인"
        print(f"{rw}[{c['id']:<28}] recall={r['recall']:.2f} "
              f"facts={'OK' if fact_ok else '누락'+str(r['missing_facts'])} "
              f"forbidden={'OK' if forbidden_ok else str(r['forbidden'])}{flag}")
        if verbose:
            print(f"    q={r['query']!r}  titles={r['titles']}")
            print(f"    reply={r['reply'][:160]!r}")

    scored = len(rag_cases) - n_clarify        # 집계 대상 = 되묻기 제외
    n = scored or 1
    print("\n── 요약(expected_route=rag) ──")
    print(f"  케이스 {len(rag_cases)}개 (집계 {scored}개 · 되묻기 {n_clarify}개 제외 · 재작성 태움 {n_rewritten}개)")
    print(f"  Recall@5 통과율   : {n_recall_ok}/{scored} ({n_recall_ok/n*100:.0f}%)")
    print(f"  근거 충실성(사실) : {n_fact_ok}/{scored} ({n_fact_ok/n*100:.0f}%)")
    print(f"  금지 주장 없음    : {n_forbidden_ok}/{scored} ({n_forbidden_ok/n*100:.0f}%)")
    print("  카테고리별 평균 Recall:")
    for cat, vals in sorted(by_cat.items()):
        print(f"    {cat:<12} {sum(vals)/len(vals):.2f}  (n={len(vals)})")
    print("\n  ※ ↻=후속질문 재작성을 태운 케이스. 라우팅 정확도는 대화 이해기 전면 통합 후 확장.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--route", default=None, help="특정 expected_route만(현재 rag만 지원)")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--mode", default="legacy", choices=["legacy", "llm"],
                    help="질문 이해 방식 A/B: legacy(classify+rewrite) | llm(understand 1콜)")
    args = ap.parse_args()
    asyncio.run(main(args.route, args.verbose, mode=args.mode))
