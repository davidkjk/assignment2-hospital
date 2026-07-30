from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import medical_record_service

router = APIRouter(prefix="/medical-records", tags=["medical-records"])


class SaveDraftRequest(BaseModel):
    appointment_id: UUID
    symptoms: str | None = None
    diagnosis: str | None = None
    treatment: str | None = None
    patient_visible_notes: str | None = None


class SaveDraftResponse(BaseModel):
    record_id: UUID


@router.post("/draft", response_model=SaveDraftResponse)
async def save_draft(
    body: SaveDraftRequest,
    staff: StaffContext = Depends(require_role("doctor")),
) -> SaveDraftResponse:
    record_id = await medical_record_service.create_draft_record(
        appointment_id=body.appointment_id,
        symptoms=body.symptoms,
        diagnosis=body.diagnosis,
        treatment=body.treatment,
        patient_visible_notes=body.patient_visible_notes,
        staff=staff,
    )
    return SaveDraftResponse(record_id=record_id)


class CompleteRecordRequest(BaseModel):
    expected_updated_at: datetime


@router.patch("/{record_id}/complete")
async def complete_record(
    record_id: UUID,
    body: CompleteRecordRequest,
    staff: StaffContext = Depends(require_role("doctor")),
) -> dict:
    await medical_record_service.complete_record(
        record_id=record_id, expected_updated_at=body.expected_updated_at, staff=staff,
    )
    return {"status": "completed"}


class ReviseRecordRequest(BaseModel):
    symptoms: str | None = None
    diagnosis: str | None = None
    treatment: str | None = None
    patient_visible_notes: str | None = None
    reason: str
    expected_updated_at: datetime


@router.patch("/{record_id}/revise")
async def revise_record(
    record_id: UUID,
    body: ReviseRecordRequest,
    staff: StaffContext = Depends(require_role("doctor")),
) -> dict:
    await medical_record_service.revise_completed_record(
        record_id=record_id,
        symptoms=body.symptoms,
        diagnosis=body.diagnosis,
        treatment=body.treatment,
        patient_visible_notes=body.patient_visible_notes,
        reason=body.reason,
        expected_updated_at=body.expected_updated_at,
        staff=staff,
    )
    return {"status": "revised"}


@router.get("/by-appointment/{appointment_id}")
async def get_record(
    appointment_id: UUID,
    staff: StaffContext = Depends(require_role("doctor", "receptionist", "admin")),
) -> dict | None:
    """[정합성 검토 R5-08] 진료기록 원문 조회 — RLS(doctor_can_view_appointment 기반)가 최종
    접근 범위를 강제하므로, 담당 아닌 의사가 호출하면 여기 도달하기 전에 이미 None이 반환된다."""
    return await medical_record_service.get_record(appointment_id, staff)


@router.get("/{record_id}/revisions")
async def list_revisions(
    record_id: UUID,
    staff: StaffContext = Depends(require_role("doctor", "receptionist", "admin")),
) -> list[dict]:
    return await medical_record_service.list_revisions(record_id, staff)
