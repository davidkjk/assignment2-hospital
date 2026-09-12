"""시나리오 6 — 휴진 등록 → 영향받는 예약 조회 → 재조정.

실제 구현 대조 보정:
- 영향 조회: GET /schedule/affected?exception_id=<휴진 행 id> (플랜의 ?doctor_id= 아님).
- 재조정: POST /appointments/{id}/reschedule, body {new_start_at, reason} (플랜의 new_slot_id 아님 —
  임의 시각으로 옮긴다).
- 재조정 성공 후 「그 휴진의 영향 목록에서 빠졌다」로 검증(내부 slot 컬럼 의존 회피).
"""
from datetime import datetime, time as dtime
from zoneinfo import ZoneInfo

import pytest

from tests.scenarios.conftest import bearer

KST = ZoneInfo("Asia/Seoul")


@pytest.mark.asyncio
async def test_scenario_06_closure_lists_affected_and_reschedules(client, committed_conn, hospital):
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])
    doctor_id = hospital["doctor"]["staff_id"]

    # 내일 09:00 슬롯(slots[0])에 확정 예약
    res = client.post("/appointments", headers=reception_h, json={
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(doctor_id),
        "reason": "재진", "source": "staff", "initial_status": "예약확정",
        "slot_id": str(hospital["slots"][0]),
    })
    assert res.status_code == 200, res.text
    appointment_id = res.json()["appointment_id"]

    # 내일 휴진 등록 → exception_id 확보
    exception_id = await committed_conn.fetchval(
        "insert into doctor_schedule_exceptions (doctor_id, exception_date, is_closed) "
        "values ($1, current_date + 1, true) returning id",
        doctor_id,
    )

    # 영향받는 예약 조회 (실제 계약: exception_id 기준)
    res = client.get(f"/schedule/affected?exception_id={exception_id}", headers=reception_h)
    assert res.status_code == 200, res.text
    affected_ids = [str(a["id"]) for a in res.json()]
    assert str(appointment_id) in affected_ids

    # 모레 09:00로 재조정 (임의 시각 new_start_at) — DB current_date 기준으로 날짜 계산
    target_date = await committed_conn.fetchval("select current_date + 2")
    new_start = datetime.combine(target_date, dtime(9, 0), tzinfo=KST)
    res = client.post(f"/appointments/{appointment_id}/reschedule", headers=reception_h, json={
        "new_start_at": new_start.isoformat(), "reason": "의사 휴진으로 일정 변경",
    })
    assert res.status_code == 200, res.text

    # 재조정 후: 예약은 여전히 활성(예약확정), 그리고 그 휴진의 영향 목록에서 빠졌다
    status = await committed_conn.fetchval(
        "select status from appointments where id = $1::uuid", appointment_id)
    assert status == "예약확정"

    res = client.get(f"/schedule/affected?exception_id={exception_id}", headers=reception_h)
    affected_after = [str(a["id"]) for a in res.json()]
    assert str(appointment_id) not in affected_after
