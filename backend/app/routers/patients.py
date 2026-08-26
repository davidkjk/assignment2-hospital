"""[MASK-*][SEARCH-LOG-*][ROLE-READ] patients 라우터 — 마스킹 목록 · 상세 · 번호 펼치기.

⚠️ 코디 배선 필요: main.py에 `app.include_router(patients.router)` 등록해야 노출된다.
   이 태스크는 main.py를 손대지 않는다(공용 파일).

접근 범위: 목록·상세·번호 펼치기 모두 접수직원·관리자만(patients RLS의
receptionist_admin_can_read_patients와 일치). 의사의 조회 범위는 자기 예약이라
환자 목록 전체 창구는 열지 않는다(ROLE-DOC-02).
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import patient_service

router = APIRouter(prefix="/patients", tags=["patients"])


class FamilyLinkRequest(BaseModel):
    family_patient_id: UUID
    relation: str
    method: str


class FamilyUnlinkRequest(BaseModel):
    reason: str


@router.get("")
async def list_patients(
    q: str | None = None,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> list[dict]:
    """[MASK-SRV-01][SEARCH-LOG-01·03] 마스킹된 목록 + 검색 기록."""
    return await patient_service.search_patients(q, staff)


@router.get("/{patient_id}")
async def get_patient(
    patient_id: UUID,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    """[MASK-DETAIL-01] 상세(전체) + 진입 기록."""
    return await patient_service.get_patient_detail(patient_id, staff)


@router.get("/{patient_id}/contact")
async def reveal_contact(
    patient_id: UUID,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    """[MASK-VIEW-01·02·03] 번호 펼치기 창구(갭 #35) + 열람 기록."""
    return await patient_service.reveal_contact(patient_id, staff)


@router.post("/{patient_id}/family")
async def link_family(
    patient_id: UUID,
    body: FamilyLinkRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    """[R5-01][PTDET-FAMILY-04·05][ROLE-DOC-02] 가족 연결 저장 창구 — 접수·관리자만.

    의사는 이 창구를 열 수 없다(가족 연결은 접수·관리자의 일, 요구사항 3.5·4.2).
    """
    link_id = await patient_service.link_family_member(
        patient_id, body.family_patient_id, body.relation, body.method, staff
    )
    return {"id": link_id}


@router.delete("/{patient_id}/family/{member_id}")
async def unlink_family(
    patient_id: UUID,
    member_id: UUID,
    body: FamilyUnlinkRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    """[R5-02][ROLE-DOC-02] 가족 연결 해제 — 접수·관리자만. 사유·실행자를 남긴다."""
    await patient_service.unlink_family_member(patient_id, member_id, body.reason, staff)
    return {"ok": True}
