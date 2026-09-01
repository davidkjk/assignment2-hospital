"""웹 위젯(익명) 채널 오케스트레이션 — ⑦ 배선.

`webchat/src/api/webchatApi.ts`가 소비하는 익명 웹 세션의 서버 로직. 라우터(`chat.py`)는 얇게 두고
세션 확보·이력 직렬화 같은 알맹이를 여기에 모은다(Task 9 설계: 파이프라인은 서비스 한 곳).

익명 위젯은 로그인 세션이 아니라 브라우저 토큰(해시)으로 소유권을 잇는다. 원문 토큰은 저장하지 않고
`anonymous_service.upsert_session`이 해시로 바꿔 넘긴다(§4.5). 토큰이 없으면 서버가 새로 발급해 돌려준다.
"""
import hashlib
import json
import secrets
from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from app.core.errors import AppError
from app.db.pool import get_pool
from app.services import opening_hours
from app.services.chat import anonymous_contact_codec, anonymous_service

# 세션 복원 시 실어 보내는 최근 이력의 최대 건수(위젯 초기 렌더용).
HISTORY_LIMIT = 200

# 티켓 status → 프론트 HandoffPhase(webchatApi.ts).
_HANDOFF_PHASE = {"pending": "connecting", "in_progress": "inProgress", "answered": "answered"}
# staff.role(staff_role enum: receptionist|doctor|admin) → 사용자에게 보일 한글 라벨(없으면 원문).
_ROLE_LABEL = {"doctor": "의사", "receptionist": "접수", "admin": "관리자"}
_HANDOFF_CLOSED_NOTE = "지금은 상담 운영시간이 아니에요. 남겨주시면 운영시간에 순서대로 답변드려요."


def message_to_dict(row) -> dict:
    """chat_messages 행을 프론트 ThreadMessage(camelCase) 형태로 직렬화한다.
    payload는 jsonb인데 풀에 codec이 없어 asyncpg가 JSON 문자열로 주므로 객체로 되돌린다."""
    payload = row["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    return {
        "id": str(row["id"]),
        "senderType": row["sender_type"],
        "messageType": row["message_type"],
        "content": row["content"],
        "payload": payload,
        "clientMessageId": str(row["client_message_id"]) if row["client_message_id"] else None,
        "createdAt": row["created_at"].isoformat(),
    }


async def start_or_restore_session(raw_token: str | None) -> dict:
    """익명 토큰으로 세션을 복원하거나(없으면 발급) 상담방·활성 AI세션을 확보한다.
    반환은 프론트 SessionState = {threadId, aiSessionId, anonToken, messages}."""
    token = raw_token or secrets.token_urlsafe(32)
    session = await anonymous_service.upsert_session(token)
    session_id = session["id"]
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 익명 세션 하나가 여러 상담방을 가질 수 있으나(§4.1), 위젯은 최근 것을 이어 쓴다.
        thread_id = await conn.fetchval(
            "select id from chat_threads where owner_type='anonymous_web' and anonymous_session_id=$1 "
            "order by created_at desc limit 1", session_id)
        if thread_id is None:
            thread_id = await conn.fetchval(
                "insert into chat_threads (owner_type, anonymous_session_id) "
                "values ('anonymous_web', $1) returning id", session_id)
        # 활성 AI 세션 확보. thread당 active 하나(idx_ai_sessions_one_active) — 있으면 재사용.
        ai_id = await conn.fetchval(
            "select id from ai_chat_sessions where thread_id=$1 and status='active' and now() < expires_at "
            "order by created_at desc limit 1", thread_id)
        if ai_id is None:
            ai_id = await conn.fetchval("select id from create_ai_session($1)", thread_id)
        rows = await _fetch_thread_messages(conn, thread_id)
    return {
        "threadId": str(thread_id),
        "aiSessionId": str(ai_id),
        "anonToken": token,
        "messages": [message_to_dict(r) for r in rows],
    }


async def list_thread_messages(thread_id: UUID) -> list[dict]:
    """상담방 이력 조회. thread UUID가 능력토큰이라 익명 토큰 없이 조회한다(추측 불가한 UUID)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await _fetch_thread_messages(conn, thread_id)
    return [message_to_dict(r) for r in rows]


async def _fetch_thread_messages(conn, thread_id) -> list:
    return await conn.fetch(
        "select * from chat_messages where thread_id=$1 order by created_at asc, id asc limit $2",
        thread_id, HISTORY_LIMIT)


async def load_anonymous_session(session_id: UUID, thread_id: UUID) -> dict:
    """익명 발신을 위한 AI 세션 로드. thread가 익명 소유이고 세션이 그 thread 소속인지 확인한다.
    익명은 RLS가 아니라 thread UUID(능력토큰)로 소유권을 잇는다 — 없으면 404."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select s.* from ai_chat_sessions s join chat_threads t on t.id = s.thread_id "
            "where s.id=$1 and s.thread_id=$2 and t.owner_type='anonymous_web'", session_id, thread_id)
    if row is None:
        raise AppError("상담 세션을 찾을 수 없습니다.", 404)
    return dict(row)


