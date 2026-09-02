"""시나리오 4 — 도착 → 진료대기 → 진료중 → 진료완료 + 진료기록 작성·완료.

실제 구현 대조 보정:
- PATCH /medical-records/{id}/complete 는 expected_updated_at 이 필수다(플랜은 빈 body).
  draft 응답의 updated_at 을 낙관적 잠금 열쇠로 넘긴다.
- 이력은 생성 시 초기행 유무에 견고하게 마지막 3건으로 검증한다.
"""
import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_04_arrival_to_completed_record(client, committed_conn, hospital):
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])
    doctor_h = bearer(hospital["doctor"]["auth_user_id"])

    res = client.post("/appointments", headers=reception_h, json={
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "reason": "복통", "source": "staff", "initial_status": "도착",
    })
    assert res.status_code == 200, res.text
    appointment_id = res.json()["appointment_id"]

    # 접수직원: 도착 → 진료대기, 의사: 진료대기 → 진료중
    for actor_h, new_status in ((reception_h, "진료대기"), (doctor_h, "진료중")):
        updated_at = await committed_conn.fetchval(
            "select updated_at from appointments where id = $1::uuid", appointment_id)
        res = client.patch(f"/appointments/{appointment_id}/status", headers=actor_h, json={
            "new_status": new_status, "reason": None,
            "expected_updated_at": updated_at.isoformat(),
        })
        assert res.status_code == 200, f"{new_status} 전이 실패: {res.text}"

    # 의사: 진료기록 작성 → 완료
    res = client.post("/medical-records/draft", headers=doctor_h, json={
        "appointment_id": appointment_id,
        "symptoms": "복통 2일", "diagnosis": "급성 위염", "treatment": "약 처방 3일",
        "patient_visible_notes": "자극적인 음식을 피하고 푹 쉬세요.",
    })
    assert res.status_code == 200, res.text
    draft = res.json()
    record_id = draft["record_id"]

    # 진료기록 완료는 예약을 자동으로 「진료완료」로 전이시킨다 — 별도 상태 PATCH를 하지 않는다
    # (하면 진료완료→진료완료가 되어 거부된다).
    res = client.patch(f"/medical-records/{record_id}/complete", headers=doctor_h, json={
        "expected_updated_at": draft["updated_at"],
    })
    assert res.status_code == 200, res.text

    # 기록 완료로 예약이 진료완료가 됐는지 확인
    status = await committed_conn.fetchval(
        "select status from appointments where id = $1::uuid", appointment_id)
    assert status == "진료완료"

    # 이력이 순서대로 남았는지 (생성 시 초기행 유무와 무관하게 마지막 3건)
    history = await committed_conn.fetch(
        "select to_status from appointment_status_history where appointment_id = $1::uuid order by changed_at",
        appointment_id,
    )
    to_statuses = [h["to_status"] for h in history]
    assert to_statuses[-3:] == ["진료대기", "진료중", "진료완료"]
