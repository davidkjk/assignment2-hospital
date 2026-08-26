"""[TODAY-SUM][TODAY-RESCHED][QUEUE-ORDER][QUEUE-FILT][DOCTOR-QUEUE][DOCTOR-DATE][QUEUE-WALK-08c]
조회 전용 백엔드 — 세는 곳은 서버 한 곳이다(화면은 받은 수를 그린다).

⭐ RLS를 파이썬 조건문으로 다시 쓰지 않는다(R2-02). `acquire_as`로 세션을 열면 1단계
   doctor_can_view_appointment()가 그대로 걸린다. 파이썬에서 또 거르면 두 곳이 갈라질 때
   넓은 쪽(대개 파이썬)이 이긴다.
"""
from dataclasses import dataclass
from datetime import date, time

from app.core.dto import mask_name, patient_row_dto
from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import acquire_as

# 오늘에 속하는 예약 판정: 슬롯이 있으면 슬롯 날짜, 없으면(현장 접수) 생성일(KST) 기준(R2-07).
_TODAY_SCOPE = "coalesce(s.slot_date, (a.created_at at time zone 'Asia/Seoul')::date) = current_date"


@dataclass
class QueueResult:
    rows: list[dict]
    tab_counts: dict


@dataclass
class DoctorQueueResult:
    rows: list[dict]
    mode: str


async def _dispatch(staff: StaffContext, conn, fn):
    if conn is not None:
        return await fn(conn)
    async with acquire_as(str(staff.auth_user_id)) as c:
        return await fn(c)


# ── 대기 목록 (/queue) ────────────────────────────────────────────────────

async def get_queue(staff: StaffContext, *, doctor_id=None, tab: str = "진료대기", conn=None) -> QueueResult:
    """⭐ 순번은 필터 이전에 매긴다(QUEUE-ORDER-03) — 병원 전체 대기 줄에 row_number()를
    먼저 매기고 그 다음에 의사로 거른다. 탭 숫자는 전체 기준을 유지한다(QUEUE-FILT-03)."""
    async def _run(c):
        waiting = await c.fetch(
            f"""
            with line as (
              select a.id, a.doctor_id, a.for_patient_id, a.status, a.queue_position,
                     p.name, p.phone, p.birth_date,
                     row_number() over (order by a.queue_position asc nulls last, a.id) as queue_no
              from appointments a
              join patients p on p.id = a.for_patient_id
              left join appointment_slots s on s.id = a.slot_id
              where a.status = '진료대기' and {_TODAY_SCOPE}
            )
            select * from line
            where ($1::uuid is null or doctor_id = $1)
            order by queue_no
            """,
            doctor_id,
        )
        tab_rows = await c.fetch(
            f"""
            select a.status, count(*) as n
            from appointments a
            left join appointment_slots s on s.id = a.slot_id
            where {_TODAY_SCOPE}
            group by a.status
            """
        )
        return waiting, tab_rows

    waiting, tab_rows = await _dispatch(staff, conn, _run)
    rows = [
        patient_row_dto(
            patient_id=r["for_patient_id"], name=r["name"], phone=r["phone"], birth_date=r["birth_date"],
            appointment_id=r["id"], queue_no=r["queue_no"], status=r["status"],
        )
        for r in waiting
    ]
    return QueueResult(rows=rows, tab_counts=_tab_counts(tab_rows))


def _tab_counts(tab_rows) -> dict:
    counts = {k: 0 for k in
              ("total", "not_arrived", "arrived", "waiting", "in_progress", "completed", "cancelled_or_noshow")}
    for r in tab_rows:
        n = r["n"]
        counts["total"] += n
        status = r["status"]
        if status in ("예약신청", "예약확정"):
            counts["not_arrived"] += n
        elif status == "도착":
            counts["arrived"] += n
        elif status == "진료대기":
            counts["waiting"] += n
        elif status == "진료중":
            counts["in_progress"] += n
        elif status == "진료완료":
            counts["completed"] += n
        elif status in ("환자취소", "병원취소", "예약부도"):
            counts["cancelled_or_noshow"] += n
    return counts


