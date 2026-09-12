-- 갭 #28 · 원장 CARD-LATE-10: 예약확정인 채 시각이 지난 예약을 자정에 '예약부도'로 전환한다.

-- ① 시스템 자동 전이는 행위자(직원)가 없다 → changed_by를 nullable로(null = 시스템 자동 처리).
alter table appointment_status_history alter column changed_by drop not null;
comment on column appointment_status_history.changed_by is
  '전이를 일으킨 직원. null이면 시스템 자동 처리(배치) — 예: mark_overdue_no_shows()의 자정 부도.';

-- ② 자정 부도 처리 함수. SECURITY DEFINER로 이력을 직접 기록한다(공용 트리거는 auth 없어 스킵 → 중복 없음).
create or replace function mark_overdue_no_shows()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with overdue as (
    update public.appointments a
       set status = '예약부도'
      from public.appointment_slots s
     where s.id = a.slot_id
       and a.status = '예약확정'          -- ⛔ 도착·진료대기·진료중·예약신청은 여기서 안 걸린다(결정㉮)
       and s.slot_date < current_date     -- 자정 넘겨 어제까지(당일 제외)
    returning a.id
  ),
  logged as (
    insert into public.appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
    select id, '예약확정', '예약부도', null, '시각 경과 자동 부도 처리'   -- null = 시스템 자동
      from overdue
    returning 1
  )
  select count(*) into v_count from logged;
  return v_count;
end;
$$;

comment on function mark_overdue_no_shows() is
  '갭 #28/CARD-LATE-10: status=예약확정 & slot_date<current_date → 예약부도. 자정 KST 크론이 호출. 도착/진료대기/진료중/예약신청 제외.';
