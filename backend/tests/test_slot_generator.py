"""[SCHED-SLOT-01·02·04·05·09·10] 추천 자리(격자) 재생성.

⭐ 격자는 「환자에게 보여줄 목록」이다(SCHED-SLOT-02) — 환자에게 "몇 시에 오실래요?"를 빈칸으로
   물을 수 없어서 만든다. 직원은 격자 밖 5분 단위 어디에나 잡는다(CAL-TIME-09).
⭐ 한 칸 길이(step_minutes)는 ①진료 한 건의 길이 ②환자 앱 추천 자리 간격 둘만 정한다.
   ⛔ 「예약할 수 있는 시각」이 아니다 — 그것으로 착각한 것이 갭 #97이었다.
⭐ 판정은 하나뿐 — 재생성도 resolve_day를 부른다(휴진·휴무·예외를 같은 자로 본다).
"""
import uuid
from datetime import time, timedelta

from app.services.schedule_admin_service import save_week_rules, upsert_doctor_exception
from app.services.slot_generator import REGENERATION_WEEKS, regenerate_slots


async def _dept(conn) -> uuid.UUID:
    return await conn.fetchval("insert into departments (name) values ('내과') returning id")


async def _doctor(conn, dept) -> uuid.UUID:
    auth_id = uuid.uuid4()
    await conn.execute(
        "insert into auth.users (id, email, encrypted_password, email_confirmed_at, "
        "created_at, updated_at, aud, role) "
        "values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')",
        auth_id, f"{auth_id}@test.local",
    )
    return await conn.fetchval(
        "insert into staff (auth_user_id, name, role, department_id, is_active) "
        "values ($1, '김의사', 'doctor', $2, true) returning id",
        auth_id, dept,
    )


def _row(weekday, **kw):
    return {"weekday": weekday, "is_day_off": kw.get("is_day_off", False),
            "start": kw.get("start", time(9)), "end": kw.get("end", time(12)),
            "slot_minutes": kw.get("slot_minutes", 30),
            "lunch_start": kw.get("lunch_start"), "lunch_end": kw.get("lunch_end"),
            "max_daily": 30}


async def _today(conn):
    return await conn.fetchval("select current_date")


async def _slot_times(conn, doctor, day):
    rows = await conn.fetch(
        "select start_time from appointment_slots where doctor_id=$1 and slot_date=$2 order by start_time",
        doctor, day,
    )
    return [r["start_time"] for r in rows]


async def test_한_칸_길이를_step_minutes로_돌려준다(db_conn):
    """[SCHED-SLOT-01] step_minutes를 빼면 두 테스트가 서로 어긋난다 — 반드시 돌려준다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    await save_week_rules(db_conn, doc, [_row(0, slot_minutes=15)], staff=None)
    r = await regenerate_slots(db_conn, doc, dry_run=True)
    assert r["step_minutes"] == 15


async def test_추천_자리를_계속_만든다(db_conn):
    """[SCHED-SLOT-02] 환자용 추천 자리는 계속 만든다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    await save_week_rules(db_conn, doc, [_row(0), _row(1), _row(2), _row(3), _row(4)], staff=None)
    r = await regenerate_slots(db_conn, doc, dry_run=True)
    assert r["created"] > 0


