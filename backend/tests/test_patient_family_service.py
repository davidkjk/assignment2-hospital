from datetime import date, time
from uuid import uuid4
import pytest
import asyncpg
from app.core.errors import AppError
from app.core.patient_security import PatientContext, list_accessible_patient_ids
from app.db.pool import acquire_as
from app.services import patient_family_service
from tests.conftest import seed_patient, seed_staff

# ⚠️ 서비스는 자기 커넥션(acquire_as/get_pool)을 연다 → db_conn(롤백) 미커밋 데이터를 못 본다.
#    시딩·검증을 committed_conn(autocommit, postgres 역할=RLS 우회)으로 한다(autouse cleanup이 뒷정리).
#    (Task 2·5·6 하네스 패턴 — 플랜 원안의 db_conn은 자기커넥션 서비스에 안 맞아 committed_conn으로 교정.)


def _ctx(seed): return PatientContext(id=seed["patient_id"], auth_user_id=seed["auth_user_id"])


def _uphone() -> str:
    return f"010{uuid4().int % 100000000:08d}"   # 유니크 전화(계정 여럿 시딩 시 충돌 방지)


async def _seed_account(conn, *, name="환자") -> PatientContext:
    return _ctx(await seed_patient(conn, name=name, phone=_uphone()))


async def _seed_appt_for(conn, for_patient_id, *, slot_date, status, dept="내과", start_time=time(9, 0)):
    """for_patient_id에게 예약 1건 — 슬롯·진료과·의사까지 갖춰 심는다(upcoming 조인용)."""
    doctor = await seed_staff(conn, role="doctor")
    dept_id = await conn.fetchval("insert into departments (name) values ($1) returning id", dept)
    await conn.execute("update staff set department_id=$1 where id=$2", dept_id, doctor["staff_id"])
    slot = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,$3) returning id",
        doctor["staff_id"], slot_date, start_time)
    return await conn.fetchval(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source) "
        "values ($1,$2,$2,$3,$4,$5,'app') returning id",
        slot, for_patient_id, dept_id, doctor["staff_id"], status)


async def _seed_hospital_patient_linked_to(conn, me):
    """병원이 등록한 환자(app_created_by is null) + me에게 활성 연결 — ㉯로 온 가족."""
    fid = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('박아버지','1948-05-05','M',$1) returning id",
        _uphone())
    await conn.execute(
        "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1,$2,'부모')",
        me.id, fid)
    return fid


async def _relation_of(conn, me, fid):
    return await conn.fetchval(
        "select relation from patient_family_links where account_patient_id=$1 and family_patient_id=$2 and is_active",
        me.id, fid)


# ─── Step 1: 출처 칸 ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_family_member_marks_app_created(committed_conn):
    """[FAM-EDIT-03] ㉮로 만든 가족은 「앱이 만든 행」으로 표시된다 — 나중에 수정 권한을 가르는 근거."""
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "김어머니", date(1950, 3, 1), "F", "부모")
    assert await committed_conn.fetchval("select app_created_by from patients where id=$1", fid) == me.id


@pytest.mark.asyncio
async def test_hospital_registered_patient_has_null_origin(committed_conn):
    """[FAM-EDIT-05] 병원이 등록한 환자 행은 null — 앱이 만든 것이 아니다."""
    pid = await committed_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('박아버지','1948-05-05','M',$1) returning id", _uphone())
    assert await committed_conn.fetchval("select app_created_by from patients where id=$1", pid) is None


# ─── Step 2: list_family_members 확장 ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_puts_self_first_then_names(committed_conn):
    """[FAM-LIST-01][FAM-LIST-02][FAM-LIST-09] 본인이 맨 위, 가족은 이름 오름차순."""
    me = await _seed_account(committed_conn, name="김보호")
    await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    await patient_family_service.add_family_member(me, "강아들", date(2015, 1, 1), "M", "아들")
    rows = await patient_family_service.list_family_members(me)
    assert [r["name"] for r in rows] == ["김보호", "강아들", "홍길동"]   # 본인은 정렬에서 빠진다
    assert rows[0]["is_self"] is True and rows[0]["relation"] == "본인"
    assert all(r["is_self"] is False for r in rows[1:])


@pytest.mark.asyncio
async def test_list_carries_birth_and_gender_for_card_line(committed_conn):
    """[FAM-LIST-03] 카드 한 줄에 쓸 생년월일·성별이 함께 온다."""
    me = await _seed_account(committed_conn)
    await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    row = next(r for r in await patient_family_service.list_family_members(me) if not r["is_self"])
    assert row["birth_date"] == "1950-01-01" and row["gender"] == "M"


