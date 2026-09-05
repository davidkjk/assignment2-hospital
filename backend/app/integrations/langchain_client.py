from langchain_anthropic import ChatAnthropic

from app.core.config import settings


def get_chat_model(model: str | None = None) -> ChatAnthropic:
    # 단일 생성 지점(심). 오케스트레이션(Task 5)은 이 팩토리로만 모델을 얻고,
    # 자동 테스트는 여기서 얻은 모델 대신 주입된 가짜 모델을 쓴다. 키가 비어 있어도
    # 생성 자체는 네트워크를 태우지 않는다 — 실제 호출은 손검수·배포에서 키가 있을 때만.
    return ChatAnthropic(
        model=model or settings.chat_model,
        api_key=settings.anthropic_api_key,
        max_tokens=2048,
    )


def resp_text(resp) -> str:
    """LLM 응답 content를 문자열로 정규화한다.

    실제 ChatAnthropic은 `.content`를 **블록 리스트**(`[{'type':'text','text':...}]`)로
    줄 수 있다 — 심(stub) 모델은 문자열을 줘서 `.strip()`이 통과했지만, 진짜 모델에선
    `'list' object has no attribute 'strip'`로 터진다. 호출부는 `resp_text(resp).strip()`처럼
    이 함수를 거친 뒤 문자열 연산을 한다.
    """
    content = getattr(resp, "content", resp)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                parts.append(block.get("text", ""))
            else:
                parts.append(getattr(block, "text", ""))
        return "".join(parts)
    return str(content)
