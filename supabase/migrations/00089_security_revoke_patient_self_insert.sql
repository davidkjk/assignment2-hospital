-- [보안 F-05 벡터2] 환자 자가 INSERT RLS 봉인.
-- 정본: docs/security-audit-2026-09-04/ F-05(Medium, confirmed).
--
-- 00017의 patients_can_register_self(auth_user_id=auth.uid())·patients_can_insert_family_members는
-- authenticated 세션이 Supabase Data API로 patients에 직접 행을 만들 수 있게 열어 뒀다. 그래서
-- 환자가 백엔드 가입(POST /patient)의 동의 기록을 건너뛰고 동의 0건짜리 활성 환자 행을 만들어
-- get_current_patient 게이트(is_active만 검사)를 통과할 수 있었다.
--
-- 정상 경로 확인(2026-09-04): 환자앱(Flutter)·webchat·직원웹 어디도 Data API로 patients에
-- 직접 insert하지 않는다(가입=백엔드 POST /patient, 가족추가=백엔드 add_family_member — 둘 다
-- service-role get_pool로 RLS 우회). 따라서 이 두 정책은 클라이언트가 쓰지 않는 우회로일 뿐이다.
-- → 두 정책을 제거해 authenticated 자가 INSERT를 막는다. 정책 없는 INSERT는 RLS로 거부된다.
--
-- ⭐ 직원 등록 정책 receptionist_admin_can_insert_patients(00003)는 유지 — 직원 환자등록은
--    acquire_as(직원 authenticated)로 이 정책을 실제로 쓴다(제거 대상 아님).
-- 정책 제거만·데이터 무변경·되돌림 가능(00017 정책 본문 재생성 시 원복). ⚠️ 원격 미적용 — 배포 시 db push.

drop policy if exists "patients_can_register_self" on patients;
drop policy if exists "patients_can_insert_family_members" on patients;
