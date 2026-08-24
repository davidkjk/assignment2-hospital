"""Service functions for doctors' personal quick phrases.

The database policy is the final authorization boundary, but the service also
keeps the owner check in its queries.  That makes a phrase belonging to a
different doctor look like a missing resource to update/delete callers and
prevents the API from accidentally exposing another doctor's phrases.
"""

from collections.abc import Mapping
from typing import Any, Awaitable, Callable
from uuid import UUID

import asyncpg

from app.core.errors import AppError, pg_error_to_app_error
from app.core.security import StaffContext
from app.db.pool import acquire_as


class ServiceError(AppError):
    """A client-safe service failure that is distinct from an empty result."""


def _is_staff(value: Any) -> bool:
    return isinstance(value, StaffContext) or (
        isinstance(value, Mapping) and ("staff_id" in value or "id" in value)
    )


def _staff_id(staff: StaffContext | Mapping[str, Any] | None) -> UUID | None:
    if staff is None:
        return None
    value = staff.id if isinstance(staff, StaffContext) else staff.get("staff_id", staff.get("id"))
    if value is None:
        return None
    return value if isinstance(value, UUID) else UUID(str(value))


def _staff_role(staff: StaffContext | Mapping[str, Any] | None) -> str | None:
    if staff is None:
        return None
    return staff.role if isinstance(staff, StaffContext) else staff.get("role")


def _auth_user_id(staff: StaffContext | Mapping[str, Any] | None) -> UUID | None:
    if staff is None:
        return None
    value = staff.auth_user_id if isinstance(staff, StaffContext) else staff.get("auth_user_id")
    if value is None:
        return None
    return value if isinstance(value, UUID) else UUID(str(value))


def _as_uuid(value: Any, field_name: str) -> UUID:
    if value is None:
        raise ServiceError(f"{field_name}이(가) 필요합니다.")
    try:
        return value if isinstance(value, UUID) else UUID(str(value))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ServiceError(f"{field_name}이(가) 올바르지 않습니다.") from exc


def _looks_like_connection(value: Any) -> bool:
    return value is not None and not isinstance(value, (UUID, str, bytes)) and not _is_staff(value)


def _require_doctor(staff: StaffContext | Mapping[str, Any] | None, owner_id: UUID | None = None) -> UUID:
    if _staff_role(staff) != "doctor":
        raise AppError("의사만 진료문구를 관리할 수 있습니다.", status_code=403)
    current_id = _staff_id(staff)
    if current_id is None:
        raise ServiceError("직원 정보를 확인할 수 없습니다.")
    if owner_id is not None and current_id != owner_id:
        raise AppError("본인 문구만 관리할 수 있습니다.", status_code=403)
    return current_id


async def _with_connection(
    conn: Any,
    staff: StaffContext | Mapping[str, Any] | None,
    feature: str,
    operation: Callable[[Any], Awaitable[Any]],
    auth_user_id: UUID | None = None,
) -> Any:
    async def run(c: Any) -> Any:
        try:
            return await operation(c)
        except asyncpg.PostgresError as exc:
            app_error = await pg_error_to_app_error(exc, feature)
            raise ServiceError(app_error.message, status_code=app_error.status_code) from exc

    if conn is not None:
        return await run(conn)

    auth_user_id = auth_user_id or _auth_user_id(staff)
    if auth_user_id is None:
        raise ServiceError("인증된 직원 정보가 필요합니다.")
    async with acquire_as(str(auth_user_id)) as acquired:
        return await run(acquired)


def _parse_list_args(
    args: tuple[Any, ...],
    doctor_id: Any,
    staff: StaffContext | Mapping[str, Any] | None,
    conn: Any,
) -> tuple[Any, StaffContext | Mapping[str, Any] | None, Any]:
    """Accept the project-style order and the conn-first test helper order."""
    values = list(args)
    if values and _looks_like_connection(values[0]):
        if conn is None:
            conn = values.pop(0)
        else:
            values.pop(0)
    elif values and doctor_id is None:
        doctor_id = values.pop(0)

    if values and doctor_id is None:
        doctor_id = values.pop(0)
    if values and staff is None:
        staff = values.pop(0)
    if values and conn is None:
        conn = values.pop(0)
    return doctor_id, staff, conn


async def list_phrases(
    *args: Any,
    doctor_id: UUID | None = None,
    staff: StaffContext | Mapping[str, Any] | None = None,
    conn: Any = None,
) -> list[dict]:
    """Return phrases for one doctor in creation order.

    ``doctor_id`` is required even when the result is empty: an empty list is a
    valid zero-result response, while a missing target is a service error.
    A doctor caller can only ask for their own id.  Reception/admin callers may
    read a specified doctor's phrases, matching the existing read RLS policy.
    """
    doctor_id, staff, conn = _parse_list_args(args, doctor_id, staff, conn)
    target_id = _as_uuid(doctor_id, "의사")
    if _staff_role(staff) == "doctor":
        _require_doctor(staff, target_id)

    async def query(c: Any) -> list[dict]:
        rows = await c.fetch(
            """
            select id, text
            from doctor_quick_phrases
            where doctor_id = $1
            order by created_at, id
            """,
            target_id,
        )
        return [dict(row) for row in rows]

    return await _with_connection(conn, staff, "doctor_phrases.list", query)


