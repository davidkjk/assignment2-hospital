-- [Task 30][SEND-RESULT-*·SEND-RETRY-*] 발송 결과·실패·재시도 원장 확장 (screen-behaviors 발송결과 절).
-- Task 28은 '발송중' 행을 먼저 쓰기까지(SEND-RESULT-06). 여기서 디스패처가 상태를 굴릴 칸을 붙인다.
--
-- ⚠️ 실제 인프라 대조(2026-08-27, 브리프 전제와 다른 것):
--   - patients.sms_dead / sms_dead_checked_at 는 이미 00014에 있다 → 재추가하지 않는다(SEND-DEAD-07 충족).
--   - notification_log 의 dedup 유니크 인덱스는 이미 00011에서 `delivery_status <> '실패'`를 제외한다
--     → SEND-RESULT-07/#121 은 이미 충족. 여기서 재정의하지 않는다(재작성하면 오히려 회귀 위험).
--   - device_tokens 테이블은 실존하지 않았다(00012 주석에만 언급). SEND-RESULT-03b(죽은 토큰 삭제)가
--     삭제할 대상이 없으므로 최소 형태로 여기서 신설한다. 환자앱(3단계)이 소유·확장을 이어받는다.

-- ── notification_log: 디스패처가 굴리는 상태/재시도/제공자 식별 칸 ──────────────────────────────
alter table notification_log
  -- #120/SEND-RESULT-09: 사용자가 고른 원래 3값(push_sms/push/sms)을 보존한다.
  --   channel(실제 채널)은 폴백 때 뒤집히지만, 무엇을 「고른」 것인지는 이 칸이 지킨다.
  add column requested_channel text
    check (requested_channel is null or requested_channel in ('push_sms', 'push', 'sms')),
  -- SEND-RETRY-01: 다음 자동 재시도 예정 시각(1분 뒤·5분 뒤). 스케줄 워커가 claim 한다.
  add column next_retry_at timestamptz,
  -- SEND-RESULT-02: 업체(Twilio 등) 메시지 id. status callback 이 이 값으로 줄을 찾는다.
  add column provider_message_id text,
  -- SEND-RESULT-01: 진짜 도달/실패 시각(‘접수’가 아니라 실제 결과).
  add column delivered_at timestamptz,
  add column failed_at timestamptz,
  -- SEND-RESULT-11~14: 한 번의 발송(대상 N명)을 묶는 배치 키. 목록이 배치별로 결과를 집계한다
  --   (도달 30·재시도중 2·실패 2). 자동 발송·옛 행은 null → 목록에서 coalesce(batch_id, id)로 홀로 선다.
  add column batch_id uuid,
  -- SEND-BADGE-06: 직원이 「처리했다」고 표시한 시각. 배지에서 빠진다(열기만으로는 안 빠진다).
  add column handled_at timestamptz;

-- 목록의 배치별 결과 집계(SEND-RESULT-11~14).
create index idx_notification_log_batch on notification_log (batch_id) where batch_id is not null;
-- 배지(전화해야 할 것) 조회 — 실패·미처리만.
create index idx_notification_log_badge on notification_log (delivery_status, handled_at)
  where delivery_status = '실패' and handled_at is null;

-- status callback 이 provider_message_id 로 줄을 찾는다(SEND-RESULT-02).
create index idx_notification_log_provider_msg on notification_log (provider_message_id)
  where provider_message_id is not null;

-- ── device_tokens: 푸시 대상 + 죽은 토큰 삭제(SEND-RESULT-03b) ─────────────────────────────────
-- 최소 형태. 환자앱(3단계)이 등록/갱신 정책과 platform·앱버전 등을 이어붙인다.
-- ⚠️ 환자앱(3단계)이 소유·확장할 표라 `if not exists` — 3단계 마이그와 CREATE 충돌 방지
--    (auth_user_id·hospital_settings 공유칸과 같은 교차단계 하드닝).
create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  token text not null unique,        -- FCM 등록 토큰
  platform text,                     -- 'ios' | 'android' (참고용)
  created_at timestamptz not null default now()
);

create index if not exists idx_device_tokens_patient on device_tokens (patient_id);

alter table device_tokens enable row level security;
grant select on table device_tokens to authenticated;
-- 쓰기 정책 없음: 디스패처가 서비스 역할(RLS 우회)로 조회/삭제하고, 환자 본인 등록 정책은 3단계에서 붙는다.
