-- [R5-01][PTDET-FAMILY-05][결정 #3 「기록부」] 지금 표에는 relation·is_active·unlinked_at뿐이라
-- 「누가 · 무엇으로 확인하고 · 왜 끊었는지」를 담을 자리가 없다(00003:12~20).
-- ⚠️ 번호가 00044(Task 21)보다 뒤이지만 **서로 의존하지 않는다** — 병합 원장과
--    가족 연결은 만나는 지점이 없다(MERGE-COMPARE-04가 둘을 섞지 말라고 못박은 그대로다).
alter table patient_family_links
  add column linked_by uuid references staff(id),
  add column linked_at timestamptz not null default now(),
  add column verification_method text
    check (verification_method in ('otp', 'in_person', 'document')),
  add column unlinked_by uuid references staff(id),
  add column unlink_reason text;

-- 해제는 사유와 실행자가 함께 채워지거나 함께 비거나 — 절반만 남으면 감사가 못 읽는다.
alter table patient_family_links add constraint family_links_unlink_all_or_none check (
  (unlinked_at is null and unlinked_by is null and unlink_reason is null)
  or (unlinked_at is not null and unlinked_by is not null and unlink_reason is not null));

-- [PTDET-FAMILY-01] 살아 있는 연결은 한 쌍에 하나. 해제한 것은 제약 밖이라 재연결이 열린다.
-- ⚠️ 00003의 unique(account_patient_id, family_patient_id)는 **해제 뒤 재연결을 막는다** →
--    부분 유니크로 바꾼다.
alter table patient_family_links
  drop constraint patient_family_links_account_patient_id_family_patient_id_key;
create unique index family_links_live_pair
  on patient_family_links (account_patient_id, family_patient_id) where is_active;

-- C6-#4(2026-08-20): link_family_member/unlink이 acquire_as(직원 authenticated)로 직접 INSERT/UPDATE하는데
--   00003은 authenticated SELECT 정책만 열어 둬 쓰기가 막혔다 → 접수·관리자만 쓰는 좁은 write 정책 + grant.
--   (사용자발 특권 쓰기=최소권한. 서비스 로직은 Python link_family_member가, 역할 자물쇠는 이 정책이 건다.)
grant insert, update on table patient_family_links to authenticated;
create policy "reception_admin_can_link_family" on patient_family_links
  for insert with check (private.current_staff_role() in ('receptionist','admin'));
create policy "reception_admin_can_unlink_family" on patient_family_links
  for update using (private.current_staff_role() in ('receptionist','admin'))
  with check (private.current_staff_role() in ('receptionist','admin'));
