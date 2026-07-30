import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import medical_record_service
from tests.conftest import seed_staff, set_session_auth


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


async def _seed_base(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    # 담당의 소속 진료과와 예약 진료과가 일치해야 하므로(trg_enforce_appointment_consistency) 맞춰준다.
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    await set_session_auth(db_conn, receptionist["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '진료중', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    return {
        "doctor": _to_context(doctor, "doctor"),
        "appointment_id": appointment_id,
    }


@pytest.mark.asyncio
async def test_create_draft_record_for_other_doctors_appointment_raises(db_conn):
    """치명적 규칙은 DB가 최종 심판 — doctor_id를 자기 id로 채워도 '남의 예약'이면 트리거가 거부하고,
    서비스는 그 asyncpg 예외를 AppError로 감싸야 한다."""
    other_doctor_seed = await seed_staff(db_conn, role="doctor")
    ctx = await _seed_base(db_conn)
    other_doctor = _to_context(other_doctor_seed, "doctor")
    await set_session_auth(db_conn, other_doctor.auth_user_id)

    with pytest.raises(AppError):
        await medical_record_service.create_draft_record(
            appointment_id=ctx["appointment_id"],
            symptoms="기침",
            diagnosis=None,
            treatment=None,
            patient_visible_notes=None,
            staff=other_doctor,
            conn=db_conn,
        )


@pytest.mark.asyncio
async def test_update_draft_record_blocked_for_non_owning_doctor(db_conn):
    """RLS(doctor_can_update_own_medical_records)가 남의 기록 수정을 조용히 걸러내며,
    서비스는 이를 AppError로 알려야 한다(원인이 낙관적 잠금 충돌이 아니라 소유권임)."""
    other_doctor_seed = await seed_staff(db_conn, role="doctor")
    ctx = await _seed_base(db_conn)
    await set_session_auth(db_conn, ctx["doctor"].auth_user_id)
    record_id = await medical_record_service.create_draft_record(
        appointment_id=ctx["appointment_id"],
        symptoms="기침",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        staff=ctx["doctor"],
        conn=db_conn,
    )
    expected_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id,
    )

    other_doctor = _to_context(other_doctor_seed, "doctor")
    await set_session_auth(db_conn, other_doctor.auth_user_id)

    with pytest.raises(AppError):
        await medical_record_service.update_draft_record(
            record_id=record_id,
            symptoms="남의 기록 수정 시도",
            diagnosis=None,
            treatment=None,
            patient_visible_notes=None,
            expected_updated_at=expected_updated_at,
            staff=other_doctor,
            conn=db_conn,
        )


@pytest.mark.asyncio
async def test_create_draft_record(db_conn):
    ctx = await _seed_base(db_conn)
    await set_session_auth(db_conn, ctx["doctor"].auth_user_id)

    record_id = await medical_record_service.create_draft_record(
        appointment_id=ctx["appointment_id"],
        symptoms="기침",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        staff=ctx["doctor"],
        conn=db_conn,
    )

    row = await db_conn.fetchrow(
        "select is_completed, doctor_id, symptoms from medical_records where id = $1", record_id,
    )
    assert row["is_completed"] is False
    assert row["doctor_id"] == ctx["doctor"].id
    assert row["symptoms"] == "기침"


@pytest.mark.asyncio
async def test_update_draft_record_overwrites_content(db_conn):
    ctx = await _seed_base(db_conn)
    await set_session_auth(db_conn, ctx["doctor"].auth_user_id)
    record_id = await medical_record_service.create_draft_record(
        appointment_id=ctx["appointment_id"],
        symptoms="기침",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        staff=ctx["doctor"],
        conn=db_conn,
    )
    expected_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id,
    )

    await medical_record_service.update_draft_record(
        record_id=record_id,
        symptoms="기침, 발열",
        diagnosis="감기",
        treatment=None,
        patient_visible_notes=None,
        expected_updated_at=expected_updated_at,
        staff=ctx["doctor"],
        conn=db_conn,
    )

    row = await db_conn.fetchrow(
        "select symptoms, diagnosis from medical_records where id = $1", record_id,
    )
    assert row["symptoms"] == "기침, 발열"
    assert row["diagnosis"] == "감기"


@pytest.mark.asyncio
async def test_update_draft_record_stale_lock_raises(db_conn):
    ctx = await _seed_base(db_conn)
    await set_session_auth(db_conn, ctx["doctor"].auth_user_id)
    record_id = await medical_record_service.create_draft_record(
        appointment_id=ctx["appointment_id"],
        symptoms="기침",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        staff=ctx["doctor"],
        conn=db_conn,
    )
    stale = await db_conn.fetchval(
        "select updated_at - interval '1 second' from medical_records where id = $1", record_id,
    )

    with pytest.raises(AppError):
        await medical_record_service.update_draft_record(
            record_id=record_id,
            symptoms="몰래 수정",
            diagnosis=None,
            treatment=None,
            patient_visible_notes=None,
            expected_updated_at=stale,
            staff=ctx["doctor"],
            conn=db_conn,
        )


@pytest.mark.asyncio
async def test_update_draft_record_on_completed_record_raises(db_conn):
    ctx = await _seed_base(db_conn)
    await set_session_auth(db_conn, ctx["doctor"].auth_user_id)
    record_id = await medical_record_service.create_draft_record(
        appointment_id=ctx["appointment_id"],
        symptoms="기침",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        staff=ctx["doctor"],
        conn=db_conn,
    )
    expected_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id,
    )
    await medical_record_service.complete_record(
        record_id=record_id, expected_updated_at=expected_updated_at, staff=ctx["doctor"], conn=db_conn,
    )
    completed_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id,
    )

    with pytest.raises(AppError):
        await medical_record_service.update_draft_record(
            record_id=record_id,
            symptoms="완료후 몰래 수정",
            diagnosis=None,
            treatment=None,
            patient_visible_notes=None,
            expected_updated_at=completed_updated_at,
            staff=ctx["doctor"],
            conn=db_conn,
        )


