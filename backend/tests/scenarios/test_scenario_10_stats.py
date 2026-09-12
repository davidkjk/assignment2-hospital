"""시나리오 10 — 운영 통계 API 수치가 실제 생성/취소한 예약을 반영 + 관리자 전용.

실제 구현 대조 보정 — 응답 구조가 플랜과 다르다:
- reserved/average_wait_minutes/app_booking_ratio 키는 없다. 실제는
  cancelled={basis,value} · source_mix={basis,rows,total} · wait={avg_minutes,...} 등.
- 쿼리 파라미터는 from/to(alias) — from_ 아님.
"""
import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_10_stats_reflect_created_appointments(client, committed_conn, hospital):
    admin_h = bearer(hospital["admin"]["auth_user_id"])
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])

    common = {
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "source": "staff", "initial_status": "예약확정",
    }

    # 1) 확정 예약 1건
    res = client.post("/appointments", headers=reception_h,
                      json={**common, "reason": "정기검진", "slot_id": str(hospital["slots"][0])})
    assert res.status_code == 200, res.text

    # 2) 예약 후 취소 1건 (취소 건수에 반영돼야 함)
    res = client.post("/appointments", headers=reception_h,
                      json={**common, "reason": "취소예정", "slot_id": str(hospital["slots"][1])})
    assert res.status_code == 200, res.text
    cancel_id = res.json()["appointment_id"]
    updated_at = await committed_conn.fetchval(
        "select updated_at from appointments where id = $1::uuid", cancel_id)
    res = client.patch(f"/appointments/{cancel_id}/status", headers=reception_h, json={
        "new_status": "환자취소", "reason": "환자 요청",
        "expected_updated_at": updated_at.isoformat(),
    })
    assert res.status_code == 200, res.text

    today = (await committed_conn.fetchval("select current_date")).isoformat()

    # 3) 관리자는 통계 조회 가능, 숫자가 실제 생성/취소 건수를 반영
    res = client.get(f"/stats?from={today}&to={today}", headers=admin_h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["cancelled"]["value"] >= 1              # 취소 1건 반영
    assert body["source_mix"]["total"] >= 2             # 오늘 staff가 만든 예약 2건(앱/직원/봇 비율의 기반)
    assert "wait" in body and "avg_minutes" in body["wait"]   # 평균 대기 facet 존재

    # 4) 접수직원은 통계 조회 불가 (관리자 전용 — 요구사항 3.10)
    res = client.get(f"/stats?from={today}&to={today}", headers=reception_h)
    assert res.status_code == 403
