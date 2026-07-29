import json
import uuid
import pytest
import pytest_asyncio
import asyncpg
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings


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
