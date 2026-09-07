import asyncio
import uuid
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import staff_service
from tests.conftest import seed_staff


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


@pytest.fixture(autouse=True)
def _fake_admin_client(monkeypatch):
    """[정합성 검토 R1-우선2 재검증] deactivate_staff가 Supabase Admin API로 세션을 끊게 되면서,
    이 파일의 모든 테스트가 기본적으로 가짜 admin 클라이언트를 쓰도록 한다(실제 네트워크 호출 방지).
    세션 무효화 호출 자체를 검증하는 테스트는 이 픽스처가 반환한 목을 그대로 받아 assert한다.
    개별 테스트가 `with patch("app.services.staff_service.get_admin_client", ...)`로 더 구체적인
    목을 또 씌우는 것도 문제없다 — with 블록이 끝나면 이 픽스처의 monkeypatch로 복원된다."""
    fake_admin_client = MagicMock()
    monkeypatch.setattr("app.services.staff_service.get_admin_client", lambda: fake_admin_client)
    return fake_admin_client


@pytest.mark.asyncio
async def test_invite_staff_creates_staff_row(db_conn, monkeypatch):
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")

    invited_auth_id = uuid4()
    fake_user = MagicMock()
    fake_user.user.id = str(invited_auth_id)
    fake_admin_client = MagicMock()
    fake_admin_client.auth.admin.invite_user_by_email.return_value = fake_user

    async def fake_seed_auth_user(conn):
        await conn.execute(
            """
            insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
            values ($1, 'new-doctor@test.local', '', now(), now(), now(), 'authenticated', 'authenticated')
            """,
            invited_auth_id,
        )

    await fake_seed_auth_user(db_conn)
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")

    with patch("app.services.staff_service.get_admin_client", return_value=fake_admin_client):
        staff_id = await staff_service.invite_staff(
            email="new-doctor@test.local", name="김의사", role="doctor", department_id=dept_id, invited_by=admin_ctx, conn=db_conn,
        )

    assert staff_id is not None
    row = await db_conn.fetchrow("select role, name from staff where id = $1", staff_id)
    assert row["role"] == "doctor"
    assert row["name"] == "김의사"


@pytest.mark.asyncio
async def test_invite_staff_passes_redirect_to(db_conn):
    """redirect_to가 주어지면 Supabase 초대에 그대로 전달돼 수락 링크가 그 직원웹으로 돌아온다."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")

    invited_auth_id = uuid4()
    fake_user = MagicMock()
    fake_user.user.id = str(invited_auth_id)
    fake_admin_client = MagicMock()
    fake_admin_client.auth.admin.invite_user_by_email.return_value = fake_user

    await db_conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, 'redir-doctor@test.local', '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        invited_auth_id,
    )
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")

    origin = "https://gaonhospital-staff-git-merge-design-integration-iansoft.vercel.app"
    with patch("app.services.staff_service.get_admin_client", return_value=fake_admin_client):
        await staff_service.invite_staff(
            email="redir-doctor@test.local", name="김의사", role="doctor", department_id=dept_id,
            invited_by=admin_ctx, redirect_to=origin, conn=db_conn,
        )

    fake_admin_client.auth.admin.invite_user_by_email.assert_called_once_with(
        "redir-doctor@test.local", {"redirect_to": origin}
    )


@pytest.mark.asyncio
async def test_invite_doctor_without_department_rejected(db_conn):
    """[정합성 검토 R3-04] 프론트엔드 검증을 우회한 직접 API 호출도 막혀야 한다 —
    이전에는 StaffAdminPage.tsx에만 이 검사가 있어 서버가 소속 없는 의사 생성을 그대로 허용했다."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")

    with pytest.raises(AppError):
        await staff_service.invite_staff(
            email="no-dept-doctor@test.local", name="김의사", role="doctor", department_id=None, invited_by=admin_ctx, conn=db_conn,
        )


