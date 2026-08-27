"""[Task 21a][MERGE-*] 병합 후보 조회·병합 실행 서비스.

⭐ 결정 #15 — 병합은 원본을 옮기지 않는다. 바꾸는 것은 세 가지뿐이다:
   ①합쳐진 행 is_active=false ②계정 연결(대표가 비었을 때만) ③원장 한 줄.
   감사 행까지 같은 트랜잭션에 넣는다(MERGE-AUDIT-01).

테스트는 db_conn(오너 롤·롤백 트랜잭션)을 서비스에 주입해, seed된 미커밋 데이터를 보게 하고
거절 감사가 롤백되지 않게 한다(거절 감사는 주입 conn에 그대로 남아 같은 트랜잭션 안에서 보인다).
"""
import json
import uuid
from datetime import date

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import patient_merge_service
from tests.conftest import seed_staff


async def _seed_admin(conn) -> StaffContext:
    s = await seed_staff(conn, role="admin")
    return StaffContext(id=s["staff_id"], auth_user_id=s["auth_user_id"],
                        role="admin", department_id=None)


async def _seed_dept_and_doctor(conn):
    dept = await conn.fetchval(
        "insert into departments (name) values ('내과') returning id")
    doc = await seed_staff(conn, role="doctor", department_id=dept)
    return dept, doc["staff_id"]


async def _seed_patient(conn, name="김민서", birth=date(1990, 5, 14),
                        gender="F", phone="01012347251", linked=False):
    pid = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ($1, $2, $3, $4) returning id",
        name, birth, gender, phone,
    )
    if linked:
        await conn.execute(
            "update patients set auth_user_id = $2 where id = $1", pid, uuid.uuid4())
    return pid


async def _seed_duplicate_pair(conn, name="김민서", phone="01012347251",
                               both_linked=False, linked=None):
    """이름·생일·전화가 같은 두 활성 환자. linked='a'|'b'면 그쪽만 계정 연결."""
    a = await _seed_patient(conn, name=name, phone=phone, linked=both_linked or linked == "a")
    b = await _seed_patient(conn, name=name, phone=phone, linked=both_linked or linked == "b")
    return a, b


async def _seed_appointment_for(conn, patient, dept=None, doctor=None, status="예약확정"):
    if dept is None:
        dept, doctor = await _seed_dept_and_doctor(conn)
    return await conn.fetchval(
        "insert into appointments "
        "(account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
        "values ($1, $1, $2, $3, $4, 'staff') returning id",
        patient, dept, doctor, status,
    ), dept, doctor


async def _seed_questionnaire_for(conn, appointment, dept, answers=None):
    template = await conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) "
        "values ($1, '[]'::jsonb) returning id", dept)
    return await conn.fetchval(
        "insert into questionnaire_responses (appointment_id, template_id, answers) "
        "values ($1, $2, $3) returning id",
        appointment, template, json.dumps(answers or {"q1": "네"}))


async def _seed_completed_record_for(conn, patient):
    appt, dept, doctor = await _seed_appointment_for(conn, patient, status="진료완료")
    rec = await conn.fetchval(
        "insert into medical_records (appointment_id, doctor_id, diagnosis, is_completed) "
        "values ($1, $2, '감기', true) returning id", appt, doctor)
    await conn.execute(
        "insert into medical_record_revisions (record_id, previous_content, revised_by, reason) "
        "values ($1, '{}'::jsonb, $2, '오타')", rec, doctor)
    return rec, appt


async def _expected(conn, a, b):
    return await patient_merge_service.snapshot_counts(conn, a, b)


# ── 후보 목록 (MERGE-LIST-*) ─────────────────────────────────────────────────

