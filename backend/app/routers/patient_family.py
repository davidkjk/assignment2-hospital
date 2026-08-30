from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_family_service

router = APIRouter(prefix="/family", tags=["patient-family"])


class AddFamilyRequest(BaseModel):
    name: str
    birth_date: date
    gender: str
    relation: str
    phone: str | None = None


class UpdateFamilyRequest(BaseModel):
    name: str
    birth_date: date
    gender: str
    relation: str


@router.get("")
async def list_family(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_family_service.list_family_members(patient)


@router.post("")
async def add_family(body: AddFamilyRequest,
                     patient: PatientContext = Depends(get_current_patient)) -> dict:
    fid = await patient_family_service.add_family_member(
        patient, body.name, body.birth_date, body.gender, body.relation, body.phone)
    return {"family_patient_id": fid}


@router.patch("/{family_patient_id}")
async def update_family(family_patient_id: UUID, body: UpdateFamilyRequest,
                        patient: PatientContext = Depends(get_current_patient)) -> dict:
    await patient_family_service.update_family_member(
        patient, family_patient_id, body.name, body.birth_date, body.gender, body.relation)
    return {"status": "updated"}


@router.delete("/{family_patient_id}")
async def unlink_family(family_patient_id: UUID,
                        patient: PatientContext = Depends(get_current_patient)) -> dict:
    await patient_family_service.unlink_family_member(patient, family_patient_id)
    return {"status": "unlinked"}
