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
async def test_no_answer_message_returns_chips_keeps_session_and_logs_unresolved(committed_conn):
    # WEBCHAT-NOANS: 봇이 못 답하면(빈 KB → no_answer) 자동 인계·자동 티켓을 만들지 않는다(폐기) →
    #   봇 안내 말풍선 + quick_replies 카드(FAQ 칩 + [직원에게 연결]). 세션은 active 유지, 미해결은 티켓 없이(null) 기록.
    q = "우리 동네 약국 어디"
    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)
    out = await chat_flow_service.handle_patient_message(
        s, q, thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=_RagModel())
    assert out["route_taken"] == "no_answer"
    assert out["card"]["card_type"] == "quick_replies" and out["card"]["handoff_chip"] == "직원에게 연결"
    # 자동 인계 없음 — 티켓 0, 세션 active 유지.
    assert await committed_conn.fetchval("select count(*) from support_tickets where thread_id=$1", t) == 0
    assert await committed_conn.fetchval("select status from ai_chat_sessions where id=$1", s["id"]) == "active"
    # 봇 안내 말풍선(text) 1 + quick_replies 카드(card) 1 저장.
    assert await committed_conn.fetchval(
        "select count(*) from chat_messages where thread_id=$1 and sender_type='bot' and message_type='text'", t) == 1
    assert await committed_conn.fetchval(
        "select count(*) from chat_messages where thread_id=$1 and message_type='card'", t) == 1
    # 미해결 질문은 티켓 없이(null) 기록(모든 no_answer 로깅 = 결정 B).
    assert await committed_conn.fetchval(
        "select count(*) from unresolved_questions where ticket_id is null and question_text=$1", q) == 1
    # cleanup
    await committed_conn.execute("delete from unresolved_questions where question_text=$1", q)
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
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
