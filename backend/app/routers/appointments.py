from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import appointment_service

router = APIRouter(prefix="/appointments", tags=["appointments"])


class CreateAppointmentRequest(BaseModel):
    account_patient_id: UUID
    for_patient_id: UUID
    department_id: UUID
    doctor_id: UUID
    reason: str
    source: str
    initial_status: str
    slot_id: UUID | None = None


class CreateAppointmentResponse(BaseModel):
    appointment_id: UUID


@router.post("", response_model=CreateAppointmentResponse)
async def create_appointment(
    body: CreateAppointmentRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> CreateAppointmentResponse:
    # [정합성 검토 R1-우선3 재검증] 이 엔드포인트는 require_role로 접수직원/관리자만 호출할 수 있으므로
    # source는 항상 "staff"로 서버가 고정한다 — body.source는 받되(구 클라이언트/스모크 테스트 호환용
    # 필드로 남겨둔다) 신뢰하지 않고 무시한다.
    appointment_id = await appointment_service.create_appointment(
        staff=staff,
        account_patient_id=body.account_patient_id,
        for_patient_id=body.for_patient_id,
        department_id=body.department_id,
        doctor_id=body.doctor_id,
        reason=body.reason,
        source="staff",
        initial_status=body.initial_status,
        slot_id=body.slot_id,
    )
    return CreateAppointmentResponse(appointment_id=appointment_id)


class TransitionStatusRequest(BaseModel):
    new_status: str
    reason: str | None = None
    expected_updated_at: datetime


@router.patch("/{appointment_id}/status")
async def change_status(
    appointment_id: UUID,
    body: TransitionStatusRequest,
    staff: StaffContext = Depends(require_role("receptionist", "doctor", "admin")),
) -> dict:
    await appointment_service.transition_status(
        appointment_id, body.new_status, staff, body.reason, body.expected_updated_at,
    )
    return {"status": "updated"}


class ReorderQueueRequest(BaseModel):
    new_position: int
    reason: str


@router.patch("/{appointment_id}/queue-position")
async def change_queue_position(
    appointment_id: UUID,
    body: ReorderQueueRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    await appointment_service.reorder_queue(appointment_id, body.new_position, staff, body.reason)
    return {"status": "reordered"}


class SetUrgentFlagRequest(BaseModel):
    is_urgent: bool
    expected_updated_at: datetime


@router.patch("/{appointment_id}/urgent-flag")
async def change_urgent_flag(
    appointment_id: UUID,
    body: SetUrgentFlagRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    await appointment_service.set_urgent_flag(appointment_id, body.is_urgent, staff, body.expected_updated_at)
    return {"status": "updated"}
