import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import appointment_service, slot_service
from tests.conftest import seed_staff, set_session_auth


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


async def _seed_base(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    # 담당의 소속 진료과와 예약 진료과가 일치해야 하므로(trg_enforce_appointment_consistency) 맞춰준다.
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    # log_appointment_status_change 트리거가 changed_by를 채우려면 auth.uid()가 필요하므로 세션에 심어둔다.
    await set_session_auth(db_conn, receptionist["auth_user_id"])
    return {
        "admin": _to_context(admin, "admin"),
        "receptionist": _to_context(receptionist, "receptionist"),
        "doctor": _to_context(doctor, "doctor"),
        "dept_id": dept_id,
        "patient_id": patient_id,
    }


@pytest.mark.asyncio
async def test_create_appointment_without_slot(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await appointment_service.create_appointment(
        staff=ctx["receptionist"],
        account_patient_id=ctx["patient_id"],
        for_patient_id=ctx["patient_id"],
        department_id=ctx["dept_id"],
        doctor_id=ctx["doctor"].id,
        reason="감기",
        source="staff",
        initial_status="예약확정",
        conn=db_conn,
    )
    row = await db_conn.fetchrow("select status, slot_id from appointments where id = $1", appointment_id)
    assert row["status"] == "예약확정"
    assert row["slot_id"] is None


@pytest.mark.asyncio
async def test_create_appointment_with_already_booked_slot_raises(db_conn):
    ctx = await _seed_base(db_conn)
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '예약됨') returning id",
        ctx["doctor"].id,
    )

    with pytest.raises(AppError):
        await appointment_service.create_appointment(
            staff=ctx["receptionist"],
            account_patient_id=ctx["patient_id"],
            for_patient_id=ctx["patient_id"],
            department_id=ctx["dept_id"],
            doctor_id=ctx["doctor"].id,
            reason="감기",
            source="staff",
            initial_status="예약확정",
            slot_id=slot_id,
            conn=db_conn,
        )


