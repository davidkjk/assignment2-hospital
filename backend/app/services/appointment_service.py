from datetime import datetime
from uuid import UUID

import asyncpg

from app.core.errors import AppError, pg_error_to_app_error
from app.core.security import StaffContext
from app.db.pool import acquire_as
from app.services.slot_service import book_slot

VALID_TRANSITIONS: dict[str, set[str]] = {
    "예약신청": {"예약확정", "환자취소", "병원취소"},
    "예약확정": {"도착", "환자취소", "병원취소", "예약부도"},
    "도착": {"진료대기"},
    "진료대기": {"진료중"},
    "진료중": {"진료완료"},
}

# ── 되돌리기(갭 #82, UNDO-*) ────────────────────────────────────────────────
# 되돌리기는 「고치는 동작」이지 위험한 동작이 아니라 확인창을 두지 않는다(결정 2026-08-06).
# 오늘 병원 안의 진행 4상태에서 **각각 한 칸 뒤로만** 허용한다. 앞으로 미는 정상 경로
# (VALID_TRANSITIONS)와 역방향 경로를 분리해 두어, 되돌리기가 아닌 경로로는 뒤로 갈 수 없게 한다.
# DB 쪽 방어선은 00037이 private.appointment_status_transitions에 심은 역전이 4행이다(UNDO-IMPL-02).
UNDO_TRANSITIONS: dict[str, str] = {
    "도착": "예약확정",
    "진료대기": "도착",
    "진료중": "진료대기",
    "진료완료": "진료중",
}
# 취소하는 순간 그 시간 자리가 풀려 다른 환자가 이미 예약했을 수 있다(UNDO-SCOPE-02·03).
CANCEL_STATES: set[str] = {"환자취소", "병원취소", "예약부도"}
# 의사가 앞으로 민 구간 — 접수직원·관리자가 「대신」 되돌릴 때만 사유를 받는다(UNDO-ROLE-02).
_DOCTOR_SEGMENT: set[str] = {"진료중", "진료완료"}


def undoable_targets() -> list[str]:
    """[UNDO-SCOPE-01] 되돌릴 수 있는 출발 상태 = 오늘 병원 안의 진행 4상태."""
    return ["도착", "진료대기", "진료중", "진료완료"]


def undo_blocked_hint(status: str) -> str:
    """[UNDO-SCOPE-02][UNDO-SCOPE-03] 막을 때 갈 길을 함께 준다 — 취소된 예약은 「새로 예약」."""
    return "새로 예약"


def can_undo(status: str, role: str) -> bool:
    """[UNDO-ROLE-01][UNDO-ROLE-02] 진행 4상태는 어느 직원이든 되돌릴 수 있다(사유 조건은 별개).

    ⭐ 문이지 내용이 아니다(UNDO-ROLE-03): 상태를 되돌리는 것과 진료기록을 고치는 것은 다른 일이다.
    """
    return status in UNDO_TRANSITIONS


def reason_required(from_status: str, role: str) -> bool:
    """[UNDO-WHY-01][UNDO-WHY-02][UNDO-WHY-03] 사유는 두 경우에만 — 그 밖에는 받지 않는다.

    ① 진료완료 되돌리기: 진료기록이 이미 있으니 왜 되돌리는지 남긴다.
    ② 남의 구간 대신 되돌리기: 접수직원·관리자가 의사 구간(진료중·진료완료)을 되돌릴 때.
    """
    if from_status == "진료완료":
        return True
    if from_status in _DOCTOR_SEGMENT and role in ("receptionist", "admin"):
        return True
    return False

# [정합성 검토 R1-우선3 재검증] 예약 생성 시 초기 상태를 예약 채널(source)별로 서버가 고정한다.
# 1차 정합성 검토 지적: `CreateAppointmentRequest.initial_status`를 클라이언트가 보낸 값 그대로 저장하고
# 있었다(구 라인 4390/4411) — 예를 들어 앱에서 "진료완료"를 초기상태로 보내도 그대로 통과했다.
# 'app'/'chatbot' 채널은 실제로는 이 함수를 거치지 않고 3단계 patient_booking_service.create_booking()의
# _initial_status()(hospital_settings.auto_confirm_app_bookings 기준)가 서버에서 직접 계산한 값만 쓴다 —
# 여기 화이트리스트는 그 계약이 앞으로도 지켜지도록 하는 방어선이다. 'staff' 채널(2단계 전화예약/워크인
# 등록)만 실제로 이 함수를 통해 여러 초기 상태를 선택할 수 있으므로 셋을 넓게 둔다.
ALLOWED_INITIAL_STATUS_BY_SOURCE: dict[str, set[str]] = {
    "staff": {"예약확정", "도착", "진료대기"},  # 전화예약=예약확정, 워크인 즉시 대기열 편입=도착/진료대기
    "app": {"예약신청", "예약확정"},
    "chatbot": {"예약신청", "예약확정"},
}


