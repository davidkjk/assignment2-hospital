create table doctor_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references staff(id),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes smallint not null,
  lunch_start time,
  lunch_end time,
  max_daily_appointments int not null,
  booking_deadline time,
  -- [정합성 검토 R3-01] 의사당 요일별 규칙은 정확히 1행이어야 한다. 이 제약이 없으면
  -- 2단계 schedule_service.upsert_schedule_rule()의 "SELECT로 존재 확인 후 UPDATE/INSERT"가
  -- 동시 저장 요청 사이에서 경쟁해 같은 (doctor_id, weekday)에 중복 행을 만들 수 있다.
  unique (doctor_id, weekday)
);

create table doctor_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references staff(id),
  exception_date date not null,
  is_closed boolean not null default true,
  override_start_time time,
  override_end_time time,
  unique (doctor_id, exception_date)
);

alter table doctor_schedule_rules enable row level security;
alter table doctor_schedule_exceptions enable row level security;

grant select, insert, update on table doctor_schedule_rules to authenticated;
grant select, insert, update on table doctor_schedule_exceptions to authenticated;

create policy "staff_can_read_schedule_rules" on doctor_schedule_rules
  for select
  using (private.is_active_staff());

create policy "admin_can_manage_schedule_rules" on doctor_schedule_rules
  for all
  using (private.is_admin())
  with check (private.is_admin());

create policy "staff_can_read_schedule_exceptions" on doctor_schedule_exceptions
  for select
  using (private.is_active_staff());

create policy "admin_can_manage_schedule_exceptions" on doctor_schedule_exceptions
  for all
  using (private.is_admin())
  with check (private.is_admin());
