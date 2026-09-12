-- [Task 28][결정#29·#5 ⓐ] 예약 발송 취소 이력 + 수신자 명단 고정.
-- 00016(scheduled_notifications)에는 status만 있고, ①취소자·시각 ②발송 채널·표시 인원 ③수신자 명단
-- 을 담을 자리가 없었다(2026-08-17 grep 확인). 여기서 신설한다. ⚠️ 파일 작성 ≠ 원격 적용.

-- 결정#29 — 예약 취소는 취소자·시각을 남긴다(발송 이력 「취소됨」, 시스템 오류로 안 보낸다).
-- C2-#5 파생 — enqueue_send가 쓰는데 00016에 없던 칸: channel(발송 채널)·target_count(표시용 인원).
alter table scheduled_notifications
  add column if not exists cancelled_by uuid references staff(id),
  add column if not exists cancelled_at timestamptz,
  add column if not exists channel text check (channel in ('push', 'sms')),
  add column if not exists target_count int;

-- 결정#5 ⓐ(2026-08-20): 예약 발송 수신자 명단을 예약 순간 고정한다(발송 때 재해석 X).
-- 00016 주석의 「대상은 발송 시점 dispatcher가 해석」(ⓑ)을 뒤집는다 → 명단 고정(ⓐ).
-- 최신 수신거부·죽은번호만 발송 순간 _sms_eligible(Task30)가 거른다.
create table if not exists scheduled_notification_recipients (
  scheduled_notification_id uuid not null
    references scheduled_notifications(id) on delete cascade,
  patient_id uuid not null references patients(id),
  primary key (scheduled_notification_id, patient_id)
);

alter table scheduled_notification_recipients enable row level security;
grant select, insert on table scheduled_notification_recipients to authenticated;

-- RLS는 부모 표(00016)와 같은 패턴: 활성 직원 조회, 접수직원·관리자 insert.
create policy "staff_read_scheduled_recipients" on scheduled_notification_recipients
  for select
  using (private.is_active_staff());

create policy "reception_admin_insert_scheduled_recipients" on scheduled_notification_recipients
  for insert
  with check (private.current_staff_role() in ('receptionist', 'admin'));
