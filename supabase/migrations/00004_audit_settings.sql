create table access_audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  patient_id uuid not null references patients(id),
  resource_type text not null check (resource_type in ('patient_detail', 'medical_record')),
  accessed_at timestamptz not null default now()
);

create table system_error_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  feature text not null,
  message text not null
);

create table patient_internal_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  staff_id uuid not null references staff(id),
  content text not null,
  created_at timestamptz not null default now()
);

create table hospital_settings (
  id boolean primary key default true check (id),
  cancellation_deadline_hours int not null default 24
);
insert into hospital_settings (id, cancellation_deadline_hours) values (true, 24);

alter table access_audit_log enable row level security;
alter table system_error_log enable row level security;
alter table patient_internal_notes enable row level security;
alter table hospital_settings enable row level security;

grant select, insert on table access_audit_log to authenticated;
grant select on table system_error_log to authenticated;
grant select, insert on table patient_internal_notes to authenticated;
grant select, update on table hospital_settings to authenticated;

create policy "staff_can_insert_own_audit_log" on access_audit_log
  for insert
  with check (private.current_staff_id() = access_audit_log.staff_id);

create policy "admin_can_read_audit_log" on access_audit_log
  for select
  using (private.is_admin());

create policy "admin_can_read_error_log" on system_error_log
  for select
  using (private.is_admin());

create policy "staff_can_read_internal_notes" on patient_internal_notes
  for select
  using (private.is_active_staff());

create policy "staff_can_insert_own_internal_notes" on patient_internal_notes
  for insert
  with check (private.current_staff_id() = patient_internal_notes.staff_id);

create policy "staff_can_read_hospital_settings" on hospital_settings
  for select
  using (private.is_active_staff());

create policy "admin_can_update_hospital_settings" on hospital_settings
  for update
  using (private.is_admin())
  with check (private.is_admin());
