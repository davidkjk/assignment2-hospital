from datetime import datetime
from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import acquire_as


async def create_draft_record(
    appointment_id: UUID,
    symptoms: str | None,
    diagnosis: str | None,
    treatment: str | None,
    patient_visible_notes: str | None,
    staff: StaffContext,
    conn=None,
) -> UUID:
    async def _run(c) -> UUID:
        return await c.fetchval(
            """
            insert into medical_records (appointment_id, doctor_id, symptoms, diagnosis, treatment, patient_visible_notes)
            values ($1, $2, $3, $4, $5, $6)
            returning id
            """,
            appointment_id, staff.id, symptoms, diagnosis, treatment, patient_visible_notes,
        )

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def update_draft_record(
    record_id: UUID,
    symptoms: str | None,
    diagnosis: str | None,
    treatment: str | None,
    patient_visible_notes: str | None,
    expected_updated_at: datetime,
    staff: StaffContext,
    conn=None,
) -> None:
    async def _run(c) -> str:
        try:
            return await c.execute(
                """
                update medical_records
                set symptoms = $1, diagnosis = $2, treatment = $3, patient_visible_notes = $4, updated_at = now()
                where id = $5 and updated_at = $6
                """,
                symptoms, diagnosis, treatment, patient_visible_notes, record_id, expected_updated_at,
            )
        except asyncpg.PostgresError as exc:
            # 완료된 기록은 block_direct_update_of_completed_records 트리거가 거부한다.
            raise AppError(str(exc), status_code=400) from exc

    if conn is not None:
        result = await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            result = await _run(c)

    if result == "UPDATE 0":
        raise AppError("다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.", status_code=409)


async def complete_record(
    record_id: UUID,
    expected_updated_at: datetime,
    staff: StaffContext,
    conn=None,
) -> None:
    async def _run(c) -> str:
        return await c.execute(
            "update medical_records set is_completed = true, updated_at = now() where id = $1 and updated_at = $2",
            record_id, expected_updated_at,
        )

    if conn is not None:
        result = await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            result = await _run(c)

    if result == "UPDATE 0":
        raise AppError("다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.", status_code=409)


async def revise_completed_record(
    record_id: UUID,
    symptoms: str | None,
    diagnosis: str | None,
    treatment: str | None,
    patient_visible_notes: str | None,
    reason: str,
    expected_updated_at: datetime,
    staff: StaffContext,
    conn=None,
) -> None:
    async def _run(c) -> None:
        try:
            await c.execute(
                "select revise_medical_record($1, $2, $3, $4, $5, $6, $7)",
                record_id, symptoms, diagnosis, treatment, patient_visible_notes, reason, expected_updated_at,
            )
        except asyncpg.PostgresError as exc:
            # revise_medical_record() RPC의 예외 메시지는 이미 한글 안내문이다.
            raise AppError(str(exc), status_code=400) from exc

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)
