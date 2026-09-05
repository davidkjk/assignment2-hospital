import json
import pytest
from uuid import uuid4

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_booking_service, patient_questionnaire_service
from tests.conftest import seed_patient, seed_staff

# 문진 서비스는 acquire_as(patient)로 별도 커넥션을 연다(create_booking과 같은 자기커넥션 패턴) →
# 시드·검증은 committed_conn으로. committed_conn은 postgres 역할이라 RLS를 우회해 양식·상태를 직접 세운다
# (계획 원안의 admin+set_session_auth 군더더기는 필요 없다. Task 5·6 하네스 보정과 동일).

# ⭐ 정본 계약(admin _validate = SHOW_TO {all,female,male} · QUESTION_TYPES {short_text,long_text,yes_no}).
# 옛 픽스처는 visible_to+한글이라 서비스가 visible_to를 읽던 시절엔 통과했으나, 실제 API가 내리는
# show_to+영문과 어긋나 있었다(C2). 여기를 정본으로 맞춰 서비스 계약과 짝을 이룬다.
_Q = json.dumps([
    {"id": "q1", "text": "증상은?", "type": "short_text", "required": True, "show_to": "all"},
    {"id": "q2", "text": "임신 가능성?", "type": "yes_no", "required": True, "show_to": "female"},
], ensure_ascii=False)


async def _bump_active_version(committed_conn, dept, questions):
    """현재 활성 버전을 내리고 새 문항으로 활성 v2를 올린다(QADM-VERSION-01: 활성은 진료과당 하나)."""
    await committed_conn.execute(
        "update questionnaire_templates set is_active=false where department_id=$1", dept)
    return await committed_conn.fetchval(
        "insert into questionnaire_templates (department_id, questions, version_no, is_active) "
        "values ($1, $2::jsonb, 2, true) returning id",
        dept, json.dumps(questions, ensure_ascii=False))


async def _seed_appt(committed_conn, *, gender="F"):
    doctor = await seed_staff(committed_conn, role="doctor")
    dept = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    await committed_conn.execute("insert into questionnaire_templates (department_id, questions) values ($1,$2)", dept, _Q)
    slot = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,'2999-08-01','09:00') returning id",
        doctor["staff_id"])
    ps = await seed_patient(committed_conn, gender=gender)
    me = PatientContext(id=ps["patient_id"], auth_user_id=ps["auth_user_id"])
    aid = await patient_booking_service.create_booking(
        me, for_patient_id=me.id, department_id=dept, doctor_id=doctor["staff_id"],
        slot_id=slot, reason="감기", request_id=uuid4())
    return {"me": me, "dept": dept, "appointment_id": aid}


@pytest.mark.asyncio
async def test_migration_adds_completed_at(committed_conn):
    assert await committed_conn.fetchval(
        "select 1 from information_schema.columns where table_name='questionnaire_responses' "
        "and column_name='completed_at'") == 1


@pytest.mark.asyncio
async def test_get_template_filters_by_for_patient_gender(committed_conn):
    # QNR-SHOW-01: 남성은 '여성 환자만' 문항이 빠지고 total도 준다.
    ctx = await _seed_appt(committed_conn, gender="M")
    tpl = await patient_questionnaire_service.get_template(ctx["me"], ctx["appointment_id"])
    assert [q["id"] for q in tpl["questions"]] == ["q1"] and tpl["total"] == 1


@pytest.mark.asyncio
async def test_get_template_shows_female_only_for_female(committed_conn):
    ctx = await _seed_appt(committed_conn, gender="F")
    tpl = await patient_questionnaire_service.get_template(ctx["me"], ctx["appointment_id"])
    assert [q["id"] for q in tpl["questions"]] == ["q1", "q2"] and tpl["total"] == 2


@pytest.mark.asyncio
async def test_get_template_uses_active_version(committed_conn):
    """[QADM-VERSION-01] 진료과에 버전이 여럿이면 현재 활성 버전만 내려간다 — 옛 비활성 버전을 주지 않는다."""
    ctx = await _seed_appt(committed_conn, gender="F")   # v1 = q1·q2
    await _bump_active_version(committed_conn, ctx["dept"],
                               [{"id": "q9", "text": "새 문항", "type": "short_text", "required": False, "show_to": "all"}])
    tpl = await patient_questionnaire_service.get_template(ctx["me"], ctx["appointment_id"])
    assert [q["id"] for q in tpl["questions"]] == ["q9"] and tpl["total"] == 1


@pytest.mark.asyncio
async def test_get_response_counts_against_snapshot_version(committed_conn):
    """[QADM-VERSION-06] 저장된 응답은 제출 당시 버전(template_id 스냅샷)으로 센다 — 뒤에 새 버전이 나와도 분모가 안 바뀐다."""
    ctx = await _seed_appt(committed_conn, gender="F")   # v1 = q1·q2 (여성이라 둘 다 보임)
    await patient_questionnaire_service.save_response(
        ctx["me"], ctx["appointment_id"],
        [{"question_id": "q1", "question_text": "증상은?", "value": "기침"}], complete=False)
    await _bump_active_version(committed_conn, ctx["dept"],
                               [{"id": "q9", "text": "새 문항", "type": "short_text", "required": False, "show_to": "all"}])
    saved = await patient_questionnaire_service.get_response(ctx["me"], ctx["appointment_id"])
    assert saved["total"] == 2      # 스냅샷 v1의 문항 수 — 활성 v2(1문항)로 다시 세지 않는다
    assert saved["answered"] == 1


