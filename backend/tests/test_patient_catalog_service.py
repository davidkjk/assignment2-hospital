from datetime import date
from unittest.mock import patch
import pytest
from app.core.patient_security import PatientContext
from app.services import patient_catalog_service
from tests.conftest import seed_patient, seed_staff

# 카탈로그 서비스는 acquire_as(patient)로 별도 커넥션을 연다 → committed_conn 시딩(Task 2 하네스 패턴).
# 진료과·의사·슬롯 열람 RLS는 00019가 추가(등록 환자만). 진료과는 데모/잔여 데이터가 있을 수 있어 멤버십으로 단언.


def _ctx(s): return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


@pytest.mark.asyncio
async def test_list_departments_active_only(committed_conn):
    await committed_conn.execute("insert into departments (name, is_active) values ('테스트활성과', true)")
    await committed_conn.execute("insert into departments (name, is_active) values ('테스트비활성과', false)")
    depts = await patient_catalog_service.list_departments(_ctx(await seed_patient(committed_conn)))
    names = [d["name"] for d in depts]
    assert "테스트활성과" in names          # 활성 진료과는 보인다
    assert "테스트비활성과" not in names     # 비활성은 걸러진다


@pytest.mark.asyncio
async def test_list_doctors_active_doctors_of_department(committed_conn):
    # 00019 patients_can_read_active_doctors: 등록 환자는 해당 과의 활성 의사만 본다.
    dept = await committed_conn.fetchval("insert into departments (name) values ('테스트내과') returning id")
    doc = await seed_staff(committed_conn, role="doctor", department_id=dept)
    await committed_conn.execute("update staff set name='김의사' where id=$1", doc["staff_id"])
    recp = await seed_staff(committed_conn, role="receptionist", department_id=dept)  # 의사 아님 → 제외
    docs = await patient_catalog_service.list_doctors(dept, _ctx(await seed_patient(committed_conn)))
    ids = [d["id"] for d in docs]
    assert doc["staff_id"] in ids
    assert recp["staff_id"] not in ids


@pytest.mark.asyncio
async def test_available_slots_uses_bookable_function(committed_conn):
    # 미래 날짜(8주 이내)라야 list_bookable_slots의 current_date+56 필터를 통과한다(2999는 8주 초과라 []).
    from datetime import timedelta
    d = date.today() + timedelta(days=7)
    doc = await seed_staff(committed_conn, role="doctor")
    await committed_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'09:00','빈시간')", doc["staff_id"], d)
    await committed_conn.execute("insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'09:20','예약됨')", doc["staff_id"], d)
    slots = await patient_catalog_service.list_available_slots(doc["staff_id"], d, _ctx(await seed_patient(committed_conn)))
    assert [str(s["start_time"]) for s in slots] == ["09:00:00"]


@pytest.mark.asyncio
async def test_hospital_info_uses_public_rpc(db_conn):
    # 병원 주소·전화는 직원웹 T29의 좁은 창구 get_public_hospital_info()로만 가져온다(HSETX-SEC-01).
    ctx = _ctx(await seed_patient(db_conn))
    with patch("app.services.patient_catalog_service.get_public_hospital_info",
               return_value={"hospital_address": "서울 강남", "hospital_phone": "02-1234-5678"}):
        info = await patient_catalog_service.get_hospital_info(ctx)
    assert info["hospital_address"] == "서울 강남"


