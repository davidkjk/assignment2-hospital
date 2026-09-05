"""[Task 30][SEND-RESULT-*·SEND-RETRY-*·SEND-DEAD-*] 발송 디스패처 — 상태기계·폴백·재시도.

정본 = docs/design/screen-behaviors.md 「발송 결과와 실패」 절.

⭐ 경계 = enqueue(Task 28: '발송중' 행을 먼저 쓴다) ↔ deliver(여기: 그 행을 실어 보내고 결과를 굴린다).

⚠️ 실제 제공자 호출(FCM 푸시·Twilio 문자)은 **주입 가능한 경계**(`push_send`·`sms_send`)로 둔다.
   실제 구현·인증·서명검증은 배포(env) 몫이고, 테스트는 fake 제공자를 주입한다. 기본 제공자는
   `NotImplementedError`를 던져 「배포에서 붙일 것」임을 분명히 한다.

채널 해석은 `notify_patient`의 초기 선택과 폴백이 **같은 코드**(`_sms_eligible`)를 쓴다 —
`HSET-SMS-05`(*"채널 고르는 코드가 갈라지면 안 된다"*)를 지킨다.
"""
import logging
from dataclasses import dataclass
from datetime import timedelta

from app.db.pool import get_pool

_logger = logging.getLogger("dispatch")

# ── 제공자 경계(주입) — 실제 구현은 배포(env) ──────────────────────────────────
class PushUnregistered(Exception):
    """죽은 푸시 토큰(FCM UNREGISTERED). send_now가 받으면 그 device_tokens 줄을 지운다."""


@dataclass
class SmsOutcome:
    """문자 제공자 즉시 응답. queued=접수(도달은 콜백으로) / failed=즉시 거절(failure_code)."""
    status: str                       # 'queued' | 'failed'
    provider_message_id: str | None = None
    failure_code: str | None = None


def _provider_push(token: str, body: str) -> str | None:
    """실제 푸시 발송(FCM). 키가 설정되면 진짜 발송, 아니면 개발 폴백(로그만).

    None을 돌려주면 살아있는 배달이 없다고 보고 문자로 폴백한다(SEND-RESULT-03c).
    죽은 토큰이면 FcmClient가 PushUnregistered를 던져 그 토큰이 지워진다(03b).
    """
    from app.integrations.fcm_client import get_fcm_client

    client = get_fcm_client()
    if client is None:
        _logger.info("[PUSH 미연결·개발폴백] token=%s body=%s", token, body)
        return "dev-fallback-push"
    return client.send(token, body)


def _provider_sms(phone: str, body: str) -> SmsOutcome:
    """실제 문자 발송(Solapi). 키가 설정되면 진짜 발송, 아니면 개발 폴백(로그만·queued)."""
    from app.integrations.solapi_client import get_solapi_client

    client = get_solapi_client()
    if client is None:
        _logger.info("[SMS 미연결·개발폴백] to=%s body=%s", phone, body)
        return SmsOutcome(status="queued", provider_message_id="dev-fallback")
    return client.send(phone, body)


# ── 재시도 정책(SEND-RETRY) ───────────────────────────────────────────────────
_MAX_RETRY = 2
# 새 retry_count 기준: 1회차=1분 뒤, 2회차=5분 뒤(SEND-RETRY-01).
_RETRY_DELAYS = {1: timedelta(minutes=1), 2: timedelta(minutes=5)}
# 일시 실패(통신사 혼잡·업체 순간 장애)만 재시도. 나머지·모르는 코드는 재시도 안 함(SEND-RETRY-02·03).
_TEMPORARY_CODES = {"congestion", "provider_glitch", "rate_limited", "timeout"}
# 없는 번호로 판정되는 코드 — 환자에 문자 죽음 표식을 붙인다(SEND-DEAD-07).
_DEAD_NUMBER_CODES = {"invalid_number", "unreachable", "landline"}


def classify_failure(code: str | None) -> str:
    """일시(temporary) / 영구(permanent). ⭐ 모르면 영구로 본다 — 안전한 쪽(돈 안 씀)."""
    return "temporary" if code in _TEMPORARY_CODES else "permanent"


# ── 문자 판정(공용) — 초기 선택과 폴백이 같은 코드(HSET-SMS-05) ────────────────
async def _sms_eligible(conn, patient_id) -> bool:
    """병원 문자 스위치 on + 번호 생존(sms_dead 아님 + 번호 있음)이면 문자 대상."""
    row = await conn.fetchrow(
        "select p.sms_dead, p.phone, h.sms_enabled "
        "from patients p cross join hospital_settings h where p.id = $1 and h.id", patient_id)
    if row is None:
        return False
    return bool(row["sms_enabled"]) and not row["sms_dead"] and bool(row["phone"])


