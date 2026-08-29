from dataclasses import asdict
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.errors import AppError
from app.core.security import StaffContext, require_role
from app.db.pool import acquire_as
from app.services import appointment_service, dashboard_service

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


class BookingLookupOut(BaseModel):
    appointment_id: UUID
    patient_name: str
    slot_at: datetime
    department_name: str
    doctor_name: str
    status: str
    updated_at: datetime   # [CHKIN-RESULT-03] 도착 처리의 낙관적 잠금 열쇠


class FindByCodeResponse(BaseModel):
    appointment: BookingLookupOut | None = None   # [CHKIN-RESULT-02] 사유를 나누는 칸이 없다


@router.get("/find-by-code", response_model=FindByCodeResponse)
async def find_by_code(
    code: str,
    # [CHKIN-HEAD-03] 의사·비활성 직원은 서버에서 막는다. 사이드바에 안 보이는 것만으로는 안 된다.
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> FindByCodeResponse:
    found = await appointment_service.find_by_booking_code(code, staff)
    return FindByCodeResponse(
        appointment=BookingLookupOut(**asdict(found)) if found else None
    )


class CreatePhoneAppointmentRequest(BaseModel):
    # [Task 14 / CAL-BOOK-*] 캘린더 전화 예약 — 5분 자유 시각. department_id는 담당의
    # 소속에서 서버가 도출하고, end_at은 진료시간으로 계산한다(CAL-TIME-09).
    patient_id: UUID
    doctor_id: UUID
    start_at: datetime
    reason: str
    # [CAL-GAP-06] 직원이 겹침 경고를 읽고 [그대로 잡기]를 눌렀다는 사실. 기본은 막는다.
    allow_overlap: bool = False


@router.post("/phone", response_model=CreateAppointmentResponse)
async def create_phone_appointment(
    body: CreatePhoneAppointmentRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> CreateAppointmentResponse:
    appointment_id = await appointment_service.create_phone_appointment(
        staff=staff,
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
        start_at=body.start_at,
        reason=body.reason,
        allow_overlap=body.allow_overlap,
    )
    return CreateAppointmentResponse(appointment_id=appointment_id)


class CreateWalkinAppointmentRequest(BaseModel):
    """[QUEUE-WALK-08e] ⛔ department_id가 없다 — 서버가 담당의에서 도출한다.

    visit_time은 「지난 시각」을 직접 적었을 때만 온다(`QUEUE-WALK-14b`).
    비어 있으면 「지금」이고, 그 시각은 서버가 찍는다(화면 시계를 믿지 않는다).
    """
    patient_id: UUID
    doctor_id: UUID
    reason: str
    visit_time: datetime | None = None


@router.post("/walkin", response_model=CreateAppointmentResponse)
async def create_walkin_appointment(
    body: CreateWalkinAppointmentRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> CreateAppointmentResponse:
    appointment_id = await appointment_service.create_walkin_appointment(
        staff=staff,
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
        reason=body.reason,
        visit_time=body.visit_time,
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


# ⚠️ 정적 경로(/find-by-code)보다 뒤에 둔다 — 동적 {appointment_id}가 그걸 삼키지 않게(등록 순서).
@router.get("/{appointment_id}")
async def appointment_detail(
    appointment_id: UUID,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    # [CAL-PANEL-*] 예약 상세 — 캘린더 격자에 없어도(다른 날짜) 딥링크 패널이 읽는다.
    return await dashboard_service.get_appointment_detail(appointment_id, staff)