@pytest.mark.asyncio
async def test_list_doctors_returns_profile_and_schedule(committed_conn):
    # [BOOK-DOC-02][BOOK-DOC-07] 갭 #7 — 사진·전공을 함께 반환한다(직원웹 00042가 얹은 staff 칸).
    dept = await committed_conn.fetchval(
        "insert into departments (name, is_active) values ('테스트프로필내과', true) returning id")
    doc = await seed_staff(committed_conn, role="doctor", department_id=dept)
    # 직원웹 00042 칸을 채운다(구현 시점엔 이미 존재하는 칸).
    await committed_conn.execute("update staff set specialty=$2, photo_url=$3 where id=$1",
                                 doc["staff_id"], "소화기내과", "https://cdn/doc.jpg")
    # 갭 #9 — 진료요일: 월·수·금 오전.
    for w in (0, 2, 4):
        await committed_conn.execute(
            "insert into doctor_schedule_rules (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments) "
            "values ($1,$2,'09:00','12:00',20,10)", doc["staff_id"], w)
    docs = await patient_catalog_service.list_doctors(dept, _ctx(await seed_patient(committed_conn)))
    mine = next(d for d in docs if d["id"] == doc["staff_id"])
    assert mine["specialty"] == "소화기내과"
    assert mine["photo_url"] == "https://cdn/doc.jpg"
    assert mine["schedule_summary"] == "월·수·금 오전"   # 갭 #9 서버 요약
    assert "bio" not in mine                             # [BOOK-DOC-06] bio는 화면 비노출 — 반환하지 않는다


@pytest.mark.asyncio
async def test_list_doctors_photo_url_null_when_absent(committed_conn):
    # [BOOK-DOC-05] 사진 없는 의사는 photo_url=None → 화면이 회색 원+첫 글자로 그린다.
    dept = await committed_conn.fetchval(
        "insert into departments (name, is_active) values ('테스트무사진과', true) returning id")
    doc = await seed_staff(committed_conn, role="doctor", department_id=dept)
    docs = await patient_catalog_service.list_doctors(dept, _ctx(await seed_patient(committed_conn)))
    mine = next(d for d in docs if d["id"] == doc["staff_id"])
    assert mine["photo_url"] is None and mine["schedule_summary"] == "진료시간 문의"


@pytest.mark.asyncio
async def test_hospital_hours_진료시간과_예정_휴진을_함께_준다(committed_conn):
    """[SET-HOSP-05][갭 #SET-HOSP-HOURS] ㉯ 전용 창구 — 요일 7줄 + 오늘 이후 휴진.
    ⛔ get_hospital_info(주소·전화)와 별개다 — 그 보안 창구는 안 건드린다.
    ⚠️ hospital_hours엔 is_closed 칸이 없다 → 일요일(0)은 행을 안 넣어 휴진으로 나온다."""
    from datetime import timedelta
    me = await seed_patient(committed_conn)
    await committed_conn.execute("delete from hospital_closures")
    await committed_conn.execute("delete from hospital_hours")   # 데모 선점 행 정리
    await committed_conn.execute(
        "insert into hospital_hours (weekday, open_time, close_time, lunch_start, lunch_end) "
        "values (1, '09:00', '18:00', '12:30', '14:00')")       # 월요일
    await committed_conn.execute(
        "insert into hospital_closures (closure_date, memo) values (current_date + 3, '창립기념일')")
    got = await patient_catalog_service.get_hospital_hours(_ctx(me))
    assert len(got["weekdays"]) == 7                             # 0~6 늘 일곱 줄
    mon = next(d for d in got["weekdays"] if d["weekday"] == 1)
    assert mon["open"] == "09:00" and mon["lunch_start"] == "12:30" and mon["is_closed"] is False
    sun = next(d for d in got["weekdays"] if d["weekday"] == 0)
    assert sun["is_closed"] is True and sun["open"] is None      # 행 없음 = 휴진
    assert got["closures"] == [{"date": str(date.today() + timedelta(days=3)), "memo": "창립기념일"}]


@pytest.mark.asyncio
async def test_hospital_hours_지난_휴진은_안_준다(committed_conn):
    """[SET-HOSP-05] 휴진일 줄은 「앞으로」만 — 지나간 휴무를 보여주면 안내가 아니라 소음이다."""
    me = await seed_patient(committed_conn)
    await committed_conn.execute("delete from hospital_closures")
    await committed_conn.execute(
        "insert into hospital_closures (closure_date, memo) values (current_date - 1, '지난 휴무')")
    got = await patient_catalog_service.get_hospital_hours(_ctx(me))
    assert got["closures"] == []