async def test_후보는_이름_생일_전화가_같은_활성_행을_묶는다(db_conn):
    """[MERGE-LIST-01][R5-05] 자동으로 고르지 않고 그룹 안 행을 모두 보여준다."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn, name="김민서")
    await _seed_patient(db_conn, name="다른사람", phone="01099998888")
    groups = await patient_merge_service.list_merge_candidates(admin, conn=db_conn)
    assert len(groups) == 1
    assert {r.patient_id for r in groups[0].rows} == {a, b}
    assert all(r.is_primary is None for r in groups[0].rows)      # 미리 확정하지 않는다


async def test_후보_정렬은_동점에서도_흔들리지_않는다(db_conn):
    """[MERGE-LIST-02] 기록 수가 같으면 created_at, 그것도 같으면 id — 마지막 키가 있어야
    새로고침할 때마다 순서가 바뀌지 않는다(관리자가 「위의 것」이라고 말할 수 있어야 한다)."""
    admin = await _seed_admin(db_conn)
    await _seed_duplicate_pair(db_conn, name="김민서")
    first = [r.patient_id for r in
             (await patient_merge_service.list_merge_candidates(admin, conn=db_conn))[0].rows]
    second = [r.patient_id for r in
              (await patient_merge_service.list_merge_candidates(admin, conn=db_conn))[0].rows]
    assert first == second == sorted(first, key=str)


async def test_후보_응답에_원본_전화_생일이_없다(db_conn):
    """[MERGE-LIST-03][MASK-SRV-01] 두 사람을 나란히 놓는 화면이라 특히 위험하다.
    가족이 번호를 공유하면 남의 번호를 통째로 보게 된다."""
    admin = await _seed_admin(db_conn)
    await _seed_duplicate_pair(db_conn, name="김민서", phone="01012347251")
    body = json.dumps([g.model_dump() for g in
                       await patient_merge_service.list_merge_candidates(admin, conn=db_conn)],
                      default=str)
    assert "01012347251" not in body
    assert "****" in body


async def test_비교_항목은_없는_값을_0건으로_준다(db_conn):
    """[MERGE-COMPARE-02] 빈칸이면 「조회가 안 된 것」인지 「없는 것」인지 구분이 안 된다."""
    admin = await _seed_admin(db_conn)
    a, _ = await _seed_duplicate_pair(db_conn, name="김민서")
    row = next(r for g in await patient_merge_service.list_merge_candidates(admin, conn=db_conn)
               for r in g.rows if r.patient_id == a)
    assert row.counts == {"appointments": 0, "questionnaires": 0,
                          "medical_records": 0, "access_logs": 0}
    assert row.last_visit_at is None


async def test_후보_건수는_계보가_아니라_그_행만_센다(db_conn):
    """[MERGE-COMPARE-02] 병합 전에는 각 행의 자기 데이터만 보여준다(대표 조회 계보는 병합 후)."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn, name="김민서")
    appt, dept, _ = await _seed_appointment_for(db_conn, b)
    await _seed_questionnaire_for(db_conn, appt, dept)
    rows = {r.patient_id: r for g in
            await patient_merge_service.list_merge_candidates(admin, conn=db_conn)
            for r in g.rows}
    assert rows[b].counts["appointments"] == 1
    assert rows[b].counts["questionnaires"] == 1
    assert rows[a].counts["appointments"] == 0


# ── 병합 실행 (MERGE-DATA-*·STATE-04·RACE-01·AUDIT-01) ────────────────────────

async def test_두_행_모두_계정이_있으면_병합을_거절한다(db_conn):
    """[MERGE-COMPARE-04][MERGE-STATE-04] 계정을 하나 버리는 셈이라 자동으로 못 정한다."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn, both_linked=True)
    with pytest.raises(AppError) as e:
        await patient_merge_service.merge_patients(
            a, b, admin, expected=await _expected(db_conn, a, b), conn=db_conn)
    assert e.value.status_code == 409
    assert "계정이 연결되어" in e.value.message


async def test_병합은_예약의_소유_ID를_그대로_둔다(db_conn):
    """[MERGE-DATA-01] 결정 #15의 핵심 — account_patient_id·for_patient_id가 안 바뀐다."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn)
    appt, _, _ = await _seed_appointment_for(db_conn, b)
    await patient_merge_service.merge_patients(
        a, b, admin, expected=await _expected(db_conn, a, b), conn=db_conn)
    row = await db_conn.fetchrow(
        "select account_patient_id, for_patient_id from appointments where id = $1", appt)
    assert row["for_patient_id"] == b and row["account_patient_id"] == b


async def test_병합은_문진_응답을_건드리지_않는다(db_conn):
    """[MERGE-DATA-02] 문진은 예약(appointment_id)에 붙어 있어 예약 계보만 지키면 따라온다."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn)
    appt, dept, _ = await _seed_appointment_for(db_conn, b)
    await _seed_questionnaire_for(db_conn, appt, dept, answers={"q1": "원본"})
    before = await db_conn.fetchval(
        "select answers from questionnaire_responses where appointment_id = $1", appt)
    await patient_merge_service.merge_patients(
        a, b, admin, expected=await _expected(db_conn, a, b), conn=db_conn)
    after = await db_conn.fetchrow(
        "select appointment_id, answers from questionnaire_responses where appointment_id = $1",
        appt)
    assert after["appointment_id"] == appt and after["answers"] == before


async def test_병합은_진료기록과_수정이력을_그대로_둔다(db_conn):
    """[MERGE-DATA-03] 의사가 쓴 의무기록의 내용·작성자를 병합이 바꾸지 않는다(요구사항 3.6)."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn)
    rec, appt = await _seed_completed_record_for(db_conn, b)
    before = await db_conn.fetchrow(
        "select appointment_id, doctor_id, diagnosis from medical_records where id = $1", rec)
    revisions = await db_conn.fetchval(
        "select count(*) from medical_record_revisions where record_id = $1", rec)
    await patient_merge_service.merge_patients(
        a, b, admin, expected=await _expected(db_conn, a, b), conn=db_conn)
    after = await db_conn.fetchrow(
        "select appointment_id, doctor_id, diagnosis from medical_records where id = $1", rec)
    assert dict(after) == dict(before)
    # 예약 계보가 지켜져야 진료기록이 따라온다 — 예약 소유 ID가 그대로여야 한다.
    assert await db_conn.fetchval(
        "select for_patient_id from appointments where id = $1", appt) == b
    assert await db_conn.fetchval(
        "select count(*) from medical_record_revisions where record_id = $1", rec) == revisions


