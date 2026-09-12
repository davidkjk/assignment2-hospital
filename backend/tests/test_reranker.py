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
