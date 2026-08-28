"""[Task 28][SEND-*][MSGX-*] /messages 발송 만들기 라우터 — 접수직원·관리자만.

⚠️ 코디 배선 필요: main.py에 `app.include_router(messages.router)`를 등록해야 노출된다.
   이 태스크는 만들기(enqueue)·목록·예약 취소까지다 — 실제 배달·결과·재시도는 Task 30.
"""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

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


class StatusCallbackIn(BaseModel):
    """[SEND-RESULT-02] 업체(Twilio 등) 상태 되알림. 서명검증(실제 값)은 배포 env."""
    provider_message_id: str
    status: str                       # 'delivered' | 'failed'
    failure_code: str | None = None


def _page_dto(page) -> dict:
    return {"rows": page.rows, "has_more": page.has_more,
            "next_cursor": page.next_cursor, "order": list(page.order)}


def _result_dto(res) -> dict:
    return {"target_count": res.target_count, "sms_count": res.sms_count,
            "marketing_excluded": res.marketing_excluded,
            "notification_ids": res.notification_ids, "scheduled_id": res.scheduled_id,
            "night_blocked": res.night_blocked, "suggested_at": res.suggested_at}


@router.post("/messages/status-callback")
async def status_callback(body: StatusCallbackIn) -> dict:
    """[SEND-RESULT-02] 업체 status callback 수신 — 인증 없음(제공자 호출). 서명검증 자리=배포.

    provider_message_id로 줄을 찾아 도달/실패·재시도·죽은번호 처리를 굴린다. 모르는 값은 무시.
    """
    return await message_service.handle_status_callback(
        provider_message_id=body.provider_message_id, status=body.status,
        failure_code=body.failure_code)


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
