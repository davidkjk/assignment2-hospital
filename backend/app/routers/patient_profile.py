from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_auth_user_id, get_current_patient
from app.services import patient_profile_service

# ⚠️ prefix는 '/patient'(단수) — 직원 patients.router가 이미 '/patients'(복수)를 점유한다
#    (POST /patients=직원 환자등록, GET /patients/{id}). 플랜의 "겹치지 않는다"(Task10 배너)는
#    직원 라우터를 놓친 것 → 환자 본인 프로필은 단수 /patient로 분리한다(라우팅 충돌 방지).
router = APIRouter(prefix="/patient", tags=["patient-profile"])


class ConsentAssertions(BaseModel):
    """[보안 F-05 벡터1] 화면에서 실제로 체크한 필수 동의 상태를 담는다. 세 항목 모두 필수 필드다
    (누락 시 422). 서버가 present+true를 강제하고 거짓/누락이면 가입을 거절한다."""
    terms: bool
    privacy: bool
    sensitive: bool


class RegisterProfileRequest(BaseModel):
    name: str
    birth_date: date
    gender: str
    consents: ConsentAssertions          # [F-05 v1] 필수 동의 단언 — 더는 「도달=동의」로 서버가 만들지 않는다
    terms_version: str                    # 화면이 보여준 약관판 — 서버 현재판과 일치해야 통과
    ads_agreed: bool = False              # 광고(선택)만 기본값


@router.post("")
async def register_profile(body: RegisterProfileRequest,
                           auth_user_id: UUID = Depends(get_current_auth_user_id)) -> dict:
    # 가입 직후 — patients 행이 아직 없으므로 get_current_patient가 아니라 auth_user_id 의존성.
    patient_id = await patient_profile_service.register_profile(
        auth_user_id, body.name, body.birth_date, body.gender,
        consents=body.consents.model_dump(), ads_agreed=body.ads_agreed,
        terms_version=body.terms_version)
    return {"patient_id": patient_id}


@router.get("/me")
async def get_my_profile(patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_profile_service.get_my_profile(patient)


@router.delete("/me")
async def deactivate_self(patient: PatientContext = Depends(get_current_patient)) -> dict:
    await patient_profile_service.deactivate_self(patient)
    return {"status": "deactivated"}
