-- Task 28 — 00012가 3단계로 미룬 「환자 본인 알림 선호」 정책 + 진료시간 공개 읽기(갭 #5·#SET-HOSP-HOURS).
-- ⚠️ 실제 적용 번호는 구현 시점 확정(직원웹도 00017+를 쓴다 — 먼저 적용하는 쪽 우선). 00030(가족) 다음 빈 번호.

-- ① 환자 본인만 자기 알림 선호를 select/insert/update. (dispatcher는 서비스 역할이라 정책 밖.)
--    patient_id → auth.uid() 매핑은 patients.auth_user_id(00017, T1)를 경유한다(다른 표들과 동일 패턴).
--    00012가 grant(select,insert,update to authenticated)만 하고 정책을 3단계로 미뤄 무효였던 것을 여기서 연다.
create policy patient_reads_own_notification_prefs on notification_preferences
  for select using (patient_id in (select id from patients where auth_user_id = auth.uid()));
create policy patient_writes_own_notification_prefs on notification_preferences
  for insert with check (patient_id in (select id from patients where auth_user_id = auth.uid()));
create policy patient_updates_own_notification_prefs on notification_preferences
  for update using (patient_id in (select id from patients where auth_user_id = auth.uid()))
           with check (patient_id in (select id from patients where auth_user_id = auth.uid()));

-- ② 진료시간·휴진일 환자 읽기 정책(authenticated_reads_hospital_hours/closures)은
--    ⚠️ 00041로 **이관됨**(2026-09-02): hospital_hours·hospital_closures 표를 00041이 만드는데
--    이 파일(031)이 041보다 먼저 실행되어 「표 없음」으로 실패했다(재번호 순서 뒤집힘). 정책은 표가
--    생기는 00041 말미에 함께 둔다(소유·순서 일치). 여기서는 알림 설정 정책만 담당.
