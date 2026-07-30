create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birth_date date not null,
  gender text not null,
  phone text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table patient_family_links (
  id uuid primary key default gen_random_uuid(),
  account_patient_id uuid not null references patients(id),
  family_patient_id uuid not null references patients(id),
  relation text not null,
  is_active boolean not null default true,
  unlinked_at timestamptz,
  unique (account_patient_id, family_patient_id)
);
-- [정합성 검토 R5-02] is_active/unlinked_at: 가족 연결 해제 시 이 링크만 비활성화한다.
-- patient_owns()(3단계)는 is_active = true인 링크만 유효하게 인정한다.

alter table patients enable row level security;
alter table patient_family_links enable row level security;

grant select, insert, update on table patients to authenticated;
grant select on table patient_family_links to authenticated;

-- [정합성 검토 SDB-06] 접수직원·관리자는 전체 환자를 조회해야 운영이 가능하므로 그대로 둔다.
-- 의사의 조회 범위는 이 마이그레이션 시점에는 아직 appointments 테이블이 없어 결정할 수 없다.
-- Task 4(00004_appointments.sql)에서 doctor_can_view_appointment() 근처에 doctor_can_view_patient()를
-- 정의하고 "doctor_can_read_scoped_patients" 정책을 별도로 추가한다 — 의사는 본인 담당 예약 또는
-- 진료 연속성 규칙에 연결된 환자만 조회할 수 있어야 한다(다른 의사만 담당하는 환자는 볼 수 없다).
create policy "receptionist_admin_can_read_patients" on patients
  for select
  using (private.current_staff_role() in ('receptionist', 'admin'));

create policy "receptionist_admin_can_insert_patients" on patients
  for insert
  with check (private.current_staff_role() in ('receptionist', 'admin'));

create policy "receptionist_admin_can_update_patients" on patients
  for update
  using (private.current_staff_role() in ('receptionist', 'admin'))
  with check (private.current_staff_role() in ('receptionist', 'admin'));

create policy "staff_can_read_family_links" on patient_family_links
  for select
  using (private.is_active_staff());