@pytest.mark.asyncio
async def test_list_includes_nearest_upcoming_only(committed_conn):
    """[FAM-LIST-06][FAM-LIST-07] 다가오는 예약은 가장 가까운 1건만 — 가족 화면은 예약 목록이 아니다."""
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    await _seed_appt_for(committed_conn, fid, slot_date=date(2099, 9, 3), status="예약확정", dept="정형외과")
    await _seed_appt_for(committed_conn, fid, slot_date=date(2099, 9, 1), status="예약확정", dept="내과")
    row = next(r for r in await patient_family_service.list_family_members(me) if r["id"] == fid)
    assert row["upcoming"]["slot_date"] == "2099-09-01"          # 가까운 것 하나
    assert row["upcoming"]["department_name"] == "내과"
    assert "appointment_id" in row["upcoming"]                    # 눌러서 상세로 갈 수 있어야 한다


@pytest.mark.asyncio
async def test_list_upcoming_excludes_finished_states(committed_conn):
    """[FAM-LIST-08] 「다가오는」에 진료완료·취소됨·예약부도는 들지 않는다."""
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    for st in ("진료완료", "환자취소", "예약부도"):
        await _seed_appt_for(committed_conn, fid, slot_date=date(2099, 9, 1), status=st)
    row = next(r for r in await patient_family_service.list_family_members(me) if r["id"] == fid)
    assert row["upcoming"] is None


@pytest.mark.asyncio
async def test_can_edit_identity_new_family_without_history(committed_conn):
    """[FAM-EDIT-03] ㉮로 만든 가족이고 진료 이력이 없으면 신원을 고칠 수 있다."""
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    row = next(r for r in await patient_family_service.list_family_members(me) if r["id"] == fid)
    assert row["can_edit_identity"] is True and row["identity_lock_reason"] is None


@pytest.mark.asyncio
async def test_can_edit_identity_linked_family_is_locked_even_without_history(committed_conn):
    """[FAM-EDIT-05] ㉯로 연결한 가족은 진료 이력이 0건이어도 읽기 전용.

    ⭐ 이력만으로 판정했다면 병원이 등록만 해둔 환자의 생년월일이 앱에서 고쳐지고,
       요구사항 3.5가 막으려던 접수 화면의 동명이인 뒤바뀜이 그대로 일어난다.
    """
    me = await _seed_account(committed_conn)
    fid = await _seed_hospital_patient_linked_to(committed_conn, me)   # app_created_by null, 진료 0건
    row = next(r for r in await patient_family_service.list_family_members(me) if r["id"] == fid)
    assert row["can_edit_identity"] is False
    assert row["identity_lock_reason"] == "linked"
    assert row["has_visit_history"] is False                     # 이력은 없는데도 잠긴다


@pytest.mark.asyncio
async def test_can_edit_identity_self_without_history(committed_conn):
    """[FAM-EDIT-07] 본인은 진료 이력이 없으면 고칠 수 있다 — 가입 직후 오타는 스스로 고친다."""
    me = await _seed_account(committed_conn)
    row = next(r for r in await patient_family_service.list_family_members(me) if r["is_self"])
    assert row["can_edit_identity"] is True and row["identity_lock_reason"] is None


@pytest.mark.asyncio
async def test_can_edit_identity_self_with_history_is_locked(committed_conn):
    """[FAM-EDIT-08][FAM-EDIT-10] 진료 이력이 생기면 본인도 읽기 전용 — 그 값을 서버가 내려준다(갭 #63)."""
    me = await _seed_account(committed_conn)
    await _seed_appt_for(committed_conn, me.id, slot_date=date(2020, 8, 1), status="진료완료")
    row = next(r for r in await patient_family_service.list_family_members(me) if r["is_self"])
    assert row["has_visit_history"] is True
    assert row["can_edit_identity"] is False and row["identity_lock_reason"] == "has_history"


@pytest.mark.asyncio
async def test_relation_is_always_editable(committed_conn):
    """[FAM-EDIT-01] 관계는 누구에게나 항상 수정 가능 — 신원 잠금과 별개다."""
    me = await _seed_account(committed_conn)
    fid = await _seed_hospital_patient_linked_to(committed_conn, me)    # 신원은 잠긴 가족
    row = next(r for r in await patient_family_service.list_family_members(me) if r["id"] == fid)
    assert row["can_edit_identity"] is False
    await patient_family_service.update_family_relation(me, fid, "배우자")   # 그래도 관계는 바뀐다
    after = next(r for r in await patient_family_service.list_family_members(me) if r["id"] == fid)
    assert after["relation"] == "배우자"


# ─── Step 3: 서버 방어 (신원/관계 분리) ───────────────────────────────────────

