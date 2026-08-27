"""Task 29 /admin/settings 병원 설정 — 조회·원자 저장·미리보기 (HSET-* · HSETX-*).

한 화면·한 저장(HSET-SAVE-01). save_settings는 hospital_settings 스칼라 + 알림 문구 표 +
감사 로그를 **한 트랜잭션**으로 쓴다(HSETX-DATA-04·AUDIT-02). 전부 되거나 전부 안 되거나.

알림 문구 표는 새로 만들지 않고 기존 00013 notification_type_settings를 재사용한다
(body=override, also_sms=send_sms). 기본 문구의 원본은 코드(DEFAULT_MESSAGES) — DB는 덮어쓴 것만 담고,
행이 없거나 body가 NULL이면 코드 기본을 쓴다(HSET-MSG-24, 되돌리기=그 줄 삭제/NULL).
"""
from collections.abc import Mapping
from typing import Any
from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import acquire_as


class ValidationError(AppError):
    """사람이 고칠 수 있는 입력 오류(422). errors.py엔 없어 여기서 정의한다."""

    def __init__(self, message: str):
        super().__init__(message, status_code=422)


# HSET-MSG-06 열 종 — notify_patient의 MESSAGES 키와 정확히 같아야 한다(T26 교훈).
# 환자앱(3단계)의 기본 문구 원본이 백엔드에 아직 없어, 렌더용 기본을 코드 상수로 둔다(HSET-MSG-24).
DEFAULT_MESSAGES: dict[str, str] = {
    "requested": "예약이 접수되었습니다. 확정되면 다시 알려드릴게요.",
    "confirmed": "예약이 확정되었습니다. {날짜} {시각}에 뵙겠습니다.",
    "reminder_day_before": "내일 {시각} 예약이 있습니다. 잊지 마세요.",
    "reminder_today": "오늘 {시각} 예약이 있습니다. 시간에 맞춰 방문해 주세요.",
    "changed": "예약이 {날짜} {시각}으로 변경되었습니다.",
    "hospital_cancelled": "병원 사정으로 예약이 취소되었습니다. 다시 예약해 주세요.",
    "cancellation_approved": "요청하신 예약 취소가 처리되었습니다.",
    "cancellation_rejected": "예약 취소가 어려워 상담(직원 확인)으로 연결되었습니다.",
    "questionnaire_missing": "방문 전 문진표 작성을 부탁드립니다.",
    "visit_completed": "오늘 진료가 마무리되었습니다. 건강하세요.",
}
_TYPES = list(DEFAULT_MESSAGES.keys())

# HSETX-SEC-02 — 감사 본문에 값 대신 '변경됨'만 남기는 비밀 계열.
_SECRET_KEYS = {"sms_provider_token"}

# 저장 허용 스칼라 칸(키를 SQL에 직접 끼우므로 화이트리스트로 막는다).
_SCALAR_COLUMNS = {
    "cancellation_deadline_hours",
    "long_wait_threshold_minutes",
    "auto_confirm_app_bookings",
    "hospital_address",
    "hospital_phone",
    "sms_enabled",
    "sms_recipients",
    "sms_opt_out_number",
}


def is_secret_key(key: str) -> bool:
    return key in _SECRET_KEYS


def _role(staff: StaffContext | Mapping[str, Any] | None) -> str | None:
    if staff is None:
        return None
    return staff.role if isinstance(staff, StaffContext) else staff.get("role")


def _staff_id(staff: StaffContext | Mapping[str, Any]) -> UUID:
    value = staff.id if isinstance(staff, StaffContext) else staff.get("staff_id", staff.get("id"))
    return value if isinstance(value, UUID) else UUID(str(value))


def _auth_user_id(staff: StaffContext | Mapping[str, Any]) -> UUID:
    value = staff.auth_user_id if isinstance(staff, StaffContext) else staff.get("auth_user_id")
    return value if isinstance(value, UUID) else UUID(str(value))


def _require_admin(staff: StaffContext | Mapping[str, Any] | None) -> None:
    if _role(staff) != "admin":
        raise AppError("이 기능에 대한 권한이 없습니다.", status_code=403)   # HSET-NAV-05


