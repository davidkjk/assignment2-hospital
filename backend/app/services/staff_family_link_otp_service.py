"""직원 대행 가족 연결 — B 번호 OTP 본인확인 창구(배포 Task 7E · 결정 #3 ㉠·㉢).

가족 연결의 본인확인부는 3층이다(결정 #3, 택일이 아니라 층으로 쌓음):
  ㉠ 기본 = **B 번호로 OTP**(이 서비스) — 대상 B는 이미 특정돼 있고(후보검색 없음), B의 등록번호로
     6자리를 보내 그 번호에 닿는 사람만 연결되게 한다.
  ㉡ 예외 = 번호 없을 때만 대면·서류(patient_service.link_family_member의 method!="otp" 경로).
  ㉢ 항상 = 연결 완료 시 B에 통보(notify_patient(family_patient_id, "family_linked", …)).

확인 성공 시 link_family_member(..., otp_verified=True)로 실제 연결하고 직후 B에 통보한다.
link_family_member는 otp_verified=True가 아니면 method="otp"를 501로 막아(우회 방지), OTP는 반드시
이 창구를 거치게 한다.

⚠️ 7D staff_phone_change_service와 같은 결의 방어:
  · 코드가 틀리면 attempts를 올리되 **트랜잭션 커밋 뒤에 raise**한다 — 안에서 raise하면 asyncpg가
    롤백해 카운트가 0으로 되돌아간다(무한 시도 허용 버그).
  · 확인·연결의 원자성 — 연결이 실패(이미 연결됨 등)하면 verified_at도 함께 롤백돼
    「확인됐는데 연결 안 됨」 상태가 생기지 않는다.
  · ㉢ 통보는 **커밋 뒤** best-effort로 부른다 — 통보 실패(문자 서비스 장애 등)가 이미 성공한 연결을
    500으로 되돌리지 않게 한다(감사 로그엔 연결이 남고, 이의제기는 병원 문의로 이어진다).
"""
import hashlib
import hmac
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import get_pool
from app.integrations.notify_clients import get_sms_client
from app.services import notification_service, patient_service

logger = logging.getLogger("family_link_otp")

OTP_TTL_MINUTES = 5           # 화면이 세는 5:00과 같은 값
RESEND_INTERVAL_SECONDS = 30  # 갭 #16 — 재발송 쿨다운(전화번호 변경 OTP와 같은 값)
MAX_CODE_ATTEMPTS = 5         # 6자리를 무한히 넣어보지 못하게


