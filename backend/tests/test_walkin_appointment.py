"""[QUEUE-WALK-08e·10·14·16] create_walkin_appointment — 예약 없이 온 환자를 그 자리에서 줄 세운다.

접수 문의 「예약 없이 오신 분」 갈래가 부르는 창구다. 전화예약(create_phone_appointment)과
같은 자리에 서지만 다른 것 셋을 지킨다:
  · 진료과를 받지 않는다 — 의사에서 서버가 도출한다(QUEUE-WALK-08e, 00005:299~320 트리거).
  · 상태가 「진료대기」다 — 「도착」을 거치지 않는다, 이미 병원에 있다(QUEUE-WALK-10).
  · 슬롯도 시간 범위도 없다 — 남는 것은 실제 방문 시각뿐이다(갭 #85 · QUEUE-WALK-15·18).

DB now()로 「지금」을 재므로(클럭 스큐 회피) 테스트도 상대 시각을 쓴다.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import appointment_service
from tests.conftest import seed_staff, set_session_auth


def _ctx(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


async def _seed(db_conn) -> dict:
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('워크인','1990-01-01','F','01099998888') returning id"
    )
    await set_session_auth(db_conn, receptionist["auth_user_id"])
    return {
        "receptionist": _ctx(receptionist, "receptionist"),
        "doctor_id": doctor["staff_id"],
        "dept_id": dept_id,
        "patient_id": patient_id,
    }


async def _walkin(conn, ctx: dict, visit_time=None, doctor_id=None):
    return await appointment_service.create_walkin_appointment(
        staff=ctx["receptionist"],
        patient_id=ctx["patient_id"],
        doctor_id=doctor_id or ctx["doctor_id"],
        reason="기침",
        visit_time=visit_time,
        conn=conn,
    )


@pytest.mark.asyncio
async def test_walkin_derives_department_from_doctor(db_conn):
    """[QUEUE-WALK-08e] 진료과는 고르는 값이 아니라 파생값 — 화면은 의사만 보낸다."""
    ctx = await _seed(db_conn)
    appointment_id = await _walkin(db_conn, ctx)
    dept = await db_conn.fetchval("select department_id from appointments where id = $1", appointment_id)
    assert dept == ctx["dept_id"]


@pytest.mark.asyncio
async def test_walkin_enters_queue_as_waiting(db_conn):
    """[QUEUE-WALK-10] 상태는 「진료대기」 — 「도착」을 거치지 않는다."""
    ctx = await _seed(db_conn)
    appointment_id = await _walkin(db_conn, ctx)
    status = await db_conn.fetchval("select status from appointments where id = $1", appointment_id)
    assert status == "진료대기"


@pytest.mark.asyncio
async def test_walkin_has_no_slot_and_no_time_range(db_conn):
    """[QUEUE-WALK-12] 슬롯이 없다 — 그래서 목록이 「당일 방문」 배지를 붙일 수 있다."""
    ctx = await _seed(db_conn)
    appointment_id = await _walkin(db_conn, ctx)
    row = await db_conn.fetchrow(
        "select slot_id, start_at, end_at from appointments where id = $1", appointment_id
    )
    assert row["slot_id"] is None
    assert row["start_at"] is None and row["end_at"] is None


@pytest.mark.asyncio
async def test_walkin_stamps_now_when_time_omitted(db_conn):
    """[QUEUE-WALK-14] 기본은 「지금」이고, 그 시각은 서버가 찍는다(화면 시계를 믿지 않는다)."""
    ctx = await _seed(db_conn)
    appointment_id = await _walkin(db_conn, ctx)
    visited = await db_conn.fetchval(
        "select walkin_visit_time from appointments where id = $1", appointment_id
    )
    assert visited is not None
    assert abs((datetime.now(timezone.utc) - visited).total_seconds()) < 60


@pytest.mark.asyncio
async def test_walkin_keeps_past_time_unsnapped(db_conn):
    """[QUEUE-WALK-14d] 방문 시각은 실제로 일어난 일의 기록이라 5분 격자에 붙이지 않는다."""
    ctx = await _seed(db_conn)
    past = (datetime.now(timezone.utc) - timedelta(hours=2)).replace(minute=7, second=0, microsecond=0)
    appointment_id = await _walkin(db_conn, ctx, visit_time=past)
    visited = await db_conn.fetchval(
        "select walkin_visit_time from appointments where id = $1", appointment_id
    )
    assert visited == past


@pytest.mark.asyncio
async def test_walkin_rejects_future_visit_time(db_conn):
    """[QUEUE-WALK-16] 지금보다 뒤는 못 적는다 — 화면만 막으면 반쪽이다."""
    ctx = await _seed(db_conn)
    future = datetime.now(timezone.utc) + timedelta(minutes=30)
    with pytest.raises(AppError) as exc:
        await _walkin(db_conn, ctx, visit_time=future)
    assert "아직 오지 않은 시각" in str(exc.value.message)


@pytest.mark.asyncio
async def test_walkin_rejects_doctor_without_department(db_conn):
    """진료과가 없는 의사는 도출이 불가능하다 — 트리거에 닿기 전에 읽을 수 있는 문장으로 막는다."""
    ctx = await _seed(db_conn)
    await db_conn.execute("reset role")
    await db_conn.execute("update staff set department_id = null where id = $1", ctx["doctor_id"])
    await db_conn.execute("set local role authenticated")
    with pytest.raises(AppError) as exc:
        await _walkin(db_conn, ctx)
    assert "진료과" in str(exc.value.message)
