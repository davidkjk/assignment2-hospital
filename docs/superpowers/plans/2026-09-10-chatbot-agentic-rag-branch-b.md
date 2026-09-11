# 상담봇 브랜치 B — 에이전트형 RAG(LangGraph) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담봇의 rag 갈래 답변 생성을, 문서채점→교정재검색→근거검증→질의분해를 도는 LangGraph 상태그래프로 교체하고(플래그 OFF 기본), 브랜치 A와 A/B 대조 가능하게 만든다.

**Architecture:** 안전 게이트·라우팅은 그래프 밖(orchestrator.py 무수정)에 그대로 두고, `chat_flow_service`의 `rag_fn` 주입 지점 한 곳만 플래그로 분기한다. 그래프 노드는 개별 async 함수(모델 주입 가능)로 짜 각각·전체를 가짜모델/가짜검색으로 단위 테스트한다. 검색·KB는 프로덕션과 동일(리랭커·툴콜·캐시는 범위 밖).

**Tech Stack:** Python 3.13, LangGraph 0.3.34(신규), langchain-anthropic(기존), asyncpg, pytest.

**Spec:** `docs/superpowers/specs/2026-09-10-chatbot-agentic-rag-branch-b-design.md`

## Global Constraints

- 브랜치: `feat/chatbot-branch-b`, 워크트리 `.claude/worktrees/chatbot-branch-b`. 커밋은 이 브랜치에만. base=`0d5fe33`.
- 신규 의존성 **`langgraph==0.3.34`만**. langsmith **도입 X** = 추적 활성화 금지(`LANGCHAIN_TRACING_V2`/`LANGSMITH_*` env 설정·`langsmith` import 금지). 관측은 내부 `logging`만(외부 전송 없음, 요구사항 L410).
- 플래그 `chat_agentic_rag: bool = False`(env `CHAT_AGENTIC_RAG`). 기본 OFF=현행 경로. 켜야 발동, 끄면 즉시 원복.
- 검색은 프로덕션과 **동일**: `HYBRID_FLOOR=0.30`·`CANDIDATE_POOL=12`·`EXAMPLE_*`·`_rank_by_relevance`·`match_kb_chunks_hybrid`(+UndefinedFunctionError 시 순수벡터 폴백). 이 값·SQL은 `rag_service`에서 **import**해 단일출처 유지(수정 금지).
- 안전·불변: `orchestrator.py`·`rag_service.py`·`safety_watchdog.py` **수정 금지**. 그래프는 rag 갈래 이후에만 진입. 제한자료 1위→LLM 없이 원문 블록. 반환 dict는 `rag_answer`와 동형.
- 상한: 교정 재검색 `max_search=2`(검색 총 3회), 재생성 `max_regen=1`, 시간예산 `TIME_BUDGET_SEC=20.0`.
- 모델: 판정 노드(decompose·grade·rewrite·verify)=judge_model(Haiku=`settings.classify_model`, 주입 가짜모델은 그대로), 생성=answer_model(Sonnet=`settings.chat_model`).
- 센티넬 문자열은 `rag_service._NO_ANSWER_SENTINEL`·`_NEEDS_CLARIFY_SENTINEL`, 답변 프롬프트는 `rag_service._ANSWER_SYSTEM_PROMPT`를 import(단일출처).
- 테스트 실행(공용 DB truncate 회피): 순수 테스트는 `--noconftest` + 더미 env로. DB 통합 테스트(`committed_conn`)는 평소 챗봇 회귀 때 함께(실행 후 재시드). venv=메인 `backend/.venv/bin/python`(워크트리엔 없음).
- 커밋: 태스크마다. 메시지 끝에
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01UQLZ3qnYmFPkJeMJgKxnjg`

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `backend/app/services/chat/agentic_rag/__init__.py` | 패키지 |
| `backend/app/services/chat/agentic_rag/state.py` | `AgenticRagState` TypedDict |
| `backend/app/services/chat/agentic_rag/retrieval.py` | `retrieve(query, embedder, match_count)` — rag_service 상수 재사용, DB 검색·재정렬·floor·제한·예시 |
| `backend/app/services/chat/agentic_rag/nodes.py` | 순수 판정/생성 노드 함수: `grade_documents`·`rewrite_query`·`decompose_question`·`generate_answer`·`verify_grounding` |
| `backend/app/services/chat/agentic_rag/graph.py` | `build_graph(...)` — 노드 콜러블을 받아 StateGraph 조립(루프·상한·시간예산) |
| `backend/app/services/chat/agentic_rag/service.py` | `agentic_rag_answer(...)` — 실제 노드 배선·실행·`rag_answer` 동형 dict 반환·loop 지표 로깅 |
| `backend/app/services/chat/chat_flow_service.py` (수정) | `rag_fn` 클로저 플래그 분기 + `settings` import |
| `backend/app/core/config.py` (수정) | `chat_agentic_rag` 플래그 |
| `backend/requirements.txt` (수정) | `langgraph==0.3.34` |
| `backend/tests/test_agentic_rag_nodes.py` | 노드 순수 단위 테스트 |
| `backend/tests/test_agentic_rag_graph.py` | 그래프 루프/상한/분기 순수 테스트(가짜 노드) |
| `backend/tests/test_agentic_rag_service.py` | 배선·반환 계약·DB 통합 |
| `backend/tests/test_agentic_rag_seam.py` | chat_flow_service 플래그 분기 |

---

## Task 0: 의존성 + 플래그 스캐폴딩

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/core/config.py`
- Create: `backend/app/services/chat/agentic_rag/__init__.py`

**Interfaces:**
- Produces: `settings.chat_agentic_rag: bool`(기본 False); `langgraph` import 가능.

- [ ] **Step 1: requirements에 langgraph 추가**

`backend/requirements.txt`의 `langchain-anthropic==0.3.0` 다음 줄에 추가:
```
langgraph==0.3.34
```

- [ ] **Step 2: venv에 설치 (langchain-core 업그레이드 없어야 함)**

Run: `/Users/kimjunkee/dev/vcu/assignment2-hospital/backend/.venv/bin/pip install "langgraph==0.3.34"`
그다음 확인:
Run: `/Users/kimjunkee/dev/vcu/assignment2-hospital/backend/.venv/bin/python -c "import langgraph, langchain_core; print(langchain_core.__version__)"`
Expected: `0.3.63` 출력(업그레이드 안 됨), 예외 없음.

- [ ] **Step 3: config에 플래그 추가**

`backend/app/core/config.py`의 `chat_understanding_mode` 줄 다음에 추가:
```python
    # 브랜치 B(에이전트형 RAG, LangGraph). 기본 OFF=현행 단발 rag_service 경로. 켜면 rag 갈래 답변 생성이
    #   문서채점→교정재검색→근거검증 그래프로. 되돌리기=이 값 false. env=CHAT_AGENTIC_RAG.
    chat_agentic_rag: bool = False
```

- [ ] **Step 4: 패키지 생성**

