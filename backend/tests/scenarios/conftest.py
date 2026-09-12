"""5단계 시나리오 통합 테스트 공통 픽스처.

- `bearer(auth_user_id)`: Supabase JWT를 흉내 낸 Authorization 헤더.
- `hospital`: 커밋 기반 병원 기본 세트(admin/receptionist/doctor + 진료과 + 환자 + 내일 슬롯 3개).

⚠️ 뒷정리는 상위 `tests/conftest.py`의 autouse 픽스처 `_cleanup_committed_data`가
   모든 테스트 종료 후 `staff·patients·appointments·departments·auth.users(@test.local)` 등을
   전부 삭제하므로 이 픽스처는 별도 teardown을 두지 않는다(중복이라 뺐다 — 실제 conftest 기준).
"""
import time
from datetime import time as dtime

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.main import app
from tests.conftest import seed_patient, seed_staff


@pytest.fixture
def client():
    """시나리오 테스트는 한 테스트에서 여러 번 요청한다. 상위 conftest의 기본 client는
    컨텍스트 매니저 없이 TestClient를 반환해 요청마다 새 포털 이벤트 루프를 만들고,
    앱 전역 asyncpg 풀이 첫 요청 루프에 묶였다가 둘째 요청에서
    'another operation is in progress'/'different loop' 오류를 낸다. 컨텍스트 매니저로
    포털을 하나로 유지해 한 테스트의 모든 요청이 같은 루프를 쓰게 한다."""
    with TestClient(app) as c:
        yield c


def bearer(auth_user_id) -> dict:
    payload = {
        "sub": str(auth_user_id),
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    token = jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def hospital(db_pool):
    """커밋 기반 병원 기본 세트. TestClient 요청이 별도 커넥션을 쓰므로
    트랜잭션 롤백 픽스처(db_conn)는 쓸 수 없어 커밋으로 만든다."""
    async with db_pool.acquire() as conn:
        admin = await seed_staff(conn, role="admin")
        receptionist = await seed_staff(conn, role="receptionist")
        dept_id = await conn.fetchval(
            "insert into departments (name) values ('시나리오내과') returning id"
        )
        doctor = await seed_staff(conn, role="doctor", department_id=dept_id)
        patient = await seed_patient(conn, name="시나리오환자", phone="01099998888")
        slot_ids = [
            await conn.fetchval(
                "insert into appointment_slots (doctor_id, slot_date, start_time) "
                "values ($1, current_date + 1, $2) returning id",
                doctor["staff_id"], t,
            )
            for t in (dtime(9, 0), dtime(9, 30), dtime(10, 0))
        ]
    yield {
        "admin": admin, "receptionist": receptionist, "doctor": doctor,
        "dept_id": dept_id, "patient": patient, "slots": slot_ids,
    }
