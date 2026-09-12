"""웹 위젯 카드 액션·귀속 라우터 — ⑦ 배선(A/B/C).

`webchat/src/api/webchatApi.ts`가 소비하는 세 경로:
 - `POST /chat/attribute`  : 익명 상담방을 로그인 계정에 귀속(WEBMOD-AUTH-09).
 - `POST /chat/cards/revalidate` : 인증 후 최신 대상·슬롯 재검증 재확인 카드(WEBCARD-BOOKCONF-03).
 - `POST /chat/cards/execute`    : 재확인 카드 [신청]/[취소] 실행(create_booking·cancel_appointment 재검증).

보안 모델: 귀속·재검증·실행은 **환자 신원 검증이 필수**다 — body의 patientId만으로는 위조 가능이라
Authorization Bearer(get_current_patient)로 확인한다. X-Anon-Token은 익명방을 찾는 데 쓴다(귀속 전).
귀속 뒤 chat_threads XOR CHECK 때문에 anonymous_session_id가 null이 되므로, 이후 재검증·실행의
소유권은 Bearer가 잇는다(익명 토큰으로는 그 방을 더 못 찾는다).
"""
import asyncio
import time
import uuid

import asyncpg
import pytest
import pytest_asyncio
from jose import jwt

from app.core.config import settings
from tests.conftest import seed_patient, seed_staff


