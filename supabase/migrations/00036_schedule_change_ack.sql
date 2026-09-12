-- 도장은 「이 예약의 · 이 변경 건에 대한 · 처리」다.
-- boolean 한 칸이 아니라 예약·변경 건·처리 행을 함께 저장해야
-- 일정이 다시 바뀌었을 때 앞선 처리 기록이 새 변경을 가리지 않는다.
create table schedule_change_acks (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  exception_id uuid not null,                    -- 어느 변경에 대한 처리인가
  action text not null check (action in ('rescheduled', 'cancelled', 'kept')),
  handled_by uuid not null references staff(id),
  handled_at timestamptz not null default now(),
  unique (appointment_id, exception_id)          -- 한 변경당 한 번
);

alter table schedule_change_acks enable row level security;

grant select, insert, update on table schedule_change_acks to authenticated;

create policy "staff_manage_acks" on schedule_change_acks
  for all using (private.is_active_staff()) with check (private.is_active_staff());

-- CARD-CHG(환자앱 T15 경계 #17): 병원발 변경/취소 안내문이 필요로 하는 두 칸.
-- reschedule_appointment·병원발 취소가 옛 시각·changed/cancelled로 채우고,
-- 환자 [확인]이 두 칸을 비운다. null이면 미확인 변경 없음이다.
alter table appointments
  add column hospital_change_prev_time timestamptz,
  add column hospital_change_kind text check (hospital_change_kind in ('changed', 'cancelled'));
