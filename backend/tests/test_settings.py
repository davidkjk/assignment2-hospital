"""Task 29 /admin/settings 병원 설정 — 서버 (HSET-* · HSETX-*).

실제 인프라 대조 결과 반영:
 - 테스트는 db_conn(롤백 트랜잭션) + set_session_auth + conn=db_conn 주입 패턴을 쓴다
   (doctor_phrases / task13_fixtures와 동일). 서비스는 conn 주입을 받는다.
 - seed_staff는 {auth_user_id, staff_id} dict를 준다 → 감사 changed_by 비교는 staff_id로.
 - 알림 문구 표는 새로 만들지 않고 기존 00013 notification_type_settings(body·also_sms)를 재사용한다.
 - ValidationError는 errors.py에 없다 → settings_service가 로컬로 정의(422).
"""
import uuid

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import settings_service
from app.services.settings_service import ValidationError
from tests.conftest import seed_staff, set_session_auth
from tests.task13_fixtures import seed_department, seed_doctor, seed_patient, to_context


async def _version(conn) -> int:
    return await conn.fetchval("select version from hospital_settings where id")


async def _staff(conn, role: str) -> StaffContext:
    seed = await seed_staff(conn, role=role)
    ctx = to_context(seed, role)
    await set_session_auth(conn, ctx.auth_user_id)
    return ctx


async def _admin(conn) -> StaffContext:
    return await _staff(conn, "admin")


async def _future_slot(conn, doctor_id, hours_ahead: int) -> uuid.UUID:
    # 예약 시각은 appointment_slots(slot_date·start_time)에 있다 → DB now() 기준으로 미래 슬롯을 만든다.
    return await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, (now() + make_interval(hours => $2))::date, "
        "(now() + make_interval(hours => $2))::time, '예약됨') returning id",
        doctor_id, hours_ahead,
    )


@pytest.mark.asyncio
async def test_DATA_01_없는칸이_00051로_생겨_기본값으로_조회된다(db_conn):
    """[HSETX-DATA-01][HSET-BOOK-05][HSET-INFO-01] auto_confirm·주소·전화·문자 칸이 실제로 조회된다."""
    admin = await _admin(db_conn)
    s = await settings_service.get_settings(admin, conn=db_conn)
    assert s["auto_confirm_app_bookings"] is True          # HSET-BOOK-05·HSETX-DEFAULT-01 기본 켜짐
    assert "hospital_address" in s
    assert "hospital_phone" in s
    assert s["sms_enabled"] is True                        # HSETX-DEFAULT-02·결정31 문자 초기 ON


@pytest.mark.asyncio
async def test_DEFAULT_02_문자는_초기ON이고_제공자_연결상태를_함께_준다(db_conn):
    """[HSETX-DEFAULT-02][HSET-SMS-04] 문자 초기 ON이되 제공자 연결 상태를 노출(무음 실패 방지)."""
    admin = await _admin(db_conn)
    s = await settings_service.get_settings(admin, conn=db_conn)
    assert s["sms_enabled"] is True
    assert s["sms_provider_connected"] in (True, False)


@pytest.mark.asyncio
async def test_MSG_06_24_알림은_열종이고_override없으면_코드기본이_보인다(db_conn):
    """[HSET-MSG-06][HSET-MSG-24] 알림 10종, override 없으면 코드 MESSAGES 기본 문구."""
    admin = await _admin(db_conn)
    s = await settings_service.get_settings(admin, conn=db_conn)
    assert len(s["notifications"]) == 10
    assert s["notifications"]["confirmed"]["body"]                 # 코드 기본이 보인다
    assert s["notifications"]["confirmed"]["is_default"] is True   # override 없음


@pytest.mark.asyncio
async def test_DATA_02_03_한번조회로_문자여부와_예정휴무를_함께_준다(db_conn):
    """[HSETX-DATA-02][HSETX-DATA-03][HSETX-API-01] 알림 행에 send_sms(문자여부), 예정 휴무 읽기 전용."""
    admin = await _admin(db_conn)
    s = await settings_service.get_settings(admin, conn=db_conn)
    assert "send_sms" in s["notifications"]["confirmed"]
    assert isinstance(s["upcoming_closures"], list)


