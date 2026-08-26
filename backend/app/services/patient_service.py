from datetime import date
from uuid import UUID

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
