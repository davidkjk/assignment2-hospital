# 상담봇 브랜치 C — LLM 리랭커(후보 재정렬) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담봇 rag 갈래의 후보 재정렬 한 단계(`rag_service.py:89`의 `_rank_by_relevance`)를, 플래그 ON일 때 Haiku listwise LLM 리랭커로 갈아끼우고(기본 OFF), 브랜치 A·B와 A/B 대조 가능하게 만든다.

**Architecture:** 검색·게이트·제한자료·안전·DB 영속은 전부 그대로 두고, `rag_service`의 재정렬 지점 한 곳만 플래그로 분기한다. 리랭커 본체는 새 모듈 `reranker.py`의 순수 async 함수로, 모델 주입이 가능해 가짜 모델로 단위 테스트한다. 어떤 실패에도 현행 `_rank_by_relevance`로 폴백해 "더 좋게만, 나쁘게는 안" 만든다.

**Tech Stack:** Python 3.13, langchain-anthropic(기존, 새 의존성 없음), asyncpg, pytest. **torch/새 무거운 패키지 없음.**

**Spec:** `docs/superpowers/specs/2026-09-10-chatbot-reranker-branch-c-design.md`

## Global Constraints

- 브랜치: `feat/chatbot-branch-c`, 워크트리 `.claude/worktrees/chatbot-branch-c`. 커밋은 이 브랜치에만. base=`0d5fe33`(A·B와 동일).
- **새 의존성 없음** — 리랭커는 기존 `langchain_client.get_chat_model`/`resp_text`만 쓴다. `requirements.txt` 무변경.
- 플래그 `chat_reranker: bool = False`(env `CHAT_RERANKER`). 기본 OFF=현행 경로. 켜야 발동, 끄면 즉시 원복.
- 검색·게이트는 프로덕션과 **동일**: `HYBRID_FLOOR=0.30`·`CANDIDATE_POOL=12`·`_rank_by_relevance`·`match_kb_chunks_hybrid`. 이 값·로직은 `rag_service`에서 재사용(수정 금지). **0.30 게이트는 재정렬 뒤에도 벡터·키워드 점수로 판정**(리랭커 점수 아님).
- 안전·불변: `orchestrator.py`·`safety_watchdog.py` **수정 금지**. 제한자료 1위→LLM 없이 원문 블록. 반환 dict는 현행 `rag_answer`와 동형.
- 모델: 리랭커=Haiku(`settings.classify_model`), 주입 가짜 모델은 그대로. 답변 생성은 Sonnet(무변경).
- 리랭커는 **채점만** 한다(정보 생성 금지). 어떤 실패(가짜모델·파싱실패·빈응답·예외)에도 예외를 던지지 않고 `_rank_by_relevance(chunks)`로 폴백.
- ⚠️ 순환 import 금지: `reranker.py`는 `rag_service`를 **모듈 top에서 import하지 않는다**(함수 안에서 지연 import). `rag_service`는 `reranker`를 top에서 import해도 안전.
- 테스트 실행(공용 DB truncate 회피): 순수 테스트는 `--noconftest` + 더미 env(`DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x`). venv=메인 `backend/.venv/bin/python`(워크트리엔 없음). DB 통합 테스트는 공용 KB를 truncate하므로 **다른 세션이 프로덕션/로컬 측정 중이면 실행 금지**(Task 2 참조).

---

### Task 1: 리랭커 모듈 `reranker.py` + 설정 플래그 (순수, 핵심)

**Files:**
- Create: `backend/app/services/chat/reranker.py`
- Modify: `backend/app/core/config.py` (플래그 1줄 추가)
- Test: `backend/tests/test_reranker.py`

**Interfaces:**
- Consumes: `app.integrations.langchain_client.get_chat_model`, `resp_text`; `app.services.chat.rag_service._rank_by_relevance`(지연 import); `app.core.config.settings`.
- Produces:
  - `async def rerank_by_llm(query: str, chunks: list[dict], *, model=None) -> list[dict]` — chunks를 관련도 재정렬해 반환. 어떤 실패에도 `_rank_by_relevance(chunks)` 폴백.
  - `RERANK_SNIPPET_CHARS: int = 500`
  - `settings.chat_reranker: bool` (기본 False)

- [ ] **Step 1: config 플래그 추가**

`backend/app/core/config.py`의 `embedding_model` 줄 아래(리랭커는 검색 정밀도 축이라 임베딩 근처)에 추가:

