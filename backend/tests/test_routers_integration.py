import time

import pytest
from jose import jwt

from app.core.config import settings
from tests.conftest import seed_staff


def make_token(auth_user_id: str) -> str:
    payload = {
        "sub": auth_user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def test_appointments_endpoint_requires_auth(client):
    response = client.post("/appointments", json={})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_receptionist_can_create_appointment_via_api(client, committed_conn):
    receptionist = await seed_staff(committed_conn, role="receptionist")
    doctor = await seed_staff(committed_conn, role="doctor")
    dept_id = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_id = await committed_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    token = make_token(str(receptionist["auth_user_id"]))

    response = client.post(
        "/appointments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "account_patient_id": str(patient_id),
            "for_patient_id": str(patient_id),
            "department_id": str(dept_id),
            "doctor_id": str(doctor["staff_id"]),
            "reason": "감기",
            "source": "staff",
            "initial_status": "예약확정",
        },
    )

    assert response.status_code == 200
    assert "appointment_id" in response.json()


@pytest.mark.asyncio
async def test_doctor_cannot_invite_staff_via_api(client, committed_conn):
    doctor = await seed_staff(committed_conn, role="doctor")
    token = make_token(str(doctor["auth_user_id"]))

    response = client.post(
        "/staff",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "new@test.local", "name": "새직원", "role": "receptionist"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_doctor_can_save_and_read_own_draft_via_api(client, committed_conn):
    doctor = await seed_staff(committed_conn, role="doctor")
    receptionist = await seed_staff(committed_conn, role="receptionist")
    dept_id = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_id = await committed_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appointment_id = await committed_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '진료중', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    token = make_token(str(doctor["auth_user_id"]))

    draft_response = client.post(
        "/medical-records/draft",
        headers={"Authorization": f"Bearer {token}"},
        json={"appointment_id": str(appointment_id), "symptoms": "기침", "diagnosis": "감기"},
    )
    assert draft_response.status_code == 200
    record_id = draft_response.json()["record_id"]

    row = await committed_conn.fetchrow("select symptoms from medical_records where id = $1", record_id)
    assert row["symptoms"] == "기침"


@pytest.mark.asyncio
async def test_doctor_can_read_own_medical_record_via_api(client, committed_conn):
    doctor = await seed_staff(committed_conn, role="doctor")
    receptionist = await seed_staff(committed_conn, role="receptionist")
    dept_id = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_id = await committed_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appointment_id = await committed_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '진료중', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    await committed_conn.execute(
        "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침')",
        appointment_id, doctor["staff_id"],
    )
    token = make_token(str(doctor["auth_user_id"]))

    response = client.get(
        f"/medical-records/by-appointment/{appointment_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["symptoms"] == "기침"
