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
        return await _log_search(staff, search_term)

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


async def _log_search(staff: StaffContext, search_term: str | None) -> None:
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
                "update access_audit_log set search_term = $1, accessed_at = now() where id = $2",
                search_term, last_id,
            )
        else:
            await c.execute(
                "insert into access_audit_log (staff_id, patient_id, resource_type, search_term) "
                "values ($1, null, 'search', $2)",
                staff.id, search_term,
            )
