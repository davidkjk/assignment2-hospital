"""[Task 19a] 의사 프로필·캘린더 색 스키마 (00042_staff_profile_palette).

`staff`에 적을 칸이 하나도 없어서 3단계 예약·캘린더 색·상담봇 지식이 통째로 막혀 있었다
(갭 #7·#83). 이 파일은 마이그레이션이 만든 칸·제약·버킷을 스키마 수준에서 검증한다.
"""

import uuid

import pytest


async def _column_names(conn, table: str) -> set[str]:
    rows = await conn.fetch(
        """
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = $1
        """,
        table,
    )
    return {row["column_name"] for row in rows}


async def _insert_staff(conn, *, name: str, role: str, color=None):
    auth_id = uuid.uuid4()
    await conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_id, f"{auth_id}@test.local",
    )
    return await conn.fetchval(
        """
        insert into staff (auth_user_id, name, role, calendar_color_index)
        values ($1, $2, $3, $4)
        returning id
        """,
        auth_id, name, role, color,
    )


@pytest.mark.asyncio
async def test_프로필_칸_넷이_생겼다(db_conn):
    """[STAFF-PROFILE-13][CAL-COLOR-10] 갭 #7·#83 — staff에 적을 칸이 하나도 없었다."""
    cols = await _column_names(db_conn, "staff")
    assert {"specialty", "bio", "photo_url", "calendar_color_index"} <= cols


@pytest.mark.asyncio
async def test_색_칸에_unique를_걸지_않는다(db_conn):
    """[CAL-COLOR-07] 의사가 팔레트보다 많아지면 계정 생성 자체가 막히는 막다른 길이 된다."""
    await _insert_staff(db_conn, name="가", role="doctor", color=3)
    await _insert_staff(db_conn, name="나", role="doctor", color=3)
    count = await db_conn.fetchval(
        "select count(*) from staff where calendar_color_index = 3"
    )
    assert count == 2


@pytest.mark.asyncio
async def test_색은_0에서_9까지만(db_conn):
    """[CAL-COLOR-11] 팔레트는 10색이다. 11번은 토큰이 없어 화면에서 색 없는 블록이 된다."""
    with pytest.raises(Exception):
        await _insert_staff(db_conn, name="다", role="doctor", color=10)


@pytest.mark.asyncio
async def test_의사가_아니면_색을_가질_수_없다(db_conn):
    """[CAL-COLOR-08] 접수직원·관리자는 캘린더에 열이 생기지 않는다 — 색이 필요 없다."""
    with pytest.raises(Exception):
        await _insert_staff(db_conn, name="박접수", role="receptionist", color=0)


@pytest.mark.asyncio
async def test_사진_버킷이_공개_읽기다(db_conn):
    """[STAFF-PROFILE-06] 읽기는 열려 있다 — 환자 앱 의사 카드가 사진을 그린다(BOOK-DOC-02)."""
    public = await db_conn.fetchval(
        "select public from storage.buckets where id = 'doctor-photos'"
    )
    assert public is True


@pytest.mark.asyncio
async def test_사진_버킷_쓰기는_관리자만(db_conn):
    """[STAFF-PROFILE-06] 쓰기까지 열면 아무나 의사 사진을 바꿔 놓을 수 있다."""
    rows = await db_conn.fetch(
        """
        select qual, with_check, cmd from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
        """
    )
    write_admin = any(
        row["cmd"] in ("ALL", "INSERT")
        and "doctor-photos" in ((row["with_check"] or "") + (row["qual"] or ""))
        and "is_admin" in ((row["with_check"] or "") + (row["qual"] or ""))
        for row in rows
    )
    assert write_admin is True
