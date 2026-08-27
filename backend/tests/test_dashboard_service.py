"""[TODAY-SUM][TODAY-RESCHED][QUEUE-ORDER][QUEUE-FILT][DOCTOR-QUEUE][DOCTOR-DATE][QUEUE-WALK-08c]
조회 전용 백엔드 — 세는 곳은 서버 한 곳이다.
"""
from datetime import date, time, timedelta

import pytest

from app.core.errors import AppError
from app.services import dashboard_service
from tests.conftest import set_session_auth
from tests.task13_fixtures import (
    add_reorder_memo, db_today, seed_appointment, seed_department, seed_doctor,
    seed_patient, seed_slot, to_context, transition_to_waiting,
)


# ── 대기 목록 (/queue) ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_큐_오더_03_순번은_병원_전체_줄_기준이고_필터로_다시_안_매긴다(db_conn):
    """⭐ 다시 매기면 직원이 부르는 3번과 의사가 부르는 3번이 달라진다."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc_a = await seed_doctor(db_conn, dept)
    doc_b = await seed_doctor(db_conn, dept)
    admin = to_context(await _seed_admin(db_conn), "admin")
    for doctor, qp in [(doc_a, 1), (doc_b, 2), (doc_a, 3)]:
        p = await seed_patient(db_conn)
        slot = await seed_slot(db_conn, doctor["staff_id"], today, start_time=time(9, qp * 5))
        await seed_appointment(db_conn, doctor_id=doctor["staff_id"], department_id=dept,
                               patient_id=p, slot_id=slot, status="진료대기", queue_position=qp)
    await set_session_auth(db_conn, admin.auth_user_id)

    result = await dashboard_service.get_queue(admin, doctor_id=doc_a["staff_id"], conn=db_conn)
    assert [r["queue_no"] for r in result.rows] == [1, 3]


@pytest.mark.asyncio
async def test_큐_필트_03_탭_숫자는_필터를_따라가지_않는다(db_conn):
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc_a = await seed_doctor(db_conn, dept)
    doc_b = await seed_doctor(db_conn, dept)
    admin = to_context(await _seed_admin(db_conn), "admin")
    for doctor in (doc_a, doc_b):
        p = await seed_patient(db_conn)
        slot = await seed_slot(db_conn, doctor["staff_id"], today)
        await seed_appointment(db_conn, doctor_id=doctor["staff_id"], department_id=dept,
                               patient_id=p, slot_id=slot, status="진료대기", queue_position=1)
    await set_session_auth(db_conn, admin.auth_user_id)

    all_rows = await dashboard_service.get_queue(admin, doctor_id=None, conn=db_conn)
    filtered = await dashboard_service.get_queue(admin, doctor_id=doc_a["staff_id"], conn=db_conn)
    assert filtered.tab_counts == all_rows.tab_counts


@pytest.mark.asyncio
async def test_큐_탭_01_탭마다_그_상태의_행을_준다(db_conn):
    """[QUEUE-TAB-01] 7개 탭은 각자의 상태 행을 그린다 — 미도착/도착/진료대기가 다른 목록이다.
    ⭐ 예전 get_queue는 tab을 무시하고 진료대기만 줬다(미도착 도착처리를 시작할 목록이 비었다)."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    admin = to_context(await _seed_admin(db_conn), "admin")
    made = {}
    for st, tm in [("예약확정", time(9, 0)), ("도착", time(9, 5)), ("진료대기", time(9, 10)),
                   ("진료중", time(9, 15))]:
        p = await seed_patient(db_conn)
        slot = await seed_slot(db_conn, doc["staff_id"], today, start_time=tm)
        made[st] = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                          patient_id=p, slot_id=slot, status=st,
                                          queue_position=1 if st == "진료대기" else None)
    await set_session_auth(db_conn, admin.auth_user_id)

    not_arrived = await dashboard_service.get_queue(admin, tab="not_arrived", conn=db_conn)
    arrived = await dashboard_service.get_queue(admin, tab="arrived", conn=db_conn)
    waiting = await dashboard_service.get_queue(admin, tab="waiting", conn=db_conn)
    assert [r["appointment_id"] for r in not_arrived.rows] == [made["예약확정"]]
    assert [r["appointment_id"] for r in arrived.rows] == [made["도착"]]
    assert [r["appointment_id"] for r in waiting.rows] == [made["진료대기"]]
    # 미도착 행은 예약 시각을 함께 준다(QUEUE-ORDER-02: 순번 자리에 예약 시각). 도착엔 순번이 없다.
    assert not_arrived.rows[0]["slot_time"] is not None
    assert "queue_no" not in arrived.rows[0]
    # 도착/미도착 행도 낙관적 동시성·마스킹 경계를 통과한다(도착처리·원문공개 배선용).
    assert "updated_at" in arrived.rows[0] and "masked_name" in arrived.rows[0]


