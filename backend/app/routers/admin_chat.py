from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.core.security import StaffContext, require_role
from app.integrations.embedding_client import get_embedding_client
from app.services.chat import kb_service, answer_feedback_service, quality_service, unresolved_service

router = APIRouter(prefix="/admin/chat", tags=["admin-chat"])


class KbBody(BaseModel):
    # 프론트(api/kbAdmin.ts)는 camelCase로 보낸다 — alias로 받고 내부는 snake_case.
    model_config = ConfigDict(populate_by_name=True)
    title: str
    category: str
    content: str
    is_restricted: Annotated[bool, Field(alias="isRestricted")] = False


# ── 병원 안내자료(KB) 관리 — Task 20 KBADM-* 소비 계약. 관리자만(require_role admin). ──

@router.get("/kb")
async def list_kb(category: str | None = Query(default=None), status: str | None = Query(default=None),
                  staff: StaffContext = Depends(require_role("admin"))):
    return await kb_service.list_documents(category=category, status=status)


@router.post("/kb", status_code=201)
async def create_kb(body: KbBody, staff: StaffContext = Depends(require_role("admin"))):
    # 새 자료는 draft — 저장만으로 공개되지 않는다.
    return await kb_service.create_document(
        title=body.title, category=body.category, content=body.content,
        is_restricted=body.is_restricted, staff_id=staff.id)


@router.get("/kb/{document_id}")
async def get_kb(document_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    return await kb_service.get_document(document_id)


@router.put("/kb/{document_id}", status_code=204)
async def edit_kb(document_id: UUID, body: KbBody, staff: StaffContext = Depends(require_role("admin"))):
    # 저장 = pending(승인된 자료) / 초안 갱신(draft). 라이브 답변은 승인 전까지 그대로(EDITOR-06).
    await kb_service.submit_edit(
        document_id, title=body.title, category=body.category, content=body.content,
        is_restricted=body.is_restricted, staff_id=staff.id)


@router.post("/kb/{document_id}/approve")
async def approve_kb(document_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    # 상태에 맞는 승인(대기 수정본→재승인 / 초안→최초 승인). 재임베딩 실패 시 승인도 롤백(Task 7).
    await kb_service.approve(document_id, get_embedding_client())
    return {"ok": True}


@router.post("/kb/{document_id}/approve-edit")
async def approve_kb_edit(document_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    # pending 수정을 라이브로 승격(이력 저장 + 재임베딩, 한 트랜잭션 G-06). /approve가 포괄하지만 호환용으로 남긴다.
    await kb_service.approve_pending_edit(document_id, get_embedding_client())
    return {"ok": True}


@router.post("/kb/{document_id}/reject", status_code=204)
async def reject_kb_edit(document_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    await kb_service.reject_pending_edit(document_id)


@router.post("/kb/{document_id}/archive", status_code=204)
async def archive_kb(document_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    await kb_service.archive_document(document_id)


@router.get("/kb/{document_id}/revisions")
async def kb_revisions(document_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    return await kb_service.list_revisions(document_id)


# ── 오답 신고·품질(Task 8) ──

@router.post("/feedback/{feedback_id}/apply")
async def apply_feedback(feedback_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    # 예시은행 축적 + (KB 대상이면) submit_edit 경유. 즉시 라이브 아님(B3).
    await answer_feedback_service.apply(feedback_id, staff.id, get_embedding_client())
    return {"ok": True}


@router.post("/feedback/{feedback_id}/reject")
async def reject_feedback(feedback_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    await answer_feedback_service.reject(feedback_id, staff.id)
    return {"ok": True}


class CorrectionBody(BaseModel):
    correction_text: str


# ── 오답 처리함(BADINBOX-REVIEW) · 미해결(UNRES-CLUSTER) · 품질(QUALITY-REPORT) · 참고 예시(QAEX-LIST) — Task 21 ──

@router.get("/feedback")
async def feedback_list(status: str = Query(default="pending"), staff: StaffContext = Depends(require_role("admin"))):
    return await answer_feedback_service.list_feedback(status)


@router.get("/feedback/{feedback_id}")
async def feedback_get(feedback_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    return await answer_feedback_service.get_feedback(feedback_id)


@router.get("/unresolved")
async def unresolved_list(from_: str | None = Query(default=None, alias="from"), to: str | None = Query(default=None),
                          staff: StaffContext = Depends(require_role("admin"))):
    # 유사도 묶음 — 확정 분류 아님(화면이 한계 안내), 임베딩 누락은 embedding_gap으로(UNRES-CLUSTER-11).
    return await unresolved_service.list_clusters(from_, to)


@router.get("/unresolved/{cluster_id}")
async def unresolved_get(cluster_id: str, from_: str | None = Query(default=None, alias="from"),
                         to: str | None = Query(default=None), staff: StaffContext = Depends(require_role("admin"))):
    return await unresolved_service.get_cluster(cluster_id, from_, to)


@router.get("/quality")
async def quality_list(from_: str | None = Query(default=None, alias="from"), to: str | None = Query(default=None),
                       page: int = Query(default=1, ge=1), staff: StaffContext = Depends(require_role("admin"))):
    # 미검토 우선 정렬(SD-08) 20건/쪽. "문제없음"과 "아직 안 봄"을 review_status로 구분.
    return {"items": await quality_service.list_sessions(from_, to, page)}


@router.get("/quality/{session_id}")
async def quality_get(session_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    return await quality_service.get_session(session_id)


@router.post("/quality/{session_id}/correct")
async def quality_correct(session_id: UUID, body: CorrectionBody, staff: StaffContext = Depends(require_role("admin"))):
    # source=quality_review로 오답 처리함 등록 — 교정만으로 즉시 반영하지 않는다(B3).
    return await quality_service.correct(session_id, staff.id, body.correction_text)


@router.post("/quality/{session_id}/ok", status_code=204)
async def quality_ok(session_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    await quality_service.mark_reviewed(session_id, staff.id, status="ok")


@router.get("/examples")
async def examples_list(active: bool = Query(default=True), staff: StaffContext = Depends(require_role("admin"))):
    return await answer_feedback_service.list_examples(active)


@router.post("/examples/{example_id}/deactivate", status_code=204)
async def examples_deactivate(example_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    await answer_feedback_service.deactivate_example(example_id)
