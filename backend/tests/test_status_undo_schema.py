"""갭 #82 — 예약 상태 「한 칸 역전이」의 DB 방어선(00037).

막는 곳이 둘이다(UNDO-IMPL-02): 파이썬 VALID_TRANSITIONS와 DB 트리거
enforce_appointment_status_transition. 여기서는 **DB 트리거**만 본다 —
migration 00037이 private.appointment_status_transitions에 역전이 행을 심어
「진행 4상태에서 한 칸 뒤로」만 열고, 두 칸 점프는 여전히 막는지.
"""

import pytest

from tests.conftest import seed_staff, set_session_auth


async def _seed_appt(conn, status: str) -> tuple:
    """전이 검증은 UPDATE에만 걸리므로(00005), 원하는 상태로 직접 INSERT해 씨딩한다."""
    admin = await seed_staff(conn, role="admin")
    doctor = await seed_staff(conn, role="doctor")
    dept_id = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    await conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동','1985-03-01','M','01012345678') returning id"
    )
    await set_session_auth(conn, admin["auth_user_id"])
    appt_id = await conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, $4, 'staff', $5)
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"], status, admin["staff_id"],
    )
    return appt_id


@pytest.mark.asyncio
async def test_역전이_행이_네_개_심겨_있다(db_conn):
    """[UNDO-SCOPE-01] 진행 4상태 각각의 「한 칸 뒤로」가 전이표에 있다."""
    rows = await db_conn.fetch(
        "select from_status, to_status from private.appointment_status_transitions "
        "where (from_status, to_status) in "
        "(('도착','예약확정'),('진료대기','도착'),('진료중','진료대기'),('진료완료','진료중'))"
    )
    assert len(rows) == 4


@pytest.mark.asyncio
async def test_DB_트리거가_한_칸_역전이를_허용한다(db_conn):
    """[UNDO-IMPL-02] 트리거 직격 — 서비스를 거치지 않은 raw UPDATE도 통과해야
    「서버는 통과, DB가 거절」로 눌렀는데 실패가 안 난다."""
    appt = await _seed_appt(db_conn, "진료중")
    await db_conn.execute("update appointments set status='진료대기' where id=$1", appt)
    assert await db_conn.fetchval("select status from appointments where id=$1", appt) == "진료대기"


@pytest.mark.asyncio
async def test_DB_트리거가_두_칸_점프는_여전히_막는다(db_conn):
    """[UNDO-SCOPE-04] 한 칸만 — 진료완료에서 진료대기로(두 칸)는 되돌리기가 아니라 다시 짜기."""
    import asyncpg

    appt = await _seed_appt(db_conn, "진료완료")
    with pytest.raises(asyncpg.PostgresError):
        await db_conn.execute("update appointments set status='진료대기' where id=$1", appt)
