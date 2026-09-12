"""[STAT-METRIC-04][STAT-DRILL-01·02][STAT-AUDIT-01][MASK-SRV-01] 오래 대기 사례 — 기간 집계·명단.

⭐ 결정5: 기준일은 「대기 시작일」이다(생성일·완료일이 아니다). 대기 시작(진료대기 전이)이
   기간 밖이면 빠진다 — 기준이 흔들리면 지표가 겹친다.
⭐ 이건 「끝난 대기」의 기간 집계다 — 진료중 전이가 있어야 대기 길이가 확정된다. /today의
   실시간 long_wait(Task 13, 「지금 대기 중」)와는 다른 지표다.
⭐ 결정21: 화면은 소수 억제를 하지 않는다 — 1건짜리도 명단을 연다(k=5는 CSV 전용, 이 태스크 밖).
"""
from datetime import date, datetime, timedelta, timezone

import pytest

from app.services import stats_service
from tests.conftest import seed_staff, set_session_auth
from tests.task13_fixtures import seed_appointment, seed_department, seed_doctor, seed_patient, to_context

_KST = timezone(timedelta(hours=9))


async def _admin(conn):
    # 프로덕션 풀은 세션 시간대를 Asia/Seoul로 고정한다. 테스트 db_conn 풀은 UTC라 기준일
    # 변환이 하루 어긋날 수 있어, 트랜잭션 범위로 KST를 맞춰 프로덕션과 같은 기준일을 쓴다.
    await conn.execute("set local time zone 'Asia/Seoul'")
    return to_context(await seed_staff(conn, role="admin"), "admin")


async def _seed_wait_case(conn, doc, dept, *, waited_minutes, on, name="홍길동",
                          phone="01012345678", birth=date(1985, 3, 1), progressed=True):
    """진료대기(대기 시작) → 진료중(진료 시작) 전이를 명시 시각으로 남긴다.

    progressed=False면 진료중 전이가 없다 — 「아직 대기 중」이라 기간 집계에 들어가지 않는다.
    """
    p = await seed_patient(conn, name=name, phone=phone, birth_date=birth)
    appt = await seed_appointment(conn, doctor_id=doc["staff_id"], department_id=dept,
                                  patient_id=p, status="진료중" if progressed else "진료대기")
    start = datetime(on.year, on.month, on.day, 10, 0, tzinfo=_KST)
    await conn.execute(
        "insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, changed_at) "
        "values ($1,'도착','진료대기',$2,$3)", appt, doc["staff_id"], start)
    if progressed:
        await conn.execute(
            "insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, changed_at) "
            "values ($1,'진료대기','진료중',$2,$3)", appt, doc["staff_id"], start + timedelta(minutes=waited_minutes))
    return appt, p


async def _count_drilldown(conn):
    await conn.execute("reset role")
    return await conn.fetchval("select count(*) from access_audit_log where resource_type='stats_drilldown'")


# ── 기간 집계 (STAT-METRIC-04 / 결정5) ────────────────────────────────────

