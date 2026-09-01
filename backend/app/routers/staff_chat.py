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


@router.get("/tickets/{ticket_id}")
async def ticket_detail(ticket_id: UUID, staff: StaffContext = Depends(get_current_staff)):
    # 상세: 요약 5항목 + 전체 대화 + 담당자{name,role} + 연락처 마스킹. 없는·볼 수 없는 티켓=404(딥링크 방어).
    return await ticket_service.get_ticket_detail(str(staff.auth_user_id), ticket_id)


class ReassignRequest(BaseModel):
    to_staff_id: UUID


@router.post("/tickets/{ticket_id}/reassign")
async def reassign(ticket_id: UUID, body: ReassignRequest, staff: StaffContext = Depends(get_current_staff)):
    # assigned_staff_id만 변경·in_progress 유지(REASSIGN-02). 갱신된 상세를 돌려준다.
    return await ticket_service.reassign_ticket(str(staff.auth_user_id), ticket_id, body.to_staff_id)


class MarkReadRequest(BaseModel):
    message_id: UUID


@router.post("/tickets/{ticket_id}/read")
async def mark_read(ticket_id: UUID, body: MarkReadRequest, staff: StaffContext = Depends(get_current_staff)):
    # 직원이 상세를 열어 환자 메시지를 봄 → 읽음 커서 전진(UNREAD-02). 여러 기기는 서버 커서로 정합화.
    await ticket_service.mark_ticket_read(str(staff.auth_user_id), ticket_id, body.message_id)
    return {"ok": True}


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


# 이관 드롭다운의 대상 목록 — /staff/chat 밖의 얇은 직원 디렉터리(REASSIGN-05: 모든 활성 직원).
directory_router = APIRouter(prefix="/staff", tags=["staff-chat"])


@directory_router.get("/active")
async def active_staff(staff: StaffContext = Depends(get_current_staff)):
    return await ticket_service.list_active_staff(str(staff.auth_user_id))
