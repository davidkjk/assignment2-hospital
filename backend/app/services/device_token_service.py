"""[Task 9] 환자 기기 알림 토큰 등록/해제.

⭐ 표 골격은 직원웹 T30(00050)이 세웠고 컬럼명은 `token`이다(fcm_token 아님) —
   dispatch_service._try_push가 이 칸을 읽는다. 환자 본인 커넥션(acquire_as)으로만 쓴다:
   본인 관리 RLS 정책(00023)이 '자기 것만'으로 막고, 가족은 로그인하지 않아 토큰이 없다.
"""
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as


async def register_token(patient: PatientContext, fcm_token: str) -> None:
    """기기 토큰을 등록한다. 같은 토큰 재등록은 on conflict do nothing으로 무해."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute(
            "insert into device_tokens (patient_id, token) values ($1, $2) on conflict do nothing",
            patient.id, fcm_token,
        )


async def unregister_token(patient: PatientContext, fcm_token: str) -> None:
    """로그아웃·앱 삭제 시 그 기기 토큰을 지운다(더는 이 기기로 푸시하지 않는다)."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute(
            "delete from device_tokens where patient_id = $1 and token = $2",
            patient.id, fcm_token,
        )
