from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.security import StaffContext, get_current_staff
from app.services.chat import ticket_service
from app.services.chat import chat_log_service
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


# ── 상담봇 기록 (/chatlog, 관리자 전용) — CHATLOG-LIST. RLS(00079)가 관리자 전수 열람을 연다. ──
# 앱·웹 대화를 한 목록에(SCOPE-01). channel(app/web)·route_taken(5값)로 필터. 계약 밖 값은 화면이 EXC로 표시.
@router.get("/logs")
async def list_logs(
    channel: str | None = None,
    route_taken: str | None = None,
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
    staff: StaffContext = Depends(get_current_staff),
):
    return await chat_log_service.list_logs(str(staff.auth_user_id), channel, route_taken, date_from, date_to)


# 갈래별 개수(필터칩 배지) — 채널·기간에만 걸린다. /logs/{thread_id}보다 먼저 선언해야 'counts'가 thread로 안 잡힌다.
@router.get("/logs/counts")
async def log_counts(
    channel: str | None = None,
    date_from: str | None = Query(None, alias="from"),
    date_to: str | None = Query(None, alias="to"),
    staff: StaffContext = Depends(get_current_staff),
):
    return await chat_log_service.log_counts(str(staff.auth_user_id), channel, date_from, date_to)


@router.get("/logs/{thread_id}")
async def log_conversation(thread_id: UUID, staff: StaffContext = Depends(get_current_staff)):
    # 상세 대화 원문(DETAIL-01) — 직원 콘솔 말풍선이 그대로 소비. sender bot→ai.
    return await chat_log_service.thread_conversation(str(staff.auth_user_id), thread_id)


@router.get("/messages/{message_id}/sources")
async def message_sources(message_id: UUID, staff: StaffContext = Depends(get_current_staff)):
    # 봇 답변 근거 스냅샷(SOURCE-*). 없으면 빈 배열('근거 자료 없음'은 화면이 표시).
    return await chat_log_service.list_message_sources(str(staff.auth_user_id), message_id)


# 이관 드롭다운의 대상 목록 · 환자 범위 상담 티켓 — /staff/chat 밖의 얇은 직원 디렉터리.
directory_router = APIRouter(prefix="/staff", tags=["staff-chat"])


@directory_router.get("/active")
async def active_staff(staff: StaffContext = Depends(get_current_staff)):
    return await ticket_service.list_active_staff(str(staff.auth_user_id))


@directory_router.get("/patients/{patient_id}/support-tickets")
async def patient_support_tickets(patient_id: UUID, staff: StaffContext = Depends(get_current_staff)):
    # 환자상세 상담 섹션(PTSUP-SECT) — 그 환자에게 넘어온 상담만, 최신순+id 동점키(PTDET-SUPPORT-03).
    return await ticket_service.list_patient_support_tickets(str(staff.auth_user_id), patient_id)