# ── 상태 전이(SEND-RESULT-05) ─────────────────────────────────────────────────
async def mark_delivered(conn, notification_id, *, channel: str | None = None,
                         provider_message_id: str | None = None) -> None:
    """진짜 도달(SEND-RESULT-01). '도달' + delivered_at, 재시도 예약 해제."""
    await conn.execute(
        "update notification_log set delivery_status='도달', delivered_at=now(), "
        "next_retry_at=null, "
        "channel=coalesce($2, channel), "
        "provider_message_id=coalesce($3, provider_message_id) where id=$1",
        notification_id, channel, provider_message_id)


async def mark_failed(conn, notification_id, failure_code: str | None, *,
                      channel: str | None = None) -> None:
    """실패를 기록한다. 일시 실패면 2회까지 재시도 예약, 아니면 '실패'로 못 박는다.

    SEND-RETRY-01·02·03. 없는 번호면 환자 문자 죽음 표식(SEND-DEAD-07)까지.
    """
    row = await conn.fetchrow(
        "select patient_id, retry_count from notification_log where id=$1 for update",
        notification_id)
    if row is None:
        return
    rc = row["retry_count"]
    if classify_failure(failure_code) == "temporary" and rc < _MAX_RETRY:
        new_rc = rc + 1
        delay = _RETRY_DELAYS[new_rc]
        await conn.execute(
            "update notification_log set delivery_status='재시도중', retry_count=$2, "
            "failure_code=$3, next_retry_at=now()+$4, "
            "channel=coalesce($5, channel) where id=$1",
            notification_id, new_rc, failure_code, delay, channel)
        return
    # 영구 실패(또는 재시도 소진) — 못 박는다.
    await conn.execute(
        "update notification_log set delivery_status='실패', failed_at=now(), "
        "failure_code=$2, next_retry_at=null, channel=coalesce($3, channel) where id=$1",
        notification_id, failure_code, channel)
    if failure_code in _DEAD_NUMBER_CODES and row["patient_id"] is not None:
        # SEND-DEAD-07·08 — 번호가 죽었다. 고치는 자리(/patients/:id)에 표식이 뜬다.
        await conn.execute(
            "update patients set sms_dead=true, sms_dead_checked_at=now() "
            "where id=$1 and sms_dead=false", row["patient_id"])


# ── 발송(SEND-RESULT-03·03b·03c) ──────────────────────────────────────────────
async def send_now(notification_ids, conn, *, push_send=None, sms_send=None) -> None:
    """'발송중' 행들을 실어 보낸다. 푸시는 즉시 결과(SEND-RESULT-03), 문자는 접수까지.

    푸시가 죽은 토큰이면 그 자리에서 device_tokens 줄을 지우고(03b), 살아있는 배달이 하나도
    없으면 문자로 폴백하며 로그 channel을 'sms'로 뒤집는다(03c/09).
    """
    push_send = push_send or _provider_push
    sms_send = sms_send or _provider_sms
    for nid in notification_ids:
        await _dispatch_one(nid, conn, push_send, sms_send)


async def _dispatch_one(nid, conn, push_send, sms_send) -> None:
    row = await conn.fetchrow(
        "select patient_id, anonymous_contact_id, requested_channel, channel, body, kind "
        "from notification_log where id=$1 for update", nid)
    if row is None:
        return
    # [보안 F-04] 발송 시점 수신동의 재확인 — 광고는 지금 동의한 환자에게만. 예약 순간엔 동의했더라도
    # 그새 철회했으면 조용히 누락하지 않고 '제외'로 남기고 보내지 않는다(SEND-ADS-01·한국법).
    if row["kind"] == "marketing" and row["patient_id"] is not None:
        if not await _ads_consented(conn, row["patient_id"]):
            await mark_excluded(conn, nid, "ads_consent_withdrawn")
            return
    requested = row["requested_channel"] or row["channel"]  # 옛 행 보호(requested 없을 수 있음)
    body = row["body"] or ""
    wants_push = requested in ("push_sms", "push")
    wants_sms = requested in ("push_sms", "sms")

    # 익명 웹상담 답변 알림(§5) — 계정이 없다. 검증 연락처(암호문)를 복호화해 문자만 보낸다
    # (병원 문자 스위치·죽은번호 판정을 타지 않는다 — 익명은 항상 sms·transactional).
    if row["patient_id"] is None and row["anonymous_contact_id"] is not None:
        phone = await _anonymous_phone(conn, row["anonymous_contact_id"])
        if phone is None:
            await mark_failed(conn, nid, "invalid_number", channel="sms")
            return
        await _apply_sms_outcome(conn, nid, sms_send(phone, body))
        return

    # ① 푸시 — 즉시 안다(SEND-RESULT-03). 죽은 토큰은 지운다(03b).
    if wants_push:
        pmid = await _try_push(conn, row["patient_id"], body, push_send)
        if pmid is not None:
            await mark_delivered(conn, nid, channel="push", provider_message_id=pmid)
            return

    # ② 살아있는 배달이 없다 → 문자 폴백(03c) 또는 문자 직접. channel을 'sms'로 뒤집는다(09).
    if wants_sms:
        if await _sms_eligible(conn, row["patient_id"]):
            await _apply_sms_outcome(conn, nid, sms_send(await _phone(conn, row["patient_id"]), body))
            return
        # 문자 대상이 아니다(번호 죽음/병원 off) → 실패(SEND-RESULT-03c 끝단).
        code = "invalid_number" if await _is_dead_number(conn, row["patient_id"]) else "sms_disabled"
        await mark_failed(conn, nid, code, channel="sms")
        return

    # ③ 푸시만 골랐는데 살아있는 토큰이 없다 → 실패.
    await mark_failed(conn, nid, "push_unregistered", channel="push")