# ── 의사 콘솔 ─────────────────────────────────────────────────────────────

async def get_doctor_queue(doctor: StaffContext, *, target_date: date | None = None, conn=None) -> DoctorQueueResult:
    """[DOCTOR-QUEUE-01·03][DOCTOR-DATE-01·04] 본인 담당(RLS)만·전체 줄 정렬키·날짜 모드."""
    today = await _dispatch(doctor, conn, lambda c: c.fetchval("select current_date"))
    if target_date is None:
        target_date = today
    if target_date > today:
        raise AppError("미래 날짜는 조회할 수 없습니다.", status_code=400)
    mode = "read_only_with_record_edit" if target_date < today else "live"

    async def _run(c):
        return await c.fetch(
            """
            select a.id, a.queue_position, a.status, a.for_patient_id, p.name,
                   h.waited_since as waiting_started_at
            from appointments a
            join patients p on p.id = a.for_patient_id
            left join lateral (
              select min(changed_at) as waited_since
              from appointment_status_history
              where appointment_id = a.id and to_status = '진료대기'
                and from_status is distinct from to_status
            ) h on true
            left join appointment_slots s on s.id = a.slot_id
            where a.status in ('도착', '진료대기', '진료중')
              and coalesce(s.slot_date, (a.created_at at time zone 'Asia/Seoul')::date) = $1
            order by (a.queue_position is null), a.queue_position, h.waited_since nulls first, a.id
            """,
            target_date,
        )

    fetched = await _dispatch(doctor, conn, _run)
    rows = [
        {
            "id": r["id"],
            "patient_id": r["for_patient_id"],
            "masked_name": mask_name(r["name"]),
            "queue_position": r["queue_position"],
            "waiting_started_at": r["waiting_started_at"],
            "status": r["status"],
        }
        for r in fetched
    ]
    return DoctorQueueResult(rows=rows, mode=mode)


async def get_next_available(doctor: StaffContext, *, conn=None) -> dict | None:
    """[QUEUE-WALK-08c / 갭 #87] 다음 빈 시각. 없으면 None — 추정치를 만들지 않는다."""
    async def _run(c):
        return await c.fetchrow(
            """
            select slot_date, start_time
            from appointment_slots
            where doctor_id = $1 and status = '빈시간' and slot_date >= current_date
            order by slot_date, start_time
            limit 1
            """,
            doctor.id,
        )

    row = await _dispatch(doctor, conn, _run)
    if row is None:
        return None
    return {"slot_date": row["slot_date"], "start_time": row["start_time"]}


# ── 캘린더 (/calendar) — BLOCKED on Task 17 resolve_day ───────────────────

async def get_calendar(staff: StaffContext, *, from_, to, doctor_ids=None, conn=None):
    """[CAL-SLOT-*][SCHED-EXC-12] 캘린더가 그릴 것(막대·빗금·⚠)을 한 번에.

    ⛔ BLOCKED: 빗금(점심·휴진) 판정기 `opening_hours.resolve_day`가 아직 없다(Task 17 소유).
       `SCHED-EXC-12`가 *"resolve_day가 유일 판정기"*라 임의 재구현이 금지된다 — 화면이든
       이 창구든 자기 계산을 가지면 같은 날이 캘린더에서는 진료중, 예약에서는 휴무가 된다.

    resolve_day가 생기면 이 함수가:
      ① 예약 막대: appointments(환자 표시명 마스킹·상태·start/end·의사)
      ② 빗금 구간: resolve_day(doctor, day)가 판정한 점심·휴진(CAL-SLOT-03·08·09·11)
      ③ ⚠ 확인 필요: schedule_change.list_affected_appointments(CAL-SLOT-05)
    를 한 번에 조립해 돌려준다. ①③의 부품은 이미 있으나(list_affected_appointments 존재),
    ②의 판정기가 없어 셋을 한 응답으로 못 맞추므로 전체를 미룬다.
    """
    raise NotImplementedError(
        "/calendar는 Task 17의 opening_hours.resolve_day(빗금 판정기)에 막혀 있다 — "
        "SCHED-EXC-12가 유일 판정기를 요구하므로 임의 재구현 금지."
    )


