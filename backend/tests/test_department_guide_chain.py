# Q3: 진료과 추천 체인 — 진단식 다단질문을 없애고 "불명확하면 한 번만 질문, 증상 있으면 바로 추천"으로 통합.
# LLM 행동 자체는 프롬프트에 달렸으므로, 프롬프트가 그 정책을 담는지 + 배선(모델 호출/반환)을 검증한다.
import pytest

from app.services.chat import department_guide_chain as dgc


class _Model:
    def __init__(self, text):
        self._t = text
        self.calls = []

    async def ainvoke(self, msgs):
        self.calls.append(msgs)
        class R:
            content = self._t
        return R()


def test_prompt_removes_diagnostic_multiquestion():
    # 진단식 꼬치질문(언제부터·동반증상·아픈 부위 되묻기)을 금지한다.
    p = dgc.GUIDE_SYSTEM_PROMPT
    assert "언제부터" not in p
    assert "동반" not in p


def test_prompt_asks_once_then_recommends():
    p = dgc.GUIDE_SYSTEM_PROMPT
    assert "한 번만" in p        # 불명확하면 딱 한 번만 질문
    assert "추천" in p           # 증상 있으면 바로 진료과 추천


def test_prompt_allows_two_departments_when_ambiguous():
    # 애매하면 최대 두 곳까지 추천(결정 ②).
    assert "두 곳" in dgc.GUIDE_SYSTEM_PROMPT


@pytest.mark.asyncio
async def test_respond_calls_model_and_returns_text():
    m = _Model("증상을 들으니 내과를 추천드려요. 최종 선택은 확인해 주세요.")
    out = await dgc.respond("머리가 아파요", ["내과", "정형외과"], model=m)
    assert out == "증상을 들으니 내과를 추천드려요. 최종 선택은 확인해 주세요."
    assert len(m.calls) == 1


@pytest.mark.asyncio
async def test_respond_injects_department_names_into_prompt():
    # 목록 밖 진료과를 만들지 않도록 실제 진료과명이 프롬프트에 주입돼야 한다.
    m = _Model("내과를 추천드려요")
    await dgc.respond("배가 아파요", ["내과", "가정의학과"], model=m)
    rendered = "".join(str(msg) for msg in m.calls[0])
    assert "가정의학과" in rendered


@pytest.mark.asyncio
async def test_respond_injects_department_hints_for_mapping():
    # 이름만으론 증상↔과 매핑이 약하다(실측: 생리→이비인후과 오답). 각 과가 '보는 증상' 힌트를
    #   프롬프트에 함께 실어 LLM이 정확히 고르게 한다.
    m = _Model("정형외과를 추천드려요")
    await dgc.respond("무릎이 아파요", ["내과", "정형외과", "이비인후과"], model=m)
    rendered = "".join(str(msg) for msg in m.calls[0])
    assert "관절" in rendered or "허리" in rendered      # 정형외과 힌트
    assert "코막힘" in rendered or "귀" in rendered        # 이비인후과 힌트


def test_prompt_guides_honestly_when_needed_department_absent():
    # 사용자 결정(2026-09-09): 있는 과는 정확히 추천, 없는 과가 필요한 증상은 '어떤 과가 필요한지는
    #   알려주되 가온병원엔 없다'고 정직하게 안내(막다른 길 없이 상담/대안). 없는 과를 우리 예약처럼 말하지 않기.
    p = dgc.GUIDE_SYSTEM_PROMPT
    assert "없" in p and "가온병원" in p        # 없는 과 정직 안내
    assert "상담" in p                            # 대안 경로 안내
