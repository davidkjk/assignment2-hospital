"""일정 변경 seam 라우터.

⚠️ 이 라우터는 **계산을 하지 않는다.** 두 엔드포인트 모두 Task 2의
``schedule_change`` 서비스를 **그대로 노출**한다(`SCHED-CALC-02`, 「함수는 하나」).
라우터에서 필터를 하나라도 다시 걸면 "경고엔 3건, 목록엔 4건"이 재발한다.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.security import StaffContext, require_role
from app.db.pool import acquire_as
from app.services import schedule_change

router = APIRouter(tags=["schedule-change"])


class RescheduleRequest(BaseModel):
    new_start_at: datetime
    reason: str = Field(min_length=1)


@router.post("/appointments/{appointment_id}/reschedule")
async def reschedule(
    appointment_id: UUID,
    body: RescheduleRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    # 라우터는 재계산하지 않는다 — Task 2 서비스를 그대로 부른다(SCHED-CALC-02).
    await schedule_change.reschedule_appointment(
        appointment_id,
        new_start_at=body.new_start_at,
        staff=staff,
        reason=body.reason,
    )
    return {"status": "rescheduled"}


@router.get("/schedule/affected")
async def list_affected(
    exception_id: UUID | None = None,
    deactivating_doctor_id: UUID | None = None,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> list:
    # 라우터는 재필터하지 않는다 — Task 2의 판정 결과를 그대로 노출한다(SCHED-CALC-02).
    async with acquire_as(str(staff.auth_user_id)) as conn:
        return await schedule_change.list_affected_appointments(
            conn,
            exception_id=exception_id,
            deactivating_doctor_id=deactivating_doctor_id,
            for_role="admin" if staff.role == "admin" else "staff",
        )
