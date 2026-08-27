"""[Task 20a][R4-04][CHKIN-RESULT-*] 예약번호 조회 — /checkin 결과 카드용 요약 반환.

서비스 테스트는 conftest의 db_conn(감싼 트랜잭션, 종료 시 롤백)에 시드하고 같은 conn을
find_by_booking_code에 넘긴다 — acquire_as가 여는 별도 커넥션은 이 롤백 트랜잭션의
미확정 데이터를 못 보기 때문이다. 라우터 403 테스트만 require_role이 커밋된 staff 행을
읽으므로 committed_conn + 로컬 앱을 쓴다(test_patients_router와 같은 패턴).
"""
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.core.security import StaffContext
from app.routers import appointments
from app.services import appointment_service
from tests.conftest import seed_staff, set_session_auth


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


async def _seed_base(db_conn) -> dict:
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone)"
        " values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    await set_session_auth(db_conn, receptionist["auth_user_id"])
    return {
        "admin": _to_context(admin, "admin"),
        "receptionist": _to_context(receptionist, "receptionist"),
        "doctor": _to_context(doctor, "doctor"),
        "dept_id": dept_id,
        "patient_id": patient_id,
    }


async def _seed_appointment(db_conn, ctx: dict, status: str):
    """상태를 골라 예약 1건을 넣는다. assign_booking_code 트리거가 booking_code와
    booking_code_expires_at(슬롯 없으면 current_date + 1일)를 자동 발급한다."""
    return await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id,
             reason, status, source, created_by, start_at, end_at)
        values ($1, $1, $2, $3, '감기', $4, 'staff', $5,
                '2026-09-01 10:30+09', '2026-09-01 10:45+09')
        returning id
        """,
        ctx["patient_id"], ctx["dept_id"], ctx["doctor"].id, status, ctx["receptionist"].id,
    )


@pytest.mark.asyncio
async def test_find_by_booking_code_returns_card_summary(db_conn):
    """[CHKIN-RESULT-01] 결과 카드가 그릴 것을 서버가 한 번에 준다 —
    UUID만 주면 화면이 예약을 다시 조회해야 하고, 그 사이 카드가 비어 보인다."""
    ctx = await _seed_base(db_conn)
    appt = await _seed_appointment(db_conn, ctx, status="예약확정")
    code = await db_conn.fetchval("select booking_code from appointments where id = $1", appt)

    found = await appointment_service.find_by_booking_code(code, ctx["receptionist"], conn=db_conn)
    assert found.appointment_id == appt
    assert found.status == "예약확정"
    assert found.patient_name == "홍길동"
    assert found.department_name == "내과"
    assert found.doctor_name == "Test Staff"
    assert found.slot_at is not None
    assert found.updated_at is not None


@pytest.mark.asyncio
async def test_find_by_booking_code_never_returns_contact_fields(db_conn):
    """[CHKIN-RESULT-01][MASK-SRV-01] 전화·생년월일은 아예 담지 않는다 — 요구사항 :81은 목록
    마스킹이지만, 접수에 필요한 것은 「이 사람이 이 예약이 맞나」뿐이다. 안 보내면 샐 일도 없다."""
    ctx = await _seed_base(db_conn)
    appt = await _seed_appointment(db_conn, ctx, status="예약확정")
    code = await db_conn.fetchval("select booking_code from appointments where id = $1", appt)

    found = await appointment_service.find_by_booking_code(code, ctx["receptionist"], conn=db_conn)
    assert not hasattr(found, "phone")
    assert not hasattr(found, "birth_date")


@pytest.mark.asyncio
@pytest.mark.parametrize("teardown", ["expired", "terminal", "absent"])
async def test_find_by_booking_code_returns_none_indistinguishably(db_conn, teardown):
    """[CHKIN-RESULT-02] 만료·취소·없는 번호가 서버 응답에서 갈리면 안 된다 —
    갈리는 순간 화면이 "취소된 예약입니다"를 말하게 되고, 그것이 곧 개인정보 열거다(P-01)."""
    ctx = await _seed_base(db_conn)
    if teardown == "absent":
        code = "ZZ99ZZ"
    else:
        appt = await _seed_appointment(db_conn, ctx, status="예약확정")
        code = await db_conn.fetchval("select booking_code from appointments where id = $1", appt)
        if teardown == "expired":
            await db_conn.execute(
                "update appointments set booking_code_expires_at = now() - interval '1 day'"
                " where id = $1", appt)
        else:  # terminal — 트리거가 booking_code를 이미 비웠다(00005:126~143)
            await db_conn.execute("update appointments set status = '환자취소' where id = $1", appt)

    assert await appointment_service.find_by_booking_code(code, ctx["receptionist"], conn=db_conn) is None


@pytest.mark.asyncio
async def test_find_by_booking_code_normalizes_input(db_conn):
    """[CHKIN-CODE-02] 앞뒤 공백·소문자는 서버도 받아 준다 — QR 디코드 문자열에 개행이 섞여 온다."""
    ctx = await _seed_base(db_conn)
    appt = await _seed_appointment(db_conn, ctx, status="예약확정")
    code = await db_conn.fetchval("select booking_code from appointments where id = $1", appt)

    found = await appointment_service.find_by_booking_code(
        f"  {code.lower()}\n", ctx["receptionist"], conn=db_conn)
    assert found.appointment_id == appt


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
    app.include_router(appointments.router)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    return TestClient(app, raise_server_exceptions=False)


async def test_find_by_code_route_rejects_doctor(client, committed_conn):
    """[CHKIN-HEAD-03] 메뉴를 숨기는 것으로 끝내지 않는다 — 의사가 URL을 직접 치면 서버가 막는다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    res = client.get(
        "/appointments/find-by-code",
        params={"code": "AB34CD"},
        headers={"Authorization": f"Bearer {_make_token(str(doctor['auth_user_id']))}"},
    )
    assert res.status_code == 403
