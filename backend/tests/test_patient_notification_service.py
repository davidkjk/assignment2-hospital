import pytest
from datetime import datetime, timedelta, timezone

from app.core.patient_security import PatientContext
from app.services import patient_notification_service as n
from tests.conftest import seed_patient

# 알림함 서비스도 acquire_as(patient) 자기커넥션 → 시드·검증은 committed_conn(RLS 우회 postgres 역할).
# (T5·T6·T7·T8 선례 — db_conn 트랜잭션은 서비스의 새 커넥션이 못 본다.)


def _ctx(s):
    return PatientContext(id=s["patient_id"], auth_user_id=s["auth_user_id"])


async def _log(conn, patient_id, *, ntype="confirmed", body="예약이 확정되었습니다.",
               kind="transactional", sent_at=None, appointment_id=None):
    # notification_log(00011)에 한 줄. 서비스 역할로 넣는다(발송이 하는 일 대역).
    # delivery_status는 check 제약상 '도달'(00011 — '발송완료'는 없다).
    return await conn.fetchval(
        "insert into notification_log (appointment_id, patient_id, notification_type, kind, channel, "
        "delivery_status, body, sent_at) values ($1,$2,$3,$4,'push','도달',$5, coalesce($6, now())) "
        "returning id",
        appointment_id, patient_id, ntype, kind, body, sent_at)


@pytest.mark.asyncio
async def test_unread_counts_only_after_seen_at(committed_conn):
    # NOTI-READ-08: seen_at 이후에 온 것만 안 읽음. seen_at이 null이면 전부 안 읽음.
    me = await seed_patient(committed_conn)
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    await _log(committed_conn, me["patient_id"], sent_at=old)          # 2시간 전
    await _log(committed_conn, me["patient_id"])                        # 방금
    assert await n.count_unread(_ctx(me)) == 2                          # seen_at null → 둘 다 안 읽음
    await committed_conn.execute("update patients set notifications_seen_at=$2 where id=$1",
                                 me["patient_id"], datetime.now(timezone.utc) - timedelta(hours=1))
    assert await n.count_unread(_ctx(me)) == 1                          # 1시간 전 이후로 온 것만(방금 1건)


@pytest.mark.asyncio
async def test_list_marks_is_read_against_current_seen_at(committed_conn):
    # NOTI-READ-01·02: 목록은 현재 seen_at 기준 is_read를 준다(색 바가 이번 열람에 보이도록).
    me = await seed_patient(committed_conn)
    old = await _log(committed_conn, me["patient_id"], sent_at=datetime.now(timezone.utc) - timedelta(days=1))
    await committed_conn.execute("update patients set notifications_seen_at=now() where id=$1", me["patient_id"])
    fresh = await _log(committed_conn, me["patient_id"])               # seen_at 이후 도착
    rows = await n.list_notifications(_ctx(me))
    by_id = {r["id"]: r for r in rows}
    assert by_id[old]["is_read"] is True and by_id[fresh]["is_read"] is False


@pytest.mark.asyncio
async def test_list_excludes_older_than_30_days_and_orders_desc(committed_conn):
    # NOTI-KEEP-01: 30일까지만. 최신순.
    me = await seed_patient(committed_conn)
    await _log(committed_conn, me["patient_id"], body="오래됨", sent_at=datetime.now(timezone.utc) - timedelta(days=31))
    await _log(committed_conn, me["patient_id"], body="어제", sent_at=datetime.now(timezone.utc) - timedelta(days=1))
    await _log(committed_conn, me["patient_id"], body="방금")
    bodies = [r["body"] for r in await n.list_notifications(_ctx(me))]
    assert bodies == ["방금", "어제"] and "오래됨" not in bodies   # 31일 전은 빠지고 최신순


@pytest.mark.asyncio
async def test_list_only_my_rows(committed_conn):
    # 남의 알림은 안 보인다(patient_id = 이 계정만). RLS + 서비스 where 이중.
    me = await seed_patient(committed_conn)
    other = await seed_patient(committed_conn, phone="010-9")
    await _log(committed_conn, other["patient_id"], body="남의 것")
    await _log(committed_conn, me["patient_id"], body="내 것")
    bodies = [r["body"] for r in await n.list_notifications(_ctx(me))]
    assert bodies == ["내 것"]


@pytest.mark.asyncio
async def test_mark_all_read_zeroes_unread(committed_conn):
    # NOTI-READ-04: mark_all_read 한 번이면 배지가 0이 된다.
    me = await seed_patient(committed_conn)
    await _log(committed_conn, me["patient_id"])
    await _log(committed_conn, me["patient_id"])
    assert await n.count_unread(_ctx(me)) == 2
    await n.mark_all_read(_ctx(me))
    assert await n.count_unread(_ctx(me)) == 0
