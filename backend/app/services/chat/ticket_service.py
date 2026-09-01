from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.db.pool import acquire_as


def _to_dict(row) -> dict:
    return dict(row) if row is not None else None


async def claim_ticket(auth_user_id: str, ticket_id: UUID) -> dict:
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow("select * from claim_ticket($1)", ticket_id)
        except asyncpg.exceptions.RaiseError as e:
            # 경쟁 패자·권한 없음은 한글 메시지 그대로 409로. 파이썬 예외 원문 노출 금지.
            raise AppError(str(e), 409)
        return _to_dict(row)


async def close_ticket(auth_user_id: str, ticket_id: UUID) -> dict:
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow("select * from close_ticket($1)", ticket_id)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)
        return _to_dict(row)


async def staff_send_message(auth_user_id: str, ticket_id: UUID, content: str,
                             client_message_id: UUID | None = None) -> dict:
    if not content or not content.strip():
        raise AppError("보낼 내용을 입력해 주세요.", 400)
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow(
                "select * from staff_send_ticket_message($1, $2, $3)", ticket_id, content, client_message_id)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)
        return _to_dict(row)


async def list_thread_tickets(auth_user_id: str, thread_id: UUID) -> list[dict]:
    # PTDET-SUPPORT-03: 최신순 + ID 동점키 서버 정렬. 화면(Task 19)이 계산하지 않는다.
    async with acquire_as(auth_user_id) as conn:
        rows = await conn.fetch(
            "select * from support_tickets where thread_id = $1 order by created_at desc, id desc", thread_id)
        return [dict(r) for r in rows]


# ── 문의 티켓함 목록 (TICKET-INBOX-*) — 상태별 접수순 ──────────────────────────
# support_tickets엔 질문·인계이유·요청유형 컬럼이 없다(§4.2) — 스레드 메시지·핸드오프
# 시스템 메시지·예약 조인에서 행 수준 필드를 파생한다. 5항목 요약·전체 대화는 상세(Task 17).

# 인계 사유 코드(safety_watchdog 6종 + 예약 도구) → 직원이 읽는 한 줄.
_REASON_TEXT = {
    "no_answer": "상담봇이 답하지 못한 질문입니다",
    "unhelpful": "상담봇 답변이 도움이 되지 않았습니다",
    "repeated": "같은 질문이 반복돼 직원 확인이 필요합니다",
    "medical_judgment": "진단·치료 판단이 필요합니다",
    "data_mismatch": "안내가 실제와 다르다는 지적입니다",
    "complaint": "불만·항의로 직원 상담이 필요합니다",
    "late_cancellation": "마감 후 취소 요청입니다",
    "cancel_booking": "예약 취소는 직원 확인이 필요합니다",
    "change_booking": "예약 변경은 직원 확인이 필요합니다",
}
# 사유 코드 → 예약 상담 유형(cancel/reschedule/medical_judgment). 그 외는 일반(None).
_REQUEST_TYPE = {
    "medical_judgment": "medical_judgment",
    "late_cancellation": "cancel",
    "cancel_booking": "cancel",
    "change_booking": "reschedule",
    "reschedule": "reschedule",
}

_INBOX_SQL = """
select
  t.id::text as id,
  t.status,
  -- 접수시각은 한국 벽시계 문자열로(프론트가 그대로 표시·정렬 — UTC로 주면 하루가 밀린다).
  to_char(t.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS') as created_at,
  coalesce(
    (select cm.content from public.chat_messages cm
       where cm.thread_id = t.thread_id and cm.sender_type = 'patient'
       order by cm.created_at asc limit 1),
    '(질문 없음)') as patient_question,
  hs.reason_code,
  s.name as assignee_name,
  a.summary as appointment_summary
from public.support_tickets t
left join public.staff s on s.id = t.assigned_staff_id
left join lateral (
  select cm.payload->>'reason' as reason_code
    from public.chat_messages cm
   where cm.thread_id = t.thread_id and cm.sender_type = 'system'
     and cm.payload->>'event' = 'staff_handoff'
   order by cm.created_at desc limit 1
) hs on true
left join lateral (
  select (
    extract(month from sl.slot_date)::int || '/' || extract(day from sl.slot_date)::int
    || ' ' || to_char(sl.start_time, 'HH24:MI')
    || ' · ' || d.name || ' · ' || doc.name
  ) as summary
    from public.appointments ap
    join public.appointment_slots sl on sl.id = ap.slot_id
    join public.departments d on d.id = ap.department_id
    join public.staff doc on doc.id = ap.doctor_id
   where ap.id = t.appointment_id
) a on true
where t.status = $1
order by t.created_at asc, t.id asc
"""


def _row_to_inbox(r) -> dict:
    """조회 행(파생 원형) → 문의함 DTO. 사유 코드를 사람이 읽는 한 줄·요청 유형으로 옮긴다.
    순수 함수(테스트가 DB 없이 검증) — SQL 결과 한 행만 받는다."""
    code = r["reason_code"]
    return {
        "id": r["id"],
        "status": r["status"],
        "patient_question": r["patient_question"],
        "handoff_reason": _REASON_TEXT.get(code) or "직원 확인이 필요합니다",
        "created_at": r["created_at"],
        "assignee_name": r["assignee_name"],
        "request_type": _REQUEST_TYPE.get(code),
        "appointment_summary": r["appointment_summary"],
    }


