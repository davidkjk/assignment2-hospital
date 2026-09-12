import httpx
import pytest

from app.integrations.embedding_client import EmbeddingClient


@pytest.mark.asyncio
async def test_embed_returns_1536_dim_vectors_in_order(monkeypatch):
    async def fake_post(self, url, **kwargs):
        assert url.endswith("/embeddings")
        texts = kwargs["json"]["input"]
        # 응답 index를 일부러 뒤섞어 순서 복원을 검증한다.
        data = [{"index": i, "embedding": [float(i)] * 1536} for i in range(len(texts))]
        return httpx.Response(200, json={"data": list(reversed(data))},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    client = EmbeddingClient(api_key="test-key")
    vectors = await client.embed(["주차 되나요?", "진료시간 알려주세요"])
    assert len(vectors) == 2
    assert len(vectors[0]) == 1536
    assert vectors[0][0] == 0.0 and vectors[1][0] == 1.0  # index 순서 복원됨


@pytest.mark.asyncio
async def test_embed_raises_korean_apperror_on_failure(monkeypatch):
    async def fake_post(self, url, **kwargs):
        return httpx.Response(500, json={"error": "boom"},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    from app.core.errors import AppError
    client = EmbeddingClient(api_key="test-key")
    with pytest.raises(AppError) as exc:
        await client.embed(["질문"])
    assert "다시 시도" in exc.value.message  # 파이썬 예외 원문 노출 금지, 한글 안내


@pytest.mark.asyncio
async def test_fake_embedder_returns_1536_dim(fake_embedder):
    vectors = await fake_embedder.embed(["a", "bb"])
    assert len(vectors) == 2 and all(len(v) == 1536 for v in vectors)
    assert fake_embedder.calls == [["a", "bb"]]  # 호출 인자를 기록해 재임베딩 테스트가 검사
