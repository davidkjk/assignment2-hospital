from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.patient_security import get_current_auth_user_id
from app.db.pool import get_pool
from app.db.admin_client import get_admin_client  # service_role 클라이언트(1단계 재사용)
from app.services import password_reset_service

# ⚠️ prefix는 '/patient'(단수) — 직원 patients.router가 '/patients'(복수)를 점유(Task10 교정과 동일).
router = APIRouter(prefix="/patient/me", tags=["password-reset"])


class ResetIn(BaseModel):
    name: str
    password: str


@router.post("/password-reset")
async def reset_password(body: ResetIn, auth_user_id=Depends(get_current_auth_user_id)):
    # OTP 통과로 로그인된 세션에서만 도달한다(AUTH-PWFIND-05). 프로필 유무와 무관하게 통과시키는
    # get_current_auth_user_id를 쓴다 — 재설정은 프로필이 있는 계정 대상이지만, 판정은 서비스가 한다.
    async with (await get_pool()).acquire() as conn:  # get_pool은 async
        await password_reset_service.verify_name_and_reset(
            conn, get_admin_client(), auth_user_id,
            name_input=body.name, new_password=body.password)
    return {"ok": True}