def _parse_add_args(
    args: tuple[Any, ...],
    doctor: StaffContext | Mapping[str, Any] | UUID | None,
    doctor_id: UUID | None,
    text: str | None,
    staff: StaffContext | Mapping[str, Any] | None,
    conn: Any,
) -> tuple[Any, Any, Any, Any, Any]:
    values = list(args)
    if values and _looks_like_connection(values[0]):
        if conn is None:
            conn = values.pop(0)
        else:
            values.pop(0)
    elif values and doctor is None and doctor_id is None:
        doctor = values.pop(0)

    if values and text is None:
        text = values.pop(0)
    if values and staff is None and _is_staff(values[0]):
        staff = values.pop(0)
    if values and conn is None:
        conn = values.pop(0)
    return doctor, doctor_id, text, staff, conn


async def add_phrase(
    *args: Any,
    doctor: StaffContext | Mapping[str, Any] | UUID | None = None,
    doctor_id: UUID | None = None,
    text: str | None = None,
    staff: StaffContext | Mapping[str, Any] | None = None,
    conn: Any = None,
) -> UUID:
    """Create a phrase owned by the authenticated doctor and return its id."""
    doctor, doctor_id, text, staff, conn = _parse_add_args(
        args, doctor, doctor_id, text, staff, conn,
    )
    if staff is None and _is_staff(doctor):
        staff = doctor  # type: ignore[assignment]
    owner_id = _staff_id(doctor) if _is_staff(doctor) else doctor_id
    owner_id = _as_uuid(owner_id, "의사")
    _require_doctor(staff, owner_id)
    if text is None or not text.strip():
        raise AppError("진료문구를 입력해 주세요.", status_code=400)

    async def insert(c: Any) -> UUID:
        return await c.fetchval(
            """
            insert into doctor_quick_phrases (doctor_id, text)
            values ($1, $2)
            returning id
            """,
            owner_id,
            text,
        )

    return await _with_connection(conn, staff, "doctor_phrases.add", insert)


async def create_phrase(
    doctor_id: UUID,
    text: str,
    staff: StaffContext | Mapping[str, Any],
    conn: Any = None,
) -> UUID:
    """Compatibility name for callers using the original Task 3 interface."""
    return await add_phrase(doctor_id=doctor_id, text=text, staff=staff, conn=conn)


def _parse_mutation_args(
    args: tuple[Any, ...],
    phrase_id: UUID | None,
    text: str | None,
    staff: StaffContext | Mapping[str, Any] | None,
    conn: Any,
) -> tuple[Any, Any, Any, Any]:
    values = list(args)
    if values and _looks_like_connection(values[0]):
        if conn is None:
            conn = values.pop(0)
        else:
            values.pop(0)
    if values and phrase_id is None:
        phrase_id = values.pop(0)

    if values and phrase_id is None:
        phrase_id = values.pop(0)
    if values and text is None:
        text = values.pop(0)
    if values and staff is None and _is_staff(values[0]):
        staff = values.pop(0)
    if values and conn is None:
        conn = values.pop(0)
    return phrase_id, text, staff, conn


async def update_phrase(
    *args: Any,
    phrase_id: UUID | None = None,
    text: str | None = None,
    staff: StaffContext | Mapping[str, Any] | None = None,
    conn: Any = None,
) -> dict:
    """Replace one phrase when it belongs to the authenticated doctor."""
    phrase_id, text, staff, conn = _parse_mutation_args(args, phrase_id, text, staff, conn)
    target_id = _as_uuid(phrase_id, "문구")
    owner_id = _require_doctor(staff)
    if text is None or not text.strip():
        raise AppError("진료문구를 입력해 주세요.", status_code=400)

    async def update(c: Any) -> dict:
        row = await c.fetchrow(
            """
            update doctor_quick_phrases
            set text = $1
            where id = $2 and doctor_id = $3
            returning id, text
            """,
            text,
            target_id,
            owner_id,
        )
        if row is None:
            raise AppError("문구를 찾을 수 없거나 수정 권한이 없습니다.", status_code=404)
        return dict(row)

    return await _with_connection(conn, staff, "doctor_phrases.update", update)


async def delete_phrase(
    *args: Any,
    phrase_id: UUID | None = None,
    staff: StaffContext | Mapping[str, Any] | None = None,
    conn: Any = None,
) -> None:
    """Delete one phrase when it belongs to the authenticated doctor."""
    phrase_id, _unused_text, staff, conn = _parse_mutation_args(args, phrase_id, None, staff, conn)
    target_id = _as_uuid(phrase_id, "문구")
    owner_id = _require_doctor(staff)

    async def delete(c: Any) -> None:
        row = await c.fetchrow(
            """
            delete from doctor_quick_phrases
            where id = $1 and doctor_id = $2
            returning id
            """,
            target_id,
            owner_id,
        )
        if row is None:
            raise AppError("문구를 찾을 수 없거나 삭제 권한이 없습니다.", status_code=404)

    await _with_connection(conn, staff, "doctor_phrases.delete", delete)


async def get_me(
    *args: Any,
    auth_user_id: UUID | str | None = None,
    conn: Any = None,
) -> dict:
    """Return the small identity payload used by the staff sidebar."""
    values = list(args)
    if values and _looks_like_connection(values[0]):
        if conn is None:
            conn = values.pop(0)
        else:
            values.pop(0)
    elif values and auth_user_id is None:
        auth_user_id = values.pop(0)
    if values and auth_user_id is None:
        auth_user_id = values.pop(0)

    user_id = _as_uuid(auth_user_id, "인증 사용자")

    async def query(c: Any) -> dict:
        row = await c.fetchrow(
            """
            select id, name, role, department_id
            from staff
            where auth_user_id = $1 and is_active
            """,
            user_id,
        )
        if row is None:
            raise ServiceError("직원 정보를 찾을 수 없습니다.", status_code=404)
        return dict(row)

    return await _with_connection(conn, None, "me.read", query, auth_user_id=user_id)
