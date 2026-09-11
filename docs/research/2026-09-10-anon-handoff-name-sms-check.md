# 익명 인계 폼의 이름 표시 · 전화번호 SMS 발송 점검 (2026-09-10)

- 발단(사용자): "직원 연결 시 웹챗에서 이름·전화번호를 적는데 ⑴ 그 이름이 직원웹에 뜨는 곳이 없는 것 같다 ⑵ 전화번호가 실제 저장돼 직원 답장 시 그 번호로 문자가 가는지 확인해달라."
- 결론: **둘 다 코드상 구현돼 있음.** 단 이름은 눈에 덜 띄는 인라인 표시라 개선 여지, SMS 실발송은 배포 설정(cron·Solapi 키) 의존.

## 1. 이름 — 저장·표시됨(단, 전용 헤더 칸 없이 인라인)
- 저장: `webchat_service.create_anonymous_handoff`가 이름을 **시스템 메시지 payload** `{event:'anonymous_handoff', name, summary}`로 스레드에 남긴다(`webchat_service.py:529-532`).
- 표시: 직원 상세 대화 SQL이 그 시스템 메시지를 **`상담 신청자: <이름>`** 말풍선으로 변환해 대화 타임라인에 보여준다(`ticket_service.py:246-247`, 회귀 테스트 `test_detail_shows_anonymous_applicant_name_from_payload`). 이름 미기재면 `(이름 미기재)`.
- ⚠️ **전용 "신청자" 헤더/배지는 없다** — 대화 흐름 안 시스템 줄로만 보여 눈에 덜 띈다. 사용자가 "안 뜬다"고 느낀 원인일 수 있음. → **개선 후보(세션4/프론트)**: `TicketDetail` 헤더에 신청자 이름 배지(frontend-design). 데이터는 이미 있으므로 표시만 추가.

## 2. 전화번호 — 저장·발송 경로 완비(실발송은 배포 설정 의존)
- 저장: 평문 저장 금지 — **암호화(발송 폴백용)+SHA256 해시(대조용)**로만. `record_verified_anonymous_contact(session_id, ciphertext, phone_hash)`(`webchat_service.py:522-527`). 용도는 **직원 답변 SMS 수신용만**(WEBANON-HANDOFF-03).
- 발송 경로(직원 답장 시):
  1. `staff_send_message` → `enqueue_after_reply` → `enqueue_staff_reply_notification` = **알림 배치 생성(실발송 아님)**.
  2. **cron** `python -m app.jobs.dispatch`(배포가 몇 분 간격 실행) → `chat_notification_service.dispatch_pending_batches` → `dispatch_service`.
  3. `dispatch_service.py:173-178`: 수신자가 `patient_id is None && anonymous_contact_id`이면 **`_anonymous_phone`로 복호화 → `sms_send(phone, body)`**.
  4. `sms_send`→`_provider_sms`→**`solapi_client.send`**(`dispatch_service.py:50-58`). 제공자=**Solapi**(`notify_clients`도 solapi). 키 없으면 개발 폴백=로그만·`queued`(실발송 X).
- ✅ **코드는 익명 연락처를 복호화해 Solapi로 실제 발송하도록 완비**.
- ⚠️ **실제로 문자가 가려면 배포 조건 2개**(배포 트랙 검증 사항, 코드 아님):
  1. **디스패처 cron이 프로덕션에서 주기 실행** 중이어야 함(`python -m app.jobs.dispatch`) — Railway cron/스케줄 설정.
  2. **Solapi 발송 env 키**가 배포에 설정돼야 함(없으면 `get_solapi_client()==None` → 로그만). 관련 메모리 [[deployment-prep-state]](솔라피 배선).

## 다음(사용자 확인 후)
- (프론트, 소) 상세 헤더에 신청자 이름 배지 추가 여부 — 결정 필요(현재도 대화 안엔 뜸).
- (배포 검증) 디스패처 cron 실행 + Solapi 키 실증 → 익명 인계에 실제 문자 1건 종단 확인.
