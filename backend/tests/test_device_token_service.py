import pytest

from app.core.patient_security import PatientContext
from app.services import device_token_service
from tests.conftest import seed_patient


def _ctx(s):
    return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


@pytest.mark.asyncio
async def test_register_is_idempotent_and_unregister_removes(committed_conn):
    # 서비스가 acquire_as로 별도 커넥션을 여니 시드는 committed_conn으로(커밋돼야 그 커넥션이 본다).
    me = _ctx(await seed_patient(committed_conn))
    await device_token_service.register_token(me, "fcm-1")
    await device_token_service.register_token(me, "fcm-1")            # 같은 기기 재등록은 무해
    assert await committed_conn.fetchval(
        "select count(*) from device_tokens where patient_id=$1", me.id) == 1

    await device_token_service.unregister_token(me, "fcm-1")
    assert await committed_conn.fetchval(
        "select count(*) from device_tokens where patient_id=$1", me.id) == 0
