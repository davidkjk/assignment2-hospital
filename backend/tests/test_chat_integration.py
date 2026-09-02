import uuid
import pytest

from app.services.chat import chat_flow_service
from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread, FakeEmbedder


class _RagModel:
    async def ainvoke(self, _):
        class R: content = "rag"      # 라우터가 rag로 분류
        return R()


@pytest.mark.asyncio
async def test_no_answer_message_creates_handoff_ticket_and_unresolved(committed_conn):
    # §8 파이프라인: 봇이 못 답하면(빈 KB → no_answer) 티켓 생성 + 미해결 기록 + AI 세션 staff_handoff 종료.
    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)
    out = await chat_flow_service.handle_patient_message(
        s, "우리 동네 약국 어디", thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=_RagModel())
    assert out["route_taken"] == "handoff" and out["reason"] == "no_answer"
    tk = await committed_conn.fetchrow("select status from support_tickets where id=$1", out["ticket_id"])
    assert tk["status"] == "pending"
    assert await committed_conn.fetchval(
        "select count(*) from unresolved_questions where ticket_id=$1", out["ticket_id"]) == 1
    assert await committed_conn.fetchval(
        "select status from ai_chat_sessions where id=$1", s["id"]) == "ended"
    # cleanup
    await committed_conn.execute("delete from unresolved_questions where ticket_id=$1", out["ticket_id"])
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
    await committed_conn.execute("delete from support_tickets where id=$1", out["ticket_id"])
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])


# 나머지 §8 추적: 아래는 단위 테스트가 이미 보증한다. 통합에서 재확인할 항목만 여기에 둔다.
#  §8-1 두 직원 claim 한 명 승 ......... test_ticket_service.test_two_staff_claim_only_one_wins
#  §8-2 send 유지·close만 answered ...... test_ticket_service.test_send_keeps_in_progress_only_close_answers
#  §8-3 완료 티켓 재개불가·재문의 새 PK .. test_ticket_service.test_closed_ticket_rejects_message_and_reticket_makes_new
#  §8-4 동일 client_message_id 한 행 ..... test_ticket_service.test_duplicate_client_message_id_makes_one_row
#  §8-5 만료 배치↔활동 상호배제 ......... test_ai_session_service.test_expire_batch_and_activity_are_mutually_exclusive
#  §8-6 연속 답변 한 배치 ............... test_chat_notification_batching.test_consecutive_replies_make_one_batch
#  §8-7 확인 후 새 배치 ................. test_chat_notification_batching.test_ack_then_new_reply_makes_new_batch
#  §8-8 보고 있으면 배치 없음 ........... test_chat_notification_batching.test_viewing_makes_no_batch_and_marks_read
#  §8-9 익명 해시=환자여도 미연결 ....... test_chat_notification_batching.test_anonymous_hash_matching_patient_does_not_link
#  §8-11 익명도 SMS 대상·patient_id null . test_chat_notification_batching.test_anonymous_verified_contact_gets_batch_with_null_patient
#  §8-12 두 경로 같은 파이프라인 ........ (위 6·11이 함께 보증) + notification_recipient.resolve_recipient
#  §8-10 Realtime 재연결 커서 복원 ...... 구현 시 통합(커서 조회는 chat_messages(thread_id, created_at, id) 인덱스)
