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


async def test_의사도_환자검색을_열되_본인_담당_환자로_스코프된다(client, committed_conn):
    """[SHELL-NAV-03][ROLE-DOC-02] 의사 사이드바엔 「환자 검색」이 있다 — 403으로 막으면 막다른 길(#10).

    「자기 것만」은 화면 차단이 아니라 RLS(doctor_can_read_scoped_patients)의 스코프다. 담당이
    아닌 환자는 403이 아니라 결과에서 빠진다(열거 방지). 예전엔 라우터가 doctor를 빼 403이었다.
    """
    doctor = await seed_staff(committed_conn, role="doctor")
    await _seed_patient(committed_conn)  # 이 의사와 예약(담당관계)이 없는 환자
    resp = client.get("/patients", params={"q": "김"}, headers=_auth(doctor))
    assert resp.status_code == 200          # 예전엔 403 — SHELL-NAV-03 위반이었다
    assert resp.json()["rows"] == []        # 담당 아닌 환자는 막지 않고 「안 보인다」


async def test_의사_상세는_담당_아니면_403이_아니라_404다(client, committed_conn):
    """[SHELL-NAV-03] 검색→상세로 이어져도 막다른 길(403)이 아니다 — 담당 아닌 환자는 404(열거 안전). #10."""
    doctor = await seed_staff(committed_conn, role="doctor")
    pid = await _seed_patient(committed_conn)
    resp = client.get(f"/patients/{pid}", headers=_auth(doctor))
    assert resp.status_code == 404  # 403이 아니다 — 존재 여부를 드러내지 않는다


async def test_목록_응답에_원본_번호가_아예_없다(client, committed_conn):
    """[MASK-SRV-01] 서버가 마스킹된 값만 담는다 — 원본을 내려보내고 화면에서 가리는 방식 금지."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    await _seed_patient(committed_conn)

    body = client.get("/patients", params={"q": "김"}, headers=_auth(receptionist)).json()
    row = body["rows"][0]

    # [요구사항 :81][SEARCH-RESULT-09] 가리는 것은 전화·생년월일 둘이고, 이름은 실명이다.
    assert "phone" not in row and "birth_date" not in row
    assert row["name"] == "김환자" and "masked_name" not in row
    assert row["masked_phone"] == "010-****-5678"
    assert row["masked_phone"].count("*") == 4
    assert row["masked_birth_date"] == "1958-**-12"


async def test_검색_결과_줄에_왜걸렸는지와_오늘상태가_실린다(client, committed_conn):
    """[SEARCH-WHY-01][SEARCH-ORDER-06] 24b가 소비할 계약 — matched·today_status·오늘 예약 시각."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    await _seed_patient(committed_conn)  # 김환자, 01012345678, 1958-03-12

    row = client.get("/patients", params={"q": "김"}, headers=_auth(receptionist)).json()["rows"][0]

    assert row["matched"] == ["name"]
    assert row["today_status"] is None
    assert "today_appointment_time" in row


async def test_첫_페이지는_20건과_다음커서를_HTTP로_전달한다(client, committed_conn):
    """[SEARCH-RESULT-02·03] HTTP 봉투가 20건·has_more·next_cursor를 실어 나른다.

    ⚠️ 이어받기의 「겹침 없음」 의미는 서비스층(test_patient_search)이 증명한다. 이 파일의
       TestClient는 요청마다 이벤트 루프를 새로 돌려(앱 풀이 루프 바인딩) 한 테스트에서 두 번째
       HTTP 요청이 풀과 충돌하므로, 여기서는 첫 페이지 봉투만 확인한다.
    """
    receptionist = await seed_staff(committed_conn, role="receptionist")
    for i in range(25):
        await committed_conn.execute(
            "insert into patients (name, birth_date, gender, phone) "
            "values ($1, $2, 'F', '01000000000')",
            f"환자{i:02d}", date(1958, 3, 12),
        )

    page1 = client.get("/patients", params={"q": "환자"}, headers=_auth(receptionist)).json()
    assert len(page1["rows"]) == 20
    assert page1["has_more"] is True
    assert isinstance(page1["next_cursor"], str) and page1["next_cursor"]


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


# ─── 전화번호 변경 창구(배포 Task 7D · 갭 #19 · 결정 #4) ─────────────────────────

async def test_전화변경_요청_창구가_있고_새번호로_인증요청을_남긴다(client, committed_conn):
    """[PTDET-ACTION-02] 접수직원이 새 번호로 인증번호를 요청하면 요청 행이 남는다."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    pid = await _seed_patient(committed_conn)

    resp = client.post(f"/patients/{pid}/phone-change/request",
                       json={"new_phone": "01099998888"}, headers=_auth(receptionist))
    assert resp.status_code == 200

    row = await committed_conn.fetchrow(
        "select staff_id, new_phone_masked from patient_phone_change_requests where patient_id=$1", pid)
    assert row["staff_id"] == receptionist["staff_id"]
    assert row["new_phone_masked"] == "010-****-8888"


async def test_전화변경은_접수관리자만이다_의사는_403(client, committed_conn):
    """[ROLE-DOC-02] 전화번호 변경은 접수·관리자의 일 — 의사에겐 창구를 열지 않는다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    pid = await _seed_patient(committed_conn)

    resp = client.post(f"/patients/{pid}/phone-change/request",
                       json={"new_phone": "01099998888"}, headers=_auth(doctor))
    assert resp.status_code == 403


async def test_전화변경_확인_창구가_배선돼_요청없으면_404(client, committed_conn):
    """[PTDET-ACTION-03] 확인 창구가 서비스에 배선돼 있다 — 요청 없는 번호는 404로 안내."""
    receptionist = await seed_staff(committed_conn, role="receptionist")
    pid = await _seed_patient(committed_conn)

    resp = client.post(f"/patients/{pid}/phone-change/confirm",
                       json={"new_phone": "01099998888", "code": "000000"},
                       headers=_auth(receptionist))
    assert resp.status_code == 404