```python
    # 상담봇 브랜치 C(2026-09-10) — 후보 재정렬을 Haiku LLM 리랭커로. 기본 OFF=현행 max(벡터,키워드)
    #   재정렬(_rank_by_relevance). 켜면 rag_service:89에서 rerank_by_llm 호출, 끄면 즉시 원복.
    #   리랭커 모델은 classify_model(Haiku) 재사용, 외부는 이미 쓰는 Anthropic뿐(L410 추가 노출 0).
    chat_reranker: bool = False
```

- [ ] **Step 2: 실패하는 테스트 작성 — 재정렬·폴백·발췌**

`backend/tests/test_reranker.py` 생성:

```python
import pytest

from app.services.chat import reranker


def _chunks():
    # "주차 요금" 실측 재현: 요금 문서(similarity 0.551)가 RRF 하위라 리스트 뒤에 있다.
    #   현행 max(벡터,키워드) 재정렬로도 0.551이 최상이라 1위지만, 리랭커가 '질문에 진짜 답하는' 문서를
    #   확실히 1위로 올리는지(순서만 바꿈)를 검증한다.
    return [
        {"id": 1, "title": "입원생활", "content": "입원 생활 안내", "similarity": 0.60, "keyword_sim": 0.58, "is_restricted": False},
        {"id": 2, "title": "주차요금", "content": "주차 요금은 30분 1000원입니다", "similarity": 0.551, "keyword_sim": 0.0, "is_restricted": False},
        {"id": 3, "title": "오시는길", "content": "지하철 2번 출구", "similarity": 0.40, "keyword_sim": 0.0, "is_restricted": False},
    ]


class _FakeModel:
    """정해진 JSON 점수를 내는 가짜 모델(진짜 ChatAnthropic 아님 → 오프라인)."""
    def __init__(self, content):
        self._content = content
        self.seen = None
    async def ainvoke(self, msgs):
        self.seen = " ".join(getattr(m, "content", str(m)) for m in msgs)
        class R: pass
        r = R(); r.content = self._content
        return r


@pytest.mark.asyncio
async def test_reorders_by_llm_score():
    # 리랭커가 주차요금(index 1)을 가장 관련 있다고 채점 → 1위로 올라온다(RRF/현행 순위와 무관하게).
    model = _FakeModel('{"scores": [{"index": 0, "score": 0.1}, {"index": 1, "score": 0.95}, {"index": 2, "score": 0.2}]}')
    out = await reranker.rerank_by_llm("주차 요금이 어떻게 되나요", _chunks(), model=model)
    assert [c["id"] for c in out] == [2, 3, 1]   # 0.95 > 0.2 > 0.1


@pytest.mark.asyncio
async def test_omitted_candidates_kept_after_scored_ones():
    # 리랭커가 일부 후보 점수를 빠뜨리면(index 2 누락), 점수 받은 것들 뒤에 기존 관련도 순으로 보존.
    model = _FakeModel('{"scores": [{"index": 2, "score": 0.9}]}')
    out = await reranker.rerank_by_llm("q", _chunks(), model=model)
    # index2(오시는길, score 0.9) 먼저, 나머지(누락=-1)는 max(벡터,키워드) 순: 입원생활0.60 > 주차0.551
    assert [c["id"] for c in out] == [3, 1, 2]


@pytest.mark.asyncio
async def test_tie_breaks_by_max_vector_keyword():
    # 동점 점수면 기존 max(벡터,키워드)가 2차 키(결정적 재현성).
    model = _FakeModel('{"scores": [{"index": 0, "score": 0.5}, {"index": 1, "score": 0.5}, {"index": 2, "score": 0.5}]}')
    out = await reranker.rerank_by_llm("q", _chunks(), model=model)
    assert [c["id"] for c in out] == [1, 2, 3]   # 0.60 > 0.551 > 0.40


@pytest.mark.asyncio
async def test_bad_json_falls_back_to_rank_by_relevance():
    # 파싱 실패 → 예외 없이 현행 _rank_by_relevance 폴백(입원생활0.60 > 주차0.551 > 오시는길0.40).
    model = _FakeModel("죄송합니다 점수를 못 냈어요")
    out = await reranker.rerank_by_llm("q", _chunks(), model=model)
    assert [c["id"] for c in out] == [1, 2, 3]


@pytest.mark.asyncio
async def test_model_without_ainvoke_falls_back():
    # ainvoke 없는(미지원) 모델 주입 → 폴백(예외가 밖으로 새지 않는다).
    class _Bad: pass
    out = await reranker.rerank_by_llm("q", _chunks(), model=_Bad())
    assert [c["id"] for c in out] == [1, 2, 3]


@pytest.mark.asyncio
async def test_empty_chunks_returns_empty():
    out = await reranker.rerank_by_llm("q", [], model=_FakeModel('{"scores": []}'))
    assert out == []


@pytest.mark.asyncio
async def test_prompt_carries_query_and_truncated_snippets():
    # 리랭킹 프롬프트에 질문과 후보 발췌(제목+본문)가 실린다. 본문은 RERANK_SNIPPET_CHARS로 자른다.
    long_body = "가" * (reranker.RERANK_SNIPPET_CHARS + 200)
    chunks = [{"id": 9, "title": "긴문서", "content": long_body, "similarity": 0.5, "keyword_sim": 0.0, "is_restricted": False}]
    model = _FakeModel('{"scores": [{"index": 0, "score": 0.9}]}')
    await reranker.rerank_by_llm("주차 요금", chunks, model=model)
    assert "주차 요금" in model.seen                         # 질문이 프롬프트에
    assert "긴문서" in model.seen                            # 제목이 프롬프트에
    assert "가" * reranker.RERANK_SNIPPET_CHARS in model.seen  # 발췌 앞부분은 들어감
    assert long_body not in model.seen                       # 전체 본문(초과분)은 안 들어감(토큰 절감)
```

