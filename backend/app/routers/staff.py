from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.db.pool import acquire_as
from app.services import staff_profile, staff_service

router = APIRouter(prefix="/staff", tags=["staff"])

_UNSET = object()


class InviteStaffRequest(BaseModel):
    email: str
    name: str
    role: str
    department_id: UUID | None = None


class InviteStaffResponse(BaseModel):
    staff_id: UUID


class UpdateProfileRequest(BaseModel):
    specialty: str | None = None
    bio: str | None = None
    photo_url: str | None = None
    calendar_color_index: int | None = None


class DeactivateRequest(BaseModel):
    impact_version: str | None = None


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
    body: DeactivateRequest | None = None,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    impact_version = body.impact_version if body is not None else None
    await staff_service.deactivate_staff(staff_id, deactivated_by=staff, impact_version=impact_version)
    return {"status": "deactivated"}


@router.get("/{staff_id}/deactivation-impact")
async def get_deactivation_impact(
    staff_id: UUID,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[STAFF-DEACT-04] 중지 확정 전 미리보기 — 건수·날짜·시각만(이름·전화 없음)."""
    async with acquire_as(str(staff.auth_user_id)) as conn:
        return await staff_service.get_deactivation_impact(conn, staff_id)


@router.patch("/{staff_id}/profile")
async def update_profile(
    staff_id: UUID,
    body: UpdateProfileRequest,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[STAFF-PROFILE-04] 전달된 칸만 갱신한다(부분 저장)."""
    fields = body.model_dump(exclude_unset=True)
    await staff_profile.update_doctor_profile(
        staff_id,
        specialty=fields.get("specialty", _UNSET),
        bio=fields.get("bio", _UNSET),
        photo_url=fields.get("photo_url", _UNSET),
        calendar_color_index=fields.get("calendar_color_index", _UNSET),
        staff=staff,
    )
    return {"status": "updated"}


@router.post("/{staff_id}/photo")
async def upload_photo(
    staff_id: UUID,
    file: UploadFile = File(...),
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[STAFF-PROFILE-06] 사진을 Storage에 올리고 공개 URL을 돌려준다."""
    data = await file.read()
    photo_url = await staff_profile.upload_photo(
        staff_id,
        filename=file.filename or "photo",
        content_type=file.content_type or "application/octet-stream",
        data=data,
        staff=staff,
    )
    return {"photo_url": photo_url}


@router.delete("/{staff_id}/photo")
async def delete_photo(
    staff_id: UUID,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[STAFF-PROFILE-07] 사진 칸을 비우고 저장소의 파일도 지운다."""
    await staff_profile.delete_photo(staff_id, staff=staff)
    return {"status": "deleted"}


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
