from datetime import date
from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.core.pagination import Page, paginate
from app.core.security import StaffContext
from app.db.pool import acquire_as
from app.services import audit_service

# [SEARCH-MATCH-03] 조각 안의 하이픈·점·공백을 지우고 숫자를 비교한다(형태 자유).
_FRAGMENT_SEPARATORS = str.maketrans("", "", "-. ")

# [SEARCH-ORDER-01·06][SEARCH-ACT-*] 오늘 예약의 원본 상태 → 검색 줄이 아는 오늘 상태.
#   booked=예약 있음·미도착(ACT-02) / arrived=대기·진료 중(ACT-03) / done=진료완료(ACT-04).
#   취소·부도는 「오늘 아무것도 없음」(ACT-05)으로 보므로 애초에 조회에서 뺀다.
_TODAY_STATUS = {
    "예약신청": "booked",
    "예약확정": "booked",
    "도착": "arrived",
    "진료대기": "arrived",
    "진료중": "arrived",
    "진료완료": "done",
}


def _classify_fragment(fragment: str) -> tuple[str, str]:
    """[SEARCH-MATCH-01·02·03] 검색어 조각 하나를 이름/숫자로 가른다.

    구분자(하이픈·점·공백)를 지운 뒤 숫자만 남으면 「숫자」(전화·생일 양쪽 대상), 한글 등이
    섞이면 「이름」이다. 예시 하나로는 「11자리에서만 맞는」 구현이 통과하므로 갭 #127처럼
    형태가 흔들리는 자리다 — 정규화를 여기 한곳에 못박는다.
    """
    stripped = fragment.translate(_FRAGMENT_SEPARATORS)
    if stripped.isdigit():
        return "number", stripped
    return "name", fragment


async def find_by_phone_and_birthdate(phone: str, birth_date: date, staff: StaffContext, conn=None) -> dict | None:
    """[SHELL-DOOR-03] 소프트 중복 후보 한 줄(id·name·birth_date) 또는 None.

    ⭐ 이름까지 함께 읽는 이유: 화면의 "혹시 이분?"이 사람을 가리키려면 이름이 필요하다.
       ⛔ 원본을 그대로 내보내지는 않는다 — 라우터가 `patient_row_dto`로 가려서 내보낸다
       (`MASK-SRV-01`). 여기서 가리지 않는 것은, 서비스는 정렬·비교에 원본이 필요한
       search_patients와 같은 결을 지키기 위해서다(마스킹 지점은 HTTP 경계 하나다).
    """
    async def _run(c):
        # ⚠️ 전화는 **숫자만 남겨** 비교한다 — 저장된 값이 `010-1234-5678`인데 직원이 하이픈 없이
        #    치면(또는 그 반대) 문자열 그대로 비교할 경우 같은 사람을 못 알아본다.
        return await c.fetchrow(
            r"""
            select id, name, birth_date from patients
            where regexp_replace(phone, '\D', '', 'g') = regexp_replace($1, '\D', '', 'g')
              and birth_date = $2 and is_active
            """,
            phone, birth_date,
        )

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


def _build_search_query(q: str | None) -> tuple[str, list[str], bool]:
    """[SEARCH-IMPL-01] 검색어를 부분일치·다중필드·AND 조회 SQL로 옮긴다.

    반환: (sql, params, name_present). name_present는 이름 조각이 하나라도 있었는지 —
    돌아온 줄은 모든 이름 조각을 이름에서 이미 맞혔으므로, 이 값만으로 'name' 배지가 선다.
    """
    fragments = [_classify_fragment(f) for f in q.split()] if q else []
    where = ["p.is_active"]
    phone_hits: list[str] = []
    birth_hits: list[str] = []
    params: list[str] = []
    name_present = False

    for kind, value in fragments:
        params.append(value)
        i = len(params)
        if kind == "name":
            name_present = True
            where.append(f"p.name ilike '%'||${i}||'%'")
        else:
            # [SEARCH-MATCH-02·04] 숫자는 전화·생일 양쪽에 맞힌다. 가려진 자리도 서버 원본으로
            #   비교한다 — 막지 않는 대신 SEARCH-LOG-01(Task 15)이 기록으로 대가를 받는다.
            phone_expr = f"regexp_replace(p.phone,'[^0-9]','','g') like '%'||${i}||'%'"
            birth_expr = f"to_char(p.birth_date,'YYYYMMDD') like '%'||${i}||'%'"
            where.append(f"({phone_expr} or {birth_expr})")
            phone_hits.append(phone_expr)
            birth_hits.append(birth_expr)

    phone_hit_sql = " or ".join(phone_hits) if phone_hits else "false"
    birth_hit_sql = " or ".join(birth_hits) if birth_hits else "false"

    sql = f"""
        select p.id, p.name, p.birth_date, p.phone, p.gender,
               ({phone_hit_sql}) as phone_hit,
               ({birth_hit_sql}) as birth_hit,
               today.raw_status as today_status_raw,
               to_char(today.appt_at, 'HH24:MI') as today_time,
               today.dept_name as today_dept_name,
               today.doctor_name as today_doctor_name,
               recent.last_at as last_at
        from patients p
        left join lateral (
            -- [SEARCH-ORDER-06] 오늘의 (가장 이른) 살아있는 예약 한 건 — 상태·시각·과·의사.
            select a.status as raw_status,
                   coalesce((s.slot_date + s.start_time)::timestamptz, a.walkin_visit_time) as appt_at,
                   d.name as dept_name,
                   st.name as doctor_name
            from appointments a
            left join appointment_slots s on s.id = a.slot_id
            left join departments d on d.id = a.department_id
            left join staff st on st.id = a.doctor_id
            where a.for_patient_id = p.id
              and a.status not in ('환자취소', '병원취소', '예약부도')
              and coalesce(s.slot_date, a.walkin_visit_time::date) = current_date
            order by appt_at asc nulls last
            limit 1
        ) today on true
        left join lateral (
            -- [SEARCH-ORDER-02] 최근에 병원에 온 순서 — 살아있는 예약의 가장 늦은 시각.
            select max(coalesce((s.slot_date + s.start_time)::timestamptz,
                                a.walkin_visit_time, a.created_at)) as last_at
            from appointments a
            left join appointment_slots s on s.id = a.slot_id
            where a.for_patient_id = p.id
              and a.status not in ('환자취소', '병원취소', '예약부도')
        ) recent on true
        where {' and '.join(where)}
    """
    return sql, params, name_present


