"""[Task 28][SEND-*][MSGX-*] /messages 발송 만들기 라우터 — 접수직원·관리자만.

⚠️ 코디 배선 필요: main.py에 `app.include_router(messages.router)`를 등록해야 노출된다.
   이 태스크는 만들기(enqueue)·목록·예약 취소까지다 — 실제 배달·결과·재시도는 Task 30.
"""
import hmac
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
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


class SolapiReport(BaseModel):
    """[SEND-RESULT-02] SOLAPI 웹훅 리포트 한 건. 웹훅 본문은 이 객체의 배열이다.

    SOLAPI 실제 필드명 그대로: messageId(발송 시 저장한 provider_message_id), statusCode
    (`"4000"`=수신완료=도달, 그 외 종결 코드=실패). 나머지 필드(groupId·dateReported 등)는
    받되 쓰지 않는다(추가 필드 무시).
    """
    model_config = {"extra": "ignore"}
    messageId: str
    statusCode: str
    statusMessage: str | None = None


# [SEND-RESULT-02] SOLAPI 리포트 성공 코드 — 수신완료.
_SOLAPI_DELIVERED_CODE = "4000"


def _page_dto(page) -> dict:
    return {"rows": page.rows, "has_more": page.has_more,
            "next_cursor": page.next_cursor, "order": list(page.order)}


def _result_dto(res) -> dict:
    return {"target_count": res.target_count, "sms_count": res.sms_count,
            "marketing_excluded": res.marketing_excluded,
            "notification_ids": res.notification_ids, "scheduled_id": res.scheduled_id,
            "night_blocked": res.night_blocked, "suggested_at": res.suggested_at}


@router.post("/messages/status-callback")
async def status_callback(
    reports: list[SolapiReport],
    token: str | None = None,
) -> dict:
    """[SEND-RESULT-02][보안 F-03] SOLAPI 웹훅 수신 — 리포트 배열 + URL 토큰 인증.

    SOLAPI 웹훅은 커스텀 헤더가 아니라 **등록 URL에 심은 토큰**(`?token=`)으로 인증한다.
    제공자만 아는 토큰을 상수시간 비교해 위조 콜백을 막는다(시크릿 미설정 시 fail-closed).
    검증 실패·모르는 콜백 모두 같은 응답({"status":"ok"})을 돌려준다(ID oracle 제거).

    본문은 리포트 객체 **배열**이며, 각 건의 statusCode를 도달/실패로 매핑해 messageId
    (=발송 시 저장한 provider_message_id)로 줄을 찾아 상태를 굴린다.
    ⚠️ 4000 외 코드의 정확한 성공/실패 구분은 실발송 1건으로 최종 확정 대상(보수적으로 실패 처리).
    """
    secret = settings.solapi_webhook_secret
    if not secret or token is None or not hmac.compare_digest(token, secret):
        return {"status": "ok"}
    for r in reports:
        if r.statusCode == _SOLAPI_DELIVERED_CODE:
            await message_service.handle_status_callback(
                provider_message_id=r.messageId, status="delivered")
        else:
            await message_service.handle_status_callback(
                provider_message_id=r.messageId, status="failed", failure_code=r.statusCode)
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
