import pytest

from app.core.security import StaffContext
from app.services import audit_service
from tests.conftest import seed_staff, set_session_auth


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


@pytest.mark.asyncio
async def test_log_access_records_entry(db_conn):
    receptionist = _to_context(await seed_staff(db_conn, role="receptionist"), "receptionist")
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    await set_session_auth(db_conn, receptionist.auth_user_id)

    await audit_service.log_access(patient_id, "patient_detail", receptionist, conn=db_conn)

    await db_conn.execute("reset role")
    row = await db_conn.fetchrow(
        "select staff_id, patient_id, resource_type from access_audit_log where patient_id = $1", patient_id,
    )
    assert row["staff_id"] == receptionist.id
    assert row["resource_type"] == "patient_detail"
