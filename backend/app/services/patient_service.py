from datetime import date
from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.core.masking import mask_birth_date, mask_phone
from app.core.security import StaffContext
from app.db.pool import acquire_as
from app.services import audit_service


async def find_by_phone_and_birthdate(phone: str, birth_date: date, staff: StaffContext, conn=None) -> UUID | None:
    async def _run(c):
        row = await c.fetchrow(
            "select id from patients where phone = $1 and birth_date = $2 and is_active",
            phone, birth_date,
        )
        return row["id"] if row else None

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def search_patients(q: str | None, staff: StaffContext) -> list[dict]:
    """[MASK-SRV-01][SEARCH-LOG-01·03] 마스킹된 목록만 돌려주고, 검색을 기록한다.

    ⭐ 서비스가 masked_* 만 담는다 — 원본(phone·birth_date)은 응답에 아예 넣지 않는다.
       원본이 필요하면 상세(get_patient_detail)나 번호 펼치기(reveal_contact)로 따로
       요청해야 하고, 그때 「누가 봤는지」가 남는다.

    ⚠️ 부분 일치·정렬·페이징(SEARCH-IMPL-01·02·03)은 이 태스크가 아니라 검색 화면
       (Task 24)이 소유한다. 여기서는 마스킹·기록 계약만 세운다.
    """
    async with acquire_as(str(staff.auth_user_id)) as c:
        if q:
            rows = await c.fetch(
                "select id, name, birth_date, phone, gender from patients "
                "where is_active and name ilike '%' || $1 || '%' order by name",
                q,
            )
        else:
            rows = await c.fetch(
                "select id, name, birth_date, phone, gender from patients "
                "where is_active order by name",
            )

    await audit_service.log_access(None, "search", staff, search_term=q)

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "gender": row["gender"],
            "masked_phone": mask_phone(row["phone"]),
            "masked_birth_date": mask_birth_date(row["birth_date"]),
        }
        for row in rows
    ]


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
