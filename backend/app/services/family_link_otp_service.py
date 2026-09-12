"""㉯ 기존 환자를 가족으로 연결 — 본인확인(OTP) 창구.

[R5-01] 클라이언트가 남의 patient id를 가족 링크에 직접 넣지 못하게 하고,
        기존 환자 연결은 **이 함수를 통해서만** 일어나게 한다.

⚠️ Supabase Auth의 signInWithOtp/verifyOTP를 쓰지 않는다. 그것은 그 번호의 **세션을 발급**해서,
   어머니 번호로 인증한 순간 딸이 어머니로 로그인된다. 여기서 필요한 것은 로그인이 아니라
   "그 번호에 닿을 수 있는가"의 확인뿐이다(FAM-LINK-05 — 네 가지 본인확인 중 유일하게 남의 번호).
"""

import hashlib
import hmac
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import get_pool
from app.integrations.notify_clients import get_sms_client
from app.services.patient_family_service import MAX_ACTIVE_FAMILY

OTP_TTL_MINUTES = 5           # FAM-LINK-04 — 화면이 세는 5:00과 같은 값
RESEND_INTERVAL_SECONDS = 30  # FAM-LINK-22 · 갭 #16 — 앱 쿨다운과 같은 값을 서버도 센다
MAX_CODE_ATTEMPTS = 5         # 6자리를 무한히 넣어보지 못하게(Step 1 주석)

_LIMIT_MESSAGE = f"가족은 최대 {MAX_ACTIVE_FAMILY}명까지 등록하실 수 있습니다."


def _digits(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def request_family_link_otp(
    patient: PatientContext,
    *,
    name: str,
    birth_date: date,
    phone: str,
    relation: str,
    sms_client=None,
) -> UUID:
    """인증번호를 보낸다. ⭐ 후보를 못 찾아도 **성공**한다(갭 #58).

    사실대로 알려주는 예외는 둘뿐이다(갭 #60 — 요청자가 이미 아는 정보라 열거가 아니다):
      · 본인          → 409 본인은 가족으로 추가할 수 없습니다
      · 이미 연결됨   → 409 이미 가족으로 연결되어 있습니다
    그 밖의 「없다·여럿이다·번호가 다르다」는 **전부 같은 성공 응답**이다.
    """
    sms_client = sms_client or get_sms_client()
    phone_digits = _digits(phone)
    phone_hash = _hash(phone_digits)
    pool = await get_pool()

    async with pool.acquire() as conn:
        # ① 재발송 간격(갭 #16) — 번호 기준(B-3)과 요청자 기준을 함께 본다.
        last = await conn.fetchval(
            "select max(created_at) from family_link_requests "
            "where phone_hash = $1 or requesting_patient_id = $2",
            phone_hash, patient.id)
        if last is not None:
            waited = (datetime.now(timezone.utc) - last).total_seconds()
            if waited < RESEND_INTERVAL_SECONDS:
                raise AppError(
                    "인증번호는 30초 뒤에 다시 받으실 수 있습니다.",
                    status_code=429,
                    retry_after_seconds=int(RESEND_INTERVAL_SECONDS - waited) + 1)

        # ② 상한(갭 #62) — ㉯도 연결선을 하나 더 만드는 일이다. 문자를 보내기 **전에** 막는다.
        active = await conn.fetchval(
            "select count(*) from patient_family_links where account_patient_id=$1 and is_active",
            patient.id)
        if active >= MAX_ACTIVE_FAMILY:
            raise AppError(_LIMIT_MESSAGE, status_code=409)

        # ③ 후보 조회 — 이름·생년월일·전화번호 셋이 모두 맞고 **정확히 1건**일 때만 특정한다.
        #    요구사항 3.5: 이름+생년월일로는 사람을 특정할 수 없다(FAM-LINK-18·19·20).
        candidates = await conn.fetch(
            "select id from patients "
            "where name = $1 and birth_date = $2 and regexp_replace(coalesce(phone,''), '\\D', '', 'g') = $3",
            name, birth_date, phone_digits)
        target_id = candidates[0]["id"] if len(candidates) == 1 else None

        # ④ 사실대로 알려주는 두 경우(갭 #60). 서버가 판정한다 — 앱이 든 목록은 낡을 수 있다.
        if target_id is not None:
            if target_id == patient.id:
                raise AppError("본인은 가족으로 추가할 수 없습니다.", status_code=409)
            already = await conn.fetchval(
                "select 1 from patient_family_links "
                "where account_patient_id=$1 and family_patient_id=$2 and is_active",
                patient.id, target_id)
            if already:
                raise AppError("이미 가족으로 연결되어 있습니다.", status_code=409)

        # ⑤ ⭐ 코드는 **대상이 없어도** 만들어 저장한다 — 여기에 if가 없어야 응답 시간이 안 갈린다(#58).
        code = f"{secrets.randbelow(1_000_000):06d}"
        request_id = await conn.fetchval(
            "insert into family_link_requests "
            "  (requesting_patient_id, target_patient_id, phone_hash, relation, code_hash, expires_at) "
            "values ($1,$2,$3,$4,$5,$6) returning id",
            patient.id, target_id, phone_hash, relation, _hash(code),
            datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES))

    # ⑥ 문자만 갈린다(화면은 안 갈린다). 갭 #42 — 본문은 한글이다.
    if target_id is not None:
        sms_client.send_sms(
            phone_digits,
            f"[병원] 가족 연결 인증번호는 {code}입니다. {OTP_TTL_MINUTES}분 안에 입력해 주세요.")
    return request_id


