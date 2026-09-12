"""[ALOG-*][ROLE-ADM-03] 열람 감사 라우터 — 관리자만. GET /admin/access-logs.

⚠️ 코디 배선 필요: main.py에 `app.include_router(audit_logs.router)` 등록해야 노출된다.

⭐ 관리자만 부를 수 있다(ALOG-SHELL-01) — 화면만 막으면 API가 우회로가 된다. require_role이
   라우터에서 거절하고, 서비스도 방어적으로 한 번 더 막는다(열람 감사는 우회로에 민감하다).
⚠️ 이 조회 자체는 감사 행을 만들지 않는다(결정3) — 읽기 전용 화면이라 흔적을 남기지 않는다.
"""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.security import StaffContext, require_role
from app.services import audit_query_service

router = APIRouter(tags=["access-logs"])


@router.get("/admin/access-logs")
async def access_logs(
    patient_id: UUID | None = None,
    date_from: datetime | None = Query(None, alias="from"),
    date_to: datetime | None = Query(None, alias="to"),
    cursor: str | None = None,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    """[ALOG-FILTER-*] 최신 200건 + 환자·기간 필터 + cursor 이어보기.

    from 포함·to 제외(ALOG-FILTER-07). URL에는 patient_id만 남기고 이름·전화 원문은 넣지
    않는다(ALOG-FILTER-04) — 프론트가 그 규칙을 지킨다. 응답 {rows, next_cursor, total_hint}.
    """
    return await audit_query_service.list_access_logs(
        staff,
        patient_id=patient_id,
        date_from=date_from,
        date_to=date_to,
        cursor=cursor,
    )