`backend/app/services/chat/agentic_rag/__init__.py` (빈 파일):
```python
```

- [ ] **Step 5: 확인 + 커밋**

Run: `cd /Users/kimjunkee/dev/vcu/assignment2-hospital/backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -c "from app.core.config import settings; assert settings.chat_agentic_rag is False; print('ok')"`
Expected: `ok`

```bash
git add requirements.txt app/core/config.py app/services/chat/agentic_rag/__init__.py
git commit -m "feat(브랜치B): langgraph 의존성 + CHAT_AGENTIC_RAG 플래그(기본 OFF)"
```

---

## Task 1: 상태 + 그래프 골격(루프/상한/분기, 가짜 노드로 검증)

그래프 배선을 실제 DB/LLM 없이 검증할 수 있게, `build_graph`는 노드 콜러블을 인자로 받는다.

**Files:**
- Create: `backend/app/services/chat/agentic_rag/state.py`
- Create: `backend/app/services/chat/agentic_rag/graph.py`
- Test: `backend/tests/test_agentic_rag_graph.py`

**Interfaces:**
- Produces:
  - `AgenticRagState` (TypedDict, total=False): keys `message,initial_query,sub_queries,chunks,sources,examples,top_restricted,below_floor,relevant,attempts,draft,sentinel,clarify_question,grounded,regen,outcome`.
  - `build_graph(*, retrieve_node, decompose_node, grade_node, rewrite_node, generate_node, verify_node, finalize_node, max_search=2, max_regen=1)` → compiled graph. 각 `*_node`는 `async (state)->dict`(부분 상태 갱신)인 그래프 노드.
- Consumes: langgraph `StateGraph, START, END`.

- [ ] **Step 1: state.py 작성**
```python
from typing import Optional, TypedDict


class AgenticRagState(TypedDict, total=False):
    message: str                 # 환자 원문(화면·LLM 질문·근거)
    initial_query: str           # 최초 검색 질의(retrieval_query or message)
    sub_queries: list[str]       # 현재 검색할 질의들(decompose 산물 / rewrite가 교체)
    chunks: list[dict]           # 검색·병합·재정렬된 청크(관련도순)
    sources: list[dict]          # 근거 스냅샷(record_answer_sources 형식)
    examples: list[dict]         # few-shot 예시
    top_restricted: bool         # 1위가 제한자료
    below_floor: bool            # 1위가 floor 미만(근거 부족)
    relevant: bool               # grade 결과
    attempts: int                # 교정 재검색 횟수
    draft: str                   # generate 산물(버퍼, 미방출)
    sentinel: Optional[str]      # "no_answer" | "needs_clarify" | None
    clarify_question: Optional[str]
    grounded: bool               # verify 결과
    regen: int                   # 재생성 횟수
    outcome: Optional[dict]      # 최종 rag_answer 동형 dict
```

- [ ] **Step 2: 실패 테스트 작성 — 정상 통과 경로**

`backend/tests/test_agentic_rag_graph.py`:
```python
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
        # 실제 서비스는 여기서 outcome을 만든다. 테스트는 상태를 그대로 반영.
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_graph.py -v --noconftest`
Expected: FAIL — `build_graph` 미존재(ImportError).

- [ ] **Step 4: graph.py 구현**
```python
from langgraph.graph import END, START, StateGraph

from app.services.chat.agentic_rag.state import AgenticRagState


def build_graph(*, retrieve_node, decompose_node, grade_node, rewrite_node,
                generate_node, verify_node, finalize_node,
                max_search: int = 2, max_regen: int = 1):
    """노드 콜러블(async (state)->dict)을 받아 에이전트형 RAG 그래프를 조립한다.

    흐름: decompose → retrieve → [제한자료?→finalize] → [floor미만?→grade건너뜀] → grade
      → 관련? generate : (attempts<max_search? rewrite→retrieve : finalize[no_answer])
      → generate → [센티넬?→finalize] → verify
      → 근거? finalize[answer] : (regen<max_regen? generate : finalize[no_answer])
    finalize_node가 state에 outcome을 채운다(서비스가 주입, 상태별 분기 판단).
    """
    g = StateGraph(AgenticRagState)
    g.add_node("decompose", decompose_node)
    g.add_node("retrieve", retrieve_node)
    g.add_node("grade", grade_node)
    g.add_node("rewrite", rewrite_node)
    g.add_node("generate", generate_node)
    g.add_node("verify", verify_node)
    g.add_node("finalize", finalize_node)

    g.add_edge(START, "decompose")
    g.add_edge("decompose", "retrieve")

    def after_retrieve(state):
        if state.get("top_restricted"):
            return "finalize"          # 제한자료 1위 → LLM 없이 원문 블록
        if state.get("below_floor"):
            return "grade_skip"        # floor 미만 → grade LLM 생략, 관련X로 취급
        return "grade"

    g.add_conditional_edges("retrieve", after_retrieve,
                            {"finalize": "finalize", "grade": "grade", "grade_skip": "rewrite_or_end"})

    # grade 노드 뒤 분기와, floor미만(grade 건너뜀) 분기를 하나의 라우터로 합친다.
    def after_grade(state):
        if state.get("relevant"):
            return "generate"
        if state.get("attempts", 0) < max_search:
            return "rewrite"
        return "finalize"              # 재검색 소진 → no_answer(서비스가 sentinel 판단)

    g.add_conditional_edges("grade", after_grade,
                            {"generate": "generate", "rewrite": "rewrite", "finalize": "finalize"})

    # floor 미만일 때 grade를 건너뛰고 곧장 재검색/종료를 정하는 가상 분기.
    #   relevant=False로 세팅된 상태로 after_grade와 동일 판단을 재사용한다.
    async def _mark_irrelevant(state):
        return {"relevant": False}
    g.add_node("rewrite_or_end", _mark_irrelevant)
    g.add_conditional_edges("rewrite_or_end", after_grade,
                            {"generate": "generate", "rewrite": "rewrite", "finalize": "finalize"})

    g.add_edge("rewrite", "retrieve")

    def after_generate(state):
        if state.get("sentinel"):
            return "finalize"          # NO_ANSWER/NEEDS_CLARIFY → 검증 없이 종료(서비스가 매핑)
        return "verify"

    g.add_conditional_edges("generate", after_generate,
                            {"finalize": "finalize", "verify": "verify"})

    def after_verify(state):
        if state.get("grounded"):
            return "finalize"
        if state.get("regen", 0) < max_regen:
            return "generate"          # 근거 부족 → 재생성
        return "finalize"              # 소진 → no_answer

    g.add_conditional_edges("verify", after_verify,
                            {"finalize": "finalize", "generate": "generate"})
    g.add_edge("finalize", END)
    return g.compile()
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_graph.py -v --noconftest`
Expected: PASS

- [ ] **Step 6: 루프/상한/재생성 분기 테스트 추가**

