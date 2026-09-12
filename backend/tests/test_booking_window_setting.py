"""[SCHED-SLOT-09][SCHED-WINDOW-*] 예약 가능 기간(주)을 관리자가 바꾸는 창구.

지금까지 `REGENERATION_WEEKS=8`이 파이썬 상수라 병원이 바꿀 수 없었다. hospital_settings에
`booking_window_weeks`를 두어 1~26주로 바꾸게 하고, 슬롯 생성·예약 검증·문자 예약·대시보드가
이 값을 읽는다. 줄이면 범위 밖 빈 자리는 지우되 이미 잡힌 예약은 남긴다(SCHED-SLOT-05).
"""
import pytest

from app.services import settings_service
from app.services.settings_service import ValidationError


async def test_기본값은_8주다(db_conn):
    """[SCHED-SLOT-09] 마이그 기본은 기존 상수와 같은 8주 — 바꾸기 전엔 동작 불변."""
    weeks = await db_conn.fetchval("select booking_window_weeks from hospital_settings where id")
    assert weeks == 8


async def test_예약기간을_읽는_헬퍼는_설정값을_준다(db_conn):
    """[SCHED-WINDOW-01] 상수 대신 이 헬퍼로 읽는다 — 병원이 바꾸면 전부 따라간다."""
    assert await settings_service.get_booking_window_weeks(db_conn) == 8
    await db_conn.execute("update hospital_settings set booking_window_weeks = 12 where id")
    assert await settings_service.get_booking_window_weeks(db_conn) == 12


def test_범위는_1주에서_26주다():
    """[SCHED-WINDOW-02] 0주·27주는 막다른 길 없이 사람 문장으로 막는다."""
    settings_service._validate({"booking_window_weeks": 1})
    settings_service._validate({"booking_window_weeks": 26})
    for bad in (0, 27, -1):
        with pytest.raises(ValidationError):
            settings_service._validate({"booking_window_weeks": bad})


async def test_저장하면_읽기에_반영된다(db_conn):
    """[SCHED-WINDOW-01] booking_window_weeks는 저장 허용 칸(화이트리스트)이다."""
    assert "booking_window_weeks" in settings_service._SCALAR_COLUMNS
    saved = dict(settings_service._scalar_items({"booking_window_weeks": 20}))
    assert saved == {"booking_window_weeks": 20}


async def test_미리보기는_새_범위_밖_예약_건수를_센다(db_conn):
    """[SCHED-WINDOW-05] 줄이기 전 확인창용 — 새 범위 밖에 이미 잡힌(유지될) 예약 건수만.
    이름·전화는 세지 않는다(개수뿐). 이 예약들은 줄여도 유효하게 남는다(SCHED-SLOT-05)."""
    from datetime import timedelta

    from app.core.security import StaffContext
    from tests.conftest import seed_patient, seed_staff
    from tests.task13_fixtures import seed_department, seed_doctor

    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    pat = await seed_patient(db_conn)
    admin = StaffContext(id=(await seed_staff(db_conn, role="admin"))["staff_id"],
                         auth_user_id=None, role="admin", department_id=None)

    today = await db_conn.fetchval("select current_date")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, $2, '10:00', '예약됨') returning id",
        doc["staff_id"], today + timedelta(weeks=7))
    await db_conn.execute(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, "
        "doctor_id, status, source) values ($1,$2,$2,$3,$4,'예약확정','staff')",
        slot_id, pat["patient_id"], dept, doc["staff_id"])

    # 4주로 줄이면 7주째 예약 1건이 범위 밖 → 1
    assert await settings_service.preview_booking_window(admin, 4, conn=db_conn) == 1
    # 8주면 7주째는 범위 안 → 0
    assert await settings_service.preview_booking_window(admin, 8, conn=db_conn) == 0


async def test_저장하면_전_의사_슬롯을_재생성한다(db_conn):
    """[SCHED-WINDOW-03] 예약 기간을 저장하면 전 의사 격자를 새로 만든다 — 줄이면 범위 밖
    빈칸이 사라진다(막다른 길 방지). 늘리면 새 주에 빈칸이 생긴다."""
    from datetime import time, timedelta

    from app.core.security import StaffContext
    from app.services import slot_generator
    from app.services.schedule_admin_service import save_week_rules
    from tests.conftest import seed_staff, set_session_auth
    from tests.task13_fixtures import seed_department, seed_doctor

    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    rows = [{"weekday": wd, "is_day_off": False, "start": time(9), "end": time(12),
             "slot_minutes": 30, "lunch_start": None, "lunch_end": None, "max_daily": 30}
            for wd in range(7)]
    await save_week_rules(db_conn, doc["staff_id"], rows, staff=None)
    await slot_generator.regenerate_all_doctors(db_conn, 8)

    today = await db_conn.fetchval("select current_date")
    far = today + timedelta(weeks=6)                       # 4주로 줄이면 범위 밖
    assert await db_conn.fetchval(
        "select count(*) from appointment_slots where doctor_id=$1 and slot_date=$2 and status='빈시간'",
        doc["staff_id"], far) > 0

    admin = await seed_staff(db_conn, role="admin")
    admin_ctx = StaffContext(id=admin["staff_id"], auth_user_id=admin["auth_user_id"],
                             role="admin", department_id=None)
    ver = await db_conn.fetchval("select version from hospital_settings where id")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await settings_service.save_settings(admin_ctx, {"booking_window_weeks": 4}, ver, conn=db_conn)
    await db_conn.execute("reset role")

    assert await db_conn.fetchval(
        "select count(*) from appointment_slots where doctor_id=$1 and slot_date=$2 and status='빈시간'",
        doc["staff_id"], far) == 0, "저장 시 재생성으로 범위 밖 빈칸이 사라져야"
