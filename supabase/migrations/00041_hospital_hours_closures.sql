-- 갭 #96 — 운영시간(접수 창구)·병원 휴무 두 표. (Task 17)
--
-- ⭐ hospital_hours와 doctor_schedule_rules는 「다른 것을 재는 자」다(SCHED-HOURS-03·05).
--    hospital_hours = 접수 창구가 열린 시간(상담봇의 "지금 문 열었나" = is_open이 읽는 유일한 곳).
--    doctor_schedule_rules = 그 의사가 진료하는 시간(슬롯을 만드는 근거).
--    한 표로 합치면 "토요일은 접수를 1시에 닫고 예약 환자만 마저 본다"를 표현할 수 없다(SCHED-HOURS-17d).
--
-- ⭐ hospital_closures(갭 #96): 병원 전체 종일 휴무 한 줄 = 날짜 하나.
--    Task 2 list_affected_appointments가 closure_date를 「종일 휴무」로 읽는다(is_closed 칸 없음 = 늘 휴무).
--    옛 hospital_hour_exceptions는 만들지 않는다 — 경고 장치(그날 예약 N건)가 /admin/schedule 한 곳에만
--    있어야, 경고가 싫은 관리자가 경고 없는 문으로 돌아가지 못한다(SCHED-EXC-16·17).

create table hospital_hours (
  weekday smallint primary key check (weekday between 0 and 6),  -- Python date.weekday(): 월=0 … 일=6
  open_time time not null,
  close_time time not null,
  lunch_start time,
  lunch_end time,
  updated_by uuid references staff(id),
  updated_at timestamptz not null default now()
);

create table hospital_closures (
  closure_date date primary key,
  memo text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table hospital_hours enable row level security;
alter table hospital_closures enable row level security;

grant select, insert, update, delete on table hospital_hours to authenticated;
grant select, insert, update, delete on table hospital_closures to authenticated;

-- 운영시간·휴무는 활성 직원 누구나 읽고(상담봇·캘린더가 읽어야 한다), 관리자만 고친다.
create policy "staff_read_hospital_hours" on hospital_hours
  for select using (private.is_active_staff());
create policy "admin_manage_hospital_hours" on hospital_hours
  for all using (private.is_admin()) with check (private.is_admin());

create policy "staff_read_hospital_closures" on hospital_closures
  for select using (private.is_active_staff());
create policy "admin_manage_hospital_closures" on hospital_closures
  for all using (private.is_admin()) with check (private.is_admin());