async def confirm_family_link_otp(patient: PatientContext, request_id: UUID, code: str) -> UUID:
    """인증번호가 맞으면 연결선을 만든다(또는 해제됐던 줄을 되살린다). 연결된 환자 id를 돌려준다.

    ⚠️ 틀린 코드의 `attempts += 1`은 **트랜잭션이 커밋된 뒤에 raise**해야 남는다 — 트랜잭션 안에서
       바로 raise하면 asyncpg가 롤백해 카운트가 영영 0으로 되돌아간다(무한 시도 허용 버그). 그래서
       상태를 바꾸지 않는 검증(없음·만료·소진)만 트랜잭션 안에서 raise하고, 틀린 코드는 플래그로
       빠져나와 커밋 후 raise한다.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            req = await conn.fetchrow(
                "select * from family_link_requests where id = $1 for update", request_id)
            # 아래 셋은 아무것도 바꾸지 않으므로 트랜잭션 안에서 raise해도 롤백할 것이 없다.
            if req is None or req["requesting_patient_id"] != patient.id:
                raise AppError("요청을 찾을 수 없습니다.", status_code=404)
            if req["verified_at"] is not None:
                raise AppError("이미 처리된 요청입니다.", status_code=400)
            if req["expires_at"] < datetime.now(timezone.utc):
                raise AppError("인증번호가 만료되었습니다. 다시 받아 주세요.", status_code=400)
            if req["attempts"] >= MAX_CODE_ATTEMPTS:
                raise AppError("인증번호를 여러 번 잘못 입력하셨습니다. 다시 받아 주세요.", status_code=400)

            # ⭐ 대상이 없는 요청(#58)도 여기서 끝난다 — code_hash가 보낸 적 없는 무작위 값이라
            #    어떤 숫자를 넣어도 맞지 않는다. 「대상 없음」을 위한 분기가 아예 없다.
            wrong_code = not hmac.compare_digest(req["code_hash"], _hash(code))
            if wrong_code:
                # 카운트를 올리고 **커밋되게** 트랜잭션 밖에서 raise한다(위 주석).
                await conn.execute(
                    "update family_link_requests set attempts = attempts + 1 where id = $1", request_id)
            else:
                # 상한을 다시 본다(갭 #62) — 요청과 확인 사이에 다른 창에서 채웠을 수 있다.
                active = await conn.fetchval(
                    "select count(*) from patient_family_links where account_patient_id=$1 and is_active",
                    patient.id)
                if active >= MAX_ACTIVE_FAMILY:
                    raise AppError(_LIMIT_MESSAGE, status_code=409)

                await conn.execute(
                    "update family_link_requests set verified_at = now() where id = $1", request_id)
                # [#59][C2-#2 2026-08-20] 해제됐던 줄이 있으면 되살린다. staff-web 00045가 unique를 partial(`where is_active`)로
                #   바꿨기 때문에 `on conflict (account_patient_id, family_patient_id)`가 그 partial index를 추론하지 못해
                #   런타임 오류가 난다 → 형제 add_family_member처럼 explicit SELECT + UPDATE/INSERT로 한다.
                existing = await conn.fetchval(
                    "select id from patient_family_links "
                    "where account_patient_id=$1 and family_patient_id=$2 and not is_active",
                    patient.id, req["target_patient_id"])
                if existing is not None:
                    await conn.execute(
                        "update patient_family_links set is_active=true, unlinked_at=null, "
                        "unlinked_by=null, unlink_reason=null, relation=$2 where id=$1",
                        existing, req["relation"])
                else:
                    await conn.execute(
                        "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1,$2,$3)",
                        patient.id, req["target_patient_id"], req["relation"])
                # ⛔ patients.app_created_by는 건드리지 않는다 — 이 행은 병원이 만든 기록이다.
                #    T25 판정이 이 null을 보고 신원 칸을 잠근다(identity_lock_reason='linked').

    if wrong_code:
        raise AppError("인증번호가 올바르지 않습니다.", status_code=400)
    return req["target_patient_id"]
