"""[Task 29][HSET-*][HSETX-*] /admin/settings 병원 설정 라우터 — 관리자만.

⚠️ 코디 배선 필요: main.py에 `app.include_router(settings.router)`를 등록해야 노출된다.
   한 화면·한 저장(HSET-SAVE-01) — PUT은 원자 저장이고, 취소마감 미리보기는 건수만 준다.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import settings_service

router = APIRouter(tags=["settings"])

_ADMIN = ("admin",)  # HSET-NAV-05 — 관리자 전용


class SaveIn(BaseModel):
    patch: dict
    base_version: int


@router.get("/admin/settings")
async def read_settings(
    staff: StaffContext = Depends(require_role(*_ADMIN)),
) -> dict:
    """[HSETX-API-01] 최초 진입 read — scalar·알림 override·예정 휴무·항목별 최근 변경을 한 번에."""
    return await settings_service.get_settings(staff)


@router.put("/admin/settings")
async def save_settings(
    body: SaveIn,
    staff: StaffContext = Depends(require_role(*_ADMIN)),
) -> dict:
    """[HSET-SAVE-01][HSETX-DATA-04][HSETX-STATE-03] 다섯 묶음 원자 저장. 버전 충돌이면 409."""
    return await settings_service.save_settings(staff, body.patch, body.base_version)


@router.get("/admin/settings/preview-cancellation")
async def preview_cancellation(
    hours: int,
    staff: StaffContext = Depends(require_role(*_ADMIN)),
) -> dict:
    """[HSETX-API-03][HSET-SAVE-06] 새 마감으로 마감 후가 되는 미래 예약 건수만(이름·전화 없음)."""
    count = await settings_service.preview_cancellation_deadline(staff, hours)
    return {"count": count}


@router.get("/admin/settings/preview-booking-window")
async def preview_booking_window(
    weeks: int,
    staff: StaffContext = Depends(require_role(*_ADMIN)),
) -> dict:
    """[SCHED-WINDOW-05] 예약 기간을 줄이기 전 확인창용 — 새 범위 밖에 남을 예약 건수만."""
    count = await settings_service.preview_booking_window(staff, weeks)
    return {"count": count}
