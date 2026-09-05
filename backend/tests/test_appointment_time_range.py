"""[CAL-GAP-06·08·09][CAL-PAST-07][CAL-TIME-03][SCHED-SLOT-11] create_phone_appointment.

전화예약은 5분 단위 어디에나 잡히지만(CAL-TIME-03), 서버가 세 가지를 최종 심판한다:
  · 지난 시각은 만들 수 없다(CAL-PAST-07, 갭 #84 — 화면만 막으면 반쪽).
  · 시작 시각은 5분 격자를 벗어날 수 없다(CAL-TIME-03 — API 직접 호출로 10:07이 들어온다).
  · 같은 의사·같은 시각 시작은 막고(CAL-GAP-08), 부분 겹침은 allow_overlap일 때만 통과한다(CAL-GAP-06·09).
  · 휴진·점심 등 닫힌 시간에는 잡히지 않는다(SCHED-SLOT-11 — resolve_day가 유일 판정기).

DB now()로 지난 시각을 재므로(클럭 스큐 회피) 테스트도 「지금」 기준 상대 시각을 쓴다.
"""
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import appointment_service
from tests.conftest import seed_staff, set_session_auth


def _ctx(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


def _snap5(dt: datetime) -> datetime:
    """5분 격자에 붙이고 초·마이크로초를 지운다 — 테스트가 스냅 규칙에 걸리지 않게."""
    return dt.replace(minute=dt.minute - dt.minute % 5, second=0, microsecond=0)


async def _seed(db_conn) -> dict:
    admin = await seed_staff(db_conn, role="admin")
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


async def _set_rule(
    conn, doctor_id, day, *,
    slot_minutes: int = 15,
    start: time = time(0, 0),
    end: time = time(23, 59, 59),
    is_day_off: bool = False,
    lunch: tuple[time, time] | None = None,
) -> None:
    """그 요일의 진료 규칙을 심는다. resolve_day가 이 규칙을 읽는다.

    규칙 관리는 admin 전용(RLS)이고 DELETE 권한도 없어, 시딩 동안만 postgres로 올렸다가
    예약 호출을 위해 authenticated로 되돌린다(예약은 authenticated로 실행돼야 트리거가 auth.uid()를 읽는다).
    """
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
            values ($1, $2, $3, $4, $5, $6, $7, $8, 100)
            """,
            doctor_id, day.weekday(), is_day_off, start, end,
            lunch[0] if lunch else None, lunch[1] if lunch else None, slot_minutes,
        )
    finally:
        await conn.execute("set local role authenticated")


async def _book(conn, ctx: dict, start_at: datetime, *, minutes: int = 15, allow_overlap: bool = False,
                open_day: bool = True):
    if open_day:
        await _set_rule(conn, ctx["doctor_id"], start_at.date(), slot_minutes=minutes)
    return await appointment_service.create_phone_appointment(
        staff=ctx["receptionist"],
        patient_id=ctx["patient_id"],
        doctor_id=ctx["doctor_id"],
        start_at=start_at,
        reason="감기",
        allow_overlap=allow_overlap,
        conn=conn,
    )


def _future5(**kw) -> datetime:
    return _snap5(datetime.now(timezone.utc) + timedelta(**kw))


@pytest.mark.asyncio
async def test_같은_의사_같은_시각_시작은_서버가_막는다(db_conn):
    """[CAL-GAP-08] :112 — 모르고 같은 자리에 두 명은 막는다. allow_overlap으로도 못 뚫는다."""
    ctx = await _seed(db_conn)
    at = _future5(hours=3)
    await _book(db_conn, ctx, at)
    with pytest.raises(AppError) as exc:
        await _book(db_conn, ctx, at, allow_overlap=True)
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_부분_겹침은_allow_overlap이_참일_때만_통과한다(db_conn):
    """[CAL-GAP-06] allow_overlap은 직원이 경고를 읽고 [그대로 잡기]를 눌렀다는 사실이다.
    기본 False — 화면을 거치지 않은 호출은 겹칠 수 없다."""
    ctx = await _seed(db_conn)
    base = _future5(hours=3)
    await _book(db_conn, ctx, base, minutes=15)  # base ~ base+15
    with pytest.raises(AppError):
        await _book(db_conn, ctx, base + timedelta(minutes=5))  # 기본 False → 막힌다
    ok = await _book(db_conn, ctx, base + timedelta(minutes=5), allow_overlap=True)
    assert ok is not None


@pytest.mark.asyncio
async def test_allow_overlap_기본값은_거짓이다(db_conn):
    """[CAL-GAP-06] 시그니처의 기본값이 False라야 화면을 거치지 않은 경로가 조용히 겹치지 않는다."""
    import inspect
    default = inspect.signature(appointment_service.create_phone_appointment).parameters["allow_overlap"].default
    assert default is False


@pytest.mark.asyncio
async def test_지난_시각에는_예약을_만들_수_없다(db_conn):
    """[CAL-PAST-07] 갭 #84 — 화면만 막으면 반쪽이다. 서버가 지난 시각을 400으로 막는다."""
    ctx = await _seed(db_conn)
    past = _snap5(datetime.now(timezone.utc) - timedelta(hours=2))
    with pytest.raises(AppError) as exc:
        await _book(db_conn, ctx, past)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_시작_시각이_5분_격자를_벗어나면_거절한다(db_conn):
    """[CAL-TIME-03] 화면의 snapTo5min과 서버가 같은 규칙을 쓴다 — API 직접 호출로 10:07이 들어온다."""
    ctx = await _seed(db_conn)
    off = _future5(hours=3) + timedelta(minutes=2)  # …:07처럼 격자를 벗어난다
    with pytest.raises(AppError) as exc:
        await _book(db_conn, ctx, off)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_휴진일에는_예약을_만들_수_없다(db_conn):
    """[SCHED-SLOT-11] 자리를 안 만드는 것만으로는 부족하다 — 직원은 격자 밖 5분 단위
    어디에나 잡으므로, 판정기(resolve_day)가 닫힌 날을 열려 있다고 답하면 휴진일에 예약이 들어온다."""
    ctx = await _seed(db_conn)
    at = _future5(hours=3)
    await _set_rule(db_conn, ctx["doctor_id"], at.date(), is_day_off=True)
    with pytest.raises(AppError) as exc:
        await _book(db_conn, ctx, at, open_day=False)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_점심시간에는_예약을_만들_수_없다(db_conn):
    """[SCHED-SLOT-11][CAL-SLOT-08·09] 점심은 「예약을 못 잡는 구간」이다 — resolve_day가 판정한다."""
    ctx = await _seed(db_conn)
    at = _future5(hours=3)
    lunch_start = at.time().replace(minute=at.time().minute - at.time().minute % 5, second=0, microsecond=0)
    await _set_rule(
        db_conn, ctx["doctor_id"], at.date(),
        lunch=(lunch_start, (datetime.combine(at.date(), lunch_start) + timedelta(minutes=30)).time()),
    )
    with pytest.raises(AppError) as exc:
        await _book(db_conn, ctx, at, open_day=False)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_길이는_의사별_slot_duration으로_정해진다(db_conn):
    """[CAL-TIME-09] end_at은 의사별 slot_duration_minutes가 정한다 — 10:05에 찍으면 10:05–10:20(15분)."""
    ctx = await _seed(db_conn)
    at = _future5(hours=3)
    appt_id = await _book(db_conn, ctx, at, minutes=15)
    row = await db_conn.fetchrow("select start_at, end_at from appointments where id = $1", appt_id)
    assert (row["end_at"] - row["start_at"]) == timedelta(minutes=15)


@pytest.mark.asyncio
async def test_예약_가능_범위_8주를_넘으면_거절한다(db_conn):
    """[SCHED-SLOT-09][CAL-BOOK-14] 그 너머는 **추천 자리가 아예 만들어지지 않은 구간**이다.

    ⭐ 화면만 막으면 반쪽이다(지난 시각 갭 #84와 같은 이유) — 다른 경로로 8주 너머 예약이
       들어오면 캘린더에는 그려지는데 직원은 그 날로 갈 수 없어 **손댈 수 없는 예약**이 된다.
    📌 안내 문자 예약은 이미 같은 상수로 막고 있었다(`message_service.py`, MSGX-SCHED-01) —
       정작 진료 예약이 안 막혀 계약이 갈려 있었다.
    """
    ctx = await _seed(db_conn)
    too_far = _future5(weeks=8, days=1)
    with pytest.raises(AppError) as exc:
        await _book(db_conn, ctx, too_far)
    assert exc.value.status_code == 400
    assert "8주" in exc.value.message


@pytest.mark.asyncio
async def test_예약_가능_범위_안이면_통과한다(db_conn):
    """[SCHED-SLOT-09] 경계 안쪽은 그대로 잡힌다 — 막는 것은 범위 밖뿐이다."""
    ctx = await _seed(db_conn)
    appt_id = await _book(db_conn, ctx, _future5(weeks=7))
    assert appt_id is not None


@pytest.mark.asyncio
async def test_예약_가능_범위는_날짜_단위다_마지막_날_늦은_시각도_통과한다(db_conn):
    """[SCHED-SLOT-09] 슬롯 생성이 `오늘 ~ 오늘+8주`를 **날짜로** 덮으므로(slot_generator) 경계도 날짜다.

    ⛔ 시각으로 재면 마지막 날 오후가 거절되어, 달력이 허용한 날을 서버가 막는 **막다른 길**이 된다.
    """
    ctx = await _seed(db_conn)
    last_day = await db_conn.fetchval("select (current_date + interval '8 weeks')::date")
    # 「마지막 날 오후」는 병원 시간(Asia/Seoul) 기준이어야 한다 — UTC 17:00으로 만들면 KST로는
    # 다음 날 새벽 02:00이라 last_day+1이 되어(프로덕션 풀도 Asia/Seoul) 거절된다. 병원 시각으로 잡는다.
    late = datetime.combine(last_day, time(17, 0), tzinfo=ZoneInfo("Asia/Seoul"))
    assert await _book(db_conn, ctx, late) is not None


@pytest.mark.asyncio
async def test_예약_가능_범위는_병원_설정을_따른다(db_conn):
    """[SCHED-WINDOW-01] 8주는 하드코딩이 아니라 hospital_settings.booking_window_weeks다 —
    병원이 2주로 줄이면 서버 검증도 2주로 좁힌다(화면·문자·검증이 한 숫자로 움직인다)."""
    ctx = await _seed(db_conn)
    # 설정 변경은 관리자만(RLS) — 테스트에선 잠시 superuser로 바꾸고 접수직원 컨텍스트로 되돌린다.
    await db_conn.execute("reset role")
    await db_conn.execute("update hospital_settings set booking_window_weeks = 2 where id")
    await set_session_auth(db_conn, ctx["receptionist"].auth_user_id)

    with pytest.raises(AppError) as exc:
        await _book(db_conn, ctx, _future5(weeks=3))   # 2주 설정에선 3주는 범위 밖
    assert exc.value.status_code == 400 and "2주" in exc.value.message

    ok = await _book(db_conn, ctx, _future5(weeks=1))   # 범위 안은 그대로 통과
    assert ok is not None
