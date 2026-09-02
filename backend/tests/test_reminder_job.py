from datetime import date, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.services.patient_questionnaire_service import build_reminder_body
from tests.conftest import seed_patient, seed_staff


async def _seed_confirmed_appointment(conn, slot_date_offset: int, *, owner=None, member_name=None):
    """확정 예약 1건. member_name을 주면 가족 예약(account≠for)으로 만든다 — 계정 소유자와 진료 대상자가 다르다."""
    dept_id = await conn.fetchval("insert into departments (name) values ('리마인더과') returning id")
    doctor = await seed_staff(conn, role="doctor", department_id=dept_id)
    receptionist = await seed_staff(conn, role="receptionist")
    owner = owner or await seed_patient(conn, name="리마인더환자", phone="01088887777")
    for_patient = owner
    if member_name:
        for_patient = await seed_patient(conn, name=member_name, phone="01077776666")
    slot_id = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) "
        "values ($1, current_date + $2::int, '10:00') returning id",
        doctor["staff_id"], slot_date_offset,
    )
    await conn.execute("update appointment_slots set status = '예약됨' where id = $1", slot_id)
    await conn.execute(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, "
        "doctor_id, reason, status, source, created_by) "
        "values ($1, $2, $3, $4, $5, '검진', '예약확정', 'staff', $6)",
        slot_id, owner["patient_id"], for_patient["patient_id"], dept_id,
        doctor["staff_id"], receptionist["staff_id"],
    )
    return owner["patient_id"], for_patient["patient_id"]


@pytest.mark.asyncio
async def test_send_reminders_routes_today_and_day_before(committed_conn):
    """[리마인더] 확정 예약은 오늘=reminder_today·내일=reminder_day_before로 라우팅한다 — 죽은 옛 이름(reminder_tomorrow)을 쓰지 않는다(개정 2)."""
    today_owner, _ = await _seed_confirmed_appointment(committed_conn, 0)
    tomorrow_owner, _ = await _seed_confirmed_appointment(committed_conn, 1)
    with patch("app.jobs.reminders.notification_service") as ns, \
         patch("app.jobs.reminders.qsvc") as qsvc:
        ns.notify_patient = AsyncMock()
        qsvc.list_reminder_targets = AsyncMock(return_value=[])   # 이 테스트는 확정 리마인더만 본다
        from app.jobs.reminders import send_reminders
        counts = await send_reminders()
    routed = {(str(c.args[0]), c.args[1]) for c in ns.notify_patient.await_args_list}
    types = {t for _, t in routed}
    assert (str(today_owner), "reminder_today") in routed
    assert (str(tomorrow_owner), "reminder_day_before") in routed
    assert "reminder_tomorrow" not in types                       # NOTI-GO-01·제목 맵에 없는 죽은 이름
    assert counts["reminder_today"] >= 1 and counts["reminder_day_before"] >= 1


@pytest.mark.asyncio
async def test_reminder_goes_to_account_owner_with_target_name(committed_conn):
    """[리마인더] 가족 예약은 계정 소유자에게 가고 대상자 이름을 target_name으로 넘긴다 — 진료 대상자에게 직접 보내지 않는다(개정 3 · 가족 예약 누락 방지)."""
    owner, member = await _seed_confirmed_appointment(committed_conn, 1, member_name="김어머니")
    with patch("app.jobs.reminders.notification_service") as ns, \
         patch("app.jobs.reminders.qsvc") as qsvc:
        ns.notify_patient = AsyncMock()
        qsvc.list_reminder_targets = AsyncMock(return_value=[])
        from app.jobs.reminders import send_reminders
        await send_reminders()
    recipients = {str(c.args[0]) for c in ns.notify_patient.await_args_list}
    assert str(owner) in recipients and str(member) not in recipients   # 소유자에게만
    call = next(c for c in ns.notify_patient.await_args_list if str(c.args[0]) == str(owner))
    assert call.args[1] == "reminder_day_before" and call.kwargs["target_name"] == "김어머니"


@pytest.mark.asyncio
async def test_questionnaire_reminder_consumes_t24_and_skips_zero_total(committed_conn):
    """[QNR-NOTI-01] 사전문진 알림은 T24 list_reminder_targets/build_reminder_body를 소비한다 — 0문항 진료과는 건너뛰고(개정 4), 남은 수를 계정 소유자에게 보낸다."""
    owner_a, appt_a = uuid4(), uuid4()   # 작성 중(3문항 중 1개) → 대상
    owner_b, appt_b = uuid4(), uuid4()   # 문진 없는 진료과(0문항) → 건너뜀
    with patch("app.jobs.reminders.notification_service") as ns, \
         patch("app.jobs.reminders.qsvc") as qsvc:
        ns.notify_patient = AsyncMock()
        qsvc.list_reminder_targets = AsyncMock(return_value=[
            {"appointment_id": appt_a, "account_patient_id": owner_a, "target_name": None,
             "state": "작성 중", "answered": 1, "total": 3},
            {"appointment_id": appt_b, "account_patient_id": owner_b, "target_name": None,
             "state": "미작성", "answered": 0, "total": 0},
        ])
        qsvc.build_reminder_body = build_reminder_body   # 문구 규칙은 T24 소유 — 실제 함수를 그대로 소비
        from app.jobs.reminders import send_reminders
        counts = await send_reminders()
    qnr = [c for c in ns.notify_patient.await_args_list if c.args[1] == "questionnaire_missing"]
    assert len(qnr) == 1                                  # 0문항(appt_b)은 건너뛴다
    assert qnr[0].args[0] == owner_a                      # 계정 소유자에게(개정 3)
    assert qnr[0].kwargs["remaining"] == 2                # 3 − 1 = 2 (QNR-NOTI-04, T24 소유)
    assert counts["questionnaire"] == 1
