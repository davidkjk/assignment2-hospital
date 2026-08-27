"""[Task 19a] 의사 사용 중지 영향 미리보기·확정 재검사 (결정10 A안).

판정 함수는 하나뿐이다(SCHED-CALC-02) — 관리자 팝업과 /today 카드가 같은 수를 말한다.
`get_deactivation_impact`는 건수·시각만 주고(이름·전화 없음), 확정은 오래된 미리보기를 409로 막는다.
"""

from datetime import time, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import staff_service
from app.services.schedule_change import list_affected_appointments
from tests.conftest import seed_staff


@pytest.fixture(autouse=True)
def _fake_admin_client(monkeypatch):
    monkeypatch.setattr("app.services.staff_service.get_admin_client", lambda: MagicMock())


async def _future_date(conn, days=30):
    today = await conn.fetchval("select current_date")
    return today + timedelta(days=days)


async def _seed_doctor_with_appointment(conn, *, start_time=time(9, 30), status="예약확정"):
    slot_date = await _future_date(conn)
    department_id = await conn.fetchval(
        "insert into departments (name) values ($1) returning id", f"내과-{slot_date}-{start_time}"
    )
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동','1985-03-01','M','01012345678') returning id"
    )
    admin = await seed_staff(conn, role="admin")
    doctor = await seed_staff(conn, role="doctor", department_id=department_id)
    appt_id = await _add_appointment(conn, doctor["staff_id"], department_id, patient_id, admin["staff_id"], slot_date, start_time, status)
    return SimpleNamespace(
        appointment_id=appt_id,
        doctor_id=doctor["staff_id"],
        department_id=department_id,
        patient_id=patient_id,
        admin=StaffContext(id=admin["staff_id"], auth_user_id=admin["auth_user_id"], role="admin", department_id=None),
        date=slot_date,
    )


async def _add_appointment(conn, doctor_id, department_id, patient_id, created_by, slot_date, start_time, status="예약확정"):
    slot_id = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,$3,'예약됨') returning id",
        doctor_id, slot_date, start_time,
    )
    return await conn.fetchval(
        """
        insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $2, $2, $3, $4, $5, 'staff', $6)
        returning id
        """,
        slot_id, patient_id, department_id, doctor_id, status, created_by,
    )


async def _all_statuses(conn):
    rows = await conn.fetch("select id, status from appointments order by id")
    return {row["id"]: row["status"] for row in rows}


@pytest.mark.asyncio
async def test_비활성_의사도_같은_판정_함수가_명단을_만든다(db_conn):
    """[SCHED-CALC-02] 별도 함수를 만들면 관리자 팝업과 /today가 서로 다른 수를 말한다."""
    fx = await _seed_doctor_with_appointment(db_conn)
    preview = await staff_service.get_deactivation_impact(db_conn, fx.doctor_id, for_role="admin")
    await db_conn.execute("update staff set is_active = false where id = $1", fx.doctor_id)
    rows = await list_affected_appointments(db_conn)
    assert preview["count"] == len(rows)


@pytest.mark.asyncio
async def test_미리보기는_건수와_시각만_준다(db_conn):
    """[STAFF-DEACT-04] 환자 이름·전화번호가 반환에 없다 — 볼 것이 없으면 열람 기록 문제가 사라진다."""
    fx = await _seed_doctor_with_appointment(db_conn)
    preview = await staff_service.get_deactivation_impact(db_conn, fx.doctor_id, for_role="admin")
    assert set(preview.keys()) == {"count", "times", "version"}


@pytest.mark.asyncio
async def test_미리보기_시각은_날짜와_시간만_담는다(db_conn):
    """[SCHED-WARN-04] 각 항목은 날짜·시각뿐이다."""
    fx = await _seed_doctor_with_appointment(db_conn)
    preview = await staff_service.get_deactivation_impact(db_conn, fx.doctor_id, for_role="admin")
    assert all(set(t.keys()) == {"date", "time"} for t in preview["times"])


@pytest.mark.asyncio
async def test_미리보기는_아무것도_바꾸지_않는다(db_conn):
    """[STAFF-DEACT-04][SCHED-WARN-07] 갭 #89와 같은 사고를 여기서 되풀이하지 않는다."""
    fx = await _seed_doctor_with_appointment(db_conn)
    before = await _all_statuses(db_conn)
    await staff_service.get_deactivation_impact(db_conn, fx.doctor_id, for_role="admin")
    assert await _all_statuses(db_conn) == before