@pytest.mark.asyncio
async def test_큐_워크_12_워크인_행에는_당일_방문_표시가_붙는다(db_conn):
    """[QUEUE-WALK-12] 슬롯 없이 들어온 워크인 행은 당일 방문 배지를 달 수 있게 표시를 준다.
    「지금」 워크인은 방문 시각을 안 남겨도(slot_id가 없으므로) 배지가 붙는다."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    admin = to_context(await _seed_admin(db_conn), "admin")
    p = await seed_patient(db_conn)
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=p, slot_id=None, status="진료대기", queue_position=1)
    await set_session_auth(db_conn, admin.auth_user_id)
    rows = (await dashboard_service.get_queue(admin, tab="waiting", conn=db_conn)).rows
    assert rows[0]["is_walkin"] is True


# ── 의사 콘솔 ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_R2_02_의사는_본인_담당만_본다(db_conn):
    """[R2-02] acquire_as로 RLS 세션을 그대로 쓰므로 doctor_can_view_appointment()가 적용된다."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc_a = await seed_doctor(db_conn, dept)
    doc_b = await seed_doctor(db_conn, dept)
    pa, pb = await seed_patient(db_conn), await seed_patient(db_conn)
    slot_a = await seed_slot(db_conn, doc_a["staff_id"], today)
    slot_b = await seed_slot(db_conn, doc_b["staff_id"], today, start_time=time(10, 0))
    mine = await seed_appointment(db_conn, doctor_id=doc_a["staff_id"], department_id=dept,
                                  patient_id=pa, slot_id=slot_a, status="진료대기", queue_position=1)
    await seed_appointment(db_conn, doctor_id=doc_b["staff_id"], department_id=dept,
                           patient_id=pb, slot_id=slot_b, status="진료대기", queue_position=2)
    await set_session_auth(db_conn, doc_a["auth_user_id"])

    result = await dashboard_service.get_doctor_queue(
        to_context(doc_a, "doctor", dept), target_date=today, conn=db_conn)
    assert [r["id"] for r in result.rows] == [mine]


@pytest.mark.asyncio
async def test_닥터_큐_03_동점이면_예약_고유_ID가_마지막_키다(db_conn):
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    for qp, mago in [(2, 10), (None, 5), (1, 20)]:
        p = await seed_patient(db_conn)
        slot = await seed_slot(db_conn, doc["staff_id"], today, start_time=time(9, qp or 0))
        appt = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                      patient_id=p, slot_id=slot, status="진료대기", queue_position=qp)
        await transition_to_waiting(db_conn, appt, doc["staff_id"], minutes_ago=mago)
    await set_session_auth(db_conn, doc["auth_user_id"])

    rows = (await dashboard_service.get_doctor_queue(
        to_context(doc, "doctor", dept), target_date=today, conn=db_conn)).rows
    assert rows == sorted(rows, key=lambda r: (r["queue_position"] is None, r["queue_position"],
                                               r["waiting_started_at"], r["id"]))


@pytest.mark.asyncio
async def test_닥터_데이트_01_미래_날짜는_거절한다(db_conn):
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    today = await db_today(db_conn)
    await set_session_auth(db_conn, doc["auth_user_id"])
    with pytest.raises(AppError):
        await dashboard_service.get_doctor_queue(
            to_context(doc, "doctor", dept), target_date=today + timedelta(days=1), conn=db_conn)


@pytest.mark.asyncio
async def test_닥터_데이트_04_과거는_읽기_수정_모드로_연다(db_conn):
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    today = await db_today(db_conn)
    await set_session_auth(db_conn, doc["auth_user_id"])
    result = await dashboard_service.get_doctor_queue(
        to_context(doc, "doctor", dept), target_date=today - timedelta(days=3), conn=db_conn)
    assert result.mode == "read_only_with_record_edit"


