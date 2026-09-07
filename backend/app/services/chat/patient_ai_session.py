from uuid import UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import get_pool

# 로그인 환자의 AI 상담 세션 확보(CHAT-TAB-NAV-01). 익명 웹챗봇(webchat_service.start_or_restore_session)과
# 같은 방식이되 환자 소유로 — 상담방(chat_threads.owner_type='patient')과 활성 AI 세션을 서비스 풀로
# 찾거나 없으면 만든다. patient_id는 인증된 호출자(get_current_patient)에서만 오므로 안전하고,
# 서비스 풀 삽입이라 chat_threads INSERT용 RLS 정책·마이그레이션이 필요 없다.
#
# 이후 전송(/chat/messages 환자 경로)은 ai_session_service.load_owned_session이 RLS(patient_owns)로
# 소유를 검증하므로, 여기서 patient_id를 제대로 심는 것이 그 경로의 전제가 된다.


async def start(patient: PatientContext, *,
                thread_id: UUID | None = None,
                resume_from: UUID | None = None) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        tid = await _resolve_thread(conn, patient.id,
                                    thread_id=thread_id, resume_from=resume_from)
        # thread당 활성 하나(idx_ai_sessions_one_active). 있으면 재사용, 없으면 새로 만든다.
        aid = await conn.fetchval(
            "select id from ai_chat_sessions where thread_id=$1 and status='active' "
            "and now() < expires_at order by created_at desc limit 1", tid)
        if aid is None:
            aid = await conn.fetchval("select id from create_ai_session($1)", tid)
    return {"thread_id": str(tid), "ai_chat_session_id": str(aid)}


async def _resolve_thread(conn, patient_id: UUID, *,
                          thread_id: UUID | None, resume_from: UUID | None) -> UUID:
    if thread_id is not None:
        # 지난 상담 이어보기 — 목록에서 진입. 반드시 이 환자 소유여야 한다(서비스 풀이라 직접 확인).
        owned = await conn.fetchval(
            "select id from chat_threads where id=$1 and owner_type='patient' and patient_id=$2",
            thread_id, patient_id)
        if owned is None:
            raise AppError("상담방을 찾을 수 없습니다.", 404)
        return owned
    if resume_from is not None:
        # [이어서 AI 질문]: 직전 상담과 다른 새 상담방을 연다(CHAT-ROOM-AI-REOPEN-01, RETICKET과 동형).
        # ⚠️ 직전 요약 프리로드(continuation_summary)는 Task 5 요약 서비스가 채우는 후속. 지금은 새 방만.
        return await _new_patient_thread(conn, patient_id)
    # 탭 진입: 활성 세션이 있는 최근 상담방을 재사용, 없으면 새 방(첫 상담).
    tid = await conn.fetchval(
        "select t.id from chat_threads t join ai_chat_sessions s on s.thread_id = t.id "
        "where t.owner_type='patient' and t.patient_id=$1 "
        "and s.status='active' and now() < s.expires_at "
        "order by s.created_at desc limit 1", patient_id)
    return tid or await _new_patient_thread(conn, patient_id)


async def _new_patient_thread(conn, patient_id: UUID) -> UUID:
    return await conn.fetchval(
        "insert into chat_threads (owner_type, patient_id) values ('patient', $1) returning id",
        patient_id)


async def list_threads(patient: PatientContext) -> list[dict]:
    # 지난 상담 목록(CHAT-HISTORY-LIST-01) — 메시지가 있는 내 상담방만, 마지막 활동 최신순.
    # 방금 연 빈 상담방(메시지 0)은 이력이 아니므로 제외한다.
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select t.id::text as thread_id, "
            "  (select content from chat_messages m where m.thread_id = t.id "
            "   order by m.created_at desc, m.id desc limit 1) as last_snippet, "
            "  t.last_activity_at as last_at "
            "from chat_threads t "
            "where t.owner_type='patient' and t.patient_id = $1 "
            "  and exists (select 1 from chat_messages m where m.thread_id = t.id) "
            "order by t.last_activity_at desc",
            patient.id)
    return [dict(r) for r in rows]
