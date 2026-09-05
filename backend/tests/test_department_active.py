"""[SCHED-DEPT-02~11] 갭 #92 — 진료과 사용 중지가 아무 데도 반영되지 않던 결함을 갚는다.

지금 예약 트리거는 departments.is_active를 아예 보지 않는다(00005:301~310) — ①담당 의사가
활성인가 ②예약 진료과 = 그 의사 소속 과인가 둘만 본다. 그래서 「껐으니 예약이 안 들어오겠지」는
잘못된 안심이다. 규칙: 활성 의사가 있으면 중지를 막고 /admin/staff로 보낸다.
"""
import uuid

import pytest

from app.core.errors import AppError
from app.services import schedule_admin_service
from app.services.department_service import list_departments
from app.services.schedule_admin_service import (
    deactivate_department,
    reactivate_department,
    rename_department,
)


async def _dept(conn, name: str, is_active: bool = True) -> uuid.UUID:
    return await conn.fetchval(
        "insert into departments (name, is_active) values ($1, $2) returning id",
        name, is_active,
    )


async def _doctor(conn, name: str, dept, is_active: bool = True) -> uuid.UUID:
    auth_id = uuid.uuid4()
    await conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                                created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_id, f"{auth_id}@test.local",
    )
    return await conn.fetchval(
        "insert into staff (auth_user_id, name, role, department_id, is_active) "
        "values ($1, $2, 'doctor', $3, $4) returning id",
        auth_id, name, dept, is_active,
    )


async def test_진료과_목록이_is_active를_조회하고_거른다(db_conn):
    """[SCHED-DEPT-09][SCHED-DEPT-10] 지금은 select id, name … 이라 사용 중지가
    아무 데도 반영되지 않는다. 예약 1단계·캘린더 칩·의사 등록 목록에서 빠져야 한다."""
    a = await _dept(db_conn, "내과")
    b = await _dept(db_conn, "정형외과")
    await deactivate_department(db_conn, b, staff=None)
    active_ids = [d["id"] for d in await list_departments(db_conn)]
    assert b not in active_ids
    assert a in active_ids
    all_ids = [d["id"] for d in await list_departments(db_conn, include_inactive=True)]
    assert b in all_ids


async def test_활성_의사가_있는_진료과는_중지를_막는다(db_conn):
    """[SCHED-DEPT-03][SCHED-DEPT-04] 끄는 것이 아무것도 막지 못하기 때문이다.
    막지 않으면 「껐으니 예약이 안 들어오겠지」라는 잘못된 안심만 생긴다."""
    dept = await _dept(db_conn, "내과")
    await _doctor(db_conn, "박지훈", dept)
    await _doctor(db_conn, "최민석", dept)
    with pytest.raises(AppError) as e:
        await deactivate_department(db_conn, dept, staff=None)
    assert e.value.detail["active_doctors"] == ["박지훈", "최민석"]
    # 막혔으니 진료과는 그대로 활성이다(막다른 길이 아니라 갈 길을 준다).
    assert dept in [d["id"] for d in await list_departments(db_conn)]


async def test_비활성_의사만_있으면_진료과를_끌_수_있다(db_conn):
    """[SCHED-DEPT-05] 갈 길 — 의사를 먼저 옮기거나 끄면 진료과를 끌 수 있다."""
    dept = await _dept(db_conn, "내과")
    await _doctor(db_conn, "박지훈", dept, is_active=False)
    await deactivate_department(db_conn, dept, staff=None)
    assert dept not in [d["id"] for d in await list_departments(db_conn)]


async def test_중지한_진료과를_되살릴_수_있다(db_conn):
    """[SCHED-DEPT-05] 끌 수 없는 스위치를 두지 않는다 — 되살리기 경로."""
    dept = await _dept(db_conn, "내과", is_active=False)
    await reactivate_department(db_conn, dept, staff=None)
    assert dept in [d["id"] for d in await list_departments(db_conn)]


async def test_이름_수정은_지난_예약에도_반영된다(db_conn):
    """[SCHED-DEPT-11] 참조이지 복사가 아니다 — departments.name 한 줄만 바꾼다."""
    dept = await _dept(db_conn, "내과")
    await rename_department(db_conn, dept, "내과2", staff=None)
    name = await db_conn.fetchval("select name from departments where id=$1", dept)
    assert name == "내과2"


async def test_진료과_삭제_API가_없다(db_conn):
    """[SCHED-DEPT-02] 지운 진료과를 참조하는 지난 예약·문진표가 통째로 깨진다."""
    assert not hasattr(schedule_admin_service, "delete_department")


async def test_진료과_쪽에_영향받는_예약_인자를_두지_않는다(db_conn):
    """[SCHED-DEPT-06] 앞으로의 예약 문제는 의사 쪽에서 저절로 풀린다 —
    의사를 끄면 예약이 만들어지지 않는다(같은 트리거). ⛔ 경고 장치를 하나 더 만들지 않는다."""
    import inspect
    assert "affected_appointments" not in inspect.signature(deactivate_department).parameters
