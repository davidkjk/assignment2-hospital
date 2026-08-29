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
