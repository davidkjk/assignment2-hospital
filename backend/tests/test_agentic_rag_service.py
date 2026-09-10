import pytest

from app.services.chat.agentic_rag import retrieval, service
from tests.conftest import seed_staff
from tests.conftest_chat import FakeEmbedder


class _Fixed:
    async def embed(self, texts): return [[1.0] + [0.0] * 1535 for _ in texts]


# ── retrieve 노드 (DB 통합) ──
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


# ── agentic_rag_answer 배선 (순수 — retrieve monkeypatch) ──
class _AnswerModel:
    def __init__(self, content): self._c = content
    async def ainvoke(self, msgs):
        class R: pass
        r = R(); r.content = self._c
        return r


class _ScriptedJudge:
    # 프롬프트 내용으로 어느 판정 노드인지 구분(grade/rewrite/verify/decompose 공용).
    async def ainvoke(self, msgs):
        text = " ".join(getattr(m, "content", str(m)) for m in msgs)
        class R: pass
        r = R()
        if "채점기" in text:      r.content = "RELEVANT"
        elif "검증기" in text:    r.content = "GROUNDED"
        elif "다시 쓰" in text:   r.content = "재작성"
        else:                      r.content = "단일"      # decompose: 원문 1개
        return r


def _chunk(cid, title, content, restricted=False):
    return {"id": cid, "title": title, "content": content, "is_restricted": restricted,
            "similarity": 0.9, "keyword_sim": 0.0}


@pytest.mark.asyncio
async def test_service_happy_path_returns_reply(monkeypatch):
    async def fake_retrieve(query, *, embedder, match_count=5):
        return {"chunks": [_chunk("c1", "주차", "지하 주차 가능")],
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
    assert "".join(emitted) == "지하에 주차하실 수 있습니다."


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
    assert emitted == []


@pytest.mark.asyncio
async def test_service_top_restricted_returns_verbatim(monkeypatch):
    async def fake_retrieve(query, *, embedder, match_count=5):
        return {"chunks": [_chunk("r1", "보험", "보험은 직원 문의", restricted=True)],
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
        return {"chunks": [_chunk("c1", "검사", "검사별로 다름")],
                "sources": [], "examples": [], "top_restricted": False, "below_floor": False}
    monkeypatch.setattr(service.retrieval, "retrieve", fake_retrieve)
    out = await service.agentic_rag_answer(
        "준비물이요?", embedder=object(), model=_AnswerModel("NEEDS_CLARIFY: 어떤 검사요?"),
        judge_model=_ScriptedJudge())
    assert out.get("needs_clarification") is True
    assert out["reply"] == "어떤 검사요?"
