"""[Task 28][SEND-*][MSGX-*] /messages 발송 만들기 라우터 — 접수직원·관리자만.

⚠️ 코디 배선 필요: main.py에 `app.include_router(messages.router)`를 등록해야 노출된다.
   이 태스크는 만들기(enqueue)·목록·예약 취소까지다 — 실제 배달·결과·재시도는 Task 30.
"""
import hmac
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import StaffContext, require_role
from app.services import message_service

router = APIRouter(tags=["messages"])

_ROLES = ("receptionist", "admin")  # SEND-DOOR-07 — 의사 없음


class SendIn(BaseModel):
    kind: str
    recipients_spec: dict
    channel: str
    body: str
    scheduled_at: datetime | None = None


# [SEND-RESULT-02] SOLAPI 리포트 성공 코드 — 수신완료.
_SOLAPI_DELIVERED_CODE = "4000"


def _extract_reports(payload) -> list[dict]:
    """SOLAPI 웹훅 본문에서 리포트 목록을 꺼낸다 — 실측 형식 3가지 모두 수용.

    ⭐ 실측(SOLAPI 콘솔 Request Data): 본문이 **{"data": [ {messageId, statusCode, …} ]}** 래퍼다.
    방어적으로 맨 배열([...])·단일 객체({...})도 받는다(알 수 없는 모양은 빈 목록 → 무시).
    필드명은 SOLAPI 그대로: messageId(=발송 시 저장한 provider_message_id), statusCode
    ("4000"=수신완료=도달, 그 외 종결코드=실패).
    """
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [r for r in data if isinstance(r, dict)]
        if isinstance(data, dict):
            return [data]
        if "messageId" in payload:
            return [payload]
        return []
    if isinstance(payload, list):
        return [r for r in payload if isinstance(r, dict)]
    return []


def _page_dto(page) -> dict:
    return {"rows": page.rows, "has_more": page.has_more,
            "next_cursor": page.next_cursor, "order": list(page.order)}


def _result_dto(res) -> dict:
    return {"target_count": res.target_count, "sms_count": res.sms_count,
            "marketing_excluded": res.marketing_excluded,
            "notification_ids": res.notification_ids, "scheduled_id": res.scheduled_id,
            "night_blocked": res.night_blocked, "suggested_at": res.suggested_at}


@router.post("/messages/status-callback")
async def status_callback(request: Request, token: str | None = None,
                          debug: str | None = None) -> dict:
    """[SEND-RESULT-02][보안 F-03] SOLAPI 웹훅 수신 — 리포트 + URL 토큰 인증.

    SOLAPI 웹훅은 커스텀 헤더가 아니라 **등록 URL에 심은 토큰**(`?token=`)으로 인증한다.
    제공자만 아는 토큰을 상수시간 비교해 위조 콜백을 막는다(시크릿 미설정 시 fail-closed).
    검증 실패·모르는 콜백 모두 같은 응답({"status":"ok"})을 돌려준다(ID oracle 제거).

    본문은 SOLAPI 실측 형식 **{"data": [ {messageId, statusCode, …} ]}**(래퍼)이며,
    `_extract_reports`가 래퍼·맨 배열·단일 객체를 모두 받아 리포트 목록을 뽑는다. 각 건의
    statusCode를 도달/실패로 매핑해 messageId(=발송 시 저장한 provider_message_id)로 줄을
    찾아 상태를 굴린다.
    ⚠️ 4000 외 코드의 정확한 성공/실패 구분은 실발송 1건으로 최종 확정 대상(보수적으로 실패 처리).
    """
    secret = settings.solapi_webhook_secret
    authed = bool(secret) and token is not None and hmac.compare_digest(token, secret)
    if not authed:
        # TEMP DIAG(revert 예정): 값은 노출 안 함(bool만) — 서버가 시크릿을 읽고 있나/토큰이 왔나만.
        if debug == "1":
            return {"status": "ok", "_diag": {
                "secret_set": bool(secret), "token_seen": token is not None, "authed": False}}
        return {"status": "ok"}
    try:
        payload = await request.json()
    except Exception:
        return {"status": "ok"}  # 본문이 JSON이 아니면 조용히 무시(막다른 길 없음)
    diag_rows = []
    for r in _extract_reports(payload):
        mid = r.get("messageId")
        if not mid:
            continue
        code = str(r.get("statusCode", ""))
        if code == _SOLAPI_DELIVERED_CODE:
            await message_service.handle_status_callback(
                provider_message_id=mid, status="delivered")
        else:
            await message_service.handle_status_callback(
                provider_message_id=mid, status="failed", failure_code=code)
        if debug == "1":
            from app.db.pool import get_pool
            _pool = await get_pool()
            async with _pool.acquire() as _c:
                st = await _c.fetchval(
                    "select delivery_status from notification_log where provider_message_id=$1", mid)
            diag_rows.append({"mid_tail": mid[-6:], "code": code, "status_after": st})
    if debug == "1":
        return {"status": "ok", "_diag": {"authed": True, "rows": diag_rows}}
    return {"status": "ok"}


@router.get("/messages/badge-count")
async def badge_count(
    staff: StaffContext = Depends(require_role(*_ROLES)),
) -> dict:
    """[SEND-BADGE-01] 사이드바 숫자 — 전화해야 할 미처리 실패 건수."""
    return {"count": await message_service.badge_count(staff)}


@router.get("/messages/{batch_id}/failed")
async def failed_list(
    batch_id: UUID,
    staff: StaffContext = Depends(require_role(*_ROLES)),
) -> dict:
    """[SEND-FAIL-02·06·07] 안 닿은 명단 — '지금 전화'·'번호 고쳐야 함' 두 무리."""
    return await message_service.failed_list(staff, batch_id)


@router.post("/messages/{notification_id}/mark-handled")
async def mark_handled(
    notification_id: UUID,
    staff: StaffContext = Depends(require_role(*_ROLES)),
) -> dict:
    """[SEND-BADGE-06] 처리 표시로 배지를 줄인다."""
    return await message_service.mark_handled(staff, notification_id)


@router.get("/messages")
async def list_messages(
    cursor: str | None = None,
    staff: StaffContext = Depends(require_role(*_ROLES)),
) -> dict:
    """[SEND-DOOR-02][SEND-LIST-01·08] 예약해 둔 것·보낸 것 두 구역 + 자동 발송 건수."""
    out = await message_service.list_messages(staff, cursor=cursor)
    return {"scheduled": out["scheduled"], "sent": _page_dto(out["sent"]),
            "auto_count": out["auto_count"]}


@router.post("/messages")
async def send_message(
    body: SendIn,
    staff: StaffContext = Depends(require_role(*_ROLES)),
) -> dict:
    """[SEND-BOX-*][SEND-NIGHT-02] 발송을 큐에 넣는다. 야간 광고 차단이면 200 + 제안 시각."""
    res = await message_service.enqueue_send(
        staff, kind=body.kind, recipients_spec=body.recipients_spec,
        channel=body.channel, body=body.body, scheduled_at=body.scheduled_at)
    return _result_dto(res)


@router.delete("/messages/scheduled/{scheduled_id}")
async def cancel_scheduled(
    scheduled_id: UUID,
    staff: StaffContext = Depends(require_role(*_ROLES)),
) -> dict:
    """[MSGX-SCHED-02][SEND-LATER-05] pending 예약만 취소, 취소자·시각 기록."""
    return await message_service.cancel_scheduled(staff, scheduled_id, expected_status="pending")
