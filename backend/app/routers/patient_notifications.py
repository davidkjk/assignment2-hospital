from fastapi import APIRouter, Depends

from app.core.patient_security import get_current_patient, PatientContext
from app.services import patient_notification_service as svc

# /my/notifications — 알림함 목록·안 읽은 개수·읽음 처리(NOTI-*). try/except 없음(AppError는 전역 핸들러).
# prefix는 patient_appointments의 '/my'와 하위경로가 겹치지 않는다(/my/appointments vs /my/notifications).
router = APIRouter(prefix="/my/notifications", tags=["notifications"])


@router.get("")
async def list_my_notifications(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await svc.list_notifications(patient)


@router.get("/unread-count")
async def my_unread_count(patient: PatientContext = Depends(get_current_patient)) -> dict:
    return {"unread": await svc.count_unread(patient)}


@router.post("/read")
async def mark_my_notifications_read(patient: PatientContext = Depends(get_current_patient)) -> dict:
    # NOTI-READ-04: 알림함에 들어오는 순간 전부 읽음(seen_at = now()).
    await svc.mark_all_read(patient)
    return {"ok": True}
