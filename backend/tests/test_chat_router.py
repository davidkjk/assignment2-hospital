import pytest

from app.services.chat.chat_router import classify


class _Model:
    def __init__(self, label): self._label = label
    async def ainvoke(self, _):
        class R: content = self._label
        return R()


@pytest.mark.asyncio
async def test_active_flow_is_not_reclassified():
    # 진행 중 문진은 라우터를 타지 않는다(누수 방지).
    assert await classify("갑자기 예약하고 싶어요", active_flow="department_guide", model=_Model("agent")) == "department_guide"


@pytest.mark.asyncio
async def test_unknown_label_falls_back_to_rag():
    assert await classify("음", model=_Model("weird")) == "rag"