@pytest.mark.asyncio
async def test_NAV_05_SEC_01_관리자만_읽고_환자앱엔_주소전화만_노출(db_conn):
    """[HSET-NAV-05][HSETX-SEC-01] 관리자 아닌 역할은 설정 거절. 환자 앱 창구는 주소·전화만."""
    # 시드(INSERT)는 owner 롤에서 먼저 끝낸다 — set_session_auth 뒤엔 authenticated라 INSERT가 막힌다.
    admin = to_context(await seed_staff(db_conn, role="admin"), "admin")
    others = [to_context(await seed_staff(db_conn, role=r), r) for r in ("receptionist", "doctor")]
    await set_session_auth(db_conn, admin.auth_user_id)
    assert await settings_service.get_settings(admin, conn=db_conn)
    for staff in others:
        await set_session_auth(db_conn, staff.auth_user_id)
        with pytest.raises(AppError) as e:
            await settings_service.get_settings(staff, conn=db_conn)
        assert e.value.status_code == 403
    await set_session_auth(db_conn, admin.auth_user_id)
    pub = await settings_service.get_public_hospital_info(conn=db_conn)
    assert set(pub) <= {"hospital_address", "hospital_phone"}       # 취소마감·자동확정 안 샘


@pytest.mark.asyncio
async def test_SAVE_01_AUDIT_02_스칼라_저장은_전값후값을_같은_트랜잭션으로_남긴다(db_conn):
    """[HSET-SAVE-01][HSETX-AUDIT-01][HSETX-AUDIT-02] 행위자·키·전값·후값을 설정 전용 표에."""
    admin = await _admin(db_conn)
    await settings_service.save_settings(
        admin, patch={"cancellation_deadline_hours": 48}, base_version=await _version(db_conn), conn=db_conn)
    row = await db_conn.fetchrow(
        "select changed_by, setting_key, old_value, new_value "
        "from settings_audit_log order by changed_at desc limit 1")
    assert row["setting_key"] == "cancellation_deadline_hours"
    assert row["old_value"] == "24"
    assert row["new_value"] == "48"
    assert row["changed_by"] == admin.id


@pytest.mark.asyncio
async def test_DATA_04_빈문구는_저장을_통째로_막아_스칼라도_안들어간다(db_conn):
    """[HSET-SAVE-01][HSETX-DATA-04][HSET-MSG-25] 원자 — 알림 문구가 위반이면 취소마감도 안 바뀐다."""
    admin = await _admin(db_conn)
    before = (await settings_service.get_settings(admin, conn=db_conn))["cancellation_deadline_hours"]
    with pytest.raises(ValidationError):
        await settings_service.save_settings(
            admin,
            patch={"cancellation_deadline_hours": 48,
                   "notifications": {"confirmed": {"body_override": "  "}}},
            base_version=await _version(db_conn), conn=db_conn)
    after = (await settings_service.get_settings(admin, conn=db_conn))["cancellation_deadline_hours"]
    assert after == before


@pytest.mark.asyncio
async def test_STATE_03_낡은_버전으로_저장하면_409(db_conn):
    """[HSETX-STATE-03][HSETX-API-04] 다른 관리자가 먼저 저장하면 버전 충돌 409."""
    admin = await _admin(db_conn)
    v = await _version(db_conn)
    await settings_service.save_settings(
        admin, patch={"cancellation_deadline_hours": 12}, base_version=v, conn=db_conn)
    with pytest.raises(AppError) as e:
        await settings_service.save_settings(
            admin, patch={"cancellation_deadline_hours": 6}, base_version=v, conn=db_conn)
    assert e.value.status_code == 409


