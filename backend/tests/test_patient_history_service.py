"""[PTDET-VISIT-07][DOCTOR-HISTORY-02][R5-02][PTDET-FAMILY-04][R5-06][PTDET-NOTE-01·04]
환자 하위 이력 — 공용 이어받기·해제 링크 제외·서버 재판정·마스킹 경계·내부 메모.
"""
from datetime import time

import pytest

from app.services import patient_history_service
from tests.conftest import set_session_auth
from tests.task13_fixtures import (
    db_today, seed_appointment, seed_department, seed_doctor, seed_patient, seed_slot, to_context,
)


async def _recept(conn):
    from tests.conftest import seed_staff
    return to_context(await seed_staff(conn, role="receptionist"), "receptionist")


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


def test_피티뎃_노트_04_수정_삭제_창구는_없다():
    """[PTDET-NOTE-04 BLOCKED] 변경이력·삭제 복구 계약이 없어 수정·삭제 함수를 열지 않는다."""
    assert not hasattr(patient_history_service, "update_note")
    assert not hasattr(patient_history_service, "delete_note")
