import hashlib
import logging
from uuid import UUID

from asyncpg.exceptions import ForeignKeyViolationError

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.admin_client import get_admin_client
from app.db.pool import acquire_as
from app.services.schedule_change import list_affected_appointments

logger = logging.getLogger(__name__)

# [STAFF-DEACT / 2026-09-07] 중지 시 세션 무효화용 ban 기간(~100년 = 사실상 영구).
# 재활성화(G-04, 미구현)를 붙일 땐 ban_duration="none"으로 함께 풀어야 한다.
_DEACTIVATE_BAN_DURATION = "876000h"

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


def _send_invite_email(admin, email: str, redirect_to: str | None):
    """초대 이메일 한 통. redirect_to가 있으면 초대 수락 링크가 그 직원웹 origin으로 돌아온다
    (라우터가 요청 origin에서 계산). 없으면 옛 동작 그대로 Supabase Site URL로 폴백한다."""
    if redirect_to:
        return admin.auth.admin.invite_user_by_email(email, {"redirect_to": redirect_to})
    return admin.auth.admin.invite_user_by_email(email)


def _send_password_setup_email(admin, email: str, redirect_to: str | None):
    """이미 계정이 있는 직원에게 '비밀번호 설정' 링크를 다시 보낸다(재초대).

    재초대는 '초대 다시'(invite_user_by_email)가 아니다 — 초대는 계정 생성과 한 덩어리라,
    초대만 받고 아직 수락 안 한 계정에도 email_exists(422)로 막힌다. 대신 복구(recovery)
    메일을 보내면 링크가 같은 '비밀번호 설정' 화면(/reset-password/new — 복구·초대 공용)으로
    가고, 계정 유무와 무관하게 동작한다(auth_staff의 비밀번호 재설정과 같은 경로)."""
    if redirect_to:
        return admin.auth.reset_password_for_email(email, {"redirect_to": redirect_to})
    return admin.auth.reset_password_for_email(email)


async def _create_staff_row(
    auth_user_id: UUID,
    name: str,
    role: str,
    department_id: UUID | None,
    invited_by: StaffContext,
    conn,
) -> UUID:
    """staff 행을 만든다(의사면 캘린더 색 자동 배정 — CAL-COLOR-08). invite_staff의 정상 경로와
    고아 계정 구제 경로가 같은 삽입을 공유한다."""
    async def _run(c):
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


def _find_auth_user_by_email(admin, email: str):
    """auth.users에서 이메일로 계정을 찾는다. SDK에 이메일 단건 조회가 없어 목록에서 고른다
    (20명 병원 규모라 목록 한 번으로 충분 — _auth_users_by_id와 같은 패턴). 초대가 '이미 있는
    이메일'(422)을 던졌을 때 그 실제 계정을 되찾아 고아 여부를 판단하는 데 쓴다."""
    result = admin.auth.admin.list_users()
    users = getattr(result, "users", result)
    target = (email or "").strip().lower()
    for user in users:
        if ((getattr(user, "email", None) or "").strip().lower()) == target:
            return user
    return None


async def _staff_row_exists(auth_user_id: UUID, requested_by: StaffContext, conn) -> bool:
    async def _run(c):
        return await c.fetchval("select 1 from staff where auth_user_id = $1", auth_user_id)

    if conn is not None:
        return (await _run(conn)) is not None
    async with acquire_as(str(requested_by.auth_user_id)) as c:
        return (await _run(c)) is not None


def _is_rate_limit_error(exc) -> bool:
    status = getattr(exc, "status", None)
    code = getattr(exc, "code", None)
    return status == 429 or (isinstance(code, str) and code.endswith("rate_limit"))


def _is_already_registered_error(exc) -> bool:
    status = getattr(exc, "status", None)
    code = getattr(exc, "code", None)
    return status == 422 or code in ("email_exists", "user_already_exists")


