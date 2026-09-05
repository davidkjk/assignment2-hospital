-- [보안 F-02] move_questionnaire_response IDOR 하강.
-- 정본: docs/security-audit-2026-09-04/ F-02(High, confirmed).
--
-- 문제: 00020의 move_questionnaire_response는 authenticated 전원에 grant된 SECURITY DEFINER인데,
--   old/new 예약의 account·for_patient가 같은지만 검사하고 「호출자가 그 예약을 소유하는지」와
--   「정상 재예약으로 만들어진 목적지인지(lineage)」를 검사하지 않았다. 그래서 예약 read 권한이 있는
--   접수직원·관리자가 두 예약 UUID만 알면 남의 환자 임상문진을 다른 예약(다른 진료과 포함)으로 옮겨,
--   목적지 예약의 담당의에게 노출시킬 수 있었다(IDOR).
--
-- 수정 방향(코디 승인 2026-09-04): 함수 내부에 호출자 인증을 넣는다.
--   ① public.patient_owns(old_owner) — 호출자가 실제로 그 계정을 소유해야 한다. 이 한 줄로
--      직원(current_patient_id 없음)·타 환자는 전면 차단되고, 정상 경로(환자 change_booking,
--      acquire_as 환자 세션)만 통과한다.
--   ② lineage: old/new 예약의 진료과가 같아야 한다(정상 재예약은 같은 과로만 새 예약을 만든다,
--      patient_booking_service.change_booking). 진료과를 넘나드는 임상문서 재귀속을 막는다.
--   ③ 목적지에 이미 문진이 있으면 거부(귀속 충돌 방지 — unique 제약이 이미 막지만 사람 오류 메시지).
--
-- ⭐ authenticated EXECUTE 권한은 회수하지 않는다 — 정상 재예약(change_booking)은 환자 authenticated
--    세션 트랜잭션 안에서 이 함수를 부르므로 회수하면 정상 예약변경이 깨진다. 대신 위 호출자 인증으로
--    직접 호출 남용을 막는다(remediation의 "verify caller ownership, lineage, department"를 함수 안에서 충족).
-- 추가 검증만 넣는 create or replace라 데이터 무변경·되돌림 가능(00020 본문으로 다시 replace하면 원복).
-- ⚠️ 원격 미적용 — 로컬 apply만. 배포 시 db push(00083~ 와 함께).

create or replace function move_questionnaire_response(
  p_old_appointment_id uuid, p_new_appointment_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old_owner uuid; v_old_for uuid; v_old_dept uuid;
  v_new_owner uuid; v_new_for uuid; v_new_dept uuid;
begin
  select account_patient_id, for_patient_id, department_id into v_old_owner, v_old_for, v_old_dept
    from public.appointments where id = p_old_appointment_id;
  select account_patient_id, for_patient_id, department_id into v_new_owner, v_new_for, v_new_dept
    from public.appointments where id = p_new_appointment_id;
  if v_old_owner is null or v_new_owner is null
     or v_old_owner <> v_new_owner or v_old_for <> v_new_for then
    raise exception 'questionnaire move: appointment ownership mismatch';
  end if;
  -- [F-02] 호출자 소유 검증 — 직원·타 환자 차단, 정상 환자 세션만 통과.
  -- ⚠️ patient_owns는 비-환자 세션에서 false가 아니라 NULL을 돌려준다(null = uuid → null).
  --    `if not null`은 실행되지 않으므로 반드시 coalesce(...,false)로 감싼다(이게 F-02의 핵심).
  if not coalesce(public.patient_owns(v_old_owner), false) then
    raise exception 'questionnaire move: caller does not own these appointments' using errcode = 'P0001';
  end if;
  -- [F-02] lineage — 같은 진료과로의 이동만(정상 재예약과 동일). 진료과 넘나드는 재귀속 금지.
  if v_old_dept is distinct from v_new_dept then
    raise exception 'questionnaire move: department lineage mismatch' using errcode = 'P0001';
  end if;
  -- [F-02] 목적지에 이미 문진이 있으면 거부(귀속 충돌).
  if exists (select 1 from public.questionnaire_responses where appointment_id = p_new_appointment_id) then
    raise exception 'questionnaire move: destination already has a response' using errcode = 'P0001';
  end if;
  update public.questionnaire_responses
    set appointment_id = p_new_appointment_id
    where appointment_id = p_old_appointment_id;  -- submitted_at 유지(APPT-CHG-11)
end;
$$;
