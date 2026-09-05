"""[보안 F-02] move_questionnaire_response IDOR 하강 — 호출자 소유·lineage 검증.

정본: docs/security-audit-2026-09-04/ F-02. 기존 정상 재예약 흐름(문진 이동)은
test_patient_booking_service.test_change_booking_moves_questionnaire_keeping_submitted_at가
계속 green으로 지킨다. 여기선 「정상 흐름이 아닌 직접 호출」이 막히는지만 본다.
"""
import pytest
import asyncpg
from datetime import date, time

from app.db.pool import acquire_as
from tests.conftest import seed_patient, seed_staff


async def _appt(conn, *, owner, dept, doctor, slot_date, start_time):
    slot = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,$3) returning id",
        doctor, slot_date, start_time)
    return await conn.fetchval(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, "
        " reason, status, source) values ($1,$2,$2,$3,$4,'감기','예약확정','app') returning id",
        slot, owner, dept, doctor)


@pytest.mark.asyncio
async def test_staff_cannot_move_questionnaire_of_a_patient(committed_conn):
    # F-02: 접수직원(예약 read 권한 보유)이 남의 환자 문진을 두 예약 사이로 옮길 수 있으면 안 된다.
    doctor = await seed_staff(committed_conn, role="doctor")
    dept = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    reception = await seed_staff(committed_conn, role="receptionist", department_id=dept)
    p = await seed_patient(committed_conn)
    old_id = await _appt(committed_conn, owner=p["patient_id"], dept=dept, doctor=doctor["staff_id"],
                         slot_date=date(2999,8,1), start_time=time(9,0))
    new_id = await _appt(committed_conn, owner=p["patient_id"], dept=dept, doctor=doctor["staff_id"],
                         slot_date=date(2999,8,2), start_time=time(9,0))
    tid = await committed_conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) values ($1,'[]'::jsonb) returning id", dept)
    await committed_conn.execute(
        "insert into questionnaire_responses (appointment_id, template_id, answers) values ($1,$2,'{}'::jsonb)",
        old_id, tid)

    # 접수직원 세션으로 RPC 직접 호출 → 거부되어야 한다(자기 소유가 아님).
    async with acquire_as(str(reception["auth_user_id"])) as conn:
        with pytest.raises(asyncpg.PostgresError):
            await conn.execute("select move_questionnaire_response($1,$2)", old_id, new_id)

    # 문진은 원래 예약에 그대로 있어야 한다.
    assert await committed_conn.fetchval(
        "select appointment_id from questionnaire_responses where template_id=$1", tid) == old_id


@pytest.mark.asyncio
async def test_patient_cannot_move_questionnaire_across_departments(committed_conn):
    # F-02 lineage: 본인 예약이라도 다른 진료과 예약으로 임상문서 귀속을 옮길 수 없다.
    dept_a = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    dept_b = await committed_conn.fetchval("insert into departments (name) values ('정형외과') returning id")
    doc_a = await seed_staff(committed_conn, role="doctor", department_id=dept_a)
    doc_b = await seed_staff(committed_conn, role="doctor", department_id=dept_b)
    p = await seed_patient(committed_conn)
    old_id = await _appt(committed_conn, owner=p["patient_id"], dept=dept_a, doctor=doc_a["staff_id"],
                         slot_date=date(2999,8,3), start_time=time(9,0))
    new_id = await _appt(committed_conn, owner=p["patient_id"], dept=dept_b, doctor=doc_b["staff_id"],
                         slot_date=date(2999,8,4), start_time=time(9,0))
    tid = await committed_conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) values ($1,'[]'::jsonb) returning id", dept_a)
    await committed_conn.execute(
        "insert into questionnaire_responses (appointment_id, template_id, answers) values ($1,$2,'{}'::jsonb)",
        old_id, tid)

    async with acquire_as(str(p["auth_user_id"])) as conn:
        with pytest.raises(asyncpg.PostgresError):
            await conn.execute("select move_questionnaire_response($1,$2)", old_id, new_id)

    assert await committed_conn.fetchval(
        "select appointment_id from questionnaire_responses where template_id=$1", tid) == old_id
