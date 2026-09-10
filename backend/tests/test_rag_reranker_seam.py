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
    """후보 목록에서 top_title이 있는 문서를 최상위로 채점하는 가짜 리랭커."""
    def __init__(self, top_title): self._top = top_title
    async def ainvoke(self, msgs):
        import json
        import re
        text = " ".join(getattr(m, "content", str(m)) for m in msgs)
        blocks = re.findall(r"\[(\d+)\] 제목: ([^\n]*)", text)
        scores = [{"index": int(idx), "score": 0.99 if self._top in title else 0.1}
                  for idx, title in blocks]
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