def make_token(auth_user_id) -> str:
    payload = {"sub": str(auth_user_id), "aud": "authenticated",
               "role": "authenticated", "exp": int(time.time()) + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _run(coro):
    return asyncio.run(coro)


async def _connect():
    return await asyncpg.connect(settings.database_url)


# 순환 FK라 replica 역할로 FK 트리거를 끄고 지운다(test_webchat_endpoints와 동일).
_CHAT_WIPE = [
    "chat_message_sources", "chat_notification_batches", "chat_read_states",
    "answer_feedback", "qa_example_bank", "chat_quality_reviews", "unresolved_questions",
    "chat_messages", "support_tickets", "ai_chat_sessions",
    "anonymous_chat_contacts", "chat_threads", "anonymous_chat_sessions",
]


@pytest_asyncio.fixture(autouse=True)
async def _wipe_chat():
    yield
    conn = await _connect()
    try:
        await conn.execute("set session_replication_role='replica'")
        for table in _CHAT_WIPE:
            await conn.execute(f"delete from {table}")
        await conn.execute("set session_replication_role='origin'")
    finally:
        await conn.close()


async def _thread_owner(thread_id: str):
    conn = await _connect()
    try:
        return await conn.fetchrow(
            "select owner_type, patient_id, anonymous_session_id from chat_threads where id=$1",
            uuid.UUID(thread_id))
    finally:
        await conn.close()


# ── POST /chat/attribute ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_attribute_converts_anon_thread_to_patient_owned(client, committed_conn):
    # [WEBMOD-AUTH-09] 명시 인증(Bearer) + 익명 토큰 → 익명방이 그 환자 소유로 바뀐다.
    # XOR CHECK 때문에 owner_type='patient'·patient_id 채움·anonymous_session_id=null 이 한 번에 된다.
    me = await seed_patient(committed_conn)
    token = make_token(me["auth_user_id"])
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        r = c.post("/chat/attribute",
                   headers={**_bearer(token), "X-Anon-Token": sess["anonToken"]},
                   json={"patientId": str(me["patient_id"])})
    assert r.status_code == 200, r.text
    owner = await _thread_owner(sess["threadId"])
    assert owner["owner_type"] == "patient"
    assert owner["patient_id"] == me["patient_id"]
    assert owner["anonymous_session_id"] is None


def test_attribute_without_bearer_is_401(client):
    # [WEBMOD-AUTH-09] Bearer 없이(익명 토큰만) 귀속 불가 — 명시 인증에만 귀속한다.
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        r = c.post("/chat/attribute", headers={"X-Anon-Token": sess["anonToken"]},
                   json={"patientId": str(uuid.uuid4())})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_attribute_rejects_mismatched_patient_id(client, committed_conn):
    # [WEBMOD-AUTH-09] body의 patientId가 인증된 환자와 다르면 403 — 다른 계정으로 귀속 못 한다.
    me = await seed_patient(committed_conn)
    token = make_token(me["auth_user_id"])
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        r = c.post("/chat/attribute",
                   headers={**_bearer(token), "X-Anon-Token": sess["anonToken"]},
                   json={"patientId": str(uuid.uuid4())})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_attribute_is_idempotent(client, committed_conn):
    # [WEBMOD-AUTH-09] 이미 귀속된 방에 다시 호출해도 성공(0행 UPDATE) — 그대로 환자 소유를 유지한다.
    me = await seed_patient(committed_conn)
    token = make_token(me["auth_user_id"])
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        h = {**_bearer(token), "X-Anon-Token": sess["anonToken"]}
        c.post("/chat/attribute", headers=h, json={"patientId": str(me["patient_id"])})
        again = c.post("/chat/attribute", headers=h, json={"patientId": str(me["patient_id"])})
    assert again.status_code == 200, again.text
    owner = await _thread_owner(sess["threadId"])
    assert owner["owner_type"] == "patient"
    assert owner["patient_id"] == me["patient_id"]


@pytest.mark.asyncio
async def test_attribute_preserves_anonymous_message_history(client, committed_conn):
    # [WEBMOD-AUTH-09] 귀속해도 앞선 익명 메시지는 sender_anonymous_session_id를 그대로 지녀 이력이 남는다.
    me = await seed_patient(committed_conn)
    token = make_token(me["auth_user_id"])
    with client as c:
        sess = c.post("/chat/sessions", json={"channel": "web"}).json()
        msg_id = await _seed_anon_message(sess["threadId"], sess["aiSessionId"])
        c.post("/chat/attribute",
               headers={**_bearer(token), "X-Anon-Token": sess["anonToken"]},
               json={"patientId": str(me["patient_id"])})
    kept = await _message_anon_sender(msg_id)
    assert kept is not None   # 익명 발신자 흔적이 사라지지 않았다(이력 보존)


async def _seed_anon_message(thread_id: str, ai_session_id: str) -> str:
    conn = await _connect()
    try:
        tid = uuid.UUID(thread_id)
        sess_id = await conn.fetchval(
            "select anonymous_session_id from chat_threads where id=$1", tid)
        return str(await conn.fetchval(
            "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, "
            "message_type, content, sender_anonymous_session_id) "
            "values ($1,$2,'patient','text','안녕하세요',$3) returning id",
            tid, uuid.UUID(ai_session_id), sess_id))
    finally:
        await conn.close()


async def _message_anon_sender(msg_id: str):
    conn = await _connect()
    try:
        return await conn.fetchval(
            "select sender_anonymous_session_id from chat_messages where id=$1", uuid.UUID(msg_id))
    finally:
        await conn.close()


async def _seed_bookable(conn):
    """진료과·의사·미래 빈 슬롯 하나. (department_id, doctor_id, slot_id) 반환."""
    dept = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor = await seed_staff(conn, role="doctor")
    await conn.execute("update staff set department_id=$1, name='김의사' where id=$2", dept, doctor["staff_id"])
    slot = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, current_date + 7, '10:00', '빈시간') returning id", doctor["staff_id"])
    return dept, doctor["staff_id"], slot


# ── POST /chat/cards/revalidate ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_revalidate_book_returns_fresh_confirm_card_with_ids(client, committed_conn):
    # [WEBCARD-BOOKCONF-03] 인증 후 슬롯이 여전히 가능하면 최신 예약확인 카드를 서버가 재구성해 돌려준다.
    # 카드 payload는 실행에 필요한 department_id·doctor_id·slot_id를 담는다(execute가 재검증).
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)
    token = make_token(me["auth_user_id"])
    action = {"kind": "book", "payload": {
        "for_patient_id": str(me["patient_id"]), "department_id": str(dept),
        "doctor_id": str(doctor), "slot_id": str(slot), "visit_reason": "감기"}}
    with client as c:
        r = c.post("/chat/cards/revalidate", headers=_bearer(token), json={"action": action})
    assert r.status_code == 200, r.text
    card = r.json()["card"]["payload"]
    assert card["card_type"] == "booking_confirm"
    assert card["state"] == "정상"
    assert card["department_id"] == str(dept)
    assert card["doctor_id"] == str(doctor)
    assert card["slot_id"] == str(slot)
    assert card["visit_reason"] == "감기"


