from uuid import UUID

from app.core.security import StaffContext
from app.db.pool import acquire_as


async def book_slot(slot_id: UUID, staff: StaffContext, conn=None) -> bool:
    async def _run(c) -> bool:
        result = await c.execute(
            "update appointment_slots set status = '예약됨' where id = $1 and status = '빈시간'",
            slot_id,
        )
        return result == "UPDATE 1"

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)