@pytest.mark.asyncio
async def test_VALID_01_취소마감0허용_200거부_오래대기0과181거부(db_conn):
    """[HSETX-VALID-01][HSET-BOOK-01][HSET-WAIT-03] 취소 마감 0~168, 오래 대기 1~180."""
    admin = await _admin(db_conn)
    await settings_service.save_settings(
        admin, patch={"cancellation_deadline_hours": 0}, base_version=await _version(db_conn), conn=db_conn)
    for bad in ({"cancellation_deadline_hours": 200},
                {"long_wait_threshold_minutes": 0},
                {"long_wait_threshold_minutes": 181}):
        with pytest.raises(ValidationError):
            await settings_service.save_settings(
                admin, patch=bad, base_version=await _version(db_conn), conn=db_conn)


@pytest.mark.asyncio
async def test_API_03_취소마감_미리보기는_건수만_준다(db_conn):
    """[HSETX-API-03][HSET-SAVE-06] preview_cancellation_deadline — 마감 후가 되는 미래 예약 건수만."""
    # 시드 먼저(owner), 세션은 나중에.
    admin = to_context(await seed_staff(db_conn, role="admin"), "admin")
    dept = await seed_department(db_conn)
    doctor = await seed_doctor(db_conn, dept)
    patient = await seed_patient(db_conn)
    slot = await _future_slot(db_conn, doctor["staff_id"], hours_ahead=10)
    await db_conn.execute(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, "
        "doctor_id, status, source) values ($1,$2,$2,$3,$4,'예약확정','staff')",
        slot, patient, dept, doctor["staff_id"])
    await set_session_auth(db_conn, admin.auth_user_id)
    n = await settings_service.preview_cancellation_deadline(admin, new_hours=48, conn=db_conn)
    assert isinstance(n, int)
    assert n >= 1


@pytest.mark.asyncio
async def test_MSG_22_24_되돌리기는_DB값을_지워_코드기본으로_돌린다(db_conn):
    """[HSET-MSG-22][HSET-MSG-24] 줄 되돌리기 = notification_type_settings의 body를 null로."""
    admin = await _admin(db_conn)
    await settings_service.save_settings(
        admin, patch={"notifications": {"confirmed": {"body_override": "새 문구"}}},
        base_version=await _version(db_conn), conn=db_conn)
    mid = (await settings_service.get_settings(admin, conn=db_conn))["notifications"]["confirmed"]
    assert mid["body"] == "새 문구"
    assert mid["is_default"] is False
    await settings_service.save_settings(
        admin, patch={"notifications": {"confirmed": {"body_override": None}}},
        base_version=await _version(db_conn), conn=db_conn)
    back = (await settings_service.get_settings(admin, conn=db_conn))["notifications"]["confirmed"]
    assert back["is_default"] is True                              # 코드 기본으로 복귀


@pytest.mark.asyncio
async def test_SMS_06_알림행의_문자여부를_저장하고_읽는다(db_conn):
    """[HSET-SMS-06][HSETX-DATA-02] 문자여부는 알림 행이 원본."""
    admin = await _admin(db_conn)
    await settings_service.save_settings(
        admin, patch={"notifications": {"confirmed": {"send_sms": True}}},
        base_version=await _version(db_conn), conn=db_conn)
    s = await settings_service.get_settings(admin, conn=db_conn)
    assert s["notifications"]["confirmed"]["send_sms"] is True


@pytest.mark.asyncio
async def test_SEC_02_비밀키는_변경됨만_남긴다(db_conn):
    """[HSETX-SEC-02] 제공자 비밀키 계열은 감사 본문에 값 대신 '변경됨'만."""
    assert settings_service.is_secret_key("sms_provider_token") is True
    assert settings_service.is_secret_key("cancellation_deadline_hours") is False


def test_MSG_17_시각토큰은_슬롯없는_예약에서_그자리만_조용히_빠진다():
    """[HSET-MSG-17][HSET-MSG-18] {시각}이 없는 당일 접수에선 그 자리만 빠지고 None/빈칸이 안 나간다."""
    body = settings_service.fill_tokens("{날짜} {시각} 예약", {"날짜": "8월 12일", "시각": None})
    assert body == "8월 12일 예약"
    assert "None" not in body
    assert "{시각}" not in body
