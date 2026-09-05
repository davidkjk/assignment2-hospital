"""[PTDET-VISIT-07][DOCTOR-HISTORY-02][R5-02][PTDET-FAMILY-04·05][R5-06][PTDET-NOTE-01·04]
환자 하위 이력 — 직원(공용 이어받기·해제 링크 제외·서버 재판정·마스킹·메모)
+ 환자앱(방문 이력 4상태·취소주체·20건 커서).
"""
from datetime import date, time

import pytest

from app.core.patient_security import PatientContext
from app.services import patient_history_service
from app.services import patient_history_service as h
from tests.conftest import seed_patient as seed_patient_c, seed_staff, set_session_auth
from tests.task13_fixtures import (
    db_today, seed_appointment, seed_department, seed_doctor, seed_patient, seed_slot, to_context,
)


# ── 직원 이력 테스트 헬퍼 ──
async def _recept(conn):
    return to_context(await seed_staff(conn, role="receptionist"), "receptionist")




# ── 환자앱 이력 테스트 헬퍼 ──
def _ctx(s): return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


async def _past(committed_conn, me, dept, doctor_id, status, date_str, *, note=None):
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1,$2,'09:00','예약됨') returning id",
        doctor_id, date.fromisoformat(date_str) if isinstance(date_str, str) else date_str)
    aid = await committed_conn.fetchval(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
        "values ($1,$2,$2,$3,$4,$5,'app') returning id", slot, me.id, dept, doctor_id, status)
    if note is not None:
        await committed_conn.execute(
            "insert into medical_records (appointment_id, doctor_id, symptoms, diagnosis, patient_visible_notes, is_completed) "
            "values ($1,$2,'내부','내부',$3,true)", aid, doctor_id, note)
    return aid


async def _seed_dd(committed_conn):
    doctor = await seed_staff(committed_conn, role="doctor")
    dept = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    return doctor["staff_id"], dept




# ══════ 직원(스탭) 이력 테스트 ══════

@pytest.mark.asyncio
async def test_피티뎃_비짓_07_방문_이력은_공용_이어받기를_쓴다(db_conn):
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    patient = await seed_patient(db_conn)
    for _ in range(25):
        await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                               patient_id=patient, status="진료완료")
    staff = await _recept(db_conn)
    await set_session_auth(db_conn, staff.auth_user_id)

    page = await patient_history_service.get_visits(patient, staff, cursor=None, conn=db_conn)
    assert len(page.rows) == 20 and page.next_cursor is not None


@pytest.mark.asyncio
async def test_피티뎃_비짓_07_이어받기는_겹치지도_빠지지도_않는다(db_conn):
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    patient = await seed_patient(db_conn)
    for _ in range(25):
        await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                               patient_id=patient, status="진료완료")
    staff = await _recept(db_conn)
    await set_session_auth(db_conn, staff.auth_user_id)

    first = await patient_history_service.get_visits(patient, staff, cursor=None, conn=db_conn)
    second = await patient_history_service.get_visits(patient, staff, cursor=first.next_cursor, conn=db_conn)
    ids = [r["id"] for r in first.rows] + [r["id"] for r in second.rows]
    assert len(ids) == len(set(ids)) == 25


@pytest.mark.asyncio
async def test_닥터_히스토리_02_진료기록_이력도_같은_부품이다(db_conn):
    """같은 계약을 두 벌 만들면 한쪽만 고쳐지고 아무도 모른다."""
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    patient = await seed_patient(db_conn)
    staff = to_context(doc, "doctor", dept)
    await set_session_auth(db_conn, doc["auth_user_id"])
    page = await patient_history_service.get_medical_records(patient, staff, cursor=None, conn=db_conn)
    assert page.order == ("occurred_at desc", "id desc")


