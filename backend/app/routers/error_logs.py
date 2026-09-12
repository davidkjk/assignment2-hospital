"""[ERRADM-*] /error-logs — 관리자 전용 시스템 오류 읽기 API(결정 #19·#20).

⭐ 읽기 전용. 화면 계약엔 `safe_summary`(안전 요약)만 내려보낸다 — DB `message`(redaction한
   기술 상세)는 절대 응답에 담지 않는다(결정 #20). notification_log는 읽지 않는다(ERRADM-NOTI-01).

⭐ 페이지: 첫 페이지 200건 + 커서 이어보기(ERRADM-LIST-06). 접근 기록(ALOG-FILTER-06)과 같은
   공용 부품(app.core.pagination.paginate)을 쓴다 — 정렬(occurred_at desc, id desc)·동점 키·
   커서 계약을 화면마다 새로 만들지 않는다. 응답 {rows, next_cursor, total_hint}.
"""
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.core.pagination import paginate
from app.core.security import StaffContext, require_role
from app.db.pool import acquire_as

router = APIRouter(prefix="/error-logs", tags=["error-logs"])

# ERRADM-LIST-05: 정렬은 (occurred_at desc, id desc) 하나로 못박는다 — cursor·기간도 이 키로
# 이어받아 겹치거나 빠지지 않는다(공용 paginate가 마지막에 유일 키 id를 붙인다).
_ORDER = ("occurred_at desc", "id desc")
# ERRADM-FILTER-01·LIST-06: 첫 페이지도 이어보기도 최대 200건.
_PAGE_SIZE = 200


@router.get("")
async def list_error_logs(
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None, alias="to"),
    cursor: str | None = None,                                     # ERRADM-LIST-06 — 200건 이후 이어보기
    staff: StaffContext = Depends(require_role("admin")),          # ERRADM-SHELL-01·02
) -> dict:
    query = ("select id, occurred_at, feature, "
             "coalesce(safe_summary, '시스템 오류가 기록되었습니다.') as summary, "
             "is_service_outage "                                  # ERRADM-NOTI-02 — 서비스 전체 장애 한 줄 구분
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
    query += " order by occurred_at desc, id desc"                # ERRADM-LIST-05 — limit은 paginate가 200으로
    async with acquire_as(str(staff.auth_user_id)) as conn:
        rows = await conn.fetch(query, *params)
    all_rows = [{"id": str(r["id"]), "occurred_at": r["occurred_at"].isoformat(),
                 "feature": r["feature"], "summary": r["summary"],
                 "is_service_outage": r["is_service_outage"]} for r in rows]
    # ERRADM-LIST-06 — 첫 페이지 200건 + 커서. total_hint는 현재 필터 전체 건수.
    page = paginate(all_rows, cursor=cursor, order=_ORDER, page_size=_PAGE_SIZE)
    return {"rows": page.rows, "next_cursor": page.next_cursor, "total_hint": len(all_rows)}