@pytest.mark.asyncio
async def test_complete_record_sets_is_completed(db_conn):
    ctx = await _seed_base(db_conn)
    await set_session_auth(db_conn, ctx["doctor"].auth_user_id)
    record_id = await medical_record_service.create_draft_record(
        appointment_id=ctx["appointment_id"],
        symptoms="기침",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        staff=ctx["doctor"],
        conn=db_conn,
    )
    expected_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id,
    )

    await medical_record_service.complete_record(
        record_id=record_id, expected_updated_at=expected_updated_at, staff=ctx["doctor"], conn=db_conn,
    )

    row = await db_conn.fetchrow("select is_completed from medical_records where id = $1", record_id)
    assert row["is_completed"] is True


@pytest.mark.asyncio
async def test_complete_record_stale_lock_raises(db_conn):
    ctx = await _seed_base(db_conn)
    await set_session_auth(db_conn, ctx["doctor"].auth_user_id)
    record_id = await medical_record_service.create_draft_record(
        appointment_id=ctx["appointment_id"],
        symptoms="기침",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        staff=ctx["doctor"],
        conn=db_conn,
    )
    stale = await db_conn.fetchval(
        "select updated_at - interval '1 second' from medical_records where id = $1", record_id,
    )

    with pytest.raises(AppError):
        await medical_record_service.complete_record(
            record_id=record_id, expected_updated_at=stale, staff=ctx["doctor"], conn=db_conn,
        )


@pytest.mark.asyncio
async def test_revise_completed_record_records_history(db_conn):
    ctx = await _seed_base(db_conn)
    await set_session_auth(db_conn, ctx["doctor"].auth_user_id)
    record_id = await medical_record_service.create_draft_record(
        appointment_id=ctx["appointment_id"],
        symptoms="기침",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        staff=ctx["doctor"],
        conn=db_conn,
    )
    expected_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id,
    )
    await medical_record_service.complete_record(
        record_id=record_id, expected_updated_at=expected_updated_at, staff=ctx["doctor"], conn=db_conn,
    )
    completed_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id,
    )

    await medical_record_service.revise_completed_record(
        record_id=record_id,
        symptoms="기침(수정)",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        reason="오타 수정",
        expected_updated_at=completed_updated_at,
        staff=ctx["doctor"],
        conn=db_conn,
    )

    row = await db_conn.fetchrow("select symptoms from medical_records where id = $1", record_id)
    assert row["symptoms"] == "기침(수정)"
    revision_count = await db_conn.fetchval(
        "select count(*) from medical_record_revisions where record_id = $1", record_id,
    )
    assert revision_count == 1


@pytest.mark.asyncio
async def test_revise_completed_record_without_reason_raises(db_conn):
    ctx = await _seed_base(db_conn)
    await set_session_auth(db_conn, ctx["doctor"].auth_user_id)
    record_id = await medical_record_service.create_draft_record(
        appointment_id=ctx["appointment_id"],
        symptoms="기침",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        staff=ctx["doctor"],
        conn=db_conn,
    )
    expected_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id,
    )
    await medical_record_service.complete_record(
        record_id=record_id, expected_updated_at=expected_updated_at, staff=ctx["doctor"], conn=db_conn,
    )
    completed_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id,
    )

    with pytest.raises(AppError):
        await medical_record_service.revise_completed_record(
            record_id=record_id,
            symptoms="기침(수정)",
            diagnosis=None,
            treatment=None,
            patient_visible_notes=None,
            reason="",
            expected_updated_at=completed_updated_at,
            staff=ctx["doctor"],
            conn=db_conn,
        )


@pytest.mark.asyncio
async def test_revise_completed_record_stale_lock_raises_409(db_conn):
    """update_draft_record/complete_record의 낙관적 잠금 충돌은 409를 반환한다.
    같은 성격의 충돌(P0003)이 revise_medical_record RPC에서 나도 동일하게 409여야 일관적이다."""
    ctx = await _seed_base(db_conn)
    await set_session_auth(db_conn, ctx["doctor"].auth_user_id)
    record_id = await medical_record_service.create_draft_record(
        appointment_id=ctx["appointment_id"],
        symptoms="기침",
        diagnosis=None,
        treatment=None,
        patient_visible_notes=None,
        staff=ctx["doctor"],
        conn=db_conn,
    )
    expected_updated_at = await db_conn.fetchval(
        "select updated_at from medical_records where id = $1", record_id,
    )
    await medical_record_service.complete_record(
        record_id=record_id, expected_updated_at=expected_updated_at, staff=ctx["doctor"], conn=db_conn,
    )
    stale = await db_conn.fetchval(
        "select updated_at - interval '1 second' from medical_records where id = $1", record_id,
    )

    with pytest.raises(AppError) as exc_info:
        await medical_record_service.revise_completed_record(
            record_id=record_id,
            symptoms="기침(수정)",
            diagnosis=None,
            treatment=None,
            patient_visible_notes=None,
            reason="사유",
            expected_updated_at=stale,
            staff=ctx["doctor"],
            conn=db_conn,
        )
    assert exc_info.value.status_code == 409
