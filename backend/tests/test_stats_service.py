"""[STAT-METRIC][STAT-SCOPE-03][STAT-DRILL][STAT-AUDIT][STAT-MASK-01] 집계·드릴다운·감사.

⭐ 결정5: 지표마다 기준일이 다르고 이름에 드러난다. 결정21: 화면은 억제하지 않는다(k=5는 CSV 전용).
   결정22: 집계 표 조회는 감사 행을 만들지 않고, 드릴다운·CSV만 환자 없는 행으로 남긴다.
"""
import json

import pytest

from app.services import stats_service
from tests.conftest import seed_staff, set_session_auth
from tests.task13_fixtures import (
    db_today, seed_appointment, seed_department, seed_doctor, seed_patient, seed_slot, to_context,
)


async def _admin(conn):
    # 프로덕션 풀(get_pool)은 세션 시간대를 Asia/Seoul로 고정한다. 테스트 db_conn 풀은
    # UTC라 KST 자정~UTC 자정 사이에 current_date와 changed_at 변환이 하루 어긋난다 —
    # 트랜잭션 범위로 KST를 맞춰 프로덕션과 같은 기준일을 쓴다.
    await conn.execute("set local time zone 'Asia/Seoul'")
    return to_context(await seed_staff(conn, role="admin"), "admin")


async def _cancel_now(conn, appointment_id, changed_by, from_status="예약확정"):
    await conn.execute(
        "insert into appointment_status_history (appointment_id, from_status, to_status, changed_by) "
        "values ($1,$2,'환자취소',$3)",
        appointment_id, from_status, changed_by,
    )


async def _count_audit(conn):
    await conn.execute("reset role")
    return await conn.fetchval("select count(*) from access_audit_log")


async def _latest_audit(conn):
    await conn.execute("reset role")
    return await conn.fetchrow("select * from access_audit_log order by accessed_at desc limit 1")


# ── 기준일 분리 (결정5 / R2-04) ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_결정5_지표마다_기준일이_다르고_이름에_드러난다(db_conn):
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await stats_service.get_stats(today, today, admin, conn=db_conn)
    assert s["cancelled"]["basis"] == "status_changed_at"
    assert s["source_mix"]["basis"] == "created_at"
    assert s["visits_by_hour"]["basis"] == "slot_start_time"


@pytest.mark.asyncio
async def test_R2_04_취소는_취소한_날에_잡힌다(db_conn):
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    p = await seed_patient(db_conn)
    appt = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                  patient_id=p, status="예약확정")
    await _cancel_now(db_conn, appt, doc["staff_id"])
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await stats_service.get_stats(today, today, admin, conn=db_conn)
    assert s["cancelled"]["value"] == 1


# ── 유입원·이름·시간대 (STAT-METRIC-02·03·05) ────────────────────────────

@pytest.mark.asyncio
async def test_스탯_메트릭_05_챗봇은_별도_유입원이고_없어도_표가_안_깨진다(db_conn):
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    for source in ("app", "staff", "chatbot"):
        p = await seed_patient(db_conn)
        await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                               patient_id=p, status="예약확정", source=source)
    await set_session_auth(db_conn, admin.auth_user_id)
    mix = (await stats_service.get_stats(today, today, admin, conn=db_conn))["source_mix"]
    assert set(mix["rows"]) == {"app", "staff", "chatbot"}
    assert sum(mix["rows"].values()) == mix["total"]


@pytest.mark.asyncio
async def test_스탯_메트릭_02_표시명은_서버가_주고_UUID는_안_나간다(db_conn):
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await db_conn.execute("update staff set name='김의사' where id=$1", doc["staff_id"])
    p = await seed_patient(db_conn)
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=p, status="예약확정")
    await set_session_auth(db_conn, admin.auth_user_id)
    by_doctor = (await stats_service.get_stats(today, today, admin, by="doctor", conn=db_conn))["rows"][0]
    assert by_doctor["label"] == "김의사" and "doctor_id" not in by_doctor


@pytest.mark.asyncio
async def test_스탯_메트릭_03_시간_미기록은_숨기지_않고_따로_센다(db_conn):
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    p = await seed_patient(db_conn)
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=p, slot_id=None, status="진료완료")
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await stats_service.get_stats(today, today, admin, conn=db_conn)
    assert s["visits_by_hour"]["unknown_time"] == 1


