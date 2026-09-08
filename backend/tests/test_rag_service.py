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


class _NoAnswerModel:
    # 엉뚱한 일반 근거만 받은 LLM이 "근거에 답 없음"으로 판정하는 상황을 재현.
    async def ainvoke(self, _):
        class R: content = "NO_ANSWER"
        return R()


@pytest.mark.asyncio
async def test_top1_restricted_returns_verbatim_even_when_irrelevant_normal_present(committed_conn):
    # A3(결정 2026-08-12·spec §3): 검색 1위가 제한 자료면 Claude 호출 없이 원문을 별도 블록에 그대로.
    # 회귀 가드: 엉뚱한 일반 청크가 top-5에 1개라도 끼어도(제한+일반 혼합) 제한 원문을 버리고
    #   no_answer로 새면 안 된다. 실측(rag_diag): CT조영·바륨·대장 모두 1위 제한자료인데 일반 청크가
    #   함께 걸려 LLM 경로로 갔다가 NO_ANSWER로 제한원문까지 폐기 → no_answer 되던 버그.
    st = await seed_staff(committed_conn, role="admin")
    v_hit = "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]"          # 질의와 동일 → 유사도 1 (rank0)
    v_off = "[" + ",".join(["0.6", "0.8"] + ["0.0"] * 1534) + "]"   # 덜 맞음 → 하위, 그래도 floor 위
    rdoc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('CT조영제 준비','CT 조영제 검사는 직원 안내에 따르세요.','approved',true) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'CT 조영제 검사는 직원 안내에 따르세요.',$2::vector)", rdoc, v_hit)
    ndoc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('골밀도 검사','골밀도 검사는 예약 후 진행합니다.','approved',false) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'골밀도 검사는 예약 후 진행합니다.',$2::vector)", ndoc, v_off)

    out = await rag_service.rag_answer("CT 조영제 검사 준비", embedder=_Fixed(), model=_NoAnswerModel())

    assert out.get("no_answer") is not True                      # 제한 원문 버리고 인계로 새면 실패
    assert out.get("reply") is None                              # 제한 원문은 생성문에 안 섞음
    assert out["restricted_block"] == "CT 조영제 검사는 직원 안내에 따르세요."
    assert "직원 연결" in out.get("actions", [])

    await committed_conn.execute("delete from kb_chunks where document_id = any($1::uuid[])", [rdoc, ndoc])
    await committed_conn.execute("delete from kb_documents where id = any($1::uuid[])", [rdoc, ndoc])
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