async def search_patients(
    q: str | None, staff: StaffContext, *, cursor: str | None = None, conn=None
) -> Page:
    """[SEARCH-IMPL-01·02·03] 전역 환자 검색 — 부분일치·다중필드·정렬·페이징의 조회 본체.

    돌려주는 줄(Page.rows)은 아직 마스킹 전 원본이다 — 정렬 키(이름 등)를 담아야 이어받기가
    안정되기 때문이다. 마스킹 경계는 라우터(patient_row_dto)가 지킨다. 원본이 응답으로 새지
    않도록, HTTP로 나가는 지점에서만 masked_* 로 옮긴다.

    정렬(SEARCH-ORDER-01~04): ①오늘 볼 사람 → ②최근 방문순 → ③이름 가나다 → ④고유번호(id).
    페이징(SEARCH-RESULT-02·03): 공용 paginate가 20건·안정 동점키로 커서를 잇는다.
    감사(SEARCH-LOG-01, Task 15): 카운트 없이 현재 시그니처 그대로 검색을 남긴다.
    """
    sql, params, name_present = _build_search_query(q)

    async def _run(c) -> list:
        return await c.fetch(sql, *params)

    if conn is not None:
        rows = await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            rows = await _run(c)

    await audit_service.log_access(None, "search", staff, search_term=q)

    enriched: list[dict] = []
    for row in rows:
        matched: list[str] = []
        if name_present:
            matched.append("name")
        if row["phone_hit"]:
            matched.append("phone")
        if row["birth_hit"]:
            matched.append("birth")
        today_status = _TODAY_STATUS.get(row["today_status_raw"])
        last_at = row["last_at"]
        enriched.append(
            {
                "id": row["id"],
                "name": row["name"],
                "birth_date": row["birth_date"],
                "phone": row["phone"],
                "gender": row["gender"],
                "matched": matched,
                "today_status": today_status,
                "today_appointment_time": row["today_time"] if today_status else None,
                # [SEARCH-ORDER-06] 오늘 예약 줄에 과·의사도 함께(데모 PatientSearch:168 정합).
                "today_department_name": row["today_dept_name"] if today_status else None,
                "today_doctor_name": row["today_doctor_name"] if today_status else None,
                # 정렬 대리키 — 라우터 DTO에는 싣지 않는다.
                "_ord_today": 0 if today_status else 1,
                "_ord_recent": last_at.timestamp() if last_at else 0.0,
                "_ord_name": row["name"],
            }
        )

    return paginate(
        enriched, cursor, order=("_ord_today asc", "_ord_recent desc", "_ord_name asc")
    )


async def get_patient_detail(patient_id: UUID, staff: StaffContext) -> dict:
    """[MASK-DETAIL-01] 상세는 목록이 아니므로 전체를 보여준다 — 대신 진입이 기록된다."""
    async with acquire_as(str(staff.auth_user_id)) as c:
        row = await c.fetchrow(
            "select id, name, birth_date, gender, phone from patients where id = $1 and is_active",
            patient_id,
        )
        if row is None:
            raise AppError("환자를 찾을 수 없습니다.", status_code=404)
        await audit_service.log_access(patient_id, "patient_detail", staff, conn=c)
        return {
            "id": row["id"],
            "name": row["name"],
            "birth_date": row["birth_date"],
            "gender": row["gender"],
            "phone": row["phone"],
        }