async def _recover_or_explain_invite_failure(
    exc,
    email: str,
    name: str,
    role: str,
    department_id: UUID | None,
    invited_by: StaffContext,
    redirect_to: str | None,
    conn,
) -> UUID:
    """초대 이메일 발송이 실패했을 때, 막다른 500 대신 원인을 사람 말로 돌려주고 고칠 수 있으면 잇는다.

    - 발송 한도(429): 잠시 후 다시 안내(같은 시간에 여러 명을 초대하면 Supabase 이메일 서버가 잠깐 쉰다).
    - 이미 있는 이메일(422): auth.users엔 있는데 staff 행이 없으면 = 이전 초대가 중간에 끊긴 '고아
      계정' → staff 행을 이어붙이고 초대를 새로 보낸다(막다른 길 해소). 진짜 등록된 직원이면 그대로 안내.
    - 그 밖의 알 수 없는 오류: 삼키지 않고 위로 던진다 — 전역 핸들러가 추적을 로그로 남기고 500을 낸다.
    """
    if _is_rate_limit_error(exc):
        raise AppError(
            "초대 이메일 발송이 잠시 제한되었습니다. 같은 시간에 여러 명을 초대하면 이메일 서버가 "
            "잠깐 쉬어야 합니다. 몇 분 뒤 다시 시도해 주세요.",
            status_code=429,
        ) from exc

    if _is_already_registered_error(exc):
        admin = get_admin_client()
        existing = _find_auth_user_by_email(admin, email)
        if existing is not None and getattr(existing, "id", None):
            existing_id = UUID(str(existing.id))
            if await _staff_row_exists(existing_id, invited_by, conn):
                raise AppError(
                    "이미 등록된 직원입니다. 직원 목록에서 확인하시고, 초대 링크를 다시 보내려면 그 "
                    "직원의 [재초대]를 눌러 주세요.",
                    status_code=409,
                ) from exc
            # 고아 계정 구제 — 끊겼던 연결을 잇고 초대를 새로 보낸다.
            staff_id = await _create_staff_row(existing_id, name, role, department_id, invited_by, conn)
            try:
                _send_invite_email(admin, email, redirect_to)
            except Exception:
                # 이미 초대를 수락한 계정이면 재발송이 막힐 수 있다 — staff 연결은 이미 됐으니
                # 그 직원은 로그인만 하면 된다(막다른 길 아님).
                pass
            return staff_id
        raise AppError(
            "이미 등록된 이메일이지만 계정을 찾지 못했습니다. 잠시 후 다시 시도하거나 관리자에게 "
            "문의해 주세요.",
            status_code=409,
        ) from exc

    # 분류되지 않은 오류 — 원래대로 위로 던진다(알 수 없는 원인은 추적이 남는 편이 안전하다).
    raise exc


async def invite_staff(
    email: str,
    name: str,
    role: str,
    department_id: UUID | None,
    invited_by: StaffContext,
    redirect_to: str | None = None,
    conn=None,
) -> UUID:
    # [정합성 검토 R3-04] 의사는 소속 진료과가 있어야 예약·슬롯·환자조회 범위(doctor_can_view_patient 등)가
    # 성립한다. 이전에는 이 검사가 StaffAdminPage.tsx(프론트엔드)에만 있어, 프론트를 거치지 않는 직접
    # API 호출(또는 클라이언트 버그)로 소속 없는 의사가 만들어질 수 있었다. 이메일을 실제로 보내기 전에
    # 먼저 검사해 불필요한 초대 발송도 막는다.
    if role == "doctor" and department_id is None:
        raise AppError("의사는 소속 진료과를 선택해야 합니다.", status_code=400)

    admin = get_admin_client()
    try:
        result = _send_invite_email(admin, email, redirect_to)
        auth_user_id = UUID(result.user.id)
    except Exception as exc:
        # 발송 실패를 막다른 500으로 흘리지 않는다(STAFF-INVITE-06~09) — 원인별 안내 + 고아 구제.
        return await _recover_or_explain_invite_failure(
            exc, email, name, role, department_id, invited_by, redirect_to, conn,
        )

    return await _create_staff_row(auth_user_id, name, role, department_id, invited_by, conn)


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

    # [정합성 검토 R1-우선2 재검증 / 2026-09-07 버그수정] 세션 무효화.
    # ⚠️ 예전엔 admin.auth.admin.sign_out(auth_user_id, scope="global")을 썼는데, GoTrue의
    #    admin sign_out은 '사용자의 JWT'를 받는다(user_id가 아니다) — user_id를 넘기면 매번
    #    "invalid JWT"로 500이 났다(is_active는 그 전에 커밋돼 "중지는 됐는데 에러" 상태). GoTrue엔
    #    user_id로 로그아웃하는 admin 엔드포인트가 없다(POST /admin/users/{id}/logout=404 확인).
    #    → ban으로 리프레시 토큰 갱신을 막는다: 현재 access token은 만료까지 유효하나(≤ JWT TTL)
    #    그 뒤 재발급이 막혀 완전히 잠기고, 그 사이 데이터 접근은 RLS의 is_active 게이트가 막는다(두 겹).
    # DB 트랜잭션 밖에서(커밋 뒤) 호출: is_active를 먼저 반영해 RLS가 즉시 막게 한 뒤 세션을 끊는
    #    순서가 더 안전하다. best-effort — admin API가 실패해도 중지(is_active=false)는 유효하게 둔다
    #    (막다른 길·거짓 실패 방지). 목킹 테스트가 실제 GoTrue 계약 위반을 삼켜 이 버그를 못 잡았다.
    try:
        admin = get_admin_client()
        admin.auth.admin.update_user_by_id(
            str(target["auth_user_id"]), {"ban_duration": _DEACTIVATE_BAN_DURATION}
        )
    except Exception:  # noqa: BLE001 — 세션 무효화는 부가 방어. 실패해도 중지는 유효해야 한다.
        logger.warning(
            "deactivate_staff: 세션 무효화(ban) 실패 staff_id=%s — 중지(is_active=false)는 반영됨",
            staff_id,
            exc_info=True,
        )


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