@pytest.mark.asyncio
async def test_transition_status_records_history(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await appointment_service.create_appointment(
        staff=ctx["receptionist"],
        account_patient_id=ctx["patient_id"],
        for_patient_id=ctx["patient_id"],
        department_id=ctx["dept_id"],
        doctor_id=ctx["doctor"].id,
        reason="감기",
        source="staff",
        initial_status="예약확정",
        conn=db_conn,
    )
    row = await db_conn.fetchrow("select updated_at from appointments where id = $1", appointment_id)

    await appointment_service.transition_status(
        appointment_id, "도착", ctx["receptionist"], reason=None, expected_updated_at=row["updated_at"], conn=db_conn,
    )

    status = await db_conn.fetchval("select status from appointments where id = $1", appointment_id)
    assert status == "도착"
    history_count = await db_conn.fetchval(
        "select count(*) from appointment_status_history where appointment_id = $1", appointment_id
    )
    assert history_count == 2  # 생성 시 1건 + 상태전이 1건


@pytest.mark.asyncio
async def test_transition_status_rejects_stale_updated_at(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await appointment_service.create_appointment(
        staff=ctx["receptionist"],
        account_patient_id=ctx["patient_id"],
        for_patient_id=ctx["patient_id"],
        department_id=ctx["dept_id"],
        doctor_id=ctx["doctor"].id,
        reason="감기",
        source="staff",
        initial_status="예약확정",
        conn=db_conn,
    )

    from datetime import datetime, timezone

    with pytest.raises(AppError) as exc_info:
        await appointment_service.transition_status(
            appointment_id, "도착", ctx["receptionist"], reason=None,
            expected_updated_at=datetime(2000, 1, 1, tzinfo=timezone.utc),
            conn=db_conn,
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_transition_status_rejects_invalid_transition(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await appointment_service.create_appointment(
        staff=ctx["receptionist"],
        account_patient_id=ctx["patient_id"],
        for_patient_id=ctx["patient_id"],
        department_id=ctx["dept_id"],
        doctor_id=ctx["doctor"].id,
        reason="감기",
        source="staff",
        initial_status="예약확정",
        conn=db_conn,
    )
    row = await db_conn.fetchrow("select updated_at from appointments where id = $1", appointment_id)

    with pytest.raises(AppError) as exc_info:
        await appointment_service.transition_status(
            appointment_id, "진료완료", ctx["receptionist"], reason=None, expected_updated_at=row["updated_at"], conn=db_conn,
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_reorder_queue_updates_position_and_reason(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by, queue_position)
        values ($1, $1, $2, $3, '진료대기', 'staff', $4, 1)
        returning id
        """,
        ctx["patient_id"], ctx["dept_id"], ctx["doctor"].id, ctx["receptionist"].id,
    )

    await appointment_service.reorder_queue(appointment_id, 3, ctx["receptionist"], reason="응급환자 우선", conn=db_conn)

    position = await db_conn.fetchval("select queue_position from appointments where id = $1", appointment_id)
    assert position == 3
    # 같은 트랜잭션(db_conn) 안에서는 now()가 고정돼 changed_at으로 정렬해도 INSERT 트리거가 남긴
    # 행과 순서를 구분할 수 없다. reorder_queue가 남기는 행은 from_status = to_status로 식별한다.
    reason = await db_conn.fetchval(
        "select reason from appointment_status_history where appointment_id = $1 and from_status = to_status",
        appointment_id,
    )
    assert reason == "응급환자 우선"


@pytest.mark.asyncio
async def test_set_urgent_flag(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await appointment_service.create_appointment(
        staff=ctx["receptionist"],
        account_patient_id=ctx["patient_id"],
        for_patient_id=ctx["patient_id"],
        department_id=ctx["dept_id"],
        doctor_id=ctx["doctor"].id,
        reason="흉통 호소",
        source="staff",
        initial_status="도착",
        conn=db_conn,
    )
    row = await db_conn.fetchrow("select updated_at from appointments where id = $1", appointment_id)

    await appointment_service.set_urgent_flag(appointment_id, True, ctx["receptionist"], row["updated_at"], conn=db_conn)

    flag = await db_conn.fetchval("select is_urgent_flag from appointments where id = $1", appointment_id)
    assert flag is True


@pytest.mark.asyncio
async def test_create_appointment_rejects_initial_status_not_allowed_for_source(db_conn):
    """[정합성 검토 R1-우선3 재검증] `source`가 보낸 `initial_status`가 그 채널에서 허용되지 않으면
    서버가 그대로 저장하지 않고 거부한다 — 예: 'app' 채널이 '진료완료'를 초기상태로 주장하는 경우."""
    ctx = await _seed_base(db_conn)

    with pytest.raises(AppError) as exc_info:
        await appointment_service.create_appointment(
            staff=ctx["receptionist"],
            account_patient_id=ctx["patient_id"],
            for_patient_id=ctx["patient_id"],
            department_id=ctx["dept_id"],
            doctor_id=ctx["doctor"].id,
            reason="감기",
            source="app",
            initial_status="진료완료",
            conn=db_conn,
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_create_appointment_rejects_unknown_source(db_conn):
    """[정합성 검토 R1-우선3 재검증] 화이트리스트에 없는 `source` 값 자체도 거부한다."""
    ctx = await _seed_base(db_conn)

    with pytest.raises(AppError) as exc_info:
        await appointment_service.create_appointment(
            staff=ctx["receptionist"],
            account_patient_id=ctx["patient_id"],
            for_patient_id=ctx["patient_id"],
            department_id=ctx["dept_id"],
            doctor_id=ctx["doctor"].id,
            reason="감기",
            source="fax",
            initial_status="예약확정",
            conn=db_conn,
        )
    assert exc_info.value.status_code == 400
