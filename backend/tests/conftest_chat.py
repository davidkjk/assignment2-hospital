import pytest


class FakeEmbedder:
    """네트워크 없이 결정적 벡터를 돌려주는 임베더. Task 6·7 테스트가 EmbeddingClient 대신 주입한다."""

    def __init__(self, dim: int = 1536):
        self._dim = dim
        self.calls: list[list[str]] = []

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        # 텍스트 길이로 첫 성분만 달리해 서로 구분 가능한 벡터를 만든다(유사도 테스트용).
        return [[float(len(t) % 7)] + [0.1] * (self._dim - 1) for t in texts]


@pytest.fixture
def fake_embedder() -> FakeEmbedder:
    return FakeEmbedder()
