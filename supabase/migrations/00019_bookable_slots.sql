-- 예약 가능 슬롯 단일 판정. 앱·직원·챗봇이 같은 규칙(당일 30분 여유·8주·마감·빈시간)을 쓴다.
create or replace function list_bookable_slots(p_doctor_id uuid, p_date date)
returns table(id uuid, start_time time)
language sql stable security definer set search_path = '' as $$
  select s.id, s.start_time
  from public.appointment_slots s
  where s.doctor_id = p_doctor_id
    and s.slot_date = p_date
    and s.status = '빈시간'
    and p_date <= current_date + 56                -- 8주(56일) 이내
    and (p_date > current_date                     -- 미래 날짜는 시간 제한 없음
         or (now() + interval '30 minutes')::time < s.start_time)  -- 당일은 30분 최소 여유
    and not exists (                               -- doctor_schedule_rules.booking_deadline 이후면 제외
      select 1 from public.doctor_schedule_rules d
      where d.doctor_id = p_doctor_id
        -- weekday는 파이썬 date.weekday() 컨벤션(월0~일6, 00002 check 0~6). isodow는 월1~일7이라 -1로 맞춘다.
        and d.weekday = extract(isodow from p_date)::int - 1
        and d.booking_deadline is not null
        and s.start_time > d.booking_deadline)
  order by s.start_time;
$$;
revoke execute on function list_bookable_slots(uuid, date) from public;
grant execute on function list_bookable_slots(uuid, date) to authenticated;

-- ⚠️ 환자 카탈로그 열람 RLS(플랜 대비 추가): departments·staff·appointment_slots는 직원 SELECT 정책만
--    있어 환자(authenticated·비직원)가 읽으면 0행이었다. 예약 화면이 진료과·의사·빈날짜를 직접 읽으므로
--    등록 환자에게 열어준다(list_bookable_slots는 definer라 예외 — doctor_schedule_rules는 정책 불필요).
create policy "patients_can_read_active_departments" on departments
  for select using (is_active and private.current_patient_id() is not null);
create policy "patients_can_read_active_doctors" on staff
  for select using (role = 'doctor' and is_active and private.current_patient_id() is not null);
create policy "patients_can_read_slots" on appointment_slots
  for select using (private.current_patient_id() is not null);
