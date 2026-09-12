"""[Task 26a][MHIST-*] 병합 이력 조회·되돌림 서비스 테스트.

⭐ Task 21이 병합을 만들었고(patient_merges·patient_lineage·감사), 되돌리는 자리는 여기다(결정 #16).
   되돌림은 「지우기」가 아니라 undone_at 하나를 채우는 소프트 정정이다(결정 #15) — 원본 예약·
   문진·의료기록·감사 행은 하나도 안 지운다. 계보(patient_lineage)가 undone_at is null만 따라
   가므로 되돌리면 저절로 계보에서 빠진다.

⚠️ 이 파일은 db_conn(오너 롤·롤백 트랜잭션)을 서비스에 conn=으로 주입한다 — Task 21의
   test_patient_merge_service와 같은 방식이다. 서비스가 acquire_as로 새 연결을 열면 seed된
   미커밋 데이터를 못 보므로, 조회·되돌림 모두 conn=db_conn을 넘겨 같은 트랜잭션에서 보게 한다.
   (플랜 Step 1 스니펫은 conn을 생략했으나, 이 코드베이스의 롤백-트랜잭션 테스트 관례상 필요하다.)

⚠️ 플랜 스니펫의 Forbidden·ValidationError는 이 코드베이스에 존재하지 않는다(app/core/errors.py엔
   AppError만 있다). 형제 서비스 audit_query_service의 관례대로 권한거부=AppError(403)·검증실패=
   AppError(400)로 바꿔 단언한다. MergeUndoLocked만 플랜대로 AppError(409) 서브클래스로 남는다.
"""
from datetime import date

import pytest

from app.core.security import StaffContext
from app.core.errors import AppError
from app.services import patient_merge_service
from tests.conftest import seed_staff as _seed_staff_row


# ── seed 도우미 ────────────────────────────────────────────────────────────────
# _Staff: 서비스엔 StaffContext로 넘어가고(.role·.auth_user_id·.id), 테스트는 dict처럼 읽는다
# (admin["name"]·admin["id"]). name은 conftest seed_staff가 넣는 'Test Staff'와 맞춘다 —
# get_merge_history의 executed_by가 staff.name 조인 값이라 admin["name"]과 같아야 한다.
class _Staff(StaffContext):
    def __init__(self, *, id, auth_user_id, role, name, department_id=None):
        super().__init__(id=id, auth_user_id=auth_user_id, role=role, department_id=department_id)
        self.name = name

    def __getitem__(self, key):
        return {"id": self.id, "auth_user_id": self.auth_user_id,
                "role": self.role, "name": self.name}[key]


async def seed_admin(conn) -> _Staff:
    s = await _seed_staff_row(conn, role="admin")
    return _Staff(id=s["staff_id"], auth_user_id=s["auth_user_id"], role="admin", name="Test Staff")


async def seed_staff(conn, role: str) -> _Staff:
    s = await _seed_staff_row(conn, role=role)
    return _Staff(id=s["staff_id"], auth_user_id=s["auth_user_id"], role=role, name="Test Staff")


async def _seed_patient(conn, name="김민서", birth=date(1990, 5, 14), gender="F",
                        phone="01012347251"):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ($1,$2,$3,$4) returning id",
        name, birth, gender, phone)


async def _seed_dept_doctor(conn):
    dept = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    doc = await _seed_staff_row(conn, role="doctor", department_id=dept)
    return dept, doc["staff_id"]


async def _seed_appt(conn, patient, status="예약확정"):
    dept, doctor = await _seed_dept_doctor(conn)
    appt = await conn.fetchval(
        "insert into appointments "
        "(account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
        "values ($1,$1,$2,$3,$4,'staff') returning id",
        patient, dept, doctor, status)
    return appt, doctor


async def _seed_completed_record(conn, patient):
    appt, doctor = await _seed_appt(conn, patient, status="진료완료")
    return await conn.fetchval(
        "insert into medical_records (appointment_id, doctor_id, diagnosis, is_completed) "
        "values ($1,$2,'감기',true) returning id", appt, doctor)


async def seed_medical_record(conn, *, patient, after_merge):
    """병합 뒤 대표 환자에 새로 생긴 진료기록 — created_at을 병합 시각(performed_at) 뒤로 못 박는다.

    ⚠️ db_conn 한 트랜잭션 안에서는 now()=transaction_timestamp라 병합과 이 기록의 created_at이
       같아진다. 그러면 created_at > performed_at 락 판정이 안 걸리므로, performed_at+1시간으로
       명시해 「병합 뒤 생성」을 결정적으로 만든다.
    """
    appt, doctor = await _seed_appt(conn, patient, status="진료완료")
    return await conn.fetchval(
        "insert into medical_records (appointment_id, doctor_id, diagnosis, is_completed, created_at) "
        "values ($1,$2,'감기',true, "
        "(select performed_at from patient_merges where id=$3) + interval '1 hour') returning id",
        appt, doctor, after_merge)