@pytest.mark.asyncio
async def test_revalidate_book_taken_slot_returns_time_select(client, committed_conn):
    # [WEBCARD-BOOKCONF-03] 인증 후 슬롯이 이미 찼으면 같은 의사·날짜의 최신 후보로 다시 고르게 한다(막다른 길 금지).
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)
    other = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) "
        "values ($1, current_date + 7, '11:00', '빈시간') returning id", doctor)
    await committed_conn.execute("update appointment_slots set status='예약됨' where id=$1", slot)
    token = make_token(me["auth_user_id"])
    action = {"kind": "book", "payload": {
        "for_patient_id": str(me["patient_id"]), "department_id": str(dept),
        "doctor_id": str(doctor), "slot_id": str(slot), "visit_reason": ""}}
    with client as c:
        r = c.post("/chat/cards/revalidate", headers=_bearer(token), json={"action": action})
    card = r.json()["card"]["payload"]
    assert card["card_type"] == "time_select"
    assert card["state"] == "정상"
    assert any(cand["slot_id"] == str(other) for cand in card["candidates"])


def test_revalidate_without_bearer_is_401(client):
    # 재검증은 환자 신원이 필요하다 — Bearer 없으면 401(익명 토큰만으로는 재검증 불가).
    with client as c:
        r = c.post("/chat/cards/revalidate", json={"action": {"kind": "book", "payload": {}}})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_revalidate_view_my_appointments_returns_null_card(client, committed_conn):
    # [WEBMOD-AUTH-07] 내 예약 조회는 재확인 카드가 아니라 최신 조회다 — 카드 없이 성공한다(프론트가 목록 새로고침).
    me = await seed_patient(committed_conn)
    token = make_token(me["auth_user_id"])
    with client as c:
        r = c.post("/chat/cards/revalidate", headers=_bearer(token),
                   json={"action": {"kind": "view_my_appointments"}})
    assert r.status_code == 200, r.text
    assert r.json()["card"] is None


@pytest.mark.asyncio
async def test_revalidate_cancel_returns_confirm_card_with_updated_at(client, committed_conn):
    # [WEBCARD-CANCELCONF-02] 인증 후 취소 대상 예약을 다시 확인한다 — 최신 target_summary + 낙관적 잠금용 updated_at.
    me = await seed_patient(committed_conn)
    appt = await _seed_appointment(committed_conn, me["patient_id"])
    token = make_token(me["auth_user_id"])
    action = {"kind": "cancel", "payload": {"appointment_id": str(appt)}}
    with client as c:
        r = c.post("/chat/cards/revalidate", headers=_bearer(token), json={"action": action})
    assert r.status_code == 200, r.text
    card = r.json()["card"]["payload"]
    assert card["card_type"] == "cancel_confirm"
    assert card["appointment_id"] == str(appt)
    assert card["updated_at"]        # execute의 APPT-RACE-01 낙관적 잠금에 쓴다


async def _seed_appointment(conn, patient_id):
    """예약확정 상태의 미래 예약 한 건. appointment_id 반환."""
    dept, doctor, slot = await _seed_bookable(conn)
    return await conn.fetchval(
        "insert into appointments "
        "(slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source) "
        "values ($1,$2,$2,$3,$4,'감기','예약확정','app') returning id",
        slot, patient_id, dept, doctor)


async def _appointment_count(patient_id, slot_id) -> int:
    conn = await _connect()
    try:
        return await conn.fetchval(
            "select count(*) from appointments where account_patient_id=$1 and slot_id=$2",
            patient_id, slot_id)
    finally:
        await conn.close()


# ── POST /chat/cards/execute ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_booking_creates_appointment_and_returns_done_card(client, committed_conn):
    # [WEBCARD-BOOKCONF-01] 재확인 카드 [신청] → create_booking(source=chatbot 재검증)로 실제 예약을 만든다.
    # 결과는 예약완료 카드(예약번호 포함). 카드 payload를 믿지 않고 서버가 슬롯·마감을 다시 검증한다.
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)
    token = make_token(me["auth_user_id"])
    body = {"cardType": "booking_confirm", "clientMessageId": str(uuid.uuid4()),
            "payload": {"for_patient_id": str(me["patient_id"]), "department_id": str(dept),
                        "doctor_id": str(doctor), "slot_id": str(slot), "visit_reason": "감기"}}
    with client as c:
        r = c.post("/chat/cards/execute", headers=_bearer(token), json=body)
    assert r.status_code == 200, r.text
    card = r.json()["result"]["payload"]
    assert card["card_type"] == "booking_done"
    assert card["number"]                       # 6자리 예약번호(booking_code)
    assert await _appointment_count(me["patient_id"], slot) == 1


