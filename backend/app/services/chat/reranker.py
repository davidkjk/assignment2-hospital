import json
import logging

from app.core.config import settings
from app.integrations.langchain_client import get_chat_model, resp_text

logger = logging.getLogger(__name__)

# 리랭킹용 발췌 길이(토큰 절감). 답변 생성엔 여전히 본문 전체를 쓰고, 여기선 관련도 판단용 앞부분만.
RERANK_SNIPPET_CHARS = 500

_RERANK_SYSTEM_PROMPT = (
    "너는 검색 결과 재정렬기다. 아래 후보 문서들이 사용자 질문에 답하는 데 얼마나 관련 있는지 "
    "각각 0~1 점수로 채점하라. 답을 지어내지 말고 관련도만 판단한다. 설명 없이 "
    'JSON만 낸다: {"scores": [{"index": <번호>, "score": <0~1>}]}'
)


def _build_candidate_list(chunks: list[dict]) -> str:
    lines = []
    for i, c in enumerate(chunks):
        snippet = (c.get("content") or "")[:RERANK_SNIPPET_CHARS]
        lines.append(f"[{i}] 제목: {c.get('title', '')}\n{snippet}")
    return "\n\n".join(lines)


def _parse_scores(text: str) -> dict[int, float]:
    # 모델 출력에서 첫 '{' ~ 마지막 '}'만 떼어 JSON 파싱(설명 문장이 앞뒤에 붙어도 안전).
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no json object")
    data = json.loads(text[start:end + 1])
    out: dict[int, float] = {}
    for item in data["scores"]:
        out[int(item["index"])] = float(item["score"])
    return out


async def rerank_by_llm(query: str, chunks: list[dict], *, model=None) -> list[dict]:
    """RRF 후보를 Haiku가 매긴 관련도 점수로 재정렬한다(순서만 바꿈).

    어떤 실패(가짜/미지원 모델·파싱 실패·빈 응답·예외)에도 예외를 던지지 않고 현행
    _rank_by_relevance(chunks)로 폴백한다 — 리랭커는 '더 좋게만, 나쁘게는 안' 만든다.
    """
    # 지연 import: reranker↔rag_service 순환 방지(rag_service가 이 모듈을 top에서 import).
    from app.services.chat.rag_service import _rank_by_relevance

    if not chunks:
        return chunks
    llm = model or get_chat_model(settings.classify_model)
    try:
        messages = [
            ("system", _RERANK_SYSTEM_PROMPT),
            ("human", f"질문: {query}\n\n후보:\n{_build_candidate_list(chunks)}"),
        ]
        resp = await llm.ainvoke(messages)
        score_map = _parse_scores(resp_text(resp))
    except Exception as exc:  # 파싱·모델·네트워크 등 어떤 실패든 안전 폴백
        logger.info("reranker fallback (%s): %s", type(exc).__name__, exc)
        return _rank_by_relevance(chunks)
    # 정렬 키 = (리랭커 점수, 동점이면 기존 max(벡터,키워드)) 내림차순. 누락 후보는 -1로 뒤에 보존.
    order = sorted(
        range(len(chunks)),
        key=lambda i: (score_map.get(i, -1.0),
                       max(chunks[i]["similarity"], chunks[i]["keyword_sim"])),
        reverse=True,
    )
    return [chunks[i] for i in order]