async def seed_merge(conn, *, primary="김민서", merged="김민수", by, merged_records=None):
    """Task 21의 merge_patients로 실제 병합을 만든다 — primary·merged 이름을 달리 줄 수 있다."""
    p = await _seed_patient(conn, name=primary)
    m = await _seed_patient(conn, name=merged)
    if merged_records:
        n_med = merged_records.get("medical_records", 0)
        n_appt = merged_records.get("appointments", 0)
        for _ in range(n_med):
            await _seed_completed_record(conn, m)
        for _ in range(max(0, n_appt - n_med)):
            await _seed_appt(conn, m)
    expected = await patient_merge_service.snapshot_counts(conn, p, m)
    result = await patient_merge_service.merge_patients(p, m, by, expected=expected, conn=conn)
    return result.merge_id


async def seed_merge_ids(conn, *, by):
    """merge_event_id·primary·merged를 함께 돌려준다. merged에 원본 진료기록을 심어 되돌림 후
    보존을 확인할 수 있게 한다."""
    p = await _seed_patient(conn, name="김민서")
    m = await _seed_patient(conn, name="김민수")
    await _seed_completed_record(conn, m)
    expected = await patient_merge_service.snapshot_counts(conn, p, m)
    result = await patient_merge_service.merge_patients(p, m, by, expected=expected, conn=conn)
    return result.merge_id, p, m


async def lineage(conn, root):
    return await conn.fetchval("select patient_lineage($1)", root)


async def record_count(conn, patient, table):
    # medical_records는 appointment 조인으로 그 환자 것만 센다(patient_id 칸이 없다).
    return await conn.fetchval(
        "select count(*) from medical_records m join appointments a on a.id = m.appointment_id "
        "where a.for_patient_id = $1", patient)


# ── 테스트 ────────────────────────────────────────────────────────────────────

async def test_LIST_01_이력_행은_대표_대상_실행자_시각_상태를_준다(db_conn):
    """[MHIST-LIST-01] 행에 즉시 되돌림 버튼을 두지 않는다 — 상태만 준다."""
    admin = await seed_admin(db_conn)
    ev = await seed_merge(db_conn, primary="홍길동", merged="홍길똥", by=admin)
    page = await patient_merge_service.get_merge_history(admin, conn=db_conn)
    row = page.rows[0]
    assert row["merge_event_id"] == ev and row["status"] == "undoable"
    # [MERGE-LIST-03] 「이름 · 서버 마스킹 생년월일/전화」 — 이름은 실명이다.
    assert row["primary"]["name"] == "홍길동" and row["merged"]["name"] == "홍길똥"
    assert row["executed_by"] == admin["name"] and row["merged_at"] is not None


async def test_LIST_02_정렬은_최신순_동점은_불변_이벤트_ID다(db_conn):
    """[MHIST-LIST-02] Task 13 paginate를 쓴다 — merged_at desc, merge_event_id desc."""
    admin = await seed_admin(db_conn)
    for _ in range(25):
        await seed_merge(db_conn, by=admin)
    first = await patient_merge_service.get_merge_history(admin, conn=db_conn)
    assert first.order == ("merged_at desc", "id desc") and len(first.rows) == 20
    second = await patient_merge_service.get_merge_history(
        admin, cursor=first.next_cursor, conn=db_conn)
    ids = [r["merge_event_id"] for r in first.rows] + [r["merge_event_id"] for r in second.rows]
    assert len(ids) == len(set(ids)) == 25                     # 중복 0 · 누락 0


async def test_DETAIL_02_보존_상태를_읽기_전용으로_보여준다(db_conn):
    """[MHIST-DETAIL-02] 원본 레코드가 삭제되지 않았음을 읽는다 — 화면이 원본을 안 덮는다."""
    admin = await seed_admin(db_conn)
    ev = await seed_merge(db_conn, primary="홍길동", merged="홍길똥", by=admin,
                          merged_records={"appointments": 3, "medical_records": 2})
    d = await patient_merge_service.get_merge_event(ev, admin, conn=db_conn)
    assert d["preservation"]["merged"]["appointments"] == 3    # 원본이 그대로 있다
    assert d["preservation"]["lineage_active"] is True
    assert d["undo_status"] == "undoable"


