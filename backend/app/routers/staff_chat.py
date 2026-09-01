from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, get_current_staff
from app.services.chat import ticket_service
from app.services.chat.enqueue import enqueue_after_reply   # staff_send 후 배칭 호출 래퍼

router = APIRouter(prefix="/staff/chat", tags=["staff-chat"])


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
