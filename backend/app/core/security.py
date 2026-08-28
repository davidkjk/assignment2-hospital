from dataclasses import dataclass
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt

from app.core.config import settings
from app.db.pool import acquire_as

# Supabase 서명 방식은 두 가지다: ①HS256(레거시 공유 시크릿 — 테스트 토큰·구 프로젝트)
# ②ES256(현행 Supabase가 발급하는 비대칭 세션 토큰, 헤더에 kid). 검증 키를 alg로 가른다.
# ES256 공개키는 Supabase JWKS에서 받아 kid로 캐시한다(무회전 만료 시 재조회).
_jwks_cache: dict[str, dict] = {}


async def _resolve_verification_key(token: str) -> tuple[object, str]:
    header = jwt.get_unverified_header(token)
    alg = header.get("alg", "HS256")
    if alg == "HS256":
        return settings.supabase_jwt_secret, "HS256"
    kid = header.get("kid")
    if kid not in _jwks_cache:
        url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
        for key in resp.json().get("keys", []):
            if key.get("kid"):
                _jwks_cache[key["kid"]] = key
    key = _jwks_cache.get(kid)
    if key is None:
        raise JWTError("unknown signing key id")
    return key, alg


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
        key, alg = await _resolve_verification_key(token)
        payload = jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience="authenticated",
        )
        subject = payload.get("sub")
        if not isinstance(subject, str):
            raise ValueError("missing JWT subject")
        auth_user_id = UUID(subject)
    except (JWTError, ValueError):
        # STAFF-LOGIN-11: 손상된 토큰도 직원 행 없음·비활성 계정과 같은
        # 사용자 문장으로 정규화해 계정 상태를 대조할 단서를 남기지 않는다.
        raise HTTPException(status_code=401, detail="로그인 정보를 확인해 주세요.")

    async with acquire_as(str(auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select id, auth_user_id, role, department_id, is_active from staff where auth_user_id = $1",
            auth_user_id,
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