async def acknowledge_read(thread_id: UUID) -> None:
    """사용자가 상담방을 확인하면 열린 알림 배치를 닫는다(§8-7). 수신자는 thread 소유자에서 도출한다."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        thread = await conn.fetchrow(
            "select owner_type, patient_id, anonymous_session_id from chat_threads where id=$1", thread_id)
        if thread is None:
            return
        if thread["owner_type"] == "anonymous_web":
            await conn.execute("select acknowledge_chat_batches($1, 'anonymous_web', $2)",
                               thread_id, thread["anonymous_session_id"])
        else:
            await conn.execute("select acknowledge_chat_batches($1, 'patient', $2)",
                               thread_id, thread["patient_id"])


async def get_handoff_status(thread_id: UUID) -> dict:
    """상담방의 최신 인계 티켓 상태 → 프론트 HandoffStatus. 운영시간(is_open)은 상담봇 창구 기준."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        ticket = await conn.fetchrow(
            "select t.status, s.name as staff_name, s.role as staff_role "
            "from support_tickets t left join staff s on s.id = t.assigned_staff_id "
            "where t.thread_id=$1 order by t.created_at desc limit 1", thread_id)
        # 상담봇의 "지금 문 열었나" — 접수 창구(hospital_hours) 기준(의사 진료시간과 다름).
        now = datetime.now(ZoneInfo("Asia/Seoul")).replace(tzinfo=None)
        is_open = await opening_hours.is_open(conn, now)
    phase = _HANDOFF_PHASE.get(ticket["status"]) if ticket else None
    role = ticket["staff_role"] if ticket else None
    return {
        "phase": phase,
        "assigneeName": ticket["staff_name"] if ticket else None,
        "assigneeRole": _ROLE_LABEL.get(role, role) if role else None,
        "isOpen": is_open,
        "hoursNote": None if is_open else _HANDOFF_CLOSED_NOTE,
    }


async def create_anonymous_handoff(*, session_id: UUID, thread_id: UUID, name: str,
                                   phone: str | None, summary: list[str]) -> UUID:
    """익명 인계 폼 제출 → 직원 티켓 확보 + (선택)연락처 검증 저장 + 이름·요약 기록.

    ⚠️ 티켓은 find-or-attach다 — 익명 no_answer가 이미 열린 티켓을 만들었을 수 있어(one-open-ticket)
       새로 만들지 않고 그 티켓에 붙인다. 전화번호는 직원 답변 SMS 수신용으로만 쓰며(WEBANON-HANDOFF-03)
       평문을 저장하지 않고 암호화+해시로만 남긴다(§4.5). 실제 발송은 배포 dispatcher(T30) 몫.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        thread = await conn.fetchrow(
            "select anonymous_session_id from chat_threads where id=$1 and owner_type='anonymous_web'", thread_id)
        if thread is None or thread["anonymous_session_id"] != session_id:
            raise AppError("상담 세션을 찾을 수 없습니다.", 404)
        ticket_id = await conn.fetchval(
            "select id from support_tickets where thread_id=$1 and status in ('pending','in_progress') "
            "order by created_at desc limit 1", thread_id)
        if ticket_id is None:
            # 열린 티켓이 없으면 활성 AI 세션을 종료하고 새 티켓을 연다.
            await conn.execute(
                "update ai_chat_sessions set status='ended', ended_at=now(), end_reason='staff_handoff' "
                "where thread_id=$1 and status='active'", thread_id)
            ticket_id = await conn.fetchval(
                "select id from create_support_ticket($1, null, null, null)", thread_id)
        if phone:
            # 평문 저장 금지: 암호화(발송 폴백용)+해시(대조용)만 남긴다.
            ciphertext = anonymous_contact_codec.encrypt_contact(phone)
            phone_hash = hashlib.sha256(phone.encode("utf-8")).hexdigest()
            await conn.execute(
                "select record_verified_anonymous_contact($1, $2, $3)", session_id, ciphertext, phone_hash)
        # 이름+요약은 상담방 타임라인의 시스템 메시지로 남겨 직원이 답변 대상을 식별한다(WEBANON-HANDOFF-02).
        await conn.execute(
            "insert into chat_messages (thread_id, support_ticket_id, sender_type, message_type, payload) "
            "values ($1, $2, 'system', 'system', $3::jsonb)", thread_id, ticket_id,
            json.dumps({"event": "anonymous_handoff", "name": name, "summary": summary}))
    return ticket_id
