from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel

from app.core.security import StaffContext, get_current_staff
from app.services import doctor_phrases, staff_service

router = APIRouter(tags=["me"])


class MeResponse(BaseModel):
    id: UUID
    name: str
    role: str
    department_id: UUID | None
    # [DOCTOR-CONTEXT-01] 진료과 이름 — 사이드바 부제와 의사 콘솔 기본정보 맥락 줄(「10:30 · 정형외과」)이 쓴다.
    #   프론트 mapStaff가 department_name을 읽는데 그동안 백엔드가 안 내려 늘 null이었다(잠복 갭).
    department_name: str | None = None


@router.get("/me", response_model=MeResponse)
async def read_me(staff: StaffContext = Depends(get_current_staff)) -> MeResponse:
    me = await doctor_phrases.get_me(staff.auth_user_id)
    return MeResponse(**me)


@router.post("/me/activate", status_code=status.HTTP_204_NO_CONTENT)
async def activate_me(staff: StaffContext = Depends(get_current_staff)) -> Response:
    """[STAFF-ACTIVATED-01] 초대 수락자가 최초 비밀번호 설정을 마친 직후 호출한다. 자기 계정의
    activated_at을 한 번만 채워 「미수락→수락」으로 넘긴다(멱등 — 이미 수락자는 무동작)."""
    await staff_service.activate_self(staff)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

