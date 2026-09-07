"""웹 상담봇 예약 앞흐름 — 로그인 전 카탈로그 탐색(navigate_booking) + 로그인 후 대상 선택.

늦은 관문(④): 진료과·의사·날짜·시간은 로그인 전(익명)에 고른다 → navigate_booking(환자 없이 conn 기반).
대상 선택(pick_target)은 로그인 후(revalidate_action).

전역 conftest `_cleanup_committed_data`(autouse)가 시딩한 department·staff·slot을 매 테스트 뒤 정리한다.
챗봇 테이블은 안 건드리므로 이 파일엔 _wipe_chat이 없다(test_webchat_cards와 분리한 이유).
"""
from datetime import date, timedelta

import pytest

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services.chat import webchat_service
from tests.conftest import seed_patient, seed_staff


def _ctx(s):
    return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


async def _seed_dept_doctor_slot(conn) -> dict:
    """진료과 1 + 의사 1(진료시간 등록) + 빈시간 슬롯 1(오늘+7). navigate/target 테스트 공용 하네스."""
    dept = await conn.fetchval(
        "insert into departments (name, is_active) values ('테스트예약과', true) returning id")
    doc = await seed_staff(conn, role="doctor", department_id=dept)
    await conn.execute("update staff set name='김예약', specialty='소화기' where id=$1", doc["staff_id"])
    # BOOK-DOC-10: 진료시간이 하나라도 있어야 _list_doctors_public에 뜬다.
    await conn.execute(
        "insert into doctor_schedule_rules (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments) "
        "values ($1,0,'09:00','12:00',20,10)", doc["staff_id"])
    slot_date = date.today() + timedelta(days=7)
    slot_id = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1,$2,'10:00','빈시간') returning id", doc["staff_id"], slot_date)
    return {"department_id": dept, "doctor_id": doc["staff_id"], "slot_id": slot_id,
            "slot_date": str(slot_date), "slot_at": f"{slot_date}T10:00:00"}


@pytest.mark.asyncio
async def test_navigate_pick_department_returns_doctor_card(committed_conn):
    # [WEBBOOK-02] pick_department → 그 과 의사 선택 카드(로그인 전, 환자 없이)
    dep = await _seed_dept_doctor_slot(committed_conn)
    out = await webchat_service.navigate_booking(
        {"kind": "pick_department", "payload": {"department_id": str(dep["department_id"])}})
    card = out["payload"]
    assert card["card_type"] == "doctor_select"
    assert card["department_id"] == str(dep["department_id"])
    assert any(d["id"] == str(dep["doctor_id"]) for d in card["doctors"])


@pytest.mark.asyncio
async def test_navigate_pick_doctor_returns_date_card(committed_conn):
    # [WEBBOOK-03] pick_doctor → 예약 가능 날짜 카드
    dep = await _seed_dept_doctor_slot(committed_conn)
    out = await webchat_service.navigate_booking(
        {"kind": "pick_doctor", "payload": {"department_id": str(dep["department_id"]),
                                            "doctor_id": str(dep["doctor_id"])}})
    card = out["payload"]
    assert card["card_type"] == "date_select"
    assert dep["slot_date"] in [d["date"] for d in card["dates"]]


@pytest.mark.asyncio
async def test_navigate_pick_date_returns_time_card(committed_conn):
    # [WEBBOOK-04] pick_date → 그날 시간 선택 카드(기존 build_time_select_card 재사용)
    dep = await _seed_dept_doctor_slot(committed_conn)
    out = await webchat_service.navigate_booking(
        {"kind": "pick_date", "payload": {"department_id": str(dep["department_id"]),
                                          "doctor_id": str(dep["doctor_id"]), "date": dep["slot_date"]}})
    card = out["payload"]
    assert card["card_type"] == "time_select" and card["state"] == "정상"
    # 시간 후보 payload가 다음 단계로 slot_id·slot_at·dep·doc를 나른다(서버 무상태)
    assert all({"slot_id", "slot_at", "department_id", "doctor_id"} <= set(c) for c in card["candidates"])
    assert any(c["slot_id"] == str(dep["slot_id"]) for c in card["candidates"])


@pytest.mark.asyncio
async def test_navigate_unknown_kind_rejected():
    # 위변조·오타 kind는 400(막다른 길이 아니라 명확한 거절)
    with pytest.raises(AppError):
        await webchat_service.navigate_booking({"kind": "pick_bogus", "payload": {}})