@pytest.mark.asyncio
async def test_R5_02_해제된_가족_연결은_빠진다(db_conn):
    """[R5-02] is_active만 조회한다 — 해제한 연결이 계속 보이면 '연결을 끊었다'가 거짓이 된다."""
    account = await seed_patient(db_conn)
    member = await seed_patient(db_conn, phone="01099998888")
    staff = await _recept(db_conn)
    link_id = await db_conn.fetchval(
        "insert into patient_family_links "
        "(account_patient_id, family_patient_id, relation, is_active, unlinked_at, unlinked_by, unlink_reason) "
        "values ($1,$2,'배우자', false, now(), $3, '테스트 해제') returning id",
        account, member, staff.id,
    )
    await set_session_auth(db_conn, staff.auth_user_id)
    rows = await patient_history_service.get_family(account, staff, conn=db_conn)
    assert link_id not in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_피티뎃_패밀리_04_예외_입구는_서버가_다시_판정한다(db_conn):
    """B에게 등록 번호가 있으면 예외 경로를 열지 않는다(판정은 서버가)."""
    account = await seed_patient(db_conn)
    member = await seed_patient(db_conn, phone="01055556666")
    staff = await _recept(db_conn)
    await set_session_auth(db_conn, staff.auth_user_id)
    result = await patient_history_service.verify_family_eligibility(account, member, staff, conn=db_conn)
    assert result.allowed is False
    assert result.message == "등록된 번호가 있어 다른 확인 방법으로 전환할 수 없습니다"


@pytest.mark.asyncio
async def test_R5_06_하위_목록은_마스킹된_값만_담는다(db_conn):
    """[R5-06] 원본 birth_date·phone은 응답에 아예 없다."""
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    patient = await seed_patient(db_conn)  # birth 1985-03-01
    await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                           patient_id=patient, status="진료완료")
    staff = await _recept(db_conn)
    await set_session_auth(db_conn, staff.auth_user_id)
    page = await patient_history_service.get_visits(patient, staff, cursor=None, conn=db_conn)
    assert "birth_date" not in page.rows[0] and "phone" not in page.rows[0]
    assert page.rows[0]["masked_birth_date"] == "1985-**-01"


# ── 내부 메모 (PTDET-NOTE-01·04) ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_피티뎃_노트_01_작성자와_시각을_담는다(db_conn):
    patient = await seed_patient(db_conn)
    staff = await _recept(db_conn)
    await set_session_auth(db_conn, staff.auth_user_id)
    await patient_history_service.add_note(patient, "확인 요청 메모", staff, conn=db_conn)
    notes = await patient_history_service.get_notes(patient, staff, conn=db_conn)
    assert notes[0]["content"] == "확인 요청 메모"
    assert notes[0]["staff_name"] == "Test Staff" and notes[0]["created_at"] is not None


@pytest.mark.asyncio
async def test_피티뎃_노트_01_최신순으로_준다(db_conn):
    """작성 시각이 다른 두 메모는 최신 것이 먼저 온다(PTDET-NOTE-01)."""
    patient = await seed_patient(db_conn)
    staff = await _recept(db_conn)
    await db_conn.execute(
        "insert into patient_internal_notes (patient_id, staff_id, content, created_at) "
        "values ($1,$2,'먼저 쓴 메모', now() - interval '10 minutes')",
        patient, staff.id,
    )
    await db_conn.execute(
        "insert into patient_internal_notes (patient_id, staff_id, content, created_at) "
        "values ($1,$2,'나중 쓴 메모', now())",
        patient, staff.id,
    )
    await set_session_auth(db_conn, staff.auth_user_id)
    notes = await patient_history_service.get_notes(patient, staff, conn=db_conn)
    assert notes[0]["content"] == "나중 쓴 메모"


@pytest.mark.asyncio
async def test_문진은_담당의가_예약별로_읽는다(db_conn):
    """[R2-02] RLS가 담당의만 열도록 판정한다."""
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    patient = await seed_patient(db_conn)
    appt = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                  patient_id=patient, status="진료중")
    template = await db_conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) values ($1, '[]'::jsonb) returning id",
        dept,
    )
    await db_conn.execute(
        "insert into questionnaire_responses (appointment_id, template_id, answers) "
        "values ($1,$2,'{\"q1\":\"예\"}'::jsonb)",
        appt, template,
    )
    staff = to_context(doc, "doctor", dept)
    await set_session_auth(db_conn, doc["auth_user_id"])
    result = await patient_history_service.get_questionnaire(appt, staff, conn=db_conn)
    assert result["answers"] is not None and result["appointment_id"] == appt


