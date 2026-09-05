import pytest

from tests.conftest import seed_patient, seed_staff


async def _seed_appt(conn, *, status, day_offset):
    dept_id = await conn.fetchval("insert into departments (name) values ('부도과') returning id")
    doctor = await seed_staff(conn, role="doctor", department_id=dept_id)
    receptionist = await seed_staff(conn, role="receptionist")
    patient = await seed_patient(conn, name="부도환자", phone="01000000000")
    slot_id = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) "
        "values ($1, current_date + $2::int, '10:00') returning id",
        doctor["staff_id"], day_offset)
    await conn.execute("update appointment_slots set status='예약됨' where id=$1", slot_id)
    return await conn.fetchval(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, "
        "doctor_id, reason, status, source, created_by) "
        "values ($1,$2,$2,$3,$4,'검진',$5,'staff',$6) returning id",
        slot_id, patient["patient_id"], dept_id, doctor["staff_id"], status, receptionist["staff_id"])


@pytest.mark.asyncio
async def test_marks_confirmed_past_as_no_show(committed_conn):
    """[CARD-LATE-10] 어제자 예약확정은 예약부도로 전환된다."""
    appt = await _seed_appt(committed_conn, status="예약확정", day_offset=-1)
    from app.jobs.overdue import run
    count = await run()
    assert await committed_conn.fetchval("select status from appointments where id=$1", appt) == "예약부도"
    assert count >= 1


@pytest.mark.asyncio
async def test_records_system_actor_history(committed_conn):
    """[CARD-LATE-10] 부도 전이는 changed_by=null(시스템 자동) 이력을 남긴다 — 배치 행위자 경로."""
    appt = await _seed_appt(committed_conn, status="예약확정", day_offset=-1)
    from app.jobs.overdue import run
    await run()
    row = await committed_conn.fetchrow(
        "select changed_by, reason from appointment_status_history "
        "where appointment_id=$1 and to_status='예약부도'", appt)
    assert row is not None and row["changed_by"] is None
    assert row["reason"] == "시각 경과 자동 부도 처리"


@pytest.mark.asyncio
async def test_clears_booking_code_on_no_show(committed_conn):
    """[CARD-OK-03] 부도 후 booking_code는 종결-상태 트리거가 비운다(재사용 가능)."""
    appt = await _seed_appt(committed_conn, status="예약확정", day_offset=-1)
    assert await committed_conn.fetchval("select booking_code from appointments where id=$1", appt) is not None
    from app.jobs.overdue import run
    await run()
    assert await committed_conn.fetchval("select booking_code from appointments where id=$1", appt) is None


@pytest.mark.asyncio
async def test_same_day_confirmed_not_touched(committed_conn):
    """[결정㉮] 당일 예약확정은 건드리지 않는다 — slot_date < current_date만."""
    appt = await _seed_appt(committed_conn, status="예약확정", day_offset=0)
    from app.jobs.overdue import run
    await run()
    assert await committed_conn.fetchval("select status from appointments where id=$1", appt) == "예약확정"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["도착", "진료대기", "진료중", "예약신청"])
async def test_excluded_statuses_not_touched(committed_conn, status):
    """[결정㉮][HIST-ROW-09] 도착·진료대기·진료중(사람 처리)·예약신청(확정되지 않음)은 부도로 안 찍는다."""
    appt = await _seed_appt(committed_conn, status=status, day_offset=-1)
    from app.jobs.overdue import run
    await run()
    assert await committed_conn.fetchval("select status from appointments where id=$1", appt) == status