async def reveal_contact(patient_id: UUID, staff: StaffContext) -> dict:
    """[MASK-VIEW-01·02·03] 번호 펼치기 창구(갭 #35) — 열람과 기록을 같은 트랜잭션에 둔다.

    기록에 실패하면 번호도 주지 않는다 — 「기록만 죽이면 조용히 볼 수 있는」 우회로를 막는다.
    """
    async with acquire_as(str(staff.auth_user_id)) as c:
        phone = await c.fetchval(
            "select phone from patients where id = $1 and is_active", patient_id
        )
        if phone is None:
            raise AppError("환자를 찾을 수 없습니다.", status_code=404)
        await audit_service.log_access(patient_id, "phone_reveal", staff, conn=c)
        return {"phone": phone}


async def link_family_member(
    account_patient_id: UUID,
    family_patient_id: UUID,
    relation: str,
    method: str,
    staff: StaffContext,
    conn=None,
) -> UUID:
    """[R5-01][PTDET-FAMILY-03·04·05] 직원이 가족을 연결한다.

    ⭐ 판정 조건은 오직 **B의 등록 전화번호 유무**다. 클라이언트가 예외를 골랐다는
       사실만으로 열지 않는다 — Task 13의 verify-eligibility를 먼저 불렀더라도
       그 사이에 번호가 등록됐을 수 있고, 애초에 그 호출을 건너뛸 수도 있다.
    """
    async def _run(c):
        phone = await c.fetchval(
            "select phone from patients where id = $1 for update", family_patient_id
        )
        if phone and method != "otp":
            # [PTDET-FAMILY-04] 번호가 있는데 예외 경로를 고르면 우회다 — 저장 시점에 막는다.
            raise AppError(
                "등록된 번호가 있어 다른 확인 방법으로 전환할 수 없습니다.", status_code=409
            )
        if method == "otp":
            # ⚠️ 갭 — OTP 발송·검증 창구가 없다(결정 #3 ㉠). ⛔ 그냥 통과시키지 않는다:
            #    통과시키면 본인확인 없이 남의 가족이 된다. 막다른 길이 아니다 —
            #    번호가 없는 환자는 예외 경로(in_person·document)로 갈 수 있다.
            raise AppError("본인확인(OTP) 창구가 아직 열리지 않았습니다.", status_code=501)
        try:
            # 중복 삽입 실패가 바깥 트랜잭션을 오염시키지 않도록 savepoint로 격리한다 —
            # 격리하지 않으면 해제 후 재연결이 「실패한 트랜잭션」 위에서 막힌다.
            async with c.transaction():
                return await c.fetchval(
                    """insert into patient_family_links
                         (account_patient_id, family_patient_id, relation,
                          verification_method, linked_by)
                       values ($1, $2, $3, $4, $5) returning id""",
                    account_patient_id, family_patient_id, relation, method, staff.id,
                )
        except asyncpg.UniqueViolationError:
            # [PTDET-FAMILY-01] 살아 있는 연결이 이미 있다(family_links_live_pair). 목록에
            # 같은 사람이 두 줄로 나오지 않도록 막는다. 해제한 뒤에는 다시 연결할 수 있다.
            raise AppError("이미 연결된 가족입니다.", status_code=409)

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c, c.transaction():
        return await _run(c)


async def unlink_family_member(
    account_patient_id: UUID,
    family_patient_id: UUID,
    reason: str,
    staff: StaffContext,
    conn=None,
) -> None:
    """[R5-02][결정 #3 기록부] 해제는 행을 지우지 않는다 — is_active만 내리고 사유·실행자를 남긴다.

    지우면 「누가 왜 끊었나」가 사라진다(FAM-UNLINK-11: 환자 행도 명부에 남긴다).
    해제 후 같은 쌍을 다시 연결할 수 있다(#59 재연결 전제).
    """
    async def _run(c):
        updated = await c.fetchval(
            """update patient_family_links
                 set is_active = false, unlinked_at = now(),
                     unlink_reason = $3, unlinked_by = $4
               where account_patient_id = $1 and family_patient_id = $2 and is_active
               returning id""",
            account_patient_id, family_patient_id, reason, staff.id,
        )
        if updated is None:
            raise AppError("연결된 가족을 찾을 수 없습니다.", status_code=404)

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c, c.transaction():
        return await _run(c)


async def register_patient(name: str, birth_date: date, gender: str, phone: str, staff: StaffContext, conn=None) -> UUID:
    async def _run(c):
        return await c.fetchval(
            """
            insert into patients (name, birth_date, gender, phone)
            values ($1, $2, $3, $4)
            returning id
            """,
            name, birth_date, gender, phone,
        )

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)