# ── 드릴다운 마스킹 (STAT-DRILL-02) ──────────────────────────────────────

@pytest.mark.asyncio
async def test_스탯_드릴_02_드릴다운_명단은_마스킹된_값만_담는다(db_conn):
    """⚠️ 옛 계획이 raw patient_name을 반환했다 — MASK-SRV-01 위반."""
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    p = await seed_patient(db_conn, name="홍길동", phone="01012345678")
    appt = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                  patient_id=p, status="예약확정")
    await _cancel_now(db_conn, appt, doc["staff_id"])
    await set_session_auth(db_conn, admin.auth_user_id)
    page = await stats_service.get_stats_detail("cancelled", today, today, admin, conn=db_conn)
    assert page.rows[0]["masked_name"] == "홍*동" and page.rows[0]["masked_phone"] == "010-****-5678"
    assert not ({"patient_name", "phone", "birth_date"} & set(page.rows[0]))
    assert page.rows[0]["patient_id"] == p


# ── 드릴다운: 예약(booked)은 생성일 기준·셀은 그 그룹으로 좁힌다 (STAT-DRILL-01·03) ──

@pytest.mark.asyncio
async def test_스탯_드릴_예약_명단은_생성일_기준_예약이다(db_conn):
    """⚠️ 옛 코드는 metric='booked'를 상태이력 to_status='booked'로 뒤져 항상 빈 명단이었다(그런
    상태값 없음). '예약' 지표는 appointments.created_at 기준 — 집계('예약' 카드·진료과별 예약 칸)와
    같은 모집단이라야 한다. STAT-DRILL-01."""
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    p = await seed_patient(db_conn)
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=p, status="예약확정")
    await set_session_auth(db_conn, admin.auth_user_id)
    page = await stats_service.get_stats_detail("booked", today, today, admin, conn=db_conn)
    assert len(page.rows) == 1 and page.rows[0]["patient_id"] == p


@pytest.mark.asyncio
async def test_스탯_드릴_03_진료과_셀은_그_진료과로_좁힌다(db_conn):
    """진료과별 표에서 셀(진료과×예약)을 누르면 그 진료과 명단만 나와야 한다 — dept/dim이 서버까지
    닿지 않아 전체를 보여주던 버그(STAT-DRILL-03: 서버에서 지표를 다시 검증)."""
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    dept_a = await seed_department(db_conn, name="내과")
    dept_b = await seed_department(db_conn, name="정형외과")
    doc_a = await seed_doctor(db_conn, dept_a)
    doc_b = await seed_doctor(db_conn, dept_b)
    pa = await seed_patient(db_conn, name="가환자")
    pb = await seed_patient(db_conn, name="나환자")
    await seed_appointment(db_conn, doctor_id=doc_a["staff_id"], department_id=dept_a, patient_id=pa)
    await seed_appointment(db_conn, doctor_id=doc_b["staff_id"], department_id=dept_b, patient_id=pb)
    await set_session_auth(db_conn, admin.auth_user_id)
    page = await stats_service.get_stats_detail(
        "booked", today, today, admin, dept="내과", dim="department", conn=db_conn)
    assert [r["patient_id"] for r in page.rows] == [pa]


@pytest.mark.asyncio
async def test_스탯_드릴_03_의사_셀은_그_의사로_좁힌다(db_conn):
    """의사별 표에서 셀을 누르면 라벨이 의사명이다 — dim='doctor'로 staff.name을 걸러야 한다."""
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc_a = await seed_doctor(db_conn, dept)
    doc_b = await seed_doctor(db_conn, dept)
    await db_conn.execute("update staff set name='김의사' where id=$1", doc_a["staff_id"])
    await db_conn.execute("update staff set name='이의사' where id=$1", doc_b["staff_id"])
    pa = await seed_patient(db_conn, name="가환자")
    pb = await seed_patient(db_conn, name="나환자")
    await seed_appointment(db_conn, doctor_id=doc_a["staff_id"], department_id=dept, patient_id=pa)
    await seed_appointment(db_conn, doctor_id=doc_b["staff_id"], department_id=dept, patient_id=pb)
    await set_session_auth(db_conn, admin.auth_user_id)
    page = await stats_service.get_stats_detail(
        "booked", today, today, admin, dept="김의사", dim="doctor", conn=db_conn)
    assert [r["patient_id"] for r in page.rows] == [pa]


