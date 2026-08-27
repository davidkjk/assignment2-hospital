"""[Task 22a][QADM-SHELL-01·02] 관리자 문진표 관리 라우터 — 네 창구 모두 관리자 전용.

⛔ PUT·DELETE를 만들지 않는다 — 옛 플랜은 PUT(upsert)·삭제를 뒀으나 결정 12가 그 동작을
   폐기했다(AD-065·066). 창구를 남겨 두면 화면이 안 써도 API가 우회로로 남는다.
⚠️ 코디 배선 필요: main.py에 include_router(questionnaire_admin.router) 등록해야 노출된다.
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import questionnaire_admin_service as svc

router = APIRouter(prefix="/admin/questionnaires", tags=["questionnaire-admin"])


class SaveVersionRequest(BaseModel):
    questions: list[dict]
    base_version_id: UUID | None = None


@router.get("")
async def list_departments(staff: StaffContext = Depends(require_role("admin"))):
    return await svc.list_departments_with_status(staff)


@router.get("/{department_id}")
async def get_form(department_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    return await svc.get_department_form(department_id, staff)


@router.post("/{department_id}/versions", status_code=201)
async def create_version(
    department_id: UUID,
    body: SaveVersionRequest,
    staff: StaffContext = Depends(require_role("admin")),
):
    return await svc.save_version(department_id, body.questions, body.base_version_id, staff)


@router.get("/versions/{version_id}")
async def get_version(version_id: UUID, staff: StaffContext = Depends(require_role("admin"))):
    return await svc.get_version(version_id, staff)
