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


async def _seed_appt_with_status(committed_conn, *, status, doctor_role="doctor"):
    """UNDO HTTP 테스트용: 지정 상태의 예약 한 건 + 그 의사·접수 계정을 만든다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    receptionist = await seed_staff(committed_conn, role="receptionist")
    dept_id = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute(
        "update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"]
    )
    patient_id = await committed_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appointment_id = await committed_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, $4, 'staff', $5)
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"], status, receptionist["staff_id"],
    )
    return appointment_id, doctor, receptionist


@pytest.mark.asyncio
async def test_undo_why_03_own_segment_needs_no_reason_and_executes(client, committed_conn):
    """[UNDO-WHY-03][UNDO-SCOPE-01] 접수 구간(진료대기→도착)은 사유 없이 바로 되돌린다."""
    appointment_id, _doctor, receptionist = await _seed_appt_with_status(
        committed_conn, status="진료대기"
    )
    token = make_token(str(receptionist["auth_user_id"]))

    response = client.post(
        f"/appointments/{appointment_id}/undo",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["executed"] is True
    assert body["reason_required"] is False
    assert body["status"] == "도착"


@pytest.mark.asyncio
async def test_undo_why_01_completed_without_reason_asks_for_reason(client, committed_conn):
    """[UNDO-WHY-01] 진료완료 되돌리기는 서버가 사유 필요로 판정한다 — 사유 없으면 실행하지 않고
    입력칸을 띄우라고 알린다(막다른 길 금지). (동기 TestClient는 한 테스트 한 요청만 — 실행은 다음 테스트)"""
    appointment_id, doctor, _receptionist = await _seed_appt_with_status(
        committed_conn, status="진료완료"
    )
    token = make_token(str(doctor["auth_user_id"]))

    response = client.post(
        f"/appointments/{appointment_id}/undo",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reason_required"] is True
    assert body["executed"] is False  # 사유가 필요해 아직 실행하지 않았다


@pytest.mark.asyncio
async def test_undo_why_01_completed_with_reason_executes_one_step_back(client, committed_conn):
    """[UNDO-WHY-01][UNDO-SCOPE-04] 사유를 실으면 진료완료→진료중 한 칸만 되돌린다."""
    appointment_id, doctor, _receptionist = await _seed_appt_with_status(
        committed_conn, status="진료완료"
    )
    token = make_token(str(doctor["auth_user_id"]))

    response = client.post(
        f"/appointments/{appointment_id}/undo",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "기록을 다시 열어야 함"},
    )

    assert response.status_code == 200
    done = response.json()
    assert done["executed"] is True
    assert done["reason_required"] is True
    assert done["status"] == "진료중"


@pytest.mark.asyncio
async def test_undo_scope_02_cancelled_cannot_be_undone(client, committed_conn):
    """[UNDO-SCOPE-02] 취소 계열은 되돌릴 수 없다(자리가 이미 풀렸다)."""
    appointment_id, _doctor, receptionist = await _seed_appt_with_status(
        committed_conn, status="환자취소"
    )
    token = make_token(str(receptionist["auth_user_id"]))

    response = client.post(
        f"/appointments/{appointment_id}/undo",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_MHIST_DONE_01_merge_undo_via_real_grant_path_returns_200(client, committed_conn):
    """[MHIST-DONE-01][QA L22] 병합 되돌림을 **실 HTTP 경로**(acquire_as='authenticated')로 확정한다.

    ⚠️ test_merge_undo.py의 되돌림 테스트는 전부 conn=db_conn(오너 롤)을 주입해 grant/RLS를
       우회하므로, 「authenticated에 patient_merges UPDATE grant/policy가 없다」는 실 배포 갭을
       못 잡았다(라이브 [되돌림 확정]이 500 permission denied — 00074 이전). 이 테스트는
       committed_conn으로 병합을 커밋한 뒤 라우터를 태워, 되돌림 UPDATE가 실제 권한 경로를
       통과하는지 회귀로 지킨다.
    """
    from tests.test_merge_undo import seed_admin, seed_merge_ids

    admin = await seed_admin(committed_conn)
    merge_id, primary, merged = await seed_merge_ids(committed_conn, by=admin)
    # 병합 상태: 대표를 읽으면 병합 대상도 계보에 딸려 온다.
    assert merged in await committed_conn.fetchval("select patient_lineage($1)", primary)
    token = make_token(str(admin.auth_user_id))

    response = client.post(
        f"/admin/merge-history/{merge_id}/undo",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "오병합 확인", "expected_status": "undoable"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "undone"
    # undone_at이 실제로 채워져 계보가 끊겼다(무음 no-op이 아니다).
    assert merged not in await committed_conn.fetchval("select patient_lineage($1)", primary)
