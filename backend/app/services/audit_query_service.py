"""[ALOG-*][MASK-SRV-01] /admin/access-logs 조회 — 「누가 어떤 환자 정보를 언제 열었나」.

⭐ 이 화면은 마스킹의 반쪽이다 — 검색·번호 열람·통계 드릴다운을 막지 않는 대신 여기로 흘려보내
   흔적을 남긴다(SEARCH-LOG-01). 그래서 읽기 전용이고, 화면 자체는 감사 대상이 아니다(결정3):
   조회는 access_audit_log에 아무 행도 만들지 않는다.

⚠️ 마스킹은 서버에서 한다(MASK-SRV-01) — patient_row_dto 화이트리스트만 통과시켜 원본
   name·phone·birth_date는 응답에 아예 담기지 않는다. 화면에서만 가리면 개발자 도구로 샌다.

⚠️ 대량 열람(ALOG-GROUP-01)은 저장을 줄이지 않는다 — 서버는 환자별 전수를 그대로 보내고,
   같은 직원·시각·행동의 연속 행을 한 줄로 접는 것은 표시층(프론트)이 한다. 여기서 묶어 보내면
   [개별 기록 보기]가 다른 계약으로 다시 조회해야 한다.
"""
from datetime import date, datetime

from app.core.dto import patient_row_dto
from app.core.errors import AppError
from app.core.pagination import paginate
from app.core.security import StaffContext
from app.db.pool import acquire_as

# ALOG-LIST-08: 정렬은 (accessed_at desc, id desc) 하나로 못박는다 — cursor·기간도 이 키를
# 그대로 쓴다(SEARCH-ORDER-05). 하나만 달라도 다음 페이지가 겹치거나 빠진다.
_ORDER = ("accessed_at desc", "id desc")
# ALOG-FILTER-01·LIST-09: 첫 페이지도 이어보기도 최대 200건(환자 하위 이력의 20건과 다르다).
_PAGE_SIZE = 200


async def list_access_logs(
    staff: StaffContext,
    *,
    patient_id=None,
    date_from: date | datetime | None = None,
    date_to: date | datetime | None = None,
    cursor: str | None = None,
    conn=None,
) -> dict:
    """[ALOG-SHELL-01][ALOG-FILTER-*][ALOG-LIST-*] 관리자만, 마스킹된 채로, 최신 200건.

    date_from은 포함·date_to는 제외다(ALOG-FILTER-07) — 경계가 겹치면 월별 점검에서 같은
    행이 두 달에 잡힌다. 반환은 {rows, next_cursor, total_hint}이고 total_hint는 현재 필터에
    걸린 전체 건수다(전체 N건 중 이 환자 M건의 M — 「전체」는 필터 없는 조회가 준다).
    """
    if staff.role != "admin":
        # ALOG-SHELL-01·02: 메뉴 노출로 권한을 대신하지 않는다 — 서버가 거절한다.
        # RLS는 비관리자에게 조용히 0건을 줄 뿐이라, 열람 감사에서는 명시적으로 막는다.
        raise AppError("이 기능에 대한 권한이 없습니다.", status_code=403)

    async def _run(c):
        return await c.fetch(
            """
            select l.id, l.accessed_at, l.resource_type, l.search_term,
                   l.patient_id, s.name as staff_name,
                   p.name as patient_name, p.phone as patient_phone,
                   p.birth_date as patient_birth_date
            from access_audit_log l
            left join staff s on s.id = l.staff_id
            left join patients p on p.id = l.patient_id
            where ($1::uuid is null or l.patient_id = $1)
              and ($2::timestamptz is null or l.accessed_at >= $2)
              and ($3::timestamptz is null or l.accessed_at < $3)
            order by l.accessed_at desc, l.id desc
            """,
            patient_id, date_from, date_to,
        )

    if conn is not None:
        fetched = await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            fetched = await _run(c)

    rows = [_to_row(r) for r in fetched]
    page = paginate(rows, cursor=cursor, order=_ORDER, page_size=_PAGE_SIZE)
    return {"rows": page.rows, "next_cursor": page.next_cursor, "total_hint": len(rows)}


def _to_row(r) -> dict:
    """[ALOG-LIST-04][MASK-SRV-01] 한 열람 행 — 환자를 겨냥한 사건만 마스킹 식별자를 붙인다.

    ⭐ resource_type은 raw 문자열 그대로 보낸다 — 모르는 미래 값의 라벨링(ALOG-LIST-07)·
       종류별 배지는 표시층이 한다. 서버는 종류를 좁히지 않는다.
    ⚠️ 검색·통계 사건은 환자 1명이 아니므로 patient=None이다(SEARCH-LOG-02·STAT-AUDIT-02).
       staff_name은 raw로 보내고 「직원 정보 없음」 대체 표기도 표시층이 한다(ALOG-LIST-03).
    """
    patient = None
    if r["patient_id"] is not None:
        patient = patient_row_dto(
            patient_id=r["patient_id"],
            name=r["patient_name"],
            phone=r["patient_phone"],
            birth_date=r["patient_birth_date"],
        )
    return {
        "id": r["id"],
        "accessed_at": r["accessed_at"],
        "resource_type": r["resource_type"],
        "search_term": r["search_term"],
        "staff_name": r["staff_name"],
        "patient": patient,
    }
