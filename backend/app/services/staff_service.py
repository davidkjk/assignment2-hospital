from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.admin_client import get_admin_client
from app.db.pool import acquire_as


async def invite_staff(
    email: str,
    name: str,
    role: str,
    department_id: UUID | None,
    invited_by: StaffContext,
    conn=None,
) -> UUID:
    # [정합성 검토 R3-04] 의사는 소속 진료과가 있어야 예약·슬롯·환자조회 범위(doctor_can_view_patient 등)가
    # 성립한다. 이전에는 이 검사가 StaffAdminPage.tsx(프론트엔드)에만 있어, 프론트를 거치지 않는 직접
    # API 호출(또는 클라이언트 버그)로 소속 없는 의사가 만들어질 수 있었다. 이메일을 실제로 보내기 전에
    # 먼저 검사해 불필요한 초대 발송도 막는다.
    if role == "doctor" and department_id is None:
        raise AppError("의사는 소속 진료과를 선택해야 합니다.", status_code=400)

    admin = get_admin_client()
    result = admin.auth.admin.invite_user_by_email(email)
    auth_user_id = UUID(result.user.id)

    async def _run(c):
        return await c.fetchval(
            """
            insert into staff (auth_user_id, name, role, department_id)
            values ($1, $2, $3, $4)
            returning id
            """,
            auth_user_id, name, role, department_id,
        )

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(invited_by.auth_user_id)) as c:
        return await _run(c)


async def deactivate_staff(staff_id: UUID, deactivated_by: StaffContext, conn=None) -> None:
    """[정합성 검토 R3-04] 본인 중지와 마지막 남은 활성 관리자 중지를 막는다 —
    둘 다 병원 운영이 관리자 없이 멈추는 상황을 만들 수 있다.

    [정합성 검토 R1-우선2 재검증] `is_active_staff()` RLS 게이트가 비활성화된 직원의 데이터
    접근은 이미 막지만, Supabase Auth 세션(리프레시 토큰) 자체는 그것만으로는 끊기지 않는다 —
    비활성화 이후에도 JWT 만료 시각(최대 30분)까지 브라우저에는 "로그인된 화면"이 그대로 떠
    있을 수 있다(데이터는 비어 보이지만 완전한 로그아웃 상태는 아님). 이를 막기 위해 `is_active`
    UPDATE와 같은 트랜잭션 안에서 Admin API로 전 기기 세션을 즉시 무효화한다."""
    if staff_id == deactivated_by.id:
        raise AppError("본인 계정은 중지할 수 없습니다.", status_code=409)

    async def _run(c):
        target = await c.fetchrow("select role, auth_user_id from staff where id = $1", staff_id)
        if target is None:
            raise AppError("대상 직원을 찾을 수 없습니다.", status_code=404)
        if target["role"] == "admin":
            active_admin_count = await c.fetchval(
                "select count(*) from staff where role = 'admin' and is_active"
            )
            if active_admin_count <= 1:
                raise AppError("마지막 남은 관리자는 중지할 수 없습니다.", status_code=409)

        await c.execute(
            """
            update staff
            set is_active = false, deactivated_by = $2, deactivated_at = now()
            where id = $1
            """,
            staff_id, deactivated_by.id,
        )
        return target

    if conn is not None:
        target = await _run(conn)
    else:
        async with acquire_as(str(deactivated_by.auth_user_id)) as c:
            target = await _run(c)

    # [정합성 검토 R1-우선2 재검증] scope="global" — 이 직원이 로그인해둔 모든 기기/브라우저의
    # 리프레시 토큰을 한 번에 무효화한다. DB 트랜잭션 밖에서 호출하는 이유: Admin API 호출은
    # DB 트랜잭션에 편입될 수 없는 별도의 외부 호출이라, is_active 반영을 먼저 커밋해 RLS가
    # 즉시 데이터 접근을 막도록 한 뒤 세션을 끊는 순서가 더 안전하다(반대 순서면 세션은 끊겼지만
    # is_active 갱신이 실패해 RLS로는 여전히 접근 가능한 상태가 남을 수 있다).
    admin = get_admin_client()
    admin.auth.admin.sign_out(str(target["auth_user_id"]), scope="global")


async def list_staff(staff: StaffContext, conn=None) -> list[dict]:
    async def _run(c):
        rows = await c.fetch(
            "select id, name, role, department_id, is_active from staff order by is_active desc, name"
        )
        return [dict(row) for row in rows]

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def resend_invite(staff_id: UUID, requested_by: StaffContext, conn=None) -> None:
    """[정합성 검토 R3-04] 초대 이메일이 도착하지 않았거나 링크가 만료된 경우 관리자가 재발송할 수
    있게 한다. `staff`에는 이메일이 없으므로(계정 자체는 `auth.users`가 소유) auth_user_id로
    실제 이메일을 조회한 뒤 같은 `invite_user_by_email`을 다시 호출한다 — 이미 초대를 수락한
    계정에 호출하면 Supabase가 오류를 반환하므로 그대로 사용자에게 안내한다."""
    async def _run(c):
        return await c.fetchval("select auth_user_id from staff where id = $1", staff_id)

    if conn is not None:
        auth_user_id = await _run(conn)
    else:
        async with acquire_as(str(requested_by.auth_user_id)) as c:
            auth_user_id = await _run(c)

    if auth_user_id is None:
        raise AppError("대상 직원을 찾을 수 없습니다.", status_code=404)

    admin = get_admin_client()
    user = admin.auth.admin.get_user_by_id(str(auth_user_id))
    if user is None or user.user is None or not user.user.email:
        raise AppError("계정 이메일을 확인할 수 없습니다.", status_code=404)
    try:
        admin.auth.admin.invite_user_by_email(user.user.email)
    except Exception as exc:
        raise AppError("재초대에 실패했습니다. 이미 초대를 수락한 계정일 수 있습니다.", status_code=409) from exc
