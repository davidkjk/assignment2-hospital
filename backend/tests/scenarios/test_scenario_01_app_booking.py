"""시나리오 1 — 환자 앱 예약 신청 → 접수직원 확정 → 환자 확인.

실제 라우터에 맞춤(플랜 대비 보정):
- 예약 생성: POST /bookings (플랜의 /app/appointments 아님), body에 request_id(멱등키·00020) 필수.
- 예약 조회: GET /my/appointments/{id} (플랜의 /app/appointments/{id} 아님).
- 자동확정 기본값이 true(#29)라 그냥 두면 예약확정으로 바로 떨어져 「직원 확정」 단계가
  사라진다 → 이 시나리오는 자동확정을 끄고(끝에 복원) 신청→확정 핸드오프를 검증한다.
"""
import uuid

import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_01_patient_books_staff_confirms_patient_sees_it(client, committed_conn, hospital):
    # committed_conn(테스트 내내 잡은 단일 커넥션)으로 DB를 읽고 쓴다 — client(TestClient) 호출
    # 사이에 db_pool 커넥션을 여닫으면 앱 전역 풀과 이벤트 루프가 엉킨다(기존 통과 테스트 패턴).
    patient_h = bearer(hospital["patient"]["auth_user_id"])
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])

    await committed_conn.execute("update hospital_settings set auto_confirm_app_bookings = false")
    try:
        # 1) 환자가 앱에서 예약 신청
        res = client.post("/bookings", headers=patient_h, json={
            "for_patient_id": str(hospital["patient"]["patient_id"]),
            "department_id": str(hospital["dept_id"]),
            "doctor_id": str(hospital["doctor"]["staff_id"]),
            "slot_id": str(hospital["slots"][0]),
            "reason": "감기 기운",
            "request_id": str(uuid.uuid4()),
        })
        assert res.status_code == 200, res.text
        appointment_id = res.json()["appointment_id"]

        # 2) 신청 직후 상태는 예약신청 (자동확정 꺼짐)
        row = await committed_conn.fetchrow(
            "select status, updated_at from appointments where id = $1::uuid", appointment_id
        )
        assert row["status"] == "예약신청"

        # 3) 접수직원이 확정
        res = client.patch(f"/appointments/{appointment_id}/status", headers=reception_h, json={
            "new_status": "예약확정", "reason": "전화 확인 완료",
            "expected_updated_at": row["updated_at"].isoformat(),
        })
        assert res.status_code == 200, res.text

        # 4) 환자 앱에서 확정 상태 확인
        res = client.get(f"/my/appointments/{appointment_id}", headers=patient_h)
        assert res.status_code == 200
        assert res.json()["status"] == "예약확정"

        # 5) 상태 이력이 남았는지 확인
        history = await committed_conn.fetch(
            "select to_status from appointment_status_history where appointment_id = $1::uuid order by changed_at",
            appointment_id,
        )
        assert [h["to_status"] for h in history][-1] == "예약확정"
    finally:
        await committed_conn.execute("update hospital_settings set auto_confirm_app_bookings = true")
