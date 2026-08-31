-- Task 29 — 회원 탈퇴(갭 #64·#70). ⚠️ 실제 적용 번호는 구현 시점 확정(00031 다음).
-- deactivated_at은 00001에 이미 있다 → former_auth_user_id만 새로 (둘 다 if not exists로 안전).
alter table patients
  add column if not exists deactivated_at timestamptz,
  add column if not exists former_auth_user_id uuid;   -- [SET-QUIT-09] 「누가 탈퇴했나」 흔적

-- [SET-QUIT-11·12·16] 차단 판정: 다가오는 예약 = 내 계정으로 잡힌 것 중 내 것 + 자기 계정 없는 가족(㉮).
--   실제 스키마는 account_patient_id(누가 예약했나)·for_patient_id(누구 예약인가)다(plan의 patient_id는 없음).
--   ㉯(자기 계정 있는 가족)의 예약은 그 사람이 자기 앱에서 관리하므로 막지 않는다(for_patient의 auth_user_id로 가른다).
create or replace function list_withdrawal_blocks()
returns table(appointment_id uuid, slot_date date, start_time time,
              department text, patient_name text, is_family boolean)
language sql security definer set search_path = '' as $$
  with me as (select private.current_patient_id() as pid)
  select a.id, s.slot_date, s.start_time, d.name, p.name,
         (a.for_patient_id <> (select pid from me))
  from public.appointments a
  join public.appointment_slots s on s.id = a.slot_id
  join public.departments d on d.id = a.department_id
  join public.patients p on p.id = a.for_patient_id
  where a.status in ('예약신청','예약확정') and s.slot_date >= current_date
    and a.account_patient_id = (select pid from me)
    and ( a.for_patient_id = (select pid from me)                         -- 내 예약
       or p.auth_user_id is null )                                        -- ㉮(자기 계정 없음)
  order by s.slot_date, s.start_time;
$$;

-- [SET-QUIT-09][갭 #64] 재작성 — is_active=false + auth_user_id 비우기 + 흔적. 차단 재검사.
-- ⚠️ Auth 계정 처리(전화 분리/삭제)는 이 함수 밖(백엔드 admin API, deactivate_self가 오케스트레이션).
--    옛 00017 정의는 is_active만 바꿨다 → 여기서 재작성(auth_user_id를 비워야 재가입 자동연결이 이 행을 집는다).
create or replace function deactivate_patient_self()
returns void language plpgsql security definer set search_path = '' as $$
declare v_patient_id uuid;
begin
  v_patient_id := private.current_patient_id();
  if v_patient_id is null then
    raise exception '활성 상태의 환자만 탈퇴할 수 있습니다.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.list_withdrawal_blocks()) then    -- [SET-QUIT-11] 서버 재검사 (search_path='' 이라 스키마 한정 필수)
    raise exception '다가오는 예약이 있어 탈퇴할 수 없습니다.' using errcode = 'P0001';
  end if;
  update public.patients
    set is_active = false, deactivated_at = now(),
        former_auth_user_id = auth_user_id, auth_user_id = null      -- ⭐ 비운다(B-37)
    where id = v_patient_id;
end;
$$;
revoke execute on function deactivate_patient_self() from public;
grant execute on function deactivate_patient_self() to authenticated;
grant execute on function list_withdrawal_blocks() to authenticated;
