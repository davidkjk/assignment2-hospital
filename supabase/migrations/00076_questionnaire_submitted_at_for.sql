-- 직원웹 — 예약별 사전문진 '작성 여부·제출 시각'만 돌려주는 정의자 권한 함수 (PTDET-QNR-03 개정, A안)
--
-- ⭐ 왜 필요한가: 결정 #14(00035)·요구사항 :420으로 관리자·접수직원은 문진 '답변 내용'을 못 본다
--    — RLS(assigned_doctor_can_read_responses, 00007)가 담당 의사에게만 select를 연다. 그래서
--    직원 환자상세의 사전문진 칸이 존재 여부까지 가려져 「담당 의사만 열람」 안내밖에 못 띄웠다.
--    사용자 결정(2026-08-31): 직원이 '작성 여부'는 봐야 한다 — 그래야 미작성 환자에게 문진표
--    요청을 보낼 수 있다. '내용'은 그대로 의사 전용이다.
--
-- ⭐ 무엇을 허용하나: 이 함수는 submitted_at(제출 시각) 하나만 돌려준다 — 'answers'는 절대 나가지
--    않는다. 00052(count_questionnaire_responses_for)가 세운 선과 같다: **존재/볼륨은 비밀이
--    아니고 답변 내용만 보호한다**(:420·#14와 상충하지 않음). 내용 조회 RLS는 그대로 둔다.
--
-- security definer + 소유자(postgres)로 RLS를 우회하되, 본문이 submitted_at 한 칼럼으로 못박혀
-- 우회 범위가 「제출 시각」에 갇힌다. search_path=''로 함수 하이재킹을 막는다.
create or replace function public.questionnaire_submitted_at_for(p_appointment_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select q.submitted_at
    from public.questionnaire_responses q
   where q.appointment_id = p_appointment_id
   limit 1;
$$;

-- 직원(인증 역할)이 호출할 수 있다 — 반환은 제출 시각뿐이라 답변 내용 노출 경로가 아니다.
grant execute on function public.questionnaire_submitted_at_for(uuid) to authenticated;
