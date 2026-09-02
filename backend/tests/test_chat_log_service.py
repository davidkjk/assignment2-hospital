import datetime
import uuid

import pytest

from app.services.chat.chat_log_service import _LOGS_SQL, _SOURCES_SQL, _CONV_SQL, _COUNTS_SQL
from app.services.chat.ticket_service import _row_to_patient_ticket, _PATIENT_TICKETS_SQL
from tests.conftest import seed_staff, seed_patient, set_session_auth
from tests.conftest_chat import seed_chat_thread

BASE = datetime.datetime(2026, 8, 19, 9, 0, tzinfo=datetime.timezone.utc)


async def _session(conn, thread_id):
    # 모든 메시지는 ai_chat_session 또는 support_ticket에 속해야 한다(chat_messages_session_ticket_xor, Task 2).
    return await conn.fetchval(
        "insert into ai_chat_sessions (thread_id, status, expires_at) values ($1,'active', now()+interval '30 min') returning id",
        thread_id)


async def _msg(conn, thread_id, session_id, sender_type, content, *, at, route_taken=None, patient_id=None):
    return await conn.fetchval(
        """insert into chat_messages
             (thread_id, ai_chat_session_id, sender_type, sender_patient_id, message_type, content, route_taken, created_at)
           values ($1,$2,$3,$4,'text',$5,$6,$7) returning id""",
        thread_id, session_id, sender_type, patient_id, content, route_taken, at)


# ── 순수 매핑(_row_to_patient_ticket) — DB 없이, §0 모르는 사유 금지 ──────────────────────────
def _prow(**over):
    base = {"id": "t1", "patient_id": "p1", "status": "pending",
            "created_at": "2026-08-19T00:00:00", "question": "약 정보", "bot_answer": None, "reason_code": None}
    base.update(over)
    return base


def test_patient_ticket_maps_reason_code_to_sentence_never_raw():
    assert _row_to_patient_ticket(_prow(reason_code="medical_judgment"))["handoff_reason"] == "진단·치료 판단이 필요합니다"
    # 사유가 없으면 지어내지 않고 None(§0) — 원시 코드도 노출하지 않는다.
    assert _row_to_patient_ticket(_prow(reason_code=None))["handoff_reason"] is None


def test_patient_ticket_carries_core_fields_verbatim():
    dto = _row_to_patient_ticket(_prow(id="abc", status="answered", question="예약 바꾸고 싶어요", bot_answer="안내드렸습니다"))
    assert dto["id"] == "abc" and dto["status"] == "answered"
    assert dto["question"] == "예약 바꾸고 싶어요" and dto["bot_answer"] == "안내드렸습니다"


