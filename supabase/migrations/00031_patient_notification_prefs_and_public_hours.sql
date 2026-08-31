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

-- ② 진료시간·휴진일은 공개 정보 → 로그인 환자(authenticated)가 읽기만. 쓰기는 직원 전용(정책 신설 안 함).
--    ⭐ 경계: hospital_hours·hospital_closures 표 자체는 직원웹 T29(00041) 소유다. 여기서는 「읽기 문」만 얹는다
--    (departments를 환자가 acquire_as로 읽는 것과 같은 꼴 — 표는 남의 것, 읽기 정책은 소비자가 연다).
--    ⚠️ hospital_hours엔 is_closed 칸이 없다(00041) — 휴진 요일 = 그 요일 행이 아예 없음. 읽기 정책만 필요.
create policy authenticated_reads_hospital_hours on hospital_hours
  for select to authenticated using (true);
create policy authenticated_reads_hospital_closures on hospital_closures
  for select to authenticated using (true);
