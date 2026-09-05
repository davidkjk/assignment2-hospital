-- [TODAY-YDAY-04] 전일 미완료 「마감 처리」 — 사람이 지난 날짜에 밀린 예약을 닫는 창구.
--
-- 왜: 상태기계(00005 VALID_TRANSITIONS)는 「도착→진료대기→진료중→진료완료」로 앞으로만 가고
--     취소는 「도착 전」(예약신청·예약확정)에서만 가능하다. 그래서 도착·진료대기·진료중으로 지난
--     날짜에 밀린 예약은 완료도 취소도 못 하는 막다른 길이었다(전일 미완료 카드가 문제만 보여주고
--     닫지 못함). 사용자 결정(2026-08-30): 오늘 큐의 정상 전이는 그대로 두고, 「전일 미완료 전용
--     마감」만 예외로 연다 — 오늘 도착 환자를 실수로 취소하는 길은 열지 않는다.
--
-- 어떻게: 전이 강제 트리거에 세션 플래그(app.allow_stale_close) 우회를 두되, close_stale_appointment
--        definer 함수만 「지난 날짜 + 도착/진료대기/진료중」을 검증한 뒤 그 플래그를 켠다.

-- ① 전이 강제 트리거에 우회 플래그를 추가한다(00005 원본에 이 한 조각만 얹는다).
create or replace function enforce_appointment_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    -- 전일 미완료 마감 창구(close_stale_appointment)만 지난 날짜·상태를 검증하고 이 플래그를 켠다.
    -- 오늘 큐의 정상 전이에는 플래그가 없어 아래 표 검증을 그대로 통과해야 한다.
    if coalesce(current_setting('app.allow_stale_close', true), '') = '1' then
      return new;
    end if;
    if not exists (
      select 1 from private.appointment_status_transitions
      where from_status is not distinct from old.status and to_status = new.status
    ) then
      raise exception '''%'' 상태에서 ''%''(으)로 변경할 수 없습니다.', old.status, new.status
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- ② 마감 함수 — 지난 날짜 + 도착/진료대기/진료중 + to∈{진료완료,병원취소} + 낙관적 잠금 검증 후 닫는다.
--    상태이력(changed_by·reason)은 기존 log 트리거가 auth.uid()·app.status_change_reason으로 남긴다.
create or replace function close_stale_appointment(
  p_appointment_id uuid,
  p_to_status text,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_slot_date date;
  v_updated_at timestamptz;
begin
  if p_to_status not in ('진료완료', '병원취소') then
    raise exception '전일 미완료는 진료완료 또는 병원취소로만 마감할 수 있습니다.' using errcode = 'P0001';
  end if;

  select a.status, s.slot_date, a.updated_at
    into v_status, v_slot_date, v_updated_at
    from public.appointments a
    join public.appointment_slots s on s.id = a.slot_id
    where a.id = p_appointment_id
    for update of a;
  if not found then
    raise exception '예약을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  -- 지난 날짜 + 아직 안 닫힌 진행상태에서만 — 오늘 건·이미 닫힌 건은 이 창구를 못 쓴다.
  if v_slot_date >= current_date then
    raise exception '지난 날짜 예약만 이 창구로 마감할 수 있습니다.' using errcode = 'P0001';
  end if;
  if v_status not in ('도착', '진료대기', '진료중') then
    raise exception '이미 마감된 예약입니다.' using errcode = 'P0001';
  end if;
  -- 낙관적 잠금 — 그새 다른 직원이 바꿨으면 덮어쓰지 않는다.
  if p_expected_updated_at is distinct from v_updated_at then
    raise exception '방금 다른 직원이 이 예약을 바꿨습니다.' using errcode = 'P0003';
  end if;

  perform set_config('app.allow_stale_close', '1', true);
  perform set_config('app.status_change_reason', coalesce(p_reason, ''), true);
  update public.appointments set status = p_to_status, updated_at = now() where id = p_appointment_id;
  perform set_config('app.allow_stale_close', '0', true);

  return p_to_status;
end;
$$;

grant execute on function close_stale_appointment(uuid, text, timestamptz, text) to authenticated;
