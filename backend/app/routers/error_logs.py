"""[ERRADM-*] /error-logs — 관리자 전용 시스템 오류 읽기 API(결정 #19·#20).

⭐ 읽기 전용. 화면 계약엔 `safe_summary`(안전 요약)만 내려보낸다 — DB `message`(redaction한
   기술 상세)는 절대 응답에 담지 않는다(결정 #20). notification_log는 읽지 않는다(ERRADM-NOTI-01).
"""
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.core.security import StaffContext, require_role
from app.db.pool import acquire_as

router = APIRouter(prefix="/error-logs", tags=["error-logs"])


@router.get("")
async def list_error_logs(
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None, alias="to"),
    staff: StaffContext = Depends(require_role("admin")),          # ERRADM-SHELL-01·02
) -> list[dict]:
    query = ("select id, occurred_at, feature, "
             "coalesce(safe_summary, '시스템 오류가 기록되었습니다.') as summary "
             "from system_error_log")                             # message(기술 상세)는 안 내보낸다
    conditions: list[str] = []
    params: list[object] = []
    if from_ is not None:
        params.append(from_)
        conditions.append(f"occurred_at >= ${len(params)}")
    if to is not None:                                            # ERRADM-FILTER-02 — 종료일 그날 끝까지
        params.append(to)
        conditions.append(f"occurred_at < ${len(params)}::date + interval '1 day'")
    if conditions:
        query += " where " + " and ".join(conditions)
    query += " order by occurred_at desc, id desc limit 200"      # ERRADM-LIST-05·06
    async with acquire_as(str(staff.auth_user_id)) as conn:
        rows = await conn.fetch(query, *params)
    return [{"id": str(r["id"]), "occurred_at": r["occurred_at"].isoformat(),
             "feature": r["feature"], "summary": r["summary"]} for r in rows]