async def _try_push(conn, patient_id, body, push_send) -> str | None:
    """살아있는 토큰으로 푸시를 시도한다. 죽은 토큰(UNREGISTERED)은 그 줄을 지운다(03b).

    하나라도 성공하면 provider_message_id를 돌려주고, 전부 죽었으면 None.
    """
    tokens = await conn.fetch(
        "select id, token from device_tokens where patient_id=$1", patient_id)
    for t in tokens:
        try:
            return push_send(t["token"], body)
        except PushUnregistered:
            await conn.execute("delete from device_tokens where id=$1", t["id"])
    return None


async def _apply_sms_outcome(conn, nid, outcome) -> None:
    """문자 제공자 즉시 응답을 로그에 반영한다. queued=접수(도달은 콜백으로) / 그 외=즉시 실패."""
    if outcome.status == "queued":
        # 접수까지만 안다 — '발송중' 유지, 도달/실패는 콜백으로(SEND-RESULT-02).
        await conn.execute(
            "update notification_log set channel='sms', provider_message_id=$2 where id=$1",
            nid, outcome.provider_message_id)
    else:
        await mark_failed(conn, nid, outcome.failure_code, channel="sms")


async def _anonymous_phone(conn, anonymous_contact_id) -> str | None:
    """익명 검증 연락처(암호문)를 실제 전화번호로 복호화한다(§5)."""
    from app.services.chat import anonymous_contact_codec

    ct = await conn.fetchval(
        "select contact_value_ciphertext from anonymous_chat_contacts where id=$1",
        anonymous_contact_id)
    return anonymous_contact_codec.decrypt_contact(ct) if ct is not None else None


async def _phone(conn, patient_id) -> str | None:
    return await conn.fetchval("select phone from patients where id=$1", patient_id)


async def _is_dead_number(conn, patient_id) -> bool:
    return bool(await conn.fetchval("select sms_dead from patients where id=$1", patient_id))


async def _ads_consented(conn, patient_id) -> bool:
    """[보안 F-04] 발송 시점의 현재 광고 수신 동의."""
    return bool(await conn.fetchval("select ads_consent from patients where id=$1", patient_id))


async def mark_excluded(conn, notification_id, reason: str) -> None:
    """[보안 F-04] 정책상 안 보낸다 — '제외'로 사유를 남긴다(배달 실패와 구분, 후속 없음)."""
    await conn.execute(
        "update notification_log set delivery_status='제외', failure_code=$2, next_retry_at=null "
        "where id=$1", notification_id, reason)


# ── 재시도 claim(MSGX-SCHED-03) — 쿼리만. 실제 10분 주기 cron 실행 = 배포 ────────
async def claim_due_retries(conn, *, limit: int = 100) -> list:
    """next_retry_at이 지난 '재시도중' 줄을 원자적으로 잡는다(동시 워커 경합 방지).

    for update skip locked = 여러 워커가 같은 줄을 두 번 보내지 않게 하는 승자판정.
    실제 주기 실행(cron)은 배포에서 붙인다 — 여기선 잡아 오는 쿼리까지.
    """
    rows = await conn.fetch(
        "select id from notification_log "
        "where delivery_status='재시도중' and next_retry_at is not null and next_retry_at <= now() "
        "order by next_retry_at asc for update skip locked limit $1", limit)
    return [r["id"] for r in rows]


async def run_retry_worker(*, conn=None, limit: int = 100,
                           push_send=None, sms_send=None) -> int:
    """[SEND-RETRY-01] due인 '재시도중' 줄을 잡아 다시 보낸다. 보낸 건수를 돌려준다.

    cron이 주기 실행한다(배포). conn을 주면 그 트랜잭션에서 돌고(테스트), 없으면 자기
    커넥션을 연다. claim은 `for update skip locked`라 여러 워커가 같은 줄을 두 번 안 보낸다.
    """
    if conn is not None:
        return await _retry_on_conn(conn, limit, push_send, sms_send)
    pool = await get_pool()
    async with pool.acquire() as c, c.transaction():
        return await _retry_on_conn(c, limit, push_send, sms_send)


async def _retry_on_conn(conn, limit, push_send, sms_send) -> int:
    ids = await claim_due_retries(conn, limit=limit)
    if ids:
        await send_now(ids, conn, push_send=push_send, sms_send=sms_send)
    return len(ids)
