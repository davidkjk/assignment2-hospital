from uuid import UUID

from app.db.pool import acquire_as

# 상담봇 기록(/chatlog, 관리자 전용) — 앱·웹 대화를 한 목록에(SCOPE-01). AI가 스스로 해결한(티켓 없는)
# 대화까지 전수(요구사항 L344). RLS는 00079가 관리자 전수 열람을 연다(일반 직원·환자엔 닫힘).
#  · channel = owner_type 파생(patient→app / anonymous_web→web). chat_threads엔 별도 channel 칸이 없다.
#  · route_taken = 그 스레드의 마지막 갈래(가장 최근 non-null). 계약 밖 값은 화면이 EXC로 표시한다.
#  · summary = 첫 환자 메시지(질문 요약).

_LOGS_SQL = """
with rep as (
  select
    th.id,
    case th.owner_type when 'patient' then 'app' when 'anonymous_web' then 'web' else th.owner_type end as channel,
    th.last_activity_at,
    (select cm.route_taken from public.chat_messages cm
       where cm.thread_id = th.id and cm.route_taken is not null
       order by cm.created_at desc, cm.id desc limit 1) as route_taken,
    (select cm.content from public.chat_messages cm
       where cm.thread_id = th.id and cm.sender_type = 'patient' and cm.content is not null
       order by cm.created_at asc, cm.id asc limit 1) as summary
  from public.chat_threads th
)
select
  id::text as thread_id,
  channel,
  route_taken,
  coalesce(summary, '') as summary,
  last_activity_at as at
from rep
where ($1::text is null or channel = $1)
  and ($2::text is null or route_taken = $2)
order by last_activity_at desc, id desc
"""


async def list_logs(auth_user_id: str, channel: str | None, route_taken: str | None) -> list[dict]:
    async with acquire_as(auth_user_id) as conn:
        rows = await conn.fetch(_LOGS_SQL, channel, route_taken)
    return [dict(r) for r in rows]


# 봇 답변 근거(SOURCE-*) — 승인 당시 스냅샷. similarity는 numeric → float로 옮긴다.
_SOURCES_SQL = """
select rank, similarity::float8 as similarity, title_snapshot, body_snapshot
from public.chat_message_sources
where message_id = $1
order by rank asc
"""


async def list_message_sources(auth_user_id: str, message_id: UUID) -> list[dict]:
    async with acquire_as(auth_user_id) as conn:
        rows = await conn.fetch(_SOURCES_SQL, message_id)
    return [dict(r) for r in rows]


# 상세 대화 원문(DETAIL-01) — 직원 콘솔 말풍선(TicketConversation)이 그대로 소비.
#   sender_type 'bot'은 화면 계약상 'ai'로 옮긴다. 시각은 Asia/Seoul HH:MI.
_CONV_SQL = """
select
  cm.id::text as id,
  case cm.sender_type when 'bot' then 'ai' else cm.sender_type end as sender,
  cm.content as body,
  to_char(cm.created_at at time zone 'Asia/Seoul', 'HH24:MI') as at
from public.chat_messages cm
where cm.thread_id = $1
order by cm.created_at asc, cm.id asc
"""


async def thread_conversation(auth_user_id: str, thread_id: UUID) -> list[dict]:
    async with acquire_as(auth_user_id) as conn:
        rows = await conn.fetch(_CONV_SQL, thread_id)
    return [dict(r) for r in rows]