같은 파일에 추가:
```python
@pytest.mark.asyncio
async def test_corrective_loop_stops_at_max_search_then_no_answer():
    # grade가 계속 관련X → rewrite로 재검색, 상한(2)에서 멈추고 no_answer로 종료.
    async def grade_no(state):
        return {"relevant": False}

    async def finalize(state):
        # 관련 못 찾고 온 경우 outcome=no_answer.
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

    async def generate(state):
        gen_calls["n"] += 1
        return {"draft": f"초안{gen_calls['n']}", "sentinel": None, "clarify_question": None}

    async def verify_fail(state):
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
    assert calls["verify"] == 2


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
```

Note (재생성 시 regen 증가): 재생성 경로에서 `regen`이 늘어나야 상한이 걸린다. `verify` 노드가 근거 부족을 반환할 때 서비스의 실제 verify_node가 `regen`을 올리지 않으므로, 재생성 카운트는 **generate 진입 시** 올린다 — 실제 generate_node(Task 7 배선, service.py)가 `regen`을 관리한다. 위 테스트의 가짜 generate는 gen 호출수로 검증하므로 무관.

- [ ] **Step 7: 추가 테스트 통과 확인 + 커밋**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_graph.py -v --noconftest`
Expected: PASS (4 tests)

```bash
git add app/services/chat/agentic_rag/state.py app/services/chat/agentic_rag/graph.py tests/test_agentic_rag_graph.py
git commit -m "feat(브랜치B): 에이전트 RAG 그래프 골격 — 교정루프·상한·재생성·제한자료 분기(가짜노드 검증)"
```

---

## Task 2: grade 노드 (문서 채점, LLM 구조화 판정)

**Files:**
- Create: `backend/app/services/chat/agentic_rag/nodes.py`
- Test: `backend/tests/test_agentic_rag_nodes.py`

**Interfaces:**
- Produces: `async grade_documents(message: str, chunks: list[dict], *, model) -> bool` — chunks가 message에 관련·충분하면 True.

- [ ] **Step 1: 실패 테스트**

`backend/tests/test_agentic_rag_nodes.py`:
```python
import pytest

from app.services.chat.agentic_rag import nodes


class _Model:
    def __init__(self, content): self._c = content
    async def ainvoke(self, msgs):
        self.msgs = msgs
        class R: pass
        r = R(); r.content = self._c
        return r


@pytest.mark.asyncio
async def test_grade_true_when_model_says_relevant():
    out = await nodes.grade_documents("주차 되나요", [{"content": "지하 주차 가능"}], model=_Model("RELEVANT"))
    assert out is True


@pytest.mark.asyncio
async def test_grade_false_when_model_says_not_relevant():
    out = await nodes.grade_documents("주차 되나요", [{"content": "입원 생활 안내"}], model=_Model("NO"))
    assert out is False


@pytest.mark.asyncio
async def test_grade_prompt_includes_question_and_docs():
    m = _Model("RELEVANT")
    await nodes.grade_documents("CT 금식", [{"content": "CT 6시간 금식"}], model=m)
    text = " ".join(getattr(x, "content", str(x)) for x in m.msgs)
    assert "CT 금식" in text and "CT 6시간 금식" in text
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py -v --noconftest`
Expected: FAIL — `grade_documents` 미존재.

- [ ] **Step 3: 구현 (nodes.py 새 파일, grade 부분)**
```python
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import resp_text

_GRADE_SYSTEM = (
    "당신은 병원 상담 검색 채점기입니다. 아래 <자료>가 <질문>에 답하기에 관련 있고 충분한지 판정하세요. "
    "관련·충분하면 정확히 'RELEVANT', 아니면 정확히 'NO'만 출력합니다. 다른 말은 쓰지 마세요.\n"
    "<질문>\n{q}\n</질문>\n<자료>\n{docs}\n</자료>"
)


def _join_docs(chunks: list[dict]) -> str:
    return "\n\n".join(c.get("content", "") for c in chunks) or "(자료 없음)"


async def grade_documents(message: str, chunks: list[dict], *, model) -> bool:
    prompt = ChatPromptTemplate.from_messages([("system", _GRADE_SYSTEM), ("human", "{q}")])
    resp = await model.ainvoke(prompt.format_messages(q=message, docs=_join_docs(chunks)))
    return "RELEVANT" in resp_text(resp).upper()
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py -v --noconftest`
Expected: PASS

- [ ] **Step 5: 커밋**
```bash
git add app/services/chat/agentic_rag/nodes.py tests/test_agentic_rag_nodes.py
git commit -m "feat(브랜치B): grade 노드 — 검색 자료 관련성 채점(RELEVANT/NO)"
```

---

## Task 3: rewrite 노드 (교정 질의 재작성)

**Files:**
- Modify: `backend/app/services/chat/agentic_rag/nodes.py`
- Test: `backend/tests/test_agentic_rag_nodes.py`

**Interfaces:**
- Produces: `async rewrite_query(message: str, chunks: list[dict], *, model) -> str` — 검색용 재작성 질의(빈/실패 시 message 폴백).

- [ ] **Step 1: 실패 테스트 추가**
```python
@pytest.mark.asyncio
async def test_rewrite_returns_model_query():
    out = await nodes.rewrite_query("CT 물", [{"content": "무관"}], model=_Model("CT 조영제 검사 금식 준비"))
    assert out == "CT 조영제 검사 금식 준비"


@pytest.mark.asyncio
async def test_rewrite_falls_back_to_original_when_blank():
    out = await nodes.rewrite_query("CT 물", [], model=_Model("   "))
    assert out == "CT 물"
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py -k rewrite -v --noconftest`
Expected: FAIL

- [ ] **Step 3: 구현 (nodes.py 추가)**
```python
_REWRITE_SYSTEM = (
    "환자의 <질문>으로 검색했지만 병원 자료를 못 찾았습니다. 검색이 더 잘 되도록 질의를 한 줄로 다시 쓰세요. "
    "동의어·정확한 용어·구체적 표현을 쓰되(예: '씨티'→'CT 조영제 검사'), 새 정보를 지어내지 마세요. "
    "검색 질의 한 줄만 출력하고 다른 말은 쓰지 마세요.\n<질문>\n{q}\n</질문>"
)


async def rewrite_query(message: str, chunks: list[dict], *, model) -> str:
    prompt = ChatPromptTemplate.from_messages([("system", _REWRITE_SYSTEM), ("human", "{q}")])
    resp = await model.ainvoke(prompt.format_messages(q=message))
    rewritten = resp_text(resp).strip()
    return rewritten or message
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py -k rewrite -v --noconftest`
Expected: PASS
```bash
git add app/services/chat/agentic_rag/nodes.py tests/test_agentic_rag_nodes.py
git commit -m "feat(브랜치B): rewrite 노드 — 검색 실패 시 교정 질의 재작성(실패 폴백)"
```

---

## Task 4: decompose 노드 (질의 분해)

**Files:**
- Modify: `backend/app/services/chat/agentic_rag/nodes.py`
- Test: `backend/tests/test_agentic_rag_nodes.py`

**Interfaces:**
- Produces: `async decompose_question(message: str, *, model) -> list[str]` — 복합이면 하위 질의 여러 개, 아니면 `[message]`. 실패/빈 결과는 `[message]`.

- [ ] **Step 1: 실패 테스트 추가**
```python
@pytest.mark.asyncio
async def test_decompose_splits_compound():
    out = await nodes.decompose_question("주차랑 면회시간 알려줘", model=_Model("주차 안내\n면회 시간"))
    assert out == ["주차 안내", "면회 시간"]