@pytest.mark.asyncio
async def test_update_identity_rejected_for_linked_family(committed_conn):
    """[FAM-EDIT-05][FAM-EDIT-02] 연결 가족의 신원은 서버가 거절한다 — 화면 잠금은 두 번째 그물이다."""
    me = await _seed_account(committed_conn)
    fid = await _seed_hospital_patient_linked_to(committed_conn, me)
    with pytest.raises(AppError) as e:
        await patient_family_service.update_family_identity(me, fid, "다른이름", date(1950, 1, 1), "F")
    assert e.value.status_code == 403
    assert await committed_conn.fetchval("select name from patients where id=$1", fid) != "다른이름"


@pytest.mark.asyncio
async def test_update_identity_rejected_for_self_with_history(committed_conn):
    """[FAM-EDIT-08] 진료 이력이 있는 본인도 서버가 거절한다."""
    me = await _seed_account(committed_conn)
    await _seed_appt_for(committed_conn, me.id, slot_date=date(2020, 8, 1), status="진료완료")
    with pytest.raises(AppError) as e:
        await patient_family_service.update_family_identity(me, me.id, "새이름", date(1980, 1, 1), "M")
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_update_identity_allowed_for_new_family(committed_conn):
    """[FAM-EDIT-03] ㉮로 만든 가족은 통과한다 — 보호자가 유일한 정보원이다."""
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    await patient_family_service.update_family_identity(me, fid, "홍길순", date(1951, 2, 2), "F")
    row = await committed_conn.fetchrow("select name, birth_date, gender from patients where id=$1", fid)
    assert row["name"] == "홍길순" and row["gender"] == "F"


@pytest.mark.asyncio
async def test_update_relation_never_blocked(committed_conn):
    """[FAM-EDIT-01] 관계는 신원이 잠긴 사람에게도 항상 열려 있다 — 「내 연결선」이라서."""
    me = await _seed_account(committed_conn)
    fid = await _seed_hospital_patient_linked_to(committed_conn, me)
    await patient_family_service.update_family_relation(me, fid, "며느리")     # 자유 입력도 통과
    assert (await _relation_of(committed_conn, me, fid)) == "며느리"


@pytest.mark.asyncio
async def test_update_relation_rejects_self(committed_conn):
    """[FAM-LIST-09] 본인 카드에는 관계가 없다 — 연결선 자체가 없으므로 바꿀 것도 없다."""
    me = await _seed_account(committed_conn)
    with pytest.raises(AppError):
        await patient_family_service.update_family_relation(me, me.id, "아들")


# ─── Step 4: 연결 해제 (다가오는 예약이 있으면 막는다) ─────────────────────────

@pytest.mark.asyncio
async def test_unlink_blocked_when_upcoming_exists(committed_conn):
    """[FAM-UNLINK-03] 다가오는 예약이 있으면 서버가 막고, 화면이 안내할 재료를 함께 준다."""
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    appt = await _seed_appt_for(committed_conn, fid, slot_date=date(2099, 9, 1), status="예약확정")
    with pytest.raises(AppError) as e:
        await patient_family_service.unlink_family_member(me, fid)
    assert e.value.status_code == 409
    assert e.value.detail["appointment_id"] == appt        # [예약 보러 가기]가 쓸 값(NAV-FAM-15)


@pytest.mark.asyncio
async def test_unlink_allowed_when_only_finished_appointments(committed_conn):
    """[FAM-UNLINK-03][FAM-LIST-08] 끝난 예약은 막지 않는다 — 「다가오는」이 아니다."""
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    await _seed_appt_for(committed_conn, fid, slot_date=date(2020, 7, 1), status="진료완료")
    await patient_family_service.unlink_family_member(me, fid)     # 통과한다
    assert all(r["id"] != fid for r in await patient_family_service.list_family_members(me))


@pytest.mark.asyncio
async def test_unlink_keeps_patient_row(committed_conn):
    """[FAM-UNLINK-11] 병원 명부의 그 사람 행은 지우지 않는다 — 연결선만 비활성."""
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    await patient_family_service.unlink_family_member(me, fid)
    assert await committed_conn.fetchval("select count(*) from patients where id=$1", fid) == 1
    assert await committed_conn.fetchval(
        "select is_active from patient_family_links where family_patient_id=$1", fid) is False


@pytest.mark.asyncio
async def test_unlinked_family_disappears_from_list_and_history(committed_conn):
    """[FAM-UNLINK-08][FAM-LIST-13] 해제하면 목록에서 사라지고 이력 접근 목록에서도 빠진다."""
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    await patient_family_service.unlink_family_member(me, fid)
    assert all(r["id"] != fid for r in await patient_family_service.list_family_members(me))
    # 갭 #61 — 접근 목록도 같은 기준을 본다(Task 2가 `활성 링크만`으로 이미 닫았다).
    assert fid not in await list_accessible_patient_ids(me)


