"""진료과·일정 관리 관리자 API (Task 17).

⛔ main.py에 이 router를 등록하는 것은 코디 몫이다 — 여기서는 만들기만 한다.
   등록: app.main에 `from app.routers import schedule_admin` + `app.include_router(schedule_admin.router)`.

모든 엔드포인트는 admin 전용이다(진료과·일정은 관리자만 고친다). 서비스는 acquire_as로 얻은
authenticated+admin 커넥션에서 돌아 RLS(admin_can_manage_*)를 통과한다.
"""
from __future__ import annotations

from datetime import date, time
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.security import StaffContext, require_role
from app.db.pool import acquire_as
from app.services import department_service, schedule_admin_service, slot_generator
from app.services import opening_hours

router = APIRouter(prefix="/admin", tags=["schedule-admin"])

AdminOnly = require_role("admin")


# ══ 요청 모델 ════════════════════════════════════════════════════════

class DepartmentBody(BaseModel):
    name: str = Field(min_length=1)


class WeekRuleBody(BaseModel):
    weekday: int = Field(ge=0, le=6)
    is_day_off: bool = False
    start: time | None = None
    end: time | None = None
    slot_minutes: int | None = None
    lunch_start: time | None = None
    lunch_end: time | None = None
    max_daily: int | None = None
    booking_deadline: time | None = None


class WeekRulesBody(BaseModel):
    rows: list[WeekRuleBody]


class HoursBody(BaseModel):
    open_time: time
    close_time: time
    lunch_start: time | None = None
    lunch_end: time | None = None


class ClosureBody(BaseModel):
    closure_date: date
    memo: str | None = None


class ExceptionBody(BaseModel):
    exception_date: date
    is_closed: bool
    override_start: time | None = None
    override_end: time | None = None


# ══ 진료과 ═══════════════════════════════════════════════════════════

@router.get("/departments")
async def list_departments(
    include_inactive: bool = False,
    staff: StaffContext = Depends(AdminOnly),
) -> list[dict]:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        return await department_service.list_departments(conn, include_inactive=include_inactive)


@router.post("/departments")
async def create_department(body: DepartmentBody, staff: StaffContext = Depends(AdminOnly)) -> dict:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        dept_id = await schedule_admin_service.create_department(conn, body.name, staff=staff)
    return {"id": str(dept_id)}


@router.patch("/departments/{dept_id}")
async def rename_department(
    dept_id: UUID, body: DepartmentBody, staff: StaffContext = Depends(AdminOnly)
) -> dict:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        await schedule_admin_service.rename_department(conn, dept_id, body.name, staff=staff)
    return {"status": "renamed"}


@router.post("/departments/{dept_id}/deactivate")
async def deactivate_department(dept_id: UUID, staff: StaffContext = Depends(AdminOnly)) -> dict:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        await schedule_admin_service.deactivate_department(conn, dept_id, staff=staff)
    return {"status": "deactivated"}


@router.post("/departments/{dept_id}/reactivate")
async def reactivate_department(dept_id: UUID, staff: StaffContext = Depends(AdminOnly)) -> dict:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        await schedule_admin_service.reactivate_department(conn, dept_id, staff=staff)
    return {"status": "reactivated"}


# ══ 일정(주간 규칙·격자·재생성) ══════════════════════════════════════

@router.get("/schedule/overview")
async def schedule_overview(staff: StaffContext = Depends(AdminOnly)) -> list[dict]:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        return _jsonable(await schedule_admin_service.overview_grid(conn))


@router.get("/schedule/doctors/{doctor_id}/week")
async def get_week_rules(doctor_id: UUID, staff: StaffContext = Depends(AdminOnly)) -> list[dict]:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        return _jsonable(await schedule_admin_service.list_week_rules(conn, doctor_id))


@router.put("/schedule/doctors/{doctor_id}/week")
async def put_week_rules(
    doctor_id: UUID, body: WeekRulesBody, staff: StaffContext = Depends(AdminOnly)
) -> dict:
    rows = [row.model_dump() for row in body.rows]
    async with acquire_as(str(staff.auth_user_id)) as conn:
        result = await schedule_admin_service.save_week_rules(conn, doctor_id, rows, staff=staff)
        # 저장 뒤 8주치 추천 자리를 규칙대로 다시 만든다(격자 밖 예약은 남는다, SCHED-SLOT-05).
        regen = await slot_generator.regenerate_slots(conn, doctor_id)
    return {**result, "regenerated": regen}


@router.post("/schedule/doctors/{doctor_id}/copy-monday")
async def copy_monday(doctor_id: UUID, staff: StaffContext = Depends(AdminOnly)) -> dict:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        await schedule_admin_service.copy_monday_to_rest(conn, doctor_id, staff=staff)
    return {"status": "copied"}


@router.post("/schedule/doctors/{doctor_id}/regenerate")
async def regenerate(
    doctor_id: UUID, dry_run: bool = False, staff: StaffContext = Depends(AdminOnly)
) -> dict:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        return await slot_generator.regenerate_slots(conn, doctor_id, dry_run=dry_run)


@router.post("/schedule/doctors/{doctor_id}/exceptions")
async def upsert_exception(
    doctor_id: UUID, body: ExceptionBody, staff: StaffContext = Depends(AdminOnly)
) -> dict:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        await schedule_admin_service.upsert_doctor_exception(
            conn, doctor_id, body.exception_date, is_closed=body.is_closed,
            override_start=body.override_start, override_end=body.override_end, staff=staff,
        )
    return {"status": "saved"}


# ══ 병원 운영시간 · 휴무 ═════════════════════════════════════════════

@router.put("/hours/{weekday}")
async def put_hours(
    weekday: int, body: HoursBody, staff: StaffContext = Depends(AdminOnly)
) -> dict:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        await opening_hours.save_hospital_hours(
            conn, weekday=weekday, open_time=body.open_time, close_time=body.close_time,
            lunch_start=body.lunch_start, lunch_end=body.lunch_end, staff=staff,
        )
    return {"status": "saved"}


@router.post("/closures")
async def create_closure(body: ClosureBody, staff: StaffContext = Depends(AdminOnly)) -> dict:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        await schedule_admin_service.upsert_closure(conn, body.closure_date, body.memo, staff=staff)
    return {"status": "saved"}


def _jsonable(rows: list[dict]) -> list[dict]:
    """UUID·time을 문자열로 — pydantic response_model 없이 바로 반환하기 위한 최소 직렬화."""
    out = []
    for row in rows:
        item = {}
        for key, value in row.items():
            if isinstance(value, UUID):
                item[key] = str(value)
            elif isinstance(value, time):
                item[key] = value.isoformat()
            elif isinstance(value, list):
                item[key] = _jsonable(value)
            else:
                item[key] = value
        out.append(item)
    return out
