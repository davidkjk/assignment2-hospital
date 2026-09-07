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