async def test_UNDO_되돌리면_계보가_끊기고_원본은_안_지운다(db_conn):
    """[MHIST-DONE-01] undone_at 하나로 계보가 빠진다. 원본은 보존."""
    admin = await seed_admin(db_conn)
    ev, primary, merged = await seed_merge_ids(db_conn, by=admin)
    assert merged in await lineage(db_conn, primary)           # 병합 상태: 함께 읽힌다
    await patient_merge_service.undo_merge(ev, reason="오병합 확인", staff=admin,
                                           expected_status="undoable", conn=db_conn)
    assert merged not in await lineage(db_conn, primary)        # 계보가 끊겼다
    assert await record_count(db_conn, merged, "medical_records") > 0   # 원본은 그대로


async def test_REASON_01_사유가_없으면_되돌리지_않는다(db_conn):
    """[MHIST-REASON-01] 사유 1~200자 필수. ValidationError가 없어 AppError(400)로 단언한다."""
    admin = await seed_admin(db_conn)
    ev = await seed_merge(db_conn, by=admin)
    for bad in ("", "가" * 201):
        with pytest.raises(AppError) as e:
            await patient_merge_service.undo_merge(ev, reason=bad, staff=admin,
                                                   expected_status="undoable", conn=db_conn)
        assert e.value.status_code == 400


async def test_DONE_01_되돌림은_patient_merge_undo_감사를_사유와_함께_남긴다(db_conn):
    """[MHIST-DONE-01] 별도 되돌림 감사 이벤트. 긴 형 patient_merge_undo를 쓴다(짧은 형은 Task 15가 못 찾음)."""
    admin = await seed_admin(db_conn)
    ev, primary, _ = await seed_merge_ids(db_conn, by=admin)
    await patient_merge_service.undo_merge(ev, reason="본인 아님", staff=admin,
                                           expected_status="undoable", conn=db_conn)
    row = await db_conn.fetchrow(
        "select * from access_audit_log where resource_type='patient_merge_undo' and resource_id=$1", ev)
    assert row["patient_id"] == primary and row["staff_id"] == admin["id"]
    assert "본인 아님" in row["search_term"] or row["undo_reason"] == "본인 아님"  # 사유가 남는다


async def test_LOCK_01_대표에_새_레코드가_생기면_되돌림불가다(db_conn):
    """[MHIST-LOCK-01] 병합 뒤 대표 환자에 새 진료기록이 생기면 잠긴다. 자동 우회·강제 없음."""
    admin = await seed_admin(db_conn)
    ev, primary, _ = await seed_merge_ids(db_conn, by=admin)
    await seed_medical_record(db_conn, patient=primary, after_merge=ev)   # 병합 뒤 생성
    d = await patient_merge_service.get_merge_event(ev, admin, conn=db_conn)
    assert d["undo_status"] == "locked" and "새 진료기록" in d["lock_reason"]
    with pytest.raises(patient_merge_service.MergeUndoLocked):
        await patient_merge_service.undo_merge(ev, reason="시도", staff=admin,
                                               expected_status="undoable", conn=db_conn)


async def test_EXC_05_이미_되돌린_것을_다시_되돌리면_409다(db_conn):
    """[MHIST-EXC-05] 확인창을 연 사이 다른 관리자가 먼저 되돌렸을 수 있다 — 확정 때 재검사. 사유 중복 감사 없음."""
    admin = await seed_admin(db_conn)
    ev = await seed_merge(db_conn, by=admin)
    await patient_merge_service.undo_merge(ev, reason="첫 되돌림", staff=admin,
                                           expected_status="undoable", conn=db_conn)
    with pytest.raises(AppError) as e:
        await patient_merge_service.undo_merge(ev, reason="두 번째", staff=admin,
                                               expected_status="undoable", conn=db_conn)
    assert e.value.status_code == 409
    n = await db_conn.fetchval(
        "select count(*) from access_audit_log where resource_type='patient_merge_undo' and resource_id=$1", ev)
    assert n == 1                                              # 중복 감사 없음


async def test_EXC_01_관리자만_이력을_열고_되돌린다(db_conn):
    """[MHIST-EXC-01] 메뉴 노출이 아니라 서버가 거절한다. Forbidden이 없어 AppError(403)로 단언한다."""
    ev = await seed_merge(db_conn, by=await seed_admin(db_conn))
    for role in ("receptionist", "doctor"):
        staff = await seed_staff(db_conn, role=role)
        with pytest.raises(AppError) as e:
            await patient_merge_service.get_merge_history(staff, conn=db_conn)
        assert e.value.status_code == 403
        with pytest.raises(AppError) as e2:
            await patient_merge_service.undo_merge(ev, reason="x", staff=staff,
                                                   expected_status="undoable", conn=db_conn)
        assert e2.value.status_code == 403
