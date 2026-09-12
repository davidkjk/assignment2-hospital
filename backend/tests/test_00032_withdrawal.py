import pytest

from app.db.pool import acquire_as
from tests.conftest import seed_patient

# ⚠️ acquire_as(RLS)는 커밋된 데이터만 본다 → committed_conn 시딩. seed_patient은 dict를 준다.
# list_withdrawal_blocks()·deactivate_patient_self()는 private.current_patient_id()로 호출자를 안다.


async def _dept_doctor(conn):
    dept = await conn.fetchval("insert into departments (name) values ('탈퇴테스트과') returning id")
    doctor = await conn.fetchval(
        "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
        f"doc-{dept}@test.local")
    doctor_id = await conn.fetchval(
        "insert into staff (auth_user_id, name, role, department_id, is_active) "
        "values ($1,'의사','doctor',$2,true) returning id", doctor, dept)
    return dept, doctor_id


async def _book(conn, *, account, for_p, dept, doctor, days_ahead, status="예약확정"):
    slot = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, current_date + $2::int, '10:00', '예약됨') returning id", doctor, days_ahead)
    return await conn.fetchval(
        "insert into appointments "
        "(slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source) "
        "values ($1,$2,$3,$4,$5,'감기',$6,'app') returning id",
        slot, account, for_p, dept, doctor, status)


async def _link_family(conn, *, account, family, relation="부모"):
    await conn.execute(
        "insert into patient_family_links (account_patient_id, family_patient_id, relation, is_active) "
        "values ($1,$2,$3,true)", account, family, relation)


@pytest.mark.asyncio
async def test_차단_판정은_내예약과_무계정가족예약만_센다(committed_conn):
    """[SET-QUIT-11·12·16] 다가오는 예약이 막는다 — 내 것 + 자기 계정 없는 가족(㉮). ㉯는 제외."""
    me = await seed_patient(committed_conn, name="김본인")
    mom = await seed_patient(committed_conn, name="박어머니", with_auth=False)  # ㉮
    dad = await seed_patient(committed_conn, name="김아버지", with_auth=True)   # ㉯
    await _link_family(committed_conn, account=me["patient_id"], family=mom["patient_id"])
    await _link_family(committed_conn, account=me["patient_id"], family=dad["patient_id"])
    dept, doctor = await _dept_doctor(committed_conn)
    await _book(committed_conn, account=me["patient_id"], for_p=me["patient_id"], dept=dept, doctor=doctor, days_ahead=3)
    await _book(committed_conn, account=me["patient_id"], for_p=mom["patient_id"], dept=dept, doctor=doctor, days_ahead=5)
    await _book(committed_conn, account=me["patient_id"], for_p=dad["patient_id"], dept=dept, doctor=doctor, days_ahead=6)
    async with acquire_as(str(me["auth_user_id"])) as conn:
        blocks = await conn.fetch("select * from list_withdrawal_blocks()")
    ids = {(b["patient_name"], b["is_family"]) for b in blocks}
    assert ("김본인", False) in ids and ("박어머니", True) in ids
    assert "김아버지" not in {b["patient_name"] for b in blocks}   # ㉯ 제외


@pytest.mark.asyncio
async def test_지난_예약과_취소된_예약은_안_막는다(committed_conn):
    """[SET-QUIT-11] 「다가오는」만 막는다 — 지난·취소는 탈퇴를 막지 않는다."""
    me = await seed_patient(committed_conn)
    dept, doctor = await _dept_doctor(committed_conn)
    await _book(committed_conn, account=me["patient_id"], for_p=me["patient_id"], dept=dept, doctor=doctor, days_ahead=-1)
    await _book(committed_conn, account=me["patient_id"], for_p=me["patient_id"], dept=dept, doctor=doctor, days_ahead=3, status="환자취소")
    async with acquire_as(str(me["auth_user_id"])) as conn:
        blocks = await conn.fetch("select * from list_withdrawal_blocks()")
    assert blocks == []


@pytest.mark.asyncio
async def test_탈퇴는_auth_id를_비우고_흔적을_남긴다(committed_conn):
    """[SET-QUIT-09][갭 #64] auth_user_id를 비워야 재가입 자동연결이 이 행을 후보로 집는다."""
    me = await seed_patient(committed_conn)
    async with acquire_as(str(me["auth_user_id"])) as conn:
        await conn.execute("select deactivate_patient_self()")
    row = await committed_conn.fetchrow(
        "select is_active, auth_user_id, deactivated_at, former_auth_user_id from patients where id=$1",
        me["patient_id"])
    assert row["is_active"] is False
    assert row["auth_user_id"] is None                      # ⭐ 비웠다 = 재가입 후보
    assert row["deactivated_at"] is not None
    assert row["former_auth_user_id"] == me["auth_user_id"]


@pytest.mark.asyncio
async def test_다가오는_예약이_있으면_deactivate가_거부한다(committed_conn):
    """[SET-QUIT-11] 서버도 차단을 재검사한다 — 오래된 화면·직접호출을 막는다."""
    me = await seed_patient(committed_conn)
    dept, doctor = await _dept_doctor(committed_conn)
    await _book(committed_conn, account=me["patient_id"], for_p=me["patient_id"], dept=dept, doctor=doctor, days_ahead=3)
    async with acquire_as(str(me["auth_user_id"])) as conn:
        with pytest.raises(Exception):
            await conn.execute("select deactivate_patient_self()")
