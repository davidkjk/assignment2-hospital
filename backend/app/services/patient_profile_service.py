from datetime import date
from uuid import UUID
from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.admin_client import get_admin_client
from app.db.pool import acquire_as, get_pool
from app.services import consent_service


async def register_profile(auth_user_id: UUID, name: str, birth_date: date, gender: str,
                           *, ads_agreed: bool = False,
                           terms_version: str = consent_service.TERMS_VERSION) -> UUID:
    # [R5-05] phone은 요청 본문을 신뢰하지 않고 Supabase Auth(admin API)의 검증번호를 직접 조회한다.
    # 검증 phone+birth_date+name 일치 미연결 1건이면 연결(과거 예약·이력 승계), 0·2+건이면 신규 가입.
    # get_pool() 서비스 역할 커넥션 — 아직 auth 연결 전이라 patient_owns RLS로는 조회 불가.
    admin = get_admin_client()
    phone = admin.auth.admin.get_user_by_id(str(auth_user_id)).user.phone
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if await conn.fetchval("select id from patients where auth_user_id = $1", auth_user_id) is not None:
                raise AppError("이미 등록된 계정입니다.", status_code=409)
            candidates = await conn.fetch(
                "select id from patients where auth_user_id is null and phone=$1 and birth_date=$2 and name=$3",
                phone, birth_date, name)
            if len(candidates) == 1:
                patient_id = candidates[0]["id"]
                await conn.execute("update patients set auth_user_id=$1 where id=$2", auth_user_id, patient_id)
            else:
                patient_id = await conn.fetchval(
                    "insert into patients (auth_user_id, name, birth_date, gender, phone) "
                    "values ($1,$2,$3,$4,$5) returning id", auth_user_id, name, birth_date, gender, phone)
            # CONSENT-LOG-01 — 같은 트랜잭션 안에서 동의 4줄을 남긴다(프로필과 함께 커밋/롤백).
            await consent_service.record_consents(
                conn, patient_id, ads_agreed=ads_agreed, terms_version=terms_version)
    return patient_id


async def get_my_profile(patient: PatientContext) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow("select id, name, birth_date, gender, phone from patients where id=$1", patient.id)
    return {"id": row["id"], "name": row["name"], "birth_date": str(row["birth_date"]),
            "gender": row["gender"], "phone": row["phone"]}


async def deactivate_self(patient: PatientContext) -> None:
    # [SDB-18] 직접 UPDATE 정책이 없으므로 RPC로만 비활성화 + Supabase Auth 계정 ban.
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute("select deactivate_patient_self()")
    get_admin_client().auth.admin.update_user_by_id(str(patient.auth_user_id), {"ban_duration": "87600h"})