@pytest.mark.asyncio
async def test_deactivate_staff_sets_flags(db_conn):
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    target = await seed_staff(db_conn, role="receptionist")

    await staff_service.deactivate_staff(target["staff_id"], deactivated_by=admin_ctx, conn=db_conn)

    row = await db_conn.fetchrow(
        "select is_active, deactivated_by from staff where id = $1", target["staff_id"]
    )
    assert row["is_active"] is False
    assert row["deactivated_by"] == admin_ctx.id


@pytest.mark.asyncio
async def test_deactivate_staff_revokes_auth_session(db_conn, _fake_admin_client):
    """[R1-우선2 / 2026-09-07 버그수정] 비활성화 시 대상 직원의 Supabase Auth 세션을 무효화한다.
    ⚠️ 예전 구현은 admin sign_out(user_id)를 썼으나 GoTrue sign_out은 JWT 전용이라 user_id를
    넘기면 매번 "invalid JWT" 500이 났다(user_id로 로그아웃하는 admin API가 없다). ban으로
    토큰 갱신을 막는다 — 현재 access token은 만료까지 유효하나 그 사이 데이터는 RLS의
    is_active 게이트가 막는다(두 겹)."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    target = await seed_staff(db_conn, role="receptionist")

    await staff_service.deactivate_staff(target["staff_id"], deactivated_by=admin_ctx, conn=db_conn)

    _fake_admin_client.auth.admin.update_user_by_id.assert_called_once_with(
        str(target["auth_user_id"]), {"ban_duration": "876000h"}
    )


@pytest.mark.asyncio
async def test_deactivate_staff_succeeds_even_if_session_revoke_fails(db_conn, _fake_admin_client):
    """세션 무효화(ban)는 부가 방어다 — Supabase admin API가 실패해도 중지(is_active=false) 자체는
    성공해야 한다(막다른 길·거짓 실패 방지). 예전 버그: 무효화 호출이 500나면 is_active는 이미
    커밋됐는데 관리자에겐 "잠시 후 다시" 에러만 떠 '중지됐는지' 알 수 없었다."""
    _fake_admin_client.auth.admin.update_user_by_id.side_effect = RuntimeError("gotrue down")
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    target = await seed_staff(db_conn, role="receptionist")

    # 예외를 밖으로 던지지 않는다.
    await staff_service.deactivate_staff(target["staff_id"], deactivated_by=admin_ctx, conn=db_conn)

    row = await db_conn.fetchrow("select is_active from staff where id = $1", target["staff_id"])
    assert row["is_active"] is False


@pytest.mark.asyncio
async def test_deactivate_staff_rejects_self(db_conn):
    """[정합성 검토 R3-04] 관리자가 자기 자신을 중지할 수 없다."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")

    with pytest.raises(AppError) as exc_info:
        await staff_service.deactivate_staff(admin_ctx.id, deactivated_by=admin_ctx, conn=db_conn)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_deactivate_staff_rejects_last_active_admin(db_conn):
    """[정합성 검토 R3-04] 활성 관리자가 한 명뿐이면(본인이 아니어도) 중지할 수 없다 — 관리 권한 공백 방지.

    이전 버전 테스트는 관리자를 하나 더 추가한 뒤(활성 관리자 2명) 그 신규 관리자를 중지하는
    시나리오를 검증했는데, 이 경우 중지 후에도 관리자가 1명 남으므로 서비스 규칙상 성공해야
    맞다 — 테스트가 "실패해야 함"으로 잘못 기대하고 있었다. 진짜 "마지막 관리자" 시나리오는
    활성 관리자가 정확히 1명일 때 그 사람을 중지하려는 경우다."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    other_admin_seed = await seed_staff(db_conn, role="admin")
    await staff_service.deactivate_staff(other_admin_seed["staff_id"], deactivated_by=admin_ctx, conn=db_conn)
    # 이제 활성 관리자는 admin_ctx 한 명뿐이다. 접수직원이 그 마지막 관리자를 중지하려 해도 막혀야 한다.

    receptionist_seed = await seed_staff(db_conn, role="receptionist")
    receptionist_ctx = _to_context(receptionist_seed, "receptionist")
    with pytest.raises(AppError) as exc_info:
        await staff_service.deactivate_staff(admin_ctx.id, deactivated_by=receptionist_ctx, conn=db_conn)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_deactivate_staff_allows_admin_when_another_admin_remains(db_conn):
    """[정합성 검토 R3-04] 관리자가 2명이면 한 명을 중지해도 최소 1명이 남으므로 허용돼야 한다."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    other_admin_seed = await seed_staff(db_conn, role="admin")

    await staff_service.deactivate_staff(other_admin_seed["staff_id"], deactivated_by=admin_ctx, conn=db_conn)

    row = await db_conn.fetchrow("select is_active from staff where id = $1", other_admin_seed["staff_id"])
    assert row["is_active"] is False


