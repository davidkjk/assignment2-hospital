import asyncio
import time
import uuid
from unittest.mock import MagicMock, patch

import pytest
from jose import jwt

from app.core.config import settings
from app.core.errors import AppError
from app.core.patient_security import PatientContext   # 보정: PatientContext는 patient_security 소유
from app.services import patient_booking_service
from tests.conftest import seed_patient, seed_staff

# ⚠️ 이벤트 루프 함정(conftest _reset_app_db_pool 주석): 앱 전역 풀(get_pool/acquire_as)을 async 테스트
#    루프에서 쓴 뒤(서비스 직접 호출 포함) client(별도 portal 루프)를 부르면, 전역 풀이 서로 다른 루프에
#    묶여 "another operation is in progress"로 충돌한다(기존 직원 통합테스트도 이래서 client 1회·준비는
#    committed_conn). 그래서 이 파일은 ① 데이터 준비를 committed_conn(db_pool=별개 풀) 직접 INSERT로만 하고
#    ② 검증 대상 엔드포인트만 client로 1회 호출한다. 서비스 계층 동시성은 client 없는 테스트에서 검증한다.


def make_token(auth_user_id: str) -> str:
    payload = {"sub": auth_user_id, "aud": "authenticated",
               "role": "authenticated", "exp": int(time.time()) + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def _mock_verified_phone(phone):
    # register_profile이 Supabase Auth admin API로 phone을 조회한다 — 테스트는 검증번호를 스텁한다.
    m = MagicMock(); m.auth.admin.get_user_by_id.return_value.user.phone = phone; return m


async def _seed_auth_user(conn) -> str:
    """가입 전(patients 행 없는 auth 유저) — POST /patient 검증용."""
    uid = uuid.uuid4()
    await conn.execute(
        "insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role) "
        "values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')",
        uid, f"{uid}@test.local")
    return str(uid)


async def _seed_bookable(conn):
    """진료과·의사·빈 슬롯 하나. (department_id, doctor_id, slot_id) 반환."""
    dept = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor = await seed_staff(conn, role="doctor")
    await conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    slot = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, current_date + 7, '10:00', '빈시간') returning id", doctor["staff_id"])
    return dept, doctor["staff_id"], slot


async def _seed_appointment(conn, patient_id, dept, doctor, slot):
    """예약확정 상태의 예약 한 건을 committed_conn으로 직접 넣는다(앱 풀을 안 쓴다 → client와 루프 충돌 없음)."""
    return await conn.fetchval(
        "insert into appointments "
        "(slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source) "
        "values ($1,$2,$2,$3,$4,'감기','예약확정','app') returning id",
        slot, patient_id, dept, doctor)


# ── 인증 경계 ───────────────────────────────────────────────
def test_patient_endpoints_require_auth(client):
    # 토큰이 없으면 401 — 대표 3경로(DB에 닿지 않으므로 client 다회 호출 가능).
    assert client.get("/patient/me").status_code == 401
    assert client.get("/my/appointments").status_code == 401
    assert client.post("/bookings", json={}).status_code == 401


@pytest.mark.asyncio
async def test_unregistered_auth_user_gets_403(client, committed_conn):
    # 토큰은 유효하나 patients 행이 없다 → get_current_patient가 403(등록/중지 구분 안 함).
    uid = await _seed_auth_user(committed_conn)
    assert client.get("/patient/me", headers=_hdr(make_token(uid))).status_code == 403


# ── 프로필: 가입 직후 엔드포인트는 get_current_auth_user_id(/patient, 직원 /patients와 분리) ──
@pytest.mark.asyncio
async def test_register_creates_patient(client, committed_conn):
    uid = await _seed_auth_user(committed_conn)
    with patch("app.services.patient_profile_service.get_admin_client",
               return_value=_mock_verified_phone(None)):
        reg = client.post("/patient", headers=_hdr(make_token(uid)),
                          json={"name": "김환자", "birth_date": "1980-05-05", "gender": "F"})
    assert reg.status_code == 200 and "patient_id" in reg.json()
    row = await committed_conn.fetchrow(
        "select name from patients where id=$1", uuid.UUID(reg.json()["patient_id"]))
    assert row["name"] == "김환자"


@pytest.mark.asyncio
async def test_get_me_returns_profile(client, committed_conn):
    me = await seed_patient(committed_conn, name="박환자")
    r = client.get("/patient/me", headers=_hdr(make_token(str(me["auth_user_id"]))))
    assert r.status_code == 200 and r.json()["name"] == "박환자"


