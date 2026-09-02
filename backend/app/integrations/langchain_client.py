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
