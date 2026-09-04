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
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as, get_pool
from app.services import opening_hours
from app.services.chat import anonymous_contact_codec, anonymous_service, card_builder

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


async def attribute_session_to_patient(*, session_id: UUID, patient_id: UUID) -> None:
    """익명 세션이 소유한 상담방들을 인증된 환자 계정으로 귀속한다(WEBMOD-AUTH-09).

    XOR CHECK(00053): owner_type='patient'면 patient_id만 채우고 anonymous_session_id는 null이어야 하므로
    세 칸을 한 UPDATE로 바꾼다. 메시지의 sender_anonymous_session_id는 그대로 두어 이력이 사라지지 않는다.
    이미 귀속됐거나 해당 세션 소유 방이 없으면 0행 — 멱등하게 통과한다(추측 귀속 아님, 명시 인증에만).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "update chat_threads set owner_type='patient', patient_id=$2, "
            "anonymous_session_id=null, updated_at=now() "
            "where owner_type='anonymous_web' and anonymous_session_id=$1",
            session_id, patient_id)


# ── 인증 후 카드 재검증·실행 (WEBCARD-BOOKCONF-03 / execute) ──────────────────
# 재검증·실행은 body의 patientId가 아니라 Bearer(get_current_patient)로 확인한 환자를 진실로 삼는다.
# 귀속 뒤 chat_threads는 anonymous_session_id가 null이라 X-Anon-Token으로는 못 찾는다 — 소유권은 Bearer가 잇는다.


def _envelope(payload: dict) -> dict:
    """카드 payload를 프론트 CardMessage(ThreadMessage) 형태로 감싼다. 재확인 카드는 이력에 저장하지 않는
    일회성 표시라 합성 id를 준다(WebCard는 .payload만 읽는다)."""
    return {
        "id": str(uuid4()), "senderType": "bot", "messageType": "card",
        "content": None, "payload": payload,
        "createdAt": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
    }


async def _resolve_target_name(conn, patient: PatientContext, for_patient_id: UUID):
    """예약 대상자 이름·관계(본인이면 relation=None, 가족이면 활성 링크의 relation). RLS가 본인+가족만 통과."""
    name = await conn.fetchval("select name from patients where id=$1", for_patient_id)
    if for_patient_id == patient.id:
        return name, None
    relation = await conn.fetchval(
        "select relation from patient_family_links "
        "where account_patient_id=$1 and family_patient_id=$2 and is_active",
        patient.id, for_patient_id)
    return name, relation


async def _revalidate_book(patient: PatientContext, payload: dict) -> dict:
    """[WEBCARD-BOOKCONF-03] 슬롯이 여전히 가능하면 최신 예약확인 카드를, 아니면 같은 의사·날짜의
    최신 시간선택 카드를 돌려준다. 이름·과·의사는 서버에서 다시 읽는다(카드 스냅샷을 믿지 않음)."""
    department_id = UUID(payload["department_id"])
    doctor_id = UUID(payload["doctor_id"])
    slot_id = UUID(payload["slot_id"])
    for_patient_id = UUID(payload["for_patient_id"])
    visit_reason = card_builder.collect_visit_reason(payload.get("visit_reason"))
    async with acquire_as(str(patient.auth_user_id)) as conn:
        slot = await conn.fetchrow(
            "select slot_date, start_time from appointment_slots where id=$1", slot_id)
        dept_name = await conn.fetchval("select name from departments where id=$1", department_id)
        doctor_name = await conn.fetchval("select name from staff where id=$1", doctor_id)
        patient_name, relation = await _resolve_target_name(conn, patient, for_patient_id)
        target_date = slot["slot_date"] if slot else None
        bookable = []
        if target_date is not None:
            bookable = await conn.fetch(
                "select id, start_time from list_bookable_slots($1, $2)", doctor_id, target_date)
    still_open = slot is not None and any(r["id"] == slot_id for r in bookable)
    if still_open:
        slot_at = datetime.combine(slot["slot_date"], slot["start_time"]).isoformat()
        return _envelope(card_builder.build_booking_confirm_card(
            for_patient_id=str(for_patient_id), patient_name=patient_name, relation=relation,
            department_name=dept_name, doctor_name=doctor_name, slot_at=slot_at,
            visit_reason=visit_reason, department_id=str(department_id),
            doctor_id=str(doctor_id), slot_id=str(slot_id)))
    # 슬롯이 사라졌거나 더는 불가 → 같은 의사·날짜의 최신 후보로 다시 고르게(막다른 길 금지).
    candidates = [{
        "label": r["start_time"].strftime("%H:%M"),
        "slot_at": datetime.combine(target_date, r["start_time"]).isoformat(),
        "slot_id": str(r["id"]), "department_id": str(department_id),
        "doctor_id": str(doctor_id), "for_patient_id": str(for_patient_id),
    } for r in bookable] if target_date is not None else []
    return _envelope(card_builder.build_time_select_card(
        candidates=candidates, state=("정상" if candidates else "빈")))


_CHANGEABLE_STATUSES = ("예약신청", "예약확정")   # patient_booking_service와 같은 취소 가능 상태


def _cancel_target_summary(row, name: str) -> str:
    """취소 재확인용 사람이 읽는 요약: '9월 11일 10:00 내과 김의사'(대상자·과·의사·일시)."""
    parts = []
    if row["slot_date"] is not None:
        parts.append(row["slot_date"].strftime("%-m월 %-d일"))
    if row["start_time"] is not None:
        parts.append(row["start_time"].strftime("%H:%M"))
    if row["dept_name"]:
        parts.append(row["dept_name"])
    if row["doctor_name"]:
        parts.append(row["doctor_name"])
    summary = " ".join(parts)
    if name:
        summary = f"{name} · {summary}" if summary else name
    return summary


async def _revalidate_cancel(patient: PatientContext, payload: dict) -> dict:
    """[WEBCARD-CANCELCONF-02] 인증 후 취소 대상 예약을 다시 확인한다. 취소 불가(없음·이미 취소·완료)면
    반려 카드로 막다른 길을 만들지 않는다. updated_at을 실어 execute가 낙관적 잠금에 쓴다."""
    appointment_id = UUID(payload["appointment_id"])
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select a.status, a.updated_at, a.for_patient_id, s.slot_date, s.start_time, "
            "d.name as dept_name, doc.name as doctor_name "
            "from appointments a "
            "left join appointment_slots s on s.id=a.slot_id "
            "left join departments d on d.id=a.department_id "
            "left join staff doc on doc.id=a.doctor_id "
            "where a.id=$1", appointment_id)
        if row is None:
            return _envelope(card_builder.build_cancel_reject_card(reject_reason="예약을 찾을 수 없습니다."))
        if row["status"] not in _CHANGEABLE_STATUSES:
            return _envelope(card_builder.build_cancel_reject_card(
                reject_reason="이미 취소되었거나 완료된 예약입니다."))
        name, _relation = await _resolve_target_name(conn, patient, row["for_patient_id"])
    return _envelope(card_builder.build_cancel_confirm_card(
        appointment_id=str(appointment_id),
        target_summary=_cancel_target_summary(row, name),
        updated_at=row["updated_at"].isoformat()))


async def revalidate_action(patient: PatientContext, action: dict) -> dict | None:
    """인증 후 원래 행동을 최신 서버 상태로 재검증한다(자동 실행 없음 — 재확인 카드만 준다)."""
    kind = action.get("kind")
    payload = action.get("payload") or {}
    if kind == "book":
        return await _revalidate_book(patient, payload)
    if kind == "cancel":
        return await _revalidate_cancel(patient, payload)
    if kind == "view_my_appointments":
        return None   # [WEBMOD-AUTH-07] 최신 조회만 — 카드 없이 프론트가 목록을 새로 읽는다.
    raise AppError("알 수 없는 재확인 행동입니다.", status_code=400)


async def _execute_booking(patient: PatientContext, payload: dict, request_id: UUID) -> dict:
    """[WEBCARD-BOOKCONF-01] 재확인 카드 [신청] → create_booking으로 실제 예약. 카드 payload를 믿지 않고
    create_booking이 슬롯·마감을 서버에서 재검증한다(위변조해도 안전). request_id로 멱등."""
    from app.services import patient_booking_service
    for_patient_id = UUID(payload["for_patient_id"])
    department_id = UUID(payload["department_id"])
    doctor_id = UUID(payload["doctor_id"])
    slot_id = UUID(payload["slot_id"])
    reason = card_builder.collect_visit_reason(payload.get("visit_reason"))
    try:
        appointment_id = await patient_booking_service.create_booking(
            patient, for_patient_id, department_id, doctor_id, slot_id,
            reason=reason, request_id=request_id, source="chatbot")
    except AppError as exc:
        # 슬롯 충돌·마감 등 → 예약확인 카드 실패 상태로 되돌린다(자동 실행 금지 유지, 막다른 길 아님).
        return _envelope({**payload, "card_type": "booking_confirm",
                          "state": "실패", "error_message": exc.message})
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select status, booking_code from appointments where id=$1", appointment_id)
    return _envelope(card_builder.build_booking_done_card(
        status=row["status"], number=row["booking_code"], question_count=None))


async def _execute_cancel(patient: PatientContext, payload: dict) -> dict:
    """[WEBCARD-CANCELCONF-01] 재확인 카드 [취소합니다] → cancel_appointment(APPT-RACE-01 낙관적 잠금).
    마감 후면 취소하지 않고 상담(직원 확인) 연결 안내로 되돌린다(환자 노출 문구 한정)."""
    from app.services import patient_booking_service
    appointment_id = UUID(payload["appointment_id"])
    expected_updated_at = (datetime.fromisoformat(payload["updated_at"])
                           if payload.get("updated_at") else None)
    if expected_updated_at is None:
        return _envelope(card_builder.build_cancel_reject_card(
            reject_reason="예약 정보를 다시 확인해주세요."))
    try:
        result = await patient_booking_service.cancel_appointment(
            patient, appointment_id, expected_updated_at)
    except AppError as exc:
        return _envelope(card_builder.build_cancel_reject_card(reject_reason=exc.message))
    if not result["cancelled"]:
        # 마감 후: 취소 접수 표현 금지 — 상담(직원 확인) 연결로만 안내한다.
        return _envelope(card_builder.build_cancel_reject_card(
            reject_reason="마감 후에는 상담(직원 확인)으로 연결됩니다."))
    async with acquire_as(str(patient.auth_user_id)) as conn:
        for_patient_id = await conn.fetchval(
            "select for_patient_id from appointments where id=$1", appointment_id)
        name, relation = await _resolve_target_name(conn, patient, for_patient_id)
    at = datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
    return _envelope(card_builder.build_cancel_done_card(
        cancelled_by="patient", relation=relation, name=name, at=at))


async def execute_card(patient: PatientContext, card_type: str, payload: dict,
                       client_message_id: UUID) -> dict:
    """재확인 카드의 주 행동을 실행한다. 카드 payload는 표시 스냅샷일 뿐 — 서버가 재검증·실행한다."""
    if card_type == "booking_confirm":
        return await _execute_booking(patient, payload, client_message_id)
    if card_type == "cancel_confirm":
        return await _execute_cancel(patient, payload)
    raise AppError("실행할 수 없는 카드입니다.", status_code=400)


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