async def list_inbox_tickets(auth_user_id: str, status: str) -> list[dict]:
    async with acquire_as(auth_user_id) as conn:
        rows = await conn.fetch(_INBOX_SQL, status)
    return [_row_to_inbox(r) for r in rows]


# ── 티켓 상세 (TICKET-DETAIL-*) — 요약 5항목 + 전체 대화 + 담당자 + 연락처 마스킹 ──────
# ⚠️ 인계 요약 5항목의 구조화 출처는 백엔드에 없다(staff_handoff 시스템 메시지 payload는 {event,reason}뿐).
#    §0(모르는 상태·사유를 지어내지 않는다)대로 파생 가능한 둘만 채우고 나머지는 null로 둔다(SUM-02):
#      · patient_asked   = 상담방 첫 환자 메시지(inbox와 같은 파생)
#      · unresolved_reason = 인계 사유 코드의 사람 문장(_REASON_TEXT)
#      · bot_confirmed / already_guided / staff_should_check = null → 화면이 "내용 없음"
# DB enum staff_role은 receptionist인데 화면 계약은 reception이다 — DTO에서 한 번만 옮긴다.
_ROLE_MAP = {"receptionist": "reception", "doctor": "doctor", "admin": "admin"}

_DETAIL_HEADER_SQL = """
select
  t.id::text as id,
  t.status,
  t.thread_id,
  th.owner_type,
  th.anonymous_session_id,
  coalesce(hs.reason_code, 'general') as reason,
  s.name as assignee_name,
  s.role::text as assignee_role,
  (t.assigned_staff_id is not null and t.assigned_staff_id = private.current_staff_id()) as is_mine,
  (select cm.content from public.chat_messages cm
     where cm.thread_id = t.thread_id and cm.sender_type = 'patient'
     order by cm.created_at asc, cm.id asc limit 1) as patient_asked
from public.support_tickets t
join public.chat_threads th on th.id = t.thread_id
left join public.staff s on s.id = t.assigned_staff_id
left join lateral (
  select cm.payload->>'reason' as reason_code
    from public.chat_messages cm
   where cm.thread_id = t.thread_id and cm.sender_type = 'system'
     and cm.payload->>'event' = 'staff_handoff'
   order by cm.created_at desc limit 1
) hs on true
where t.id = $1
"""

# 대화 + 메시지별 읽음 파생. sender_type 'bot'은 화면 계약상 'ai'로 옮긴다.
#  · patient_read (직원 메시지를 환자가 읽음, READ) = staff 메시지가 환자/익명 커서 이하
#  · staff_unread (환자 메시지를 직원이 미확인, UNREAD) = patient 메시지가 직원 커서보다 뒤(커서 없으면 전부)
#  · sms_sent = false 고정 — 실제 발송은 dispatcher(배포). 아직 발송된 것이 없다(NOTIFY-03은 표시 계약).
_DETAIL_MESSAGES_SQL = """
with staff_cursor as (
  select (select created_at from public.chat_messages where id = rs.last_read_message_id) as at
    from public.chat_read_states rs
   where rs.thread_id = $1 and rs.reader_type = 'staff'
     and rs.reader_staff_id = private.current_staff_id()
),
patient_cursor as (
  select max((select created_at from public.chat_messages where id = rs.last_read_message_id)) as at
    from public.chat_read_states rs
   where rs.thread_id = $1 and rs.reader_type in ('patient', 'anonymous_web')
)
select
  cm.id::text as id,
  case cm.sender_type when 'bot' then 'ai' else cm.sender_type end as sender,
  cm.content as body,
  to_char(cm.created_at at time zone 'Asia/Seoul', 'HH24:MI') as at,
  (cm.sender_type = 'staff'
     and (select at from patient_cursor) is not null
     and cm.created_at <= (select at from patient_cursor)) as patient_read,
  (cm.sender_type = 'patient'
     and ((select at from staff_cursor) is null or cm.created_at > (select at from staff_cursor))) as staff_unread,
  false as sms_sent
from public.chat_messages cm
where cm.thread_id = $1
order by cm.created_at asc, cm.id asc
"""


class TicketNotFound(AppError):
    """없는·볼 수 없는 티켓(RLS로 행이 없음). 딥링크 방어 — 내용 없이 404."""
    def __init__(self, message: str = "문의를 찾을 수 없습니다."):
        super().__init__(message, 404)


def _detail_summary(header) -> dict:
    return {
        "patient_asked": header["patient_asked"],
        "bot_confirmed": None,
        "already_guided": None,
        "unresolved_reason": _REASON_TEXT.get(header["reason"]),
        "staff_should_check": None,
    }


