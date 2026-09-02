"""시나리오 8 — 같은 슬롯 이중 예약 차단(중복 클릭/동시 접수 재연).

⚠️ request_id를 두 요청에서 서로 다르게 준다 — 같으면 멱등키(00020)라 같은 예약을
   그대로 돌려줘(200) 중복이 아니게 된다. 진짜 「두 번째 요청」이어야 슬롯 점유 충돌이 난다.
"""
import uuid

import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_08_second_booking_on_same_slot_fails(client, committed_conn, hospital):
    patient_h = bearer(hospital["patient"]["auth_user_id"])
    base = {
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "slot_id": str(hospital["slots"][1]),
        "reason": "정기 검진",
    }

    first = client.post("/bookings", headers=patient_h, json={**base, "request_id": str(uuid.uuid4())})
    assert first.status_code == 200, first.text

    # 같은 슬롯에 서로 다른 request_id로 두 번째 예약 시도 → 실패해야 함
    second = client.post("/bookings", headers=patient_h, json={**base, "request_id": str(uuid.uuid4())})
    assert second.status_code >= 400
    # 사용자에게는 한글 안내가 전달돼야 함
    assert "detail" in second.json()

    # 슬롯은 예약됨(취소 아님) 1건만 존재
    count = await committed_conn.fetchval(
        "select count(*) from appointments where slot_id = $1 and status not in ('환자취소','병원취소')",
        hospital["slots"][1],
    )
    assert count == 1
