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


async def release_slot(slot_id: UUID, actor, conn=None) -> None:
    # 예약 취소·변경 시 슬롯을 빈시간으로 되돌린다. actor는 .auth_user_id를 가진 컨텍스트(직원·환자 공용).
    async def _run(c):
        await c.execute("update appointment_slots set status='빈시간' where id=$1", slot_id)

    if conn is not None:
        await _run(conn)
        return
    async with acquire_as(str(actor.auth_user_id)) as c:
        await _run(c)
