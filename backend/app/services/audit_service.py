from uuid import UUID

from app.core.security import StaffContext
from app.db.pool import acquire_as


async def log_access(patient_id: UUID, resource_type: str, staff: StaffContext, conn=None) -> None:
    async def _run(c) -> None:
        await c.execute(
            "insert into access_audit_log (staff_id, patient_id, resource_type) values ($1, $2, $3)",
            staff.id, patient_id, resource_type,
        )

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)
