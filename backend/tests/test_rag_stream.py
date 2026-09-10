import pytest

from app.services.chat import rag_service


class _Fixed:
    # test_rag_service.py와 동일 — 질의·조각 벡터를 같게 만들어 유사도=1로 게이트 통과.
    async def embed(self, texts):
        return [[1.0] + [0.0] * 1535 for _ in texts]


class FakeChunk:
    def __init__(self, text):
        self.content = text


class StreamModel:
    """astream을 지원하는 가짜 모델 — 조각을 순서대로 흘린다."""

    def __init__(self, parts):
        self._parts = parts

    async def astream(self, messages):
        for p in self._parts:
            yield FakeChunk(p)


@pytest.mark.asyncio
async def test_rag_answer_streams_deltas(committed_conn):
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('주차 안내','지하 1층에 주차할 수 있습니다.','approved',false) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'지하 1층에 주차할 수 있습니다.',$2::vector)",
        doc, "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]")
    seen = []
    model = StreamModel(["안녕", "하세요"])
    out = await rag_service.rag_answer(
        "주차 되나요", embedder=_Fixed(), model=model,
        on_delta=lambda t: seen.append(t))
    assert seen == ["안녕", "하세요"]
    assert out["reply"] == "안녕하세요"
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
