"""시나리오 9 — 역할 경계(API 레벨) + RLS 직접 조회 이중 확인.

실제 구현 대조 보정:
- 직원 대시보드 경로는 /today/summary (플랜의 /today-summary 아님).
- 환자 예약 생성/조회는 POST /bookings(+request_id) / GET /my/appointments/{id}.
"""
import uuid

import pytest

from tests.conftest import seed_patient, set_session_auth
from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_09_role_boundaries_at_api_level(client, hospital):
    doctor_h = bearer(hospital["doctor"]["auth_user_id"])
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])
    patient_h = bearer(hospital["patient"]["auth_user_id"])

    # 의사는 직원 초대 불가
    res = client.post("/staff", headers=doctor_h,
                      json={"email": "x@test.local", "name": "테스트", "role": "receptionist"})
    assert res.status_code == 403

    # 의사는 직원 목록 조회도 불가 (요구사항 3.1 — 쓰기뿐 아니라 조회도)
    res = client.get("/staff", headers=doctor_h)
    assert res.status_code == 403

    # 접수직원은 진료기록 작성 불가
    res = client.post("/medical-records/draft", headers=reception_h, json={
        "appointment_id": "00000000-0000-0000-0000-000000000000",
        "symptoms": "-", "diagnosis": "-", "treatment": "-", "patient_visible_notes": "-",
    })
    assert res.status_code == 403

    # 환자 토큰으로 직원 API 접근 불가
    res = client.get("/today/summary", headers=patient_h)
    assert res.status_code in (401, 403)

    # 미인증 접근 불가
    res = client.get("/today/summary")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_scenario_09_patient_cannot_read_other_patients_data(client, committed_conn, hospital):
    other = await seed_patient(committed_conn, name="타인환자", phone="01099997777")
    other_h = bearer(other["auth_user_id"])
    patient_h = bearer(hospital["patient"]["auth_user_id"])

    # 내 예약 생성
    res = client.post("/bookings", headers=patient_h, json={
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "slot_id": str(hospital["slots"][0]),
        "reason": "본인 예약",
        "request_id": str(uuid.uuid4()),
    })
    assert res.status_code == 200, res.text
    appointment_id = res.json()["appointment_id"]

    # 타인이 내 예약 조회 시도 → 데이터 미유출.
    # RLS가 행을 걸러 빈 응답을 준다(개인정보 열거 방지: 404가 아니라 200+빈 바디).
    # 핵심 보안 속성은 「타인이 내 예약 내용을 못 본다」이지 특정 상태코드가 아니다.
    res = client.get(f"/my/appointments/{appointment_id}", headers=other_h)
    assert res.status_code in (200, 403, 404)
    body = res.json() if res.status_code == 200 else {}
    assert not body.get("status")            # 타인은 내 예약 상태를 못 본다
    assert not body.get("for_patient_name")  # 이름 등 내용도 새지 않는다


@pytest.mark.asyncio
async def test_scenario_09_rls_blocks_direct_table_access(db_conn, hospital):
    """API를 우회해 DB에 직접 접속해도 RLS가 막는지 이중 확인."""
    await set_session_auth(db_conn, hospital["patient"]["auth_user_id"])

    # 환자 세션으로 medical_records 직접 조회 → 0건 (뷰로만 접근 가능해야 함)
    rows = await db_conn.fetch("select * from medical_records")
    assert rows == []

    # 환자 세션으로 patients 조회 → 본인 것만
    rows = await db_conn.fetch("select * from patients")
    assert all(str(r["id"]) == str(hospital["patient"]["patient_id"]) for r in rows)
