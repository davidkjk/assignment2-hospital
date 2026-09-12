import uuid
import pytest

from app.services.chat import quality_service, answer_feedback_service
from tests.conftest import seed_staff, seed_patient
from tests.conftest_chat import seed_chat_thread, FakeEmbedder


@pytest.mark.asyncio
async def test_unreviewed_sorts_first_and_distinguishes_ok(committed_conn):
    p = await seed_patient(committed_conn)
    # 한 thread에 활성 세션은 하나만(Task 2 idx_ai_sessions_one_active) → 세션 둘은 thread를 분리한다.
    t_old = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    t_new = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    st = await seed_staff(committed_conn, role="admin")
    s_old = await committed_conn.fetchval(
        "insert into ai_chat_sessions (thread_id, expires_at, created_at) values ($1, now(), now()-interval '1 day') returning id", t_old)
    s_new = await committed_conn.fetchval(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()) returning id", t_new)
    await quality_service.mark_reviewed(s_new, st["staff_id"], status="ok")  # 새 세션은 문제없음
    rows = await quality_service.list_sessions_unreviewed_first(limit=10)
    ids = [r["id"] for r in rows]
    # 미검토(s_old)가 검토완료(s_new)보다 앞. s_new는 review_status='ok'로 "아직 안 봄"과 구분됨.
    assert ids.index(s_old) < ids.index(s_new)
    assert next(r for r in rows if r["id"] == s_new)["review_status"] == "ok"
    assert next(r for r in rows if r["id"] == s_old)["review_status"] is None
    for sid in (s_old, s_new):
        await committed_conn.execute("delete from chat_quality_reviews where ai_chat_session_id=$1", sid)
        await committed_conn.execute("delete from ai_chat_sessions where id=$1", sid)
    await committed_conn.execute("delete from chat_threads where id = any($1::uuid[])", [t_old, t_new])
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_apply_feedback_adds_example_but_not_live_kb(committed_conn):
    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    st = await seed_staff(committed_conn, role="admin")
    # 봇 메시지는 그 thread에 속한 실제 AI 세션이 필요(Task 2 트리거).
    sess = await committed_conn.fetchval(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()) returning id", t)
    m = await committed_conn.fetchval(
        "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content) "
        "values ($1,$2,'bot','text','틀린 답') returning id", t, sess)
    fb = await answer_feedback_service.report(m, st["staff_id"], correction_text="맞는 답",
                                              source="quality_review", add_to_example_bank=True)
    await answer_feedback_service.apply(fb["id"], st["staff_id"], FakeEmbedder())
    status = await committed_conn.fetchval("select status from answer_feedback where id=$1", fb["id"])
    n = await committed_conn.fetchval("select count(*) from qa_example_bank where source_feedback_id=$1", fb["id"])
    assert status == "applied" and n == 1   # 예시은행엔 들어가되 KB 라이브는 승인 경유(여기선 KB 미지정)
    await committed_conn.execute("delete from qa_example_bank where source_feedback_id=$1", fb["id"])
    await committed_conn.execute("delete from answer_feedback where id=$1", fb["id"])
    await committed_conn.execute("delete from chat_messages where id=$1", m)
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", sess)
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])
