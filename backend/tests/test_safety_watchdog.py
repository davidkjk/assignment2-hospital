import pytest

from app.services.chat.safety_watchdog import (
    check_emergency, EMERGENCY_REPLY, check_repeated, check_escalation, check_staff_request,
    check_department_inquiry, check_diagnosis_request,
    emergency_kind, emergency_reply, EMERGENCY_REPLY_MENTAL)


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


# ── 응급 분기(① 결정 2026-09-09): 신체 응급 vs 마음(정신건강) 위기를 나눠 다른 안내를 낸다 ──

def test_emergency_kind_distinguishes_mental_and_physical():
    assert emergency_kind("죽고 싶어요") == "mental"
    assert emergency_kind("자해했어요") == "mental"
    assert emergency_kind("숨을 못 쉬겠어요") == "physical"
    assert emergency_kind("의식이 없어요 119") == "physical"
    assert emergency_kind("주차 어디에 하나요") is None


def test_mental_crisis_takes_precedence_over_physical():
    # 신체·마음 신호가 함께 있으면 마음 위기 안내가 우선(자살예방 상담을 먼저 준다).
    assert emergency_kind("가슴이 답답하고 죽고 싶어") == "mental"


def test_mental_emergency_reply_has_crisis_hotlines():
    reply = emergency_reply("mental")
    assert reply == EMERGENCY_REPLY_MENTAL
    assert "109" in reply and "1577-0199" in reply     # 자살예방(109)·정신건강 상담(1577-0199)
    assert "119" in reply                              # 즉시 위험 시 119도 함께


def test_physical_emergency_reply_points_to_119_not_hotlines():
    reply = emergency_reply("physical")
    assert reply == EMERGENCY_REPLY and "119" in reply
    assert "1577-0199" not in reply                    # 신체 응급엔 정신건강 상담번호를 넣지 않는다


def test_check_emergency_stays_true_for_both_kinds():
    # 하위호환: check_emergency는 신체·마음 어느 쪽이든 응급으로 True(orchestrator ⓪ 게이트 유지).
    assert check_emergency("죽고 싶어요") is True
    assert check_emergency("숨을 못 쉬겠어요") is True


def test_repeated_triggers_at_threshold():
    hist = ["보험 되나요", "보험 되나요", "다른 얘기"]
    assert check_repeated(hist, "보험 되나요", threshold=3) is True   # 같은 질문 3번째
    assert check_repeated(["보험 되나요"], "주차", threshold=3) is False


def test_department_inquiry_is_rule_based():
    # "어느 과에 가야 하나"류 진료과 문의는 결정적으로 잡아 진료과 안내로 흘려보낸다(요구사항 L49 진료과 선택 도움·L57).
    assert check_department_inquiry("어지럽고 두통이 심한데 어느 과에 가야 할까요") is True
    assert check_department_inquiry("이런 증상은 무슨 과를 가야 하나요") is True
    assert check_department_inquiry("어떤 진료과를 골라야 할지 모르겠어요") is True
    # 진단·치료 요구(진료과 문의 아님)는 잡지 않는다 → medical_judgment 인계 유지(요구사항 L51).
    assert check_department_inquiry("이 두통이 무슨 병인가요") is False
    assert check_department_inquiry("무슨 약을 먹어야 하나요") is False
    # 무관한 문장 오탐 없음.
    assert check_department_inquiry("주차 되나요") is False
    assert check_department_inquiry("검사 결과 어때요") is False


# ── §9.10 P0 인계 재설계(2026-09-10, 사용자 승인): medical_judgment 선판정 제거 ──
# 진단·처방 요구는 결정적 denylist로만 인계, 증상 서술·정책 질문은 정상 갈래로 흐른다.

def test_diagnosis_request_is_rule_based():
    # 진짜 진단·처방·결과해석 요구는 결정적으로 잡아 직원 인계(요구사항 1.5: 봇은 진단·약추천 금지).
    assert check_diagnosis_request("저 이게 무슨 병인가요? 암일까요?") is True   # 진단(병명·암) 요구
    assert check_diagnosis_request("이 두통이 무슨 병인가요") is True
    assert check_diagnosis_request("무슨 약을 먹어야 하나요") is True             # 약 요구
    assert check_diagnosis_request("이 약을 얼마나 먹어야 낫나요?") is True       # 복용량 요구(골든 safety-prescription-01)
    assert check_diagnosis_request("검사 결과 해석 좀 해주세요") is True          # 결과 해석 요구
    # 증상 서술·정책 질문·진료과 문의·검사준비는 진단요구가 아니다 → 봇이 답하거나 진료과 추천.
    assert check_diagnosis_request("배가 아파요") is False                       # 증상 서술 → dept_guide
    assert check_diagnosis_request("어지럽고 두통이 심한데 어느 과에 가야 할까요") is False  # 진료과 문의
    assert check_diagnosis_request("마스크 꼭 써야 하나요?") is False            # 정책 질문(KB "권장")
    assert check_diagnosis_request("검사 결과 언제 나오나요?") is False          # 결과 "언제"=안내(해석 아님)
    assert check_diagnosis_request("CT 조영제 검사 전에 준비할 게 있나요?") is False  # 검사준비=KB rag


@pytest.mark.asyncio
async def test_diagnosis_request_escalates_deterministically_without_model():
    # 진단·처방 요구는 LLM 없이 결정적으로 medical_judgment 인계(선판정 LLM 제거 → 결정적 denylist).
    assert await check_escalation("이 두통이 무슨 병인가요", []) == "medical_judgment"
    assert await check_escalation("이 약을 얼마나 먹어야 낫나요?", []) == "medical_judgment"


@pytest.mark.asyncio
async def test_symptom_and_policy_questions_do_not_escalate():
    # §9.10 P0 핵심 수정: 증상 서술·정책 질문은 인계로 새지 않고 정상 갈래(dept_guide/rag)로 흐른다.
    # (오인계 실사례: "배가 아파"→직원연결, "마스크 꼭 써야 하나요?"→medical 5/5 오분류)
    class NoneModel:
        async def ainvoke(self, _):
            class R: content = "none"
            return R()
    assert await check_escalation("배가 아파요", [], model=NoneModel()) is None
    assert await check_escalation("마스크 꼭 써야 하나요?", [], model=NoneModel()) is None
    # 진료과 문의도 인계 아님(요구사항 L49·L57 진료과 선택 도움).
    assert await check_escalation("어지럽고 두통이 심한데 어느 과에 가야 할까요", [], model=NoneModel()) is None


@pytest.mark.asyncio
async def test_escalation_no_longer_asks_llm_for_medical_judgment():
    # LLM이 medical_judgment를 답해도(구 오분류) 더는 인계하지 않는다 — 진단요구는 denylist가 전담.
    # 이 케이스는 denylist에 안 걸리는 증상 서술이므로 정상 갈래로 흘러야 한다.
    class MedModel:
        async def ainvoke(self, _):
            class R: content = "medical_judgment"
            return R()
    assert await check_escalation("배가 아파요", [], model=MedModel()) is None


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
