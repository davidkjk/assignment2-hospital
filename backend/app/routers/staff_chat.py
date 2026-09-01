from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, get_current_staff
from app.services.chat import ticket_service
from app.services.chat.enqueue import enqueue_after_reply   # staff_send 후 배칭 호출 래퍼

router = APIRouter(prefix="/staff/chat", tags=["staff-chat"])

# 상태는 셋뿐이다(§0). 그 밖의 값은 탭으로 번역하지 않고 검증에서 막는다(TICKET-INBOX-EXC-01의 서버 짝).
TicketStatusQ = Literal["pending", "in_progress", "answered"]


@router.get("/tickets")
async def list_tickets(status: TicketStatusQ, staff: StaffContext = Depends(get_current_staff)):
    # 접수순(created_at ASC, id ASC) — idx_tickets_queue. 프론트는 재정렬하지 않는다.
    return await ticket_service.list_inbox_tickets(str(staff.auth_user_id), status)


@router.post("/tickets/{ticket_id}/claim")
async def claim(ticket_id: UUID, staff: StaffContext = Depends(get_current_staff)):
    return await ticket_service.claim_ticket(str(staff.auth_user_id), ticket_id)   # 경쟁 패자=409


class ReplyRequest(BaseModel):
    content: str
    client_message_id: UUID | None = None


@router.post("/tickets/{ticket_id}/messages")
async def reply(ticket_id: UUID, body: ReplyRequest, staff: StaffContext = Depends(get_current_staff)):
    msg = await ticket_service.staff_send_message(
        str(staff.auth_user_id), ticket_id, body.content, body.client_message_id)
    await enqueue_after_reply(msg["id"])   # 보고 있으면 즉시읽음, 아니면 배치(§8-6~8)
    return msg


@router.post("/tickets/{ticket_id}/close")
async def close(ticket_id: UUID, staff: StaffContext = Depends(get_current_staff)):
    return await ticket_service.close_ticket(str(staff.auth_user_id), ticket_id)   # answered=이때만
