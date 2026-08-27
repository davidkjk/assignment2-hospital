import hashlib
from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.admin_client import get_admin_client
from app.db.pool import acquire_as
from app.services.schedule_change import list_affected_appointments

# CAL-COLOR-03·07·13 — 의사를 초대하면 남은 색을 0번부터 준다. 다 찼으면 가장 적게 쓰인 번호 중
# 가장 작은 것(막다른 길 금지). 팔레트는 「서로 가장 먼 것부터」 배열돼 앞 번호끼리 가장 잘 구별된다.
_NEXT_COLOR_SQL = """
select coalesce(
  (select i from generate_series(0, 9) i
   where i not in (select calendar_color_index from staff
                   where calendar_color_index is not null and is_active)
   order by i limit 1),
  (select calendar_color_index from staff
   where calendar_color_index is not null
   group by calendar_color_index order by count(*), calendar_color_index limit 1),
  0)
"""


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
        # 의사에게만 색을 자동 배정한다(CAL-COLOR-08). 비의사는 캘린더에 열이 없어 색이 없다.
        color = await c.fetchval(_NEXT_COLOR_SQL) if role == "doctor" else None
        return await c.fetchval(
            """
            insert into staff (auth_user_id, name, role, department_id, calendar_color_index)
            values ($1, $2, $3, $4, $5)
            returning id
            """,
            auth_user_id, name, role, department_id, color,
        )

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(invited_by.auth_user_id)) as c:
        return await _run(c)


def _impact_version(rows: list[dict]) -> str:
    """영향 예약 집합에서 안정적인 버전 문자열을 만든다 — 예약이 하나라도 늘거나 줄면 바뀐다."""
    ids = sorted(str(row["id"]) for row in rows)
    return hashlib.sha256("|".join(ids).encode()).hexdigest()[:16]


async def _affected_for_doctor(conn, doctor_id: UUID) -> list[dict]:
    """이 의사를 끄면 확인이 필요해지는 미래·미취소 예약만. 판정 함수는 Task 2의 것 하나뿐이다."""
    rows = await list_affected_appointments(
        conn, deactivating_doctor_id=doctor_id, for_role="staff"
    )
    return [row for row in rows if row.get("doctor_id") == doctor_id]


async def get_deactivation_impact(conn, doctor_id: UUID, *, for_role: str = "admin") -> dict:
    """[STAFF-DEACT-04] 중지 확정 전 미리보기 — 건수·날짜·시각만. 이름·전화번호는 없다.

    ⭐ 읽기만 한다. 예약 상태·is_active를 건드리지 않는다(SCHED-WARN-07).
    """
    rows = await _affected_for_doctor(conn, doctor_id)
    times = sorted(
        (
            {
                "date": row["start_at"].date().isoformat(),
                "time": row["start_at"].strftime("%H:%M"),
            }
            for row in rows
            if row.get("start_at") is not None
        ),
        key=lambda value: (value["date"], value["time"]),
    )
    return {"count": len(rows), "times": times, "version": _impact_version(rows)}


async def deactivate_staff(
    staff_id: UUID,
    deactivated_by: StaffContext,
    conn=None,
    impact_version: str | None = None,
) -> None:
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
        # [STAFF-DEACT-09] 미리보기 뒤 다른 직원이 그 시간에 예약을 하나 더 잡았을 수 있다.
        # 오래된 미리보기로는 확정하지 않는다 — 3건인 줄 안 관리자가 4건을 큐로 보내면 안 된다.
        if impact_version is not None:
            current = await get_deactivation_impact(c, staff_id)
            if current["version"] != impact_version:
                raise AppError("최신 상태가 바뀌었습니다. 다시 확인해 주세요.", status_code=409)
        if target["role"] == "admin":
            # 동시에 서로 다른 관리자를 중지하는 두 트랜잭션이 같은 개수를 읽고 둘 다
            # 통과해버리는 경쟁 상태를 막는다(둘 다 통과하면 활성 관리자가 0명이 될 수
            # 있다). `select ... for update`로 행을 잠그는 방식은 RLS의
            # `admin_can_manage_staff`(관리자만 UPDATE 가능) 때문에 호출자가 관리자가
            # 아닐 때(예: 마지막 관리자 중지를 시도하는 접수직원) 잠글 행 자체가 RLS에
            # 걸러져 카운트가 0이 되어버리는 오류를 낳는다. RLS의 영향을 받지 않는
            # 트랜잭션 단위 advisory lock으로 이 검사 구간 전체를 직렬화한다.
            await c.execute("select pg_advisory_xact_lock(hashtext('staff_deactivate_admin_guard'))")
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


def _auth_users_by_id() -> dict[str, object]:
    """[STAFF-LIST-09] 로그인·초대 시각은 auth.users가 원본이다. 목록 한 번 조회로 한꺼번에 받는다.

    ⛔ 직원마다 get_user_by_id를 부르지 않는다 — 20명 병원에서 목록 한 번에 21번 호출이 된다.
    """
    admin = get_admin_client()
    result = admin.auth.admin.list_users()
    users = getattr(result, "users", result)
    return {str(user.id): user for user in users}


async def list_staff(staff: StaffContext, conn=None) -> list[dict]:
    async def _run(c):
        # [STAFF-LIST-02] 이름이 같아도 재조회 사이 순서가 안 흔들리게 고유 ID를 마지막 키로.
        rows = await c.fetch(
            """
            select id, auth_user_id, name, role, department_id, is_active,
                   specialty, bio, photo_url, calendar_color_index
            from staff
            order by is_active desc, name, id
            """
        )
        return [dict(row) for row in rows]

    if conn is not None:
        rows = await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            rows = await _run(c)

    # [STAFF-LIST-07·08·09] 로그인 이력·초대 시각을 auth.users에서 한 번에 합쳐 내려준다.
    users = _auth_users_by_id()
    for row in rows:
        user = users.get(str(row["auth_user_id"]))
        row["last_sign_in_at"] = getattr(user, "last_sign_in_at", None) if user is not None else None
        row["invited_at"] = getattr(user, "invited_at", None) if user is not None else None
        row.pop("auth_user_id", None)
    return rows


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
