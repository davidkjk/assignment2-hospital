from collections import defaultdict
from datetime import date
from uuid import UUID
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as, get_pool
from app.services.doctor_schedule_summary import summarize_schedule
from app.services.settings_service import get_public_hospital_info  # 직원웹 T29 소유


async def list_departments(patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch("select id, name from departments where is_active order by name")
    return [dict(r) for r in rows]


async def list_doctors(department_id: UUID, patient: PatientContext) -> list[dict]:
    # 갭 #7: staff의 전공·사진을 함께 반환(직원웹 00042가 얹은 칸). bio는 화면 비노출(BOOK-DOC-06)이라 뺀다.
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select id, name, specialty, photo_url from staff "
            "where role='doctor' and department_id=$1 and is_active order by name",
            department_id)
    doctors = [dict(r) for r in rows]
    if not doctors:
        return []
    # 갭 #9: 진료요일 요약. doctor_schedule_rules는 staff 전용 RLS라 서비스역할 경로(raw 풀)로 읽는다
    #        (진료요일은 민감정보 아님 — get_pool()=RLS 우회). asyncpg가 weekday:int·start/end:time을 그대로 준다.
    ids = [d["id"] for d in doctors]
    async with (await get_pool()).acquire() as admin:
        srows = await admin.fetch(
            "select doctor_id, weekday, start_time, end_time from doctor_schedule_rules "
            "where doctor_id = any($1::uuid[])", ids)
    by_doctor: dict[UUID, list[dict]] = defaultdict(list)
    for r in srows:
        by_doctor[r["doctor_id"]].append(
            {"weekday": r["weekday"], "start_time": r["start_time"], "end_time": r["end_time"]})
    for d in doctors:
        d["schedule_summary"] = summarize_schedule(by_doctor.get(d["id"], []))
    return doctors  # {id, name, specialty, photo_url, schedule_summary}


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
