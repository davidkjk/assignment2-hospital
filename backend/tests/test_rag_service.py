import pytest

from app.services.chat import rag_service
from tests.conftest import seed_staff
from tests.conftest_chat import FakeEmbedder


# ── 답변 판정은 RRF 순위가 아니라 실제 관련도 순으로 (순수 함수) ──

def test_rank_by_relevance_puts_highest_max_score_first():
    # RRF가 '두 검색에 다 걸린' 무관한 문서를 1위로 올릴 수 있다(2026-09-09 실측: '씨티'에 입원생활이
    #   0.239로 RRF 1위, CT는 0.521로 2위). 게이트·제한자료 판정은 관련도(max(벡터,키워드)) 최고 청크를
    #   앞세워야 한다 — 안 그러면 무관한 1위 때문에 관련 청크가 통째로 버려진다.
    chunks = [
        {"title": "입원생활", "similarity": 0.239, "keyword_sim": 0.235},   # RRF 1위였던 무관 청크
        {"title": "CT", "similarity": 0.521, "keyword_sim": 0.0},           # 진짜 관련(하위 RRF)
        {"title": "대장내시경", "similarity": 0.375, "keyword_sim": 0.0},
    ]
    ranked = rag_service._rank_by_relevance(chunks)
    assert [c["title"] for c in ranked] == ["CT", "대장내시경", "입원생활"]


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


class _NoAnswerWithPreambleModel:
    # 모델이 "다른 말 없이 NO_ANSWER만" 지시를 어기고 설명을 먼저 붙인 뒤 센티넬을 맨 뒤에 두는 실측 사례.
    async def ainvoke(self, _):
        class R: content = "주어진 자료에는 CT 촬영 전 준비물에 대한 내용이 없습니다.\n\nNO_ANSWER"
        return R()


@pytest.mark.asyncio
async def test_no_answer_sentinel_anywhere_in_reply_is_handoff(committed_conn):
    # 회귀 가드(2026-09-08): 센티넬이 문장 맨 뒤에 붙으면 == / startswith 로는 못 잡아
    #   "…없습니다.\n\nNO_ANSWER" 원문이 환자에게 그대로 노출됐다. 어디에 있든 no_answer 여야 한다.
    st = await seed_staff(committed_conn, role="admin")
    vecstr = "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]"
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('주차 안내','지하에 주차할 수 있습니다.','approved',false) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'지하에 주차할 수 있습니다.',$2::vector)", doc, vecstr)

    out = await rag_service.rag_answer("CT 준비물", embedder=_Fixed(), model=_NoAnswerWithPreambleModel())

    assert out.get("no_answer") is True                 # 센티넬이 맨 뒤여도 인계로
    assert "reply" not in out                            # 센티넬 원문이 답변으로 새면 안 된다

    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_low_similarity_becomes_no_answer():
    # 승인 조각이 하나도 없으면(빈 KB) 근거 부족 → no_answer.
    out = await rag_service.rag_answer("아무거나", embedder=FakeEmbedder(), model=_Model())
    assert out.get("no_answer") is True


class _RecEmbedder:
    # 임베딩에 실제로 넘어간 검색 문장을 붙잡는다.
    def __init__(self): self.texts = None
    async def embed(self, texts):
        self.texts = texts
        return [[1.0] + [0.0] * 1535 for _ in texts]


@pytest.mark.asyncio
async def test_retrieval_embeds_synonym_expanded_query():
    # Sprint 1.2: 검색 임베딩은 원문이 아니라 동의어 확장 질의를 쓴다("씨티"→"CT"도 함께 실림).
    #   그래야 한글 음역 질의가 영문 약어로 쓰인 KB 원문을 찾는다.
    rec = _RecEmbedder()
    await rag_service.rag_answer("씨티 준비물", embedder=rec, model=_Model())
    assert rec.texts is not None
    assert "ct" in rec.texts[0]          # 확장 질의(원문에 없던 표준어)가 임베딩에 실린다
    assert "씨티" in rec.texts[0]         # 원문 토큰도 보존


