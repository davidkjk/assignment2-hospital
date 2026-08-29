from datetime import date
from uuid import UUID
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as
from app.services.settings_service import get_public_hospital_info  # 직원웹 T29 소유


async def list_departments(patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch("select id, name from departments where is_active order by name")
    return [dict(r) for r in rows]


async def list_doctors(department_id: UUID, patient: PatientContext) -> list[dict]:
    # ⚠️ 핀(갭 #7, 경계 갭 대조표): 지금은 id·name만. 「예약 3단계 의사 소개」 화면(환자앱 T19)을 쓸 때
    #    전공·소개·사진을 함께 반환하도록 확장한다 — 칸은 직원웹 T19 STAFF-PROFILE 마이그레이션이 staff에 얹는다
    #    (그 스키마 확정 뒤 select에 추가). 사진은 버킷 경로/서명 URL.
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select id, name from staff where role='doctor' and department_id=$1 and is_active order by name",
            department_id)
    return [dict(r) for r in rows]


async def list_available_dates(doctor_id: UUID, patient: PatientContext) -> list[str]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select distinct slot_date from appointment_slots "
            "where doctor_id=$1 and status='빈시간' and slot_date between current_date and current_date+56 "
            "order by slot_date", doctor_id)  # 8주 이내
    return [str(r["slot_date"]) for r in rows]


async def list_available_slots(doctor_id: UUID, target_date: date, patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch("select id, start_time from list_bookable_slots($1, $2)", doctor_id, target_date)
    return [{"id": r["id"], "start_time": r["start_time"]} for r in rows]


async def get_hospital_info(patient: PatientContext) -> dict:
    return await get_public_hospital_info()  # HSETX-SEC-01 — 주소·전화만