@pytest.mark.asyncio
async def test_미리보기_후에도_의사는_활성이다(db_conn):
    """[STAFF-DEACT-04] 미리보기는 읽기다 — is_active를 건드리지 않는다."""
    fx = await _seed_doctor_with_appointment(db_conn)
    await staff_service.get_deactivation_impact(db_conn, fx.doctor_id, for_role="admin")
    assert await db_conn.fetchval("select is_active from staff where id = $1", fx.doctor_id) is True


@pytest.mark.asyncio
async def test_취소된_예약은_명단에_없다(db_conn):
    """[SCHED-CALC-06] 전화를 돌릴 수 있는 대상이 아니다."""
    fx = await _seed_doctor_with_appointment(db_conn)
    cancelled = await _add_appointment(
        db_conn, fx.doctor_id, fx.department_id, fx.patient_id, fx.admin.id, fx.date, time(11, 0), status="환자취소"
    )
    ids = [r["id"] for r in await list_affected_appointments(db_conn, deactivating_doctor_id=fx.doctor_id)]
    assert cancelled not in ids


@pytest.mark.asyncio
async def test_오래된_미리보기로는_확정되지_않는다(db_conn):
    """[STAFF-DEACT-09] 미리보기 뒤 예약이 하나 늘면 3건인 줄 안 관리자가 4건을 큐로 보내게 된다."""
    fx = await _seed_doctor_with_appointment(db_conn)
    impact = await staff_service.get_deactivation_impact(db_conn, fx.doctor_id, for_role="admin")
    await _add_appointment(db_conn, fx.doctor_id, fx.department_id, fx.patient_id, fx.admin.id, fx.date, time(14, 0))
    with pytest.raises(AppError) as e:
        await staff_service.deactivate_staff(
            fx.doctor_id, deactivated_by=fx.admin, impact_version=impact["version"], conn=db_conn
        )
    assert e.value.status_code == 409


@pytest.mark.asyncio
async def test_최신_미리보기로는_확정된다(db_conn):
    """[STAFF-DEACT-10] 그 사이 변화가 없으면 같은 버전으로 중지가 성립한다."""
    fx = await _seed_doctor_with_appointment(db_conn)
    impact = await staff_service.get_deactivation_impact(db_conn, fx.doctor_id, for_role="admin")
    await staff_service.deactivate_staff(
        fx.doctor_id, deactivated_by=fx.admin, impact_version=impact["version"], conn=db_conn
    )
    assert await db_conn.fetchval("select is_active from staff where id = $1", fx.doctor_id) is False


@pytest.mark.asyncio
async def test_중지_확정이_예약_상태를_한_건도_바꾸지_않는다(db_conn):
    """[STAFF-DEACT-07] 결정10 A안 — 자동 취소·자동 재배정 금지."""
    fx = await _seed_doctor_with_appointment(db_conn)
    impact = await staff_service.get_deactivation_impact(db_conn, fx.doctor_id, for_role="admin")
    before = await _all_statuses(db_conn)
    await staff_service.deactivate_staff(
        fx.doctor_id, deactivated_by=fx.admin, impact_version=impact["version"], conn=db_conn
    )
    assert await _all_statuses(db_conn) == before


@pytest.mark.asyncio
async def test_확정이_환자_알림을_만들지_않는다(db_conn):
    """[STAFF-DEACT-08] 자동 알림 금지 — 접수직원이 건별 처리를 끝낸 뒤의 일이다."""
    fx = await _seed_doctor_with_appointment(db_conn)
    impact = await staff_service.get_deactivation_impact(db_conn, fx.doctor_id, for_role="admin")
    before = await db_conn.fetchval("select count(*) from notification_log")
    await staff_service.deactivate_staff(
        fx.doctor_id, deactivated_by=fx.admin, impact_version=impact["version"], conn=db_conn
    )
    assert await db_conn.fetchval("select count(*) from notification_log") == before


@pytest.mark.asyncio
async def test_되살리면_명단에서_저절로_빠진다(db_conn):
    """[SCHED-CALC-04] 계산 방식이면 「되살아난 상태」가 데이터에서 자동으로 정합해진다."""
    fx = await _seed_doctor_with_appointment(db_conn)
    await db_conn.execute("update staff set is_active = false where id = $1", fx.doctor_id)
    assert [r["id"] for r in await list_affected_appointments(db_conn)] == [fx.appointment_id]
    await db_conn.execute("update staff set is_active = true where id = $1", fx.doctor_id)
    assert await list_affected_appointments(db_conn) == []
