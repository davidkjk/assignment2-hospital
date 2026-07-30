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
    """[정합성 검토 R1-우선2 재검증] 비활성화 시 대상 직원의 Supabase Auth 세션을 전 기기에서
    즉시 끊는다 — RLS(`is_active_staff()`)는 데이터 접근을 막아주지만, 세션 자체는 살아있어
    JWT 만료(최대 30분) 전까지 로그인된 화면이 떠 있을 수 있었다는 지적을 반영."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    target = await seed_staff(db_conn, role="receptionist")

    await staff_service.deactivate_staff(target["staff_id"], deactivated_by=admin_ctx, conn=db_conn)

    _fake_admin_client.auth.admin.sign_out.assert_called_once_with(
        str(target["auth_user_id"]), scope="global"
    )


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
async def test_resend_invite_calls_invite_user_by_email_again(db_conn):
    """[정합성 검토 R3-04] 초대 이메일을 못 받은 직원에게 관리자가 재발송할 수 있어야 한다."""
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    target_seed = await seed_staff(db_conn, role="receptionist")
    target_email = await db_conn.fetchval(
        "select email from auth.users where id = $1", target_seed["auth_user_id"]
    )

    fake_user = MagicMock()
    fake_user.user.email = target_email
    fake_admin_client = MagicMock()
    fake_admin_client.auth.admin.get_user_by_id.return_value = fake_user

    with patch("app.services.staff_service.get_admin_client", return_value=fake_admin_client):
        await staff_service.resend_invite(target_seed["staff_id"], requested_by=admin_ctx, conn=db_conn)

    fake_admin_client.auth.admin.get_user_by_id.assert_called_once_with(str(target_seed["auth_user_id"]))
    fake_admin_client.auth.admin.invite_user_by_email.assert_called_once_with(target_email)


@pytest.mark.asyncio
async def test_resend_invite_missing_staff_raises(db_conn):
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")

    with pytest.raises(AppError):
        await staff_service.resend_invite(uuid4(), requested_by=admin_ctx, conn=db_conn)