- [ ] **Step 3: 테스트 실패 확인**

Run:
```bash
cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_reranker.py --noconftest -q
```
Expected: FAIL — `ModuleNotFoundError: app.services.chat.reranker` (모듈 없음).

- [ ] **Step 4: `reranker.py` 구현**

`backend/app/services/chat/reranker.py` 생성:

```python
import json
import logging

from app.core.config import settings
from app.integrations.langchain_client import get_chat_model, resp_text

logger = logging.getLogger(__name__)

# 리랭킹용 발췌 길이(토큰 절감). 답변 생성엔 여전히 본문 전체를 쓰고, 여기선 관련도 판단용 앞부분만.
RERANK_SNIPPET_CHARS = 500

_RERANK_SYSTEM_PROMPT = (
    "너는 검색 결과 재정렬기다. 아래 후보 문서들이 사용자 질문에 답하는 데 얼마나 관련 있는지 "
    "각각 0~1 점수로 채점하라. 답을 지어내지 말고 관련도만 판단한다. 설명 없이 "
    'JSON만 낸다: {"scores": [{"index": <번호>, "score": <0~1>}]}'
)


def _build_candidate_list(chunks: list[dict]) -> str:
    lines = []
    for i, c in enumerate(chunks):
        snippet = (c.get("content") or "")[:RERANK_SNIPPET_CHARS]
        lines.append(f"[{i}] 제목: {c.get('title', '')}\n{snippet}")
    return "\n\n".join(lines)


def _parse_scores(text: str) -> dict[int, float]:
    # 모델 출력에서 첫 '{' ~ 마지막 '}'만 떼어 JSON 파싱(설명 문장이 앞뒤에 붙어도 안전).
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no json object")
    data = json.loads(text[start:end + 1])
    out: dict[int, float] = {}
    for item in data["scores"]:
        out[int(item["index"])] = float(item["score"])
    return out


async def rerank_by_llm(query: str, chunks: list[dict], *, model=None) -> list[dict]:
    """RRF 후보를 Haiku가 매긴 관련도 점수로 재정렬한다(순서만 바꿈).

    어떤 실패(가짜/미지원 모델·파싱 실패·빈 응답·예외)에도 예외를 던지지 않고 현행
    _rank_by_relevance(chunks)로 폴백한다 — 리랭커는 '더 좋게만, 나쁘게는 안' 만든다.
    """
    # 지연 import: reranker↔rag_service 순환 방지(rag_service가 이 모듈을 top에서 import).
    from app.services.chat.rag_service import _rank_by_relevance

    if not chunks:
        return chunks
    llm = model or get_chat_model(settings.classify_model)
    try:
        messages = [
            ("system", _RERANK_SYSTEM_PROMPT),
            ("human", f"질문: {query}\n\n후보:\n{_build_candidate_list(chunks)}"),
        ]
        resp = await llm.ainvoke(messages)
        score_map = _parse_scores(resp_text(resp))
    except Exception as exc:  # 파싱·모델·네트워크 등 어떤 실패든 안전 폴백
        logger.info("reranker fallback (%s): %s", type(exc).__name__, exc)
        return _rank_by_relevance(chunks)
    # 정렬 키 = (리랭커 점수, 동점이면 기존 max(벡터,키워드)) 내림차순. 누락 후보는 -1로 뒤에 보존.
    order = sorted(
        range(len(chunks)),
        key=lambda i: (score_map.get(i, -1.0),
                       max(chunks[i]["similarity"], chunks[i]["keyword_sim"])),
        reverse=True,
    )
    return [chunks[i] for i in order]
```