@pytest.mark.asyncio
async def test_decompose_single_returns_original():
    out = await nodes.decompose_question("주차 되나요", model=_Model("주차 되나요"))
    assert out == ["주차 되나요"]


@pytest.mark.asyncio
async def test_decompose_blank_falls_back_to_original():
    out = await nodes.decompose_question("주차 되나요", model=_Model("  "))
    assert out == ["주차 되나요"]
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py -k decompose -v --noconftest`
Expected: FAIL

- [ ] **Step 3: 구현 (nodes.py 추가)**
```python
_DECOMPOSE_SYSTEM = (
    "환자의 <질문>에 서로 다른 사실 질문이 둘 이상 들어 있으면, 각 질문을 검색용 한 줄로 나눠 줄바꿈으로 출력하세요. "
    "질문이 하나뿐이면 원문 한 줄만 출력하세요. 새 질문을 지어내지 말고, 설명·번호·기호 없이 질의 줄만 출력합니다.\n"
    "<질문>\n{q}\n</질문>"
)


async def decompose_question(message: str, *, model) -> list[str]:
    prompt = ChatPromptTemplate.from_messages([("system", _DECOMPOSE_SYSTEM), ("human", "{q}")])
    resp = await model.ainvoke(prompt.format_messages(q=message))
    lines = [ln.strip() for ln in resp_text(resp).splitlines() if ln.strip()]
    return lines or [message]
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py -k decompose -v --noconftest`
Expected: PASS
```bash
git add app/services/chat/agentic_rag/nodes.py tests/test_agentic_rag_nodes.py
git commit -m "feat(브랜치B): decompose 노드 — 복합 질문 하위 질의 분해(단일/실패는 원문)"
```

---

## Task 5: verify 노드 (근거 검증, Self-RAG)

**Files:**
- Modify: `backend/app/services/chat/agentic_rag/nodes.py`
- Test: `backend/tests/test_agentic_rag_nodes.py`

**Interfaces:**
- Produces: `async verify_grounding(draft: str, chunks: list[dict], *, model) -> bool` — draft가 chunks로 뒷받침되면 True.

- [ ] **Step 1: 실패 테스트 추가**
```python
@pytest.mark.asyncio
async def test_verify_true_when_grounded():
    out = await nodes.verify_grounding("지하 주차 가능합니다", [{"content": "지하 주차 가능"}], model=_Model("GROUNDED"))
    assert out is True


@pytest.mark.asyncio
async def test_verify_false_when_unsupported():
    out = await nodes.verify_grounding("옥상 주차 가능합니다", [{"content": "지하 주차 가능"}], model=_Model("NO"))
    assert out is False


@pytest.mark.asyncio
async def test_verify_prompt_includes_draft_and_docs():
    m = _Model("GROUNDED")
    await nodes.verify_grounding("답 초안X", [{"content": "근거Y"}], model=m)
    text = " ".join(getattr(x, "content", str(x)) for x in m.msgs)
    assert "답 초안X" in text and "근거Y" in text
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py -k verify -v --noconftest`
Expected: FAIL

- [ ] **Step 3: 구현 (nodes.py 추가)**
```python
_VERIFY_SYSTEM = (
    "당신은 병원 상담 답변 검증기입니다. <답변초안>의 사실 주장이 모두 <자료>로 뒷받침되는지 판정하세요. "
    "자료에 없는 사실을 지어냈으면 'NO', 모두 자료에 근거하면 'GROUNDED'만 정확히 출력합니다. 다른 말은 쓰지 마세요.\n"
    "<답변초안>\n{draft}\n</답변초안>\n<자료>\n{docs}\n</자료>"
)


async def verify_grounding(draft: str, chunks: list[dict], *, model) -> bool:
    prompt = ChatPromptTemplate.from_messages([("system", _VERIFY_SYSTEM), ("human", "검증")])
    resp = await model.ainvoke(prompt.format_messages(draft=draft, docs=_join_docs(chunks)))
    return "GROUNDED" in resp_text(resp).upper()
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py -k verify -v --noconftest`
Expected: PASS
```bash
git add app/services/chat/agentic_rag/nodes.py tests/test_agentic_rag_nodes.py
git commit -m "feat(브랜치B): verify 노드 — 답 초안 근거검증(GROUNDED/NO)"
```

---

## Task 6: generate 노드 (버퍼 생성 + 센티넬 판정)

브랜치 B는 검증 전 방출하지 않으므로 generate는 **버퍼(ainvoke)**로 만들고 센티넬만 판정한다(방출은 finalize).

**Files:**
- Modify: `backend/app/services/chat/agentic_rag/nodes.py`
- Test: `backend/tests/test_agentic_rag_nodes.py`

**Interfaces:**
- Produces: `async generate_answer(message: str, chunks: list[dict], examples: list[dict], *, model) -> dict` → `{"draft": str, "sentinel": "no_answer"|"needs_clarify"|None, "clarify_question": str|None}`. 제한자료가 아닌 일반 청크만 근거로 쓴다.

- [ ] **Step 1: 실패 테스트 추가**
```python
@pytest.mark.asyncio
async def test_generate_returns_draft_when_answered():
    out = await nodes.generate_answer("주차 되나요", [{"content": "지하 주차 가능", "is_restricted": False}],
                                      [], model=_Model("지하에 주차하실 수 있습니다."))
    assert out["draft"] == "지하에 주차하실 수 있습니다."
    assert out["sentinel"] is None


@pytest.mark.asyncio
async def test_generate_detects_no_answer_sentinel_anywhere():
    out = await nodes.generate_answer("CT 준비물", [{"content": "주차 안내", "is_restricted": False}],
                                      [], model=_Model("자료에 없습니다.\n\nNO_ANSWER"))
    assert out["sentinel"] == "no_answer"


@pytest.mark.asyncio
async def test_generate_detects_needs_clarify_and_strips_sentinel():
    out = await nodes.generate_answer("준비물이요?", [{"content": "검사별로 다름", "is_restricted": False}],
                                      [], model=_Model("NEEDS_CLARIFY: 어떤 검사를 말씀하시나요?"))
    assert out["sentinel"] == "needs_clarify"
    assert out["clarify_question"] == "어떤 검사를 말씀하시나요?"


