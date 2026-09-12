from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_catalog_service
from app.services.settings_service import get_public_hospital_info

router = APIRouter(prefix="/catalog", tags=["patient-catalog"])


@router.get("/departments")
async def departments(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_catalog_service.list_departments(patient)


@router.get("/departments/{department_id}/doctors")
async def doctors(department_id: UUID, patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_catalog_service.list_doctors(department_id, patient)


@router.get("/doctors/{doctor_id}/dates")
async def dates(doctor_id: UUID, patient: PatientContext = Depends(get_current_patient)) -> list[str]:
    return await patient_catalog_service.list_available_dates(doctor_id, patient)


@router.get("/doctors/{doctor_id}/slots")
async def slots(doctor_id: UUID, target_date: date,   # 쿼리 ?target_date=YYYY-MM-DD (파라미터명이 date 타입을 가리지 않게)
                patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_catalog_service.list_available_slots(doctor_id, target_date, patient)


@router.get("/hospital")
async def hospital() -> dict:
    # 공개 창구 — 로그인 전 화면(연령게이트 병원 전화·약관동의 대표전화)도 써야 한다.
    # 주소·전화만 반환하는 SECURITY DEFINER 함수라 인증 없이도 안전(HSETX-SEC-01, 익명 연결).
    return await get_public_hospital_info()


@router.get("/hospital/hours")
async def hospital_hours(patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_catalog_service.get_hospital_hours(patient)   # [SET-HOSP-05] 진료시간·휴진