async def get_ticket_detail(auth_user_id: str, ticket_id: UUID) -> dict:
    async with acquire_as(auth_user_id) as conn:
        header = await conn.fetchrow(_DETAIL_HEADER_SQL, ticket_id)
        if header is None:
            raise TicketNotFound()
        msg_rows = await conn.fetch(_DETAIL_MESSAGES_SQL, header["thread_id"])
        has_phone = False
        if header["owner_type"] == "anonymous_web" and header["anonymous_session_id"] is not None:
            has_phone = await conn.fetchval(
                "select exists (select 1 from public.anonymous_chat_contacts c "
                "where c.anonymous_session_id = $1 and c.contact_kind = 'phone')",
                header["anonymous_session_id"],
            )
    assignee = None
    if header["assignee_name"] is not None:
        assignee = {"name": header["assignee_name"],
                    "role": _ROLE_MAP.get(header["assignee_role"], header["assignee_role"])}
    return {
        "id": header["id"],
        "status": header["status"],
        "reason": header["reason"],
        "assignee": assignee,
        "is_mine": header["is_mine"],
        "summary": _detail_summary(header),
        "messages": [dict(m) for m in msg_rows],
        "contact": {"anonymous": header["owner_type"] == "anonymous_web", "has_phone": bool(has_phone)},
    }


async def reassign_ticket(auth_user_id: str, ticket_id: UUID, to_staff_id: UUID) -> dict:
    # assigned_staff_id만 바꾸고 in_progress 유지(REASSIGN-02). 바뀐 담당자를 화면이 바로 반영하도록
    # 갱신 후 상세를 다시 만들어 돌려준다.
    async with acquire_as(auth_user_id) as conn:
        try:
            await conn.fetchrow("select * from reassign_ticket($1, $2)", ticket_id, to_staff_id)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)
    return await get_ticket_detail(auth_user_id, ticket_id)


async def mark_ticket_read(auth_user_id: str, ticket_id: UUID, message_id: UUID) -> None:
    # 직원 읽음 커서를 그 메시지까지 전진(UNREAD-02). 커서는 뒤로 가지 않는다(함수가 보장).
    async with acquire_as(auth_user_id) as conn:
        try:
            await conn.execute("select staff_mark_ticket_read($1, $2)", ticket_id, message_id)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)


def _row_to_active_staff(r) -> dict:
    """활성 직원 한 행 → 이관 드롭다운 DTO. 역할 이름을 화면 계약으로 옮긴다(순수 함수)."""
    return {"id": r["id"], "name": r["name"], "role": _ROLE_MAP.get(r["role"], r["role"])}


async def list_active_staff(auth_user_id: str) -> list[dict]:
    # 이관 대상 = 모든 활성 직원(REASSIGN-05, 막다른 길 방지). 이름순.
    async with acquire_as(auth_user_id) as conn:
        rows = await conn.fetch(
            "select id::text as id, name, role::text as role from public.staff where is_active order by name, id")
    return [_row_to_active_staff(r) for r in rows]


# ── 환자 범위 상담 티켓 (PTSUP-SECT) — 그 환자에게 넘어온 상담만, 최신순 + id 동점키 ──────────────
# PTDET-SUPPORT-03(최신순+ID 동점키 서버 정렬)을 patient 범위로 확장한다. 화면(Task 19)이 계산하지 않는다.
# question = 첫 환자 메시지, bot_answer = 마지막 봇 메시지, handoff_reason = 인계 사유의 사람 문장(_REASON_TEXT).
_PATIENT_TICKETS_SQL = """
select
  t.id::text as id,
  th.patient_id::text as patient_id,
  t.status,
  t.created_at,
  coalesce(
    (select cm.content from public.chat_messages cm
       where cm.thread_id = t.thread_id and cm.sender_type = 'patient'
       order by cm.created_at asc, cm.id asc limit 1), '') as question,
  (select cm.content from public.chat_messages cm
     where cm.thread_id = t.thread_id and cm.sender_type = 'bot'
     order by cm.created_at desc, cm.id desc limit 1) as bot_answer,
  (select cm.payload->>'reason' from public.chat_messages cm
     where cm.thread_id = t.thread_id and cm.sender_type = 'system'
       and cm.payload->>'event' = 'staff_handoff'
     order by cm.created_at desc limit 1) as reason_code
from public.support_tickets t
join public.chat_threads th on th.id = t.thread_id
where th.owner_type = 'patient' and th.patient_id = $1
order by t.created_at desc, t.id desc
"""


def _row_to_patient_ticket(r) -> dict:
    code = r["reason_code"]
    return {
        "id": r["id"],
        "patient_id": r["patient_id"],
        "question": r["question"],
        "status": r["status"],
        "created_at": r["created_at"],
        "bot_answer": r["bot_answer"],
        "handoff_reason": _REASON_TEXT.get(code) if code else None,
    }


async def list_patient_support_tickets(auth_user_id: str, patient_id: UUID) -> list[dict]:
    async with acquire_as(auth_user_id) as conn:
        rows = await conn.fetch(_PATIENT_TICKETS_SQL, patient_id)
    return [_row_to_patient_ticket(r) for r in rows]