@pytest.mark.asyncio
async def test_generate_no_answer_takes_priority_over_clarify():
    out = await nodes.generate_answer("x", [{"content": "y", "is_restricted": False}],
                                      [], model=_Model("NEEDS_CLARIFY: 뭐요?\nNO_ANSWER"))
    assert out["sentinel"] == "no_answer"


@pytest.mark.asyncio
async def test_generate_prompt_carries_persona_grounding_and_examples():
    m = _Model("답")
    await nodes.generate_answer("주차 되나요", [{"content": "지하 주차", "is_restricted": False}],
                                [{"question": "주차 어디", "answer": "지하 2층"}], model=m)
    text = " ".join(getattr(x, "content", str(x)) for x in m.msgs)
    assert "가온병원" in text and "지어내" in text and "NO_ANSWER" in text
    assert "주차 어디" in text and "지하 2층" in text
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py -k generate -v --noconftest`
Expected: FAIL

- [ ] **Step 3: 구현 (nodes.py 추가 — rag_service 프롬프트·센티넬 재사용)**
```python
from app.services.chat.rag_service import (_ANSWER_SYSTEM_PROMPT, _NEEDS_CLARIFY_SENTINEL,
                                           _NO_ANSWER_SENTINEL)


async def generate_answer(message: str, chunks: list[dict], examples: list[dict], *, model) -> dict:
    # 제한자료가 아닌 일반 청크만 근거(제한자료 1위는 그래프가 앞서 finalize로 뺌 — 여기 안 옴).
    normal = [c for c in chunks if not c.get("is_restricted")]
    context = "\n\n".join(c.get("content", "") for c in normal)
    messages = [("system", _ANSWER_SYSTEM_PROMPT)]
    fmt = {"context": context, "q": message}
    if examples:
        few_shot = "\n\n".join(f"질문: {e['question']}\n답변: {e['answer']}" for e in examples)
        messages.append(("system",
                         "아래는 비슷한 질문에 직원이 검토·교정한 모범 답변입니다. 어투와 정확도의 참고로만 쓰고, "
                         "실제 답은 위 병원 자료를 근거로 하세요.\n{examples}"))
        fmt["examples"] = few_shot
    messages.append(("human", "{q}"))
    prompt = ChatPromptTemplate.from_messages(messages)
    resp = await model.ainvoke(prompt.format_messages(**fmt))
    reply = resp_text(resp).strip()
    if _NO_ANSWER_SENTINEL in reply:                         # 근거 부재가 되묻기보다 우선(안전)
        return {"draft": "", "sentinel": "no_answer", "clarify_question": None}
    if _NEEDS_CLARIFY_SENTINEL in reply:
        q = reply.split(_NEEDS_CLARIFY_SENTINEL, 1)[1].lstrip(":：").strip()
        if not q:
            return {"draft": "", "sentinel": "no_answer", "clarify_question": None}
        return {"draft": "", "sentinel": "needs_clarify", "clarify_question": q}
    return {"draft": reply, "sentinel": None, "clarify_question": None}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py -k generate -v --noconftest`
Expected: PASS
```bash
git add app/services/chat/agentic_rag/nodes.py tests/test_agentic_rag_nodes.py
git commit -m "feat(브랜치B): generate 노드 — 버퍼 생성 + 센티넬 판정(방출 전, rag_service 프롬프트 재사용)"
```

---

## Task 7: retrieve 노드 (DB 검색, rag_service 상수 재사용)

**Files:**
- Create: `backend/app/services/chat/agentic_rag/retrieval.py`
- Test: `backend/tests/test_agentic_rag_service.py` (DB 통합 — `committed_conn`)

**Interfaces:**
- Produces: `async retrieve(query: str, *, embedder, match_count: int = 5) -> dict` →
  `{"chunks": list[dict], "sources": list[dict], "examples": list[dict], "top_restricted": bool, "below_floor": bool}`.
  chunks는 관련도 재정렬 후 상위 match_count. sources는 `record_answer_sources` 형식. rag_service와 **동일** 검색·재정렬·floor.

- [ ] **Step 1: 실패 테스트 (DB)**

`backend/tests/test_agentic_rag_service.py`:
```python
import pytest

from app.services.chat.agentic_rag import retrieval
from tests.conftest import seed_staff
from tests.conftest_chat import FakeEmbedder


class _Fixed:
    async def embed(self, texts): return [[1.0] + [0.0] * 1535 for _ in texts]


@pytest.mark.asyncio
async def test_retrieve_returns_chunks_and_floor_flags(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    vec = "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]"
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('주차 안내','지하에 주차할 수 있습니다.','approved',false) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'지하에 주차할 수 있습니다.',$2::vector)", doc, vec)
    out = await retrieval.retrieve("주차 되나요", embedder=_Fixed())
    assert out["below_floor"] is False
    assert out["top_restricted"] is False
    assert out["chunks"] and out["chunks"][0]["content"] == "지하에 주차할 수 있습니다."
    assert out["sources"] and "title_snapshot" in out["sources"][0]
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_retrieve_empty_kb_is_below_floor():
    out = await retrieval.retrieve("아무거나", embedder=FakeEmbedder())
    assert out["below_floor"] is True


@pytest.mark.asyncio
async def test_retrieve_flags_top_restricted(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    vec = "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]"
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('보험','보험은 직원 문의','approved',true) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'보험은 직원 문의',$2::vector)", doc, vec)
    out = await retrieval.retrieve("보험 되나요", embedder=_Fixed())
    assert out["top_restricted"] is True
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])
```

- [ ] **Step 2: 실패 확인 (DB — 평소 conftest 사용)**

⚠️ 이 테스트는 공용 DB를 쓴다(`committed_conn`). 실행 전 `supabase status` 확인, 실행 후 재시드 필요(`cd frontend && npm run seed:demo`). 다른 세션이 DB 쓰는 중이면 실행하지 말 것.
Run: `cd backend && .venv/bin/python -m pytest tests/test_agentic_rag_service.py -k retrieve -v`
Expected: FAIL — `retrieval.retrieve` 미존재.

- [ ] **Step 3: 구현 (retrieval.py — rag_service 상수 import, 로직 동일)**
```python
import asyncpg

from app.db.pool import get_pool
from app.services.chat.query_normalizer import normalize_query
from app.services.chat.rag_service import (CANDIDATE_POOL, EXAMPLE_MATCH_COUNT,
                                           EXAMPLE_SIMILARITY_THRESHOLD, HYBRID_FLOOR,
                                           _rank_by_relevance)


