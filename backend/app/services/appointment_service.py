from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

import asyncpg

from app.core.errors import AppError, pg_error_to_app_error
from app.core.security import StaffContext
from app.db.pool import acquire_as
from app.services.opening_hours import resolve_day
from app.services.slot_generator import REGENERATION_WEEKS  # =8 (SCHED-SLOT-09)
from app.services.slot_service import book_slot

# 전화예약 길이의 안전망 — resolve_day가 요일 규칙이 아닌 경로(의사별 예외 override)로
# 그 날을 열어 주면 slot_duration_minutes가 없을 수 있다. 그때만 쓰는 기본 진료 길이(분).
_DEFAULT_SLOT_MINUTES = 15

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


@dataclass(frozen=True)
class BookingLookupResult:
    """[CHKIN-RESULT-01] /checkin 결과 카드가 그릴 요약. ⛔ 전화·생년월일은 담지 않는다
    (접수엔 「이 사람이 이 예약이 맞나」뿐 필요 — MASK-SRV-01의 정신)."""
    appointment_id: UUID
    patient_name: str
    slot_at: datetime
    department_name: str
    doctor_name: str
    status: str
    updated_at: datetime   # 도착 처리의 낙관적 잠금 열쇠 — CHKIN-RESULT-03


async def find_by_booking_code(
    code: str, staff: StaffContext, conn=None,
) -> BookingLookupResult | None:
    """[R4-04][CHKIN-RESULT-01·02] 유효한 코드 하나를 결과 카드가 그릴 모양으로 돌려준다.

    ⛔ 만료·취소·부도·없는 번호를 구분하지 않는다 — 전부 None이다. 구분하는 순간
       "취소된 예약입니다"를 말하게 되고, 그것이 곧 환자 존재 여부를 알려주는 일이다(P-01).
    ⛔ 전화·생년월일을 담지 않는다 — 접수에 필요 없고, 안 보내면 샐 일도 없다(MASK-SRV-01).
    ⛔ access_audit_log에 남기지 않는다 — ROLE-READ-02가 연 열람 길목 셋 어디에도 접수 조회는
       없다. 여기 넣으면 관리자의 「누가 이 환자를 봤나」에 접수 건이 묻힌다.

    만료는 booking_code_expires_at > now()로 조회 시점에 다시 거른다(00005:145~148) —
    "슬롯 날짜 경과" 만료는 INSERT/UPDATE 트리거로 잡을 수 없기 때문이다.
    """

    async def _run(c) -> BookingLookupResult | None:
        row = await c.fetchrow(
            """
            select a.id as appointment_id, a.status, a.updated_at,
                   coalesce(a.start_at, s.slot_date + s.start_time) as slot_at,
                   p.name as patient_name, d.name as department_name, st.name as doctor_name
              from appointments a
              join patients p on p.id = a.for_patient_id
              join departments d on d.id = a.department_id
              join staff st on st.id = a.doctor_id
              left join appointment_slots s on s.id = a.slot_id
             where a.booking_code = $1
               and a.booking_code_expires_at > now()
            """,
            code.strip().upper(),
        )
        return BookingLookupResult(**row) if row else None

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


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
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    allow_overlap: bool = False,
    allow_over_daily_max: bool = False,
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

        # [SCHED-WEEK-03 「하루 최대 인원」 강제 · A5] 의사별 하루 최대 예약 인원을 실제로 막는다
        # (요구사항 3.7 :183 — 지금까지 설정·표시로만 있었다). 「경고 후 허용」(사용자 결정 2026-08-29):
        # 직원이 경고를 읽고 allow_over_daily_max=True로 다시 부르면 넘긴다(막다른 길 금지 — 당일 급한
        # 환자·전화예약 때문에 창구는 융통성이 필요하다). walk-in은 이미 온 환자라 정원과 무관하게 받는다.
        if walkin_visit_time is None and not allow_over_daily_max:
            if start_at is not None:
                booking_date = await c.fetchval("select $1::timestamptz::date", start_at)
            elif slot_id is not None:
                booking_date = await c.fetchval(
                    "select slot_date from appointment_slots where id = $1", slot_id,
                )
            else:
                booking_date = None
            if booking_date is not None:
                # 정원은 요일별로 정해진다(doctor_schedule_rules) — 슬롯 길이를 읽는 곳과 같은 표.
                max_daily = await c.fetchval(
                    "select max_daily_appointments from doctor_schedule_rules "
                    "where doctor_id = $1 and weekday = $2",
                    doctor_id, booking_date.weekday(),
                )
                if max_daily:  # None·0 = 상한 없음
                    # 살아 있는 예약만 센다 — 취소·부도(환자취소·병원취소·예약부도)는 그 자리를 비운다.
                    # 날짜는 셋 중 하나로 잡힌다: 전화·직접(start_at) · 슬롯(slot_date) · 워크인(walkin).
                    taken = await c.fetchval(
                        """
                        select count(*) from appointments a
                        left join appointment_slots s on s.id = a.slot_id
                        where a.doctor_id = $1
                          and a.status not in ('환자취소', '병원취소', '예약부도')
                          and coalesce(a.start_at::date, s.slot_date, a.walkin_visit_time::date) = $2
                        """,
                        doctor_id, booking_date,
                    )
                    if taken >= max_daily:
                        raise AppError(
                            f"이 날은 예약 정원({max_daily}명)을 채웠습니다.",
                            status_code=409,
                            detail={"reason": "over_daily_max", "max": max_daily},
                        )

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
                            (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source, created_by, walkin_visit_time, start_at, end_at, allow_overlap)
                        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                        returning id
                        """,
                        slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason,
                        initial_status, source, staff.id, walkin_visit_time, start_at, end_at, allow_overlap,
                    )
                break
            except asyncpg.ExclusionViolationError as exc:
                # [CAL-GAP-09] 시간 범위가 겹쳤다 — 원문을 숨기고 409로. 겹침을 알고 넣으려면
                # allow_overlap=True(직원이 경고를 읽고 진행)를 거쳐야 한다.
                raise AppError(
                    "그 시간에 이미 다른 예약이 있습니다.", status_code=409,
                ) from exc
            except asyncpg.UniqueViolationError as exc:
                if "appointments_doctor_start_unique" in str(exc):
                    # [CAL-GAP-08] 같은 의사·같은 시각 시작 — :112. allow_overlap으로도 못 뚫는다.
                    raise AppError(
                        "같은 시각에 이미 예약이 있습니다.", status_code=409,
                    ) from exc
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


async def create_phone_appointment(
    staff: StaffContext,
    patient_id: UUID,
    doctor_id: UUID,
    start_at: datetime,
    reason: str,
    allow_overlap: bool = False,
    allow_over_daily_max: bool = False,
    conn=None,
) -> UUID:
    """[CAL-*] 전화예약 — 직원이 창구에서 5분 단위 자유 시각에 예약을 만든다.

    화면(snapTo5min·GapWarningDialog)과 서버가 같은 규칙을 쓴다 — 화면만 막으면 API를
    직접 부르는 경로로 10:07·지난 시각·겹침이 들어온다. 서버가 최종 심판한다:

    - 5분 스냅(CAL-TIME-03): 시작 시각이 5분 격자를 벗어나면 거절한다.
    - 지난 시각(CAL-PAST-07·#84): DB now()로 재 클럭 스큐를 피한다. 30분 유예는 없다(CAL-PAST-06).
    - 닫힌 시간(SCHED-SLOT-11): 휴진·병원휴무·점심에는 잡히지 않는다. 판정은 resolve_day 하나뿐.
    - 겹침(CAL-GAP-06·08·09): 같은 시각 시작은 막고(unique), 부분 겹침은 allow_overlap일 때만.

    길이는 의사별 slot_duration_minutes가 정한다(CAL-TIME-09) — 10:05에 찍으면 10:05–10:20.
    """

    async def _run(c) -> UUID:
        # ── 5분 스냅(CAL-TIME-03) ──
        if start_at.second or start_at.microsecond or start_at.minute % 5 != 0:
            raise AppError("예약 시작은 5분 단위로만 잡을 수 있습니다.", status_code=400)

        # ── 지난 시각(CAL-PAST-07·#84) — DB now()로 재 클럭 스큐를 피한다 ──
        if await c.fetchval("select $1::timestamptz < now()", start_at):
            raise AppError("이미 지난 시간에는 예약을 만들 수 없습니다.", status_code=400)

        # ── 예약 가능 범위(SCHED-SLOT-09 · CAL-BOOK-14) ──
        # 그 너머는 **추천 자리가 아예 만들어지지 않은 구간**이다(regenerate_slots가 8주치만 만든다).
        # ⭐ 화면만 막으면 반쪽이다(지난 시각 갭 #84와 같은 이유) — 다른 경로로 들어온 8주 너머
        #    예약은 캘린더에 그려지는데 직원은 그 날로 갈 수 없어 **손댈 수 없는 예약**이 된다.
        # ⛔ 숫자를 여기 박지 않는다 — REGENERATION_WEEKS 하나가 슬롯 생성·문자 예약·이 검증을
        #    함께 지배한다(MSGX-SCHED-01 「고정 숫자 하드코딩 금지」 · 갭 #47 재발 방지).
        # ⚠️ **날짜 단위로 잰다** — 슬롯 생성이 `current_date ~ current_date + N주`를 날짜로 덮기
        #    때문이다(slot_generator.py:43~44). 시각으로 재면 마지막 날 오후가 거절되어,
        #    화면이 허용한 날을 서버가 막는 **막다른 길**이 생긴다.
        #    커넥션 시간대가 Asia/Seoul이라(app/db/pool.py) 이 캐스팅은 병원 날짜다.
        if await c.fetchval(
            "select $1::timestamptz::date > (current_date + make_interval(weeks => $2))::date",
            start_at, REGENERATION_WEEKS,
        ):
            raise AppError(
                f"예약은 지금부터 {REGENERATION_WEEKS}주 뒤까지만 잡을 수 있습니다.", status_code=400
            )

        # ── 닫힌 시간(SCHED-SLOT-11) — resolve_day가 유일 판정기, 화면·상담봇과 같은 답 ──
        sched = await resolve_day(c, doctor_id, start_at.date())
        if not sched.is_open:
            raise AppError("그 날은 진료하지 않습니다.", status_code=400)
        t = start_at.time()
        if sched.start is not None and sched.end is not None and not (sched.start <= t < sched.end):
            raise AppError("진료 시간 밖에는 예약을 잡을 수 없습니다.", status_code=400)
        if sched.lunch is not None and sched.lunch[0] <= t < sched.lunch[1]:
            raise AppError("점심시간에는 예약을 잡을 수 없습니다.", status_code=400)

        # ── 길이 = 의사별 slot_duration_minutes(CAL-TIME-09) ──
        duration = await c.fetchval(
            "select slot_duration_minutes from doctor_schedule_rules where doctor_id = $1 and weekday = $2",
            doctor_id, start_at.date().weekday(),
        )
        end_at = start_at + timedelta(minutes=duration or _DEFAULT_SLOT_MINUTES)

        # 담당의 소속 진료과를 서버가 정한다(enforce_appointment_consistency가 일치를 요구한다).
        department_id = await c.fetchval(
            "select department_id from staff where id = $1", doctor_id,
        )
        if department_id is None:
            raise AppError("담당의의 진료과를 확인할 수 없습니다.", status_code=400)

        # 전화예약은 예약확정으로 들어간다(ALLOWED_INITIAL_STATUS_BY_SOURCE['staff']).
        return await create_appointment(
            staff=staff,
            account_patient_id=patient_id,
            for_patient_id=patient_id,
            department_id=department_id,
            doctor_id=doctor_id,
            reason=reason,
            source="staff",
            initial_status="예약확정",
            start_at=start_at,
            end_at=end_at,
            allow_overlap=allow_overlap,
            allow_over_daily_max=allow_over_daily_max,
            conn=c,
        )

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def create_walkin_appointment(
    staff: StaffContext,
    patient_id: UUID,
    doctor_id: UUID,
    reason: str,
    visit_time: datetime | None = None,
    conn=None,
) -> UUID:
    """[QUEUE-WALK-08e·10·14·16] 예약 없이 온 환자를 그 자리에서 「진료대기」 줄에 세운다.

    ⭐ 진료과를 받지 않는다 — 「예약의 진료과 = 담당의의 진료과」를 DB 트리거가 강제하므로
       (00005:299~320 enforce_appointment_consistency) 진료과는 고르는 값이 아니라 **파생값**이다
       (`QUEUE-WALK-08e`). 화면에 진료과 id를 들려 보내면 어긋난 값이 들어올 길만 생긴다 —
       전화예약(create_phone_appointment)이 이미 같은 방식으로 서버에서 도출한다.

    슬롯도 start_at/end_at도 없다 — 워크인은 「예약 격자 위의 자리」가 아니라 **실제로 온 시각**만
    남긴다(갭 #85 · `QUEUE-WALK-15·18`). 그래서 목록이 slot_id is null로 「당일 방문」을 가려낸다
    (`QUEUE-WALK-12`, dashboard_service의 is_walkin).
    """

    async def _run(c) -> UUID:
        department_id = await c.fetchval(
            "select department_id from staff where id = $1", doctor_id,
        )
        if department_id is None:
            raise AppError("담당의의 진료과를 확인할 수 없습니다.", status_code=400)

        # [QUEUE-WALK-14] 기본은 「지금」이고 그 시각은 **서버가 찍는다** — 화면 시계를 그대로 믿으면
        # 클럭 스큐로 「아직 오지 않은 시각」이 되어 자기 자신이 막는다. 직원이 지난 시각을 직접
        # 적었을 때만(`QUEUE-WALK-14b`) 그 값이 올라오고, 미래 여부는 create_appointment가 판정한다.
        visited_at = visit_time if visit_time is not None else await c.fetchval("select now()")

        # [QUEUE-WALK-10] 「도착」을 거치지 않는다 — 이미 병원에 있는 사람이다.
        # [QUEUE-WALK-11] 줄의 자리는 맨 뒤 — 여기서 순서를 앞당기는 길을 만들지 않는다.
        return await create_appointment(
            staff=staff,
            account_patient_id=patient_id,
            for_patient_id=patient_id,
            department_id=department_id,
            doctor_id=doctor_id,
            reason=reason,
            source="staff",
            initial_status="진료대기",
            walkin_visit_time=visited_at,
            conn=c,
        )

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


# 마감 결과 → 저장 상태. 사람이 「진료가 있었나」를 판단한 결과다(TODAY-YDAY-02·04).
_STALE_CLOSE_STATUS: dict[str, str] = {"completed": "진료완료", "cancelled": "병원취소"}


async def close_stale_appointment(
    appointment_id: UUID,
    outcome: str,
    staff: StaffContext,
    expected_updated_at: datetime,
    conn=None,
) -> str:
    """[TODAY-YDAY-04] 전일 미완료 마감 — 지난 날짜에 밀린 예약을 닫는 전용 창구.

    상태기계의 정상 전이(도착 뒤엔 앞으로만·취소는 도착 전에만)는 그대로 두고, DB의
    close_stale_appointment definer가 「지난 날짜 + 도착/진료대기/진료중」만 예외로 닫는다
    (오늘 큐에서 도착 환자를 실수로 취소하는 길은 열지 않는다). 낙관적 잠금·상태이력 감사는
    기존 트리거가 담당한다. `outcome`은 완료(진료 있었음)/취소(진료 없음) 둘뿐이다.
    """
    to_status = _STALE_CLOSE_STATUS.get(outcome)
    if to_status is None:
        raise AppError("마감 방식이 올바르지 않습니다.", status_code=400)
    reason = (
        "전일 미완료 마감 · 진료 완료" if to_status == "진료완료"
        else "전일 미완료 마감 · 진료 없이 취소"
    )

    async def _run(c) -> str:
        try:
            return await c.fetchval(
                "select close_stale_appointment($1, $2, $3, $4)",
                appointment_id, to_status, expected_updated_at, reason,
            )
        except asyncpg.PostgresError as exc:
            raise (await pg_error_to_app_error(exc, "appointment.close_stale")) from exc

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
        # [QUEUE-URG-06] 켤 때 「누가·언제」를 남기고, 끌 때 두 칸을 null로 리셋한다.
        return await c.execute(
            "update appointments set is_urgent_flag = $1, "
            "urgent_flagged_by = case when $1 then $4::uuid else null end, "
            "urgent_flagged_at = case when $1 then now() else null end, "
            "updated_at = now() where id = $2 and updated_at = $3",
            is_urgent, appointment_id, expected_updated_at, staff.id,
        )

    if conn is not None:
        result = await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            result = await _run(c)

    if result == "UPDATE 0":
        raise AppError("다른 직원이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.", status_code=409)
