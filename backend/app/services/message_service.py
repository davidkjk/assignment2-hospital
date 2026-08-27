"""[Task 28][SEND-*][MSGX-*] /messages 발송 만들기 — enqueue·수신자 해석·목록·예약 취소.

⭐⭐ 경계 = enqueue(기록을 먼저 쓴다) ↔ deliver(그 기록을 실어 보낸다). 이 태스크는 「만들어서
   큐에 넣기」까지 — 실제 배달(푸시·문자·폴백)·상태 콜백·재시도·결과 표시·명단 열람은 Task 30이다.
   즉시 발송은 notification_log에 '발송중' 행만 쓰고(SEND-RESULT-06 기록이 먼저), 예약은
   scheduled_notifications의 pending 행 + 수신자 명단(00049)을 쓴다. send_now 호출은 Task 30 몫.

⚠️ 실제 인프라 대조(플랜 스캐폴딩 드리프트 교정):
  - require_role_ctx는 없다 → 서비스가 staff.role을 직접 검사해 AppError(403).
  - REGENERATION_WEEKS는 slot_generator에 있다(schedule_service 아님).
  - paginate는 (rows, cursor, order) — 행 리스트를 받는다(conn+query 아님).
  - conn=None 주입 패턴(merge/schedule과 동일): 테스트가 db_conn을 주입해 미커밋 seed를 본다.

⛔ 광고 동의 필터·기기 토큰·문자 실건수 원천은 환자앱(3단계) 소유(BLOCKED-BEFORE-MERGE).
   지금은 전체 count + marketing_excluded 자리 + sms_count 상한 계약만 세운다.
"""
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.errors import AppError
from app.core.pagination import Page, paginate
from app.core.security import StaffContext
from app.db.pool import acquire_as
from app.services.slot_generator import REGENERATION_WEEKS  # =8 (SCHED-SLOT-09)

KST = ZoneInfo("Asia/Seoul")

# 화면 문구 → 저장값(SEND-KIND-02). 저장은 notification_log CHECK 값과 같아야 한다.
_KIND_DB = {"안내": "transactional", "광고": "marketing"}
# SEND-NIGHT-01 — 21시~익일 8시는 광고성 발송 금지(정보통신망법 50조).
_NIGHT_START, _NIGHT_END = time(21, 0), time(8, 0)
# SEND-CH-01 — 앱+문자폴백 / 앱만 / 모두 문자.
_CHANNELS = {"push_sms", "push", "sms"}
# SEND-ADS-04 — 무료 수신거부 문구(지울 수 없게 저장 body에 박는다). 실제 번호는 병원 설정(Task29).
_OPT_OUT_LINE = "무료 수신거부 080-000-0000"


