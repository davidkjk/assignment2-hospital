import json
import pytest
from uuid import uuid4

from app.core.patient_security import PatientContext
from app.services import patient_appointment_query_service as q
from app.services import patient_questionnaire_service as qsvc
from tests.conftest import seed_patient, seed_staff

# 조회 서비스도 acquire_as(patient) 자기커넥션 → 시드·검증은 committed_conn(postgres 역할, RLS 우회).
# 계획 원안의 admin+set_session_auth는 불필요(Task 5·6·7 하네스 보정과 동일).


def _ctx(s): return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


async def _seed_doctor_dept(committed_conn):
    doctor = await seed_staff(committed_conn, role="doctor")
    dept = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    return None, doctor["staff_id"], dept


async def _waiting(committed_conn, dept, doctor_id, pid, pos):
    return await committed_conn.fetchval(
        "insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source, queue_position) "
        "values ($1,$1,$2,$3,'진료대기','staff',$4) returning id", pid, dept, doctor_id, pos)


@pytest.mark.asyncio
async def test_wait_estimate_uses_slot_duration_when_no_history(committed_conn):
    # 3단 대체 ②: 실측 이력이 없으면 슬롯 간격(30분)으로 1인당 시간을 잡는다. 앞 2명 → 60분.
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    await committed_conn.execute(
        "insert into doctor_schedule_rules (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments) "
        "values ($1,0,'09:00','18:00',30,50),($1,1,'09:00','18:00',30,50),($1,2,'09:00','18:00',30,50),"
        "($1,3,'09:00','18:00',30,50),($1,4,'09:00','18:00',30,50),($1,5,'09:00','18:00',30,50),($1,6,'09:00','18:00',30,50)",
        doctor_id)
    me = _ctx(await seed_patient(committed_conn))
    await _waiting(committed_conn, dept, doctor_id, (await seed_patient(committed_conn, phone="010-1"))["patient_id"], 1)
    await _waiting(committed_conn, dept, doctor_id, (await seed_patient(committed_conn, phone="010-2"))["patient_id"], 2)
    mine = await _waiting(committed_conn, dept, doctor_id, me.id, 3)
    st = await q.get_queue_status(me, mine)
    assert st["patients_ahead"] == 2 and st["estimated_wait_minutes"] == 60


@pytest.mark.asyncio
async def test_wait_estimate_null_when_no_basis(committed_conn):
    # 3단 대체 ③: 실측도 슬롯 간격도 없으면 숫자를 만들지 않는다(CARD-WAIT-04).
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    await _waiting(committed_conn, dept, doctor_id, (await seed_patient(committed_conn, phone="010-3"))["patient_id"], 1)
    mine = await _waiting(committed_conn, dept, doctor_id, me.id, 2)
    st = await q.get_queue_status(me, mine)
    assert st["patients_ahead"] == 1 and st["estimated_wait_minutes"] is None


async def _future_appt(committed_conn, me, dept, doctor_id):
    from app.services import patient_booking_service
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-09-01','09:00') returning id",
        doctor_id)
    return await patient_booking_service.create_booking(
        me, for_patient_id=me.id, department_id=dept, doctor_id=doctor_id,
        slot_id=slot, reason="감기", request_id=uuid4())


@pytest.mark.asyncio
async def test_list_my_appointments_excludes_cancelled_and_past(committed_conn):
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    live = await _future_appt(committed_conn, me, dept, doctor_id)
    # 과거 예약확정(직원 상태전이 누락) 1건은 나의 예약(진행 중)에서 빠진다.
    past_slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,'2020-01-01','09:00','예약됨') returning id",
        doctor_id)
    await committed_conn.execute(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
        "values ($1,$2,$2,$3,$4,'예약확정','app')", past_slot, me.id, dept, doctor_id)
    rows = await q.list_my_appointments(me)
    assert [r["id"] for r in rows] == [live]
    assert rows[0]["slot_date"] is not None  # SDB-21: 예약됨 슬롯 날짜가 NULL로 새지 않는다


