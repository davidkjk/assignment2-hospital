from datetime import date

import pytest

from app.core.security import StaffContext
from app.services import patient_service
from tests.conftest import seed_staff


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


@pytest.mark.asyncio
async def test_register_and_find_patient(db_conn):
    seed = await seed_staff(db_conn, role="receptionist")
    staff = _to_context(seed, "receptionist")

    patient_id = await patient_service.register_patient(
        name="홍길동", birth_date=date(1985, 3, 1), gender="M", phone="01012345678", staff=staff, conn=db_conn,
    )
    assert patient_id is not None

    found_id = await patient_service.find_by_phone_and_birthdate(
        phone="01012345678", birth_date=date(1985, 3, 1), staff=staff, conn=db_conn,
    )
    assert found_id == patient_id


@pytest.mark.asyncio
async def test_find_returns_none_when_no_match(db_conn):
    seed = await seed_staff(db_conn, role="receptionist")
    staff = _to_context(seed, "receptionist")

    found_id = await patient_service.find_by_phone_and_birthdate(
        phone="01099999999", birth_date=date(1990, 1, 1), staff=staff, conn=db_conn,
    )
    assert found_id is None