def fill_tokens(template: str, values: Mapping[str, Any]) -> str:
    """{토큰}을 값으로 바꾸되, 값이 없으면 그 자리(와 붙은 공백)만 조용히 뺀다(HSET-MSG-17·18)."""
    result = template
    for key, value in values.items():
        token = "{" + key + "}"
        if value is None:
            result = result.replace(token + " ", "").replace(" " + token, "").replace(token, "")
        else:
            result = result.replace(token, str(value))
    return result


def _provider_connected() -> bool:
    # 문자 제공자 연결은 배포(env)가 정한다. 아직 미연결이므로 상태만 노출한다(무음 실패 방지, HSETX-DEFAULT-02).
    return False


def _validate(patch: Mapping[str, Any]) -> None:
    """HSETX-VALID-01 — 범위 밖·빈 문구를 저장 전에 막는다(막다른 길 없이 사람 문장으로)."""
    h = patch.get("cancellation_deadline_hours")
    if h is not None and not (isinstance(h, int) and 0 <= h <= 168):
        raise ValidationError("취소 마감은 0~168시간으로 입력해 주세요.")
    w = patch.get("long_wait_threshold_minutes")
    if w is not None and not (isinstance(w, int) and 1 <= w <= 180):
        raise ValidationError("오래 대기 기준은 1~180분으로 입력해 주세요.")
    for _t, v in patch.get("notifications", {}).items():
        if "body_override" in v and v["body_override"] is not None and not v["body_override"].strip():
            raise ValidationError("문구를 비워 둘 수 없습니다.")           # HSET-MSG-25


def _scalar_items(patch: Mapping[str, Any]):
    for key, value in patch.items():
        if key in _SCALAR_COLUMNS:
            yield key, value


async def _recent_change_per_key(conn) -> dict[str, dict]:
    """HSETX-AUDIT-01 — 항목별 가장 최근 변경 한 줄(펼침은 화면이)."""
    rows = await conn.fetch(
        "select distinct on (setting_key) setting_key, changed_at, changed_by, new_value "
        "from settings_audit_log order by setting_key, changed_at desc")
    return {r["setting_key"]: {
        "changed_at": r["changed_at"], "changed_by": r["changed_by"], "new_value": r["new_value"],
    } for r in rows}


async def _upcoming_closures(conn) -> list[dict]:
    """HSET-INFO-03 — 예정 휴무는 읽기 전용(편집은 /admin/schedule)."""
    rows = await conn.fetch(
        "select closure_date, memo from hospital_closures "
        "where closure_date >= current_date order by closure_date")
    return [{"closure_date": r["closure_date"].isoformat(), "memo": r["memo"]} for r in rows]


async def _read_settings(conn) -> dict:
    row = await conn.fetchrow("select * from hospital_settings where id")
    s = dict(row)
    overrides = {r["notification_type"]: r
                 for r in await conn.fetch("select notification_type, body, also_sms "
                                           "from notification_type_settings")}
    s["notifications"] = {
        t: {
            "body": (overrides.get(t) or {}).get("body") or DEFAULT_MESSAGES[t],
            "is_default": (overrides.get(t) or {}).get("body") is None,
            "send_sms": bool((overrides.get(t) or {}).get("also_sms", False)),
        }
        for t in _TYPES
    }
    s["recent_changes"] = await _recent_change_per_key(conn)
    s["upcoming_closures"] = await _upcoming_closures(conn)
    s["sms_provider_connected"] = _provider_connected()
    return s


async def get_settings(staff, *, conn=None) -> dict:
    """관리자용 전체 설정 조회 — scalar + 알림 override + 예정 휴무 + 항목별 최근 변경."""
    _require_admin(staff)
    if conn is not None:
        return await _read_settings(conn)
    async with acquire_as(str(_auth_user_id(staff))) as c:
        return await _read_settings(c)


