import pytest
from datetime import timedelta
from tests.conftest import seed_staff

# list_bookable_slots는 definer(RLS 우회)라 호출 역할 무관 → set_session_auth 불필요.
# db_conn(같은 트랜잭션)에서 호출하므로 미커밋 슬롯도 보인다. 신선한 doctor라 데모 슬롯과 안 섞인다.
# ⚠️ 기준 날짜는 파이썬 date.today()(이 맥=밴쿠버) 대신 DB current_date(세션 Asia/Seoul)를 쓴다 — 안 그러면
#    UTC가 KST 자정을 넘긴 시각엔 하루 어긋나 8주 경계·당일 판정이 깨진다(메모리 mac-timezone-not-kst).


@pytest.mark.asyncio
async def test_bookable_slots_excludes_booked_past30min_and_beyond8weeks(db_conn):
    doc = await seed_staff(db_conn, role="doctor")
    today = await db_conn.fetchval("select current_date")
    # 빈시간(당일 늦은 시각) 1건, 예약됨 1건(시각 다르게 — unique(doctor,date,time)), 8주 초과 1건 → bookable은 빈시간 1건만.
    await db_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'23:59','빈시간')", doc["staff_id"], today)
    await db_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'23:58','예약됨')", doc["staff_id"], today)
    await db_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'09:00','빈시간')", doc["staff_id"], today + timedelta(days=60))
    rows = await db_conn.fetch("select * from list_bookable_slots($1, $2)", doc["staff_id"], today)
    assert len(rows) == 1 and str(rows[0]["start_time"]) == "23:59:00"


@pytest.mark.asyncio
async def test_bookable_slots_today_requires_30min_buffer(db_conn):
    doc = await seed_staff(db_conn, role="doctor")
    # 이미 지난(00:00) 당일 슬롯은 30분 여유 미달 → 제외.
    await db_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, current_date, '00:00', '빈시간')", doc["staff_id"])
    rows = await db_conn.fetch("select * from list_bookable_slots($1, current_date)", doc["staff_id"])
    assert rows == []
