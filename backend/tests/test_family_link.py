"""[R5-01][PTDET-FAMILY-01·04·05][ROLE-DOC-02][R5-02] 가족 연결 저장 창구.

직원(접수·관리자)이 대상 B를 계정 소유자 A의 가족으로 연결·해제하는 서버 창구.
⭐ 「연결됐다」만 남기면 나중에 이의가 들어왔을 때 무엇을 보고 연결했는지 아무도 모른다 —
   관계·본인확인 경로·실행자를 함께 박고, 해제도 사유·실행자를 남긴다(결정 #3 기록부).

⚠️ 픽스처: 플랜 Step 6~8의 서비스 코드는 내부에서 acquire_as(별도 풀)를 쓰는데,
   테스트의 db_conn은 미커밋 트랜잭션이라 그 별도 커넥션이 시드를 못 본다. 그래서
   같은 파일의 register_patient·find_by_phone_and_birthdate가 이미 쓰는 관례대로
   서비스에 옵셔널 conn을 두고, 테스트는 conn=db_conn + set_session_auth로 같은
   트랜잭션을 공유한다(test_medical_record_service.py와 동일 패턴).
"""
import time
import uuid
from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.core.security import StaffContext
from app.routers import patients
from app.services import patient_service
from tests.conftest import seed_staff, set_session_auth


async def _seed_patient(conn, phone="01099998888", name="김환자") -> uuid.UUID:
    # patients.phone은 NOT NULL이라(PTDET-FAMILY-03의 BLOCKED 충돌), 「등록 번호 없음」은
    # 빈 문자열로 모델링한다 — 서비스의 `if phone` 판정에서 빈 문자열은 falsy라 「번호 없음」과
    # 같게 다뤄진다.
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ($1, $2, 'F', $3) returning id",
        name, date(1958, 3, 12), phone if phone is not None else "",
    )


async def _seed_receptionist(conn) -> StaffContext:
    seed = await seed_staff(conn, role="receptionist")
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"],
                        role="receptionist", department_id=None)


async def test_R5_01_직원이_가족을_연결하면_확인_방법이_함께_남는다(db_conn):
    """[PTDET-FAMILY-05][결정 #3 기록부] 관계·확인 경로·실행자를 함께 박는다."""
    staff = await _seed_receptionist(db_conn)
    a, b = await _seed_patient(db_conn), await _seed_patient(db_conn, phone=None)
    await set_session_auth(db_conn, staff.auth_user_id)

    link = await patient_service.link_family_member(
        a, b, relation="모", method="in_person", staff=staff, conn=db_conn)

    row = await db_conn.fetchrow("select * from patient_family_links where id = $1", link)
    assert row["relation"] == "모" and row["is_active"] is True
    assert row["verification_method"] == "in_person"
    assert row["linked_by"] == staff.id and row["linked_at"] is not None


async def test_R5_01_등록_번호가_있으면_예외_경로로_연결할_수_없다(db_conn):
    """[PTDET-FAMILY-04] 저장할 때 다시 판정한다 — 판정은 오직 B의 등록 전화번호 유무."""
    staff = await _seed_receptionist(db_conn)
    a, b = await _seed_patient(db_conn), await _seed_patient(db_conn, phone="01011112222")
    await set_session_auth(db_conn, staff.auth_user_id)

    with pytest.raises(AppError) as e:
        await patient_service.link_family_member(
            a, b, relation="모", method="in_person", staff=staff, conn=db_conn)
    assert e.value.status_code == 409
    assert "등록된 번호가 있어" in e.value.message


async def test_R5_01_OTP_경로는_아직_열리지_않는다(db_conn):
    """[PTDET-FAMILY-04] ⛔ 「없으니 그냥 통과」로 두지 않는다 — 통과시키면 본인확인 없이 연결된다."""
    staff = await _seed_receptionist(db_conn)
    a, b = await _seed_patient(db_conn), await _seed_patient(db_conn, phone="01011112222")
    await set_session_auth(db_conn, staff.auth_user_id)

    with pytest.raises(AppError) as e:
        await patient_service.link_family_member(
            a, b, relation="모", method="otp", staff=staff, conn=db_conn)
    assert e.value.status_code == 501 and "본인확인" in e.value.message


async def test_R5_01_같은_쌍을_두_번_연결하지_않는다(db_conn):
    """[PTDET-FAMILY-01] 살아 있는 연결은 한 쌍에 하나. 해제 후 재연결은 열린다."""
    staff = await _seed_receptionist(db_conn)
    a, b = await _seed_patient(db_conn), await _seed_patient(db_conn, phone=None)
    await set_session_auth(db_conn, staff.auth_user_id)

    await patient_service.link_family_member(a, b, "모", "in_person", staff, conn=db_conn)
    with pytest.raises(AppError) as e:
        await patient_service.link_family_member(a, b, "모", "in_person", staff, conn=db_conn)
    assert e.value.status_code == 409

    await patient_service.unlink_family_member(a, b, reason="본인 요청", staff=staff, conn=db_conn)
    await patient_service.link_family_member(a, b, "모", "in_person", staff, conn=db_conn)   # 다시 열린다


async def test_R5_01_해제는_사유와_실행자를_남긴다(db_conn):
    """[R5-02][결정 #3 기록부] is_active만 내리고 행은 보존한다 — 지우면 「누가 끊었나」가 없다."""
    staff = await _seed_receptionist(db_conn)
    a, b = await _seed_patient(db_conn), await _seed_patient(db_conn, phone=None)
    await set_session_auth(db_conn, staff.auth_user_id)

    link = await patient_service.link_family_member(a, b, "모", "in_person", staff, conn=db_conn)
    await patient_service.unlink_family_member(a, b, reason="본인 요청", staff=staff, conn=db_conn)

    row = await db_conn.fetchrow("select * from patient_family_links where id = $1", link)
    assert row["is_active"] is False and row["unlinked_at"] is not None
    assert row["unlink_reason"] == "본인 요청" and row["unlinked_by"] == staff.id


# ── 라우터 역할 자물쇠 ──────────────────────────────────────────────
def _make_token(auth_user_id: str) -> str:
    payload = {"sub": auth_user_id, "aud": "authenticated", "role": "authenticated",
               "exp": int(time.time()) + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(patients.router)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    return TestClient(app, raise_server_exceptions=False)


async def test_R5_01_의사는_가족을_연결할_수_없다(client, committed_conn):
    """[ROLE-DOC-02] 가족 연결은 접수직원·관리자의 일이다(요구사항 3.5·4.2). 의사는 못 연다."""
    doctor = await seed_staff(committed_conn, role="doctor")
    headers = {"Authorization": f"Bearer {_make_token(str(doctor['auth_user_id']))}"}
    body = {"family_patient_id": str(uuid.uuid4()), "relation": "모", "method": "in_person"}

    res = client.post(f"/patients/{uuid.uuid4()}/family", json=body, headers=headers)
    assert res.status_code == 403
