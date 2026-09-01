from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.security import StaffContext, require_role
from app.integrations.embedding_client import get_embedding_client
from app.services.chat import kb_service, answer_feedback_service, quality_service

router = APIRouter(prefix="/admin/chat", tags=["admin-chat"])


@router.post("/kb/{document_id}/approve")
async def approve_kb(document_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    # draft → approved(청킹+임베딩). 재임베딩 실패 시 승인도 롤백(Task 7).
    await kb_service.approve_document(document_id, get_embedding_client())
    return {"ok": True}


@router.post("/kb/{document_id}/approve-edit")
async def approve_kb_edit(document_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    # pending 수정을 라이브로 승격(이력 저장 + 재임베딩, 한 트랜잭션 G-06).
    await kb_service.approve_pending_edit(document_id, get_embedding_client())
    return {"ok": True}


@router.post("/feedback/{feedback_id}/apply")
async def apply_feedback(feedback_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    # 예시은행 축적 + (KB 대상이면) submit_edit 경유. 즉시 라이브 아님(B3).
    await answer_feedback_service.apply(feedback_id, staff.id, get_embedding_client())
    return {"ok": True}


@router.post("/feedback/{feedback_id}/reject")
async def reject_feedback(feedback_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    await answer_feedback_service.reject(feedback_id, staff.id)
    return {"ok": True}


@router.get("/quality")
async def quality_list(staff: StaffContext = Depends(require_role("admin"))):
    # 미검토 우선 정렬(SD-08). "문제없음"과 "아직 안 봄"을 review_status로 구분.
    return await quality_service.list_sessions_unreviewed_first()
