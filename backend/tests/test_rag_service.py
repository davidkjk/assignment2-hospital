import pytest

from app.services.chat import rag_service
from tests.conftest import seed_staff
from tests.conftest_chat import FakeEmbedder


class _Fixed:
    # 임계값 판정을 통제하려고 질의·조각 벡터를 같게 만들어 유사도=1로 만든다.
    async def embed(self, texts): return [[1.0] + [0.0] * 1535 for _ in texts]


class _Model:
    async def ainvoke(self, _):
        class R: content = "지하 1층에 주차할 수 있습니다."
        return R()


@pytest.mark.asyncio
async def test_restricted_only_returns_verbatim_and_staff_action(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('보험 상담','보험 관련은 직원에게 문의하세요.','approved',true) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'보험 관련은 직원에게 문의하세요.',$2::vector)", doc, "[" + ",".join(["1.0"]+["0.0"]*1535) + "]")
    out = await rag_service.rag_answer("보험 되나요", embedder=_Fixed(), model=_Model())
    assert out.get("reply") is None
    assert out["restricted_block"] == "보험 관련은 직원에게 문의하세요."   # 글자 그대로, 봇 생성 아님
    assert "직원 연결" in out["actions"]
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_low_similarity_becomes_no_answer():
    # 승인 조각이 하나도 없으면(빈 KB) 근거 부족 → no_answer.
    out = await rag_service.rag_answer("아무거나", embedder=FakeEmbedder(), model=_Model())
    assert out.get("no_answer") is True


@pytest.mark.asyncio
async def test_similar_qa_example_injected_as_fewshot(committed_conn):
    # 품질 개선 사이클: 오답 교정으로 쌓인 참고 예시가 비슷한 질문의 RAG 프롬프트에 few-shot으로 주입된다.
    st = await seed_staff(committed_conn, role="admin")
    vecstr = "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]"
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('주차 안내','지하에 주차할 수 있습니다.','approved',false) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'지하에 주차할 수 있습니다.',$2::vector)", doc, vecstr)
    ex = await committed_conn.fetchval(
        "insert into qa_example_bank (question, answer, embedding) "
        "values ('주차 어디에 하나요','지하 2층에 주차하세요.',$1::vector) returning id", vecstr)

    captured = {}
    class _Rec:
        async def ainvoke(self, msgs):
            captured["text"] = " ".join(getattr(m, "content", str(m)) for m in msgs)
            class R: content = "지하에 주차할 수 있습니다."
            return R()

    out = await rag_service.rag_answer("주차 되나요", embedder=_Fixed(), model=_Rec())
    assert out.get("reply")
    assert "주차 어디에 하나요" in captured["text"]      # 예시 질문이 프롬프트에 들어간다
    assert "지하 2층에 주차하세요." in captured["text"]   # 예시 답변도

    await committed_conn.execute("delete from qa_example_bank where id=$1", ex)
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])
