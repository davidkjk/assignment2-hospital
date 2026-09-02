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


async def dispatch_pending_batches(conn) -> int:
    # 본문 배선은 ⑦(라우터+통합). Task 3은 이름·시그니처·소유만 확정한다.
    raise NotImplementedError(
        "dispatch_pending_batches 본문은 ⑦ 배선에서 구현한다(공통 dispatcher가 소비하는 계약만 여기서 확정).")
