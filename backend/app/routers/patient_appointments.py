from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import (patient_appointment_query_service as query_service,
                          patient_history_service, patient_questionnaire_service)

router = APIRouter(prefix="/my", tags=["patient-my"])


class SaveQuestionnaireRequest(BaseModel):
    answers: list[dict]
    complete: bool = False


@router.get("/appointments")
async def my_appointments(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await query_service.list_my_appointments(patient)


@router.get("/appointments/{appointment_id}")
async def appointment_detail(appointment_id: UUID,
                             patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await query_service.get_appointment_detail(patient, appointment_id)


@router.get("/appointments/{appointment_id}/queue")
async def queue_status(appointment_id: UUID,
                       patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await query_service.get_queue_status(patient, appointment_id)


@router.get("/appointments/{appointment_id}/questionnaire/template")
async def questionnaire_template(appointment_id: UUID,
                                 patient: PatientContext = Depends(get_current_patient)) -> dict | None:
    return await patient_questionnaire_service.get_template(patient, appointment_id)


@router.get("/appointments/{appointment_id}/questionnaire")
async def get_questionnaire(appointment_id: UUID,
                            patient: PatientContext = Depends(get_current_patient)) -> dict | None:
    return await patient_questionnaire_service.get_response(patient, appointment_id)


@router.put("/appointments/{appointment_id}/questionnaire")
async def save_questionnaire(appointment_id: UUID, body: SaveQuestionnaireRequest,
                             patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_questionnaire_service.save_response(
        patient, appointment_id, body.answers, body.complete)


@router.get("/history")
async def visit_history(for_patient_id: UUID, cursor: str | None = None, limit: int = 20,
                        patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_history_service.list_visit_history(patient, for_patient_id, cursor, limit)