async def test_빈자리는_한_칸_길이_간격으로_점심을_건너뛰고_생긴다(db_conn):
    """[SCHED-SLOT-01] 9~12시, 한 칸 30분, 점심 10~10:30이면 10:00은 없고 10:30부터 다시 생긴다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    today = await _today(db_conn)
    target = today + timedelta(days=7)      # 8주 안, 오늘이 아닌 확실한 한 날
    await save_week_rules(db_conn, doc, [
        _row(target.weekday(), start=time(9), end=time(12), slot_minutes=30,
             lunch_start=time(10), lunch_end=time(10, 30))
    ], staff=None)
    await regenerate_slots(db_conn, doc)
    assert await _slot_times(db_conn, doc, target) == [
        time(9), time(9, 30), time(10, 30), time(11), time(11, 30)
    ]


async def test_정기_휴진_요일에는_추천_자리를_만들지_않는다(db_conn):
    """[SCHED-SLOT-10][SCHED-WEEK-04] 화면만 잠그는 것은 막은 것이 아니다 —
    자리가 생기면 환자는 쉬는 날에 예약을 잡고 그날 병원에 온다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    await save_week_rules(db_conn, doc, [_row(0, is_day_off=True), _row(1, is_day_off=True),
                                         _row(2, is_day_off=True), _row(3, is_day_off=True),
                                         _row(4, is_day_off=True), _row(5, is_day_off=True),
                                         _row(6, is_day_off=True)], staff=None)
    r = await regenerate_slots(db_conn, doc)
    assert r["created"] == 0


async def test_의사_휴무_예외가_있는_날은_자리를_만들지_않는다(db_conn):
    """[SCHED-EXC-12] 재생성도 판정기(resolve_day)를 부른다 — 예외로 닫은 날은 자리가 안 생긴다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    today = await _today(db_conn)
    target = today + timedelta(days=7)
    await save_week_rules(db_conn, doc, [_row(target.weekday())], staff=None)
    await upsert_doctor_exception(db_conn, doc, target, is_closed=True)
    await regenerate_slots(db_conn, doc)
    assert await _slot_times(db_conn, doc, target) == []


async def test_예약된_자리는_재생성에서_남긴다(db_conn):
    """[SCHED-SLOT-05] 예약된 자리를 지우면 예약이 몇 시인지를 잃는다 — 남긴다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    today = await _today(db_conn)
    target = today + timedelta(days=7)
    await save_week_rules(db_conn, doc, [_row(target.weekday(), start=time(9), end=time(11), slot_minutes=30)], staff=None)
    await regenerate_slots(db_conn, doc)
    # 한 자리를 예약됨으로 바꾼다.
    await db_conn.execute(
        "update appointment_slots set status='예약됨' where doctor_id=$1 and slot_date=$2 and start_time=$3",
        doc, target, time(9, 30),
    )
    # 한 칸 길이를 바꿔 재생성(9:30은 새 격자 10:00·11:00에 없다).
    await save_week_rules(db_conn, doc, [_row(target.weekday(), start=time(9), end=time(11), slot_minutes=60)], staff=None)
    await regenerate_slots(db_conn, doc)
    status = await db_conn.fetchval(
        "select status from appointment_slots where doctor_id=$1 and slot_date=$2 and start_time=$3",
        doc, target, time(9, 30),
    )
    assert status == "예약됨"      # 예약된 자리는 새 격자에 없어도 그대로 남는다


async def test_dry_run은_실제로_쓰지_않는다(db_conn):
    """[SCHED-SLOT-07] dry_run은 세기만 하고 DB를 바꾸지 않는다."""
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    await save_week_rules(db_conn, doc, [_row(0), _row(1), _row(2), _row(3), _row(4)], staff=None)
    await regenerate_slots(db_conn, doc, dry_run=True)
    count = await db_conn.fetchval("select count(*) from appointment_slots where doctor_id=$1", doc)
    assert count == 0


async def test_재생성은_오늘부터_8주치다(db_conn):
    """[SCHED-SLOT-09] 그 너머는 새 규칙으로 자연히 생긴다."""
    assert REGENERATION_WEEKS == 8
    dept = await _dept(db_conn)
    doc = await _doctor(db_conn, dept)
    today = await _today(db_conn)
    await save_week_rules(db_conn, doc, [_row(w) for w in range(7)], staff=None)
    await regenerate_slots(db_conn, doc)
    lo = await db_conn.fetchval("select min(slot_date) from appointment_slots where doctor_id=$1", doc)
    hi = await db_conn.fetchval("select max(slot_date) from appointment_slots where doctor_id=$1", doc)
    assert lo >= today
    assert hi <= today + timedelta(weeks=8)
