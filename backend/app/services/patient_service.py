from datetime import date
from uuid import UUID

from app.core.security import StaffContext
from app.db.pool import acquire_as


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
