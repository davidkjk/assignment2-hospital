"""[TODAY-SUM][TODAY-RESCHED][QUEUE-ORDER][QUEUE-FILT][DOCTOR-QUEUE][DOCTOR-DATE][QUEUE-WALK-08c]
조회 전용 백엔드 — 세는 곳은 서버 한 곳이다(화면은 받은 수를 그린다).

⭐ RLS를 파이썬 조건문으로 다시 쓰지 않는다(R2-02). `acquire_as`로 세션을 열면 1단계
   doctor_can_view_appointment()가 그대로 걸린다. 파이썬에서 또 거르면 두 곳이 갈라질 때
   넓은 쪽(대개 파이썬)이 이긴다.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from app.core.dto import mask_name, patient_row_dto
from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import acquire_as
from app.services import opening_hours, schedule_change

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

# [QUEUE-TAB-01] 7개 탭 ↔ 상태 집합. 화면 URL은 영문 슬러그(?tab=waiting)를 쓰고 탭 숫자 키와 같다.
# total은 전체(상태 무관). 미도착은 아직 접수 전(예약신청·예약확정) — 도착처리를 시작할 목록이다.
_TAB_STATUSES: dict[str, tuple[str, ...] | None] = {
    "total": None,
    "not_arrived": ("예약신청", "예약확정"),
    "arrived": ("도착",),
    "waiting": ("진료대기",),
    "in_progress": ("진료중",),
    "completed": ("진료완료",),
    "cancelled_or_noshow": ("환자취소", "병원취소", "예약부도"),
}


async def get_queue(staff: StaffContext, *, doctor_id=None, tab: str = "waiting", conn=None) -> QueueResult:
    """[QUEUE-TAB-01][QUEUE-ORDER-03][QUEUE-FILT-03] 고른 탭의 행 + 전체 기준 탭 숫자를 준다.

    ⭐ 순번은 필터 이전에 매긴다(QUEUE-ORDER-03) — 병원 전체 진료대기 줄에 row_number()를 먼저
       매기고(의사 필터와 무관) 그 다음에 의사로 거른다. 다시 매기면 직원이 부르는 「3번」과 의사가
       부르는 「3번」이 달라진다.
    ⭐ 탭 숫자는 전체 기준을 유지한다(QUEUE-FILT-03) — 의사 필터를 걸어도 탭의 수는 안 줄어든다.
    ⭐ tab이 낯선 값이면 기본 「진료대기」로 본다(막다른 길 금지). 옛 한글 기본값도 그대로 받는다.
    """
    statuses = _TAB_STATUSES.get(tab, _TAB_STATUSES["waiting"]) if tab != "진료대기" else _TAB_STATUSES["waiting"]

    async def _run(c):
        # 오늘의 모든 예약을 한 번에 — 진료대기에만 병원 전체 순번을 window로 매긴다(필터 이전).
        rows = await c.fetch(
            f"""
            select a.id, a.doctor_id, a.for_patient_id, a.status, a.queue_position,
                   a.updated_at, a.is_urgent_flag, a.slot_id,
                   p.name, p.phone, p.birth_date,
                   s.start_time as slot_time, d.name as doctor_name, dept.name as department_name,
                   case when a.status = '진료대기'
                     then row_number() over (
                       partition by (a.status = '진료대기')
                       order by a.queue_position asc nulls last, a.id)
                   end as queue_no
            from appointments a
            join patients p on p.id = a.for_patient_id
            left join appointment_slots s on s.id = a.slot_id
            join staff d on d.id = a.doctor_id
            join departments dept on dept.id = a.department_id
            where {_TODAY_SCOPE}
            """
        )
        return rows

    all_rows = await _dispatch(staff, conn, _run)

    tab_counts = _tab_counts([{"status": r["status"], "n": 1} for r in all_rows])

    # 고른 탭 + 의사 필터. 진료대기는 순번순, 그 밖은 예약 시각순(순번이 없다, QUEUE-ORDER-02).
    picked = [
        r for r in all_rows
        if (statuses is None or r["status"] in statuses)
        and (doctor_id is None or r["doctor_id"] == doctor_id)
    ]
    if tab == "waiting" or tab == "진료대기":
        picked.sort(key=lambda r: (r["queue_no"] is None, r["queue_no"]))
    else:
        picked.sort(key=lambda r: (r["slot_time"] is None, r["slot_time"], r["id"]))

    rows = [_queue_row_dto(r, with_queue_no=(tab in ("waiting", "진료대기"))) for r in picked]
    return QueueResult(rows=rows, tab_counts=tab_counts)


def _queue_row_dto(r, *, with_queue_no: bool) -> dict:
    """대기 목록 한 행 — 마스킹된 신원 + 도착처리·순서변경·원문공개 배선에 필요한 안전 필드.

    updated_at은 낙관적 동시성(도착처리·긴급표시), is_walkin은 당일 방문 배지(QUEUE-WALK-12),
    slot_time은 미도착 줄의 예약 시각(QUEUE-ORDER-02). 순번은 진료대기 탭에서만 싣는다.
    """
    extra: dict = {
        "appointment_id": r["id"],
        "status": r["status"],
        "updated_at": r["updated_at"].isoformat(),
        "is_urgent_flag": r["is_urgent_flag"],
        # 워크인 = 슬롯 없는 예약(QUEUE-WALK-10). 「지금」 워크인(방문시각 미기록)도 배지가 붙는다.
        "is_walkin": r["slot_id"] is None,
        "doctor_id": r["doctor_id"],
        "doctor_name": r["doctor_name"],
        "department_name": r["department_name"],
        "slot_time": r["slot_time"].isoformat() if r["slot_time"] is not None else None,
    }
    if with_queue_no:
        extra["queue_no"] = r["queue_no"]
    return patient_row_dto(
        patient_id=r["for_patient_id"], name=r["name"], phone=r["phone"], birth_date=r["birth_date"],
        **extra,
    )


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


# ── 캘린더 (/calendar) — resolve_day(Task 17)로 조립 ──────────────────────

async def get_calendar(staff: StaffContext, *, from_, to, doctor_ids=None, conn=None):
    """[CAL-SLOT-*][SCHED-EXC-12] 캘린더가 그릴 것(막대·빗금·⚠)을 한 번에.

    ~~⛔ BLOCKED: 빗금 판정기 resolve_day가 아직 없다(Task 17 소유)~~ ✅ **해소(2026-08-26,
       통합 배선 `7300805`)** — Task 17이 `opening_hours.resolve_day`를 만들어 아래 ②가 그걸 부른다.
       `SCHED-EXC-12`가 *"resolve_day가 유일 판정기"*라 임의 재구현은 여전히 금지 — 화면이든 이 창구든
       자기 계산을 가지면 같은 날이 캘린더에서는 진료중, 예약에서는 휴무가 된다.

    셋을 한 응답으로 조립한다:
      ① 예약 막대: 슬롯을 가진 활성 예약(환자 표시명 마스킹·상태·start/end·의사).
         워크인(슬롯 없음)은 캘린더에 그릴 시각이 없어 여기 안 든다(CAL-PAST-08 / 갭 #85).
      ② 빗금 구간: resolve_day(doctor, day)가 판정한 점심·휴진(CAL-SLOT-03·08·09·11).
         ⭐ 화면이 자기 계산을 갖지 않는다 — 이 함수가 판정기다(SCHED-EXC-12).
      ③ ⚠ 확인 필요: list_affected_appointments가 판정한 예약의 id(CAL-SLOT-05).
    """
    async def _run(c):
        doctors = await _calendar_doctors(c, doctor_ids)

        # ① 예약 막대 — 슬롯을 가진 활성 예약만(워크인은 시각이 없어 제외).
        appt_rows = await c.fetch(
            """
            select a.id, a.doctor_id, a.status, a.for_patient_id,
                   p.name as patient_name, s.slot_date, s.start_time,
                   r.slot_duration_minutes
            from appointments a
            join appointment_slots s on s.id = a.slot_id
            left join patients p on p.id = a.for_patient_id
            left join doctor_schedule_rules r
              on r.doctor_id = a.doctor_id
             and r.weekday = (extract(isodow from s.slot_date)::int - 1)
            where s.slot_date between $1 and $2
              and a.status = any($3::text[])
              and ($4::uuid[] is null or a.doctor_id = any($4))
            order by s.slot_date, s.start_time, a.id
            """,
            from_, to, list(schedule_change.ACTIVE_STATUSES),
            list(doctor_ids) if doctor_ids else None,
        )
        appointments = [_calendar_bar(row) for row in appt_rows]

        # ② 빗금 구간 — resolve_day 하나로만 판정한다(의사×날짜).
        blocks = []
        for doctor_id in doctors:
            day = from_
            while day <= to:
                sched = await opening_hours.resolve_day(c, doctor_id, day)
                if not sched.is_open:
                    blocks.append({
                        "doctor_id": doctor_id, "date": day, "kind": "closed",
                        "start": None, "end": None, "source": sched.source,
                    })
                elif sched.lunch is not None:
                    blocks.append({
                        "doctor_id": doctor_id, "date": day, "kind": "lunch",
                        "start": sched.lunch[0], "end": sched.lunch[1], "source": sched.source,
                    })
                day += timedelta(days=1)

        # ③ ⚠ 확인 필요 — 판정 결과의 예약 id만 싣는다(원본 이름은 싣지 않는다).
        affected = await schedule_change.list_affected_appointments(c)
        affected_ids = [
            row.appointment_id if hasattr(row, "appointment_id") else row["appointment_id"]
            for row in affected
        ]

        return {
            "appointments": appointments,
            "blocks": blocks,
            "affected_appointment_ids": affected_ids,
        }

    return await _dispatch(staff, conn, _run)


async def _calendar_doctors(conn, doctor_ids) -> list:
    """빗금을 그릴 의사 목록 — 지정이 없으면 활성 의사 전부."""
    if doctor_ids:
        return list(doctor_ids)
    rows = await conn.fetch("select id from staff where role = 'doctor' and is_active order by id")
    return [row["id"] for row in rows]


def _calendar_bar(row) -> dict:
    """[MASK-SRV-01] 예약 막대 한 줄 — 이름은 마스킹으로만 실린다."""
    start = datetime.combine(row["slot_date"], row["start_time"])
    minutes = row["slot_duration_minutes"] or 0
    end = start + timedelta(minutes=minutes) if minutes else None
    return patient_row_dto(
        patient_id=row["for_patient_id"],
        name=row["patient_name"],
        appointment_id=row["id"],
        doctor_id=row["doctor_id"],
        status=row["status"],
        start=start,
        end=end,
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
        # TODAY-NOSHOW-01: 오늘 예약 중 예약 시각이 이미 지났는데 아직 '예약확정'(미도착)인 건.
        # ⚠️ 여기서 예약부도로 찍지 않는다(TODAY-NOSHOW-02, 자정 배치 몫). 슬롯 시각(KST 벽시계)
        #    이 현재보다 이르러야만 '지났다'로 본다 — 미래·정각은 제외(10분 일찍 온 환자는 없다).
        not_arrived = await c.fetch(
            f"""
            select a.id as appointment_id, a.for_patient_id, p.name, p.phone, p.birth_date,
                   s.start_time as slot_time
            from appointments a
            join patients p on p.id = a.for_patient_id
            join appointment_slots s on s.id = a.slot_id
            where a.status = '예약확정' and {_TODAY_SCOPE}
              and (s.slot_date + s.start_time) < (now() at time zone 'Asia/Seoul')
            order by s.start_time, a.id
            """
        )
        # TODAY-YDAY-01/#37: 어제까지의 '도착'·'진료대기'·'진료중' 잔여(사람이 마무리할 것).
        # ⛔ 지난 '예약확정'은 mark_overdue_no_shows() 배치가 이미 예약부도로 찍으니 넣지 않는다.
        #    서버 기준일(current_date, _TODAY_SCOPE와 같은 경계) 이전 슬롯만.
        yesterday_unfinished = await c.fetch(
            """
            select a.id as appointment_id, a.for_patient_id, p.name, p.phone, p.birth_date,
                   s.slot_date, s.start_time as slot_time
            from appointments a
            join patients p on p.id = a.for_patient_id
            join appointment_slots s on s.id = a.slot_id
            where a.status in ('도착', '진료대기', '진료중') and s.slot_date < current_date
            order by s.slot_date, s.start_time, a.id
            """
        )
        # TODAY-DOC-01: 의사별 '진료대기' 인원. 진료과+의사 이름과 함께(진료과 생략 안 함, 동명 방지).
        # 코디 결정: 요약 API에 단일 소스로(프론트 이중계산 방지, SHELL-LIVE '한 응답' 원칙).
        doctor_waiting = await c.fetch(
            f"""
            select a.doctor_id, d.name as doctor_name, dept.name as department_name,
                   count(*) as waiting_count
            from appointments a
            join staff d on d.id = a.doctor_id
            join departments dept on dept.id = a.department_id
            left join appointment_slots s on s.id = a.slot_id
            where a.status = '진료대기' and {_TODAY_SCOPE}
            group by a.doctor_id, d.name, dept.name
            order by dept.name, d.name, a.doctor_id
            """
        )
        return tiles, long_wait, needs, not_arrived, yesterday_unfinished, doctor_waiting

    tiles, long_wait, needs, not_arrived, yesterday_unfinished, doctor_waiting = await _dispatch(
        staff, conn, _run
    )

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
        # TODAY-NOSHOW-01: 시각 경과 미접수(시각 레일용 slot_time 동반).
        "not_arrived": [
            patient_row_dto(
                patient_id=r["for_patient_id"], name=r["name"], phone=r["phone"], birth_date=r["birth_date"],
                appointment_id=r["appointment_id"], slot_time=r["slot_time"],
            )
            for r in not_arrived
        ],
        # TODAY-YDAY-01/03: 전일 미완료(지난 날짜라 날짜를 함께).
        "yesterday_unfinished": [
            patient_row_dto(
                patient_id=r["for_patient_id"], name=r["name"], phone=r["phone"], birth_date=r["birth_date"],
                appointment_id=r["appointment_id"], slot_date=r["slot_date"], slot_time=r["slot_time"],
                reason="진료 중인 채로 마감",
            )
            for r in yesterday_unfinished
        ],
        # TODAY-DOC-01: 의사별 대기(환자 원문 없음 — 집계이므로 마스킹 대상 아님).
        "doctor_waiting": [
            {
                "doctor_id": r["doctor_id"],
                "doctor_name": r["doctor_name"],
                "department_name": r["department_name"],
                "waiting_count": r["waiting_count"],
            }
            for r in doctor_waiting
        ],
        # TODAY-RESCHED-21: 이 카드에 줄이 있는 사람은 사이드바 배지가 두 번 세지 않는다.
        "badge_excluded_patient_ids": [r["for_patient_id"] for r in needs],
        # STAT-METRIC-06: 4단계 계약이 없다 — 0이 아니라 None(화면이 `현재 집계할 수 없음`).
        "bot_pending": None,
    }
