"""[SCHED-DEPT-*][SCHED-WEEK-*][SCHED-SLOT-01] 일정 관리 라우터.

⛔ main.py 등록은 코디 몫이라, 여기서는 이 router만 얹은 로컬 최소 앱으로 계약을 확인한다.
schedule_admin.router를 app.main에 등록해야 실제 서비스에 노출된다(보고 참조).
"""
import time as _time
import uuid

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from jose import jwt

from app.core.config import settings
from app.core.errors import AppError, app_error_handler
from app.routers import schedule_admin
from tests.conftest import seed_staff


def make_token(auth_user_id: str) -> str:
    payload = {"sub": auth_user_id, "aud": "authenticated", "role": "authenticated",
               "exp": int(_time.time()) + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _headers(staff: dict) -> dict:
    return {"Authorization": f"Bearer {make_token(str(staff['auth_user_id']))}"}


@pytest_asyncio.fixture
async def api_client():
    app = FastAPI()
    app.add_exception_handler(AppError, app_error_handler)
    app.include_router(schedule_admin.router)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def schedule_cleanup(db_pool):
    # 스케줄 표는 staff(id)를 FK로 물고 있어, autouse의 staff 삭제 전에 먼저 비운다.
    yield
    async with db_pool.acquire() as conn:
        await conn.execute("delete from doctor_schedule_exceptions")
        await conn.execute("delete from doctor_schedule_rules")
        await conn.execute("delete from hospital_closures")
        await conn.execute("delete from hospital_hours")


async def _dept(conn, name="내과") -> uuid.UUID:
    return await conn.fetchval("insert into departments (name) values ($1) returning id", name)


async def test_admin이_진료과를_만들고_목록에서_본다(api_client, committed_conn):
    admin = await seed_staff(committed_conn, role="admin")
    created = await api_client.post("/admin/departments", headers=_headers(admin),
                                    json={"name": "재활의학과"})
    assert created.status_code == 200
    listed = await api_client.get("/admin/departments", headers=_headers(admin))
    assert "재활의학과" in [d["name"] for d in listed.json()]


async def test_활성_의사가_있는_진료과_중지는_갈_길을_준다(api_client, committed_conn):
    """[SCHED-DEPT-04] 막다른 길이 아니라, 옮겨야 할 의사 이름과 갈 길을 응답에 담는다."""
    admin = await seed_staff(committed_conn, role="admin")
    dept = await _dept(committed_conn)
    await committed_conn.execute(
        "update staff set department_id=$1 where id=$2", dept, admin["staff_id"])
    doctor = await seed_staff(committed_conn, role="doctor", department_id=dept)
    await committed_conn.execute("update staff set name='박지훈' where id=$1", doctor["staff_id"])
    resp = await api_client.post(f"/admin/departments/{dept}/deactivate", headers=_headers(admin))
    assert resp.status_code == 400
    assert resp.json()["context"]["active_doctors"] == ["박지훈"]
    assert resp.json()["context"]["next"] == "/admin/staff"


async def test_주간_규칙_저장_뒤_읽으면_일곱_줄이_온다(api_client, committed_conn):
    """[SCHED-WEEK-02] 저장 창구와 읽기 창구가 짝을 이룬다 — 늘 7행."""
    admin = await seed_staff(committed_conn, role="admin")
    dept = await _dept(committed_conn)
    doctor = await seed_staff(committed_conn, role="doctor", department_id=dept)
    put = await api_client.put(
        f"/admin/schedule/doctors/{doctor['staff_id']}/week", headers=_headers(admin),
        json={"rows": [{"weekday": 0, "start": "09:00", "end": "17:00",
                        "slot_minutes": 20, "max_daily": 30}]},
    )
    assert put.status_code == 200
    week = await api_client.get(
        f"/admin/schedule/doctors/{doctor['staff_id']}/week", headers=_headers(admin))
    assert [r["weekday"] for r in week.json()] == [0, 1, 2, 3, 4, 5, 6]


async def test_재생성은_step_minutes를_돌려준다(api_client, committed_conn):
    """[SCHED-SLOT-01] 한 칸 길이(추천 자리 간격)를 응답에 담는다."""
    admin = await seed_staff(committed_conn, role="admin")
    dept = await _dept(committed_conn)
    doctor = await seed_staff(committed_conn, role="doctor", department_id=dept)
    await api_client.put(
        f"/admin/schedule/doctors/{doctor['staff_id']}/week", headers=_headers(admin),
        json={"rows": [{"weekday": 0, "start": "09:00", "end": "12:00",
                        "slot_minutes": 15, "max_daily": 30}]},
    )
    resp = await api_client.post(
        f"/admin/schedule/doctors/{doctor['staff_id']}/regenerate?dry_run=true",
        headers=_headers(admin))
    assert resp.json()["step_minutes"] == 15


async def test_관리자가_아니면_막힌다(api_client, committed_conn):
    """[STAFF-LOGIN] 진료과·일정은 관리자 전용."""
    doctor = await seed_staff(committed_conn, role="doctor")
    resp = await api_client.get("/admin/departments", headers=_headers(doctor))
    assert resp.status_code == 403