# ── 예약: source는 서버가 'app'으로 고정 ─────────────────────
@pytest.mark.asyncio
async def test_create_booking_via_api_fixes_source_app(client, committed_conn):
    # 멱등(00020)은 서비스 단위테스트가 검증 — 여기선 라우터 배선 + source 고정만.
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)
    body = {"for_patient_id": str(me["patient_id"]), "department_id": str(dept),
            "doctor_id": str(doctor), "slot_id": str(slot), "reason": "감기", "request_id": str(uuid.uuid4())}
    r = client.post("/bookings", headers=_hdr(make_token(str(me["auth_user_id"]))), json=body)
    assert r.status_code == 200
    row = await committed_conn.fetchrow(
        "select source from appointments where id=$1", uuid.UUID(r.json()["appointment_id"]))
    assert row["source"] == "app"                                                     # 클라이언트가 못 바꾼다


@pytest.mark.asyncio
async def test_change_booking_stale_lock_surfaces_409(client, committed_conn):
    # 낙관적 잠금 위반(APPT-RACE-01)이 AppError(409)로 HTTP에 그대로 뜬다.
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)
    appt = await _seed_appointment(committed_conn, me["patient_id"], dept, doctor, slot)
    slot2 = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, current_date + 8, '11:00', '빈시간') returning id", doctor)
    r = client.patch(f"/bookings/{appt}", headers=_hdr(make_token(str(me["auth_user_id"]))),
                     json={"new_slot_id": str(slot2), "reason": "변경",
                           "expected_updated_at": "2000-01-01T00:00:00+00:00"})   # 낡은 시각
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_change_booking_concurrent_same_version_only_one_wins(committed_conn):
    # APPT-RACE-01 동시성(갭 #12): 같은 화면 버전을 본 두 변경 요청이 서로 다른 새 슬롯으로 동시에 진행해도
    # 취소 UPDATE의 낙관적 잠금으로 한쪽만 성공하고 다른 쪽은 409. 서비스 계층을 asyncio.gather로 직접(client 없음).
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)
    ctx = PatientContext(id=me["patient_id"], auth_user_id=me["auth_user_id"])
    old_id = await patient_booking_service.create_booking(
        ctx, for_patient_id=me["patient_id"], department_id=dept,
        doctor_id=doctor, slot_id=slot, reason="감기", request_id=uuid.uuid4())
    slot_a = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, current_date + 8, '11:00', '빈시간') returning id", doctor)
    slot_b = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, current_date + 9, '12:00', '빈시간') returning id", doctor)
    uat = await committed_conn.fetchval("select updated_at from appointments where id=$1", old_id)

    results = await asyncio.gather(
        patient_booking_service.change_booking(ctx, old_id, slot_a, reason="A", expected_updated_at=uat),
        patient_booking_service.change_booking(ctx, old_id, slot_b, reason="B", expected_updated_at=uat),
        return_exceptions=True,
    )
    wins = [r for r in results if not isinstance(r, Exception)]
    losses = [r for r in results if isinstance(r, AppError)]
    assert len(wins) == 1 and len(losses) == 1 and losses[0].status_code == 409
    assert await committed_conn.fetchval("select status from appointments where id=$1", old_id) == "환자취소"
    assert await committed_conn.fetchval(
        "select count(*) from appointments where account_patient_id=$1 and status <> '환자취소'",
        me["patient_id"]) == 1


@pytest.mark.asyncio
async def test_cancel_returns_flag_shape_not_error(client, committed_conn):
    # Task 10 배선 검증: 취소는 오류가 아니라 200 + {cancelled, after_deadline} 모양(막다른 길 금지).
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)                     # current_date+7 = 마감 전
    appt = await _seed_appointment(committed_conn, me["patient_id"], dept, doctor, slot)
    updated = await committed_conn.fetchval("select updated_at from appointments where id=$1", appt)
    r = client.post(f"/bookings/{appt}/cancel", headers=_hdr(make_token(str(me["auth_user_id"]))),
                    json={"expected_updated_at": updated.isoformat()})
    assert r.status_code == 200
    assert r.json()["cancelled"] is True and r.json()["after_deadline"] is False   # 두 칸 모두 온다