async def retrieve(query: str, *, embedder, match_count: int = 5) -> dict:
    # rag_service.rag_answer의 검색부와 동일(단일출처=import한 상수·함수). A/B에서 검색을 동일하게 유지.
    search_query = normalize_query(query)
    qvec = (await embedder.embed([search_query]))[0]
    vec = "[" + ",".join(map(str, qvec)) + "]"
    pool = await get_pool()
    pool_n = max(match_count, CANDIDATE_POOL)
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch(
                "select * from match_kb_chunks_hybrid($1::vector, $2, $3)", vec, search_query, pool_n)
            chunks = [dict(r) for r in rows]
        except asyncpg.UndefinedFunctionError:
            rows = await conn.fetch("select * from match_kb_chunks($1::vector, $2)", vec, pool_n)
            chunks = [dict(r) | {"keyword_sim": 0.0} for r in rows]
        chunks = _rank_by_relevance(chunks)[:match_count]
        example_rows = await conn.fetch(
            "select question, answer, 1 - (embedding <=> $1::vector) as similarity "
            "from public.qa_example_bank where is_active "
            "order by embedding <=> $1::vector limit $2", vec, EXAMPLE_MATCH_COUNT)
    examples = [dict(e) for e in example_rows if e["similarity"] >= EXAMPLE_SIMILARITY_THRESHOLD]
    below_floor = (not chunks) or max(chunks[0]["similarity"], chunks[0]["keyword_sim"]) < HYBRID_FLOOR
    top_restricted = bool(chunks) and chunks[0]["is_restricted"]
    sources = [{"chunk_id": c["id"], "title_snapshot": c["title"], "body_snapshot": c["content"],
                "rank": i, "similarity": float(c["similarity"])} for i, c in enumerate(chunks)]
    return {"chunks": chunks, "sources": sources, "examples": examples,
            "top_restricted": top_restricted, "below_floor": below_floor}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && .venv/bin/python -m pytest tests/test_agentic_rag_service.py -k retrieve -v`
Expected: PASS. (실행 후 재시드 잊지 말 것.)

- [ ] **Step 5: 커밋**
```bash
git add app/services/chat/agentic_rag/retrieval.py tests/test_agentic_rag_service.py
git commit -m "feat(브랜치B): retrieve 노드 — rag_service 상수·SQL 동일 재사용(검색 A/B 동형)"
```

---

## Task 8: service.py — 실제 노드 배선 + 병렬검색 + 반환 계약 + 지표 로깅

**Files:**
- Create: `backend/app/services/chat/agentic_rag/service.py`
- Test: `backend/tests/test_agentic_rag_service.py`

**Interfaces:**
- Consumes: `retrieval.retrieve`, `nodes.*`, `graph.build_graph`.
- Produces: `async agentic_rag_answer(message, *, embedder, model=None, judge_model=None, match_count=5, retrieval_query=None, on_delta=None) -> dict` — `rag_answer`와 동형 반환.

- [ ] **Step 1: 실패 테스트 (순수 — 가짜 retrieve/judge/answer 주입 경로)**

service.py는 실제 노드를 배선하되, 테스트를 위해 `retrieve_fn`/모델을 주입 가능하게 만든다.
```python
from app.services.chat.agentic_rag import service


class _AnswerModel:
    def __init__(self, content): self._c = content
    async def ainvoke(self, msgs):
        class R: pass
        r = R(); r.content = self._c
        return r


class _ScriptedJudge:
    # 프롬프트 내용으로 어느 판정 노드인지 구분해 응답(grade/rewrite/verify/decompose 공용).
    async def ainvoke(self, msgs):
        text = " ".join(getattr(m, "content", str(m)) for m in msgs)
        class R: pass
        r = R()
        if "채점기" in text:      r.content = "RELEVANT"
        elif "검증기" in text:    r.content = "GROUNDED"
        elif "다시 쓰" in text:   r.content = "재작성"
        else:                      r.content = "단일"      # decompose: 원문 1개
        return r


@pytest.mark.asyncio
async def test_service_happy_path_returns_reply(monkeypatch):
    async def fake_retrieve(query, *, embedder, match_count=5):
        return {"chunks": [{"id": "c1", "title": "주차", "content": "지하 주차 가능",
                            "is_restricted": False, "similarity": 0.9, "keyword_sim": 0.0}],
                "sources": [{"chunk_id": "c1", "title_snapshot": "주차", "body_snapshot": "지하 주차 가능",
                             "rank": 0, "similarity": 0.9}],
                "examples": [], "top_restricted": False, "below_floor": False}
    monkeypatch.setattr(service.retrieval, "retrieve", fake_retrieve)
    emitted = []
    out = await service.agentic_rag_answer(
        "주차 되나요", embedder=object(), model=_AnswerModel("지하에 주차하실 수 있습니다."),
        judge_model=_ScriptedJudge(), on_delta=emitted.append)
    assert out["reply"] == "지하에 주차하실 수 있습니다."
    assert out["sources"][0]["chunk_id"] == "c1"
    assert "".join(emitted) == "지하에 주차하실 수 있습니다."   # finalize에서 검증 후 방출


@pytest.mark.asyncio
async def test_service_below_floor_all_retries_returns_no_answer(monkeypatch):
    async def fake_retrieve(query, *, embedder, match_count=5):
        return {"chunks": [], "sources": [], "examples": [],
                "top_restricted": False, "below_floor": True}
    monkeypatch.setattr(service.retrieval, "retrieve", fake_retrieve)
    emitted = []
    out = await service.agentic_rag_answer(
        "없는질문", embedder=object(), model=_AnswerModel("답"),
        judge_model=_ScriptedJudge(), on_delta=emitted.append)
    assert out.get("no_answer") is True
    assert emitted == []                     # 방출 없음(센티넬·초안 노출 0)


@pytest.mark.asyncio
async def test_service_top_restricted_returns_verbatim(monkeypatch):
    async def fake_retrieve(query, *, embedder, match_count=5):
        return {"chunks": [{"id": "r1", "title": "보험", "content": "보험은 직원 문의",
                            "is_restricted": True, "similarity": 0.9, "keyword_sim": 0.0}],
                "sources": [{"chunk_id": "r1", "title_snapshot": "보험", "body_snapshot": "보험은 직원 문의",
                             "rank": 0, "similarity": 0.9}],
                "examples": [], "top_restricted": True, "below_floor": False}
    monkeypatch.setattr(service.retrieval, "retrieve", fake_retrieve)
    out = await service.agentic_rag_answer(
        "보험", embedder=object(), model=_AnswerModel("무시"), judge_model=_ScriptedJudge())
    assert out["reply"] is None
    assert out["restricted_block"] == "보험은 직원 문의"
    assert "직원 연결" in out["actions"]


