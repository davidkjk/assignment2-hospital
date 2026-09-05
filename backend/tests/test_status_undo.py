"""갭 #82 — 예약 상태 되돌리기 서비스(appointment_service.undo_status).

되돌리기는 「고치는 동작」이지 위험한 동작이 아니다(결정 2026-08-06) — 확인창 없이,
진행 4상태에서 한 칸 뒤로만. 사유는 두 경우(진료완료 되돌리기·남의 구간 대신 되돌리기)에만.
"""

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import appointment_service
from tests.conftest import seed_staff, set_session_auth


def _ctx(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


async def _base(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동','1985-03-01','M','01012345678') returning id"
    )
    return {
        "admin": admin, "receptionist": receptionist, "doctor": doctor,
        "dept_id": dept_id, "patient_id": patient_id,
    }


async def _seed_appt(db_conn, b, status: str, *, queue_position=None) -> str:
    """원하는 상태의 예약을 직접 INSERT한다(전이 검증은 UPDATE만). INSERT는 접수/관리자만
    허용되므로(RLS) 씨딩은 admin 세션으로 한다 — undo 행위자 세션은 각 테스트가 따로 세팅한다."""
    await set_session_auth(db_conn, b["admin"]["auth_user_id"])
    return await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by, queue_position)
        values ($1, $1, $2, $3, $4, 'staff', $5, $6)
        returning id
        """,
        b["patient_id"], b["dept_id"], b["doctor"]["staff_id"], status, b["admin"]["staff_id"], queue_position,
    )


# ── 순수 계약(표) ─────────────────────────────────────────────────────

def test_되돌릴_수_있는_상태는_진행_4상태다():
    """[UNDO-SCOPE-01][UNDO-SCOPE-04] 오늘 병원 안의 진행 4상태만, 각각 한 칸 뒤로."""
    assert appointment_service.undoable_targets() == ["도착", "진료대기", "진료중", "진료완료"]
    assert appointment_service.UNDO_TRANSITIONS["진료중"] == "진료대기"


def test_취소_계열은_막을_때_새로_예약을_갈_길로_준다():
    """[UNDO-SCOPE-02][UNDO-SCOPE-03] 취소는 자리가 이미 풀렸다 — 되돌리기가 아니라 새 예약."""
    assert appointment_service.undo_blocked_hint("환자취소") == "새로 예약"


def test_사유는_진료완료_되돌리기와_남의_구간_대신_되돌리기에만_받는다():
    """[UNDO-WHY-01][UNDO-WHY-02][UNDO-WHY-03] 그 밖에는 안 받는다 —
    잘못 누른 것을 고치는 데 사유를 요구하면 없앤 확인창이 그대로 돌아온다."""
    assert appointment_service.reason_required("진료완료", "doctor") is True       # 기록이 이미 있다
    assert appointment_service.reason_required("진료중", "receptionist") is True    # 남의 구간
    assert appointment_service.reason_required("도착", "receptionist") is False     # 그 밖에는 안 받는다


def test_민_쪽도_대신_되돌리는_쪽도_되돌릴_수_있다():
    """[UNDO-ROLE-01][UNDO-ROLE-02] 접수직원·관리자가 의사 구간을 대신 되돌릴 수 있다."""
    assert appointment_service.can_undo("진료완료", "doctor") is True
    assert appointment_service.can_undo("진료완료", "receptionist") is True
    assert appointment_service.can_undo("환자취소", "admin") is False


# ── 실제 되돌리기 ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_한_칸씩만_뒤로_간다(db_conn):
    """[UNDO-SCOPE-01] 진료중 → 진료대기, 한 칸."""
    b = await _base(db_conn)
    appt = await _seed_appt(db_conn, b, "진료중")
    await set_session_auth(db_conn, b["doctor"]["auth_user_id"])
    assert await appointment_service.undo_status(appt, _ctx(b["doctor"], "doctor"), conn=db_conn) == "진료대기"
    assert await db_conn.fetchval("select status from appointments where id=$1", appt) == "진료대기"


@pytest.mark.asyncio
async def test_두_칸_되돌리기_요청은_거부한다(db_conn):
    """[UNDO-SCOPE-04] to_status로 두 칸을 요청해도 한 칸 규칙이 막는다."""
    b = await _base(db_conn)
    appt = await _seed_appt(db_conn, b, "진료완료")
    await set_session_auth(db_conn, b["doctor"]["auth_user_id"])
    with pytest.raises(AppError) as exc:
        await appointment_service.undo_status(
            appt, _ctx(b["doctor"], "doctor"), reason="기록 수정", to_status="진료대기", conn=db_conn,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_취소된_예약은_되돌릴_수_없다(db_conn):
    """[UNDO-SCOPE-02][UNDO-SCOPE-03] 취소하는 순간 자리가 풀려 다른 환자가 앉았을 수 있다."""
    b = await _base(db_conn)
    appt = await _seed_appt(db_conn, b, "병원취소")
    await set_session_auth(db_conn, b["receptionist"]["auth_user_id"])
    with pytest.raises(AppError) as exc:
        await appointment_service.undo_status(appt, _ctx(b["receptionist"], "receptionist"), conn=db_conn)
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_대신_되돌리려면_사유가_있어야_한다(db_conn):
    """[UNDO-ROLE-02][UNDO-WHY-02] 접수직원이 의사 구간(진료완료)을 사유 없이 되돌릴 수 없다."""
    b = await _base(db_conn)
    appt = await _seed_appt(db_conn, b, "진료완료")
    await set_session_auth(db_conn, b["receptionist"]["auth_user_id"])
    with pytest.raises(AppError) as exc:
        await appointment_service.undo_status(appt, _ctx(b["receptionist"], "receptionist"), reason=None, conn=db_conn)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_대신_되돌리면_사유와_함께_상태이력에_남는다(db_conn):
    """[UNDO-LOG-01][UNDO-SHOW-01] 누가·무엇을·왜 되돌렸는지 — 기존 트리거 경로를 그대로 쓴다."""
    b = await _base(db_conn)
    appt = await _seed_appt(db_conn, b, "진료완료")
    before = await db_conn.fetchval("select count(*) from appointment_status_history where appointment_id=$1", appt)
    await set_session_auth(db_conn, b["receptionist"]["auth_user_id"])
    await appointment_service.undo_status(appt, _ctx(b["receptionist"], "receptionist"), reason="기록 수정 요청", conn=db_conn)
    after = await db_conn.fetchval("select count(*) from appointment_status_history where appointment_id=$1", appt)
    assert after == before + 1
    # 같은 트랜잭션에선 now()가 고정돼 changed_at으로 정렬해도 씨딩 행과 구분되지 않는다 —
    # 되돌리기가 남긴 행은 to_status='진료중'(진료완료 → 진료중)으로 특정한다.
    row = await db_conn.fetchrow(
        "select changed_by, reason from appointment_status_history "
        "where appointment_id=$1 and from_status='진료완료' and to_status='진료중'",
        appt,
    )
    assert row["changed_by"] == b["receptionist"]["staff_id"]
    assert row["reason"] == "기록 수정 요청"


@pytest.mark.asyncio
async def test_되돌려도_순번을_잃지_않는다(db_conn):
    """[UNDO-ORDER-01] queue_position은 되돌리기가 덮지 않는다 — 순서 변경의 뒷문이 되지 않게."""
    b = await _base(db_conn)
    appt = await _seed_appt(db_conn, b, "진료중", queue_position=3)
    await set_session_auth(db_conn, b["doctor"]["auth_user_id"])
    await appointment_service.undo_status(appt, _ctx(b["doctor"], "doctor"), conn=db_conn)
    assert await db_conn.fetchval("select queue_position from appointments where id=$1", appt) == 3
