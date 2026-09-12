import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_type_is_primary_key_one_row_per_type(db_conn):
    await db_conn.execute(
        "insert into notification_type_settings (notification_type, body, also_sms) "
        "values ('confirmed', '예약이 확정되었습니다.', true)"
    )
    with pytest.raises(Exception):  # 종류가 키 → 같은 종류 두 줄 불가
        await db_conn.execute(
            "insert into notification_type_settings (notification_type, body) values ('confirmed', '중복')"
        )


@pytest.mark.asyncio
async def test_table_starts_empty(db_conn):
    # ④ 기본 문구는 DB에 넣지 않는다 → 초기 seed 없음.
    count = await db_conn.fetchval("select count(*) from notification_type_settings")
    assert count == 0


@pytest.mark.asyncio
async def test_staff_read_admin_write(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")

    # 관리자: 편집 가능
    await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute(
        "insert into notification_type_settings (notification_type, body) values ('confirmed', 'x')"
    )
    # 접수직원: 읽기 가능(dispatcher/화면 조회), 편집 불가
    await set_session_auth(db_conn, receptionist["auth_user_id"])
    rows = await db_conn.fetch("select * from notification_type_settings")
    assert len(rows) == 1
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into notification_type_settings (notification_type, body) values ('promo', 'y')"
        )