@pytest.mark.asyncio
async def test_execute_booking_is_idempotent_on_same_client_message_id(client, committed_conn):
    # [§8-4] 같은 clientMessageId로 두 번 실행해도 예약은 한 건만(create_booking request_id 멱등).
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)
    token = make_token(me["auth_user_id"])
    cmid = str(uuid.uuid4())
    body = {"cardType": "booking_confirm", "clientMessageId": cmid,
            "payload": {"for_patient_id": str(me["patient_id"]), "department_id": str(dept),
                        "doctor_id": str(doctor), "slot_id": str(slot), "visit_reason": ""}}
    with client as c:
        c.post("/chat/cards/execute", headers=_bearer(token), json=body)
        r2 = c.post("/chat/cards/execute", headers=_bearer(token), json=body)
    assert r2.status_code == 200, r2.text
    assert await _appointment_count(me["patient_id"], slot) == 1


@pytest.mark.asyncio
async def test_execute_booking_conflict_returns_failure_card(client, committed_conn):
    # [WEBCARD-BOOKCONF] 슬롯이 이미 찼으면 예약을 만들지 않고 실패 상태 카드로 되돌린다(서버 재검증).
    me = await seed_patient(committed_conn)
    dept, doctor, slot = await _seed_bookable(committed_conn)
    await committed_conn.execute("update appointment_slots set status='예약됨' where id=$1", slot)
    token = make_token(me["auth_user_id"])
    body = {"cardType": "booking_confirm", "clientMessageId": str(uuid.uuid4()),
            "payload": {"for_patient_id": str(me["patient_id"]), "department_id": str(dept),
                        "doctor_id": str(doctor), "slot_id": str(slot), "visit_reason": ""}}
    with client as c:
        r = c.post("/chat/cards/execute", headers=_bearer(token), json=body)
    assert r.status_code == 200, r.text
    card = r.json()["result"]["payload"]
    assert card["card_type"] == "booking_confirm"
    assert card["state"] == "실패"
    assert await _appointment_count(me["patient_id"], slot) == 0


@pytest.mark.asyncio
async def test_execute_cancel_cancels_appointment_and_returns_done_card(client, committed_conn):
    # [WEBCARD-CANCELCONF-01] 재확인 카드 [취소합니다] → cancel_appointment로 실제 취소 + 취소완료 카드.
    me = await seed_patient(committed_conn)
    appt = await _seed_appointment(committed_conn, me["patient_id"])
    updated_at = await committed_conn.fetchval(
        "select updated_at from appointments where id=$1", appt)
    token = make_token(me["auth_user_id"])
    body = {"cardType": "cancel_confirm", "clientMessageId": str(uuid.uuid4()),
            "payload": {"appointment_id": str(appt), "updated_at": updated_at.isoformat()}}
    with client as c:
        r = c.post("/chat/cards/execute", headers=_bearer(token), json=body)
    assert r.status_code == 200, r.text
    assert r.json()["result"]["payload"]["card_type"] == "cancel_done"
    status = await committed_conn.fetchval("select status from appointments where id=$1", appt)
    assert status == "환자취소"


def test_execute_without_bearer_is_401(client):
    # 실행은 환자 신원이 필요하다 — Bearer 없으면 401.
    with client as c:
        r = c.post("/chat/cards/execute", json={
            "cardType": "booking_confirm", "clientMessageId": str(uuid.uuid4()), "payload": {}})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_execute_unknown_card_type_is_400(client, committed_conn):
    # 실행 계약에 없는 카드 종류는 400(발명 금지).
    me = await seed_patient(committed_conn)
    token = make_token(me["auth_user_id"])
    with client as c:
        r = c.post("/chat/cards/execute", headers=_bearer(token), json={
            "cardType": "questionnaire", "clientMessageId": str(uuid.uuid4()), "payload": {}})
    assert r.status_code == 400