@pytest.mark.asyncio
async def test_delete_staff_rejects_self(db_conn):
    """[STAFF-DELETE-01] 본인 계정은 삭제할 수 없다(가드 먼저 — admin API도 안 부른다)."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    with pytest.raises(AppError) as exc_info:
        await staff_service.delete_staff(admin_ctx.id, requested_by=admin_ctx, conn=db_conn)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_delete_staff_rejects_accepted(db_conn, _fake_admin_client):
    """[STAFF-DELETE-01] 이미 로그인한 적 있는(수락) 직원은 삭제하지 않는다 — 중지를 쓴다.
    참조 기록이 깨질 수 있어 미수락만 삭제한다."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    target = await seed_staff(db_conn, role="receptionist")
    _fake_admin_client.auth.admin.get_user_by_id.return_value.user.last_sign_in_at = "2026-08-01T09:00:00+09:00"

    with pytest.raises(AppError) as exc_info:
        await staff_service.delete_staff(target["staff_id"], requested_by=admin_ctx, conn=db_conn)
    assert exc_info.value.status_code == 409
    row = await db_conn.fetchrow("select id from staff where id = $1", target["staff_id"])
    assert row is not None  # 삭제 안 됨
    _fake_admin_client.auth.admin.delete_user.assert_not_called()


@pytest.mark.asyncio
async def test_delete_staff_removes_pending(db_conn, _fake_admin_client):
    """[STAFF-DELETE-01] 미수락(로그인 이력 없음) + 딸린 데이터 없음이면 staff 행을 지우고
    auth 사용자도 지운다(같은 이메일 재초대 가능)."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    target = await seed_staff(db_conn, role="receptionist")
    _fake_admin_client.auth.admin.get_user_by_id.return_value.user.last_sign_in_at = None

    await staff_service.delete_staff(target["staff_id"], requested_by=admin_ctx, conn=db_conn)

    row = await db_conn.fetchrow("select id from staff where id = $1", target["staff_id"])
    assert row is None
    _fake_admin_client.auth.admin.delete_user.assert_called_once_with(str(target["auth_user_id"]))


@pytest.mark.asyncio
async def test_list_staff_returns_all_roles(db_conn):
    """[정합성 검토 R3-04] 관리자 화면의 직원 목록 — 활성/비활성 모두 포함한다."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    await staff_service.deactivate_staff(receptionist["staff_id"], deactivated_by=admin_ctx, conn=db_conn)

    staff_list = await staff_service.list_staff(admin_ctx, conn=db_conn)

    ids = {row["id"] for row in staff_list}
    assert admin_ctx.id in ids
    assert receptionist["staff_id"] in ids
    inactive_row = next(row for row in staff_list if row["id"] == receptionist["staff_id"])
    assert inactive_row["is_active"] is False


