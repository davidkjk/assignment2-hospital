alter table hospital_settings
  add column long_wait_threshold_minutes int not null default 30;

create table doctor_quick_phrases (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references staff(id),
  text text not null,
  created_at timestamptz not null default now()
);
alter table doctor_quick_phrases enable row level security;

grant select, insert, update, delete on table doctor_quick_phrases to authenticated;

create policy "staff_can_read_quick_phrases" on doctor_quick_phrases
  for select using (private.is_active_staff());

create policy "doctor_can_manage_own_quick_phrases" on doctor_quick_phrases
  for all
  using (private.current_staff_role() = 'doctor' and private.current_staff_id() = doctor_quick_phrases.doctor_id)
  with check (private.current_staff_role() = 'doctor' and private.current_staff_id() = doctor_quick_phrases.doctor_id);
