"""[SHELL-DOOR-03][ROLE-READ] 등록 문 — 신원 폼으로 환자를 등록하는 창구 + 소프트 중복 조회.

⚠️ main.py는 손대지 않는다(라우터 등록은 코디가 배선). 여기서는 최소 FastAPI 앱에
   patients.router만 얹은 로컬 TestClient로 검증한다. 병합 시 코디가 main.py에 등록한다.

렌즈(SHELL-DOOR-03): 소프트 중복은 **막지 않고 안내만** — duplicate-check는 후보를 알려줄 뿐
등록을 거부하지 않는다. 개인정보 열거 방지상 「맞든 틀리든 같은 진행」이라, 이 창구는 등록
경로의 게이트가 아니라 화면이 "혹시 이분?"을 띄우기 위한 힌트일 뿐이다.
"""
import time
from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.routers import patients
from tests.conftest import seed_staff


def _make_token(auth_user_id: str) -> str:
    payload = {
        "sub": auth_user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(patients.router)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    return TestClient(app, raise_server_exceptions=False)


def _auth(seed):
    return {"Authorization": f"Bearer {_make_token(str(seed['auth_user_id']))}"}


async def _seed_patient(conn, name="김환자", phone="01012345678", birth=date(1958, 3, 12)) -> str:
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ($1, $2, 'F', $3) returning id",
        name, birth, phone,
    )


async def test_등록하면_새_환자_id를_돌려주고_실제로_저장된다(client, committed_conn):
    """[SHELL-DOOR-03] 신원 폼(이름·성별·생년월일·전화) → patient_id. 등록은 접수의 일이다."""
    receptionist = await seed_staff(committed_conn, role="receptionist")

    resp = client.post(
        "/patients",
        json={"name": "이신규", "gender": "M", "birth_date": "1990-05-01", "phone": "01099998888"},
        headers=_auth(receptionist),
    )
    assert resp.status_code == 201
    pid = resp.json()["patient_id"]

    row = await committed_conn.fetchrow(
        "select name, gender, birth_date, phone from patients where id = $1", pid
    )
    assert row["name"] == "이신규"
    assert row["gender"] == "M"
    assert row["birth_date"] == date(1990, 5, 1)
    assert row["phone"] == "01099998888"


async def test_등록은_접수직원과_관리자만_연다(client, committed_conn):
    """[ROLE-READ][ROLE-DOC-02] 의사는 환자 등록 창구를 열 수 없다 — 서버에서 막는다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    resp = client.post(
        "/patients",
        json={"name": "이신규", "gender": "M", "birth_date": "1990-05-01", "phone": "01099998888"},
        headers=_auth(doctor),
    )
    assert resp.status_code == 403


async def test_중복조회는_전화와_생일이_맞으면_후보를_알려준다(client, committed_conn):
    """[SHELL-DOOR-03] "혹시 이분?" — 전화·생일이 강하게 겹치는 기존 기록의 id를 준다."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    pid = await _seed_patient(committed_conn, phone="01055556666", birth=date(1975, 8, 20))

    body = client.get(
        "/patients/duplicate-check",
        params={"phone": "01055556666", "birth_date": "1975-08-20"},
        headers=_auth(receptionist),
    ).json()
    assert body["patient_id"] == str(pid)


async def test_중복조회는_가려진_이름과_생년만_준다(client, committed_conn):
    """[MASK-SRV-01][MASK-DOB-01] "혹시 이분?"이 사람을 가리키려면 이름이 필요하다 —

    다만 이 응답은 환자가 섞인 목록류라, 서버가 **가린 값만** 담는다(화면이 다시 가리지 않는다).
    원본 name·birth_date·phone 키는 응답에 아예 없어야 한다(patient_row_dto 화이트리스트).
    """
    receptionist = await seed_staff(committed_conn, role="receptionist")
    await _seed_patient(
        committed_conn, name="김민정", phone="01055556666", birth=date(1975, 8, 20)
    )

    body = client.get(
        "/patients/duplicate-check",
        params={"phone": "01055556666", "birth_date": "1975-08-20"},
        headers=_auth(receptionist),
    ).json()
    assert body["masked_name"] == "김*정"
    assert body["masked_birth_date"] == "1975-**-20"
    assert "name" not in body and "birth_date" not in body and "phone" not in body


async def test_중복조회는_하이픈_유무가_달라도_같은_사람으로_본다(client, committed_conn):
    """[SHELL-DOOR-03] 저장된 번호가 `010-…`인데 직원이 하이픈 없이 쳐도 후보가 잡혀야 한다."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    pid = await _seed_patient(
        committed_conn, phone="010-5555-6666", birth=date(1975, 8, 20)
    )

    body = client.get(
        "/patients/duplicate-check",
        params={"phone": "01055556666", "birth_date": "1975-08-20"},
        headers=_auth(receptionist),
    ).json()
    assert body["patient_id"] == str(pid)


async def test_중복조회는_겹치는_기록이_없으면_null이며_막지_않는다(client, committed_conn):
    """[SHELL-DOOR-03] 개인정보 열거 방지 — 없으면 null만 준다(등록을 거부하지 않는다)."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    await _seed_patient(committed_conn, phone="01055556666", birth=date(1975, 8, 20))

    body = client.get(
        "/patients/duplicate-check",
        params={"phone": "01011112222", "birth_date": "2000-01-01"},
        headers=_auth(receptionist),
    ).json()
    assert body["patient_id"] is None
    assert body["masked_name"] is None and body["masked_birth_date"] is None


async def test_중복조회는_접수직원과_관리자만_연다(client, committed_conn):
    """[ROLE-READ] 소프트 중복 조회도 환자 창구다 — 의사는 못 연다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    resp = client.get(
        "/patients/duplicate-check",
        params={"phone": "01055556666", "birth_date": "1975-08-20"},
        headers=_auth(doctor),
    )
    assert resp.status_code == 403


async def test_duplicate_check_경로가_상세_경로보다_먼저_잡힌다(client, committed_conn):
    """[경로 순서] `/patients/duplicate-check`가 `/patients/{patient_id}`(UUID)에 먹히면 안 된다.

    라우트 순서가 뒤집히면 "duplicate-check"가 patient_id로 파싱돼 422가 난다 — 200이어야 한다.
    """
    receptionist = await seed_staff(committed_conn, role="receptionist")
    resp = client.get(
        "/patients/duplicate-check",
        params={"phone": "01000000000", "birth_date": "1980-01-01"},
        headers=_auth(receptionist),
    )
    assert resp.status_code == 200
