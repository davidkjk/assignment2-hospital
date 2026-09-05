"""직원 대행 전화번호 변경 — 새 번호 OTP 소유 증명 창구(배포 Task 7D · 갭 #19 · 결정 #4).

직접 저장(㉮)은 계정 탈취·기록 오염으로 기각됐다. 직원이 새 번호를 입력하면 **그 새 번호로**
6자리 코드를 보내고(㉯), 코드가 확인돼야만 patients.phone과 Auth 전화번호를 함께 바꾼다.
번호가 바뀌어 앱에 못 들어가던 환자(갭 #19)를 여는 문이 이 창구다.

⚠️ family_link_otp_service와 같은 결의 방어:
  · 코드가 틀리면 attempts를 올리되 **트랜잭션 커밋 뒤에 raise**한다 — 트랜잭션 안에서 바로 raise하면
    asyncpg가 롤백해 카운트가 0으로 되돌아간다(무한 시도 허용 버그).
  · Auth 동기화(ⓑ)는 **트랜잭션 안에서** 부른다 — 실패하면 patients.phone·verified_at까지 함께
    롤백돼 부분 성공(번호는 바뀌었는데 Auth는 아닌 상태)이 생기지 않는다(결정 #4).
"""
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.core.errors import AppError
from app.core.masking import mask_phone
from app.core.security import StaffContext
from app.db.admin_client import get_admin_client
from app.db.pool import get_pool
from app.integrations.notify_clients import get_sms_client

OTP_TTL_MINUTES = 5           # 화면이 세는 5:00과 같은 값
RESEND_INTERVAL_SECONDS = 30  # 갭 #16 — 재발송 쿨다운(가족연결 OTP와 같은 값)
MAX_CODE_ATTEMPTS = 5         # 6자리를 무한히 넣어보지 못하게
MIN_PHONE_DIGITS = 10         # 010 + 최소 7자리


def _digits(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _default_auth_sync(auth_user_id: UUID, new_phone_digits: str) -> None:
    """Supabase Auth(gotrue)의 전화번호를 새 번호로 바꾼다. 계정 있는 환자에만 부른다."""
    get_admin_client().auth.admin.update_user_by_id(
        str(auth_user_id), {"phone": new_phone_digits})


async def request_phone_change(
    staff: StaffContext,
    patient_id: UUID,
    new_phone: str,
    *,
    sms_client=None,
) -> UUID:
    """새 번호로 인증번호를 보내고 요청 행(감사)을 남긴다. 요청 id를 돌려준다."""
    sms_client = sms_client or get_sms_client()
    new_digits = _digits(new_phone)
    if len(new_digits) < MIN_PHONE_DIGITS:
        raise AppError("전화번호를 확인해 주세요.", status_code=400)
    new_hash = _hash(new_digits)
    pool = await get_pool()

    async with pool.acquire() as conn:
        # ① 대상 환자 존재 확인 — 없는 환자에는 문자도 보내지 않는다.
        exists = await conn.fetchval("select 1 from patients where id=$1", patient_id)
        if not exists:
            raise AppError("환자를 찾을 수 없습니다.", status_code=404)

        # ② 재발송 쿨다운(갭 #16) — 그 환자의 그 새 번호 기준.
        last = await conn.fetchval(
            "select max(created_at) from patient_phone_change_requests "
            "where patient_id=$1 and new_phone_hash=$2",
            patient_id, new_hash)
        if last is not None:
            waited = (datetime.now(timezone.utc) - last).total_seconds()
            if waited < RESEND_INTERVAL_SECONDS:
                raise AppError(
                    "인증번호는 30초 뒤에 다시 받으실 수 있습니다.",
                    status_code=429,
                    retry_after_seconds=int(RESEND_INTERVAL_SECONDS - waited) + 1)

        # ③ 코드 생성·저장. 원문 번호는 안 쌓고 해시·마스킹만 남긴다.
        code = f"{secrets.randbelow(1_000_000):06d}"
        request_id = await conn.fetchval(
            "insert into patient_phone_change_requests "
            "  (patient_id, staff_id, new_phone_hash, new_phone_masked, code_hash, expires_at) "
            "values ($1,$2,$3,$4,$5,$6) returning id",
            patient_id, staff.id, new_hash, mask_phone(new_digits), _hash(code),
            datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES))

    # ④ 새 번호로 문자를 보낸다(㉯ 소유 증명). 본문은 한글.
    sms_client.send_sms(
        new_digits,
        f"[병원] 전화번호 변경 인증번호는 {code}입니다. {OTP_TTL_MINUTES}분 안에 입력해 주세요.")
    return request_id


async def confirm_phone_change(
    staff: StaffContext,
    patient_id: UUID,
    new_phone: str,
    code: str,
    *,
    auth_sync=None,
) -> None:
    """인증번호가 맞으면 patients.phone + Auth 번호를 바꾸고 감사 한 줄을 남긴다."""
    auth_sync = auth_sync or _default_auth_sync
    new_digits = _digits(new_phone)
    new_hash = _hash(new_digits)
    pool = await get_pool()

    async with pool.acquire() as conn:
        wrong_code = False
        async with conn.transaction():
            req = await conn.fetchrow(
                "select * from patient_phone_change_requests "
                "where patient_id=$1 and new_phone_hash=$2 and verified_at is null "
                "order by created_at desc limit 1 for update",
                patient_id, new_hash)
            # 아래 셋은 상태를 바꾸지 않으므로 트랜잭션 안에서 raise해도 롤백할 것이 없다.
            if req is None:
                raise AppError("요청을 찾을 수 없습니다. 인증번호를 다시 받아 주세요.", status_code=404)
            if req["expires_at"] < datetime.now(timezone.utc):
                raise AppError("인증번호가 만료되었습니다. 다시 받아 주세요.", status_code=400)
            if req["attempts"] >= MAX_CODE_ATTEMPTS:
                raise AppError(
                    "인증번호를 여러 번 잘못 입력하셨습니다. 다시 받아 주세요.", status_code=400)

            wrong_code = not hmac.compare_digest(req["code_hash"], _hash(code))
            if wrong_code:
                # 카운트를 올리고 **커밋되게** 트랜잭션 밖에서 raise한다(위 주석).
                await conn.execute(
                    "update patient_phone_change_requests set attempts = attempts + 1 where id=$1",
                    req["id"])
            else:
                # 바뀌기 직전 번호(감사)·계정 유무를 함께 잡는다.
                cur = await conn.fetchrow(
                    "select phone, auth_user_id from patients where id=$1 for update", patient_id)
                if cur is None:
                    raise AppError("환자를 찾을 수 없습니다.", status_code=404)

                await conn.execute(
                    "update patients set phone=$2, updated_at=now() where id=$1",
                    patient_id, new_digits)
                await conn.execute(
                    "update patient_phone_change_requests "
                    "set verified_at=now(), old_phone_masked=$2 where id=$1",
                    req["id"], mask_phone(cur["phone"]))

                # ⓑ Auth 동기화 — 계정이 있는 환자만. 트랜잭션 안에서 부른다:
                #    실패하면 asyncpg가 롤백해 patients.phone·verified_at이 되돌아간다(부분 성공 방지).
                if cur["auth_user_id"] is not None:
                    try:
                        auth_sync(cur["auth_user_id"], new_digits)
                    except Exception as exc:
                        raise AppError(
                            "전화번호를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.",
                            status_code=503) from exc

        if wrong_code:
            raise AppError("인증번호가 올바르지 않습니다.", status_code=400)
