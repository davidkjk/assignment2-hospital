"""시나리오 3 — 전화 예약(슬롯) + 당일 방문 워크인(슬롯 없음).

실제 구현 대조 보정:
- 전화 예약: 제네릭 POST /appointments (staff→예약확정 허용, 슬롯 지정).
- 워크인: 전용 POST /appointments/walkin 을 쓴다. 제네릭 「도착」 경로는 queue_position을
  붙이지 않고, 워크인은 「도착」을 건너뛰고 바로 「진료대기」 줄에 선다(QUEUE-WALK-10).
  → 플랜의 status=="도착"·queue_position is not None 단언은 실제와 달라 진료대기/슬롯없음으로 바꿨다.
"""
import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_03_phone_booking_and_same_day_walkin(client, committed_conn, hospital):
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])

    # 1) 전화 예약: 접수직원이 슬롯을 잡아 바로 예약확정
    res = client.post("/appointments", headers=reception_h, json={
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "reason": "전화 예약", "source": "staff", "initial_status": "예약확정",
        "slot_id": str(hospital["slots"][2]),
    })
    assert res.status_code == 200, res.text

    # 2) 당일 방문(워크인): 슬롯 없이 대기열(진료대기)로 편입
    res = client.post("/appointments/walkin", headers=reception_h, json={
        "patient_id": str(hospital["patient"]["patient_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "reason": "당일 방문",
    })
    assert res.status_code == 200, res.text
    walkin_id = res.json()["appointment_id"]

    row = await committed_conn.fetchrow(
        "select status, slot_id from appointments where id = $1::uuid", walkin_id,
    )
    assert row["status"] == "진료대기"   # 워크인은 도착을 건너뛰고 바로 대기열에 선다
    assert row["slot_id"] is None