@pytest.mark.asyncio
async def test_service_needs_clarify_returns_clarification(monkeypatch):
    async def fake_retrieve(query, *, embedder, match_count=5):
        return {"chunks": [{"id": "c1", "title": "검사", "content": "검사별로 다름",
                            "is_restricted": False, "similarity": 0.9, "keyword_sim": 0.0}],
                "sources": [], "examples": [], "top_restricted": False, "below_floor": False}
    monkeypatch.setattr(service.retrieval, "retrieve", fake_retrieve)
    out = await service.agentic_rag_answer(
        "준비물이요?", embedder=object(), model=_AnswerModel("NEEDS_CLARIFY: 어떤 검사요?"),
        judge_model=_ScriptedJudge())
    assert out.get("needs_clarification") is True
    assert out["reply"] == "어떤 검사요?"
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_service.py -k "service_" -v --noconftest`
Expected: FAIL — `agentic_rag_answer` 미존재.

- [ ] **Step 3: 구현 (service.py)**
```python
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
    answer_model = model or get_chat_model()
    judge = judge_model or classify_model_for(answer_model)
    metrics = {"attempts": 0, "regen": 0, "decomposed": 1, "grounded": None, "relevant": None}
    deadline = time.monotonic() + TIME_BUDGET_SEC

    async def decompose_node(state):
        if time.monotonic() > deadline:
            return {"sub_queries": [state["initial_query"]]}
        subs = await nodes.decompose_question(state["message"], model=judge)
        # decompose는 원문 기준이지만 최초 검색질의(retrieval_query)가 따로 오면 그것을 1개로 우선.
        if state.get("initial_query") and state["initial_query"] != state["message"] and len(subs) <= 1:
            subs = [state["initial_query"]]
        metrics["decomposed"] = len(subs)
        return {"sub_queries": subs, "attempts": 0, "regen": 0}

    async def retrieve_node(state):
        queries = state.get("sub_queries") or [state["initial_query"]]
        results = await asyncio.gather(
            *[retrieval.retrieve(q, embedder=embedder, match_count=match_count) for q in queries])
        merged: dict = {}
        examples: list = []
        for res in results:
            for c in res["chunks"]:
                merged[c["id"]] = c              # id로 중복 제거
            examples = examples or res["examples"]
        chunks = sorted(merged.values(),
                        key=lambda c: max(c["similarity"], c["keyword_sim"]), reverse=True)[:match_count]
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
        rel = await nodes.grade_documents(state["message"], state["chunks"], model=judge)
        metrics["relevant"] = rel
        return {"relevant": rel}

    async def rewrite_node(state):
        rq = await nodes.rewrite_query(state["message"], state.get("chunks", []), model=judge)
        metrics["attempts"] = state.get("attempts", 0) + 1
        return {"sub_queries": [rq], "attempts": state.get("attempts", 0) + 1}

    async def generate_node(state):
        out = await nodes.generate_answer(state["message"], state.get("chunks", []),
                                          state.get("examples", []), model=answer_model)
        # 재생성이면 regen 증가(상한 판단은 그래프 after_verify가 regen으로).
        regen = state.get("regen", 0)
        if state.get("draft") is not None and state.get("grounded") is False:
            regen += 1
            metrics["regen"] = regen
        return {**out, "regen": regen}

    async def verify_node(state):
        g = await nodes.verify_grounding(state["draft"], state.get("chunks", []), model=judge)
        metrics["grounded"] = g
        return {"grounded": g}

    async def finalize_node(state):
        # 상태를 보고 rag_answer 동형 dict를 만든다.
        if state.get("top_restricted"):
            return {"outcome": {"reply": None, "restricted_block": state["chunks"][0]["content"],
                                "actions": ["직원 연결"], "sources": state.get("sources", [])}}
        sentinel = state.get("sentinel")
        if sentinel == "no_answer":
            return {"outcome": {"no_answer": True}}
        if sentinel == "needs_clarify":
            return {"outcome": {"needs_clarification": True, "reply": state.get("clarify_question")}}
        # 관련 못 찾음(재검색 소진) 또는 근거 부족(재생성 소진) → no_answer.
        if not state.get("relevant") or state.get("grounded") is False or not state.get("draft"):
            return {"outcome": {"no_answer": True}}
        # 검증 통과 → 이제야 방출(센티넬·미검증 노출 0).
        if on_delta is not None and state.get("draft"):
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
    logger.info("agentic_rag route=rag attempts=%s regen=%s decomposed=%s relevant=%s grounded=%s elapsed=%.2fs",
                metrics["attempts"], metrics["regen"], metrics["decomposed"],
                metrics["relevant"], metrics["grounded"], elapsed)
    return final["outcome"]
```

⚠️ 구현 노트: `generate_node`의 재생성 감지는 "이전에 draft가 있었고 grounded=False"로 판단한다. 그래프 `after_verify`가 재생성 경로로 보낼 때 상태에 `grounded=False`·직전 `draft`가 남아 있어야 한다(LangGraph는 노드 반환분만 병합하므로 두 값 모두 상태에 유지됨). 첫 generate는 `draft` 미존재 → regen 0 유지.

- [ ] **Step 4: 통과 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_service.py -k "service_" -v --noconftest`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**
```bash
git add app/services/chat/agentic_rag/service.py tests/test_agentic_rag_service.py
git commit -m "feat(브랜치B): agentic_rag_answer 배선 — 병렬검색·루프·반환계약·지표 로깅"
```

---

## Task 9: chat_flow_service seam (플래그 분기)

**Files:**
- Modify: `backend/app/services/chat/chat_flow_service.py`
- Test: `backend/tests/test_agentic_rag_seam.py`

**Interfaces:**
- Consumes: `settings.chat_agentic_rag`, `agentic_rag_service.agentic_rag_answer`.

- [ ] **Step 1: 실패 테스트 (플래그로 분기되는지 — monkeypatch)**

`backend/tests/test_agentic_rag_seam.py`:
```python
import pytest

from app.services.chat import chat_flow_service


@pytest.mark.asyncio
async def test_rag_fn_uses_agentic_when_flag_on(monkeypatch):
    monkeypatch.setattr(chat_flow_service.settings, "chat_agentic_rag", True)
    called = {}

    async def fake_agentic(message, **kw):
        called["agentic"] = True
        called["judge_model"] = kw.get("judge_model")
        return {"reply": "agentic"}

    async def fake_legacy(*a, **kw):
        called["legacy"] = True
        return {"reply": "legacy"}

    monkeypatch.setattr(chat_flow_service.agentic_rag_service, "agentic_rag_answer", fake_agentic)
    monkeypatch.setattr(chat_flow_service.rag_service, "rag_answer", fake_legacy)

    rag_fn = chat_flow_service._build_rag_fn(
        embedder=object(), model=object(), classify_model=object(), history_texts=[], on_delta=None)
    out = await rag_fn(None, "주차 되나요", retrieval_query="주차")
    assert out == {"reply": "agentic"}
    assert called.get("agentic") and not called.get("legacy")
    assert called["judge_model"] is not None


@pytest.mark.asyncio
async def test_rag_fn_uses_legacy_when_flag_off(monkeypatch):
    monkeypatch.setattr(chat_flow_service.settings, "chat_agentic_rag", False)

    async def fake_legacy(message, **kw):
        return {"reply": "legacy"}

    monkeypatch.setattr(chat_flow_service.rag_service, "rag_answer", fake_legacy)
    rag_fn = chat_flow_service._build_rag_fn(
        embedder=object(), model=object(), classify_model=object(), history_texts=[], on_delta=None)
    out = await rag_fn(None, "주차 되나요", retrieval_query="주차")
    assert out == {"reply": "legacy"}
```

