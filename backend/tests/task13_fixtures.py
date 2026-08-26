"""Task 13 조회 전용 백엔드 테스트용 시드 헬퍼.

모든 시드는 소유자(RLS 우회) 역할로 db_conn 트랜잭션 안에서 돌고 롤백된다 —
서비스는 conn=db_conn을 받아 같은 트랜잭션에서 RLS를 적용해 실행하므로 커밋/정리가 없다.
seed는 반드시 set_session_auth 이전에(소유자로) 호출한다.
"""
import uuid
from datetime import date, time

from app.core.security import StaffContext
from tests.conftest import seed_staff


def to_context(seed: dict, role: str, department_id=None) -> StaffContext:
    return StaffContext(
        id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=department_id
    )


async def seed_department(conn, name=None) -> uuid.UUID:
    return await conn.fetchval(
        "insert into departments (name) values ($1) returning id", name or f"과-{uuid.uuid4().hex[:6]}"
    )


async def seed_doctor(conn, department_id, is_active=True) -> dict:
    seed = await seed_staff(conn, role="doctor", department_id=department_id, is_active=is_active)
    return seed


async def seed_patient(conn, *, name="홍길동", birth_date=date(1985, 3, 1),
                       phone="01012345678", gender="M") -> uuid.UUID:
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ($1,$2,$3,$4) returning id",
        name, birth_date, gender, phone,
    )


async def seed_slot(conn, doctor_id, slot_date, start_time=time(9, 0), status="예약됨") -> uuid.UUID:
    return await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1,$2,$3,$4) returning id",
        doctor_id, slot_date, start_time, status,
    )


async def seed_appointment(conn, *, doctor_id, department_id, patient_id, slot_id=None,
                           status="예약확정", source="staff", queue_position=None,
                           support_requested_at=None, request_type=None) -> uuid.UUID:
    return await conn.fetchval(
        """
        insert into appointments
          (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source,
           queue_position, support_requested_at, request_type)
        values ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9)
        returning id
        """,
        slot_id, patient_id, department_id, doctor_id, status, source,
        queue_position, support_requested_at, request_type,
    )


async def transition_to_waiting(conn, appointment_id, changed_by, minutes_ago=0) -> None:
    """진료대기 전이 이력을 과거 시각으로 남긴다(R2-03 대기 시작 시각의 근거)."""
    await conn.execute(
        "insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, changed_at) "
        "values ($1,'도착','진료대기',$2, now() - make_interval(mins => $3))",
        appointment_id, changed_by, minutes_ago,
    )


async def add_reorder_memo(conn, appointment_id, changed_by) -> None:
    """순서 재배치 메모(from_status = to_status) — 대기 시작 시각을 초기화하면 안 된다."""
    await conn.execute(
        "insert into appointment_status_history (appointment_id, from_status, to_status, changed_by) "
        "values ($1,'진료대기','진료대기',$2)",
        appointment_id, changed_by,
    )


async def db_today(conn) -> date:
    return await conn.fetchval("select current_date")
