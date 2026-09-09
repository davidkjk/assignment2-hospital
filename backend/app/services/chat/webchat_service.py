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

from datetime import date as _date

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as, get_pool
from app.services import opening_hours
from app.services.chat import anonymous_contact_codec, anonymous_service, card_builder
from app.services.doctor_schedule_summary import summarize_schedule

# 세션 복원 시 실어 보내는 최근 이력의 최대 건수(위젯 초기 렌더용).
HISTORY_LIMIT = 200

# 티켓 status → 환자에게 보이는 HandoffPhase는 patient_handoff_view가 정한다(Q18② 배정 숨김).
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
        # 읽음 커서(chat_read_states)를 최신 메시지까지 올린다 — 직원 화면의 '환자 확인' 판정이 이 커서다.
        #   예전엔 알림 배치만 닫고 커서를 안 써서 직원에게 환자가 계속 '미확인'으로 보였다(2026-09-09 실기기).
        #   최신 메시지 뒤로만 전진(뒤로 안 감). 스레드가 비어 있으면 select 0행 → no-op.
        if thread["owner_type"] == "anonymous_web":
            await conn.execute("select acknowledge_chat_batches($1, 'anonymous_web', $2)",
                               thread_id, thread["anonymous_session_id"])
            await conn.execute(
                "insert into chat_read_states (thread_id, reader_type, reader_anonymous_session_id, "
                "last_read_message_id, last_read_at) "
                "select $1, 'anonymous_web', $2, cm.id, now() from chat_messages cm "
                "where cm.thread_id=$1 order by cm.created_at desc, cm.id desc limit 1 "
                "on conflict (thread_id, reader_anonymous_session_id) where reader_type='anonymous_web' "
                "do update set last_read_message_id=excluded.last_read_message_id, last_read_at=now(), updated_at=now()",
                thread_id, thread["anonymous_session_id"])
        else:
            await conn.execute("select acknowledge_chat_batches($1, 'patient', $2)",
                               thread_id, thread["patient_id"])
            await conn.execute(
                "insert into chat_read_states (thread_id, reader_type, reader_patient_id, "
                "last_read_message_id, last_read_at) "
                "select $1, 'patient', $2, cm.id, now() from chat_messages cm "
                "where cm.thread_id=$1 order by cm.created_at desc, cm.id desc limit 1 "
                "on conflict (thread_id, reader_patient_id) where reader_type='patient' "
                "do update set last_read_message_id=excluded.last_read_message_id, last_read_at=now(), updated_at=now()",
                thread_id, thread["patient_id"])


def patient_handoff_view(ticket_status, staff_name, staff_role, has_staff_reply=False):
    """Q18②④: 환자에게 보이는 인계 상태 → (phase, name, role).

    배정(in_progress)은 환자에게 숨긴다 — 단순 배정은 기대만 키우므로 여전히 'connecting'(직원 확인 전)이고,
    "직원이 확인 중"은 실제 열람 presence(별도 realtime)만 보인다. 담당자 정보는 답변이 온 뒤에만 노출한다.

    #8(2026-09-08 실측): 직원이 실제로 답장을 보내도 티켓 status는 'in_progress'에 머문다
    (staff_send_ticket_message가 status를 안 바꾼다 — 'answered'는 '종료'를 뜻해 그때 쓸 수도 없다).
    그래서 환자 배너가 '직원 확인 전이에요'에서 영영 안 바뀌던 버그. → 직원 답장이 하나라도 있으면
    (has_staff_reply) 상태값과 무관하게 '답변 도착'으로 올린다(환자 관점의 진실 = 답이 왔다).
    """
    if not ticket_status:
        return (None, None, None)
    if ticket_status == "answered" or has_staff_reply:
        return ("answered", staff_name, staff_role)
    return ("connecting", None, None)  # pending·in_progress(답장 전) 모두 '직원 확인 전'