async def resend_invite(
    staff_id: UUID, requested_by: StaffContext, redirect_to: str | None = None, conn=None
) -> None:
    """[정합성 검토 R3-04][STAFF-ROW-03] 초대 이메일이 도착하지 않았거나 링크가 만료된 경우
    관리자가 재발송할 수 있게 한다. `staff`에는 이메일이 없으므로(계정 자체는 `auth.users`가
    소유) auth_user_id로 실제 이메일을 조회한 뒤 '비밀번호 설정'(복구) 메일을 보낸다.

    ⚠️ '초대 다시'(invite_user_by_email)가 아니다 — 초대는 계정 생성과 묶여 있어, 초대만
    받고 아직 수락 안 한 계정에도 email_exists로 막힌다(그래서 예전엔 '이미 수락한 계정'이라는
    엉뚱한 409가 떴다). reset_password_for_email은 계정이 이미 있어도 같은 비번설정 화면으로
    가는 링크를 보내므로 재발송이 정상 동작한다."""
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
        _send_password_setup_email(admin, user.user.email, redirect_to)
    except Exception as exc:
        if _is_rate_limit_error(exc):
            raise AppError(
                "메일 발송이 잠시 제한되었습니다. 몇 분 뒤 다시 시도해 주세요.",
                status_code=429,
            ) from exc
        raise AppError(
            "비밀번호 설정 메일을 다시 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
            status_code=502,
        ) from exc


async def delete_staff(staff_id: UUID, requested_by: StaffContext, conn=None) -> None:
    """[STAFF-DELETE-01] 잘못 초대한 계정을 되돌린다 — **미수락(한 번도 로그인 안 함) + 딸린
    데이터가 없을 때만** 통째로 삭제한다(staff 행 + auth 사용자). 그러면 같은 이메일로 정보를
    다시 기입해 새로 초대할 수 있다.

    ⚠️ 이미 들어온(수락한) 직원이나, 예약·진료기록·일정이 딸린 계정은 삭제하지 않는다 — 그 직원을
    참조하는 기록이 깨진다(staff를 가리키는 FK 대부분이 NO ACTION). 그런 경우는 '중지'를 쓴다.
    (사용자 결정 2026-09-07: 미수락만 삭제.)"""
    if staff_id == requested_by.id:
        raise AppError("본인 계정은 삭제할 수 없습니다.", status_code=409)

    admin = get_admin_client()

    async def _run(c):
        target = await c.fetchrow("select auth_user_id from staff where id = $1", staff_id)
        if target is None:
            raise AppError("대상 직원을 찾을 수 없습니다.", status_code=404)
        # 미수락만 — auth.users의 last_sign_in_at이 원본(수락=최초 로그인 시점에 채워진다).
        user_resp = admin.auth.admin.get_user_by_id(str(target["auth_user_id"]))
        user = getattr(user_resp, "user", user_resp)
        if getattr(user, "last_sign_in_at", None) is not None:
            raise AppError(
                "이미 로그인한 적 있는 직원은 삭제할 수 없습니다. 대신 '중지'를 사용하세요.",
                status_code=409,
            )
        # 딸린 데이터(예약·기록·일정 등)가 있으면 FK가 막는다 — 조용한 0행 삭제가 아니라
        # 친절한 이유로 바꿔 던진다(막다른 길 금지: 해결 경로=중지 안내).
        try:
            deleted = await c.fetchval("delete from staff where id = $1 returning id", staff_id)
        except ForeignKeyViolationError as exc:
            raise AppError(
                "이 직원에게 딸린 기록(예약·일정 등)이 있어 삭제할 수 없습니다. 대신 '중지'를 사용하세요.",
                status_code=409,
            ) from exc
        if deleted is None:
            # RLS로 걸러졌거나 경쟁 삭제 — 관리자만 삭제 가능(admin_can_manage_staff ALL).
            raise AppError("대상 직원을 찾을 수 없습니다.", status_code=404)
        return target

    if conn is not None:
        target = await _run(conn)
    else:
        async with acquire_as(str(requested_by.auth_user_id)) as c:
            target = await _run(c)

    # staff 행이 지워진 뒤 auth 사용자도 지운다(이메일을 비워 재초대 가능). ⚠️ 순서 중요:
    # staff.auth_user_id → auth.users FK(NO ACTION)라 staff를 먼저 지워야 auth 삭제가 막히지 않는다.
    # best-effort — 실패하면 auth 사용자가 남지만, 같은 이메일 재초대 시 orphan 복구 경로가 이어붙인다.
    try:
        admin.auth.admin.delete_user(str(target["auth_user_id"]))
    except Exception:  # noqa: BLE001 — staff 행은 이미 삭제됨. auth 잔존은 재초대가 복구한다.
        logger.warning(
            "delete_staff: auth 사용자 삭제 실패 auth_user_id=%s (staff 행은 삭제됨)",
            target["auth_user_id"],
            exc_info=True,
        )
