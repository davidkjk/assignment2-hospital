"""시나리오 5 — 완료된 진료기록 수정은 사유 필수 + 이전 내용 보존.

실제 구현 대조 보정:
- revise body는 flat 필드(symptoms/diagnosis/…) + reason(필수) + expected_updated_at
  (플랜의 new_content: dict 아님).
- complete/revise 모두 expected_updated_at 필수.
"""
import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_05_revising_completed_record_requires_reason_and_keeps_history(
    client, committed_conn, hospital
):
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])
    doctor_h = bearer(hospital["doctor"]["auth_user_id"])

    # 완료된 진료기록 준비 (도착 → 기록 작성 → 완료)
    res = client.post("/appointments", headers=reception_h, json={
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "reason": "두통", "source": "staff", "initial_status": "도착",
    })
    assert res.status_code == 200, res.text
    appointment_id = res.json()["appointment_id"]
    res = client.post("/medical-records/draft", headers=doctor_h, json={
        "appointment_id": appointment_id,
        "symptoms": "두통", "diagnosis": "긴장성 두통", "treatment": "진통제",
        "patient_visible_notes": "수분을 충분히 섭취하세요.",
    })
    assert res.status_code == 200, res.text
    draft = res.json()
    record_id = draft["record_id"]
    res = client.patch(f"/medical-records/{record_id}/complete", headers=doctor_h, json={
        "expected_updated_at": draft["updated_at"],
    })
    assert res.status_code == 200, res.text

    updated_at = await committed_conn.fetchval(
        "select updated_at from medical_records where id = $1::uuid", record_id)

    # 1) 사유 없이 수정 시도 → 실패
    res = client.patch(f"/medical-records/{record_id}/revise", headers=doctor_h, json={
        "diagnosis": "편두통", "reason": "",
        "expected_updated_at": updated_at.isoformat(),
    })
    assert res.status_code >= 400

    # 2) 사유와 함께 수정 → 성공, 이전 내용이 revisions에 보존
    res = client.patch(f"/medical-records/{record_id}/revise", headers=doctor_h, json={
        "diagnosis": "편두통", "reason": "추가 문진 결과 반영",
        "expected_updated_at": updated_at.isoformat(),
    })
    assert res.status_code == 200, res.text

    revision = await committed_conn.fetchrow(
        "select previous_content, reason from medical_record_revisions where record_id = $1::uuid",
        record_id,
    )
    current = await committed_conn.fetchval(
        "select diagnosis from medical_records where id = $1::uuid", record_id)
    assert revision is not None
    assert revision["reason"] == "추가 문진 결과 반영"
    assert "긴장성 두통" in str(revision["previous_content"])
    assert current == "편두통"