async def test_병합은_합쳐진_행만_비활성으로_바꾼다(db_conn):
    """[MERGE-DATA-01] 행을 지우지 않는다 — 지우면 감사 기록의 patient_id가 깨진다."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn)
    await patient_merge_service.merge_patients(
        a, b, admin, expected=await _expected(db_conn, a, b), conn=db_conn)
    assert await db_conn.fetchval("select is_active from patients where id = $1", a) is True
    assert await db_conn.fetchval("select is_active from patients where id = $1", b) is False


async def test_계정_연결은_대표가_비어_있을_때만_옮긴다(db_conn):
    """[MERGE-COMPARE-04] 대표에 이미 계정이 있으면 덮어쓰지 않는다 — 로그인이 바뀐다."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn, linked="b")   # b만 계정
    result = await patient_merge_service.merge_patients(
        a, b, admin, expected=await _expected(db_conn, a, b), conn=db_conn)
    assert result.account_link_moved is True
    assert await db_conn.fetchval("select auth_user_id from patients where id = $1", a) is not None
    assert await db_conn.fetchval("select auth_user_id from patients where id = $1", b) is None


async def test_대표에_계정이_있으면_옮기지_않는다(db_conn):
    """[MERGE-COMPARE-04] a가 계정을 가진 경우 b엔 계정이 없으니 옮길 것이 없다."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn, linked="a")
    result = await patient_merge_service.merge_patients(
        a, b, admin, expected=await _expected(db_conn, a, b), conn=db_conn)
    assert result.account_link_moved is False
    assert await db_conn.fetchval("select auth_user_id from patients where id = $1", a) is not None


async def test_감사_행과_원장이_한_트랜잭션에서_함께_남는다(db_conn):
    """[MERGE-AUDIT-01][MERGE-DATA-04] 따로 쓰면 하나만 남는 순간이 생긴다(요구사항 :437)."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn)
    result = await patient_merge_service.merge_patients(
        a, b, admin, expected=await _expected(db_conn, a, b), conn=db_conn)
    row = await db_conn.fetchrow(
        "select patient_id, staff_id from access_audit_log "
        "where resource_type = 'patient_merge' and resource_id = $1", result.merge_id)
    assert row["patient_id"] == a and row["staff_id"] == admin.id
    snap = await db_conn.fetchval(
        "select counts_snapshot from patient_merges where id = $1", result.merge_id)
    assert set(json.loads(snap)) == {"primary", "merged"}   # 양쪽 건수를 그때 값으로 박아 둔다


async def test_거절도_감사에_남는다(db_conn):
    """[MERGE-AUDIT-01] 성공·실패 모두 patient_merge — 실패만 안 남으면 누가 무엇을
    시도했는지가 사라진다(요구사항 :437). 거절은 resource_id가 비어 있다."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn, both_linked=True)
    with pytest.raises(AppError):
        await patient_merge_service.merge_patients(
            a, b, admin, expected=await _expected(db_conn, a, b), conn=db_conn)
    row = await db_conn.fetchrow(
        "select patient_id, resource_id from access_audit_log where resource_type = 'patient_merge'")
    assert row is not None and row["patient_id"] == a and row["resource_id"] is None


async def test_그_사이_상태가_바뀌면_실행하지_않는다(db_conn):
    """[MERGE-RACE-01] 확인창을 열어 둔 채 다른 관리자가 먼저 처리할 수 있다.
    관리자가 본 건수와 실제가 다르면 「무엇을 보고 눌렀나」가 어긋난다(요구사항 :430)."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn)
    stale = await _expected(db_conn, a, b)
    await _seed_appointment_for(db_conn, b)              # 그 사이 예약이 하나 늘었다
    with pytest.raises(AppError) as e:
        await patient_merge_service.merge_patients(a, b, admin, expected=stale, conn=db_conn)
    assert e.value.status_code == 409
    # 실행되지 않았다 — b는 아직 활성이고 원장도 안 생겼다.
    assert await db_conn.fetchval("select is_active from patients where id = $1", b) is True
    assert await db_conn.fetchval("select count(*) from patient_merges") == 0


async def test_이미_비활성인_후보는_병합하지_않는다(db_conn):
    """[MERGE-RACE-01] 다른 관리자가 먼저 b를 합쳐 비활성이 됐으면 다시 합치지 않는다."""
    admin = await _seed_admin(db_conn)
    a, b = await _seed_duplicate_pair(db_conn)
    expected = await _expected(db_conn, a, b)
    await db_conn.execute("update patients set is_active = false where id = $1", b)
    with pytest.raises(AppError) as e:
        await patient_merge_service.merge_patients(a, b, admin, expected=expected, conn=db_conn)
    assert e.value.status_code == 409
