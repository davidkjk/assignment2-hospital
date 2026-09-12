"""상담 답변 알림 발송 다리 — 소유·시그니처만 확정(C1-1, 2026-08-20). 본문 배선은 ⑦.

이 다리는 챗봇 Task 3가 **소유·계약**한다(배포는 소비 선언만 · deployment:1266).
공통 dispatcher(직원웹 T30 dispatch_service + 배포 cron)가 이 함수를 통해 상담 배치를 처리한다.

계약(⑦에서 본문 구현):
  dispatch_pending_batches(conn) -> int
    - `notification_requested_at`은 있고 `notification_log` 행이 아직 없는
      `chat_notification_batches`를 돈다.
    - 각 배치를 `notification_recipient.resolve_recipient`로 풀어 `notification_log` 행을 만든다:
        · 등록 환자 = `notify_patient` 대상
        · 익명       = `support_answered` · sms · transactional
                       + `chat_notification_batch_id`(unique) + `anonymous_contact_id`
                         (T30 send_now._recipient_phone이 이 칸의 ciphertext를 복호화 — #2 결정 ⓐ)
    - 실제 발송은 T30 `send_now`가 그 log 행을 집어 간다.
    - 반환 = 처리 건수.
"""


async def dispatch_pending_batches(conn, *, push_send=None, sms_send=None) -> int:
    """[§5·§8] 알림 요청된(아직 안 보낸) 상담 배치를 돌며 발송 log를 만들고 send_now로 보낸다.

    등록 환자 = 계정 알림(support_answered) / 익명 = 검증 연락처(dispatcher가 복호화)로 문자.
    배치당 log 한 줄을 만들어 chat_notification_batch_id로 잇고, 그걸 「이미 보냄」 표식으로 쓴다
    (재실행 시 중복 발송 방지). 반환 = 처리한 배치 수. cron이 주기 실행한다(배포).
    """
    from app.services import dispatch_service
    from app.services.notification_service import MESSAGES

    body = MESSAGES.get("support_answered", "상담 답변이 도착했습니다.")
    rows = await conn.fetch(
        "select id, recipient_type, recipient_patient_id, recipient_anonymous_session_id, "
        "recipient_anonymous_contact_id from chat_notification_batches b "
        "where notification_requested_at is not null "
        "and not exists (select 1 from notification_log n where n.chat_notification_batch_id = b.id) "
        "order by notification_requested_at asc for update skip locked")
    count = 0
    for b in rows:
        if b["recipient_type"] == "patient":
            # 계정 있는 환자 — 기존 채널 규칙(푸시 우선·문자 폴백)에 맡긴다.
            nid = await conn.fetchval(
                "insert into notification_log "
                "(patient_id, notification_type, kind, body, channel, requested_channel, "
                " delivery_status, chat_notification_batch_id) "
                "values ($1,'support_answered','transactional',$2,'push','push_sms','발송중',$3) returning id",
                b["recipient_patient_id"], body, b["id"])
        else:
            # 익명 웹상담 — 항상 문자·transactional. 전화는 dispatcher가 연락처 암호문을 복호화한다.
            nid = await conn.fetchval(
                "insert into notification_log "
                "(notification_type, kind, body, channel, requested_channel, delivery_status, "
                " anonymous_session_id, anonymous_contact_id, chat_notification_batch_id) "
                "values ('support_answered','transactional',$1,'sms','sms','발송중',$2,$3,$4) returning id",
                body, b["recipient_anonymous_session_id"], b["recipient_anonymous_contact_id"], b["id"])
        await dispatch_service.send_now([nid], conn, push_send=push_send, sms_send=sms_send)
        count += 1
    return count
