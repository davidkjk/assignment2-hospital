from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, get_current_staff
from app.services import doctor_phrases

router = APIRouter(tags=["me"])


class MeResponse(BaseModel):
    id: UUID
    name: str
    role: str
    department_id: UUID | None


@router.get("/me", response_model=MeResponse)
async def read_me(staff: StaffContext = Depends(get_current_staff)) -> MeResponse:
    me = await doctor_phrases.get_me(staff.auth_user_id)
    return MeResponse(**me)