# ── 나머지 라우터 배선 스모크(각 client 1회, 준비는 committed_conn) ─────
@pytest.mark.asyncio
async def test_family_add_via_api(client, committed_conn):
    me = await seed_patient(committed_conn)
    add = client.post("/family", headers=_hdr(make_token(str(me["auth_user_id"]))),
                      json={"name": "김가족", "birth_date": "2015-01-01", "gender": "M", "relation": "자녀"})
    assert add.status_code == 200 and "family_patient_id" in add.json()
    assert await committed_conn.fetchval(
        "select count(*) from patient_family_links where account_patient_id=$1 and is_active", me["patient_id"]) == 1


@pytest.mark.asyncio
async def test_family_link_request_miss_is_200_not_404(client, committed_conn):
    """[FAM-LINK-08] HTTP 층에서도 갈리지 않는다 — 없는 환자를 서버로 직접 찔러도 404가 새지 않는다(갭 #58).

    ⚠️ 하네스: client는 1회만 부른다(전역 풀↔포털 루프 충돌 회피). 「hit도 같은 200+request_id」는
       서비스층 test(test_sends_code / test_no_match)가 이미 증명 — 여기선 열거 공격의 핵심인
       「존재하지 않는 후보를 찔렀을 때 404가 아니라 성공 응답」만 HTTP로 못박는다.
    """
    me = await seed_patient(committed_conn)
    miss = client.post("/family/link/request", headers=_hdr(make_token(str(me["auth_user_id"]))),
                       json={"name": "없는사람", "birth_date": "1900-01-01", "phone": "01000000000", "relation": "부모"})
    assert miss.status_code == 200
    assert set(miss.json()) == {"request_id"}   # 「그런 환자 없습니다」가 아니다


@pytest.mark.asyncio
async def test_family_limit_returns_409_with_message(client, committed_conn):
    """[FAM-NEW-10][FAM-NEW-11] 상한은 서버가 거절하고, 화면은 그 문장을 그대로 띄운다."""
    me = await seed_patient(committed_conn)
    for i in range(10):
        fid = await committed_conn.fetchval(
            "insert into patients (name, birth_date, gender, phone, app_created_by) "
            "values ($1,'2010-01-01','M',null,$2) returning id", f"가족{i}", me["patient_id"])
        await committed_conn.execute(
            "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1,$2,'자녀')",
            me["patient_id"], fid)
    r = client.post("/family", headers=_hdr(make_token(str(me["auth_user_id"]))),
                    json={"name": "열한번째", "birth_date": "2010-01-01", "gender": "M", "relation": "자녀"})
    assert r.status_code == 409
    assert "최대 10명" in r.json()["detail"]


@pytest.mark.asyncio
async def test_catalog_departments(client, committed_conn):
    me = await seed_patient(committed_conn)
    await committed_conn.execute("insert into departments (name) values ('정형외과')")
    r = client.get("/catalog/departments", headers=_hdr(make_token(str(me["auth_user_id"]))))
    assert r.status_code == 200 and any(d["name"] == "정형외과" for d in r.json())


@pytest.mark.asyncio
async def test_my_appointments_empty_is_200(client, committed_conn):
    me = await seed_patient(committed_conn)
    r = client.get("/my/appointments", headers=_hdr(make_token(str(me["auth_user_id"]))))
    assert r.status_code == 200 and r.json() == []                                  # 빈 목록도 200(막다른 길 금지)


@pytest.mark.asyncio
async def test_device_token_register_via_api(client, committed_conn):
    me = await seed_patient(committed_conn)
    r = client.post("/device-tokens", headers=_hdr(make_token(str(me["auth_user_id"]))),
                    json={"fcm_token": "fcm-x"})
    assert r.status_code == 200
    assert await committed_conn.fetchval(
        "select count(*) from device_tokens where patient_id=$1 and token='fcm-x'", me["patient_id"]) == 1


@pytest.mark.asyncio
async def test_device_token_unregister_via_api(client, committed_conn):
    # 등록은 committed_conn 직접(준비), 해제 엔드포인트만 client 1회.
    me = await seed_patient(committed_conn)
    await committed_conn.execute(
        "insert into device_tokens (patient_id, token) values ($1,'fcm-y')", me["patient_id"])
    r = client.request("DELETE", "/device-tokens", headers=_hdr(make_token(str(me["auth_user_id"]))),
                       json={"fcm_token": "fcm-y"})
    assert r.status_code == 200
    assert await committed_conn.fetchval(
        "select count(*) from device_tokens where patient_id=$1 and token='fcm-y'", me["patient_id"]) == 0


