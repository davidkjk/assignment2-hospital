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


async def seed_chat_thread(conn, *, patient_id=None, anonymous_session_id=None):
    """chat_threads 한 행을 만들고 id를 돌려준다. owner_type은 넘긴 소유자로 자동 판정.
    익명 세션 FK는 Task 3 전이므로 여기선 아무 uuid나 받는다(제약·트리거 테스트용)."""
    if patient_id is not None:
        return await conn.fetchval(
            "insert into chat_threads (owner_type, patient_id) values ('patient', $1) returning id",
            patient_id)
    return await conn.fetchval(
        "insert into chat_threads (owner_type, anonymous_session_id) values ('anonymous_web', $1) returning id",
        anonymous_session_id)
