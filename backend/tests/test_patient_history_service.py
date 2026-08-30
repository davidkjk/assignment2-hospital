import pytest
from datetime import date

from app.core.patient_security import PatientContext
from app.services import patient_history_service as h
from tests.conftest import seed_patient, seed_staff

# 이력 서비스도 acquire_as(patient) 자기커넥션 → 시드·검증은 committed_conn(RLS 우회 postgres 역할).


def _ctx(s): return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


async def _past(committed_conn, me, dept, doctor_id, status, date_str, *, note=None):
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'09:00','예약됨') returning id",
        doctor_id, date.fromisoformat(date_str) if isinstance(date_str, str) else date_str)
    aid = await committed_conn.fetchval(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
        "values ($1,$2,$2,$3,$4,$5,'app') returning id", slot, me.id, dept, doctor_id, status)
    if note is not None:
        await committed_conn.execute(
            "insert into medical_records (appointment_id, doctor_id, symptoms, diagnosis, patient_visible_notes, is_completed) "
            "values ($1,$2,'내부','내부',$3,true)", aid, doctor_id, note)
    return aid


async def _seed_dd(committed_conn):
    doctor = await seed_staff(committed_conn, role="doctor")
    dept = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    return doctor["staff_id"], dept


@pytest.mark.asyncio
async def test_history_covers_four_statuses_newest_first(committed_conn):
    did, dept = await _seed_dd(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    await _past(committed_conn, me, dept, did, "진료완료", "2026-01-10", note="휴식하세요")
    await _past(committed_conn, me, dept, did, "환자취소", "2026-02-10")
    await _past(committed_conn, me, dept, did, "예약부도", "2026-03-10")
    await _past(committed_conn, me, dept, did, "예약신청", "2020-01-01")  # 지난 예약신청 = 확정되지않음
    res = await h.list_visit_history(me, me.id)
    statuses = {i["visit_status"] for i in res["items"]}
    assert statuses == {"진료완료", "취소됨", "방문하지않음", "확정되지않음"}
    # 날짜 내림차순: 2026-03-10(부도) > 02-10(취소) > 01-10(완료) > 2020(미확정).
    assert [i["visit_status"] for i in res["items"]] == ["방문하지않음", "취소됨", "진료완료", "확정되지않음"]
    done = next(i for i in res["items"] if i["visit_status"] == "진료완료")
    assert done["patient_visible_notes"] == "휴식하세요"


@pytest.mark.asyncio
async def test_history_paginates_20_with_cursor(committed_conn):
    did, dept = await _seed_dd(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    for i in range(25):
        await _past(committed_conn, me, dept, did, "진료완료", f"2026-{(i%12)+1:02d}-{(i%27)+1:02d}")
    first = await h.list_visit_history(me, me.id, limit=20)
    assert len(first["items"]) == 20 and first["next_cursor"] is not None
    second = await h.list_visit_history(me, me.id, cursor=first["next_cursor"], limit=20)
    assert len(second["items"]) == 5 and second["next_cursor"] is None
