import pytest


@pytest.mark.asyncio
async def test_hospital_fixture_provides_all_keys(hospital):
    assert set(hospital) == {"admin", "receptionist", "doctor", "dept_id", "patient", "slots"}
    assert len(hospital["slots"]) == 3
