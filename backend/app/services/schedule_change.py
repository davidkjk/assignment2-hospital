"""Schedule-change impact calculation and handling stamps.

The impact list is deliberately derived from the current appointment and
schedule data.  ``schedule_change_acks`` records only the fact that a staff
member handled one particular cause; it is not an impact flag.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Mapping
from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import acquire_as


ACTIVE_STATUSES = ("예약신청", "예약확정", "도착", "진료대기", "진료중")
HANDLING_ACTIONS = {"rescheduled", "cancelled", "kept"}
KST = timezone(timedelta(hours=9))
DEFAULT_APPOINTMENT_MINUTES = 20
KOREAN_WEEKDAYS = ("월", "화", "수", "목", "금", "토", "일")


class AffectedAppointment(dict):
    """A dict-shaped service result that also supports ``row.id`` callers."""

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


def _value(value: Any, *names: str, default: Any = None) -> Any:
    if isinstance(value, Mapping):
        for name in names:
            if name in value:
                return value[name]
        return default
    for name in names:
        try:
            return value[name]
        except (KeyError, IndexError, TypeError, AttributeError):
            pass
        try:
            return getattr(value, name)
        except AttributeError:
            pass
    return default


def _as_uuid(value: Any) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _as_time(value: Any) -> time | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.timetz().replace(tzinfo=None)
    if isinstance(value, time):
        return value.replace(tzinfo=None)
    try:
        return time.fromisoformat(str(value))
    except ValueError:
        return None


def _local_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(KST).replace(tzinfo=None)


def _db_timestamp(value: datetime) -> datetime:
    """Make a naive local appointment time explicit before writing timestamptz."""
    if value.tzinfo is None:
        return value.replace(tzinfo=KST)
    return value


def _phone_mask(phone: str | None) -> str | None:
    if phone is None:
        return None
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    if len(digits) < 8:
        return "*" * len(digits)
    return f"{digits[:3]}-****-{digits[-4:]}"


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


async def _table_columns(conn, table_name: str) -> set[str]:
    rows = await conn.fetch(
        """
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = $1
        """,
        table_name,
    )
    return {row["column_name"] for row in rows}


async def _db_today(conn) -> date:
    value = await conn.fetchval("select current_date")
    return value if isinstance(value, date) else date.today()


async def _fetch_appointments(conn) -> list[dict[str, Any]]:
    """Read appointments using the current slot-backed schema or later time columns."""
    columns = await _table_columns(conn, "appointments")
    has_start_at = "start_at" in columns
    has_end_at = "end_at" in columns
    start_select = "a.start_at" if has_start_at else "null::timestamptz"
    end_select = "a.end_at" if has_end_at else "null::timestamptz"
    rows = await conn.fetch(
        f"""
        select a.id, a.doctor_id, a.status, a.slot_id, a.reason,
               p.name as patient_name, p.phone as patient_phone,
               s.slot_date, s.start_time,
               {start_select} as appointment_start_at,
               {end_select} as appointment_end_at
        from appointments a
        left join appointment_slots s on s.id = a.slot_id
        left join patients p on p.id = a.for_patient_id
        where a.status = any($1::text[])
        order by coalesce({start_select}, s.slot_date + s.start_time), a.id
        """,
        list(ACTIVE_STATUSES),
    )
    return [dict(row) for row in rows]


def _appointment_times(row: Mapping[str, Any]) -> tuple[datetime | None, datetime | None]:
    start = _local_datetime(row.get("appointment_start_at"))
    end = _local_datetime(row.get("appointment_end_at"))
    if start is None and row.get("slot_date") is not None and row.get("start_time") is not None:
        start = datetime.combine(row["slot_date"], row["start_time"])
    if end is None and start is not None:
        end = start + timedelta(minutes=DEFAULT_APPOINTMENT_MINUTES)
    return start, end


def _normalise_rule(raw: Any, *, kind: str = "schedule") -> dict[str, Any] | None:
    doctor_value = _value(raw, "doctor_id", "doctor", default=None)
    if isinstance(doctor_value, StaffContext):
        doctor_value = doctor_value.id
    doctor_id = _as_uuid(doctor_value)
    exception_id = _as_uuid(_value(raw, "id", "exception_id", default=None))
    exception_date = _as_date(
        _value(raw, "exception_date", "date", "day", "closed_date", default=None)
    )
    if kind == "inactive":
        return {
            "id": doctor_id,
            "doctor_id": doctor_id,
            "exception_date": None,
            "is_closed": True,
            "start_time": None,
            "end_time": None,
            "kind": kind,
        } if doctor_id is not None else None

    if exception_date is None:
        return None
    is_closed = _value(raw, "is_closed", "is_day_off", "closed", default=None)
    start_time = _as_time(
        _value(raw, "override_start_time", "start_time", "start", default=None)
    )
    end_time = _as_time(
        _value(raw, "override_end_time", "end_time", "end", default=None)
    )
    if is_closed is None:
        is_closed = start_time is None or end_time is None
    return {
        "id": exception_id,
        "doctor_id": doctor_id,
        "exception_date": exception_date,
        "is_closed": bool(is_closed),
        "start_time": start_time,
        "end_time": end_time,
        "kind": kind,
    }


async def _fetch_schedule_rules(conn, exception_id: UUID | None = None) -> list[dict[str, Any]]:
    try:
        if exception_id is None:
            rows = await conn.fetch(
                """
                select id, doctor_id, exception_date, is_closed,
                       override_start_time, override_end_time
                from doctor_schedule_exceptions
                order by exception_date, id
                """
            )
        else:
            rows = await conn.fetch(
                """
                select id, doctor_id, exception_date, is_closed,
                       override_start_time, override_end_time
                from doctor_schedule_exceptions
                where id = $1
                """,
                exception_id,
            )
    except asyncpg.UndefinedTableError:
        return []
    return [rule for row in rows if (rule := _normalise_rule(row)) is not None]


async def _relation_exists(conn, relation_name: str) -> bool:
    return bool(await conn.fetchval("select to_regclass($1)", f"public.{relation_name}"))


async def _fetch_hospital_rules(conn) -> list[dict[str, Any]]:
    """Read the later hospital-closure table when it exists, without requiring it now."""
    if not await _relation_exists(conn, "hospital_closures"):
        return []
    columns = await _table_columns(conn, "hospital_closures")
    date_column = next(
        (name for name in ("closure_date", "closed_date", "exception_date", "date") if name in columns),
        None,
    )
    if date_column is None:
        return []
    id_select = "id" if "id" in columns else "null::uuid"
    closed_select = "is_closed" if "is_closed" in columns else "true"
    start_column = next(
        (name for name in ("start_time", "override_start_time", "open_time") if name in columns),
        None,
    )
    end_column = next(
        (name for name in ("end_time", "override_end_time", "close_time") if name in columns),
        None,
    )
    start_select = _quote_identifier(start_column) if start_column else "null::time"
    end_select = _quote_identifier(end_column) if end_column else "null::time"
    order_by = _quote_identifier(date_column)
    if "id" in columns:
        order_by += ', "id"'
    rows = await conn.fetch(
        f"""
        select {id_select} as id,
               {_quote_identifier(date_column)} as exception_date,
               {closed_select} as is_closed,
               {start_select} as override_start_time,
               {end_select} as override_end_time
        from public.hospital_closures
        order by {order_by}
        """
    )
    return [rule for row in rows if (rule := _normalise_rule(row, kind="hospital")) is not None]


async def _fetch_inactive_doctors(conn) -> set[UUID]:
    rows = await conn.fetch(
        "select id from staff where role = 'doctor' and not is_active"
    )
    return {row["id"] for row in rows}


async def _fetch_acknowledged(conn, appointment_ids: list[UUID]) -> dict[UUID, set[UUID]]:
    if not appointment_ids:
        return {}
    rows = await conn.fetch(
        """
        select appointment_id, exception_id
        from schedule_change_acks
        where appointment_id = any($1::uuid[])
        """,
        appointment_ids,
    )
    acknowledged: dict[UUID, set[UUID]] = {}
    for row in rows:
        acknowledged.setdefault(row["appointment_id"], set()).add(row["exception_id"])
    return acknowledged


def _rule_applies(row: Mapping[str, Any], rule: Mapping[str, Any]) -> bool:
    if rule.get("doctor_id") is not None and rule["doctor_id"] != row["doctor_id"]:
        return False
    start_at, _ = _appointment_times(row)
    if start_at is None:
        return False
    exception_date = rule.get("exception_date")
    if exception_date is not None and start_at.date() != exception_date:
        return False
    if rule.get("is_closed"):
        return True
    start_time = rule.get("start_time")
    end_time = rule.get("end_time")
    if start_time is None or end_time is None:
        return False
    appointment_time = start_at.time()
    return appointment_time < start_time or appointment_time >= end_time


def _causes_for_row(
    row: Mapping[str, Any], rules: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    start_at, _ = _appointment_times(row)
    appointment_date = start_at.date() if start_at is not None else None
    specific_dates = {
        rule["exception_date"]
        for rule in rules
        if rule.get("kind") == "schedule"
        and rule.get("doctor_id") == row["doctor_id"]
        and rule.get("exception_date") == appointment_date
    }
    matching = [rule for rule in rules if _rule_applies(row, rule)]
    # A doctor-specific exception overrides a hospital closure for that doctor
    # only.  Other doctors still inherit the hospital-wide closure.
    return [
        rule
        for rule in matching
        if not (
            rule.get("kind") == "hospital"
            and rule.get("exception_date") in specific_dates
        )
    ]


def _effective_rules(
    schedule_rules: list[dict[str, Any]], hospital_rules: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    return schedule_rules + hospital_rules


def _candidate_rules(candidate_exception: Any) -> list[dict[str, Any]]:
    if isinstance(candidate_exception, (list, tuple, set)):
        candidates = candidate_exception
    else:
        candidates = [candidate_exception]
    return [
        rule
        for raw in candidates
        if (rule := _normalise_rule(raw)) is not None
    ]


def _weekday_for(value: date | None) -> str | None:
    return KOREAN_WEEKDAYS[value.weekday()] if value is not None else None


def _admin_summary(rows: list[Mapping[str, Any]], rule: Mapping[str, Any]) -> dict[str, Any]:
    times = []
    for row in rows:
        start_at, _ = _appointment_times(row)
        if start_at is None:
            continue
        times.append({"date": start_at.date().isoformat(), "time": start_at.strftime("%H:%M")})
    times.sort(key=lambda value: (value["date"], value["time"]))
    rule_date = rule.get("exception_date")
    if rule_date is None and rows:
        first_start, _ = _appointment_times(rows[0])
        rule_date = first_start.date() if first_start is not None else None
    return {"count": len(rows), "times": times, "weekday": _weekday_for(rule_date)}


def _staff_row(row: Mapping[str, Any], cause_ids: list[UUID | None]) -> AffectedAppointment:
    start_at, end_at = _appointment_times(row)
    exception_id = next((value for value in cause_ids if value is not None), None)
    return AffectedAppointment(
        id=row["id"],
        appointment_id=row["id"],
        doctor_id=row["doctor_id"],
        status=row["status"],
        reason=row.get("reason"),
        patient_name=row.get("patient_name"),
        masked_phone=_phone_mask(row.get("patient_phone")),
        slot_date=start_at.date() if start_at is not None else None,
        start_time=start_at.time() if start_at is not None else None,
        start_at=start_at,
        end_at=end_at,
        exception_id=exception_id,
    )


async def list_affected_appointments(
    conn,
    *,
    candidate_exception=None,
    exception_id=None,
    deactivating_doctor_id=None,
    for_role="staff",
) -> list[AffectedAppointment | dict[str, Any]]:
    """Return future, non-terminal appointments affected by current causes.

    Schedule exceptions and inactive doctors are causes.  A cause disappears
    from the result only when its own handling stamp exists; no stamp is
    generated by this read operation.
    """
    today = await _db_today(conn)
    appointments = await _fetch_appointments(conn)
    appointments = [
        row
        for row in appointments
        if (start := _appointment_times(row)[0]) is not None and start.date() >= today
    ]

    candidate_supplied = candidate_exception is not None
    requested_exception_id = _as_uuid(exception_id)
    if candidate_supplied:
        schedule_rules = _candidate_rules(candidate_exception)
        hospital_rules: list[dict[str, Any]] = []
    else:
        schedule_rules = await _fetch_schedule_rules(conn, requested_exception_id)
        hospital_rules = [] if requested_exception_id is not None else await _fetch_hospital_rules(conn)

    rules = _effective_rules(schedule_rules, hospital_rules)
    inactive_ids: set[UUID] = set()
    deactivating_id = _as_uuid(deactivating_doctor_id)
    if requested_exception_id is None and not candidate_supplied:
        inactive_ids = await _fetch_inactive_doctors(conn)
    if requested_exception_id is None and deactivating_id is not None:
        inactive_ids.add(deactivating_id)
    inactive_rules = [
        _normalise_rule({"doctor_id": doctor_id}, kind="inactive")
        for doctor_id in sorted(inactive_ids, key=str)
    ]
    rules.extend(rule for rule in inactive_rules if rule is not None)

    appointment_ids = [row["id"] for row in appointments]
    acknowledged = await _fetch_acknowledged(conn, appointment_ids)

    matched: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
    for row in appointments:
        causes = _causes_for_row(row, rules)
        if not causes:
            continue
        acked = acknowledged.get(row["id"], set())
        cause_ids = [rule["id"] for rule in causes]
        if cause_ids and all(cause_id is not None and cause_id in acked for cause_id in cause_ids):
            continue
        matched.append((row, causes))

    if for_role != "admin":
        return [
            _staff_row(row, [rule["id"] for rule in causes])
            for row, causes in matched
        ]

    summaries: list[dict[str, Any]] = []
    for rule in rules:
        rule_rows = []
        for row, causes in matched:
            if rule not in causes:
                continue
            rule_rows.append(row)
        if not rule_rows:
            continue
        if rule.get("exception_date") is None:
            by_date: dict[date, list[dict[str, Any]]] = {}
            for row in rule_rows:
                start_at, _ = _appointment_times(row)
                if start_at is not None:
                    by_date.setdefault(start_at.date(), []).append(row)
            for date_rows in by_date.values():
                summaries.append(_admin_summary(date_rows, rule))
        else:
            summaries.append(_admin_summary(rule_rows, rule))
    return summaries


def _staff_id(staff: Any) -> UUID | None:
    if staff is None:
        return None
    value = _value(staff, "id", "staff_id", default=None)
    return _as_uuid(value)


async def mark_change_handled(
    conn,
    appointment_id: UUID,
    exception_id: UUID,
    action: str,
    staff: StaffContext | None = None,
) -> None:
    """Record the staff action for one appointment and one change cause."""
    if action not in HANDLING_ACTIONS:
        raise AppError("일정 변경 처리 방법이 올바르지 않습니다.", status_code=400)
    handled_by = _staff_id(staff)
    if handled_by is None:
        handled_by = _as_uuid(await conn.fetchval("select private.current_staff_id()"))
    if handled_by is None:
        raise AppError("처리한 직원을 확인할 수 없습니다.", status_code=401)

    await conn.execute(
        """
        insert into schedule_change_acks (appointment_id, exception_id, action, handled_by)
        values ($1, $2, $3, $4)
        on conflict (appointment_id, exception_id)
        do update set action = excluded.action,
                      handled_by = excluded.handled_by,
                      handled_at = now()
        """,
        _as_uuid(appointment_id),
        _as_uuid(exception_id),
        action,
        handled_by,
    )


async def _appointment_duration(conn, doctor_id: UUID, start_at: datetime, end_at: datetime | None) -> timedelta:
    if end_at is not None and end_at > start_at:
        return end_at - start_at
    try:
        minutes = await conn.fetchval(
            """
            select slot_duration_minutes
            from doctor_schedule_rules
            where doctor_id = $1 and weekday in ($2, $3)
            order by weekday
            limit 1
            """,
            doctor_id,
            start_at.weekday(),
            (start_at.weekday() + 1) % 7,
        )
    except asyncpg.UndefinedTableError:
        minutes = None
    return timedelta(minutes=int(minutes or DEFAULT_APPOINTMENT_MINUTES))


async def _move_slot(
    conn,
    *,
    appointment_id: UUID,
    doctor_id: UUID,
    old_slot_id: UUID | None,
    new_start_at: datetime,
) -> UUID | None:
    """Keep the legacy slot-backed schema coherent while allowing arbitrary times."""
    new_date = new_start_at.date()
    new_time = new_start_at.time()
    new_slot_id = None
    if old_slot_id is not None:
        current = await conn.fetchrow(
            "select id from appointment_slots where id = $1", old_slot_id
        )
        if current is None:
            old_slot_id = None

    existing = await conn.fetchrow(
        """
        select id, status
        from appointment_slots
        where doctor_id = $1 and slot_date = $2 and start_time = $3
        """,
        doctor_id,
        new_date,
        new_time,
    )
    if existing is not None and existing["id"] != old_slot_id:
        if existing["status"] != "빈시간":
            raise AppError("이미 예약된 시간입니다. 다른 시간을 선택하세요.", status_code=409)
        new_slot_id = existing["id"]
        await conn.execute(
            "update appointment_slots set status = '예약됨' where id = $1", new_slot_id
        )
    elif existing is not None:
        new_slot_id = existing["id"]
    else:
        try:
            new_slot_id = await conn.fetchval(
                """
                insert into appointment_slots (doctor_id, slot_date, start_time, status)
                values ($1, $2, $3, '예약됨')
                returning id
                """,
                doctor_id,
                new_date,
                new_time,
            )
        except asyncpg.UniqueViolationError as exc:
            raise AppError("이미 예약된 시간입니다. 다른 시간을 선택하세요.", status_code=409) from exc

    if old_slot_id is not None and old_slot_id != new_slot_id:
        old_slot = await conn.fetchrow(
            "select doctor_id, slot_date from appointment_slots where id = $1", old_slot_id
        )
        old_status = "빈시간"
        if old_slot is not None:
            try:
                is_closed = await conn.fetchval(
                    """
                    select is_closed
                    from doctor_schedule_exceptions
                    where doctor_id = $1 and exception_date = $2
                    """,
                    old_slot["doctor_id"],
                    old_slot["slot_date"],
                )
                if is_closed:
                    old_status = "휴진"
            except asyncpg.UndefinedTableError:
                pass
        await conn.execute(
            "update appointment_slots set status = $1 where id = $2", old_status, old_slot_id
        )

    await conn.execute("update appointments set slot_id = $1 where id = $2", new_slot_id, appointment_id)
    return new_slot_id


async def reschedule_appointment(
    appointment_id: UUID,
    new_start_at: datetime,
    staff: StaffContext,
    reason: str,
    conn=None,
) -> None:
    """Move an appointment to an arbitrary time without changing its status."""
    if not reason or not reason.strip():
        raise AppError("일정변경 사유를 입력해야 합니다.", status_code=400)
    if not isinstance(new_start_at, datetime):
        try:
            new_start_at = datetime.fromisoformat(str(new_start_at))
        except ValueError as exc:
            raise AppError("새 예약 시간이 올바르지 않습니다.", status_code=400) from exc

    async def _run(c) -> None:
        columns = await _table_columns(c, "appointments")
        has_start_at = "start_at" in columns
        has_end_at = "end_at" in columns
        start_select = "a.start_at" if has_start_at else "null::timestamptz"
        end_select = "a.end_at" if has_end_at else "null::timestamptz"
        row = await c.fetchrow(
            f"""
            select a.id, a.doctor_id, a.slot_id, a.status,
                   {start_select} as appointment_start_at,
                   {end_select} as appointment_end_at,
                   s.slot_date, s.start_time
            from appointments a
            left join appointment_slots s on s.id = a.slot_id
            where a.id = $1
            """,
            _as_uuid(appointment_id),
        )
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        if row["status"] not in ACTIVE_STATUSES:
            raise AppError("진행 중인 예약만 재예약할 수 있습니다.", status_code=400)

        old_start, old_end = _appointment_times(dict(row))
        if old_start is None:
            raise AppError("기존 예약 시간을 확인할 수 없습니다.", status_code=400)
        new_local = _local_datetime(new_start_at)
        duration = await _appointment_duration(c, row["doctor_id"], old_start, old_end)
        new_end = new_local + duration
        await _move_slot(
            c,
            appointment_id=row["id"],
            doctor_id=row["doctor_id"],
            old_slot_id=row["slot_id"],
            new_start_at=new_local,
        )

        old_for_card = _db_timestamp(old_start)
        if has_start_at and has_end_at:
            await c.execute(
                """
                update appointments
                set start_at = $1,
                    end_at = $2,
                    hospital_change_prev_time = $3,
                    hospital_change_kind = 'changed',
                    updated_at = now()
                where id = $4
                """,
                _db_timestamp(new_local),
                _db_timestamp(new_end),
                old_for_card,
                row["id"],
            )
        else:
            await c.execute(
                """
                update appointments
                set hospital_change_prev_time = $1,
                    hospital_change_kind = 'changed',
                    updated_at = now()
                where id = $2
                """,
                old_for_card,
                row["id"],
            )

    if conn is not None:
        await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as acquired:
            await _run(acquired)


async def get_appointment(conn, appointment_id: UUID) -> AffectedAppointment:
    """Small read helper used by the schedule-change flow and focused tests."""
    columns = await _table_columns(conn, "appointments")
    has_start_at = "start_at" in columns
    has_end_at = "end_at" in columns
    start_select = "a.start_at" if has_start_at else "null::timestamptz"
    end_select = "a.end_at" if has_end_at else "null::timestamptz"
    row = await conn.fetchrow(
        f"""
        select a.id, a.doctor_id, a.status, a.slot_id,
               {start_select} as appointment_start_at,
               {end_select} as appointment_end_at,
               s.slot_date, s.start_time
        from appointments a
        left join appointment_slots s on s.id = a.slot_id
        where a.id = $1
        """,
        _as_uuid(appointment_id),
    )
    if row is None:
        raise AppError("예약을 찾을 수 없습니다.", status_code=404)
    start_at, end_at = _appointment_times(dict(row))
    return AffectedAppointment(
        id=row["id"],
        doctor_id=row["doctor_id"],
        status=row["status"],
        slot_id=row["slot_id"],
        start_at=start_at,
        end_at=end_at,
    )
