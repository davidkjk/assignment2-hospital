import json
import uuid
import pytest
import pytest_asyncio
import asyncpg
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.db import pool as app_pool


@pytest_asyncio.fixture(autouse=True)
async def _reset_app_db_pool():
    # app.db.pool은 asyncpg 풀을 모듈 전역으로 캐시하는데, pytest-asyncio는 테스트마다
    # 새 이벤트 루프를 만든다(asyncio_mode=auto, function-scope). 이전 테스트에서 만든
    # 풀이 다음 테스트의 새 루프로 넘어가면 asyncpg가 "another operation is in progress"
    # InterfaceError를 던지므로, 테스트마다 전역 풀을 닫아 다음 테스트가 자기 루프에서
    # 새로 만들도록 한다.
    yield
    await app_pool.close_pool()


@pytest.fixture
def client():
    return TestClient(app)


@pytest_asyncio.fixture
async def db_pool():
    pool = await asyncpg.create_pool(settings.database_url)
    yield pool
    await pool.close()


@pytest_asyncio.fixture
async def db_conn(db_pool):
    conn = await db_pool.acquire()
    tr = conn.transaction()
    await tr.start()
    try:
        yield conn
    finally:
        await tr.rollback()
        await db_pool.release(conn)


async def seed_staff(conn, role: str, department_id=None, is_active=True) -> dict:
    auth_user_id = uuid.uuid4()
    email = f"{auth_user_id}@test.local"
    await conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_user_id, email,
    )
    staff_id = await conn.fetchval(
        """
        insert into staff (auth_user_id, name, role, department_id, is_active)
        values ($1, 'Test Staff', $2, $3, $4)
        returning id
        """,
        auth_user_id, role, department_id, is_active,
    )
    return {"auth_user_id": auth_user_id, "staff_id": staff_id}


async def set_session_auth(conn, auth_user_id) -> None:
    await conn.execute(
        "select set_config('request.jwt.claims', $1, true)",
        json.dumps({"sub": str(auth_user_id), "role": "authenticated"}),
    )
    await conn.execute("set local role authenticated")


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_committed_data(db_pool):
    yield
    async with db_pool.acquire() as conn:
        await conn.execute("delete from appointment_slots")
        await conn.execute("delete from staff")
        await conn.execute("delete from auth.users where email like '%@test.local'")