⚠️ 가짜 모델은 `messages`를 tuple 리스트로 받는다(테스트 `_FakeModel.ainvoke`가 `getattr(m,"content",str(m))`로 읽어 tuple은 `str(m)`이 됨 → 질문·발췌 문자열이 `model.seen`에 그대로 들어감). 진짜 ChatAnthropic도 `("system", ...)` tuple 메시지를 받는다.

- [ ] **Step 5: 테스트 통과 확인**

Run:
```bash
cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_reranker.py --noconftest -q
```
Expected: PASS (7 passed).

- [ ] **Step 6: 커밋**

```bash
git add backend/app/services/chat/reranker.py backend/app/core/config.py backend/tests/test_reranker.py
git commit -m "feat(상담봇 브랜치 C): LLM 리랭커 모듈 rerank_by_llm + CHAT_RERANKER 플래그"
```
(커밋 메시지 끝에 스펙의 attribution 2줄 — 아래 Task 3 Step 참조.)

---

### Task 2: seam 배선 — `rag_service.py:89` 플래그 분기 + `reranker_model` 인자

**Files:**
- Modify: `backend/app/services/chat/rag_service.py` (top import 1줄, `rag_answer` 시그니처 1인자, :89 재정렬 지점 분기)
- Test: `backend/tests/test_rag_reranker_seam.py` (DB 통합 — ⚠️ 공용 KB truncate, 아래 실행 주의)

**Interfaces:**
- Consumes: Task 1의 `reranker.rerank_by_llm`, `settings.chat_reranker`.
- Produces: `rag_answer(..., reranker_model=None)` — 플래그 ON이면 재정렬에 리랭커 사용. 반환 dict 형태 무변경.

- [ ] **Step 1: seam 구현 (top import + 인자 + 분기)**

`rag_service.py` 상단 import에 추가(순환 안전 — reranker top은 rag_service를 import 안 함):
```python
from app.core.config import settings
from app.services.chat.reranker import rerank_by_llm
```
`rag_answer` 시그니처에 `reranker_model=None` 추가:
```python
async def rag_answer(message: str, *, embedder, model=None, match_count: int = 5,
                     retrieval_query: str | None = None, on_delta=None,
                     reranker_model=None) -> dict:
```
`:89`의 재정렬 한 줄을 분기로 교체:
```python
        # RRF 후보 재정렬: 플래그 ON이면 Haiku 리랭커(순서만 바꿈, 실패 시 _rank_by_relevance 폴백),
        #   OFF면 현행 max(벡터,키워드). 게이트·제한자료·근거 판정은 재정렬 결과의 1위/상위를 그대로 쓴다.
        if settings.chat_reranker:
            ranked = await rerank_by_llm(search_query, chunks, model=reranker_model)
        else:
            ranked = _rank_by_relevance(chunks)
        chunks = ranked[:match_count]
```

- [ ] **Step 2: 실패하는 DB 통합 테스트 작성**

`backend/tests/test_rag_reranker_seam.py` 생성:

```python
import pytest

from app.services.chat import rag_service
from app.core.config import settings
from tests.conftest import seed_staff


class _Fixed:
    async def embed(self, texts): return [[1.0] + [0.0] * 1535 for _ in texts]


class _AnswerModel:
    async def ainvoke(self, _):
        class R: content = "지하 2층 주차장은 30분 1000원입니다."
        return R()


class _RerankerModel:
    """주차요금 문서를 최상위로 채점하는 가짜 리랭커."""
    def __init__(self, top_title): self._top = top_title
    async def ainvoke(self, msgs):
        text = " ".join(getattr(m, "content", str(m)) for m in msgs)
        # 후보 목록에서 top_title이 있는 [index]를 찾아 그 index에 1.0, 나머진 낮게.
        import re
        blocks = re.findall(r"\[(\d+)\] 제목: ([^\n]*)", text)
        scores = []
        for idx, title in blocks:
            scores.append({"index": int(idx), "score": 0.99 if self._top in title else 0.1})
        import json
        class R: pass
        r = R(); r.content = json.dumps({"scores": scores})
        return r


@pytest.mark.asyncio
async def test_flag_on_reranker_promotes_relevant_chunk(committed_conn, monkeypatch):
    # 리랭커 ON: RRF/현행 재정렬에선 하위였을 문서를 리랭커가 1위로 올려 sources 최상위가 된다.
    monkeypatch.setattr(settings, "chat_reranker", True)
    st = await seed_staff(committed_conn, role="admin")
    v_hi = "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]"          # 입원생활: 벡터 최고(현행 1위)
    v_lo = "[" + ",".join(["0.7", "0.3"] + ["0.0"] * 1534) + "]"   # 주차요금: 벡터 낮음(현행 하위), floor 위
    idoc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('입원생활','입원 생활 안내입니다.','approved',false) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'입원 생활 안내입니다.',$2::vector)", idoc, v_hi)
    pdoc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('주차요금','지하 2층 주차장은 30분 1000원입니다.','approved',false) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'지하 2층 주차장은 30분 1000원입니다.',$2::vector)", pdoc, v_lo)

    out = await rag_service.rag_answer(
        "주차 요금이 어떻게 되나요", embedder=_Fixed(), model=_AnswerModel(),
        reranker_model=_RerankerModel("주차요금"))

    assert out.get("sources"), "정상 답변이어야"
    assert out["sources"][0]["title_snapshot"] == "주차요금"   # 리랭커가 1위로 올림(현행이면 입원생활 1위)

    await committed_conn.execute("delete from kb_chunks where document_id = any($1::uuid[])", [idoc, pdoc])
    await committed_conn.execute("delete from kb_documents where id = any($1::uuid[])", [idoc, pdoc])
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_flag_on_restricted_top1_after_rerank_returns_verbatim(committed_conn, monkeypatch):
    # 리랭커가 제한자료를 1위로 올리면, 재정렬 뒤 제한자료 규칙(LLM 없이 원문 블록)이 그대로 작동한다.
    monkeypatch.setattr(settings, "chat_reranker", True)
    st = await seed_staff(committed_conn, role="admin")
    v_hi = "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]"
    v_lo = "[" + ",".join(["0.7", "0.3"] + ["0.0"] * 1534) + "]"
    ndoc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('일반안내','일반 안내입니다.','approved',false) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'일반 안내입니다.',$2::vector)", ndoc, v_hi)
    rdoc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('보험상담','보험 관련은 직원에게 문의하세요.','approved',true) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'보험 관련은 직원에게 문의하세요.',$2::vector)", rdoc, v_lo)

    out = await rag_service.rag_answer(
        "보험 되나요", embedder=_Fixed(), model=_AnswerModel(),
        reranker_model=_RerankerModel("보험상담"))

    assert out.get("reply") is None
    assert out["restricted_block"] == "보험 관련은 직원에게 문의하세요."   # 재정렬 뒤에도 원문 그대로
    assert "직원 연결" in out["actions"]

    await committed_conn.execute("delete from kb_chunks where document_id = any($1::uuid[])", [ndoc, rdoc])
    await committed_conn.execute("delete from kb_documents where id = any($1::uuid[])", [ndoc, rdoc])
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])
```

- [ ] **Step 3: 테스트 실패 확인 (DB 필요 — 실행 주의)**

⚠️ **이 테스트는 conftest autouse가 공용 로컬 KB를 truncate한다.** 실행 전 반드시: `supabase status`로 로컬 DB 확인 + **다른 세션이 로컬/프로덕션 봇을 측정 중이 아님**을 확인. 실행 후 `cd frontend && npm run seed:demo`로 재시드.

다른 세션이 측정 중이면 **이 Step은 미실행으로 두고**(Task 1 순수 테스트 + seam 코드 리뷰로 대체), 커밋만 진행한다(seam은 3줄 분기라 순수 리랭커 테스트가 재정렬 로직을 이미 커버).

측정 중이 아닐 때:
```bash
cd backend && .venv/bin/python -m pytest tests/test_rag_reranker_seam.py -q
```
Expected: FAIL (seam 분기 전이면 `reranker_model` 무시되어 sources[0]이 입원생활 → 첫 테스트 실패). Step 1 구현 후 재실행하면 PASS.

- [ ] **Step 4: 플래그 OFF 무회귀 확인 (순수)**