@pytest.mark.asyncio
async def test_METRIC_04_기준_초과_대기_사례를_기간별로_센다(db_conn):
    """[STAT-METRIC-04][요구사항 3.10] 대기 시작→진료 시작이 임계값을 넘긴 건만 센다."""
    admin = await _admin(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _seed_wait_case(db_conn, doc, dept, waited_minutes=45, on=date(2026, 8, 10))   # 초과
    await _seed_wait_case(db_conn, doc, dept, waited_minutes=12, on=date(2026, 8, 10))   # 미달
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await stats_service.get_stats(date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert s["wait"]["over_threshold"] == 1


@pytest.mark.asyncio
async def test_METRIC_04_평균_대기시간을_분으로_돌려준다(db_conn):
    """[STAT-METRIC-04] wait.avg_minutes = 끝난 대기들의 평균(분). 임계 미달도 평균에 든다."""
    admin = await _admin(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _seed_wait_case(db_conn, doc, dept, waited_minutes=40, on=date(2026, 8, 10))   # 초과
    await _seed_wait_case(db_conn, doc, dept, waited_minutes=20, on=date(2026, 8, 10))   # 미달
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await stats_service.get_stats(date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert s["wait"]["avg_minutes"] == 30       # (40+20)/2 — 미달도 평균 모집단에 든다
    assert s["wait"]["over_threshold"] == 1      # 40분만 30분 임계 초과


@pytest.mark.asyncio
async def test_METRIC_04_임계값과_기준일_이름을_계약대로_돌려준다(db_conn):
    """[STAT-METRIC-04][결정5] 화면은 이 임계값·basis를 그대로 인용한다. 집계 대상이 없으면 평균 0."""
    admin = await _admin(db_conn)
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await stats_service.get_stats(date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert s["wait"]["threshold_minutes"] == 30
    assert s["wait"]["basis"] == "wait_started_at"
    assert s["wait"]["avg_minutes"] == 0


@pytest.mark.asyncio
async def test_METRIC_04_기간_밖의_대기는_세지_않는다(db_conn):
    """[STAT-SCOPE-01][결정5] 대기 시작일이 기간 밖이면 빠진다."""
    admin = await _admin(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _seed_wait_case(db_conn, doc, dept, waited_minutes=60, on=date(2026, 7, 31))   # 7월
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await stats_service.get_stats(date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert s["wait"]["over_threshold"] == 0


@pytest.mark.asyncio
async def test_METRIC_04_아직_진료중이_안_된_대기는_기간_집계에_안_넣는다(db_conn):
    """[STAT-METRIC-04] 진료중 전이가 없으면 대기 길이가 미정 — 기간 집계엔 넣지 않는다."""
    admin = await _admin(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _seed_wait_case(db_conn, doc, dept, waited_minutes=90, on=date(2026, 8, 10), progressed=False)
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await stats_service.get_stats(date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert s["wait"]["over_threshold"] == 0


# ── 명단·마스킹·정렬 (STAT-DRILL-01·02 / MASK-SRV-01) ─────────────────────

@pytest.mark.asyncio
async def test_DRILL_02_명단은_안정_정렬_계약을_따른다(db_conn):
    """[STAT-DRILL-03] 정렬은 대기 시작 desc + id desc라 커서로 이어받아도 겹치거나 빠지지 않는다."""
    admin = await _admin(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _seed_wait_case(db_conn, doc, dept, waited_minutes=45, on=date(2026, 8, 10))
    await set_session_auth(db_conn, admin.auth_user_id)
    page = await stats_service.get_stats_detail("long_wait", date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert page.order == ("wait_started_at desc", "id desc")


@pytest.mark.asyncio
async def test_DRILL_02_명단은_마스킹된_값만_담는다(db_conn):
    """[STAT-DRILL-02][STAT-MASK-01][MASK-SRV-01] 서버가 마스킹해 보낸다 — 원본은 응답에 없다."""
    admin = await _admin(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _seed_wait_case(db_conn, doc, dept, name="홍길동", phone="01012345678",
                          birth=date(1990, 3, 1), waited_minutes=45, on=date(2026, 8, 10))
    await set_session_auth(db_conn, admin.auth_user_id)
    page = await stats_service.get_stats_detail("long_wait", date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert page.rows[0]["masked_name"] == "홍*동"
    assert page.rows[0]["masked_phone"] == "010-****-5678"


@pytest.mark.asyncio
async def test_DRILL_02_원본_전화번호는_응답에_없다(db_conn):
    """[MASK-SRV-01] 원본 phone·birth_date 키는 명단 행에 아예 담기지 않는다."""
    admin = await _admin(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _seed_wait_case(db_conn, doc, dept, phone="01012345678", waited_minutes=45, on=date(2026, 8, 10))
    await set_session_auth(db_conn, admin.auth_user_id)
    page = await stats_service.get_stats_detail("long_wait", date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert "01012345678" not in str(page.rows[0])


@pytest.mark.asyncio
async def test_DRILL_02_명단은_대기_길이를_분으로_담는다(db_conn):
    """[STAT-METRIC-04] wait_minutes는 대기 시작→진료 시작의 실제 길이다(45분)."""
    admin = await _admin(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _seed_wait_case(db_conn, doc, dept, waited_minutes=45, on=date(2026, 8, 10))
    await set_session_auth(db_conn, admin.auth_user_id)
    page = await stats_service.get_stats_detail("long_wait", date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert page.rows[0]["wait_minutes"] == 45


@pytest.mark.asyncio
async def test_DRILL_01_1건짜리도_명단은_열린다_서버는_억제하지_않는다(db_conn):
    """[STAT-DRILL-01][결정21] 화면 억제는 없다 — 1건짜리도 그대로 준다(k=5 억제는 CSV 전용)."""
    admin = await _admin(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _seed_wait_case(db_conn, doc, dept, waited_minutes=45, on=date(2026, 8, 10))   # 딱 1건
    await set_session_auth(db_conn, admin.auth_user_id)
    page = await stats_service.get_stats_detail("long_wait", date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert len(page.rows) == 1


# ── 감사 경계 (STAT-AUDIT-01 / 결정22) ────────────────────────────────────

@pytest.mark.asyncio
async def test_AUDIT_01_명단을_열면_감사에_남는다(db_conn):
    """[STAT-AUDIT-01][결정22] 드릴다운은 개인을 겨냥한 순간이라 남긴다(집계 표만 본 것은 안 남긴다)."""
    admin = await _admin(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await _seed_wait_case(db_conn, doc, dept, waited_minutes=45, on=date(2026, 8, 10))
    before = await _count_drilldown(db_conn)
    await set_session_auth(db_conn, admin.auth_user_id)
    await stats_service.get_stats_detail("long_wait", date(2026, 8, 1), date(2026, 8, 31), admin, conn=db_conn)
    assert await _count_drilldown(db_conn) == before + 1
