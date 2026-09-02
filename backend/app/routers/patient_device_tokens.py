from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import device_token_service

router = APIRouter(prefix="/device-tokens", tags=["patient-device-tokens"])


class DeviceTokenRequest(BaseModel):
    fcm_token: str


@router.post("")
async def register_device_token(body: DeviceTokenRequest,
                                patient: PatientContext = Depends(get_current_patient)) -> dict:
    await device_token_service.register_token(patient, body.fcm_token)
    return {"status": "registered"}


@router.delete("")
async def unregister_device_token(body: DeviceTokenRequest,
                                  patient: PatientContext = Depends(get_current_patient)) -> dict:
    await device_token_service.unregister_token(patient, body.fcm_token)
    return {"status": "unregistered"}
