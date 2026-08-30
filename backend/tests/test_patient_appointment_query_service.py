import pytest
from uuid import uuid4

from app.core.patient_security import PatientContext
from app.services import patient_appointment_query_service as q
from tests.conftest import seed_patient, seed_staff

# 조회 서비스도 acquire_as(patient) 자기커넥션 → 시드·검증은 committed_conn(postgres 역할, RLS 우회).
# 계획 원안의 admin+set_session_auth는 불필요(Task 5·6·7 하네스 보정과 동일).


def _ctx(s): return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


async def _seed_doctor_dept(committed_conn):
    doctor = await seed_staff(committed_conn, role="doctor")
    dept = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    return None, doctor["staff_id"], dept


async def _waiting(committed_conn, dept, doctor_id, pid, pos):
    return await committed_conn.fetchval(
        "insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source, queue_position) "
        "values ($1,$1,$2,$3,'진료대기','staff',$4) returning id", pid, dept, doctor_id, pos)


@pytest.mark.asyncio
async def test_wait_estimate_uses_slot_duration_when_no_history(committed_conn):
    # 3단 대체 ②: 실측 이력이 없으면 슬롯 간격(30분)으로 1인당 시간을 잡는다. 앞 2명 → 60분.
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    await committed_conn.execute(
        "insert into doctor_schedule_rules (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments) "
        "values ($1,0,'09:00','18:00',30,50),($1,1,'09:00','18:00',30,50),($1,2,'09:00','18:00',30,50),"
        "($1,3,'09:00','18:00',30,50),($1,4,'09:00','18:00',30,50),($1,5,'09:00','18:00',30,50),($1,6,'09:00','18:00',30,50)",
        doctor_id)
    me = _ctx(await seed_patient(committed_conn))
    await _waiting(committed_conn, dept, doctor_id, (await seed_patient(committed_conn, phone="010-1"))["patient_id"], 1)
    await _waiting(committed_conn, dept, doctor_id, (await seed_patient(committed_conn, phone="010-2"))["patient_id"], 2)
    mine = await _waiting(committed_conn, dept, doctor_id, me.id, 3)
    st = await q.get_queue_status(me, mine)
    assert st["patients_ahead"] == 2 and st["estimated_wait_minutes"] == 60


@pytest.mark.asyncio
async def test_wait_estimate_null_when_no_basis(committed_conn):
    # 3단 대체 ③: 실측도 슬롯 간격도 없으면 숫자를 만들지 않는다(CARD-WAIT-04).
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    await _waiting(committed_conn, dept, doctor_id, (await seed_patient(committed_conn, phone="010-3"))["patient_id"], 1)
    mine = await _waiting(committed_conn, dept, doctor_id, me.id, 2)
    st = await q.get_queue_status(me, mine)
    assert st["patients_ahead"] == 1 and st["estimated_wait_minutes"] is None


async def _future_appt(committed_conn, me, dept, doctor_id):
    from app.services import patient_booking_service
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-09-01','09:00') returning id",
        doctor_id)
    return await patient_booking_service.create_booking(
        me, for_patient_id=me.id, department_id=dept, doctor_id=doctor_id,
        slot_id=slot, reason="감기", request_id=uuid4())


@pytest.mark.asyncio
async def test_list_my_appointments_excludes_cancelled_and_past(committed_conn):
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    live = await _future_appt(committed_conn, me, dept, doctor_id)
    # 과거 예약확정(직원 상태전이 누락) 1건은 나의 예약(진행 중)에서 빠진다.
    past_slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,'2020-01-01','09:00','예약됨') returning id",
        doctor_id)
    await committed_conn.execute(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
        "values ($1,$2,$2,$3,$4,'예약확정','app')", past_slot, me.id, dept, doctor_id)
    rows = await q.list_my_appointments(me)
    assert [r["id"] for r in rows] == [live]
    assert rows[0]["slot_date"] is not None  # SDB-21: 예약됨 슬롯 날짜가 NULL로 새지 않는다


@pytest.mark.asyncio
async def test_get_appointment_detail_has_names(committed_conn):
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    aid = await _future_appt(committed_conn, me, dept, doctor_id)
    d = await q.get_appointment_detail(me, aid)
    assert d["department_name"] == "내과" and d["status"] in ("예약신청", "예약확정")