# ── SQL 통합 — 관리자 전수 열람(00079) + 파생·정렬·범위 ──────────────────────────────────────
@pytest.mark.asyncio
async def test_logs_derive_channel_and_route_and_filter(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    p = await seed_patient(db_conn)
    app_th = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    anon = await db_conn.fetchval(
        "insert into anonymous_chat_sessions (token_hash) values ($1) returning id", "h-" + uuid.uuid4().hex)
    web_th = await seed_chat_thread(db_conn, anonymous_session_id=anon)
    app_s = await _session(db_conn, app_th)
    web_s = await _session(db_conn, web_th)
    await _msg(db_conn, app_th, app_s, "patient", "두통이 심해요", at=BASE, patient_id=p["patient_id"])
    await _msg(db_conn, app_th, app_s, "bot", "자료를 안내합니다", at=BASE + datetime.timedelta(minutes=1), route_taken="rag")
    await _msg(db_conn, web_th, web_s, "bot", "직원에게 연결합니다", at=BASE + datetime.timedelta(minutes=2), route_taken="handoff")

    await set_session_auth(db_conn, admin["auth_user_id"])
    rows = await db_conn.fetch(_LOGS_SQL, None, None, None, None)
    by_ch = {r["channel"]: r for r in rows}
    assert by_ch["app"]["route_taken"] == "rag" and by_ch["app"]["summary"] == "두통이 심해요"  # owner_type→app 파생
    assert by_ch["web"]["route_taken"] == "handoff"  # anonymous_web→web 파생

    only_web = await db_conn.fetch(_LOGS_SQL, "web", None, None, None)
    assert [r["channel"] for r in only_web] == ["web"]  # channel 필터
    only_rag = await db_conn.fetch(_LOGS_SQL, None, "rag", None, None)
    assert [r["route_taken"] for r in only_rag] == ["rag"]  # route_taken 필터


@pytest.mark.asyncio
async def test_counts_group_by_route_and_respect_channel(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    p = await seed_patient(db_conn)
    t1 = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    t2 = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    s1 = await _session(db_conn, t1)
    s2 = await _session(db_conn, t2)
    await _msg(db_conn, t1, s1, "bot", "a", at=BASE, route_taken="rag")
    await _msg(db_conn, t2, s2, "bot", "b", at=BASE, route_taken="handoff")

    await set_session_auth(db_conn, admin["auth_user_id"])
    rows = await db_conn.fetch(_COUNTS_SQL, None, None, None)
    by = {r["route_taken"]: r["n"] for r in rows}
    assert by["rag"] == 1 and by["handoff"] == 1  # 갈래별 그룹
    # 기간을 앞 날짜로 좁히면 아무 것도 안 잡힌다(날짜 필터).
    empty = await db_conn.fetch(_COUNTS_SQL, None, "2020-01-01", "2020-01-02")
    assert sum(r["n"] for r in empty) == 0


@pytest.mark.asyncio
async def test_sources_ordered_by_rank_admin_only(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    p = await seed_patient(db_conn)
    th = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    s = await _session(db_conn, th)
    bot = await _msg(db_conn, th, s, "bot", "지하 2층입니다", at=BASE, route_taken="rag")
    await db_conn.execute(
        "insert into chat_message_sources (message_id, rank, similarity, title_snapshot, body_snapshot) "
        "values ($1,2,0.7,'B','b'),($1,1,0.9,'주차 안내','지하 2층')", bot)

    await set_session_auth(db_conn, admin["auth_user_id"])
    rows = await db_conn.fetch(_SOURCES_SQL, bot)
    assert [r["rank"] for r in rows] == [1, 2]  # rank 오름차순
    assert rows[0]["title_snapshot"] == "주차 안내" and rows[0]["similarity"] == pytest.approx(0.9)


@pytest.mark.asyncio
async def test_conversation_maps_bot_to_ai_in_order(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    p = await seed_patient(db_conn)
    th = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    s = await _session(db_conn, th)
    await _msg(db_conn, th, s, "patient", "질문", at=BASE, patient_id=p["patient_id"])
    await _msg(db_conn, th, s, "bot", "답변", at=BASE + datetime.timedelta(minutes=1), route_taken="rag")

    await set_session_auth(db_conn, admin["auth_user_id"])
    rows = await db_conn.fetch(_CONV_SQL, th)
    assert [r["sender"] for r in rows] == ["patient", "ai"]  # bot→ai 변환·시간순
    assert rows[0]["body"] == "질문"


@pytest.mark.asyncio
async def test_patient_tickets_scoped_latest_first_with_question(db_conn):
    st = await seed_staff(db_conn, role="receptionist")
    p1 = await seed_patient(db_conn, name="갑")
    p2 = await seed_patient(db_conn, name="을")
    th1 = await seed_chat_thread(db_conn, patient_id=p1["patient_id"])
    th2 = await seed_chat_thread(db_conn, patient_id=p2["patient_id"])
    s1 = await _session(db_conn, th1)
    s2 = await _session(db_conn, th2)
    await _msg(db_conn, th1, s1, "patient", "약 정보 문의", at=BASE, patient_id=p1["patient_id"])
    await _msg(db_conn, th2, s2, "patient", "남의 것", at=BASE, patient_id=p2["patient_id"])
    # 한 스레드에 열린 티켓은 하나뿐(idx_tickets_one_open) — 옛 티켓은 answered(재문의로 새 티켓).
    old = await db_conn.fetchval(
        "insert into support_tickets (thread_id, created_at, status, closed_by_staff_id, closed_at) "
        "values ($1,$2,'answered',$3,$2) returning id", th1, BASE, st["staff_id"])
    new = await db_conn.fetchval(
        "insert into support_tickets (thread_id, created_at, previous_ticket_id) values ($1,$2,$3) returning id",
        th1, BASE + datetime.timedelta(hours=1), old)

    await set_session_auth(db_conn, st["auth_user_id"])
    rows = await db_conn.fetch(_PATIENT_TICKETS_SQL, p1["patient_id"])
    ids = [r["id"] for r in rows]
    assert ids == [str(new), str(old)]  # 최신순
    assert all(r["patient_id"] == str(p1["patient_id"]) for r in rows)  # p2('남의 것') 안 섞임
    assert rows[0]["question"] == "약 정보 문의"  # 첫 환자 메시지 파생