@pytest.mark.asyncio
async def test_retrieval_query_is_searched_while_original_goes_to_llm(committed_conn):
    # Sprint 2(멀티턴 재작성): 후속 질문이면 orchestrate가 재작성한 독립형 질의(retrieval_query)로
    #   검색하고, LLM 질문·화면엔 원문을 쓴다. retrieval_query가 오면 그것을(정규화해) 임베딩한다.
    st = await seed_staff(committed_conn, role="admin")
    vecstr = "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]"
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('CT 안내','CT 검사 전 6시간 금식이 필요합니다.','approved',false) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'CT 검사 전 6시간 금식이 필요합니다.',$2::vector)", doc, vecstr)
    rec = _RecEmbedder()
    captured = {}
    class _Rec:
        async def ainvoke(self, msgs):
            captured["text"] = " ".join(getattr(m, "content", str(m)) for m in msgs)
            class R: content = "6시간 금식이 필요합니다."
            return R()
    await rag_service.rag_answer(
        "그럼 물은?", embedder=rec, model=_Rec(),
        retrieval_query="CT 조영제 검사 전에 물을 마셔도 되나요? 그럼 물은?")
    assert rec.texts is not None
    assert "ct 조영제 검사 전에 물을 마셔도 되나요?" in rec.texts[0]   # 재작성 질의로 검색(정규화=소문자)
    assert "그럼 물은?" in captured["text"]        # 원문이 LLM 질문에
    assert "CT 조영제 검사 전에" not in captured["text"]   # 재작성 질의는 LLM에 새지 않는다
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_llm_question_keeps_original_text(committed_conn):
    # 확장은 검색용일 뿐 — 환자가 실제 쓴 질문(원문)이 LLM에 그대로 가야 한다(확장어가 환자에게 안 보이게).
    st = await seed_staff(committed_conn, role="admin")
    vecstr = "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]"
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('CT 안내','CT 검사는 금식이 필요합니다.','approved',false) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'CT 검사는 금식이 필요합니다.',$2::vector)", doc, vecstr)
    captured = {}
    class _Rec:
        async def ainvoke(self, msgs):
            captured["text"] = " ".join(getattr(m, "content", str(m)) for m in msgs)
            class R: content = "금식이 필요합니다."
            return R()
    await rag_service.rag_answer("씨티 준비물", embedder=_Fixed(), model=_Rec())
    assert "씨티 준비물" in captured["text"]       # 원문 질문이 LLM에
    assert "컴퓨터단층촬영" not in captured["text"]  # 확장어는 LLM에 새지 않는다
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


async def _seed_normal_chunk(conn, title="주차 안내", content="지하에 주차할 수 있습니다."):
    vecstr = "[" + ",".join(["1.0"] + ["0.0"] * 1535) + "]"
    doc = await conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ($1,$2,'approved',false) returning id", title, content)
    await conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,$2,$3::vector)", doc, content, vecstr)
    return doc


class _RecModel:
    def __init__(self): self.text = None
    async def ainvoke(self, msgs):
        self.text = " ".join(getattr(m, "content", str(m)) for m in msgs)
        class R: content = "지하에 주차할 수 있습니다."
        return R()


