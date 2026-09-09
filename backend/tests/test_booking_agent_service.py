"""예약 agent(agent_fn 구현체) 순수 단위 테스트 — DB 불필요(조회 함수 주입).

orchestrate가 route='agent'로 잡으면 이 agent_fn을 부른다. 지금까지 비어 있어(orchestrator.py:59)
예약이 action_unavailable 인계로 빠지던 막다른 길의 해소.
"""
import pytest

from app.services.chat import booking_agent_service


def _departments_fn(departments):
    async def f():
        return departments
    return f


def _doctors_fn(doctors):
    async def f(department_id):
        return doctors
    return f


@pytest.mark.asyncio
async def test_booking_intent_returns_department_card():
    # [WEBBOOK-01] "예약할래요" → 진료과 선택 카드(막다른 길 아님)
    out = await booking_agent_service.booking_agent(
        None, "예약할래요",
        list_departments_fn=_departments_fn([{"id": "d1", "name": "내과"}, {"id": "d2", "name": "정형외과"}]))
    assert out["reply"]                                  # 비어 있지 않음(빈 봇 텍스트 금지)
    assert out["card"]["card_type"] == "department_select"
    assert len(out["card"]["departments"]) == 2


@pytest.mark.asyncio
async def test_named_department_shortcut_to_doctor_card():
    # [WEBBOOK-01b] "내과 예약하고 싶어요" → 진료과 이미 정해짐 → 의사 카드 지름길 + 증상칩 숨김
    out = await booking_agent_service.booking_agent(
        None, "내과 예약하고 싶어요",
        list_departments_fn=_departments_fn([{"id": "d1", "name": "내과"}]),
        list_doctors_fn=_doctors_fn([{"id": "s1", "name": "김의사", "specialty": "소화기", "schedule_summary": "월"}]))
    assert out["card"]["card_type"] == "doctor_select"
    assert out["card"]["department_id"] == "d1"
    assert out["card"]["doctors"][0]["name"] == "김의사"


@pytest.mark.asyncio
async def test_named_department_with_no_doctors_still_reaches_doctor_card_empty():
    # [WEBBOOK-01b] 진료과명 지름길인데 가용 의사 0이어도 막다른 길이 아니라 빈 의사 카드(다른 과 경로는 프론트)
    out = await booking_agent_service.booking_agent(
        None, "정형외과 예약", list_departments_fn=_departments_fn([{"id": "d2", "name": "정형외과"}]),
        list_doctors_fn=_doctors_fn([]))
    assert out["card"]["card_type"] == "doctor_select" and out["card"]["state"] == "빈"


@pytest.mark.asyncio
async def test_cancel_intent_returns_guidance_not_booking_card():
    # [WEBCHAT-CANCEL-GUIDE] 요구사항 L49: 상담봇은 예약 변경·취소를 '안내'만 한다(실행 아님).
    # "예약을 취소하고 싶어요" → 예약 진료과 카드가 아니라 안내(앱/직원상담) + [직원에게 연결] 칩.
    out = await booking_agent_service.booking_agent(
        None, "예약을 취소하고 싶어요",
        list_departments_fn=_departments_fn([{"id": "d1", "name": "내과"}]))
    assert out["reply"]                                   # 안내 문구 비어 있지 않음
    assert "앱" in out["reply"]                            # 앱에서 직접 취소 가능 안내
    assert out["card"]["card_type"] == "quick_replies"    # 예약 카드(department_select) 아님
    assert out["card"]["handoff_chip"] == "직원에게 연결하기"    # 직원 상담 칩


@pytest.mark.asyncio
async def test_cancel_intent_takes_priority_over_department_name():
    # [WEBCHAT-CANCEL-GUIDE] 진료과명이 함께 있어도 취소가 우선 — 예약 지름길(의사 카드)로 새지 않는다.
    out = await booking_agent_service.booking_agent(
        None, "내과 예약 취소해줘",
        list_departments_fn=_departments_fn([{"id": "d1", "name": "내과"}]),
        list_doctors_fn=_doctors_fn([{"id": "s1", "name": "김의사"}]))
    assert out["card"]["card_type"] == "quick_replies"
    assert out["card"]["handoff_chip"] == "직원에게 연결하기"


@pytest.mark.asyncio
async def test_wizard_handoff_returns_open_wizard_card():
    # [BOOK-BOT-WIZARD] 앱 경로 예약 의도 → 예약 마법사 인계 카드(대화 내 예약 아님, 결정 B)
    out = await booking_agent_service.booking_wizard_handoff(
        None, "예약하고 싶어요", list_departments_fn=_departments_fn([{"id": "d1", "name": "내과"}]))
    assert out["reply"]
    assert out["card"]["card_type"] == "open_booking_wizard"
    assert out["card"]["department_id"] is None       # 과 미지정 → 프리필 없음


@pytest.mark.asyncio
async def test_wizard_handoff_prefills_named_department():
    # [BOOK-BOT-WIZARD] 진료과명이 있으면 마법사 프리필용으로 실어 보낸다
    out = await booking_agent_service.booking_wizard_handoff(
        None, "내과 예약할래요", list_departments_fn=_departments_fn([{"id": "d1", "name": "내과"}]))
    assert out["card"]["card_type"] == "open_booking_wizard"
    assert out["card"]["department_id"] == "d1" and out["card"]["department_name"] == "내과"


@pytest.mark.asyncio
async def test_wizard_handoff_cancel_intent_returns_guidance_not_wizard_card():
    # [BOOK-BOT-WIZARD-CANCEL] 앱 AI 상담도 취소를 실행하지 않고 안내한다(요구사항 L49, 사용자 결정 2026-09-08).
    # 웹과 달리 사용자가 이미 앱 안에 있으므로 앱 내 [예약 내역] 화면으로 안내한다 → 예약 마법사 카드로 새지 않는다.
    out = await booking_agent_service.booking_wizard_handoff(
        None, "예약을 취소하고 싶어요",
        list_departments_fn=_departments_fn([{"id": "d1", "name": "내과"}]))
    assert out["reply"]                                    # 안내 문구 비어 있지 않음
    assert "예약 내역" in out["reply"]                       # 앱 내 취소 화면으로 안내(웹의 '앱의…'와 다름)
    assert out["card"]["card_type"] == "quick_replies"     # 예약 마법사 카드(open_booking_wizard) 아님
    assert out["card"]["handoff_chip"] == "직원에게 연결하기"      # 직원 상담 칩(막다른 길 방지)


@pytest.mark.asyncio
async def test_wizard_handoff_cancel_takes_priority_over_department_name():
    # [BOOK-BOT-WIZARD-CANCEL] 진료과명이 함께 있어도 취소가 우선 — 마법사 프리필로 새지 않는다.
    out = await booking_agent_service.booking_wizard_handoff(
        None, "내과 예약 취소해줘",
        list_departments_fn=_departments_fn([{"id": "d1", "name": "내과"}]))
    assert out["card"]["card_type"] == "quick_replies"
    assert out["card"]["handoff_chip"] == "직원에게 연결하기"
