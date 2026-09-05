"""[Task 21a][MERGE-SHELL-01·02] 중복 환자 병합 라우터 — 둘 다 관리자 전용.

⚠️ 코디 배선 필요: main.py에 `app.include_router(patient_merge.router)` 등록해야 노출된다.
   이 태스크는 라우터 추가만 하고, 되돌리기(undo) 엔드포인트는 만들지 않는다(Task 26).
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import patient_merge_service
from app.services.patient_merge_service import CandidateGroup, MergeResult

router = APIRouter(tags=["patient-merge"])


class MergeIn(BaseModel):
    primary_id: UUID
    duplicate_id: UUID
    expected_counts: dict


@router.get("/admin/merge-candidates", response_model=list[CandidateGroup])
async def merge_candidates(
    staff: StaffContext = Depends(require_role("admin")),
) -> list[CandidateGroup]:
    """[MERGE-LIST-01~03] 관리자만 — 이름·생일·전화가 같은 활성 후보를 마스킹해 돌려준다."""
    return await patient_merge_service.list_merge_candidates(staff)


@router.post("/admin/merge-candidates/merge", response_model=MergeResult)
async def merge(
    body: MergeIn,
    staff: StaffContext = Depends(require_role("admin")),
) -> MergeResult:
    """[MERGE-CONFIRM-04] 읽음 체크는 화면의 이해 확인일 뿐이라 서버는 받지 않는다 — 받으면
    「체크를 보냈으니 통과」가 되어 동시성 재검사(MERGE-RACE-01)를 대신하게 된다."""
    return await patient_merge_service.merge_patients(
        body.primary_id, body.duplicate_id, staff, body.expected_counts)


# ── 병합 이력·되돌림 (Task 26 · MHIST-*) — 셋 다 관리자 전용 ──────────────────────
class UndoIn(BaseModel):
    reason: str
    expected_status: str


@router.get("/admin/merge-history")
async def merge_history(
    cursor: str | None = None,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[MHIST-LIST-01·02] 관리자만 — 병합 이력을 최신순으로, 상태만 붙여(즉시 되돌림 버튼 없음)."""
    page = await patient_merge_service.get_merge_history(staff, cursor=cursor)
    return {"rows": page.rows, "has_more": page.has_more,
            "next_cursor": page.next_cursor, "order": list(page.order)}


@router.get("/admin/merge-history/{merge_event_id}")
async def merge_event_detail(
    merge_event_id: UUID,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[MHIST-DETAIL-02][MHIST-LOCK-01] 한 병합 + 보존 스냅샷 + 되돌림 가능 판정."""
    return await patient_merge_service.get_merge_event(merge_event_id, staff)


@router.post("/admin/merge-history/{merge_event_id}/undo")
async def merge_undo(
    merge_event_id: UUID,
    body: UndoIn,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[MHIST-DONE-01][MERGE-RACE-01] undone_at 하나로 계보 정정 + patient_merge_undo 감사."""
    return await patient_merge_service.undo_merge(
        merge_event_id, body.reason, staff, body.expected_status)