# ── 오늘 요약 (/today/summary) ────────────────────────────────────────────

async def get_today_summary(staff: StaffContext, *, conn=None) -> dict:
    """⚠️ 한 번에 준다(SHELL-LIVE-01·03) — 타일·오래 대기·지원 요청 행·제외 명단이
    같은 응답이어야 사이드바 숫자와 카드가 같은 시점을 말한다. 나눠 부르면 두 응답 사이에
    상태가 바뀌어 같은 화면 안에서 두 숫자가 다른 말을 한다."""
    async def _run(c):
        tiles = await c.fetchrow(
            f"""
            select
              count(*) as total_reserved,
              count(*) filter (where a.status = '도착') as arrived,
              count(*) filter (where a.status = '진료대기') as waiting,
              count(*) filter (where a.status = '진료중') as in_progress,
              count(*) filter (where a.status = '진료완료') as completed,
              count(*) filter (where a.status in ('환자취소','병원취소','예약부도')) as cancelled_or_noshow
            from appointments a
            left join appointment_slots s on s.id = a.slot_id
            where {_TODAY_SCOPE}
            """
        )
        threshold = await c.fetchval(
            "select long_wait_threshold_minutes from hospital_settings limit 1"
        )
        long_wait = await c.fetch(
            f"""
            select a.id as appointment_id, a.for_patient_id, p.name, p.phone, p.birth_date,
                   floor(extract(epoch from (now() - h.waited_since)) / 60)::int as wait_minutes
            from appointments a
            join patients p on p.id = a.for_patient_id
            join lateral (
              select min(changed_at) as waited_since
              from appointment_status_history
              where appointment_id = a.id and to_status = '진료대기'
                and from_status is distinct from to_status
            ) h on true
            left join appointment_slots s on s.id = a.slot_id
            where a.status = '진료대기' and {_TODAY_SCOPE}
              and h.waited_since is not null
              and now() - h.waited_since >= make_interval(mins => $1)
            order by wait_minutes desc, a.id
            """,
            threshold,
        )
        needs = await c.fetch(
            """
            select a.id as appointment_id, a.for_patient_id, a.request_type,
                   p.name, p.phone, p.birth_date
            from appointments a
            join patients p on p.id = a.for_patient_id
            where a.support_requested_at is not null
            order by a.support_requested_at desc
            """
        )
        return tiles, long_wait, needs

    tiles, long_wait, needs = await _dispatch(staff, conn, _run)

    return {
        "tiles": {
            "total_reserved": tiles["total_reserved"],
            "arrived": tiles["arrived"],
            "waiting": tiles["waiting"],
            "in_progress": tiles["in_progress"],
            "completed": tiles["completed"],
            "cancelled_or_noshow": tiles["cancelled_or_noshow"],
        },
        "long_wait": [
            patient_row_dto(
                patient_id=r["for_patient_id"], name=r["name"], phone=r["phone"], birth_date=r["birth_date"],
                appointment_id=r["appointment_id"], wait_minutes=r["wait_minutes"],
            )
            for r in long_wait
        ],
        "needs_attention": [
            patient_row_dto(
                patient_id=r["for_patient_id"], name=r["name"], phone=r["phone"], birth_date=r["birth_date"],
                appointment_id=r["appointment_id"], reason=f"{r['request_type']} 상담 · 직원 확인 중",
            )
            for r in needs
        ],
        # TODAY-RESCHED-21: 이 카드에 줄이 있는 사람은 사이드바 배지가 두 번 세지 않는다.
        "badge_excluded_patient_ids": [r["for_patient_id"] for r in needs],
        # STAT-METRIC-06: 4단계 계약이 없다 — 0이 아니라 None(화면이 `현재 집계할 수 없음`).
        "bot_pending": None,
    }