@pytest.mark.asyncio
async def test_resend_invite_sends_password_setup_email():
    """[STAFF-ROW-03] 재초대는 '초대 다시'가 아니라 '비밀번호 설정 링크 다시 보내기'다.

    초대(invite_user_by_email)는 계정 생성과 한 덩어리라, 초대만 받고 아직 수락 안 한
    계정에도 막힌다(email_exists). 복구 메일(reset_password_for_email)을 보내면 링크가
    같은 '비밀번호 설정' 화면(/reset-password/new)으로 가고 계정 유무와 무관하게 동작한다."""
    admin = MagicMock()
    admin.auth.admin.get_user_by_id.return_value.user.email = "r@test.local"
    conn = _FakeConn(auth_user_id=uuid4())

    with patch("app.services.staff_service.get_admin_client", return_value=admin):
        await staff_service.resend_invite(uuid4(), requested_by=_admin_ctx(), conn=conn)

    admin.auth.reset_password_for_email.assert_called_once_with("r@test.local")
    admin.auth.admin.invite_user_by_email.assert_not_called()


@pytest.mark.asyncio
async def test_resend_invite_passes_redirect_to():
    """재초대(=비번설정 링크)도 redirect_to를 넘겨 링크가 그 직원웹으로 돌아온다."""
    admin = MagicMock()
    admin.auth.admin.get_user_by_id.return_value.user.email = "r@test.local"
    conn = _FakeConn(auth_user_id=uuid4())
    origin = "https://gaonhospital-staff.vercel.app"

    with patch("app.services.staff_service.get_admin_client", return_value=admin):
        await staff_service.resend_invite(
            uuid4(), requested_by=_admin_ctx(), redirect_to=origin, conn=conn
        )

    admin.auth.reset_password_for_email.assert_called_once_with(
        "r@test.local", {"redirect_to": origin}
    )


@pytest.mark.asyncio
async def test_resend_invite_succeeds_for_already_existing_account():
    """버그 재현·회귀 가드: 초대만 받고 아직 수락 안 한(=계정은 이미 있는) 직원에게 재초대해도
    성공해야 한다. 옛 코드는 invite_user_by_email이 email_exists(422)로 막혀 409 '이미 수락한
    계정' 이라는 엉뚱한 안내를 줬다. 새 코드는 초대를 다시 부르지 않고 복구 메일을 보낸다."""
    admin = MagicMock()
    admin.auth.admin.get_user_by_id.return_value.user.email = "invited@test.local"
    # 옛 경로(초대 다시)였다면 이 오류로 막혔을 것이다 — 새 경로는 이걸 아예 부르지 않는다.
    admin.auth.admin.invite_user_by_email.side_effect = _FakeAuthError(
        "User already registered", 422, "email_exists"
    )
    conn = _FakeConn(auth_user_id=uuid4())

    with patch("app.services.staff_service.get_admin_client", return_value=admin):
        await staff_service.resend_invite(uuid4(), requested_by=_admin_ctx(), conn=conn)

    admin.auth.reset_password_for_email.assert_called_once()


@pytest.mark.asyncio
async def test_resend_invite_missing_staff_raises():
    admin = MagicMock()
    conn = _FakeConn(auth_user_id=None)  # staff 조회 결과 없음 → 404
    with patch("app.services.staff_service.get_admin_client", return_value=admin):
        with pytest.raises(AppError):
            await staff_service.resend_invite(uuid4(), requested_by=_admin_ctx(), conn=conn)


async def _seed_committed_staff(conn, role: str) -> dict:
    auth_user_id = uuid.uuid4()
    await conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_user_id, f"{auth_user_id}@test.local",
    )
    staff_id = await conn.fetchval(
        "insert into staff (auth_user_id, name, role) values ($1, 'Concurrency Staff', $2) returning id",
        auth_user_id, role,
    )
    return {"auth_user_id": auth_user_id, "staff_id": staff_id}


