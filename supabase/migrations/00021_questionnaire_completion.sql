-- QNR-STATE-08(갭 #50): submitted_at은 저장마다 갱신되어 완료 판정 불가 → 완료 전용 칸.
alter table questionnaire_responses add column completed_at timestamptz;

-- 환자 문진 INSERT/UPDATE. #21: 수정 가능 = 진료중 전(예약신청·확정·도착·진료대기). 서비스 EDITABLE_STATUSES와 이중 방어.
-- (재작성본 Task 1은 SELECT 정책만 열었다. 00007의 grant에는 update가 없어 여기서 연다.)
grant update on questionnaire_responses to authenticated;
create policy "patients_can_insert_own_questionnaire" on questionnaire_responses
  for insert with check (exists (
    select 1 from public.appointments a
    where a.id = questionnaire_responses.appointment_id
      and patient_owns(a.for_patient_id)
      and a.status in ('예약신청','예약확정','도착','진료대기')));
create policy "patients_can_update_own_questionnaire" on questionnaire_responses
  for update using (exists (
    select 1 from public.appointments a
    where a.id = questionnaire_responses.appointment_id
      and patient_owns(a.for_patient_id)
      and a.status in ('예약신청','예약확정','도착','진료대기')))
  with check (exists (
    select 1 from public.appointments a
    where a.id = questionnaire_responses.appointment_id
      and patient_owns(a.for_patient_id)
      and a.status in ('예약신청','예약확정','도착','진료대기')));

-- ⭐ 실행 보정(2026-08-29): 환자 문진 양식 열람 정책이 없었다 — questionnaire_templates에는
-- staff_can_read_templates·admin_can_manage_templates만 있어, 환자 세션(acquire_as)의
-- get_template/save_response가 department_id로 양식을 읽으면 RLS로 0행 → get_template None,
-- save_response는 "양식 없음" 404로 터진다. Task 4의 departments·slots 환자 열람 정책과 같은 갭이다.
-- 양식은 민감정보가 아니지만, 자기 예약이 있는 진료과로 범위를 좁힌다(계정이 for_patient_id로 소유).
create policy "patients_can_read_templates_for_own_appointments" on questionnaire_templates
  for select using (exists (
    select 1 from public.appointments a
    where a.department_id = questionnaire_templates.department_id
      and patient_owns(a.for_patient_id)));
