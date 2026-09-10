# 이해 계층(분류·라우팅·재작성·인계판정)용 모델을 답변 모델과 분리한다(속도).
#   프로덕션(ChatAnthropic)이면 빠른 classify_model(Haiku)로 바꾸고, 테스트 주입 가짜는 그대로 둔다(오프라인).
from langchain_anthropic import ChatAnthropic

from app.core.config import settings
from app.integrations.langchain_client import classify_model_for, get_chat_model


def test_classify_model_for_swaps_real_model_to_classify_model():
    answer = get_chat_model()                          # 실제 ChatAnthropic(답변=Sonnet)
    clf = classify_model_for(answer)
    assert isinstance(clf, ChatAnthropic)
    assert clf.model == settings.classify_model        # 이해 계층은 빠른 모델(Haiku)로 교체
    assert answer.model == settings.chat_model          # 답변 모델은 그대로 유지(분리 확인)


def test_classify_model_for_keeps_injected_fake_offline():
    # 테스트가 주입한 가짜 모델(ChatAnthropic 아님)은 그대로 반환 — 분류도 같은 가짜를 써 오프라인 유지.
    class _Fake:
        async def ainvoke(self, _): ...
    fake = _Fake()
    assert classify_model_for(fake) is fake
