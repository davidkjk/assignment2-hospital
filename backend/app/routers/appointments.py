from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.errors import AppError
from app.core.security import StaffContext, require_role
from app.db.pool import acquire_as
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
    # [QUEUE-WALK-18] 워크인 실제 방문 시각(갭 #85). 슬롯 없는 당일 방문에만 온다.
    walkin_visit_time: datetime | None = None


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
        walkin_visit_time=body.walkin_visit_time,
    )
    return CreateAppointmentResponse(appointment_id=appointment_id)


class UndoRequest(BaseModel):
    reason: str | None = None
    to_status: str | None = None


@router.post("/{appointment_id}/undo")
async def undo_status(
    appointment_id: UUID,
    body: UndoRequest,
    staff: StaffContext = Depends(require_role("receptionist", "doctor", "admin")),
) -> dict:
    """[UNDO-*] 한 칸 뒤로 되돌린다. 사유가 필요한지는 서버가 판정한다(UNDO-WHY-01·02·03).

    ⭐ 사유가 필요한데 안 왔으면 **막지 않고**(막다른 길 금지) `reason_required=true`로 알려
       클라가 사유 입력칸을 띄우고 다시 보내게 한다 — 사유 필요 판정을 클라가 스스로 하지 않는다.
    """
    async with acquire_as(str(staff.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select status from appointments where id = $1", appointment_id
        )
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        from_status = row["status"]
        needs_reason = appointment_service.reason_required(from_status, staff.role)
        if needs_reason and not body.reason:
            # 아직 실행하지 않는다 — 사유를 받아 다시 부르게 한다.
            return {
                "executed": False,
                "reason_required": True,
                "from_status": from_status,
            }
        new_status = await appointment_service.undo_status(
            appointment_id, staff, reason=body.reason, to_status=body.to_status, conn=conn
        )
    return {"executed": True, "reason_required": needs_reason, "status": new_status}


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