@pytest.mark.asyncio
async def test_notifications_require_auth(client):
    # 인증 없이는 목록·읽음 어느 것도 열리지 않는다(막다른 길이 아니라 로그인 필요).
    assert client.get("/my/notifications").status_code == 401
    assert client.post("/my/notifications/read", json={}).status_code == 401


# ⚠️ 아래 셋은 read flow를 한 함수에 넣지 않는다 — 이 파일은 「검증 엔드포인트를 client로 1회만」이
#    규칙이다(상단 주석·T10 선례). client를 여러 번 부르면 전역 풀이 서로 다른 루프에 묶여 충돌한다.
#    그래서 준비=committed_conn 직접 INSERT, client 1회 검증, 읽음 뒤 상태도 committed_conn으로 확인한다.
async def _seed_confirmed(conn, patient_id):
    await conn.execute(
        "insert into notification_log (patient_id, notification_type, kind, channel, delivery_status, body) "
        "values ($1,'confirmed','transactional','push','도달','예약이 확정되었습니다.')", patient_id)


@pytest.mark.asyncio
async def test_notifications_unread_count_via_api(client, committed_conn):
    me = await seed_patient(committed_conn)
    await _seed_confirmed(committed_conn, me["patient_id"])
    r = client.get("/my/notifications/unread-count", headers=_hdr(make_token(str(me["auth_user_id"]))))
    assert r.status_code == 200 and r.json()["unread"] == 1          # seen_at null → 안 읽음


@pytest.mark.asyncio
async def test_notifications_list_via_api(client, committed_conn):
    me = await seed_patient(committed_conn)
    await _seed_confirmed(committed_conn, me["patient_id"])
    r = client.get("/my/notifications", headers=_hdr(make_token(str(me["auth_user_id"]))))
    assert r.status_code == 200
    assert r.json()[0]["is_read"] is False and r.json()[0]["body"] == "예약이 확정되었습니다."


@pytest.mark.asyncio
async def test_notifications_read_marks_seen_via_api(client, committed_conn):
    # 읽음 처리(POST /read) 1회 → 상태는 committed_conn으로 확인(seen_at이 채워졌다).
    me = await seed_patient(committed_conn)
    await _seed_confirmed(committed_conn, me["patient_id"])
    r = client.post("/my/notifications/read", headers=_hdr(make_token(str(me["auth_user_id"]))))
    assert r.status_code == 200 and r.json()["ok"] is True
    seen = await committed_conn.fetchval(
        "select notifications_seen_at from patients where id=$1", me["patient_id"])
    assert seen is not None                                          # NOTI-READ-04: 진입 순간 갱신


# ── 설정: 알림 선호 + 진료시간 (Task 28) ─────────────────────
@pytest.mark.asyncio
async def test_알림선호_조회와_토글(client, committed_conn):
    """[SET-NOTI-12] GET로 6토글, PATCH로 하나를 끄면 갱신된 6토글이 온다."""
    me = await seed_patient(committed_conn)
    tok = make_token(str(me["auth_user_id"]))
    r = client.get("/me/notification-preferences", headers=_hdr(tok))
    assert r.status_code == 200 and r.json()["appt_change"] is True
    r2 = client.patch("/me/notification-preferences",
                      json={"group": "appt_change", "enabled": False}, headers=_hdr(tok))
    assert r2.status_code == 200 and r2.json()["appt_change"] is False


@pytest.mark.asyncio
async def test_모르는_그룹은_400(client, committed_conn):
    """[SET-NOTI-12] 화면에 없는 키는 400."""
    me = await seed_patient(committed_conn)
    r = client.patch("/me/notification-preferences",
                     json={"group": "everything", "enabled": False},
                     headers=_hdr(make_token(str(me["auth_user_id"]))))
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_진료시간_조회(client, committed_conn):
    """[SET-HOSP-05] GET /catalog/hospital/hours → 요일 7줄."""
    me = await seed_patient(committed_conn)
    await committed_conn.execute("delete from hospital_hours")
    await committed_conn.execute(
        "insert into hospital_hours (weekday, open_time, close_time) values (1, '09:00', '18:00')")
    r = client.get("/catalog/hospital/hours", headers=_hdr(make_token(str(me["auth_user_id"]))))
    assert r.status_code == 200 and len(r.json()["weekdays"]) == 7
