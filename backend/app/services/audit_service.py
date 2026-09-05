from datetime import date
from uuid import UUID

from app.core.security import StaffContext
from app.db.pool import acquire_as, get_pool

# SEARCH-LOG-04: 같은 직원이 이 시간 안에 이어 친 검색은 한 줄로 묶는다.
_SEARCH_COALESCE_SECONDS = 30


async def log_access(
    patient_id: UUID | None,
    resource_type: str,
    staff: StaffContext,
    *,
    search_term: str | None = None,
    result_count: int | None = None,
    fragment_count: int | None = None,
    conn=None,
) -> None:
    """[SEARCH-LOG-*][MASK-VIEW-02] 접근을 남긴다 — 사건마다 남기는 것이 다르다.

    - 검색(`search`)은 환자 1명이 아니다 → patient_id 없이 search_term을 남기고,
      30초 안에 이어 친 검색은 새 행을 만들지 않고 마지막 검색어로 갱신한다(SEARCH-LOG-04·05).
    - 열람(`patient_detail`·`phone_reveal`)은 그 반대 → patient_id를 남긴다. 열람은
      호출자의 트랜잭션에 함께 묶여야 하므로(MASK-VIEW-02) `conn`을 그대로 받아 쓴다.

    ⚠️ 검색은 `conn`을 무시하고 서비스역할 풀로 쓴다 — 30초 묶기의 SELECT+UPDATE가
       필요한데, 00004는 access_audit_log에 authenticated의 UPDATE를 grant하지 않고
       SELECT도 admin에게만 연다. 감사 로그는 시스템 무결성 기록이고 staff_id는 검증된
       세션값(staff.id)만 넣으므로 위조 위험 없이 RLS를 우회한다.
    """
    if resource_type == "search":
        return await _log_search(staff, search_term, result_count, fragment_count)

    async def _run(c) -> None:
        await c.execute(
            "insert into access_audit_log (staff_id, patient_id, resource_type, search_term) "
            "values ($1, $2, $3, $4)",
            staff.id, patient_id, resource_type, search_term,
        )

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


def _as_date(value):
    """from/to 쿼리는 '2026-09-01' 또는 ''(무제한)로 온다 — 빈 값은 null(무제한)로."""
    if value is None or value == "":
        return None
    if isinstance(value, str):
        return date.fromisoformat(value)
    return value


async def _log_stats(
    staff: StaffContext, resource_type: str, *,
    metric: str | None, period_from, period_to,
    target_count: int | None, csv_rows: int | None, suppressed: bool | None,
    conn=None,
) -> None:
    """[STAT-AUDIT-02][ALOG-LIST-13] 통계 감사 — 환자 없는 관리자 활동 행.

    특정 환자를 겨냥한 열람이 아니라 「관리자가 상세 목록을 열었다/CSV를 만들었다」는 사실이므로
    patient_id는 null이다(00034가 nullable + 종류를 열어 뒀다). 담는 것은 비개인정보뿐 —
    지표·기간·대상 건수·CSV 행 수·억제 여부(00091). 환자명·전화·생년월일·검색어(원문)는 넣지 않는다.
    """
    async def _run(c) -> None:
        await c.execute(
            "insert into access_audit_log "
            "(staff_id, patient_id, resource_type, stats_metric, stats_period_from, "
            " stats_period_to, stats_target_count, stats_csv_rows, stats_suppressed) "
            "values ($1, null, $2, $3, $4, $5, $6, $7, $8)",
            staff.id, resource_type, metric, _as_date(period_from), _as_date(period_to),
            target_count, csv_rows, suppressed,
        )

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def log_stats_drilldown(
    staff: StaffContext, *, metric: str | None = None,
    period_from=None, period_to=None, target_count: int | None = None, conn=None,
) -> None:
    """[STAT-AUDIT-02][결정22] 통계 드릴다운(상세 목록 열기) 감사 행."""
    await _log_stats(
        staff, "stats_drilldown", metric=metric, period_from=period_from,
        period_to=period_to, target_count=target_count, csv_rows=None,
        suppressed=None, conn=conn,
    )


async def log_stats_export(
    staff: StaffContext, *, metric: str | None = None,
    period_from=None, period_to=None, target_count: int | None = None,
    rows: int | None = None, suppressed: bool | None = None, conn=None,
) -> None:
    """[STAT-AUDIT-02][ALOG-LIST-13][결정22] 통계 CSV 내보내기 감사 — 행 수·k=5 억제까지."""
    await _log_stats(
        staff, "stats_export", metric=metric, period_from=period_from,
        period_to=period_to, target_count=target_count, csv_rows=rows,
        suppressed=suppressed, conn=conn,
    )


async def _log_search(
    staff: StaffContext, search_term: str | None,
    result_count: int | None = None, fragment_count: int | None = None,
) -> None:
    # [SEARCH-LOG-04·06] 30초 안에 이어 친 검색은 마지막 하나로 묶는다 — 건수·조각 수도 그
    #   마지막(가장 좁혀진) 검색 기준으로 갱신한다. 넓은 검색 판정(SEARCH-LOG-06)의 근거다.
    pool = await get_pool()
    async with pool.acquire() as c, c.transaction():
        last_id = await c.fetchval(
            "select id from access_audit_log "
            "where staff_id = $1 and resource_type = 'search' "
            f"  and accessed_at > now() - interval '{_SEARCH_COALESCE_SECONDS} seconds' "
            "order by accessed_at desc limit 1",
            staff.id,
        )
        if last_id is not None:
            await c.execute(
                "update access_audit_log set search_term = $1, result_count = $2, "
                "fragment_count = $3, accessed_at = now() where id = $4",
                search_term, result_count, fragment_count, last_id,
            )
        else:
            await c.execute(
                "insert into access_audit_log "
                "(staff_id, patient_id, resource_type, search_term, result_count, fragment_count) "
                "values ($1, null, 'search', $2, $3, $4)",
                staff.id, search_term, result_count, fragment_count,
            )
