from langgraph.graph import END, START, StateGraph

from app.services.chat.agentic_rag.state import AgenticRagState


def build_graph(*, retrieve_node, decompose_node, grade_node, rewrite_node,
                generate_node, verify_node, finalize_node,
                max_search: int = 2, max_regen: int = 1):
    """노드 콜러블(async (state)->dict)을 받아 에이전트형 RAG 그래프를 조립한다.

    흐름: decompose → retrieve → [제한자료?→finalize] → [floor미만?→grade건너뜀] → grade
      → 관련? generate : (attempts<max_search? rewrite→retrieve : finalize[no_answer])
      → generate → [센티넬?→finalize] → verify
      → 근거? finalize[answer] : (regen<max_regen? bump_regen→generate : finalize[no_answer])

    상한 카운터는 그래프가 관리한다(무한루프 방지): 재검색은 rewrite_node가 attempts를,
    재생성은 내부 bump_regen 노드가 regen을 올린다. finalize_node가 상태를 보고 outcome을 채운다.
    """
    g = StateGraph(AgenticRagState)
    g.add_node("decompose", decompose_node)
    g.add_node("retrieve", retrieve_node)
    g.add_node("grade", grade_node)
    g.add_node("rewrite", rewrite_node)
    g.add_node("generate", generate_node)
    g.add_node("verify", verify_node)
    g.add_node("finalize", finalize_node)

    async def _mark_irrelevant(state):
        # floor 미만 → grade LLM 생략, 관련X로 취급(after_grade 재사용).
        return {"relevant": False}

    async def _bump_regen(state):
        return {"regen": state.get("regen", 0) + 1}

    g.add_node("grade_skip", _mark_irrelevant)
    g.add_node("bump_regen", _bump_regen)

    g.add_edge(START, "decompose")
    g.add_edge("decompose", "retrieve")

    def after_retrieve(state):
        if state.get("top_restricted"):
            return "restricted"        # 제한자료 1위 → LLM 없이 원문 블록
        if state.get("below_floor"):
            return "skip"              # floor 미만 → grade LLM 생략
        return "grade"

    g.add_conditional_edges("retrieve", after_retrieve,
                            {"restricted": "finalize", "grade": "grade", "skip": "grade_skip"})

    def after_grade(state):
        if state.get("relevant"):
            return "generate"
        if state.get("attempts", 0) < max_search:
            return "rewrite"
        return "finalize"              # 재검색 소진 → no_answer(finalize가 판단)

    grade_map = {"generate": "generate", "rewrite": "rewrite", "finalize": "finalize"}
    g.add_conditional_edges("grade", after_grade, grade_map)
    g.add_conditional_edges("grade_skip", after_grade, grade_map)

    g.add_edge("rewrite", "retrieve")

    def after_generate(state):
        if state.get("sentinel"):
            return "finalize"          # NO_ANSWER/NEEDS_CLARIFY → 검증 없이 종료
        return "verify"

    g.add_conditional_edges("generate", after_generate,
                            {"finalize": "finalize", "verify": "verify"})

    def after_verify(state):
        if state.get("grounded"):
            return "finalize"
        if state.get("regen", 0) < max_regen:
            return "regenerate"        # 근거 부족 → regen 올리고 재생성
        return "finalize"              # 소진 → no_answer

    g.add_conditional_edges("verify", after_verify,
                            {"finalize": "finalize", "regenerate": "bump_regen"})
    g.add_edge("bump_regen", "generate")
    g.add_edge("finalize", END)
    return g.compile()
