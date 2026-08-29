from datetime import date
import pytest
from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_family_service
from tests.conftest import seed_patient

# ⚠️ 서비스는 자기 커넥션(acquire_as/get_pool)을 연다 → db_conn(롤백) 미커밋 데이터를 못 본다.
#    시딩·검증을 committed_conn(autocommit)으로 한다(autouse cleanup이 뒷정리). (Task 2 하네스 패턴)


def _ctx(seed): return PatientContext(id=seed["patient_id"], auth_user_id=seed["auth_user_id"])


@pytest.mark.asyncio
async def test_add_list_update_unlink(committed_conn):
    me = _ctx(await seed_patient(committed_conn))
    fid = await patient_family_service.add_family_member(me, name="김자녀", birth_date=date(2015,5,5), gender="F", relation="자녀")
    assert (await patient_family_service.list_family_members(me))[0]["name"] == "김자녀"
    await patient_family_service.update_family_member(me, fid, name="김자녀2", birth_date=date(2015,5,5), gender="F", relation="자녀")
    assert (await patient_family_service.list_family_members(me))[0]["name"] == "김자녀2"
    await patient_family_service.unlink_family_member(me, fid)
    assert await patient_family_service.list_family_members(me) == []
    # [R5-02] 링크만 비활성 — 환자 행은 그대로 살아 있다(과거 이력 표시).
    assert await committed_conn.fetchval("select is_active from patients where id=$1", fid) is True


@pytest.mark.asyncio
async def test_add_family_member_allows_null_phone(committed_conn):
    # #3 — 전화 없는 가족도 등록된다.
    me = _ctx(await seed_patient(committed_conn))
    fid = await patient_family_service.add_family_member(me, name="무전화", birth_date=date(2010,1,1), gender="M", relation="자녀", phone=None)
    assert await committed_conn.fetchval("select phone from patients where id=$1", fid) is None


@pytest.mark.asyncio
async def test_ten_active_links_max(committed_conn):
    # [#59] 활성 가족 링크는 10명까지.
    me = _ctx(await seed_patient(committed_conn))
    for i in range(10):
        await patient_family_service.add_family_member(me, name=f"가족{i}", birth_date=date(2010,1,1), gender="M", relation="자녀")
    with pytest.raises(AppError) as e:
        await patient_family_service.add_family_member(me, name="열한번째", birth_date=date(2010,1,1), gender="M", relation="자녀")
    assert e.value.status_code == 409


@pytest.mark.asyncio
async def test_readd_reactivates_soft_deleted_link(committed_conn):
    # 재연결 = 기존 unique 링크 재활성화(새 행/새 링크 안 만듦).
    me = _ctx(await seed_patient(committed_conn))
    fid = await patient_family_service.add_family_member(me, name="자녀", birth_date=date(2010,1,1), gender="F", relation="자녀")
    await patient_family_service.unlink_family_member(me, fid)
    fid2 = await patient_family_service.add_family_member(me, name="자녀", birth_date=date(2010,1,1), gender="F", relation="자녀")
    assert fid2 == fid
    assert await committed_conn.fetchval("select count(*) from patient_family_links where account_patient_id=$1", me.id) == 1


@pytest.mark.asyncio
async def test_link_existing_patient_is_blocked_501(committed_conn):
    # [R5-01] 본인확인 창구(4단계) 전까지 기존 환자 OTP 연결은 501로 막는다.
    me = _ctx(await seed_patient(committed_conn))
    with pytest.raises(AppError) as e:
        await patient_family_service.link_existing_patient_by_otp(me, phone="010-1111-2222", otp="000000")
    assert e.value.status_code == 501