async def create_appointment(
    staff: StaffContext,
    account_patient_id: UUID,
    for_patient_id: UUID,
    department_id: UUID,
    doctor_id: UUID,
    reason: str,
    source: str,
    initial_status: str,
    slot_id: UUID | None = None,
    walkin_visit_time: datetime | None = None,
    conn=None,
) -> UUID:
    # [정합성 검토 R1-우선3 재검증] 클라이언트가 보낸 source/initial_status 조합을 그대로 믿지 않고
    # 화이트리스트로 검증한다. 화이트리스트에 없는 source, 또는 그 source에서 허용하지 않는
    # initial_status면 예약 자체를 만들지 않고 400으로 거부한다("무시하고 서버값으로 대체"가 아니라
    # "거부"를 택한 이유: 'staff' 채널은 전화예약/워크인처럼 상황에 따라 정말 다른 초기 상태가 필요해
    # 하나의 고정값으로 무시-대체할 수 없다 — 그래서 검증만 하고, 값 자체는 여전히 호출부 책임으로 둔다).
    allowed = ALLOWED_INITIAL_STATUS_BY_SOURCE.get(source)
    if allowed is None:
        raise AppError(f"알 수 없는 예약 경로입니다: {source}", status_code=400)
    if initial_status not in allowed:
        raise AppError(
            f"'{source}' 경로에서는 '{initial_status}' 상태로 예약을 생성할 수 없습니다.", status_code=400,
        )

    async def _run(c) -> UUID:
        # [QUEUE-WALK-16][QUEUE-WALK-18] 워크인 방문 시각(갭 #85)은 「지금보다 뒤」를 못 적는다.
        # now()는 IMMUTABLE이 아니라 CHECK로 못 걸어 서버가 판정한다 — DB now()로 재 클럭 스큐를 피한다.
        if walkin_visit_time is not None:
            if await c.fetchval("select $1::timestamptz > now()", walkin_visit_time):
                raise AppError("아직 오지 않은 시각입니다.", status_code=400)

        if slot_id is not None:
            booked = await book_slot(slot_id, staff, conn=c)
            if not booked:
                raise AppError("이미 예약된 시간입니다. 다른 시간을 선택하세요.", status_code=409)

        # [정합성 검토 R4-04] assign_booking_code() 트리거는 INSERT 이전에 "이미 쓰이는 코드인지"만
        # 확인하고 실제 유일성 보장은 booking_code UNIQUE 인덱스가 한다 — 두 요청이 동시에 같은
        # BEFORE INSERT 트리거를 통과하며 서로의 커밋 전 상태를 보지 못하면(READ COMMITTED) 같은
        # 후보 코드를 고를 수 있고, 그중 하나의 실제 INSERT가 UNIQUE 위반으로 실패한다. 이전 버전은
        # 이 실패를 그대로 AppError로 올려 사용자에게 "예약 실패"로 보여줬다 — 트리거가 매 시도마다
        # 새 코드를 다시 뽑으므로, INSERT 자체를 몇 번 재시도하면 대부분 조용히 성공한다.
        appointment_id = None
        last_exc: asyncpg.PostgresError | None = None
        for _attempt in range(5):
            try:
                async with c.transaction():  # 중첩 트랜잭션 = SAVEPOINT: 실패해도 바깥 트랜잭션은 안 깨짐
                    appointment_id = await c.fetchval(
                        """
                        insert into appointments
                            (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source, created_by, walkin_visit_time)
                        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        returning id
                        """,
                        slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason,
                        initial_status, source, staff.id, walkin_visit_time,
                    )
                break
            except asyncpg.UniqueViolationError as exc:
                if "booking_code" not in str(exc):
                    # booking_code 외의 유니크 위반(슬롯 이중예약 백스톱 등)은
                    # 원문을 숨기고 로그+고정 문구로.
                    raise (await pg_error_to_app_error(exc, "appointment.create")) from exc
                last_exc = exc
                continue
            except asyncpg.PostgresError as exc:
                # 트리거가 raise exception(P0…)으로 던진 메시지는 이미 한글 안내문이라
                # 그대로 노출하고, 그 밖의 드라이버 오류는 로그+고정 문구로.
                raise (await pg_error_to_app_error(exc, "appointment.create")) from exc
        else:
            raise AppError("예약번호 발급에 실패했습니다. 다시 시도해주세요.", status_code=409) from last_exc
        return appointment_id

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def transition_status(
    appointment_id: UUID,
    new_status: str,
    staff: StaffContext,
    reason: str | None,
    expected_updated_at: datetime,
    conn=None,
) -> None:
    async def _run(c) -> None:
        row = await c.fetchrow(
            "select status, updated_at from appointments where id = $1", appointment_id,
        )
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        if row["updated_at"] != expected_updated_at:
            raise AppError("다른 직원이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.", status_code=409)
        if new_status not in VALID_TRANSITIONS.get(row["status"], set()):
            # 서버의 1차 안내 — 실제 방어선은 DB 트리거(enforce_appointment_status_transition)다.
            raise AppError(
                f"'{row['status']}' 상태에서는 '{new_status}'(으)로 변경할 수 없습니다.", status_code=400,
            )

        try:
            if reason:
                await c.execute("select set_config('app.status_change_reason', $1, true)", reason)
            # UPDATE 한 번으로 트리거가 전이 유효성 검증과 이력 기록을 모두 처리한다.
            await c.execute(
                "update appointments set status = $1, updated_at = now() where id = $2",
                new_status, appointment_id,
            )
        except asyncpg.PostgresError as exc:
            # enforce_appointment_status_transition 트리거의 한글 안내(P0…)는 그대로,
            # 그 밖의 드라이버 오류는 로그+고정 문구로.
            raise (await pg_error_to_app_error(exc, "appointment.transition")) from exc

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def undo_status(
    appointment_id: UUID,
    staff: StaffContext,
    reason: str | None = None,
    to_status: str | None = None,
    conn=None,
) -> str:
    """[UNDO-*] 진행 4상태에서 한 칸 뒤로 되돌린다. 되돌린 뒤의 상태를 돌려준다.

    - 취소 계열은 되돌릴 수 없다(자리가 이미 풀렸다) — 갈 길은 「새로 예약」.
    - to_status를 함께 주면 한 칸 뒤 상태와 같아야 한다(두 칸 되돌리기 차단, UNDO-SCOPE-04).
    - 사유는 reason_required가 참인 경우에만 필수(UNDO-WHY-*).
    - 순번(queue_position)은 덮지 않는다 — 되돌리기가 순서 변경의 뒷문이 되지 않게(UNDO-ORDER-01).
    - 상태 이력은 기존 트리거(log_appointment_status_change)가 남긴다 — 우회하지 않는다(UNDO-LOG-01).
    """

    async def _run(c) -> str:
        row = await c.fetchrow(
            "select status from appointments where id = $1", appointment_id,
        )
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        current = row["status"]

        if current in CANCEL_STATES:
            raise AppError(
                f"이미 취소된 예약은 되돌릴 수 없습니다. {undo_blocked_hint(current)}로 진행하세요.",
                status_code=409,
            )
        target = UNDO_TRANSITIONS.get(current)
        if target is None:
            raise AppError(f"'{current}' 상태는 되돌릴 수 없습니다.", status_code=400)
        if to_status is not None and to_status != target:
            raise AppError("한 칸씩만 되돌릴 수 있습니다.", status_code=403)
        if reason_required(current, staff.role) and not reason:
            raise AppError("되돌리기 사유를 한 줄 입력해주세요.", status_code=400)

        try:
            if reason:
                await c.execute("select set_config('app.status_change_reason', $1, true)", reason)
            # queue_position은 건드리지 않는다 — 트리거가 이력을, DB 전이표(00037)가 역전이를 허용한다.
            await c.execute(
                "update appointments set status = $1, updated_at = now() where id = $2",
                target, appointment_id,
            )
        except asyncpg.PostgresError as exc:
            raise (await pg_error_to_app_error(exc, "appointment.undo")) from exc
        return target

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def reorder_queue(
    appointment_id: UUID,
    new_position: int,
    staff: StaffContext,
    reason: str,
    conn=None,
) -> None:
    async def _run(c) -> None:
        row = await c.fetchrow(
            "select id from appointments where id = $1 and status = '진료대기'", appointment_id,
        )
        if row is None:
            raise AppError("대기 중인 예약만 순서를 변경할 수 있습니다.", status_code=400)

        await c.execute(
            "update appointments set queue_position = $1, updated_at = now() where id = $2",
            new_position, appointment_id,
        )
        await c.execute(
            """
            insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
            values ($1, '진료대기', '진료대기', $2, $3)
            """,
            appointment_id, staff.id, reason,
        )

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def set_urgent_flag(
    appointment_id: UUID,
    is_urgent: bool,
    staff: StaffContext,
    expected_updated_at: datetime,
    conn=None,
) -> None:
    async def _run(c) -> str:
        return await c.execute(
            "update appointments set is_urgent_flag = $1, updated_at = now() where id = $2 and updated_at = $3",
            is_urgent, appointment_id, expected_updated_at,
        )

    if conn is not None:
        result = await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            result = await _run(c)

    if result == "UPDATE 0":
        raise AppError("다른 직원이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.", status_code=409)