@pytest.mark.asyncio
async def test_answer_prompt_carries_persona_and_conversation_policy(committed_conn):
    # Sprint 1.3(리포트 §4.6): 얇은 프롬프트 → 페르소나 + 대화 원칙(첫 문장 직접 답·공감 적정선).
    st = await seed_staff(committed_conn, role="admin")
    doc = await _seed_normal_chunk(committed_conn)
    rec = _RecModel()
    await rag_service.rag_answer("주차 되나요", embedder=_Fixed(), model=rec)
    assert "가온병원" in rec.text            # 페르소나 정체성
    assert "진단" in rec.text                # 진단·처방 안 함 경계
    assert "첫 문장" in rec.text             # 핵심을 첫 문장에 직접 답하는 원칙
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_answer_prompt_preserves_grounding_and_no_answer_safety(committed_conn):
    # 회귀 가드: 프롬프트를 풍성하게 바꿔도 의료 안전 두 축은 반드시 남는다 —
    #   ① 병원 자료만 근거(지어내기 금지) ② 답 없으면 NO_ANSWER 센티넬.
    st = await seed_staff(committed_conn, role="admin")
    doc = await _seed_normal_chunk(committed_conn)
    rec = _RecModel()
    await rag_service.rag_answer("주차 되나요", embedder=_Fixed(), model=rec)
    assert "자료" in rec.text and "지어내" in rec.text   # 근거 한정·지어내기 금지
    assert "NO_ANSWER" in rec.text                       # 근거 부족 시 인계 센티넬
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


class _ClarifyModel:
    # 애매한 질문(어떤 검사인지 빠짐)에 모델이 확인 질문 하나를 센티넬 형식으로 낸다.
    async def ainvoke(self, _):
        class R: content = "NEEDS_CLARIFY: 어떤 검사를 말씀하시는 걸까요?"
        return R()


@pytest.mark.asyncio
async def test_ambiguous_question_returns_needs_clarification(committed_conn):
    # Sprint 2 no_answer 세분화: 질문이 무엇을 가리키는지 불명확하면 "못 찾음"이 아니라 확인 질문 하나로.
    st = await seed_staff(committed_conn, role="admin")
    doc = await _seed_normal_chunk(committed_conn, "검사 안내", "각 검사 준비물은 검사별로 다릅니다.")
    out = await rag_service.rag_answer("준비물이요?", embedder=_Fixed(), model=_ClarifyModel())
    assert out.get("needs_clarification") is True
    assert out.get("no_answer") is not True          # KB 구멍 아님 → 미해결로 집계하지 않는다
    assert out["reply"] == "어떤 검사를 말씀하시는 걸까요?"   # 센티넬은 벗기고 질문만
    assert "NEEDS_CLARIFY" not in out["reply"]        # 센티넬 원문이 환자에게 새면 안 된다
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


class _BothSentinelModel:
    # 모델이 모순되게 둘 다 낸 경우 — 근거 부재(NO_ANSWER)가 확인질문보다 우선(되묻기 루프 방지·안전).
    async def ainvoke(self, _):
        class R: content = "NEEDS_CLARIFY: 어떤 검사요?\nNO_ANSWER"
        return R()


@pytest.mark.asyncio
async def test_no_answer_takes_priority_over_clarify(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    doc = await _seed_normal_chunk(committed_conn)
    out = await rag_service.rag_answer("아무거나요?", embedder=_Fixed(), model=_BothSentinelModel())
    assert out.get("no_answer") is True
    assert out.get("needs_clarification") is not True
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


class _EmptyClarifyModel:
    async def ainvoke(self, _):
        class R: content = "NEEDS_CLARIFY:   "
        return R()


@pytest.mark.asyncio
async def test_empty_clarify_question_falls_back_to_no_answer(committed_conn):
    # 확인 질문 본문이 비면(빈 되묻기=막다른 길) 안전하게 no_answer로 폴백한다.
    st = await seed_staff(committed_conn, role="admin")
    doc = await _seed_normal_chunk(committed_conn)
    out = await rag_service.rag_answer("준비물이요?", embedder=_Fixed(), model=_EmptyClarifyModel())
    assert out.get("no_answer") is True
    assert out.get("needs_clarification") is not True
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_answer_prompt_carries_clarify_instruction(committed_conn):
    # 프롬프트에 확인질문 지침이 실려야 한다(모델이 애매한 질문을 NEEDS_CLARIFY로 낼 수 있게).
    st = await seed_staff(committed_conn, role="admin")
    doc = await _seed_normal_chunk(committed_conn)
    rec = _RecModel()
    await rag_service.rag_answer("주차 되나요", embedder=_Fixed(), model=rec)
    assert "NEEDS_CLARIFY" in rec.text
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


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
