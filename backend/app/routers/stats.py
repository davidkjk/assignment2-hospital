"""[STAT-*][ROLE-ADM-03] 통계 라우터 — 관리자만. 집계·드릴다운·CSV 감사.

⚠️ 코디 배선 필요: main.py에 `app.include_router(stats.router)` 등록해야 노출된다.

⭐ 통계는 관리자만 부를 수 있다(ROLE-ADM-03) — 화면만 막으면 API가 우회로가 된다.
"""
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import stats_service

router = APIRouter(tags=["stats"])


class StatsExportIn(BaseModel):
    metric: str
    row_count: int
    suppressed: bool


@router.get("/stats")
async def stats(
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    by: str | None = None,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    return await stats_service.get_stats(from_date, to_date, staff, by=by)


@router.get("/stats/detail")
async def stats_detail(
    metric: str,
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    cursor: str | None = None,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    page = await stats_service.get_stats_detail(metric, from_date, to_date, staff, cursor=cursor)
    return {"rows": page.rows, "next_cursor": page.next_cursor, "has_more": page.has_more}


@router.post("/audit/stats")
async def audit_stats_export(
    body: StatsExportIn,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    await stats_service.log_stats_export(
        staff, metric=body.metric, rows=body.row_count, suppressed=body.suppressed
    )
    return {"ok": True}
