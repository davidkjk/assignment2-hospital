-- 결정 #14 / AD-050(USER-FINAL): 관리자는 문진 「양식」만 관리하고 「답변」은 못 본다.
-- 00007이 열어 둔 private.is_admin() 예외를 제거한다. 화면만 막으면 API가 우회로가 된다.
--
-- ⚠️ 이름을 정확히 쓸 것 — 00007:37의 실제 정책 이름은 `assigned_doctor_can_read_responses`다
-- (`questionnaire_`가 안 들어간다). `drop policy if exists`는 이름이 틀리면 오류 없이 조용히
-- 아무것도 안 한다. 그러면 is_admin() 예외를 품은 옛 정책이 살아남고, RLS 정책은 OR로 합쳐지므로
-- 새 정책을 아무리 좁게 만들어도 관리자는 계속 답변을 읽는다.
drop policy if exists "assigned_doctor_can_read_responses" on questionnaire_responses;

create policy "assigned_doctor_can_read_questionnaire_responses" on questionnaire_responses
  for select using (
    private.current_staff_role() = 'doctor'
    and exists (
      select 1 from appointments a
      where a.id = questionnaire_responses.appointment_id
        and a.doctor_id = private.current_staff_id()
    )
  );
