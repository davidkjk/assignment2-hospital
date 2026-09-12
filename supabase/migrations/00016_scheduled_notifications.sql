-- 섹션4 ⑦ 예약해 둔 발송 (ui-design-decisions:3597~3601).
-- 지금 보내지 않고 예약해 둔 발송을 담는다. 전용 cron(10분)이 때가 된 pending을 발송한다(cron은 배포 플랜).
-- 직원 웹 "안내 보내기"의 예약 목록이 이 표를 읽는다.
-- 수신 대상 지정은 이 표가 아니라 발송 정의만 담고, 대상 해석은 발송 시점 dispatcher가 한다(2단계 소유).
--   ✅ 뒤집힘(2026-08-20, #5 결정 ⓐ): 「발송 시점 재해석」(ⓑ)이 아니라 **예약 순간 명단 고정**으로 바꿨다 —
--   수신자는 staff-web 00049 `scheduled_notification_recipients`에 예약 걸 때 저장하고, claim_scheduled가 그 명단대로 발송한다.
--   (최신 수신거부·죽은번호만 발송 순간 _sms_eligible로 거른다.) 근거=FINAL-SYNTHESIS C1·ui-design-decisions #122 옆.
create table scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  kind text not null default 'transactional' check (kind in ('transactional', 'marketing')),
  body text,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'cancelled')),
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

-- cron이 "때가 된 대기 발송"을 훑는 경로 — 종료된 줄을 제외하는 partial index.
create index idx_scheduled_notifications_due
  on scheduled_notifications (scheduled_at)
  where status = 'pending';

alter table scheduled_notifications enable row level security;
grant select, insert, update on table scheduled_notifications to authenticated;

-- 접수직원·관리자가 예약 발송을 만들고 관리한다(발송 권한과 같은 역할). 조회는 활성 직원.
create policy "staff_can_read_scheduled_notifications" on scheduled_notifications
  for select
  using (private.is_active_staff());

create policy "receptionist_admin_can_insert_scheduled_notifications" on scheduled_notifications
  for insert
  with check (private.current_staff_role() in ('receptionist', 'admin'));

create policy "receptionist_admin_can_update_scheduled_notifications" on scheduled_notifications
  for update
  using (private.current_staff_role() in ('receptionist', 'admin'))
  with check (private.current_staff_role() in ('receptionist', 'admin'));