@pytest.mark.asyncio
async def test_큐_워크_08c_다음_빈_시각이_없으면_안_준다(db_conn):
    """갭 #87. 빈 시각을 못 찾으면 추정치를 만들지 않는다."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await seed_slot(db_conn, doc["staff_id"], today, start_time=time(9, 0), status="예약됨")
    await seed_slot(db_conn, doc["staff_id"], today, start_time=time(9, 30), status="휴진")
    await set_session_auth(db_conn, doc["auth_user_id"])
    assert await dashboard_service.get_next_available(
        to_context(doc, "doctor", dept), conn=db_conn) is None


@pytest.mark.asyncio
async def test_큐_워크_08c_빈_시각이_있으면_가장_이른_것을_준다(db_conn):
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    await seed_slot(db_conn, doc["staff_id"], today, start_time=time(14, 0), status="빈시간")
    await seed_slot(db_conn, doc["staff_id"], today, start_time=time(11, 0), status="빈시간")
    await set_session_auth(db_conn, doc["auth_user_id"])
    nxt = await dashboard_service.get_next_available(to_context(doc, "doctor", dept), conn=db_conn)
    assert nxt["start_time"] == time(11, 0)


# ── 오늘 요약 (/today/summary) ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_투데이_섬_01_타일_여섯_개를_한_번에_준다(db_conn):
    admin = to_context(await _seed_admin(db_conn), "admin")
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await dashboard_service.get_today_summary(admin, conn=db_conn)
    assert set(s["tiles"]) == {
        "total_reserved", "arrived", "waiting", "in_progress", "completed", "cancelled_or_noshow"}


@pytest.mark.asyncio
async def test_R2_07_오늘_현황은_슬롯_날짜_기준이다(db_conn):
    """[R2-07] 오늘 만든 다음 주 예약은 오늘 현황에 안 들어간다."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    admin = to_context(await _seed_admin(db_conn), "admin")
    p1, p2 = await seed_patient(db_conn), await seed_patient(db_conn)
    slot_far = await seed_slot(db_conn, doc["staff_id"], today + timedelta(days=7))
    slot_now = await seed_slot(db_conn, doc["staff_id"], today)
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=p1, slot_id=slot_far, status="예약확정")
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=p2, slot_id=slot_now, status="예약확정")
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await dashboard_service.get_today_summary(admin, conn=db_conn)
    assert s["tiles"]["total_reserved"] == 1


@pytest.mark.asyncio
async def test_R2_03_대기시간은_진료대기_전이_시각_기준이다(db_conn):
    """[R2-03] 순서를 바꿔도 기다린 시간은 초기화되지 않는다."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    admin = to_context(await _seed_admin(db_conn), "admin")
    p = await seed_patient(db_conn)
    slot = await seed_slot(db_conn, doc["staff_id"], today)
    appt = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                  patient_id=p, slot_id=slot, status="진료대기", queue_position=1)
    await transition_to_waiting(db_conn, appt, doc["staff_id"], minutes_ago=45)
    await add_reorder_memo(db_conn, appt, doc["staff_id"])  # from=to 메모성 이력
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await dashboard_service.get_today_summary(admin, conn=db_conn)
    assert s["long_wait"][0]["appointment_id"] == appt
    assert s["long_wait"][0]["wait_minutes"] >= 44


@pytest.mark.asyncio
async def test_D4_지원_요청을_숫자가_아니라_행으로_준다(db_conn):
    """⭐ 이월분. 옛 pending_inquiries_count=0 하드코딩을 실제 query로 바꾼다."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    recept = to_context(await _seed_admin(db_conn, role="receptionist"), "receptionist")
    p = await seed_patient(db_conn)
    slot = await seed_slot(db_conn, doc["staff_id"], today)
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept, patient_id=p,
                           slot_id=slot, status="예약확정",
                           support_requested_at=_now_expr(), request_type="취소")
    await set_session_auth(db_conn, recept.auth_user_id)
    s = await dashboard_service.get_today_summary(recept, conn=db_conn)
    assert "pending_inquiries_count" not in s
    assert s["needs_attention"][0]["reason"] == "취소 상담 · 직원 확인 중"