def _digits(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")


async def notify_family_linked(family_patient_id: UUID, *, notify=None) -> None:
    """㉢ 연결 완료 통보(PTDET-FAMILY-06) — OTP·예외 양쪽 경로가 연결 직후 부른다.

    채널은 notify_patient가 알아서 고른다(결정 #3 ㉢ 채널, 2026-09-02):
      B에게 앱 계정 있으면 push, 번호만 있으면 sms, 둘 다 없으면 무발송(감사 로그만).
    통보 실패(문자 서비스 장애 등)가 이미 성공한 연결을 되돌리지 않게 best-effort로 삼킨다.
    """
    notify = notify or notification_service.notify_patient
    pool = await get_pool()
    async with pool.acquire() as conn:
        name = await conn.fetchval("select name from patients where id=$1", family_patient_id)
    try:
        await notify(family_patient_id, "family_linked", target_name=name)
    except Exception:
        logger.exception(
            "가족 연결 통보 실패(연결은 완료됨) family_patient_id=%s", family_patient_id)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def request_family_link_otp(
    staff: StaffContext,
    account_patient_id: UUID,
    family_patient_id: UUID,
    relation: str,
    *,
    sms_client=None,
) -> UUID:
    """B의 등록번호로 인증번호를 보내고 요청 행(감사)을 남긴다. 요청 id를 돌려준다.

    B에 번호가 없으면 OTP로 확인할 수 없다(409) — 그 경우는 예외 경로(대면·서류)로 가야 한다.
    """
    sms_client = sms_client or get_sms_client()
    code = f"{secrets.randbelow(1_000_000):06d}"
    pool = await get_pool()

    async with pool.acquire() as conn:
        # ① 대상 B 존재·번호 확인 — 없는 사람에게는 문자도 안 보낸다.
        b = await conn.fetchrow(
            "select phone from patients where id=$1", family_patient_id)
        if b is None:
            raise AppError("대상 환자를 찾을 수 없습니다.", status_code=404)
        b_digits = _digits(b["phone"])
        if not b_digits:
            # [PTDET-FAMILY-04] 번호가 없으면 OTP 우회다 — 예외 경로로 안내(막다른 길 아님).
            raise AppError(
                "대상자의 등록된 전화번호가 없어 인증번호로 확인할 수 없습니다. "
                "대면·서류 확인으로 연결해 주세요.",
                status_code=409)

        # ② 재발송 쿨다운(갭 #16) — 그 A·B 쌍 기준.
        last = await conn.fetchval(
            "select max(created_at) from staff_family_link_requests "
            "where account_patient_id=$1 and family_patient_id=$2",
            account_patient_id, family_patient_id)
        if last is not None:
            waited = (datetime.now(timezone.utc) - last).total_seconds()
            if waited < RESEND_INTERVAL_SECONDS:
                raise AppError(
                    "인증번호는 30초 뒤에 다시 받으실 수 있습니다.",
                    status_code=429,
                    retry_after_seconds=int(RESEND_INTERVAL_SECONDS - waited) + 1)

        # ③ 코드 생성·저장. 원문 코드는 안 쌓고 해시만 남긴다. 관계도 저장(확인 때 이 관계로 연결).
        request_id = await conn.fetchval(
            "insert into staff_family_link_requests "
            "  (account_patient_id, family_patient_id, staff_id, relation, code_hash, expires_at) "
            "values ($1,$2,$3,$4,$5,$6) returning id",
            account_patient_id, family_patient_id, staff.id, relation, _hash(code),
            datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES))

    # ④ B의 등록번호로 문자를 보낸다(본인확인). 본문은 한글.
    sms_client.send_sms(
        b_digits,
        f"[병원] 가족 연결 확인 인증번호는 {code}입니다. {OTP_TTL_MINUTES}분 안에 입력해 주세요.")
    return request_id


async def confirm_family_link_otp(
    staff: StaffContext,
    account_patient_id: UUID,
    family_patient_id: UUID,
    code: str,
    *,
    notify=None,
) -> UUID:
    """인증번호가 맞으면 가족을 연결(method=otp)하고 직후 B에게 통보한다. 연결 id를 돌려준다."""
    pool = await get_pool()
    link_id = None

    async with pool.acquire() as conn:
        wrong_code = False
        async with conn.transaction():
            req = await conn.fetchrow(
                "select * from staff_family_link_requests "
                "where account_patient_id=$1 and family_patient_id=$2 and verified_at is null "
                "order by created_at desc limit 1 for update",
                account_patient_id, family_patient_id)
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
                    "update staff_family_link_requests set attempts = attempts + 1 where id=$1",
                    req["id"])
            else:
                # 확인 표시 → 실제 연결. 연결이 실패하면(이미 연결됨 등) 이 update도 함께 롤백된다.
                await conn.execute(
                    "update staff_family_link_requests set verified_at=now() where id=$1",
                    req["id"])
                link_id = await patient_service.link_family_member(
                    account_patient_id, family_patient_id, req["relation"], "otp", staff,
                    conn=conn, otp_verified=True)

        if wrong_code:
            raise AppError("인증번호가 올바르지 않습니다.", status_code=400)

    # ㉢ B 통보 — 커밋 뒤 best-effort(위 주석). OTP·예외 공통 헬퍼(PTDET-FAMILY-06).
    await notify_family_linked(family_patient_id, notify=notify)
    return link_id