Note: 위 테스트는 `rag_fn`을 독립 함수 `_build_rag_fn`으로 추출해야 검증 가능하다(현재는 `_generate` 내부 클로저). Step 3에서 추출한다.

- [ ] **Step 2: 실패 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_seam.py -v --noconftest`
Expected: FAIL — `_build_rag_fn`/`agentic_rag_service`/`settings` 미노출.

- [ ] **Step 3: 구현 — rag_fn을 `_build_rag_fn`으로 추출 + 플래그 분기**

`chat_flow_service.py` 상단 import에 추가(없으면):
```python
from app.core.config import settings
from app.services.chat import agentic_rag_service  # noqa
```
⚠️ import 이름 확인: service.py 모듈 경로는 `app.services.chat.agentic_rag.service`. 별칭을 위해 다음 중 하나로:
```python
from app.services.chat.agentic_rag import service as agentic_rag_service
```

`_generate` 안의 `rag_fn` 클로저(224-236)를 아래 모듈수준 팩토리 호출로 교체한다. 먼저 모듈 수준에 팩토리 추가:
```python
def _build_rag_fn(*, embedder, model, classify_model, history_texts, on_delta):
    async def rag_fn(s, m, retrieval_query=_LEGACY_REWRITE):
        if retrieval_query is _LEGACY_REWRITE:
            retrieval_query = None
            if conversation_understanding.has_followup_signal(m, history_texts):
                standalone = await conversation_understanding.rewrite_standalone(m, history_texts, model=classify_model)
                retrieval_query = conversation_understanding.build_search_query(m, standalone)
        if settings.chat_agentic_rag:
            return await agentic_rag_service.agentic_rag_answer(
                m, embedder=embedder, model=model, judge_model=classify_model,
                retrieval_query=retrieval_query, on_delta=on_delta)
        return await rag_service.rag_answer(m, embedder=embedder, model=model,
                                            retrieval_query=retrieval_query, on_delta=on_delta)
    return rag_fn
```
그리고 `_generate` 안에서 기존 `async def rag_fn(...)` 정의를 지우고:
```python
    rag_fn = _build_rag_fn(embedder=embedder, model=model, classify_model=classify_model,
                           history_texts=history_texts, on_delta=on_delta)
```
로 대체한다(나머지 agent_fn·intent_fn·dept_guide_fn·orchestrate 호출은 그대로).

- [ ] **Step 4: 통과 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_seam.py -v --noconftest`
Expected: PASS

- [ ] **Step 5: 챗봇 순수 회귀 무회귀 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_orchestrator.py tests/test_safety_watchdog.py tests/test_conversation_understanding.py tests/test_chat_router.py -v --noconftest`
Expected: PASS (안전 게이트·라우팅 무회귀 — seam 변경이 기존 경로를 안 깼는지).

- [ ] **Step 6: 커밋**
```bash
git add app/services/chat/chat_flow_service.py tests/test_agentic_rag_seam.py
git commit -m "feat(브랜치B): chat_flow_service rag_fn 플래그 분기(_build_rag_fn 추출, 기본 OFF)"
```

---

## Task 10: bot_probe 확인 + 전체 로컬 검증

**Files:**
- (읽기) `backend/scripts/bot_probe.py` — 세션56에서 생성됨. 브랜치 B 기준선에는 없을 수 있으니 확인.

- [ ] **Step 1: bot_probe 존재 확인**

Run: `cd backend && ls -l scripts/bot_probe.py 2>&1`
- 있으면 그대로 A/B에 쓴다.
- 없으면(브랜치 A가 별도 브랜치라 base에 없음): 세션56 핸드오프(`HANDOFF-chatbot.md` 🟢 세션56 §측정 스크립트)의 계약대로 이 브랜치에 `scripts/bot_probe.py`를 추가한다 — POST `/chat/sessions`(anonToken)→POST `/chat/messages`(X-Anon-Token)→GET `/chat/threads/{id}/messages` 폴링, `--label`·`--diff`·`--insecure`, 문항마다 새 세션. (구현은 별도 커밋.)

- [ ] **Step 2: 브랜치 B 전체 순수 테스트 통과 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_agentic_rag_nodes.py tests/test_agentic_rag_graph.py tests/test_agentic_rag_seam.py -v --noconftest`
그리고 service 순수 테스트:
Run: `... .venv/bin/python -m pytest tests/test_agentic_rag_service.py -k "service_" -v --noconftest`
Expected: 전부 PASS.

- [ ] **Step 3: (선택·DB) retrieve 통합 테스트** — `supabase status` 확인·다른 세션 없음 확인 후:
Run: `cd backend && .venv/bin/python -m pytest tests/test_agentic_rag_service.py -k retrieve -v` → 실행 후 `cd frontend && npm run seed:demo` 재시드.

- [ ] **Step 4: 플래그 OFF 무영향 최종 확인**

Run: `cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -c "from app.core.config import settings; assert settings.chat_agentic_rag is False; print('flag OFF by default — 배포 무영향')"`
Expected: 출력 확인.

- [ ] **Step 5: 커밋(있으면 bot_probe 포함) + push**
```bash
git add -A && git commit -m "test(브랜치B): 로컬 검증 통과 — 순수 스위트 그린, 플래그 OFF 무영향" || echo "nothing to commit"
git push -u origin feat/chatbot-branch-b
```

---

## A/B 실행(사용자 몫, `!`) — 참고

로컬 구현·검증 후, 실환경 A/B는 원격 자격·유료 호출이라 사용자가 직접 실행한다:
1. Railway `gaonhospital-api` 소스 브랜치를 `feat/chatbot-branch-b`로 전환(배포 커밋 확인).
2. `bot_probe --label baseline`(플래그 OFF=현재) → `railway variables --set "CHAT_AGENTIC_RAG=true" --service gaonhospital-api`(자동 재배포) → `bot_probe --label branchB` → `--diff`.
3. ⓪/Ⓐ/Ⓑ 대조: 정확답·no_answer율·되묻기율·실제 인계율·p50/p95·재검색 분포.
4. 되돌리기=env `CHAT_AGENTIC_RAG=false` 또는 브랜치 원위치.

## Self-Review 체크(작성자)

- 스펙 커버리지: 채점(T2)·교정재검색(T3+그래프 T1)·근거검증(T5)·질의분해(T4)·버퍼방출/센티넬(T6)·검색동형(T7)·반환계약/지표(T8)·seam/플래그(T9)·A/B(T10) — 스펙 §2·§4·§5·§7·§8·§9 전부 태스크 있음. ✅
- 플레이스홀더: 각 스텝에 실제 코드·명령·기대값. ✅
- 타입 일관: `retrieve`→dict(chunks/sources/examples/top_restricted/below_floor), 노드 함수 시그니처가 service.py 배선과 일치, `agentic_rag_answer`가 `rag_answer` 동형 반환. ✅
