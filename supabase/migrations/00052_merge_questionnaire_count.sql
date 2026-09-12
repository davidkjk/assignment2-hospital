-- 직원웹 — 병합 보존 스냅샷의 문진 '건수'만 세는 정의자 권한 함수 (S18 MHIST-DETAIL-02)
--
-- ⭐ 왜 필요한가: 결정 #14(00035)로 관리자는 문진 '답변 내용'을 못 본다 — RLS가 assigned_doctor
--    에게만 select를 연다. 그래서 관리자 컨텍스트로 도는 병합 보존 카운트(_counts_for)가 문진만
--    0으로 세어, 실제로 보존된 문진이 「0건 보존」으로 오표시된다(데이터가 사라진 것처럼 보임).
--
-- ⭐ 무엇을 허용하나: 이 함수는 count(*) 정수 하나만 돌려준다 — '답변 내용'은 절대 나가지 않는다.
--    이미 관리자는 같은 환자의 예약·진료기록 '건수'를 보고 있으므로(볼륨은 비밀이 아님), 문진의
--    '건수'만 보이는 것은 #14의 '답변 내용 보호'와 상충하지 않는다. 내용 조회 RLS는 그대로 둔다.
--
-- security definer + 소유자(postgres)로 RLS를 우회하되, 본문이 count(*)로 못박혀 우회 범위가
-- 「건수」에 갇힌다. search_path=''로 함수 하이재킹을 막는다.
create or replace function public.count_questionnaire_responses_for(p_patient_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.questionnaire_responses q
    join public.appointments a on a.id = q.appointment_id
   where a.for_patient_id = p_patient_id;
$$;

-- 직원(인증 역할)이 호출할 수 있다 — 반환은 건수뿐이라 답변 내용 노출 경로가 아니다.
grant execute on function public.count_questionnaire_responses_for(uuid) to authenticated;
