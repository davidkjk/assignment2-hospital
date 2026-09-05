"""[Task 19a] 직원 목록 합성·색 자동 배정·프로필 저장 서비스.

`list_staff`는 로그인/초대 상태를 auth.users에서 한 번에 합쳐 내려주고, `invite_staff`는
의사에게 남은 색을 0번부터 자동 배정한다. 프로필 저장·사진은 대상이 의사인지 서버가 먼저 검사한다.
"""

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import staff_service, staff_profile
from tests.conftest import seed_staff


def _ctx(seed: dict, role: str = "admin") -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


def _by_name(rows, name):
    return next(row for row in rows if row["name"] == name)


class _FakeStorage:
    def __init__(self):
        self.removed = []
        self.uploaded = []

    def upload(self, path, data, options=None):
        self.uploaded.append(path)

    def remove(self, paths):
        self.removed.extend(paths)

    def get_public_url(self, path):
        return f"http://local/storage/v1/object/public/doctor-photos/{path}"


def _fake_admin_users(id_to_attrs: dict) -> MagicMock:
    """get_admin_client().auth.admin.list_users() 한 번으로 로그인/초대 시각을 합치는 fake."""
    calls = {"list_users": 0, "get_user": 0}
    users = [SimpleNamespace(id=str(uid), **attrs) for uid, attrs in id_to_attrs.items()]

    admin = MagicMock()

    def _list_users():
        calls["list_users"] += 1
        return users

    def _get_user(_uid):
        calls["get_user"] += 1
        return MagicMock()

    admin.auth.admin.list_users.side_effect = _list_users
    admin.auth.admin.get_user_by_id.side_effect = _get_user
    admin._calls = calls
    return admin


@pytest.mark.asyncio
async def test_목록_정렬에_고유ID가_마지막_키로_들어간다(db_conn):
    """[STAFF-LIST-02] 이름이 같은 직원 둘이면 재조회 사이에 순서가 흔들려선 안 된다."""
    admin = await seed_staff(db_conn, role="admin")

    async def _insert_named(name):
        aid = uuid.uuid4()
        await db_conn.execute(
            "insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role) values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')",
            aid, f"{aid}@test.local",
        )
        return await db_conn.fetchval(
            "insert into staff (auth_user_id, name, role) values ($1, $2, 'receptionist') returning id",
            aid, name,
        )

    a = await _insert_named("김민수")
    b = await _insert_named("김민수")
    lo, hi = sorted([a, b], key=str)
    with patch("app.services.staff_service.get_admin_client", return_value=_fake_admin_users({})):
        rows = await staff_service.list_staff(_ctx(admin), conn=db_conn)
    ordered = [row["id"] for row in rows if row["name"] == "김민수"]
    assert ordered == [lo, hi]


@pytest.mark.asyncio
async def test_로그인_이력을_한_번의_조회로_합쳐_내려준다(db_conn):
    """[STAFF-LIST-07] staff 표에는 로그인 기록이 없다 — auth.users를 한 번만 조회해 합친다."""
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    t1 = datetime(2026, 8, 20, 8, 57, tzinfo=timezone.utc)
    fake = _fake_admin_users({doctor["auth_user_id"]: {"last_sign_in_at": t1, "invited_at": None}})
    with patch("app.services.staff_service.get_admin_client", return_value=fake):
        rows = await staff_service.list_staff(_ctx(admin), conn=db_conn)
    assert fake._calls["list_users"] == 1


@pytest.mark.asyncio
async def test_직원마다_개별_조회를_하지_않는다(db_conn):
    """[STAFF-LIST-09] 직원 수만큼 get_user_by_id를 부르면 20명 병원에서 21번 호출이 된다."""
    admin = await seed_staff(db_conn, role="admin")
    await seed_staff(db_conn, role="doctor")
    fake = _fake_admin_users({})
    with patch("app.services.staff_service.get_admin_client", return_value=fake):
        await staff_service.list_staff(_ctx(admin), conn=db_conn)
    assert fake._calls["get_user"] == 0


