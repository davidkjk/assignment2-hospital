import pytest

from app.services.chat.agentic_rag.graph import build_graph


def _mk_nodes(**overrides):
    # 기본: 관련 있고 근거 충분한 정상 경로. 각 노드는 호출 횟수를 센다.
    calls = {"retrieve": 0, "grade": 0, "rewrite": 0, "generate": 0, "verify": 0, "decompose": 0}

    async def decompose(state):
        calls["decompose"] += 1
        return {"sub_queries": [state["initial_query"]]}

    async def retrieve(state):
        calls["retrieve"] += 1
        return {"chunks": [{"content": "c", "is_restricted": False}], "sources": [],
                "examples": [], "top_restricted": False, "below_floor": False}

    async def grade(state):
        calls["grade"] += 1
        return {"relevant": True}

    async def rewrite(state):
        calls["rewrite"] += 1
        return {"sub_queries": ["rewritten"], "attempts": state.get("attempts", 0) + 1}

    async def generate(state):
        calls["generate"] += 1
        return {"draft": "답입니다", "sentinel": None, "clarify_question": None}

    async def verify(state):
        calls["verify"] += 1
        return {"grounded": True}

    async def finalize(state):
        return {"outcome": {"reply": state.get("draft"), "sources": state.get("sources", [])}}

    nodes = dict(decompose_node=decompose, retrieve_node=retrieve, grade_node=grade,
                 rewrite_node=rewrite, generate_node=generate, verify_node=verify,
                 finalize_node=finalize)
    nodes.update(overrides)
    return nodes, calls


@pytest.mark.asyncio
async def test_happy_path_no_retry_no_regen():
    nodes, calls = _mk_nodes()
    graph = build_graph(**nodes)
    final = await graph.ainvoke({"message": "주차 되나요", "initial_query": "주차",
                                 "attempts": 0, "regen": 0})
    assert final["outcome"]["reply"] == "답입니다"
    assert calls["retrieve"] == 1      # 재검색 없음
    assert calls["rewrite"] == 0
    assert calls["generate"] == 1      # 재생성 없음
    assert calls["verify"] == 1


@pytest.mark.asyncio
async def test_corrective_loop_stops_at_max_search_then_no_answer():
    # grade가 계속 관련X → rewrite로 재검색, 상한(2)에서 멈추고 no_answer로 종료.
    async def grade_no(state):
        return {"relevant": False}

    async def finalize(state):
        if not state.get("relevant") and not state.get("draft"):
            return {"outcome": {"no_answer": True}}
        return {"outcome": {"reply": state.get("draft")}}

    nodes, calls = _mk_nodes(grade_node=grade_no, finalize_node=finalize)
    graph = build_graph(**nodes, max_search=2)
    final = await graph.ainvoke({"message": "x", "initial_query": "x", "attempts": 0, "regen": 0})
    assert final["outcome"] == {"no_answer": True}
    assert calls["retrieve"] == 3      # 최초 1 + 재검색 2
    assert calls["rewrite"] == 2       # 상한
    assert calls["generate"] == 0


@pytest.mark.asyncio
async def test_ungrounded_triggers_single_regenerate_then_no_answer():
    gen_calls = {"n": 0}
    ver_calls = {"n": 0}

    async def generate(state):
        gen_calls["n"] += 1
        return {"draft": f"초안{gen_calls['n']}", "sentinel": None, "clarify_question": None}

    async def verify_fail(state):
        ver_calls["n"] += 1
        return {"grounded": False}

    async def finalize(state):
        if not state.get("grounded"):
            return {"outcome": {"no_answer": True}}
        return {"outcome": {"reply": state.get("draft")}}

    nodes, calls = _mk_nodes(generate_node=generate, verify_node=verify_fail, finalize_node=finalize)
    graph = build_graph(**nodes, max_regen=1)
    final = await graph.ainvoke({"message": "x", "initial_query": "x", "attempts": 0, "regen": 0})
    assert final["outcome"] == {"no_answer": True}
    assert gen_calls["n"] == 2          # 최초 1 + 재생성 1
    assert ver_calls["n"] == 2


@pytest.mark.asyncio
async def test_top_restricted_short_circuits_before_grade():
    async def retrieve_restricted(state):
        return {"chunks": [{"content": "원문", "is_restricted": True}], "sources": [],
                "examples": [], "top_restricted": True, "below_floor": False}

    async def finalize(state):
        if state.get("top_restricted"):
            return {"outcome": {"reply": None, "restricted_block": state["chunks"][0]["content"],
                                "actions": ["직원 연결"], "sources": []}}
        return {"outcome": {}}

    nodes, calls = _mk_nodes(retrieve_node=retrieve_restricted, finalize_node=finalize)
    graph = build_graph(**nodes)
    final = await graph.ainvoke({"message": "보험", "initial_query": "보험", "attempts": 0, "regen": 0})
    assert final["outcome"]["restricted_block"] == "원문"
    assert calls["grade"] == 0 and calls["generate"] == 0