@pytest.mark.asyncio
async def test_스탯_드릴_03_상태지표_셀도_진료과로_좁힌다(db_conn):
    """방문·부도(상태 전이 기준)도 셀 스코프가 걸려야 한다 — 상태이력 경로에도 dept 필터 적용."""
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    dept_a = await seed_department(db_conn, name="내과")
    dept_b = await seed_department(db_conn, name="정형외과")
    doc_a = await seed_doctor(db_conn, dept_a)
    doc_b = await seed_doctor(db_conn, dept_b)
    pa = await seed_patient(db_conn, name="가환자")
    pb = await seed_patient(db_conn, name="나환자")
    appt_a = await seed_appointment(db_conn, doctor_id=doc_a["staff_id"], department_id=dept_a, patient_id=pa)
    appt_b = await seed_appointment(db_conn, doctor_id=doc_b["staff_id"], department_id=dept_b, patient_id=pb)
    await _cancel_now(db_conn, appt_a, doc_a["staff_id"])
    await _cancel_now(db_conn, appt_b, doc_b["staff_id"])
    await set_session_auth(db_conn, admin.auth_user_id)
    page = await stats_service.get_stats_detail(
        "cancelled", today, today, admin, dept="내과", dim="department", conn=db_conn)
    assert [r["patient_id"] for r in page.rows] == [pa]


# ── 억제·감사 경계 (STAT-MASK-01 / STAT-AUDIT-01·02) ─────────────────────

@pytest.mark.asyncio
async def test_스탯_마스크_01_서버는_소수_억제를_하지_않는다(db_conn):
    """⭐ 결정21: 화면은 1건짜리 칸까지 전부 보인다. k=5 억제는 CSV 전용이다."""
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    p = await seed_patient(db_conn)
    appt = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                  patient_id=p, status="예약확정")
    await _cancel_now(db_conn, appt, doc["staff_id"])
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await stats_service.get_stats(today, today, admin, conn=db_conn)
    assert s["cancelled"]["value"] == 1


@pytest.mark.asyncio
async def test_스탯_어딧_01_집계_표_조회는_감사_행을_안_만든다(db_conn):
    """결정22: 특정 환자를 겨냥한 열람이 아니다."""
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    before = await _count_audit(db_conn)
    await set_session_auth(db_conn, admin.auth_user_id)
    await stats_service.get_stats(today, today, admin, conn=db_conn)
    assert await _count_audit(db_conn) == before


@pytest.mark.asyncio
async def test_스탯_어딧_02_드릴다운은_환자_없는_행으로_남는다(db_conn):
    """00034가 patient_id nullable + stats_drilldown 종류를 열어 뒀다."""
    admin = await _admin(db_conn)
    today = await db_today(db_conn)
    await set_session_auth(db_conn, admin.auth_user_id)
    await stats_service.get_stats_detail("cancelled", today, today, admin, conn=db_conn)
    row = await _latest_audit(db_conn)
    assert row["resource_type"] == "stats_drilldown" and row["patient_id"] is None


@pytest.mark.asyncio
async def test_알로그_리스트_13_csv_내보내기는_환자_없는_행으로_남는다(db_conn):
    """실행자·시각을 남기되 환자 원문은 복사하지 않는다. resource_type=stats_export·patient_id null.
    ⚠️ 지표·기간·건수·억제 여부의 상세 payload 저장은 전용 컬럼이 없어 BLOCKED(마이그 필요)."""
    from app.services import audit_service
    admin = await _admin(db_conn)
    await set_session_auth(db_conn, admin.auth_user_id)
    await audit_service.log_stats_export(admin, metric="cancelled", rows=42, suppressed=True, conn=db_conn)
    row = await _latest_audit(db_conn)
    assert row["resource_type"] == "stats_export" and row["patient_id"] is None