@pytest.mark.asyncio
async def test_투데이_리스케드_21_사이드바_제외_목록을_준다(db_conn):
    """서버가 제외 대상을 알려주지 않으면 셸과 카드가 각자 세고 두 숫자가 어긋난다."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    recept = to_context(await _seed_admin(db_conn, role="receptionist"), "receptionist")
    p = await seed_patient(db_conn)
    slot = await seed_slot(db_conn, doc["staff_id"], today)
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept, patient_id=p,
                           slot_id=slot, status="예약확정",
                           support_requested_at=_now_expr(), request_type="변경")
    await set_session_auth(db_conn, recept.auth_user_id)
    s = await dashboard_service.get_today_summary(recept, conn=db_conn)
    assert p in s["badge_excluded_patient_ids"]


@pytest.mark.asyncio
async def test_스탯_메트릭_06_상담봇_지표는_0으로_위장하지_않는다(db_conn):
    """4단계 계약이 없다. 0으로 주면 '문의가 하나도 없었다'는 거짓말이 된다."""
    admin = to_context(await _seed_admin(db_conn), "admin")
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await dashboard_service.get_today_summary(admin, conn=db_conn)
    assert s["bot_pending"] is None


@pytest.mark.asyncio
async def test_투데이_노쇼_01_시각_지난_예약확정만_미접수로_준다(db_conn):
    """[TODAY-NOSHOW-01] 예약 시각이 지났고 아직 예약확정인 건만 미접수.
    미래 예약(아직 안 지남)·이미 도착한 건은 제외한다(10분 일찍 온 환자는 여기 없다)."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    admin = to_context(await _seed_admin(db_conn), "admin")
    p_past = await seed_patient(db_conn)
    p_future = await seed_patient(db_conn)
    p_arrived = await seed_patient(db_conn)
    slot_past = await seed_slot(db_conn, doc["staff_id"], today, start_time=time(0, 0))
    slot_future = await seed_slot(db_conn, doc["staff_id"], today, start_time=time(23, 59))
    slot_arr = await seed_slot(db_conn, doc["staff_id"], today, start_time=time(0, 1))
    past_appt = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                       patient_id=p_past, slot_id=slot_past, status="예약확정")
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=p_future, slot_id=slot_future, status="예약확정")
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=p_arrived, slot_id=slot_arr, status="도착")
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await dashboard_service.get_today_summary(admin, conn=db_conn)
    assert [r["appointment_id"] for r in s["not_arrived"]] == [past_appt]
    assert "masked_name" in s["not_arrived"][0]  # 마스킹 경계 통과


@pytest.mark.asyncio
async def test_투데이_이데이_01_전일_미완료_잔여만_올린다(db_conn):
    """[TODAY-YDAY-01] 지난 날짜의 도착·진료대기·진료중만 올린다. 지난 예약확정(→자정 부도
    배치)·오늘 진행 중인 건은 제외. 지난 날짜이므로 날짜를 함께 준다(TODAY-YDAY-03)."""
    today = await db_today(db_conn)
    yday = today - timedelta(days=1)
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    admin = to_context(await _seed_admin(db_conn), "admin")
    p_left, p_confirmed, p_today = (await seed_patient(db_conn), await seed_patient(db_conn),
                                    await seed_patient(db_conn))
    slot_y = await seed_slot(db_conn, doc["staff_id"], yday, start_time=time(16, 30))
    slot_y2 = await seed_slot(db_conn, doc["staff_id"], yday, start_time=time(17, 0))
    slot_t = await seed_slot(db_conn, doc["staff_id"], today, start_time=time(9, 0))
    left = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                  patient_id=p_left, slot_id=slot_y, status="진료중")
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=p_confirmed, slot_id=slot_y2, status="예약확정")
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=p_today, slot_id=slot_t, status="진료중")
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await dashboard_service.get_today_summary(admin, conn=db_conn)
    rows = s["yesterday_unfinished"]
    assert [r["appointment_id"] for r in rows] == [left]
    assert rows[0]["reason"] == "진료 중인 채로 마감"
    assert rows[0]["slot_date"] == yday


@pytest.mark.asyncio
async def test_투데이_닥_01_의사별_진료대기_인원을_진료과와_함께_센다(db_conn):
    """[TODAY-DOC-01] 의사별 진료대기 수를 진료과+의사 이름과 함께. 진료완료는 세지 않는다."""
    today = await db_today(db_conn)
    dept = await seed_department(db_conn, name="내과")
    doc_a = await seed_doctor(db_conn, dept)
    doc_b = await seed_doctor(db_conn, dept)
    admin = to_context(await _seed_admin(db_conn), "admin")
    for doctor, statuses in [(doc_a, ["진료대기", "진료대기", "진료완료"]), (doc_b, ["진료대기"])]:
        for i, st in enumerate(statuses):
            p = await seed_patient(db_conn)
            slot = await seed_slot(db_conn, doctor["staff_id"], today, start_time=time(9, i))
            await seed_appointment(db_conn, doctor_id=doctor["staff_id"], department_id=dept,
                                   patient_id=p, slot_id=slot, status=st)
    await set_session_auth(db_conn, admin.auth_user_id)
    s = await dashboard_service.get_today_summary(admin, conn=db_conn)
    by_doc = {r["doctor_id"]: r for r in s["doctor_waiting"]}
    assert by_doc[doc_a["staff_id"]]["waiting_count"] == 2
    assert by_doc[doc_a["staff_id"]]["department_name"] == "내과"
    assert by_doc[doc_b["staff_id"]]["waiting_count"] == 1


# ── 로컬 헬퍼 ─────────────────────────────────────────────────────────────

async def _seed_admin(conn, role="admin"):
    from tests.conftest import seed_staff
    return await seed_staff(conn, role=role)


def _now_expr():
    # support_requested_at 컬럼에 넣을 실제 시각(파라미터 바인딩용)
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)