@pytest.mark.asyncio
async def test_피티뎃_큐엔알_03_직원_방문이력엔_작성여부만_실리고_답변은_없다(db_conn):
    """[PTDET-QNR-03 A안] 접수직원의 방문 이력엔 문진 '제출 시각'만 온다 — answers는 절대 없다.
    정의자 권한 함수(00076)가 제출 시각만 돌려주므로 RLS(담당의 전용 내용)는 그대로 지켜진다."""
    dept = await seed_department(db_conn)
    doc = await seed_doctor(db_conn, dept)
    patient = await seed_patient(db_conn)
    with_q = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                    patient_id=patient, status="진료완료")
    without_q = await seed_appointment(db_conn, doctor_id=doc["staff_id"], department_id=dept,
                                       patient_id=patient, status="예약확정")
    template = await db_conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) values ($1, '[]'::jsonb) returning id",
        dept,
    )
    await db_conn.execute(
        "insert into questionnaire_responses (appointment_id, template_id, answers) "
        "values ($1,$2,'{\"q1\":\"예\"}'::jsonb)",
        with_q, template,
    )
    staff = await _recept(db_conn)
    await set_session_auth(db_conn, staff.auth_user_id)
    page = await patient_history_service.get_visits(patient, staff, cursor=None, conn=db_conn)
    by_id = {r["id"]: r for r in page.rows}
    assert by_id[with_q]["questionnaire_submitted_at"] is not None      # 작성완료
    assert by_id[without_q]["questionnaire_submitted_at"] is None       # 미작성
    assert "answers" not in by_id[with_q]                               # 답변 내용은 안 실린다


def test_피티뎃_노트_04_수정_삭제_창구는_없다():
    """[PTDET-NOTE-04 BLOCKED] 변경이력·삭제 복구 계약이 없어 수정·삭제 함수를 열지 않는다."""
    assert not hasattr(patient_history_service, "update_note")
    assert not hasattr(patient_history_service, "delete_note")


# ══════ 환자앱 이력 테스트 ══════

@pytest.mark.asyncio
async def test_history_covers_four_statuses_newest_first(committed_conn):
    did, dept = await _seed_dd(committed_conn)
    me = _ctx(await seed_patient_c(committed_conn))
    await _past(committed_conn, me, dept, did, "진료완료", "2026-01-10", note="휴식하세요")
    await _past(committed_conn, me, dept, did, "환자취소", "2026-02-10")
    await _past(committed_conn, me, dept, did, "예약부도", "2026-03-10")
    await _past(committed_conn, me, dept, did, "예약신청", "2020-01-01")  # 지난 예약신청 = 확정되지않음
    res = await h.list_visit_history(me, me.id)
    statuses = {i["visit_status"] for i in res["items"]}
    assert statuses == {"진료완료", "취소됨", "방문하지않음", "확정되지않음"}
    # 날짜 내림차순: 2026-03-10(부도) > 02-10(취소) > 01-10(완료) > 2020(미확정).
    assert [i["visit_status"] for i in res["items"]] == ["방문하지않음", "취소됨", "진료완료", "확정되지않음"]
    done = next(i for i in res["items"] if i["visit_status"] == "진료완료")
    assert done["patient_visible_notes"] == "휴식하세요"


@pytest.mark.asyncio
async def test_history_includes_cancel_actor_fields(committed_conn):
    # HIST-ROW-02·03: 이력 조회가 '취소됨 · 누가' + 취소 시각을 그리려면 4필드가 와야 한다.
    # 칸은 00025(취소 주체)에 이미 있다 — 이력 SELECT만 넓힌다(마이그레이션 없음).
    did, dept = await _seed_dd(committed_conn)
    me = _ctx(await seed_patient_c(committed_conn))
    aid = await _past(committed_conn, me, dept, did, "병원취소", "2026-02-10")
    await committed_conn.execute(  # 직원웹 취소가 채우는 칸(여기선 seed로 흉내)
        "update appointments set cancelled_by='hospital', cancelled_at='2026-02-05T15:12:00' where id=$1", aid)
    res = await h.list_visit_history(me, me.id)
    row = next(i for i in res["items"] if i["visit_status"] == "취소됨")
    assert row["cancelled_by"] == "hospital"
    assert row["cancelled_at"] is not None
    assert row["is_self"] is True  # 본인 예약(account_patient_id = for_patient_id)


@pytest.mark.asyncio
async def test_history_paginates_20_with_cursor(committed_conn):
    did, dept = await _seed_dd(committed_conn)
    me = _ctx(await seed_patient_c(committed_conn))
    for i in range(25):
        await _past(committed_conn, me, dept, did, "진료완료", f"2026-{(i%12)+1:02d}-{(i%27)+1:02d}")
    first = await h.list_visit_history(me, me.id, limit=20)
    assert len(first["items"]) == 20 and first["next_cursor"] is not None
    second = await h.list_visit_history(me, me.id, cursor=first["next_cursor"], limit=20)
    assert len(second["items"]) == 5 and second["next_cursor"] is None