@pytest.mark.asyncio
async def test_relink_after_unlink_succeeds(committed_conn):
    """[FAM-UNLINK-12][FAM-UNLINK-13] 해제한 가족을 다시 이을 수 있다(갭 #59가 닫혔는지 확인)."""
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    await patient_family_service.unlink_family_member(me, fid)
    again = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "배우자")
    assert again == fid                                    # 새 행을 만들지 않고 옛 링크를 되살린다
    row = next(r for r in await patient_family_service.list_family_members(me) if r["id"] == fid)
    assert row["relation"] == "배우자"                      # 관계는 새로 준 값으로 갱신


# ─── [보안 F-01] 직원 철회 가족접근을 환자가 되살릴 수 없다 ──────────────────────

async def _staff_revoke_link(conn, family_patient_id, *, reason="직원 철회"):
    """직원 철회 시뮬레이션 — 감사 트리오(unlinked_at/by/reason)를 채운다(patient_service.unlink와 동형)."""
    staff = await seed_staff(conn, role="receptionist")
    await conn.execute(
        "update patient_family_links set is_active=false, unlinked_at=now(), "
        "unlinked_by=$2, unlink_reason=$3 where family_patient_id=$1",
        family_patient_id, staff["staff_id"], reason)


@pytest.mark.asyncio
async def test_staff_revoked_link_cannot_be_relinked_by_patient_add(committed_conn):
    # F-01: 직원이 철회한 가족 연결은 환자가 add_family_member로 되살릴 수 없다(중립 문구·병원 문의).
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    await _staff_revoke_link(committed_conn, fid)
    with pytest.raises(AppError) as e:
        await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "배우자")
    assert e.value.status_code == 409
    assert "병원에 문의" in e.value.message


@pytest.mark.asyncio
async def test_staff_revocation_audit_is_preserved_after_blocked_readd(committed_conn):
    # F-01: 막힌 재추가 뒤에도 감사 트리오는 append-only 보존, 링크는 비활성 유지.
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    await _staff_revoke_link(committed_conn, fid, reason="본인 요청으로 직원이 해제")
    with pytest.raises(AppError):
        await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "배우자")
    row = await committed_conn.fetchrow(
        "select is_active, unlinked_by, unlink_reason from patient_family_links where family_patient_id=$1", fid)
    assert row["is_active"] is False
    assert row["unlinked_by"] is not None
    assert row["unlink_reason"] == "본인 요청으로 직원이 해제"


@pytest.mark.asyncio
async def test_relink_family_link_self_execute_is_revoked(committed_conn):
    # F-01: 앱 미사용 relink RPC는 authenticated에서 실행 불가(봉인)여야 한다.
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, "홍길동", date(1950, 1, 1), "M", "부모")
    link_id = await committed_conn.fetchval(
        "select id from patient_family_links where family_patient_id=$1", fid)
    async with acquire_as(str(me.auth_user_id)) as conn:
        with pytest.raises(asyncpg.PostgresError):
            await conn.execute("select relink_family_link_self($1)", link_id)


# ─── T3 기존 계약 (보존) ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_family_member_allows_null_phone(committed_conn):
    # #3 — 전화 없는 가족도 등록된다.
    me = await _seed_account(committed_conn)
    fid = await patient_family_service.add_family_member(me, name="무전화", birth_date=date(2010, 1, 1), gender="M", relation="자녀", phone=None)
    assert await committed_conn.fetchval("select phone from patients where id=$1", fid) is None


@pytest.mark.asyncio
async def test_ten_active_links_max(committed_conn):
    # [#59] 활성 가족 링크는 10명까지.
    me = await _seed_account(committed_conn)
    for i in range(10):
        await patient_family_service.add_family_member(me, name=f"가족{i}", birth_date=date(2010, 1, 1), gender="M", relation="자녀")
    with pytest.raises(AppError) as e:
        await patient_family_service.add_family_member(me, name="열한번째", birth_date=date(2010, 1, 1), gender="M", relation="자녀")
    assert e.value.status_code == 409


@pytest.mark.asyncio
async def test_link_existing_patient_delegates_to_otp_service(committed_conn):
    # [R5-01] ✅ 해소(환자앱 T26) — 옛 501 창구는 family_link_otp_service로 분리했다.
    #         옛 경로는 이제 「인증번호 요청·확인으로 진행하라」는 400 안내를 준다(막다른 길 아님).
    me = await _seed_account(committed_conn)
    with pytest.raises(AppError) as e:
        await patient_family_service.link_existing_patient_by_otp(me, phone="010-1111-2222", otp="000000")
    assert e.value.status_code == 400
    assert "인증번호" in str(e.value)
