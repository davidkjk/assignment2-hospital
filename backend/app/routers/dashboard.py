"""[TODAY-*][QUEUE-*][DOCTOR-*][PTDET-*][ROLE-*] 조회 전용 라우터 — 대시보드·대기·환자 이력.

⚠️ 코디 배선 필요: main.py에 `app.include_router(dashboard.router)` 등록해야 노출된다.
   이 태스크는 main.py를 손대지 않는다(공용 파일).

역할 경계는 화면이 아니라 여기서도 막는다 — 화면만 막으면 API가 우회로가 된다.
"""
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import dashboard_service, patient_history_service

router = APIRouter(tags=["dashboard"])

_STAFF = ("receptionist", "admin")
_STAFF_OR_DOCTOR = ("receptionist", "admin", "doctor")


class NoteIn(BaseModel):
    content: str


# ── 대시보드 · 대기 목록 ──────────────────────────────────────────────────

@router.get("/today/summary")
async def today_summary(staff: StaffContext = Depends(require_role(*_STAFF))) -> dict:
    return await dashboard_service.get_today_summary(staff)


@router.get("/queue")
async def queue(
    tab: str = "진료대기",
    doctor_id: UUID | None = None,
    staff: StaffContext = Depends(require_role(*_STAFF)),
) -> dict:
    result = await dashboard_service.get_queue(staff, doctor_id=doctor_id, tab=tab)
    return {"rows": result.rows, "tab_counts": result.tab_counts}


# ── 의사 콘솔 ─────────────────────────────────────────────────────────────

@router.get("/doctors/{doctor_id}/queue")
async def doctor_queue(
    doctor_id: UUID,
    date_: date | None = Query(default=None, alias="date"),
    staff: StaffContext = Depends(require_role("doctor", "admin")),
) -> dict:
    result = await dashboard_service.get_doctor_queue(staff, target_date=date_)
    return {"rows": result.rows, "mode": result.mode}


@router.get("/doctors/{doctor_id}/next-available")
async def doctor_next_available(
    doctor_id: UUID,
    staff: StaffContext = Depends(require_role("doctor", "admin")),
) -> dict:
    return {"next_available": await dashboard_service.get_next_available(staff)}


# ── 환자 하위 이력 ────────────────────────────────────────────────────────

@router.get("/patients/{patient_id}/visits")
async def patient_visits(
    patient_id: UUID,
    cursor: str | None = None,
    staff: StaffContext = Depends(require_role(*_STAFF_OR_DOCTOR)),
) -> dict:
    page = await patient_history_service.get_visits(patient_id, staff, cursor=cursor)
    return {"rows": page.rows, "next_cursor": page.next_cursor, "has_more": page.has_more}


@router.get("/patients/{patient_id}/medical-records")
async def patient_medical_records(
    patient_id: UUID,
    cursor: str | None = None,
    staff: StaffContext = Depends(require_role(*_STAFF_OR_DOCTOR)),
) -> dict:
    page = await patient_history_service.get_medical_records(patient_id, staff, cursor=cursor)
    return {"rows": page.rows, "next_cursor": page.next_cursor, "has_more": page.has_more}


@router.get("/patients/{patient_id}/family")
async def patient_family(
    patient_id: UUID,
    staff: StaffContext = Depends(require_role(*_STAFF)),
) -> list[dict]:
    return await patient_history_service.get_family(patient_id, staff)


@router.post("/patients/{patient_id}/family/{member_id}/verify-eligibility")
async def verify_family_eligibility(
    patient_id: UUID,
    member_id: UUID,
    staff: StaffContext = Depends(require_role(*_STAFF)),
) -> dict:
    result = await patient_history_service.verify_family_eligibility(patient_id, member_id, staff)
    return {"allowed": result.allowed, "message": result.message}


# ── 내부 메모 (PTDET-NOTE-01·04) — POST·GET 둘뿐 ─────────────────────────

@router.get("/patients/{patient_id}/notes")
async def list_notes(
    patient_id: UUID,
    staff: StaffContext = Depends(require_role(*_STAFF_OR_DOCTOR)),
) -> list[dict]:
    return await patient_history_service.get_notes(patient_id, staff)


@router.post("/patients/{patient_id}/notes")
async def create_note(
    patient_id: UUID,
    body: NoteIn,
    staff: StaffContext = Depends(require_role(*_STAFF_OR_DOCTOR)),
) -> dict:
    note_id = await patient_history_service.add_note(patient_id, body.content, staff)
    return {"id": note_id}


# ── 사전 문진 ─────────────────────────────────────────────────────────────

@router.get("/appointments/{appointment_id}/questionnaire")
async def appointment_questionnaire(
    appointment_id: UUID,
    staff: StaffContext = Depends(require_role("doctor", "admin")),
) -> dict:
    result = await patient_history_service.get_questionnaire(appointment_id, staff)
    return {"questionnaire": result}