class ValidationError(AppError):
    """검증 실패 — 422. errors.py엔 없어 여기서 정의한다(AppError 파생)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=422)


def _now_kst() -> datetime:
    """현재 KST 시각. 테스트가 monkeypatch로 갈아끼운다(야간 판정)."""
    return datetime.now(KST)


@dataclass
class EnqueueResult:
    target_count: int
    sms_count: int | None = None
    marketing_excluded: int = 0
    notification_ids: list | None = None
    scheduled_id: str | None = None
    night_blocked: bool = False
    suggested_at: datetime | None = None


def _require_roles(staff: StaffContext, *roles: str) -> None:
    # SEND-DOOR-07·SEND-ALL-01 — 접수직원·관리자만. 의사는 화면 자체가 없다(라우터 require_role과
    # 이중 방어). 서비스 직접 호출도 403으로 막는다.
    if staff.role not in roles:
        raise AppError("이 기능에 대한 권한이 없습니다.", status_code=403)


def _decorate_ad(body: str) -> str:
    # SEND-ADS-04 — (광고) 접두 + 무료 수신거부. 지울 수 없게 저장 시점에 박는다.
    return f"(광고) {body}\n{_OPT_OUT_LINE}"


def _norm_channel(channel: str) -> str:
    # 저장은 실제 채널 하나(notification_log.channel CHECK='push'|'sms'). push_sms의 실채널은
    # 배달 때 확정한다(SEND-RESULT-09) — 여기서는 폴백 전제라 'push'로 두고, Task30이 뒤집는다.
    return "sms" if channel == "sms" else "push"


def _estimate_sms(channel: str, n: int) -> int:
    # SEND-CH-04 — 돈 드는 문자 건수. ⛔ 토큰 원천은 환자앱이라 실값을 못 센다 → 상한 계약:
    # 앱만(push)이면 0, 그 외엔 최대 n(폴백/모두문자). 실제 건수는 Task30·환자앱에서 확정.
    return 0 if channel == "push" else n


def _validate_scheduled_at(at: datetime) -> None:
    # MSGX-SCHED-01 — 5분 단위·KST·최대 미래 범위 REGENERATION_WEEKS(하드코딩 금지).
    at = at.astimezone(KST)
    if at.minute % 5 != 0:
        raise ValidationError("예약 시각은 5분 단위로 선택해 주세요.")
    now = _now_kst()
    if not (now < at <= now + timedelta(weeks=REGENERATION_WEEKS)):
        raise ValidationError(
            f"예약은 지금부터 {REGENERATION_WEEKS}주 이내로만 잡을 수 있습니다.")


async def resolve_recipients(spec: dict, kind: str, conn) -> tuple[list, int]:
    """수신자 id 목록과 광고 제외 인원을 돌려준다.

    SEND-ADS-01 — 광고는 동의자만 남긴다. ⛔ consent 원천은 환자앱(3단계)이라 아직 없다 →
    지금은 전체 대상 + excluded=0(자리만). 필터는 BLOCKED-BEFORE-MERGE에서 붙는다.
    """
    if spec.get("all"):
        rows = await conn.fetch("select id from patients where is_active")
    else:
        ids = spec.get("patient_ids", [])
        rows = await conn.fetch(
            "select id from patients where id = any($1::uuid[]) and is_active", ids)
    return [r["id"] for r in rows], 0


async def enqueue_send(staff: StaffContext, *, kind: str, recipients_spec: dict,
                       channel: str, body: str, scheduled_at: datetime | None = None,
                       conn=None) -> EnqueueResult:
    _require_roles(staff, "receptionist", "admin")
    if channel not in _CHANNELS:
        raise ValidationError("보내는 방법을 골라 주세요.")
    if conn is not None:
        return await _enqueue_on_conn(staff, conn, kind=kind, recipients_spec=recipients_spec,
                                      channel=channel, body=body, scheduled_at=scheduled_at)
    async with acquire_as(str(staff.auth_user_id)) as c, c.transaction():
        return await _enqueue_on_conn(staff, c, kind=kind, recipients_spec=recipients_spec,
                                      channel=channel, body=body, scheduled_at=scheduled_at)


async def _enqueue_on_conn(staff: StaffContext, conn, *, kind: str, recipients_spec: dict,
                           channel: str, body: str, scheduled_at: datetime | None) -> EnqueueResult:
    ids, excluded = await resolve_recipients(recipients_spec, kind, conn)
    if kind == "marketing" and not ids:
        raise AppError("광고에 동의한 환자가 없습니다.", status_code=422)  # SEND-ADS-03
    if not ids:
        raise AppError("받는 사람을 한 명 이상 골라 주세요.", status_code=422)  # SEND-WHO-03

    stored_body = _decorate_ad(body) if kind == "marketing" else body

    # SEND-NIGHT-01·02 — 야간 광고 즉시발송은 막되 돌려보내지 않고 '내일 08:00'을 제안한다.
    if kind == "marketing" and scheduled_at is None:
        now = _now_kst()
        if now.time() >= _NIGHT_START or now.time() < _NIGHT_END:
            nxt = (now + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
            return EnqueueResult(target_count=len(ids), night_blocked=True, suggested_at=nxt)

    if scheduled_at is not None:
        # SEND-LATER-01 — 예약 발송. 별도 큐(scheduled_notifications)로 notification_log와 분리.
        _validate_scheduled_at(scheduled_at)
        row = await conn.fetchrow(
            "insert into scheduled_notifications "
            "(notification_type, kind, body, channel, scheduled_at, created_by, target_count, status) "
            "values ('staff_direct', $1, $2, $3, $4, $5, $6, 'pending') returning id",
            kind, stored_body, _norm_channel(channel), scheduled_at.astimezone(KST),
            staff.id, len(ids))
        # 결정#5 ⓐ — 수신자 명단을 예약 순간 고정한다(발송 때 재해석 X).
        await conn.executemany(
            "insert into scheduled_notification_recipients "
            "(scheduled_notification_id, patient_id) values ($1, $2)",
            [(row["id"], pid) for pid in ids])
        return EnqueueResult(target_count=len(ids), scheduled_id=str(row["id"]),
                             marketing_excluded=excluded)

    # 즉시 발송 — '발송중' 행을 먼저 쓴다(SEND-RESULT-06). 실제 배달은 Task 30 디스패처.
    nids = []
    for pid in ids:
        r = await conn.fetchrow(
            "insert into notification_log "
            "(patient_id, notification_type, kind, body, channel, sender_staff_id, "
            "target_count, delivery_status) "
            "values ($1, 'staff_direct', $2, $3, $4, $5, $6, '발송중') returning id",
            pid, kind, stored_body, _norm_channel(channel), staff.id, len(ids))
        nids.append(r["id"])
    return EnqueueResult(target_count=len(ids), sms_count=_estimate_sms(channel, len(ids)),
                         marketing_excluded=excluded, notification_ids=nids)


async def cancel_scheduled(staff: StaffContext, scheduled_id, expected_status: str = "pending",
                           conn=None) -> dict:
    _require_roles(staff, "receptionist", "admin")
    if conn is not None:
        return await _cancel_on_conn(staff, conn, scheduled_id)
    async with acquire_as(str(staff.auth_user_id)) as c, c.transaction():
        return await _cancel_on_conn(staff, c, scheduled_id)


async def _cancel_on_conn(staff: StaffContext, conn, scheduled_id) -> dict:
    # MSGX-SCHED-02 — pending만 취소, 취소자·시각 기록. for update로 claim과의 경합을 재검사한다.
    row = await conn.fetchrow(
        "select status from scheduled_notifications where id = $1 for update", scheduled_id)
    if row is None or row["status"] != "pending":
        # 이미 sent/cancelled면 막다른 길 없이 사람 문장(결정#29 — 시스템 오류로 안 보낸다).
        raise AppError("이미 처리되었거나 취소할 수 없는 예약입니다.", status_code=409)
    await conn.execute(
        "update scheduled_notifications set status = 'cancelled', "
        "cancelled_by = $2, cancelled_at = now() where id = $1", scheduled_id, staff.id)
    return {"status": "cancelled"}


async def list_messages(staff: StaffContext, cursor: str | None = None, conn=None) -> dict:
    _require_roles(staff, "receptionist", "admin")
    if conn is not None:
        return await _list_on_conn(conn, cursor)
    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _list_on_conn(c, cursor)


async def _list_on_conn(conn, cursor: str | None) -> dict:
    # SEND-LIST-01·02 — 예약해 둔 것(pending, 0건이면 빈 구역) + 보낸 것.
    scheduled = await conn.fetch(
        "select * from scheduled_notifications where status = 'pending' "
        "order by scheduled_at asc, id asc")
    # SEND-LIST-08·09 — 사람이 보낸 것만 목록에, 자동 발송(sender null)은 건수로만 접는다.
    auto_count = await conn.fetchval(
        "select count(*) from notification_log where sender_staff_id is null")
    sent_rows = await conn.fetch(
        "select * from notification_log where sender_staff_id is not null")
    # SEND-LIST-07 — 정렬 sent_at desc + 페이지(Task 13 paginate는 행 리스트를 받는다).
    sent = paginate([dict(r) for r in sent_rows], cursor=cursor, order="sent_at desc")
    return {"scheduled": [dict(r) for r in scheduled], "sent": sent, "auto_count": auto_count}