async def get_handoff_status(thread_id: UUID) -> dict:
    """상담방의 최신 인계 티켓 상태 → 프론트 HandoffStatus. 운영시간(is_open)은 상담봇 창구 기준."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        ticket = await conn.fetchrow(
            "select t.id, t.status, s.name as staff_name, s.role as staff_role "
            "from support_tickets t left join staff s on s.id = t.assigned_staff_id "
            "where t.thread_id=$1 order by t.created_at desc limit 1", thread_id)
        # #8: 이 티켓에 직원 답장이 하나라도 있으면 '답변 도착'으로 올린다(status는 안 바뀌므로 메시지로 판정).
        has_staff_reply = bool(ticket) and await conn.fetchval(
            "select exists(select 1 from chat_messages "
            "where support_ticket_id=$1 and sender_type='staff')", ticket["id"])
        # 상담봇의 "지금 문 열었나" — 접수 창구(hospital_hours) 기준(의사 진료시간과 다름).
        now = datetime.now(ZoneInfo("Asia/Seoul")).replace(tzinfo=None)
        is_open = await opening_hours.is_open(conn, now)
    # Q18②: 배정(in_progress·답장 전)은 환자에게 숨겨 'connecting'으로, 담당자는 답변 도착 뒤에만 노출한다.
    phase, name, role = patient_handoff_view(
        ticket["status"] if ticket else None,
        ticket["staff_name"] if ticket else None,
        ticket["staff_role"] if ticket else None,
        has_staff_reply=has_staff_reply)
    return {
        "phase": phase,
        "assigneeName": name,
        "assigneeRole": _ROLE_LABEL.get(role, role) if role else None,
        "isOpen": is_open,
        "hoursNote": None if is_open else _HANDOFF_CLOSED_NOTE,
        # CHAT-HANDOFF-STATE-03: 직원이 [상담 종료]하면 status='answered'(close_ticket, 00054). 이때만 종료다
        #   — 단순 답장은 status를 안 바꾸므로(in_progress) answered는 유일하게 '종료'를 뜻한다. phase는 그대로
        #   'answered'(답변 도착) 두고, closed를 추가 신호로 내려 프론트가 "상담 종료" 경계(CHAT-ROOM-END-01)를
        #   띄우게 한다(phase 계약 무변경 → 기존 배지 무회귀).
        "closed": bool(ticket) and ticket["status"] == "answered",
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


# ── 로그인 전 예약 탐색 (늦은 관문 ④ — 진료과·의사·날짜·시간, 환자 없이) ─────────
# 카드 버튼 탭이 오는 /cards/revalidate가 이 kind면 Bearer 없이 X-Anon-Token만으로 다음 카드를 준다.
# 조회에 환자가 실제 필터로 안 쓰이므로(departments·staff·slot은 민감정보 아님) 서비스 역할 conn으로 읽는다.
ANON_NAV_KINDS = ("pick_department", "pick_doctor", "pick_date")

_WD = ["월", "화", "수", "목", "금", "토", "일"]


def _date_label(d) -> str:
    return f"{d.month}월 {d.day}일 ({_WD[d.weekday()]})"


async def _list_doctors_public(conn, department_id: UUID) -> list[dict]:
    """로그인 전 통로: 환자 없이 그 과의 예약 가능 의사(전공·진료요약). list_doctors와 같은 BOOK-DOC-10 규칙."""
    rows = await conn.fetch(
        "select id, name, specialty from staff where role='doctor' and department_id=$1 and is_active order by name",
        department_id)
    doctors = [dict(r) for r in rows]
    if not doctors:
        return []
    ids = [d["id"] for d in doctors]
    srows = await conn.fetch(
        "select doctor_id, weekday, start_time, end_time from doctor_schedule_rules "
        "where doctor_id = any($1::uuid[]) and not is_day_off", ids)
    by_doc: dict = {}
    for r in srows:
        by_doc.setdefault(r["doctor_id"], []).append(
            {"weekday": r["weekday"], "start_time": r["start_time"], "end_time": r["end_time"]})
    # [BOOK-DOC-10] 진료시간 없는 의사는 예약 칸이 없어 숨긴다(막다른 길 방지).
    doctors = [d for d in doctors if by_doc.get(d["id"])]
    for d in doctors:
        d["schedule_summary"] = summarize_schedule(by_doc.get(d["id"], []))
    return doctors


async def _list_dates_public(conn, doctor_id: UUID) -> list[dict]:
    # [WEBBOOK-03] 예약 가능 시간이 하나라도 있는 날짜만 보여야 한다 — 안 그러면 그 날짜를 고른
    # 사용자가 시간 후보 0(막다른 길)에 빠진다. 정본 함수 list_bookable_slots(00019)가 당일
    # 30분 여유·마감(booking_deadline)·8주까지 판정하므로, 후보 날짜별로 그 결과가 비어있지 않은지
    # exists로 확인해 재사용한다(조건 중복 없음 → 시간 목록과 drift 불가). 예약 화면 진입 시 1회다.
    rows = await conn.fetch(
        "select d.slot_date from ("
        "  select distinct slot_date from appointment_slots"
        "  where doctor_id=$1 and status='빈시간' and slot_date between current_date and current_date+56"
        ") d "
        "where exists (select 1 from list_bookable_slots($1, d.slot_date)) "
        "order by d.slot_date", doctor_id)
    return [{"date": str(r["slot_date"]), "label": _date_label(r["slot_date"])} for r in rows]


async def navigate_booking(action: dict) -> dict:
    """[WEBBOOK-02~04] 로그인 전 예약 탐색 — pick_department→의사, pick_doctor→날짜, pick_date→시간.
    각 단계 payload는 다음 카드로 선택값을 누적한다(서버 무상태). 위변조는 다음 단계에서 서버가 재검증한다."""
    kind = action.get("kind")
    payload = action.get("payload") or {}
    pool = await get_pool()
    async with pool.acquire() as conn:
        if kind == "pick_department":
            department_id = UUID(payload["department_id"])
            dept_name = await conn.fetchval("select name from departments where id=$1", department_id)
            doctors = await _list_doctors_public(conn, department_id)
            return _envelope(card_builder.build_doctor_select_card(
                department_id=str(department_id), department_name=dept_name, doctors=doctors))
        if kind == "pick_doctor":
            department_id = UUID(payload["department_id"])
            doctor_id = UUID(payload["doctor_id"])
            doctor_name = await conn.fetchval("select name from staff where id=$1", doctor_id)
            dates = await _list_dates_public(conn, doctor_id)
            return _envelope(card_builder.build_date_select_card(
                department_id=str(department_id), doctor_id=str(doctor_id),
                doctor_name=doctor_name, dates=dates))
        if kind == "pick_date":
            department_id = UUID(payload["department_id"])
            doctor_id = UUID(payload["doctor_id"])
            target_date = _date.fromisoformat(payload["date"])
            rows = await conn.fetch("select id, start_time from list_bookable_slots($1, $2)", doctor_id, target_date)
            candidates = [{
                "label": r["start_time"].strftime("%H:%M"),
                "slot_at": datetime.combine(target_date, r["start_time"]).isoformat(),
                "slot_id": str(r["id"]), "department_id": str(department_id), "doctor_id": str(doctor_id),
            } for r in rows]
            return _envelope(card_builder.build_time_select_card(
                candidates=candidates, state=("정상" if candidates else "빈")))
    raise AppError("알 수 없는 예약 탐색 동작입니다.", status_code=400)


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


async def _revalidate_pick_target(patient: PatientContext, payload: dict) -> dict:
    """[WEBCARD-TARGET-01/02] 로그인 후 대상 선택 카드. list_family_members가 본인+활성 가족을 함께 준다
    (본인 relation='본인' → 카드 계약상 None으로 정규화). 앞 선택값(dep·doc·slot)은 payload가 그대로 나른다."""
    from app.services import patient_family_service
    members = await patient_family_service.list_family_members(patient)
    targets = [{"for_patient_id": str(m["id"]), "name": m["name"],
                "relation": None if m["is_self"] else m["relation"]} for m in members]
    return _envelope(card_builder.build_target_select_card(
        department_id=str(UUID(payload["department_id"])), doctor_id=str(UUID(payload["doctor_id"])),
        slot_id=str(UUID(payload["slot_id"])), slot_at=payload["slot_at"], targets=targets))


async def revalidate_action(patient: PatientContext, action: dict) -> dict | None:
    """인증 후 원래 행동을 최신 서버 상태로 재검증한다(자동 실행 없음 — 재확인 카드만 준다)."""
    kind = action.get("kind")
    payload = action.get("payload") or {}
    if kind == "book":
        return await _revalidate_book(patient, payload)
    if kind == "cancel":
        return await _revalidate_cancel(patient, payload)
    if kind == "pick_target":
        return await _revalidate_pick_target(patient, payload)   # 늦은 관문(④) 로그인 후 대상 선택
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
