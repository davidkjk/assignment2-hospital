from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_booking_service

router = APIRouter(prefix="/bookings", tags=["patient-bookings"])


class CreateBookingRequest(BaseModel):
    for_patient_id: UUID
    department_id: UUID
    doctor_id: UUID
    slot_id: UUID
    reason: str
    request_id: UUID                     # 클라이언트가 만든 멱등 키(00020)


class ChangeBookingRequest(BaseModel):
    new_slot_id: UUID
    reason: str
    expected_updated_at: datetime        # 낙관적 잠금(APPT-RACE-01)


class CancelRequest(BaseModel):
    expected_updated_at: datetime


class SupportRequest(BaseModel):
    request_type: str                    # '취소' | '변경'


@router.post("")
async def create_booking(body: CreateBookingRequest,
                         patient: PatientContext = Depends(get_current_patient)) -> dict:
    # source는 본문에서 안 받는다 — 앱 라우터는 항상 'app'(기본값). 클라이언트가 조작 못 함.
    appointment_id = await patient_booking_service.create_booking(
        patient, body.for_patient_id, body.department_id, body.doctor_id,
        body.slot_id, body.reason, body.request_id)
    return {"appointment_id": appointment_id}


@router.patch("/{appointment_id}")
async def change_booking(appointment_id: UUID, body: ChangeBookingRequest,
                         patient: PatientContext = Depends(get_current_patient)) -> dict:
    new_id = await patient_booking_service.change_booking(
        patient, appointment_id, body.new_slot_id, body.reason, body.expected_updated_at)
    return {"appointment_id": new_id}


@router.post("/{appointment_id}/cancel")
async def cancel_booking(appointment_id: UUID, body: CancelRequest,
                         patient: PatientContext = Depends(get_current_patient)) -> dict:
    # 마감 후는 오류가 아니라 {cancelled:false, after_deadline:true} — 화면이 CANCEL-LATE 팝업.
    return await patient_booking_service.cancel_appointment(patient, appointment_id, body.expected_updated_at)


@router.post("/{appointment_id}/support")
async def request_support(appointment_id: UUID, body: SupportRequest,
                          patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_booking_service.request_support(patient, appointment_id, body.request_type)


@router.post("/{appointment_id}/acknowledge-change", status_code=204)
async def acknowledge_change(appointment_id: UUID,
                            patient: PatientContext = Depends(get_current_patient)) -> None:
    # CARD-CHG-04: 병원발 변경/취소 안내문 [확인] — 두 칸을 비운다(껐다 켜도 다시 안 뜸).
    await patient_booking_service.acknowledge_hospital_change(patient, appointment_id)


@router.post("/{appointment_id}/acknowledge-rejection", status_code=204)
async def acknowledge_rejection(appointment_id: UUID,
                               patient: PatientContext = Depends(get_current_patient)) -> None:
    # CANCEL-REJ-04: 취소 반려 배너 [확인] — cancel_rejected_at/_reason를 비운다(껐다 켜도 다시 안 뜸).
    await patient_booking_service.acknowledge_cancel_rejection(patient, appointment_id)
