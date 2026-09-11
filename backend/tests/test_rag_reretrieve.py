"""조건부 재검색(chat_reretrieve_on_miss) 단위 테스트.

첫 하이브리드 검색이 게이트(HYBRID_FLOOR) 미달일 때만 Haiku로 질의를 1회 재작성해 재검색한다.
실패한 질문에만 지연이 붙고(정상 질문은 A단독 속도), 검색 놓침(셔틀·CT금식 등)을 건진다.
플래그 OFF(기본)면 현행 단발 검색과 동일.

DB·conftest 불필요 — get_pool/conn/embedder/model을 주입해 순수 검증한다(`--noconftest`).
"""
from types import SimpleNamespace

import pytest

from app.services.chat import rag_service


def _chunk(sim, kw=0.0, restricted=False, cid=1, title="문서", content="내용입니다."):
    return {"id": cid, "title": title, "content": content, "is_restricted": restricted,
            "similarity": sim, "keyword_sim": kw}


# ── _below_floor ──────────────────────────────────────────────────────────
def test_below_floor():
    floor = rag_service.HYBRID_FLOOR
    assert rag_service._below_floor([]) is True
    assert rag_service._below_floor([_chunk(floor - 0.01)]) is True
    assert rag_service._below_floor([_chunk(floor + 0.01)]) is False
    # 벡터는 낮아도 키워드가 게이트 이상이면 통과(max 기준).
    assert rag_service._below_floor([_chunk(0.0, kw=floor + 0.01)]) is False


# ── _rewrite_query_for_retry ─────────────────────────────────────────────
class _RewriteModel:
    def __init__(self, out): self._out = out
    async def ainvoke(self, messages): return SimpleNamespace(content=self._out)


class _BoomModel:
    async def ainvoke(self, messages): raise RuntimeError("모델 장애")


@pytest.mark.asyncio
async def test_rewrite_returns_alt_query():
    alt = await rag_service._rewrite_query_for_retry("셔틀 있어요?", _RewriteModel("병원 셔틀버스 운행"))
    assert alt == "병원 셔틀버스 운행"


@pytest.mark.asyncio
async def test_rewrite_empty_returns_none():
    assert await rag_service._rewrite_query_for_retry("x", _RewriteModel("   ")) is None


@pytest.mark.asyncio
async def test_rewrite_exception_returns_none():
    # 재작성 실패가 답변 경로를 깨지 않는다(재검색만 생략).
    assert await rag_service._rewrite_query_for_retry("x", _BoomModel()) is None


# ── rag_answer 조건부 재검색 게이팅 ──────────────────────────────────────
class _Embedder:
    async def embed(self, texts): return [[0.0, 0.0, 0.0, 0.0] for _ in texts]


class _Conn:
    """질의별 청크를 돌려주는 가짜 conn. fetch 호출을 기록한다."""
    def __init__(self, chunks_by_query):
        self.chunks_by_query = chunks_by_query
        self.searched = []

    async def fetch(self, sql, *args):
        if "match_kb_chunks" in sql:
            search_query = args[1]           # (vec, search_query, pool_n)
            self.searched.append(search_query)
            return self.chunks_by_query.get(search_query, [])
        return []                            # qa_example_bank 등 → 예시 없음


class _Pool:
    def __init__(self, conn): self._conn = conn

    def acquire(self):
        conn = self._conn

        class _CM:
            async def __aenter__(self): return conn
            async def __aexit__(self, *a): return False
        return _CM()


class _AnswerRewriteModel:
    """재작성 프롬프트('검색어' 포함)엔 재작성 질의를, 그 외(답변 생성)엔 답변을 준다."""
    def __init__(self, rewrite, answer): self.rewrite, self.answer = rewrite, answer

    async def ainvoke(self, messages):
        content = self.rewrite if "검색어" in str(messages) else self.answer
        return SimpleNamespace(content=content)


@pytest.fixture
def _patch_pool(monkeypatch):
    def _install(conn):
        async def _get_pool(): return _Pool(conn)
        monkeypatch.setattr(rag_service, "get_pool", _get_pool)
    return _install


@pytest.mark.asyncio
async def test_reretrieve_recovers_miss_when_flag_on(monkeypatch, _patch_pool):
    monkeypatch.setattr(rag_service.settings, "chat_reretrieve_on_miss", True)
    floor = rag_service.HYBRID_FLOOR
    # 원질의(정규화 후)는 미달, 재작성 질의는 통과.
    conn = _Conn({
        "셔틀 있어요?": [_chunk(floor - 0.05)],
        "병원 셔틀버스 운행": [_chunk(floor + 0.2, content="무료 셔틀버스는 운행하지 않습니다.")],
    })
    _patch_pool(conn)
    model = _AnswerRewriteModel(rewrite="병원 셔틀버스 운행", answer="무료 셔틀버스는 운행하지 않습니다.")
    out = await rag_service.rag_answer("셔틀 있어요?", embedder=_Embedder(), model=model)
    assert not out.get("no_answer")                    # 재검색으로 건짐
    assert "셔틀버스" in (out.get("reply") or "")
    assert conn.searched == ["셔틀 있어요?", "병원 셔틀버스 운행"]   # 정확히 2회(1회 재검색)


@pytest.mark.asyncio
async def test_no_reretrieve_when_flag_off(monkeypatch, _patch_pool):
    monkeypatch.setattr(rag_service.settings, "chat_reretrieve_on_miss", False)
    floor = rag_service.HYBRID_FLOOR
    conn = _Conn({"셔틀 있어요?": [_chunk(floor - 0.05)]})
    _patch_pool(conn)
    model = _AnswerRewriteModel(rewrite="병원 셔틀버스 운행", answer="답변")
    out = await rag_service.rag_answer("셔틀 있어요?", embedder=_Embedder(), model=model)
    assert out.get("no_answer") is True                # 플래그 OFF → 재검색 없이 no_answer
    assert conn.searched == ["셔틀 있어요?"]              # 검색 1회뿐


@pytest.mark.asyncio
async def test_no_reretrieve_when_first_search_hits(monkeypatch, _patch_pool):
    monkeypatch.setattr(rag_service.settings, "chat_reretrieve_on_miss", True)
    floor = rag_service.HYBRID_FLOOR
    conn = _Conn({"주차 얼마 나와요?": [_chunk(floor + 0.3, content="30분 무료입니다.")]})
    _patch_pool(conn)
    model = _AnswerRewriteModel(rewrite="주차 요금", answer="30분 무료입니다.")
    out = await rag_service.rag_answer("주차 얼마 나와요?", embedder=_Embedder(), model=model)
    assert not out.get("no_answer")
    assert conn.searched == ["주차 얼마 나와요?"]         # 첫 검색이 통과 → 재검색 안 함
