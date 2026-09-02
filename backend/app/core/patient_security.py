from dataclasses import dataclass
from uuid import UUID
from fastapi import HTTPException, Request
from jose import JWTError, jwt
from app.core.security import _resolve_verification_key  # HS256(레거시)·ES256(현행 JWKS) 공통 키 해석
from app.db.pool import acquire_as


async def _decode_sub(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    token = header.removeprefix("Bearer ")
    try:
        # 직원웹과 동일하게 alg로 키를 가른다 — 현행 Supabase는 ES256(비대칭)으로 서명한다.
        key, alg = await _resolve_verification_key(token)
        payload = jwt.decode(token, key, algorithms=[alg], audience="authenticated")
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="로그인 정보가 올바르지 않습니다.")
    return payload["sub"]


async def get_current_auth_user_id(request: Request) -> UUID:
    return UUID(await _decode_sub(request))


@dataclass
class PatientContext:
    id: UUID
    auth_user_id: UUID


async def get_current_patient(request: Request) -> PatientContext:
    auth_user_id = await _decode_sub(request)
    async with acquire_as(auth_user_id) as conn:
        row = await conn.fetchrow("select id, is_active from patients where auth_user_id = $1", UUID(auth_user_id))
    if row is None or not row["is_active"]:
        # 등록 안 됨/사용중지를 구분하지 않는다(개인정보 열거 방지).
        raise HTTPException(status_code=403, detail="등록되지 않았거나 사용 중지된 계정입니다.")
    return PatientContext(id=row["id"], auth_user_id=UUID(auth_user_id))


async def list_accessible_patient_ids(patient: PatientContext) -> list[UUID]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select family_patient_id from patient_family_links "
            "where account_patient_id = $1 and is_active", patient.id)  # [R5-02] 활성 링크만
    return [patient.id] + [r["family_patient_id"] for r in rows]