@pytest.mark.asyncio
async def test_로그인_시각을_직원_행에_붙인다(db_conn):
    """[STAFF-LIST-07] 마지막 로그인 시각이 그 직원 행에 실려 내려온다."""
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await db_conn.execute("update staff set name = '이민호' where id = $1", doctor["staff_id"])
    t1 = datetime(2026, 8, 20, 8, 57, tzinfo=timezone.utc)
    fake = _fake_admin_users({doctor["auth_user_id"]: {"last_sign_in_at": t1, "invited_at": None}})
    with patch("app.services.staff_service.get_admin_client", return_value=fake):
        rows = await staff_service.list_staff(_ctx(admin), conn=db_conn)
    assert _by_name(rows, "이민호")["last_sign_in_at"] == t1


@pytest.mark.asyncio
async def test_한_번도_로그인하지_않았으면_초대시각만_있다(db_conn):
    """[STAFF-LIST-08] 「중지됨」과 다른 상태다 — 중지는 막은 것, 이건 아직 안 온 것."""
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await db_conn.execute("update staff set name = '김의사' where id = $1", doctor["staff_id"])
    t0 = datetime(2026, 8, 14, 0, 0, tzinfo=timezone.utc)
    fake = _fake_admin_users({doctor["auth_user_id"]: {"last_sign_in_at": None, "invited_at": t0}})
    with patch("app.services.staff_service.get_admin_client", return_value=fake):
        rows = await staff_service.list_staff(_ctx(admin), conn=db_conn)
    row = _by_name(rows, "김의사")
    assert row["last_sign_in_at"] is None
    assert row["invited_at"] == t0


def _invite_admin_with_seeded_users(db_conn, n):
    """invite_user_by_email가 미리 심어둔 auth.users id를 차례로 돌려주는 fake."""
    ids = []

    async def _seed():
        for _ in range(n):
            aid = uuid.uuid4()
            await db_conn.execute(
                """
                insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
                values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
                """,
                aid, f"{aid}@test.local",
            )
            ids.append(aid)

    admin = MagicMock()
    it = iter(range(n))

    def _invite(_email):
        u = MagicMock()
        u.user.id = str(ids[next(it)])
        return u

    admin.auth.admin.invite_user_by_email.side_effect = _invite
    return admin, ids, _seed


async def _color_of(conn, staff_id):
    return await conn.fetchval("select calendar_color_index from staff where id = $1", staff_id)


@pytest.mark.asyncio
async def test_새_의사에게_남은_색을_0번부터_자동으로_준다(db_conn):
    """[CAL-COLOR-03] 관리자가 고르지 않아도 캘린더가 바로 돌아간다 — 0번부터 준다."""
    admin = await seed_staff(db_conn, role="admin")
    dept = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    fake, ids, seed = _invite_admin_with_seeded_users(db_conn, 2)
    await seed()
    with patch("app.services.staff_service.get_admin_client", return_value=fake):
        a = await staff_service.invite_staff(email="a@t", name="가", role="doctor", department_id=dept, invited_by=_ctx(admin), conn=db_conn)
        b = await staff_service.invite_staff(email="b@t", name="나", role="doctor", department_id=dept, invited_by=_ctx(admin), conn=db_conn)
    assert await _color_of(db_conn, a) == 0
    assert await _color_of(db_conn, b) == 1


@pytest.mark.asyncio
async def test_색이_다_찼어도_계정은_만들어진다(db_conn):
    """[CAL-COLOR-07] 11번째 의사 — 가장 적게 쓰인 번호 중 가장 작은 것(막다른 길 금지)."""
    admin = await seed_staff(db_conn, role="admin")
    dept = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    for i in range(10):
        aid = uuid.uuid4()
        await db_conn.execute(
            "insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role) values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')",
            aid, f"{aid}@test.local",
        )
        await db_conn.execute(
            "insert into staff (auth_user_id, name, role, calendar_color_index) values ($1, $2, 'doctor', $3)",
            aid, f"의사{i}", i,
        )
    fake, ids, seed = _invite_admin_with_seeded_users(db_conn, 1)
    await seed()
    with patch("app.services.staff_service.get_admin_client", return_value=fake):
        k = await staff_service.invite_staff(email="k@t", name="열한번째", role="doctor", department_id=dept, invited_by=_ctx(admin), conn=db_conn)
    assert await _color_of(db_conn, k) == 0


