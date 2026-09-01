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
