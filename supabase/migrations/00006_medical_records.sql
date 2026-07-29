create table medical_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) unique,
  doctor_id uuid not null references staff(id),
  symptoms text,
  diagnosis text,
  treatment text,
  patient_visible_notes text,
  is_completed boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table medical_record_revisions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references medical_records(id),
  previous_content jsonb not null,
  revised_by uuid not null references staff(id),
  reason text not null,
  revised_at timestamptz not null default now()
);

alter table medical_records enable row level security;
alter table medical_record_revisions enable row level security;

grant select, insert, update on table medical_records to authenticated;
grant select, insert on table medical_record_revisions to authenticated;

-- [정합성 검토 R2-02] Task 5의 doctor_can_view_appointment()를 그대로 재사용한다.
create policy "staff_can_read_medical_records" on medical_records
  for select
  using (
    private.current_staff_role() in ('receptionist', 'admin')
    or doctor_can_view_appointment(appointment_id)
  );

create policy "doctor_can_insert_own_medical_records" on medical_records
  for insert
  with check (private.current_staff_role() = 'doctor' and private.current_staff_id() = medical_records.doctor_id);

create policy "doctor_can_update_own_medical_records" on medical_records
  for update
  using (private.current_staff_role() = 'doctor' and private.current_staff_id() = medical_records.doctor_id)
  with check (private.current_staff_role() = 'doctor' and private.current_staff_id() = medical_records.doctor_id);

-- [정합성 검토 R2-02] medical_record_revisions은 record_id로만 연결되므로 medical_records를 거쳐 appointment_id를 찾는다.
create policy "staff_can_read_revisions" on medical_record_revisions
  for select
  using (
    private.current_staff_role() in ('receptionist', 'admin')
    or doctor_can_view_appointment((select appointment_id from medical_records where id = medical_record_revisions.record_id))
  );

create policy "doctor_can_insert_own_revisions" on medical_record_revisions
  for insert
  with check (private.current_staff_role() = 'doctor' and private.current_staff_id() = medical_record_revisions.revised_by);

-- ── 치명적 규칙은 DB가 최종 심판 ──────────────────────────────────────────
-- ①: medical_records.doctor_id는 반드시 해당 appointment_id의 실제 담당의와 같아야 한다.
-- RLS의 "s.id = medical_records.doctor_id" 검사만으로는, 의사가 자기 id를 doctor_id로 넣은 채
-- "남의 예약"에 기록을 다는 것까지는 막지 못한다 — 이 트리거가 그 구멍을 메운다.
create or replace function enforce_medical_record_doctor_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt_doctor uuid;
begin
  select doctor_id into v_appt_doctor from public.appointments where id = new.appointment_id;
  if v_appt_doctor is distinct from new.doctor_id then
    raise exception '해당 예약의 담당의만 진료기록을 작성할 수 있습니다.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_medical_record_doctor_match
  before insert or update of doctor_id, appointment_id on medical_records
  for each row execute function enforce_medical_record_doctor_match();

-- ②: 완료된 진료기록은 revise_medical_record() RPC로만 수정 가능하다.
-- 직접 UPDATE(Supabase 클라이언트 포함)는 사유·이력·낙관적 잠금을 모두 우회하므로 차단한다.
create or replace function block_direct_update_of_completed_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_completed and coalesce(current_setting('app.via_revise_rpc', true), 'false') <> 'true' then
    raise exception '완료된 진료기록은 수정 사유를 입력하는 절차(revise_medical_record)로만 수정할 수 있습니다.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_block_direct_update_of_completed_records
  before update on medical_records
  for each row execute function block_direct_update_of_completed_records();

-- ③: 완료 기록 수정 RPC — 사유 필수, 낙관적 잠금(updated_at) 검사, 이력 삽입을 한 트랜잭션에서 원자화.
create or replace function revise_medical_record(
  p_record_id uuid,
  p_symptoms text,
  p_diagnosis text,
  p_treatment text,
  p_patient_visible_notes text,
  p_reason text,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_row public.medical_records%rowtype;
begin
  select id into v_staff_id from public.staff where auth_user_id = auth.uid() and role = 'doctor' and is_active;
  if v_staff_id is null then
    raise exception '활성 상태의 의사만 진료기록을 수정할 수 있습니다.' using errcode = 'P0001';
  end if;

  select * into v_row from public.medical_records where id = p_record_id and doctor_id = v_staff_id for update;
  if not found then
    raise exception '진료기록을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not v_row.is_completed then
    raise exception '완료되지 않은 기록은 임시저장 기능으로 수정하세요.' using errcode = 'P0001';
  end if;
  if trim(coalesce(p_reason, '')) = '' then
    raise exception '수정 사유를 입력해야 합니다.' using errcode = 'P0001';
  end if;
  if v_row.updated_at is distinct from p_expected_updated_at then
    raise exception '다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.' using errcode = 'P0003';
  end if;

  insert into public.medical_record_revisions (record_id, previous_content, revised_by, reason)
  values (
    p_record_id,
    jsonb_build_object(
      'symptoms', v_row.symptoms, 'diagnosis', v_row.diagnosis,
      'treatment', v_row.treatment, 'patient_visible_notes', v_row.patient_visible_notes
    ),
    v_staff_id, p_reason
  );

  perform set_config('app.via_revise_rpc', 'true', true);
  update public.medical_records
  set symptoms = p_symptoms, diagnosis = p_diagnosis, treatment = p_treatment,
      patient_visible_notes = p_patient_visible_notes, updated_at = now()
  where id = p_record_id;
  perform set_config('app.via_revise_rpc', 'false', true);
end;
$$;

revoke execute on function revise_medical_record(uuid, text, text, text, text, text, timestamptz) from public;
grant execute on function revise_medical_record(uuid, text, text, text, text, text, timestamptz) to authenticated;
