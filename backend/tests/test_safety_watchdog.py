import pytest

from app.services.chat.safety_watchdog import (
    check_emergency, EMERGENCY_REPLY, check_repeated, check_escalation, check_staff_request)


def test_explicit_staff_request_is_rule_based():
    # 명시적 직원 연결 요청은 AI 없이 결정적으로 잡아 바로 인계(정본 §1 인계조건 신설).
    assert check_staff_request("직원에게 연결해줘") is True
    assert check_staff_request("상담원 바꿔주세요") is True
    assert check_staff_request("그냥 사람이랑 연결하고 싶어요") is True
    assert check_staff_request("직원에게 문의할게요") is True
    # 단순 언급(연결 의도어 없음)은 오탐하지 않는다.
    assert check_staff_request("직원분들 정말 친절하시네요") is False
    assert check_staff_request("주차 되나요?") is False
    # 직원요청이 응급으로 오탐되지 않는다(서로 독립 조건).
    assert check_emergency("직원 연결해줘") is False


def test_emergency_is_rule_based_and_deterministic():
    # AI 호출 없이 키워드로 결정적으로 잡는다(정본 §0·옛 플랜 :30).
    assert check_emergency("숨을 못 쉬겠어요") is True
    assert check_emergency("의식이 없어요 119") is True
    assert check_emergency("가슴이 너무 아파요") is True
    assert check_emergency("주차 어디에 하나요") is False


def test_emergency_reply_points_to_119():
    assert "119" in EMERGENCY_REPLY and "응급" in EMERGENCY_REPLY


def test_repeated_triggers_at_threshold():
    hist = ["보험 되나요", "보험 되나요", "다른 얘기"]
    assert check_repeated(hist, "보험 되나요", threshold=3) is True   # 같은 질문 3번째
    assert check_repeated(["보험 되나요"], "주차", threshold=3) is False


@pytest.mark.asyncio
async def test_escalation_deterministic_paths_need_no_model():
    # 명시 플래그·검색 실패·반복은 AI 없이 결정된다.
    assert await check_escalation("아무 말", [], unhelpful_flagged=True) == "unhelpful"
    assert await check_escalation("아무 말", [], no_answer=True) == "no_answer"
    assert await check_escalation("보험", ["보험", "보험"], no_answer=False) == "repeated"


@pytest.mark.asyncio
async def test_escalation_llm_judged_uses_injected_model():
    # medical_judgment/complaint/data_mismatch는 주입 모델이 라벨을 준다(없으면 None).
    class FakeModel:
        async def ainvoke(self, _):
            class R: content = "complaint"
            return R()
    assert await check_escalation("접수원이 불친절했어요", [], model=FakeModel()) == "complaint"

    class NoneModel:
        async def ainvoke(self, _):
            class R: content = "none"
            return R()
    assert await check_escalation("진료시간 알려줘", [], model=NoneModel()) is None
