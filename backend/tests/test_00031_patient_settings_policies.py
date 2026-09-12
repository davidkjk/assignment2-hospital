import pytest

from app.db.pool import acquire_as
from tests.conftest import seed_patient

# ⚠️ acquire_as(자기 커넥션·RLS)는 커밋된 데이터만 본다 → 준비는 committed_conn(별개 풀, RLS 우회 postgres 역할).
#    _cleanup_committed_data(autouse)가 뒤에서 지운다. seed_patient은 dict({auth_user_id, patient_id})를 준다.


@pytest.mark.asyncio
async def test_환자는_자기_알림선호만_읽고_쓴다(committed_conn):
    """[SET-NOTI-18][갭 #5] 00012는 칸만 만들고 "환자 본인 정책은 3단계"라 미뤄 뒀다 → 여기서 연다.
    [SET-NOTI-12][SET-NOTI-15] 저장/조회가 환자 본인 커넥션(RLS)으로 통해야 화면이 즉시 저장을 한다."""
    me = await seed_patient(committed_conn)
    other = await seed_patient(committed_conn)
    async with acquire_as(str(me["auth_user_id"])) as conn:
        await conn.execute(
            "insert into notification_preferences (patient_id, notification_type, enabled) "
            "values ($1,'confirmed',false)", me["patient_id"])              # 본인 write OK
        rows = await conn.fetch("select notification_type from notification_preferences")
        assert {r["notification_type"] for r in rows} == {"confirmed"}      # 본인 것만 보인다
        with pytest.raises(Exception):                                       # 남의 것 write 거부
            await conn.execute(
                "insert into notification_preferences (patient_id, notification_type, enabled) "
                "values ($1,'confirmed',false)", other["patient_id"])


@pytest.mark.asyncio
async def test_환자는_병원_진료시간을_읽을_수_있다(committed_conn):
    """[SET-HOSP-05][갭 #SET-HOSP-HOURS] 진료시간·휴진일은 공개 정보다 —
    환자 커넥션으로 hospital_hours·hospital_closures를 읽을 수 있어야 SET-HOSP 화면이 그린다.
    ⛔ 쓰기는 못 한다(직원 전용) — 읽기 정책만 연다. RLS UPDATE 무음거부는 'UPDATE 0'으로 드러난다."""
    me = await seed_patient(committed_conn)
    await committed_conn.execute(
        "insert into hospital_hours (weekday, open_time, close_time) "
        "values (1, '09:00', '18:00') on conflict (weekday) do nothing")
    async with acquire_as(str(me["auth_user_id"])) as conn:
        rows = await conn.fetch("select weekday, open_time from hospital_hours")
        assert any(r["weekday"] == 1 for r in rows)                          # 읽기 OK
        result = await conn.execute("update hospital_hours set close_time='20:00' where weekday=1")
        assert result == "UPDATE 0"                                          # 쓰기 무음거부(정책 없음)
