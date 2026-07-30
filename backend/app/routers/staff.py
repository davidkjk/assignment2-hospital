from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import staff_service

router = APIRouter(prefix="/staff", tags=["staff"])


class InviteStaffRequest(BaseModel):
    email: str
    name: str
    role: str
    department_id: UUID | None = None


class InviteStaffResponse(BaseModel):
    staff_id: UUID


@router.post("", response_model=InviteStaffResponse)
async def invite_staff(
    body: InviteStaffRequest,
    staff: StaffContext = Depends(require_role("admin")),
) -> InviteStaffResponse:
    staff_id = await staff_service.invite_staff(
        email=body.email, name=body.name, role=body.role, department_id=body.department_id, invited_by=staff,
    )
    return InviteStaffResponse(staff_id=staff_id)


@router.patch("/{staff_id}/deactivate")
async def deactivate_staff(
    staff_id: UUID,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    await staff_service.deactivate_staff(staff_id, deactivated_by=staff)
    return {"status": "deactivated"}


@router.get("")
async def get_staff_list(
    staff: StaffContext = Depends(require_role("admin")),
) -> list[dict]:
    """[정합성 검토 R3-04] `/admin/staff` 화면의 직원 목록."""
    return await staff_service.list_staff(staff)


@router.post("/{staff_id}/resend-invite")
async def resend_invite(
    staff_id: UUID,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[정합성 검토 R3-04] 초대 이메일 재발송."""
    await staff_service.resend_invite(staff_id, requested_by=staff)
    return {"status": "resent"}
