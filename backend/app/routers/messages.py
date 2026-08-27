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


def _page_dto(page) -> dict:
    return {"rows": page.rows, "has_more": page.has_more,
            "next_cursor": page.next_cursor, "order": list(page.order)}


def _result_dto(res) -> dict:
    return {"target_count": res.target_count, "sms_count": res.sms_count,
            "marketing_excluded": res.marketing_excluded,
            "notification_ids": res.notification_ids, "scheduled_id": res.scheduled_id,
            "night_blocked": res.night_blocked, "suggested_at": res.suggested_at}


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