리랭커 OFF가 기본이고 기존 rag 경로가 안 깨졌는지 순수 회귀:
```bash
cd backend && DATABASE_URL=postgresql://x SUPABASE_URL=http://x SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_JWT_SECRET=x .venv/bin/python -m pytest tests/test_reranker.py tests/test_orchestrator.py tests/test_conversation_understanding.py tests/test_chat_router.py --noconftest -q
```
Expected: PASS. (`settings.chat_reranker` 기본 False라 seam이 현행 `_rank_by_relevance` 경로 그대로.)

- [ ] **Step 5: 커밋**

```bash
git add backend/app/services/chat/rag_service.py backend/tests/test_rag_reranker_seam.py
git commit -m "feat(상담봇 브랜치 C): rag_service 재정렬 seam 플래그 분기 + reranker_model 인자"
```

---

### Task 3: 측정 도구 `bot_probe.py` 이식 (브랜치 A → C)

**Files:**
- Create: `backend/scripts/bot_probe.py` (브랜치 A `feat/chatbot-branch-a`에서 이식 — 동일 도구)

**Interfaces:**
- Consumes: 없음(표준 라이브러리 urllib). Produces: `bot_probe_<label>.json` + 콘솔 표.

- [ ] **Step 1: 브랜치 A에서 파일 이식**

base(0d5fe33)엔 없으므로 브랜치 A의 검증된 도구를 그대로 가져온다:
```bash
git show feat/chatbot-branch-a:backend/scripts/bot_probe.py > backend/scripts/bot_probe.py
```

- [ ] **Step 2: 도구가 동작하는지 확인(도움말·import)**

```bash
cd backend && .venv/bin/python scripts/bot_probe.py --help
```
Expected: 인자 도움말 출력(문법·import 오류 없음). ⚠️ 실제 측정은 원격 프로덕션 대상이라 **사용자가 `!`로** 실행(`--label branchC`).

- [ ] **Step 3: 커밋**

`~/.claude` 저장소 규칙 attribution 2줄을 커밋 메시지 끝에 붙인다:
```bash
git add backend/scripts/bot_probe.py
git commit -F - <<'EOF'
chore(상담봇 브랜치 C): bot_probe.py 이식(브랜치 A) — ⓪ vs Ⓒ A/B 측정용

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0134kExRoaudUbSr1jaWeHdK
EOF
```
(Task 1·2 커밋도 동일 2줄을 끝에 붙인다.)

---

## Self-Review

**1. Spec coverage:**
- §2 리랭커 선택(c LLM/Haiku) → Task 1 `rerank_by_llm` + `classify_model`. ✓
- §3 발동=항상 → seam이 플래그 ON이면 무조건 리랭커(조건 없음). ✓
- §4 불변식(0.30 게이트 벡터·키워드 판정·제한자료·안전·DB) → seam이 재정렬만 교체, :96 게이트·:107 제한자료·이후 코드 무변경. Task 2 테스트가 제한자료 무회귀 검증. ✓
- §5.1 seam=:89 한 곳 → Task 2. ✓  §5.2 listwise·점수·누락보존·동점·폴백 → Task 1 테스트 7건. ✓  §5.3 프롬프트(채점만) → Task 1 `_RERANK_SYSTEM_PROMPT`. ✓  §5.4 Haiku·발췌 → Task 1. ✓  §5.5 반환 계약 동형 → seam이 chunks만 재정렬. ✓
- §6 관측(내부 로그) → 리랭커 폴백 `logger.info`. (top1_moved 등 추가 로그는 채택 후 튜닝 — 범위 밖 명시.) ✓
- §7 되돌리기(플래그 기본 False) → config. ✓  §8 파일 경계 → Task 1·2·3 정확히 일치. ✓
- §9 테스트 전략 → Task 1 순수 7건 + Task 2 DB 2건(측정 중이면 보류). ✓
- §10 A/B → Task 3 bot_probe. ✓  §11 요구사항 → seam 불변식으로 준수(L405·406·407·410). ✓

**2. Placeholder scan:** "TBD/TODO/적절히" 없음. 발췌 500·타임아웃은 스펙이 계획 위임한 값이라 Task 1에서 `RERANK_SNIPPET_CHARS=500`으로 확정(타임아웃은 embedding_client 기본에 기대고 폴백이 커버 — 별도 상수 불필요). ✓

**3. Type consistency:** `rerank_by_llm(query, chunks, *, model=None) -> list[dict]` — Task 1 정의·Task 2 호출 시그니처 일치. `settings.chat_reranker`(bool) Task 1 정의·Task 2 참조 일치. `reranker_model` Task 2 인자·`rerank_by_llm(model=)` 매핑 일치. `_rank_by_relevance` 지연 import로 순환 회피. ✓
