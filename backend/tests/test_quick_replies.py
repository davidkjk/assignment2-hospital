import pytest

from app.services.chat import quick_replies as qr


def test_start_bundles_are_fixed_and_ai_free():
    assert qr.build_start_quick_replies(True) == qr.START_WITH_UPCOMING
    assert qr.build_start_quick_replies(False) == qr.START_NO_UPCOMING
    assert "주차할 수 있나요" in qr.build_start_quick_replies(True)


@pytest.mark.asyncio
async def test_conversational_returns_up_to_4_on_success():
    class M:
        async def ainvoke(self, _):
            class R: content = "질문1\n질문2\n질문3\n질문4\n질문5"
            return R()
    out = await qr.generate_conversational("주차는 지하 1층입니다", model=M())
    assert out == ["질문1", "질문2", "질문3", "질문4"]   # 3~4개 제한


@pytest.mark.asyncio
async def test_conversational_failure_is_silent():
    class Boom:
        async def ainvoke(self, _):
            raise RuntimeError("llm down")
    assert await qr.generate_conversational("x", model=Boom()) == []   # 빈 목록, 상담 오류로 확대 안 함
