from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_notification_prefs_service as prefs

router = APIRouter(prefix="/me", tags=["patient-settings"])


class TogglePatch(BaseModel):
    group: str
    enabled: bool


@router.get("/notification-preferences")
async def get_prefs(patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await prefs.get_prefs(patient)


@router.patch("/notification-preferences")
async def patch_pref(body: TogglePatch,
                     patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await prefs.set_pref(patient, body.group, body.enabled)   # [SET-NOTI-12] 즉시 저장
