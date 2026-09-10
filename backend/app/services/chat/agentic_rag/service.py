import asyncio
import logging
import time

from app.integrations.langchain_client import classify_model_for, get_chat_model
from app.services.chat.agentic_rag import nodes, retrieval
from app.services.chat.agentic_rag.graph import build_graph

logger = logging.getLogger("chat.agentic_rag")

MAX_SEARCH = 2
MAX_REGEN = 1
TIME_BUDGET_SEC = 20.0


async def agentic_rag_answer(message: str, *, embedder, model=None, judge_model=None,
                             match_count: int = 5, retrieval_query: str | None = None,
                             on_delta=None) -> dict:
    """에이전트형 RAG — 문서채점→교정재검색→근거검증 그래프. rag_answer와 동형 dict 반환.

    검색·KB는 프로덕션과 동일(retrieval.retrieve = rag_service 상수 재사용). 판정 노드는 judge(Haiku),
    생성은 answer_model(Sonnet). 검증 통과분만 on_delta로 방출(센티넬·미검증 노출 0).
    """
    answer_model = model or get_chat_model()
    judge = judge_model or classify_model_for(answer_model)
    meta = {"decomposed": 1}
    deadline = time.monotonic() + TIME_BUDGET_SEC

    def _expired() -> bool:
        return time.monotonic() > deadline

    async def decompose_node(state):
        if _expired():
            return {"sub_queries": [state["initial_query"]]}
        subs = await nodes.decompose_question(state["message"], model=judge)
        # 최초 검색질의(retrieval_query=멀티턴 재작성)가 원문과 다르고 분해가 단일이면 그 질의를 우선.
        if (state.get("initial_query") and state["initial_query"] != state["message"]
                and len(subs) <= 1):
            subs = [state["initial_query"]]
        meta["decomposed"] = len(subs)
        return {"sub_queries": subs}

    async def retrieve_node(state):
        queries = state.get("sub_queries") or [state["initial_query"]]
        results = await asyncio.gather(
            *[retrieval.retrieve(q, embedder=embedder, match_count=match_count) for q in queries])
        merged: dict = {}
        examples: list = []
        for res in results:
            for c in res["chunks"]:
                merged[c["id"]] = c              # id로 중복 제거
            if not examples:
                examples = res["examples"]
        chunks = sorted(merged.values(),
                        key=lambda c: max(c["similarity"], c["keyword_sim"]),
                        reverse=True)[:match_count]
        if not chunks:
            return {"chunks": [], "sources": [], "examples": [], "top_restricted": False,
                    "below_floor": True}
        top_restricted = chunks[0]["is_restricted"]
        below_floor = max(chunks[0]["similarity"], chunks[0]["keyword_sim"]) < 0.30
        sources = [{"chunk_id": c["id"], "title_snapshot": c["title"], "body_snapshot": c["content"],
                    "rank": i, "similarity": float(c["similarity"])} for i, c in enumerate(chunks)]
        return {"chunks": chunks, "sources": sources, "examples": examples,
                "top_restricted": top_restricted, "below_floor": below_floor}

    async def grade_node(state):
        return {"relevant": await nodes.grade_documents(state["message"], state["chunks"], model=judge)}

    async def rewrite_node(state):
        rq = await nodes.rewrite_query(state["message"], state.get("chunks", []), model=judge)
        return {"sub_queries": [rq], "attempts": state.get("attempts", 0) + 1}

    async def generate_node(state):
        return await nodes.generate_answer(state["message"], state.get("chunks", []),
                                           state.get("examples", []), model=answer_model)

    async def verify_node(state):
        return {"grounded": await nodes.verify_grounding(state["draft"], state.get("chunks", []),
                                                         model=judge)}

    async def finalize_node(state):
        if state.get("top_restricted"):
            return {"outcome": {"reply": None, "restricted_block": state["chunks"][0]["content"],
                                "actions": ["직원 연결"], "sources": state.get("sources", [])}}
        sentinel = state.get("sentinel")
        if sentinel == "no_answer":
            return {"outcome": {"no_answer": True}}
        if sentinel == "needs_clarify":
            return {"outcome": {"needs_clarification": True, "reply": state.get("clarify_question")}}
        # 관련 못 찾음(재검색 소진) 또는 근거 부족(재생성 소진) 또는 빈 초안 → no_answer.
        if not state.get("relevant") or state.get("grounded") is False or not state.get("draft"):
            return {"outcome": {"no_answer": True}}
        # 검증 통과 → 이제야 방출(센티넬·미검증 노출 0).
        if on_delta is not None:
            on_delta(state["draft"])
        result = {"reply": state["draft"], "sources": state.get("sources", [])}
        restricted = [c for c in state.get("chunks", []) if c.get("is_restricted")]
        if restricted:
            result["restricted_block"] = restricted[0]["content"]
        return {"outcome": result}

    graph = build_graph(retrieve_node=retrieve_node, decompose_node=decompose_node,
                        grade_node=grade_node, rewrite_node=rewrite_node,
                        generate_node=generate_node, verify_node=verify_node,
                        finalize_node=finalize_node, max_search=MAX_SEARCH, max_regen=MAX_REGEN)
    started = time.monotonic()
    final = await graph.ainvoke({"message": message,
                                 "initial_query": retrieval_query or message,
                                 "attempts": 0, "regen": 0})
    elapsed = time.monotonic() - started
    logger.info(
        "agentic_rag route=rag attempts=%s regen=%s decomposed=%s relevant=%s grounded=%s elapsed=%.2fs",
        final.get("attempts", 0), final.get("regen", 0), meta["decomposed"],
        final.get("relevant"), final.get("grounded"), elapsed)
    return final["outcome"]
