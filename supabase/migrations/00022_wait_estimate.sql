-- #21(확정 2026-08-01): 예상 대기시간 = 앞 인원 × 1인당 진료시간. 1인당은 3단 대체.
-- 전체 대기열·전체 완료이력을 봐야 하므로 security definer로 소유 확인 뒤 집계한다.
create or replace function patient_wait_estimate(p_appointment_id uuid)
returns table(patients_ahead int, estimated_wait_minutes int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_doctor uuid; v_pos int; v_ahead int; v_per numeric;
begin
  select a.doctor_id, a.queue_position into v_doctor, v_pos
    from public.appointments a
    where a.id = p_appointment_id and a.status = '진료대기'
      and public.patient_owns(a.account_patient_id);
  if v_pos is null then                       -- 내 예약이 아니거나 대기 상태 아님
    return query select 0, null::int; return;
  end if;

  select count(*) into v_ahead                -- 같은 의사·오늘·진료대기·내 앞 순번
    from public.appointments a2
    left join public.appointment_slots s2 on s2.id = a2.slot_id
    where a2.doctor_id = v_doctor and a2.status = '진료대기'
      and coalesce(s2.slot_date, current_date) = current_date
      and a2.queue_position < v_pos;

  -- ① 그 의사 최근 20건 실측 평균(진료중→진료완료 분).
  select avg(mins) into v_per from (
    select extract(epoch from (
      (select max(h2.changed_at) from public.appointment_status_history h2
         where h2.appointment_id = a3.id and h2.to_status = '진료완료')
      - (select max(h1.changed_at) from public.appointment_status_history h1
         where h1.appointment_id = a3.id and h1.to_status = '진료중')))/60 as mins
    from public.appointments a3
    where a3.doctor_id = v_doctor and a3.status = '진료완료'
    order by a3.updated_at desc limit 20
  ) recent where mins is not null and mins > 0;

  if v_per is null then                        -- ② 슬롯 간격으로 대체
    select slot_duration_minutes into v_per from public.doctor_schedule_rules
      where doctor_id = v_doctor and slot_duration_minutes is not null limit 1;
  end if;

  -- ③ 근거 없으면 estimated는 null(화면이 인원만 표시).
  return query select v_ahead, case when v_per is null then null else round(v_ahead * v_per)::int end;
end;
$$;
revoke execute on function patient_wait_estimate(uuid) from public;
grant execute on function patient_wait_estimate(uuid) to authenticated;

-- ⭐ 실행 보정(2026-08-29): patient_medical_notes 뷰가 00017에서 소유 필터·grant 없이 만들어졌다.
-- 뷰는 owner 권한(security_invoker 아님)이라 medical_records RLS를 우회한다 → 소유 필터가 없으면
-- authenticated에 SELECT를 주는 순간 아무 환자나 남의 patient_visible_notes를 통째로 읽는다.
-- 계획의 의도("의료진 전용 메모가 새지 않게")대로 뷰 안에서 자기(가족 포함) 것만 남기고 grant한다.
-- 컬럼 집합은 그대로라 create or replace가 가능하다. auth.uid()는 GUC라 owner 권한 뷰에서도 실세션을 가리킨다.
create or replace view patient_medical_notes as
  select m.id, m.appointment_id, m.patient_visible_notes, m.is_completed, m.updated_at
  from medical_records m
  join appointments a on a.id = m.appointment_id
  where patient_owns(a.for_patient_id);
grant select on patient_medical_notes to authenticated;
