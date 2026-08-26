"""[MASK-SRV-01][MASK-VIEW-01·02·03][MASK-DETAIL-01][ROLE-READ-01][SEARCH-LOG-01]
patients 라우터 — 마스킹 목록 · 상세 · 번호 펼치기 창구 + 열람/검색 기록.

⚠️ main.py는 손대지 않는다(라우터 등록은 코디가 배선). 여기서는 최소 FastAPI 앱에
   patients.router만 얹은 로컬 TestClient로 검증한다. 병합 시 코디가 main.py에 등록한다.
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
from app.services import audit_service
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
    # raise_server_exceptions=False: 기록 실패 등 예기치 못한 예외가 테스트를 죽이지 않고
    # 500 응답으로 나와, 「기록에 실패하면 번호도 주지 않는다」를 응답 코드로 검증할 수 있다.
    return TestClient(app, raise_server_exceptions=False)


async def _seed_patient(conn, name="김환자") -> str:
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ($1, $2, 'F', '01012345678') returning id",
        name, date(1958, 3, 12),
    )


def _auth(seed):
    return {"Authorization": f"Bearer {_make_token(str(seed['auth_user_id']))}"}


async def test_목록은_접수직원과_관리자만_연다(client, committed_conn):
    """[ROLE-READ][ROLE-DOC-02] 의사가 보는 범위는 자기 예약이다 — 환자 목록 전체는 못 연다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    resp = client.get("/patients", params={"q": "김"}, headers=_auth(doctor))
    assert resp.status_code == 403


async def test_목록_응답에_원본_번호가_아예_없다(client, committed_conn):
    """[MASK-SRV-01] 서버가 마스킹된 값만 담는다 — 원본을 내려보내고 화면에서 가리는 방식 금지."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    await _seed_patient(committed_conn)

    body = client.get("/patients", params={"q": "김"}, headers=_auth(receptionist)).json()

    assert "phone" not in body[0] and "birth_date" not in body[0]
    assert body[0]["masked_phone"] == "010-****-5678"
    assert body[0]["masked_phone"].count("*") == 4
    assert body[0]["masked_birth_date"] == "1958-**-12"


async def test_상세는_전체를_보여주고_진입_자체가_기록된다(client, committed_conn):
    """[MASK-DETAIL-01] 상세는 목록이 아니므로 전체를 보여준다 — 대신 진입이 기록된다."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    pid = await _seed_patient(committed_conn)

    body = client.get(f"/patients/{pid}", headers=_auth(receptionist)).json()
    assert body["phone"] == "01012345678"  # 가리지 않는다(목록이 아니다)

    rows = await committed_conn.fetch(
        "select resource_type from access_audit_log where patient_id = $1", pid
    )
    assert [r["resource_type"] for r in rows] == ["patient_detail"]


async def test_번호_펼치기_창구가_있고_열람이_기록된다(client, committed_conn):
    """[MASK-VIEW-01·02·03] 갭 #35 — 목록이 원본을 안 주니, 필요할 때만 따로 요청하게 한다.

    이 구조라야 「누가 언제 누구 번호를 봤는가」가 남는다.
    """
    receptionist = await seed_staff(committed_conn, role="receptionist")
    pid = await _seed_patient(committed_conn)

    body = client.get(f"/patients/{pid}/contact", headers=_auth(receptionist)).json()
    assert body["phone"] == "01012345678"

    row = await committed_conn.fetchrow(
        "select patient_id, staff_id from access_audit_log where resource_type = 'phone_reveal'"
    )
    assert row["patient_id"] == pid
    assert row["staff_id"] == receptionist["staff_id"]


async def test_기록에_실패하면_번호도_주지_않는다(client, committed_conn, monkeypatch):
    """[MASK-VIEW-02] 기록과 열람을 같은 트랜잭션에 둔다.

    :82가 「누가 열어봤는지 관리자가 확인」이므로 기록 없이 열람이 성공하면 그 요구가 깨진다.
    기록 실패를 무시하면 「기록만 죽이면 조용히 볼 수 있는」 우회로가 생긴다.
    """
    receptionist = await seed_staff(committed_conn, role="receptionist")
    pid = await _seed_patient(committed_conn)

    async def _failing(*a, **k):
        raise RuntimeError("audit down")

    monkeypatch.setattr(audit_service, "log_access", _failing)

    resp = client.get(f"/patients/{pid}/contact", headers=_auth(receptionist))
    assert resp.status_code >= 400
    assert "phone" not in resp.json()  # 번호가 새지 않는다

    # 열람도 롤백돼 기록이 아예 없다 — 「열람 성공 + 기록 실패」 상태가 존재하지 않는다.
    n = await committed_conn.fetchval(
        "select count(*) from access_audit_log where resource_type = 'phone_reveal'"
    )
    assert n == 0


async def test_검색은_검색어와_함께_남는다(client, committed_conn):
    """[SEARCH-LOG-01][SEARCH-LOG-03] 목록 조회는 「무엇으로 찾았나」를 남긴다(patient_id 없음)."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    await _seed_patient(committed_conn)

    client.get("/patients", params={"q": "김 1234"}, headers=_auth(receptionist))

    row = await committed_conn.fetchrow(
        "select patient_id, search_term from access_audit_log where resource_type = 'search'"
    )
    assert row["patient_id"] is None
    assert row["search_term"] == "김 1234"