@pytest.mark.asyncio
async def test_list_my_appointments_is_self_and_tiebreak(committed_conn):
    # LIST-LIST-02·03(갭 #76): 같은 날 같은 시각이면 본인 → 가족 → 이름 순으로 '고정'된다.
    # LIST-LIST-15: 본인 줄은 is_self=True로 와야 '본인' 표기가 가능하다.
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn, name="김본인"))
    # 같은 계정에 두 가족 + 본인, 셋 다 같은 슬롯 시각. 이름 오름차순은 '가족가나' < '가족다라'(ㄱ<ㄷ).
    daughter = await seed_patient(committed_conn, name="가족다라", phone="010-d")
    son = await seed_patient(committed_conn, name="가족가나", phone="010-s")
    for fam in (daughter, son):
        await committed_conn.execute(
            "insert into patient_family_links (account_patient_id, family_patient_id, relation, is_active) "
            "values ($1,$2,'가족',true)", me.id, fam["patient_id"])

    # 슬롯은 (의사,날짜,시각)이 유일하므로 같은 10:00을 세 번 쓰려면 의사가 달라야 한다(모두 같은 과).
    async def _appt(for_patient_id):
        d = await seed_staff(committed_conn, role="doctor")
        await committed_conn.execute("update staff set department_id=$1 where id=$2", dept, d["staff_id"])
        slot = await committed_conn.fetchval(
            "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-09-01','10:00') returning id",
            d["staff_id"])
        return await committed_conn.fetchval(
            "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
            "values ($1,$2,$3,$4,$5,'예약확정','app') returning id",
            slot, me.id, for_patient_id, dept, d["staff_id"])

    await _appt(me.id)
    await _appt(daughter["patient_id"])
    await _appt(son["patient_id"])
    rows = await q.list_my_appointments(me)
    same = [r for r in rows if r["slot_date"].isoformat() == "2999-09-01" and str(r["start_time"]).startswith("10")]
    # 본인 먼저, 그다음 가족은 이름 오름차순('가족가나' < '가족다라')
    assert [r["for_patient_name"] for r in same] == ["김본인", "가족가나", "가족다라"]
    assert next(r for r in same if r["for_patient_name"] == "김본인")["is_self"] is True
    assert next(r for r in same if r["for_patient_name"] == "가족가나")["is_self"] is False


@pytest.mark.asyncio
async def test_get_appointment_detail_has_names(committed_conn):
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    aid = await _future_appt(committed_conn, me, dept, doctor_id)
    d = await q.get_appointment_detail(me, aid)
    assert d["department_name"] == "내과" and d["status"] in ("예약신청", "예약확정")


@pytest.mark.asyncio
async def test_appointment_detail_includes_reason(committed_conn):
    # [APPT-INFO-03] 갭 #49 — 방문이유가 상세 응답에 있어야 한다(예약할 때 쓴 문장 그대로).
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    aid = await _future_appt(committed_conn, me, dept, doctor_id)  # _future_appt은 reason='감기'로 예약한다
    d = await q.get_appointment_detail(me, aid)
    assert d["reason"] == "감기"


@pytest.mark.asyncio
async def test_appointment_detail_questionnaire_status(committed_conn):
    # [APPT-QNR-02] 완료 문진이 없으면 'none'(미작성 줄) / [APPT-QNR-03] 진료 전 완료면 'writable'(수정 가능).
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    aid = await _future_appt(committed_conn, me, dept, doctor_id)
    assert (await q.get_appointment_detail(me, aid))["questionnaire_status"] == "none"
    tmpl = await committed_conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) values ($1, '[]'::jsonb) returning id", dept)
    await committed_conn.execute(
        "insert into questionnaire_responses (appointment_id, template_id, answers, completed_at) "
        "values ($1,$2,'{}'::jsonb, now())", aid, tmpl)
    assert (await q.get_appointment_detail(me, aid))["questionnaire_status"] == "writable"


@pytest.mark.asyncio
async def test_list_my_appointments_carries_canceller(committed_conn):
    # CARD-CXL-09(갭 #11): 오늘 병원취소는 홈에 자정까지 뜨고 주체·시각을 함께 내려줘야 3갈래가 성립한다.
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, current_date, '09:00') returning id",
        doctor_id)
    aid = await committed_conn.fetchval(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source, "
        "  cancelled_by, cancelled_at) values ($1,$2,$2,$3,$4,'병원취소','staff','hospital', now()) returning id",
        slot, me.id, dept, doctor_id)
    rows = await q.list_my_appointments(me)
    row = next(r for r in rows if r["id"] == aid)  # CARD-CXL-05·06: 오늘 취소는 목록에 남는다
    assert row["cancelled_by"] == "hospital" and row["cancelled_at"] is not None
    assert row["is_self"] is True and row["relation"] == "본인"


@pytest.mark.asyncio
async def test_list_my_appointments_family_relation(committed_conn):
    # CARD-COMMON-01: 가족 예약은 관계 문자열(예: '어머니')을 제목에 쓰도록 내려준다.
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    mom = await seed_patient(committed_conn, phone="010-mom")
    await committed_conn.execute(
        "insert into patient_family_links (account_patient_id, family_patient_id, relation, is_active) "
        "values ($1,$2,'어머니',true)", me.id, mom["patient_id"])
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, current_date, '10:00') returning id",
        doctor_id)
    aid = await committed_conn.fetchval(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
        "values ($1,$2,$3,$4,$5,'예약확정','app') returning id", slot, me.id, mom["patient_id"], dept, doctor_id)
    rows = await q.list_my_appointments(me)
    row = next(r for r in rows if r["id"] == aid)
    assert row["is_self"] is False and row["relation"] == "어머니"


@pytest.mark.asyncio
async def test_appointment_detail_carries_change_and_reject_fields(committed_conn):
    # [CANCEL-REJ-01·02] 반려 배너 데이터 + [CANCEL-LATE-02] 마감 N시간 + 변경 마법사(T22)용 doctor_id·department_id.
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn))
    aid = await _future_appt(committed_conn, me, dept, doctor_id)
    await committed_conn.execute(
        "update appointments set cancel_rejected_at=now(), cancel_rejected_reason='진료 준비됨' where id=$1", aid)
    d = await q.get_appointment_detail(me, aid)
    assert d["cancel_rejected_reason"] == "진료 준비됨" and d["cancel_rejected_at"] is not None
    assert d["doctor_id"] == doctor_id and d["department_id"] == dept  # 변경 마법사가 소비
    assert d["cancellation_deadline_hours"] is not None  # definer 창구가 값(기본 24)을 준다


