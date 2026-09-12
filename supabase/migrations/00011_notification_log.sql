-- 섹션4 ② 단일 발송 원장 (ui-design-decisions:3014~3170, 3499~3597, 3615~3626; 3-A 익명 :4554~4651).
-- 등록 환자와 익명 상담 연락처가 같은 dispatcher·배칭·결과/재시도 원장을 쓴다.
-- notification_log는 마이그레이션에 없었고(옛 플랜 00204는 폐기·재번호) 여기서 확장분까지 합쳐 신설한다.
create table notification_log (
  id uuid primary key default gen_random_uuid(),
  -- #110: 광고 발송은 특정 예약이 없어 nullable. 익명 발송은 patient_id도 없다.
  appointment_id uuid references appointments(id),
  patient_id uuid references patients(id),
  -- #115: 누가 보냈나(자동 발송은 null=서버), 전 환자 발송 규모.
  sender_staff_id uuid references staff(id),
  target_count int,
  notification_type text not null,
  -- #110/#104: 광고는 법(정보통신망법)이 달라 시스템이 갈라야 한다.
  kind text not null default 'transactional' check (kind in ('transactional', 'marketing')),
  -- #110: 직원이 직접 쓴 발송 문구를 보존.
  body text,
  -- #120: 실제 보낸 채널을 기록(상수 'push' 박기 금지 — dispatcher 계약).
  channel text not null check (channel in ('push', 'sms')),
  -- #119: 표 이름이 log인데 성공/실패가 없었다. 실패를 system_error_log로 보내면 대상을 담을 수 없다.
  delivery_status text not null default '발송중'
    check (delivery_status in ('발송중', '도달', '실패', '재시도중')),
  failure_code text,           -- #119: 업체 오류 코드(영구/일시 판정)
  retry_count int not null default 0,
  -- 3-A: 익명 수신자(patients 가짜 행/추측 매칭 없이 같은 알림 품질·멱등성).
  anonymous_session_id uuid,
  anonymous_contact_id uuid,
  -- notification_date는 업무 시간대(KST) 고정 — sent_at::date는 세션 시간대에 흔들려 인덱스에 못 쓴다(SDB-04).
  notification_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  sent_at timestamptz not null default now()
);

-- #121: dedup 자물쇠는 유지하되 delivery_status='실패' 줄은 제외한다(안 닿은 안내를 다시 보낼 수 있게).
--       appointment_id가 null인 광고·익명 발송은 dedup 대상이 아니다.
-- 하루 단위 반복(리마인더)은 같은 업무일에 한 번만.
create unique index idx_notification_log_dedup_daily
  on notification_log (appointment_id, notification_type, notification_date)
  where appointment_id is not null
    and delivery_status <> '실패'
    and notification_type in ('reminder_day_before', 'reminder_today');

-- 1회성 이벤트(예약확정 등)는 예약당 한 번만.
create unique index idx_notification_log_dedup_once
  on notification_log (appointment_id, notification_type)
  where appointment_id is not null
    and delivery_status <> '실패'
    and notification_type not in ('reminder_day_before', 'reminder_today');

-- 조회 인덱스: 환자별 발송 이력, 실패 재시도 큐.
create index idx_notification_log_patient on notification_log (patient_id, sent_at desc);
create index idx_notification_log_retry on notification_log (delivery_status)
  where delivery_status in ('실패', '재시도중');

alter table notification_log enable row level security;
grant select on table notification_log to authenticated;

-- 쓰기 정책은 없다: dispatcher가 서비스 역할 커넥션(RLS 우회)으로만 insert/update 한다.
-- 직원 발송 이력 화면(2단계)이 읽는다.
create policy "staff_can_read_notification_log" on notification_log
  for select
  using (private.is_active_staff());

-- 환자 앱 알림함이 본인 알림을 읽는 정책은 3단계(환자 인증 연동)에서 추가한다.
