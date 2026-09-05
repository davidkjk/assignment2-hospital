"""[SCHED-WEEK-03 「하루 최대 인원」 강제 · A5] create_appointment의 정원 강제.

의사별 하루 최대 예약 인원(doctor_schedule_rules.max_daily_appointments)은 지금까지
설정·표시로만 존재하고 예약 생성에서 강제되지 않았다(요구사항 3.7 :183 「의사별 하루 최대
예약 인원」). 이 파일은 그 강제를 못박는다:

  · 정원을 채운 날 직원 예약은 막힌다(409, detail.reason='over_daily_max').
  · 「경고 후 허용」(사용자 결정 2026-08-29): allow_over_daily_max=True면 넘긴다.
    창구는 당일 급한 환자·전화예약 때문에 융통성이 필요하다(막다른 길 금지).
  · 당일 방문(walk-in)은 이미 온 환자라 정원과 무관하게 항상 받는다.
  · 산정 대상은 살아 있는 예약뿐 — 취소·부도(환자취소·병원취소·예약부도)는 세지 않는다.

DB now()로 지난 시각을 재므로(클럭 스큐 회피) 테스트도 「지금」 기준 상대 시각을 쓴다.
"""
from datetime import datetime, time, timedelta, timezone

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import appointment_service
from tests.conftest import seed_staff, set_session_auth


def _ctx(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


def _snap5(dt: datetime) -> datetime:
    return dt.replace(minute=dt.minute - dt.minute % 5, second=0, microsecond=0)


async def _seed(db_conn) -> dict:
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동','1985-03-01','M','01012345678') returning id"
    )
    await set_session_auth(db_conn, receptionist["auth_user_id"])
    return {
        "receptionist": _ctx(receptionist, "receptionist"),
        "doctor_id": doctor["staff_id"],
        "patient_id": patient_id,
    }


async def _set_rule(conn, doctor_id, day, *, max_daily: int, slot_minutes: int = 15) -> None:
    """그 요일의 진료 규칙을 심고 하루 최대 인원을 못박는다. 규칙 관리는 admin 전용(RLS)이라
    시딩 동안만 postgres로 올렸다가 예약 호출을 위해 authenticated로 되돌린다."""
    await conn.execute("reset role")
    try:
        await conn.execute(
            "delete from doctor_schedule_rules where doctor_id = $1 and weekday = $2",
            doctor_id, day.weekday(),
        )
        await conn.execute(
            """
            insert into doctor_schedule_rules
                (doctor_id, weekday, is_day_off, start_time, end_time,
                 lunch_start, lunch_end, slot_duration_minutes, max_daily_appointments)
            values ($1, $2, false, $3, $4, null, null, $5, $6)
            """,
            doctor_id, day.weekday(), time(0, 0), time(23, 59, 59), slot_minutes, max_daily,
        )
    finally:
        await conn.execute("set local role authenticated")


def _future5(**kw) -> datetime:
    return _snap5(datetime.now(timezone.utc) + timedelta(**kw))


async def _phone(conn, ctx, at, *, allow_over_daily_max: bool = False):
    return await appointment_service.create_phone_appointment(
        staff=ctx["receptionist"],
        patient_id=ctx["patient_id"],
        doctor_id=ctx["doctor_id"],
        start_at=at,
        reason="감기",
        allow_over_daily_max=allow_over_daily_max,
        conn=conn,
    )


@pytest.mark.asyncio
async def test_정원을_채운_날_직원_예약은_막힌다(db_conn):
    """[A5] max_daily=1인 날에 한 건이 차면 같은 날 두 번째 예약은 409로 막힌다."""
    ctx = await _seed(db_conn)
    base = _future5(hours=3)
    await _set_rule(db_conn, ctx["doctor_id"], base.date(), max_daily=1)
    await _phone(db_conn, ctx, base)  # 1건 = 정원
    with pytest.raises(AppError) as exc:
        await _phone(db_conn, ctx, base + timedelta(minutes=30))  # 같은 날 2건째
    assert exc.value.status_code == 409
    assert (exc.value.detail or {}).get("reason") == "over_daily_max"


@pytest.mark.asyncio
async def test_경고_후_허용_오버라이드로_정원을_넘길_수_있다(db_conn):
    """[A5] allow_over_daily_max=True면 정원을 넘겨 예약할 수 있다(창구 융통성)."""
    ctx = await _seed(db_conn)
    base = _future5(hours=3)
    await _set_rule(db_conn, ctx["doctor_id"], base.date(), max_daily=1)
    await _phone(db_conn, ctx, base)
    ok = await _phone(db_conn, ctx, base + timedelta(minutes=30), allow_over_daily_max=True)
    assert ok is not None


@pytest.mark.asyncio
async def test_당일_방문은_정원과_무관하게_항상_받는다(db_conn):
    """[A5] 이미 온 환자를 돌려보낼 수 없다 — walk-in은 정원 검사를 건너뛴다."""
    ctx = await _seed(db_conn)
    base = _future5(hours=3)
    await _set_rule(db_conn, ctx["doctor_id"], base.date(), max_daily=1)
    await _phone(db_conn, ctx, base)  # 정원 참
    ok = await appointment_service.create_walkin_appointment(
        staff=ctx["receptionist"], patient_id=ctx["patient_id"],
        doctor_id=ctx["doctor_id"], reason="복통", conn=db_conn,
    )
    assert ok is not None


@pytest.mark.asyncio
async def test_취소된_예약은_정원에_세지_않는다(db_conn):
    """[A5] 산정 대상은 살아 있는 예약뿐 — 취소하면 그 자리는 다시 열린다."""
    ctx = await _seed(db_conn)
    base = _future5(hours=3)
    await _set_rule(db_conn, ctx["doctor_id"], base.date(), max_daily=1)
    first = await _phone(db_conn, ctx, base)
    await db_conn.execute("reset role")
    await db_conn.execute("update appointments set status = '환자취소' where id = $1", first)
    await db_conn.execute("set local role authenticated")
    ok = await _phone(db_conn, ctx, base + timedelta(minutes=30))  # 취소분은 안 세니 통과
    assert ok is not None


@pytest.mark.asyncio
async def test_allow_over_daily_max_기본값은_거짓이다(db_conn):
    """[A5] 시그니처 기본값이 False라야 화면을 거치지 않은 경로가 조용히 정원을 넘지 않는다."""
    import inspect
    for fn in (appointment_service.create_appointment, appointment_service.create_phone_appointment):
        default = inspect.signature(fn).parameters["allow_over_daily_max"].default
        assert default is False