# ── 문진 진행률 소급(Task 24 Step 3) ─────────────────────────────
async def _seed_template(committed_conn, dept, questions):
    await committed_conn.execute(
        "insert into questionnaire_templates (department_id, questions) values ($1, $2::jsonb)",
        dept, json.dumps(questions, ensure_ascii=False))


@pytest.mark.asyncio
async def test_qnr_progress_fields_on_list(committed_conn):
    """[QNR-PROG-07][QNR-PROG-09] 홈 줄이 쓸 진행률을 서버가 내려준다 — 화면이 세지 않는다."""
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn, gender="F"))
    aid = await _future_appt(committed_conn, me, dept, doctor_id)
    await _seed_template(committed_conn, dept, [
        {"id": "q1", "text": "키", "type": "short_text", "required": False, "show_to": "all"},
        {"id": "q2", "text": "임신 가능성", "type": "yes_no", "required": True, "show_to": "female"},
        {"id": "q3", "text": "증상", "type": "long_text", "required": False, "show_to": "all"},
    ])
    await qsvc.save_response(
        me, aid, [{"question_id": "q1", "question_text": "키", "value": "170"}], complete=False)
    rows = await q.list_my_appointments(me)
    row = next(r for r in rows if r["id"] == aid)
    assert row["questionnaire_state"] == "작성 중"  # 완료 표시 없음(갭 #50 — 행 존재로 판정하지 않는다)
    assert row["questionnaire_answered"] == 1
    assert row["questionnaire_total"] == 3  # 여성이라 임신 문항이 분모에 든다


@pytest.mark.asyncio
async def test_qnr_progress_total_differs_by_gender(committed_conn):
    """[QNR-PROG-03] 같은 진료과라도 남성은 분모가 하나 준다 — 홈 줄 숫자도 따라 갈린다."""
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn, gender="M"))
    aid = await _future_appt(committed_conn, me, dept, doctor_id)
    await _seed_template(committed_conn, dept, [
        {"id": "q1", "text": "키", "type": "short_text", "required": False, "show_to": "all"},
        {"id": "q2", "text": "임신 가능성", "type": "yes_no", "required": True, "show_to": "female"},
    ])
    rows = await q.list_my_appointments(me)
    row = next(r for r in rows if r["id"] == aid)
    assert row["questionnaire_total"] == 1  # 임신 문항이 빠졌다
    assert row["questionnaire_state"] == "미작성"  # 행이 없으면 미작성


@pytest.mark.asyncio
async def test_qnr_state_done_only_after_submit(committed_conn):
    """[QNR-PROG-07] 「작성완료」는 [제출하기]를 누른 뒤에만 — 자동 저장으로는 안 찍힌다."""
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn, gender="F"))
    aid = await _future_appt(committed_conn, me, dept, doctor_id)
    await _seed_template(committed_conn, dept,
                         [{"id": "q1", "text": "키", "type": "short_text", "required": False, "show_to": "all"}])
    await qsvc.save_response(
        me, aid, [{"question_id": "q1", "question_text": "키", "value": "170"}], complete=True)
    rows = await q.list_my_appointments(me)
    assert next(r for r in rows if r["id"] == aid)["questionnaire_state"] == "작성완료"


@pytest.mark.asyncio
async def test_qnr_total_uses_active_version_not_duplicated(committed_conn):
    """[QADM-VERSION-01] 진료과에 버전이 여럿이어도 예약 한 건은 한 줄이고, 분모는 현재 활성 버전이다."""
    _admin, doctor_id, dept = await _seed_doctor_dept(committed_conn)
    me = _ctx(await seed_patient(committed_conn, gender="F"))
    aid = await _future_appt(committed_conn, me, dept, doctor_id)
    await _seed_template(committed_conn, dept, [
        {"id": "q1", "text": "키", "type": "short_text", "required": False, "show_to": "all"},
        {"id": "q2", "text": "증상", "type": "long_text", "required": False, "show_to": "all"},
    ])  # v1(2문항)을 내리고 1문항짜리 v2를 활성으로
    await committed_conn.execute(
        "update questionnaire_templates set is_active=false where department_id=$1", dept)
    await committed_conn.execute(
        "insert into questionnaire_templates (department_id, questions, version_no, is_active) "
        "values ($1, $2::jsonb, 2, true)", dept,
        json.dumps([{"id": "q9", "text": "새 문항", "type": "short_text", "required": False, "show_to": "all"}],
                   ensure_ascii=False))
    rows = [r for r in await q.list_my_appointments(me) if r["id"] == aid]
    assert len(rows) == 1                        # 버전이 둘이어도 예약 줄이 불어나지 않는다(조인 중복 방지)
    assert rows[0]["questionnaire_total"] == 1   # 활성 v2의 문항 수
