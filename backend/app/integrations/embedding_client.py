import httpx

from app.core.config import settings
from app.core.errors import AppError, log_error

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"


class EmbeddingClient:
    def __init__(self, api_key: str):
        self._api_key = api_key

    async def embed(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=30) as http:
            resp = await http.post(
                OPENAI_EMBEDDINGS_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"model": settings.embedding_model, "input": texts},
            )
        if resp.status_code != 200:
            # log_error는 async — await 없이 부르면 코루틴만 만들고 로그가 조용히 유실된다.
            await log_error(
                "embedding",
                f"OpenAI 임베딩 실패: {resp.status_code} {resp.text[:200]}",
            )
            raise AppError("자료 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.", 502)
        # OpenAI 배치 응답은 순서가 뒤섞여 올 수 있어 index로 질문↔벡터 짝을 복원한다.
        data = sorted(resp.json()["data"], key=lambda d: d["index"])
        return [d["embedding"] for d in data]


def get_embedding_client() -> EmbeddingClient:
    return EmbeddingClient(api_key=settings.openai_api_key)
