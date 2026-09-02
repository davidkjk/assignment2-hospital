-- 환자 신원(auth 연결) + 소유 판정 함수 + 환자용 RLS. 옛 00200~00202를 폐기·재번호.
-- ⚠️ auth_user_id 칸 자체는 00044(병합)가 이미 추가했다(`uuid unique`, 순수 uuid 표식). 그 파일이
--    「이월: 3단계에서 auth.users FK를 맞출 것」이라 명시적으로 넘겼으므로, 여기서는 컬럼을 다시
--    만들지 않고 **FK만 더한다**. (unique는 이미 patients_auth_user_id_key로 존재.)
alter table patients add constraint patients_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id);
alter table patients alter column phone drop not null;   -- #3 전화 없는 가족

-- is_active인 환자만 반환. 비활성 환자는 NULL → 이 함수를 쓰는 모든 정책에서 자동 차단(DB가 최종 방어).
create or replace function private.current_patient_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.patients p where p.auth_user_id = auth.uid() and p.is_active;
$$;
revoke execute on function private.current_patient_id() from public;
grant execute on function private.current_patient_id() to authenticated;

create or replace function patient_owns(target_patient_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_patient_id() = target_patient_id
    or exists (
      select 1 from public.patient_family_links l
      where l.account_patient_id = private.current_patient_id()
        and l.family_patient_id = target_patient_id
        and l.is_active   -- [R5-02] 해제된 링크는 인정하지 않는다
    );
$$;
revoke execute on function patient_owns(uuid) from public;
grant execute on function patient_owns(uuid) to authenticated;

-- patients: 본인 등록 / 가족 프로필 추가 / 본인·가족 조회. 직접 UPDATE 정책은 두지 않는다(칼럼 단위
-- 방어가 RLS로 안 되고 환자·직원이 같은 authenticated 역할이라 — SDB-18). 수정은 전용 RPC로만.
create policy "patients_can_register_self" on patients
  for insert with check (auth_user_id = auth.uid());
create policy "patients_can_insert_family_members" on patients
  for insert with check (auth_user_id is null and private.current_patient_id() is not null);
create policy "patients_can_read_self_and_family" on patients
  for select using (patient_owns(id));

-- 가족링크 조회: 본인 계정이 소유한 링크만. (변경은 Task 3의 RPC로만 — 여기선 select 기반만 연다.)
-- ⚠️ 원래 플랜은 이 정책을 Task 3(00018)에 뒀으나, Task 2의 list_accessible_patient_ids가 이미
--    필요로 하므로 신원 RLS 기반인 여기로 옮긴다(다른 환자 read 정책과 한 묶음).
create policy "patients_can_read_own_family_links" on patient_family_links
  for select using (patient_owns(account_patient_id));

create or replace function update_patient_basic_info(
  target_patient_id uuid, p_name text, p_birth_date date, p_gender text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.patient_owns(target_patient_id) then
    raise exception '본인 또는 등록한 가족만 정보를 수정할 수 있습니다.' using errcode = 'P0001';
  end if;
  update public.patients set name = p_name, birth_date = p_birth_date, gender = p_gender
  where id = target_patient_id;   -- auth_user_id·is_active·phone은 못 바꾼다(관리자 절차로만)
end;
$$;
revoke execute on function update_patient_basic_info(uuid, text, date, text) from public;
grant execute on function update_patient_basic_info(uuid, text, date, text) to authenticated;

create or replace function deactivate_patient_self()
returns void language plpgsql security definer set search_path = '' as $$
declare v_patient_id uuid;
begin
  v_patient_id := private.current_patient_id();
  if v_patient_id is null then
    raise exception '활성 상태의 환자만 계정을 비활성화할 수 있습니다.' using errcode = 'P0001';
  end if;
  update public.patients set is_active = false where id = v_patient_id;
end;
$$;
revoke execute on function deactivate_patient_self() from public;
grant execute on function deactivate_patient_self() to authenticated;

-- 예약·상태이력 환자 RLS. (support_requested_at 자체는 ④ 00010이 만들었다 — 여기선 write 경로만 연다.)
create policy "patients_can_read_own_appointments" on appointments
  for select using (patient_owns(for_patient_id) or patient_owns(account_patient_id));
create policy "patients_can_create_own_appointments" on appointments
  for insert with check (source = 'app' and patient_owns(account_patient_id) and patient_owns(for_patient_id));
create policy "patients_can_update_own_appointments" on appointments
  for update using (patient_owns(account_patient_id)) with check (patient_owns(account_patient_id));

alter table appointment_status_history alter column changed_by drop not null;
alter table appointment_status_history add column changed_by_patient_id uuid references patients(id);
-- C6-#6(2026-08-20): 「actor 하나는 반드시」 CHECK를 두지 않는다 — 시스템 자동 이력(배포 00059 mark_overdue_no_shows)은
--   두 actor가 모두 null이다(배포 Task 7B `⭐ 결정` 「changed_by null = 시스템 자동」, deployment:1071 · 직원웹은 null을
--   「시스템(자동)」으로 렌더 deployment:1074). CHECK를 걸면 SECURITY DEFINER도 못 뚫어 그 함수의 CTE가 전부 롤백된다.
--   사용자 경로의 actor 보장은 트리거(both-null이면 이력 스킵)+`patients_can_insert_note_history` 정책(changed_by_patient_id 필수)이 한다.
create policy "patients_can_read_own_status_history" on appointment_status_history
  for select using (exists (select 1 from appointments a
    where a.id = appointment_status_history.appointment_id and patient_owns(a.account_patient_id)));
-- 상태변화 없는 관리 메모(마감 후 지원요청 등)만 환자 직접 INSERT 허용. 실제 상태전이는 트리거만.
create policy "patients_can_insert_note_history" on appointment_status_history
  for insert with check (
    from_status = to_status and changed_by_patient_id is not null
    and private.current_patient_id() = appointment_status_history.changed_by_patient_id
    and exists (select 1 from appointments a
      where a.id = appointment_status_history.appointment_id and patient_owns(a.account_patient_id)));

-- 1단계 트리거는 auth.uid()를 staff에서만 찾았다. 환자 행위자도 인식하도록 재정의(SDB-05/22: is_active만).
create or replace function log_appointment_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_staff_id uuid; v_patient_id uuid;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    v_staff_id := private.current_staff_id();
    if v_staff_id is null then v_patient_id := private.current_patient_id(); end if;
    if v_staff_id is not null or v_patient_id is not null then
      insert into public.appointment_status_history
        (appointment_id, from_status, to_status, changed_by, changed_by_patient_id, reason)
      values (new.id, case when tg_op='INSERT' then null else old.status end, new.status,
              v_staff_id, v_patient_id,
              -- ⚠️ reason 보존(직원웹 회귀 방지): 옛 00005 트리거의 app.status_change_reason 설정값 +
              --    INSERT 기본 '예약 생성'을 그대로 유지한다. 환자 행위자 인식만 더한 것.
              coalesce(current_setting('app.status_change_reason', true),
                       case when tg_op='INSERT' then '예약 생성' else null end));
    end if;   -- 행위자 없는 세션(시드/배치)은 이력 행을 건너뛴다(제약 위반 방지)
  end if;
  return new;
end;
$$;

-- 문진·기록: 본인·가족 것만 조회. 의료진 전용 메모는 뷰로 가린다(Task 8 이력이 이 뷰만 조회).
create policy "patients_can_read_own_questionnaire" on questionnaire_responses
  for select using (exists (select 1 from appointments a
    where a.id = questionnaire_responses.appointment_id and patient_owns(a.for_patient_id)));
create view patient_medical_notes as
  select m.id, m.appointment_id, m.patient_visible_notes, m.is_completed, m.updated_at
  from medical_records m;
