from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.patient_security import get_current_patient, PatientContext
from app.db.pool import get_pool
from app.services import consent_service

# ⚠️ prefix는 '/patient'(단수) — 직원 patients.router가 '/patients'(복수)를 점유한다(Task10 라우팅 충돌
#    교정과 동일). 최초 동의는 POST /patient(register_profile)에 포함되고, 여기는 가입 뒤 광고 토글만.
router = APIRouter(prefix="/patient/me", tags=["consent"])


class AdsConsentIn(BaseModel):
    agreed: bool


@router.patch("/ads-consent")
async def patch_ads_consent(body: AdsConsentIn, patient: PatientContext = Depends(get_current_patient)):
    async with (await get_pool()).acquire() as conn:  # 서비스 역할 — 정책 없음(get_pool은 async)
        await consent_service.set_ads_consent(
            conn, patient.id, agreed=body.agreed, terms_version=consent_service.TERMS_VERSION)
    return {"ads_consent": body.agreed}