@pytest.mark.asyncio
async def test_concurrent_deactivation_keeps_one_active_admin(db_pool):
    """두 명뿐인 활성 관리자를 동시에 중지하려 하면 하나만 성공해야 한다 —
    둘 다 성공하면 활성 관리자가 0명이 되어 이후 아무도 관리자 권한을 되돌릴 수 없다.

    라우터 계층에서 `require_role("admin")`으로 막히므로 이 서비스 함수의 실제
    호출자는 항상 관리자다 — 관리자가 정확히 2명뿐인 상태에서 그 둘이 서로를 거의
    동시에 중지하는 실사용 시나리오를 재현한다(예: 두 관리자가 각자 다른 브라우저
    탭에서 상대를 정리하려는 경우)."""
    async with db_pool.acquire() as setup_conn:
        admin_x = await _seed_committed_staff(setup_conn, role="admin")
        admin_y = await _seed_committed_staff(setup_conn, role="admin")

    admin_x_ctx = _to_context(admin_x, "admin")
    admin_y_ctx = _to_context(admin_y, "admin")

    results = await asyncio.gather(
        staff_service.deactivate_staff(admin_y["staff_id"], deactivated_by=admin_x_ctx),
        staff_service.deactivate_staff(admin_x["staff_id"], deactivated_by=admin_y_ctx),
        return_exceptions=True,
    )

    successes = [r for r in results if r is None]
    failures = [r for r in results if isinstance(r, AppError)]
    assert len(successes) == 1
    assert len(failures) == 1
    assert failures[0].status_code == 409

    async with db_pool.acquire() as check_conn:
        active_admin_count = await check_conn.fetchval(
            "select count(*) from staff where role = 'admin' and is_active"
        )
    assert active_admin_count == 1


# ── 초대 이메일 실패 UX (STAFF-INVITE-06~09) ──────────────────────────────
# 막다른 500 대신 원인별 안내를 주고, 고아 계정(auth엔 있으나 staff 행 없음)은 자동으로
# 잇는다. 실제 DB를 건드리지 않도록(공용 시드 보호) SQL 문자열로 분기하는 최소 conn을 쓴다.


class _FakeAuthError(Exception):
    """Supabase AuthApiError를 흉내낸다 — .status/.code/.message를 갖는다."""

    def __init__(self, message: str, status: int, code: str):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


class _FakeConn:
    def __init__(self, *, staff_exists: bool = False, new_staff_id=None, auth_user_id=None):
        self._staff_exists = staff_exists
        self._new_staff_id = new_staff_id
        self._auth_user_id = auth_user_id
        self.inserted = False

    async def fetchval(self, sql, *args):
        s = " ".join(sql.lower().split())
        if "select auth_user_id from staff where id" in s:
            return self._auth_user_id
        if "from staff where auth_user_id" in s:
            return 1 if self._staff_exists else None
        if "generate_series" in s:  # _NEXT_COLOR_SQL (의사 색 배정)
            return 3
        if "insert into staff" in s:
            self.inserted = True
            return self._new_staff_id
        return None


def _admin_ctx() -> StaffContext:
    return StaffContext(id=uuid4(), auth_user_id=uuid4(), role="admin", department_id=None)


@pytest.mark.asyncio
async def test_invite_rate_limit_gives_clear_message_not_500():
    """[STAFF-INVITE-06] 발송 한도(429)는 막다른 500이 아니라 사람이 읽는 안내를 준다."""
    admin = MagicMock()
    admin.auth.admin.invite_user_by_email.side_effect = _FakeAuthError(
        "email rate limit exceeded", 429, "over_email_send_rate_limit"
    )
    conn = _FakeConn(new_staff_id=uuid4())
    with patch("app.services.staff_service.get_admin_client", return_value=admin):
        with pytest.raises(AppError) as ei:
            await staff_service.invite_staff(
                email="x@test.local", name="김", role="receptionist",
                department_id=None, invited_by=_admin_ctx(), conn=conn,
            )
    assert ei.value.status_code == 429
    assert "제한" in ei.value.message
    assert not conn.inserted


