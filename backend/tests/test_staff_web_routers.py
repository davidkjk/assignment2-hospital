import time

import httpx
import pytest
import pytest_asyncio
from jose import jwt

from app.core.config import settings
from app.main import app
from tests.conftest import seed_staff


def make_token(auth_user_id: str) -> str:
    payload = {
        "sub": auth_user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


@pytest_asyncio.fixture
async def phrase_cleanup(db_pool):
    doctor_ids = []
    yield doctor_ids
    async with db_pool.acquire() as conn:
        for doctor_id in doctor_ids:
            await conn.execute("delete from doctor_quick_phrases where doctor_id = $1", doctor_id)


@pytest_asyncio.fixture
async def api_client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.mark.asyncio
async def test_doctor_phrase_routes_are_crud_and_scoped(api_client, committed_conn, phrase_cleanup):
    doctor_one = await seed_staff(committed_conn, role="doctor")
    doctor_two = await seed_staff(committed_conn, role="doctor")
    phrase_cleanup.extend((doctor_one["staff_id"], doctor_two["staff_id"]))

    await committed_conn.execute(
        "insert into doctor_quick_phrases (doctor_id, text) values ($1, $2)",
        doctor_two["staff_id"],
        "다른 의사 문구",
    )
    token = make_token(str(doctor_one["auth_user_id"]))
    headers = {"Authorization": f"Bearer {token}"}

    create_response = await api_client.post(
        "/doctor/quick-phrases",
        headers=headers,
        json={"text": "목이 부었습니다"},
    )
    assert create_response.status_code == 200
    phrase_id = create_response.json()["id"]

    list_response = await api_client.get("/doctor/quick-phrases", headers=headers)
    assert list_response.status_code == 200
    assert [phrase["text"] for phrase in list_response.json()] == ["목이 부었습니다"]

    update_response = await api_client.put(
        f"/doctor/quick-phrases/{phrase_id}",
        headers=headers,
        json={"text": "목이 많이 부었습니다"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["text"] == "목이 많이 부었습니다"

    other_phrase_id = await committed_conn.fetchval(
        "select id from doctor_quick_phrases where doctor_id = $1",
        doctor_two["staff_id"],
    )
    forbidden_update = await api_client.put(
        f"/doctor/quick-phrases/{other_phrase_id}",
        headers=headers,
        json={"text": "가로채기"},
    )
    assert forbidden_update.status_code == 404

    delete_response = await api_client.delete(
        f"/doctor/quick-phrases/{phrase_id}",
        headers=headers,
    )
    assert delete_response.status_code == 200
    assert (await api_client.get("/doctor/quick-phrases", headers=headers)).json() == []


@pytest.mark.asyncio
async def test_non_doctors_cannot_write_doctor_phrases(api_client, committed_conn, phrase_cleanup):
    doctor = await seed_staff(committed_conn, role="doctor")
    phrase_cleanup.append(doctor["staff_id"])
    phrase_id = await committed_conn.fetchval(
        "insert into doctor_quick_phrases (doctor_id, text) values ($1, $2) returning id",
        doctor["staff_id"],
        "의사 문구",
    )

    for role in ("receptionist", "admin"):
        staff = await seed_staff(committed_conn, role=role)
        token = make_token(str(staff["auth_user_id"]))
        headers = {"Authorization": f"Bearer {token}"}

        create_response = await api_client.post(
            "/doctor/quick-phrases",
            headers=headers,
            json={"text": "아무거나"},
        )
        assert create_response.status_code == 403
        assert (await api_client.put(
            f"/doctor/quick-phrases/{phrase_id}",
            headers=headers,
            json={"text": "가로채기"},
        )).status_code == 403
        assert (await api_client.delete(
            f"/doctor/quick-phrases/{phrase_id}",
            headers=headers,
        )).status_code == 403


@pytest.mark.asyncio
async def test_me_returns_only_sidebar_identity_fields(api_client, committed_conn):
    staff = await seed_staff(committed_conn, role="doctor")
    token = make_token(str(staff["auth_user_id"]))

    response = await api_client.get(
        "/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"id", "name", "role", "department_id"}
    assert payload["id"] == str(staff["staff_id"])
    assert payload["name"] == "Test Staff"
    assert payload["role"] == "doctor"


@pytest.mark.asyncio
async def test_doctor_with_no_phrases_gets_an_empty_list(api_client, committed_conn, phrase_cleanup):
    doctor = await seed_staff(committed_conn, role="doctor")
    phrase_cleanup.append(doctor["staff_id"])
    token = make_token(str(doctor["auth_user_id"]))

    response = await api_client.get(
        "/doctor/quick-phrases",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == []
