from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt

from app.core.config import settings
from app.db.pool import acquire_as


@dataclass
class StaffContext:
    id: UUID
    auth_user_id: UUID
    role: str
    department_id: UUID | None


async def get_current_staff(request: Request) -> StaffContext:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    token = auth_header.removeprefix("Bearer ")
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="로그인 정보가 올바르지 않습니다.")

    auth_user_id = payload["sub"]
    async with acquire_as(auth_user_id) as conn:
        row = await conn.fetchrow(
            "select id, auth_user_id, role, department_id, is_active from staff where auth_user_id = $1",
            UUID(auth_user_id),
        )

    if row is None or not row["is_active"]:
        # 계정 열거 방지: 미등록·비활성·staff 행 없음을 구분하지 않고 동일한
        # 401/일반 문구로 정규화한다. 상태를 드러내면 로그인 화면이 「이 이메일이
        # 이 병원 직원인지」를 확인하는 도구가 된다(STAFF-LOGIN-07·STAFF-LOGIN-11).
        raise HTTPException(status_code=401, detail="로그인 정보를 확인해 주세요.")

    return StaffContext(
        id=row["id"],
        auth_user_id=row["auth_user_id"],
        role=row["role"],
        department_id=row["department_id"],
    )


def require_role(*roles: str):
    async def dependency(staff: StaffContext = Depends(get_current_staff)) -> StaffContext:
        if staff.role not in roles:
            raise HTTPException(status_code=403, detail="이 기능에 대한 권한이 없습니다.")
        return staff

    return dependency
