import json
from datetime import datetime
from uuid import UUID

import asyncpg

from app.core.errors import AppError, pg_error_to_app_error
from app.core.security import StaffContext
from app.db.pool import acquire_as
from app.services import audit_service


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
        try:
            return await c.fetchval(
                """
                insert into medical_records (appointment_id, doctor_id, symptoms, diagnosis, treatment, patient_visible_notes)
                values ($1, $2, $3, $4, $5, $6)
                returning id
                """,
                appointment_id, staff.id, symptoms, diagnosis, treatment, patient_visible_notes,
            )
        except asyncpg.PostgresError as exc:
            # enforce_medical_record_doctor_match 트리거의 한글 안내(P0…)는 그대로,
            # 그 밖의 드라이버 오류는 로그+고정 문구로.
            raise (await pg_error_to_app_error(exc, "medical_record.create_draft")) from exc

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def get_record(appointment_id: UUID, staff: StaffContext, conn=None) -> dict | None:
    """[정합성 검토 R5-08] 진료기록 원문 조회 — RLS(doctor_can_view_appointment 기반)가 최종
    접근 범위를 강제하므로, 담당 아닌 의사가 호출하면 row가 None으로 반환된다."""
    async def _run(c) -> dict | None:
        row = await c.fetchrow(
            """
            select mr.id, mr.appointment_id, mr.doctor_id, mr.symptoms, mr.diagnosis, mr.treatment,
                   mr.patient_visible_notes, mr.is_completed, mr.updated_at, mr.created_at,
                   a.for_patient_id
            from medical_records mr
            join appointments a on a.id = mr.appointment_id
            where mr.appointment_id = $1
            """,
            appointment_id,
        )
        if row is None:
            return None
        await audit_service.log_access(row["for_patient_id"], "medical_record", staff, conn=c)
        return {
            "id": row["id"],
            "appointment_id": row["appointment_id"],
            "doctor_id": row["doctor_id"],
            "symptoms": row["symptoms"],
            "diagnosis": row["diagnosis"],
            "treatment": row["treatment"],
            "patient_visible_notes": row["patient_visible_notes"],
            "is_completed": row["is_completed"],
            "updated_at": row["updated_at"],
            "created_at": row["created_at"],
        }

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def list_revisions(record_id: UUID, staff: StaffContext, conn=None) -> list[dict]:
    async def _run(c) -> list[dict]:
        rows = await c.fetch(
            """
            select id, record_id, previous_content, revised_by, reason, revised_at
            from medical_record_revisions
            where record_id = $1
            order by revised_at desc
            """,
            record_id,
        )
        return [{**dict(row), "previous_content": json.loads(row["previous_content"])} for row in rows]

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
            # 트리거의 한글 안내(P0…)는 그대로, 그 밖의 드라이버 오류는 로그+고정 문구로.
            raise (await pg_error_to_app_error(exc, "medical_record.update_draft")) from exc

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
            # revise_medical_record() RPC의 한글 안내(P0…)는 그대로 노출하고, P0003
            # (낙관적 잠금 충돌)은 다른 수정 경로와 같은 409로 맞춘다. 그 밖의 드라이버
            # 오류는 원문을 로그에만 남기고 고정 문구로 바꾼다.
            raise (await pg_error_to_app_error(exc, "medical_record.revise")) from exc

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)