async def get_public_hospital_info(*, conn=None) -> dict:
    """HSETX-SEC-01 — 환자 앱용 좁은 창구(주소·전화만). 취소마감·자동확정은 새지 않는다."""
    async def query(c):
        row = await c.fetchrow("select hospital_address, hospital_phone from hospital_settings where id")
        return dict(row)

    if conn is not None:
        return await query(conn)
    # 공개 정보는 서비스 롤 없이 읽어야 하나, 현재는 관리자 세션에서만 호출된다.
    async with acquire_as(None) as c:  # pragma: no cover - 배선은 환자앱 경로
        return await query(c)


async def _audit(conn, staff, key: str, old, new) -> None:
    new_value = "변경됨" if is_secret_key(key) else (None if new is None else str(new))
    old_value = "변경됨" if is_secret_key(key) else (None if old is None else str(old))
    await conn.execute(
        "insert into settings_audit_log (changed_by, setting_key, old_value, new_value) "
        "values ($1, $2, $3, $4)",
        _staff_id(staff), key, old_value, new_value)


async def _save(conn, staff, patch, base_version) -> dict:
    async with conn.transaction():                                   # HSETX-DATA-04 원자(주입 conn이면 savepoint)
        cur = await conn.fetchval("select version from hospital_settings where id for update")
        if cur != base_version:
            raise AppError("다른 관리자가 먼저 저장했습니다. 최신 값을 확인해 주세요.", status_code=409)  # HSETX-STATE-03
        for key, new in _scalar_items(patch):
            old = await conn.fetchval(f"select {key}::text from hospital_settings where id")
            await conn.execute(f"update hospital_settings set {key} = $1 where id", new)
            await _audit(conn, staff, key, old, str(new))            # 같은 트랜잭션(HSETX-AUDIT-02)
        for t, v in patch.get("notifications", {}).items():
            if t not in _TYPES:
                raise ValidationError("알 수 없는 알림 종류입니다.")
            if "body_override" in v and v["body_override"] is None and "send_sms" not in v:
                # 되돌리기 = 그 줄 삭제(HSET-MSG-22·24). 코드 기본으로 복귀.
                await conn.execute("delete from notification_type_settings where notification_type = $1", t)
            else:
                await conn.execute(
                    "insert into notification_type_settings (notification_type, body, also_sms) "
                    "values ($1, $2, coalesce($3, false)) "
                    "on conflict (notification_type) do update set "
                    "  body = case when $4 then excluded.body else notification_type_settings.body end, "
                    "  also_sms = coalesce(excluded.also_sms, notification_type_settings.also_sms)",
                    t, v.get("body_override"), v.get("send_sms"), "body_override" in v)
            await _audit(conn, staff, f"notif.{t}", None, "변경됨")
        await conn.execute("update hospital_settings set version = version + 1 where id")
        return {"ok": True, "version": (base_version or 0) + 1}


async def save_settings(staff, patch, base_version, *, conn=None) -> dict:
    """HSET-SAVE-01 — 다섯 묶음을 한 덩어리로. 하나 실패면 전부 롤백."""
    _require_admin(staff)
    _validate(patch)                                                 # 위반은 DB 손대기 전에 막는다
    if conn is not None:
        return await _save(conn, staff, patch, base_version)
    async with acquire_as(str(_auth_user_id(staff))) as c:
        return await _save(c, staff, patch, base_version)


async def preview_cancellation_deadline(staff, new_hours: int, *, conn=None) -> int:
    """HSETX-API-03 — 새 마감으로 처음 「마감 후」가 되는 미래 예약 건수만(이름·전화 없음)."""
    _require_admin(staff)

    async def query(c) -> int:
        return await c.fetchval(
            "select count(*) from appointments a "
            "join appointment_slots s on s.id = a.slot_id "
            "where a.status in ('예약신청','예약확정') "
            "  and (s.slot_date + s.start_time) > now() "
            "  and now() > (s.slot_date + s.start_time) - make_interval(hours => $1)",
            new_hours)

    if conn is not None:
        return int(await query(conn))
    async with acquire_as(str(_auth_user_id(staff))) as c:
        return int(await query(c))
