-- 갭 #15: 예약 생성 멱등 키. 같은 (계정, 요청 UUID)는 예약 한 건만 만든다.
-- request_id가 NULL이면 유니크 검사에 걸리지 않으므로 직원·챗봇 예약(요청 UUID 없음)은 무제한.
alter table appointments add column request_id uuid;
create unique index idx_appointments_account_request
  on appointments (account_patient_id, request_id);

-- #29(AD-051): 앱 예약 자동확정 기본값 true. 설정 화면은 직원웹 T29(00051) 소유이나
-- 예약 생성이 반드시 읽어야 하고 의존 순서상 앞서므로 칸의 물리적 생성은 여기서 한다.
-- 직원웹 00051도 같은 문장을 써도 무해하다(먼저 적용하는 쪽 우선).
alter table hospital_settings
  add column if not exists auto_confirm_app_bookings boolean not null default true;

-- 환자 세션은 hospital_settings 통째를 못 읽는다(주소·전화 등 민감칸 — HSETX-SEC-01, staff만 SELECT 정책).
-- 예약 자동확정 여부(#29) 한 칸만 좁게 여는 definer 창구다(get_public_hospital_info와 같은 패턴).
-- 이게 없으면 create_booking이 환자 RLS로 hospital_settings를 읽어 0행 → 항상 '예약신청'으로 떨어졌다.
-- 행이 없으면 #29 기본값 true를 돌려준다.
create or replace function get_auto_confirm_app_bookings()
returns boolean
language sql security definer set search_path = '' as $$
  select coalesce((select auto_confirm_app_bookings from public.hospital_settings limit 1), true);
$$;
revoke execute on function get_auto_confirm_app_bookings() from public;
grant execute on function get_auto_confirm_app_bookings() to authenticated;

-- 갭 #18 / 결정 C-6: 예약 변경(취소+새 예약) 시 사전문진을 새 예약으로 옮긴다.
-- 환자 세션 RLS를 우회하되(security definer) 두 예약이 같은 계정·같은 대상 환자 소유인지
-- 함수가 직접 검증한다. submitted_at은 건드리지 않아 실제 작성 시각이 유지된다(APPT-CHG-11).
create or replace function move_questionnaire_response(
  p_old_appointment_id uuid, p_new_appointment_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_old_owner uuid; v_old_for uuid; v_new_owner uuid; v_new_for uuid;
begin
  select account_patient_id, for_patient_id into v_old_owner, v_old_for
    from public.appointments where id = p_old_appointment_id;
  select account_patient_id, for_patient_id into v_new_owner, v_new_for
    from public.appointments where id = p_new_appointment_id;
  if v_old_owner is null or v_new_owner is null
     or v_old_owner <> v_new_owner or v_old_for <> v_new_for then
    raise exception 'questionnaire move: appointment ownership mismatch';
  end if;
  update public.questionnaire_responses
    set appointment_id = p_new_appointment_id
    where appointment_id = p_old_appointment_id;  -- submitted_at 유지
end;
$$;
revoke execute on function move_questionnaire_response(uuid, uuid) from public;
grant execute on function move_questionnaire_response(uuid, uuid) to authenticated;

-- SDB-20 전방참조 미이행 갭: 00005가 「3단계(환자 앱)의 patients_can_update_slots_for_booking 정책」을
-- 예고했으나 실제로는 어느 마이그도 만들지 않았다. 그래서 환자 세션(acquire_as)의 book_slot/release_slot
-- UPDATE가 RLS에 막혀 0행 → 예약이 조용히 실패했다. 환자 앱의 첫 예약 경로(Task 5)에서 만든다.
-- status만 검사한다 — 담당의·날짜·시간은 trg_block_appointment_slot_identity_change가 역할과 무관하게
-- 이미 불변으로 막는다(00005). 범위: 빈 슬롯(예약하려 잡음) 또는 본인 예약의 슬롯(취소·변경 시 되돌림)만.
-- 남의 예약(예약됨) 슬롯은 손대지 못한다.
create policy "patients_can_update_slots_for_booking" on appointment_slots
  for update to authenticated
  using (
    private.current_patient_id() is not null
    and (
      status = '빈시간'
      or exists (select 1 from appointments a
                 where a.slot_id = appointment_slots.id
                   and patient_owns(a.account_patient_id))
    )
  )
  with check (
    private.current_patient_id() is not null
    and status in ('빈시간', '예약됨')
  );