@pytest.mark.asyncio
async def test_autosave_is_writing_not_complete(committed_conn):
    # QNR-STATE-02·04: 자동 저장은 '작성 중'이고 completed_at을 찍지 않는다. 진행률은 답 수/보이는 수.
    ctx = await _seed_appt(committed_conn, gender="F")
    ans = [{"question_id": "q1", "question_text": "증상은?", "value": "기침"}]
    r = await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=False)
    assert r["state"] == "작성 중" and r["answered"] == 1 and r["total"] == 2
    assert await committed_conn.fetchval(
        "select completed_at from questionnaire_responses where appointment_id=$1", ctx["appointment_id"]) is None


@pytest.mark.asyncio
async def test_submit_marks_complete_and_snapshots_text(committed_conn):
    # QNR-STATE-03·04 + QNR-ID-02: [제출하기]는 completed_at을 찍고, 답에 그때 질문 글자가 남는다.
    ctx = await _seed_appt(committed_conn, gender="F")
    ans = [{"question_id": "q1", "question_text": "증상은?", "value": "기침"},
           {"question_id": "q2", "question_text": "임신 가능성?", "value": "아니오"}]
    r = await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=True)
    assert r["state"] == "작성완료" and r["answered"] == 2
    saved = await patient_questionnaire_service.get_response(ctx["me"], ctx["appointment_id"])
    assert saved["state"] == "작성완료" and saved["completed_at"] is not None
    assert saved["answers"][0]["question_text"] == "증상은?"  # 스냅샷 보존


@pytest.mark.asyncio
async def test_autosave_keeps_completed_at_once_submitted(committed_conn):
    ctx = await _seed_appt(committed_conn, gender="F")
    ans = [{"question_id": "q1", "question_text": "증상은?", "value": "기침"}]
    await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=True)
    r = await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=False)
    assert r["state"] == "작성완료"  # 이미 완료된 것을 자동저장이 되돌리지 않는다


@pytest.mark.asyncio
async def test_save_rejected_from_treatment_start(committed_conn):
    # #21: 진료중부터 읽기 전용. 도착/진료대기까지는 허용.
    ctx = await _seed_appt(committed_conn, gender="F")
    await committed_conn.execute("update appointments set status='도착' where id=$1", ctx["appointment_id"])
    ans = [{"question_id": "q1", "question_text": "증상은?", "value": "기침"}]
    r = await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=False)
    assert r["answered"] == 1  # 도착 상태는 허용
    # 상태 전이 가드(enforce_appointment_status_transition)상 도착→진료중 직접 전이는 없다 → 진료대기 경유.
    await committed_conn.execute("update appointments set status='진료대기' where id=$1", ctx["appointment_id"])
    await committed_conn.execute("update appointments set status='진료중' where id=$1", ctx["appointment_id"])
    with pytest.raises(AppError) as e:
        await patient_questionnaire_service.save_response(ctx["me"], ctx["appointment_id"], ans, complete=False)
    assert e.value.status_code == 400


@pytest.mark.asyncio
async def test_get_response_none_when_unwritten(committed_conn):
    ctx = await _seed_appt(committed_conn, gender="F")
    assert await patient_questionnaire_service.get_response(ctx["me"], ctx["appointment_id"]) is None


# ─── Step 7(갭 #57·QNR-SHOW-10): 성별 값 표준화 — 00028 백필 + check 제약 ───

@pytest.mark.asyncio
async def test_gender_check_rejects_free_text(db_conn):
    """[QNR-SHOW-10] '여'는 이제 저장되지 않는다 — 문진 「보일 대상」이 어긋날 길을 막는다."""
    with pytest.raises(Exception):     # asyncpg.CheckViolationError
        await db_conn.execute(
            "insert into patients (name, birth_date, gender, phone) "
            "values ('홍길동','1985-03-01','여','01012345678')")


@pytest.mark.asyncio
async def test_gender_backfill_maps_korean_values(db_conn):
    """[QNR-SHOW-10] 이미 들어와 있던 '여'·'남'은 F·M으로 정리된다(마이그레이션 백필 + check)."""
    rows = await db_conn.fetch("select distinct gender from patients")
    assert {r["gender"] for r in rows} <= {"F", "M"}


@pytest.mark.asyncio
async def test_visible_to_works_after_standardization(committed_conn):
    """[QNR-SHOW-10] 값이 표준화돼야 「여성 환자만」 문항이 실제로 뜬다 — 갭 #57이 닫힌 증거.

    ⚠️ _seed_appt는 create_booking(acquire_as 자기커넥션)을 쓰므로 committed_conn 시딩이라야 서비스가 본다.
    """
    ctx = await _seed_appt(committed_conn, gender="F")   # _Q에 '여성 환자만' q2가 있다
    tpl = await patient_questionnaire_service.get_template(ctx["me"], ctx["appointment_id"])
    assert "q2" in [q["id"] for q in tpl["questions"]]   # 옛 '여' 값이었다면 조용히 빠졌을 문항