@pytest.mark.asyncio
async def test_invite_already_registered_staff_tells_admin():
    """[STAFF-INVITE-07] 이미 staff 행이 있는 이메일이면 '이미 등록된 직원' 안내(구제 아님)."""
    existing = MagicMock()
    existing.id = str(uuid4())
    existing.email = "dup@test.local"
    admin = MagicMock()
    admin.auth.admin.invite_user_by_email.side_effect = _FakeAuthError(
        "User already registered", 422, "email_exists"
    )
    admin.auth.admin.list_users.return_value = [existing]
    conn = _FakeConn(staff_exists=True, new_staff_id=uuid4())
    with patch("app.services.staff_service.get_admin_client", return_value=admin):
        with pytest.raises(AppError) as ei:
            await staff_service.invite_staff(
                email="dup@test.local", name="김", role="receptionist",
                department_id=None, invited_by=_admin_ctx(), conn=conn,
            )
    assert ei.value.status_code == 409
    assert "이미 등록된 직원" in ei.value.message
    assert not conn.inserted


@pytest.mark.asyncio
async def test_invite_orphan_account_is_relinked_and_reinvited():
    """[STAFF-INVITE-08] auth엔 있으나 staff 행이 없는 고아 계정 → 이어붙이고 초대 재발송."""
    orphan = MagicMock()
    orphan.id = str(uuid4())
    orphan.email = "orphan@test.local"
    admin = MagicMock()
    admin.auth.admin.invite_user_by_email.side_effect = [
        _FakeAuthError("User already registered", 422, "email_exists"),  # 첫 초대
        MagicMock(),  # 구제 후 재발송 성공
    ]
    admin.auth.admin.list_users.return_value = [orphan]
    new_id = uuid4()
    conn = _FakeConn(staff_exists=False, new_staff_id=new_id)
    with patch("app.services.staff_service.get_admin_client", return_value=admin):
        staff_id = await staff_service.invite_staff(
            email="orphan@test.local", name="김접수", role="receptionist",
            department_id=None, invited_by=_admin_ctx(), conn=conn,
        )
    assert staff_id == new_id
    assert conn.inserted
    assert admin.auth.admin.invite_user_by_email.call_count == 2


@pytest.mark.asyncio
async def test_invite_unknown_error_still_bubbles_up():
    """[STAFF-INVITE-09] 분류 안 되는 오류는 삼키지 않고 위로 던져 로그·추적이 남게 한다."""
    admin = MagicMock()
    admin.auth.admin.invite_user_by_email.side_effect = RuntimeError("network down")
    conn = _FakeConn(new_staff_id=uuid4())
    with patch("app.services.staff_service.get_admin_client", return_value=admin):
        with pytest.raises(RuntimeError):
            await staff_service.invite_staff(
                email="x@test.local", name="김", role="receptionist",
                department_id=None, invited_by=_admin_ctx(), conn=conn,
            )
    assert not conn.inserted


@pytest.mark.asyncio
async def test_resend_invite_rate_limit_gives_clear_message():
    """[STAFF-INVITE-06] 재초대(비번설정 메일)도 발송 한도(429)면 막다른 길 대신 안내를 준다."""
    admin = MagicMock()
    admin.auth.admin.get_user_by_id.return_value.user.email = "r@test.local"
    admin.auth.reset_password_for_email.side_effect = _FakeAuthError(
        "rate", 429, "over_email_send_rate_limit"
    )
    conn = _FakeConn(auth_user_id=uuid4())
    with patch("app.services.staff_service.get_admin_client", return_value=admin):
        with pytest.raises(AppError) as ei:
            await staff_service.resend_invite(uuid4(), requested_by=_admin_ctx(), conn=conn)
    assert ei.value.status_code == 429
    assert "제한" in ei.value.message