@pytest.mark.asyncio
async def test_접수직원에게는_색을_주지_않는다(db_conn):
    """[CAL-COLOR-08] 자동 배정도 의사에게만 일어난다."""
    admin = await seed_staff(db_conn, role="admin")
    fake, ids, seed = _invite_admin_with_seeded_users(db_conn, 1)
    await seed()
    with patch("app.services.staff_service.get_admin_client", return_value=fake):
        r = await staff_service.invite_staff(email="r@t", name="박접수", role="receptionist", department_id=None, invited_by=_ctx(admin), conn=db_conn)
    assert await _color_of(db_conn, r) is None


@pytest.mark.asyncio
async def test_비의사에게_프로필을_저장할_수_없다(db_conn):
    """[STAFF-PROFILE-02] 화면에서 [프로필] 버튼을 안 그리는 것과 같은 검사를 서버도 한다."""
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    with pytest.raises(AppError) as e:
        await staff_profile.update_doctor_profile(
            receptionist["staff_id"], specialty="내과", staff=_ctx(admin), conn=db_conn
        )
    assert e.value.status_code == 400


@pytest.mark.asyncio
async def test_의사_프로필_전문분야를_저장한다(db_conn):
    """[STAFF-PROFILE-04] 전문분야는 이 화면이 소유하는 칸이다(환자 앱이 읽는다)."""
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await staff_profile.update_doctor_profile(
        doctor["staff_id"], specialty="소화기내과", staff=_ctx(admin), conn=db_conn
    )
    saved = await db_conn.fetchval("select specialty from staff where id = $1", doctor["staff_id"])
    assert saved == "소화기내과"


@pytest.mark.asyncio
async def test_색은_팔레트_번호로_저장한다(db_conn):
    """[CAL-COLOR-09] 저장하는 것은 색값이 아니라 팔레트 번호다."""
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await staff_profile.update_doctor_profile(
        doctor["staff_id"], calendar_color_index=6, staff=_ctx(admin), conn=db_conn
    )
    assert await _color_of(db_conn, doctor["staff_id"]) == 6


@pytest.mark.asyncio
async def test_사진을_올리면_공개_url이_저장된다(db_conn):
    """[STAFF-PROFILE-06] 사진을 올리면 그 공개 URL을 photo_url에 적는다."""
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    storage = _FakeStorage()
    url = await staff_profile.upload_photo(
        doctor["staff_id"], filename="a.jpg", content_type="image/jpeg", data=b"x",
        staff=_ctx(admin), conn=db_conn, storage=storage,
    )
    saved = await db_conn.fetchval("select photo_url from staff where id = $1", doctor["staff_id"])
    assert saved == url


@pytest.mark.asyncio
async def test_사진을_지우면_칸이_비고_파일도_지워진다(db_conn):
    """[STAFF-PROFILE-07] 화면은 회색 원 + 이름 첫 글자로 돌아간다(BOOK-DOC-05와 같은 그림)."""
    admin = await seed_staff(db_conn, role="doctor")
    doctor = await seed_staff(db_conn, role="doctor")
    await db_conn.execute(
        "update staff set photo_url = $2 where id = $1",
        doctor["staff_id"],
        "http://local/storage/v1/object/public/doctor-photos/pic.jpg",
    )
    storage = _FakeStorage()
    await staff_profile.delete_photo(doctor["staff_id"], staff=_ctx(admin), conn=db_conn, storage=storage)
    assert await db_conn.fetchval("select photo_url from staff where id = $1", doctor["staff_id"]) is None
    assert storage.removed == ["pic.jpg"]
