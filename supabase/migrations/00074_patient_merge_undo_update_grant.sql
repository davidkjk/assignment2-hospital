-- [MHIST-DONE-01][결정 #15~17] 병합 되돌리기(undo)는 patient_merges 한 행의 undone_at·
--   undone_by·undo_reason를 채우는 UPDATE다. 그런데 00044는 이 테이블에 select/insert만
--   grant했고(00044:69) UPDATE RLS 정책도 안 만들었다 — 되돌림 API(Task 26)가 그 뒤에
--   추가됐지만 권한이 따라오지 않아, 라이브 [되돌림 확정]이 500(permission denied for table
--   patient_merges)으로 떨어졌다(QA L22 = Aside #3 실제 재현). 00073(schedule 예외 DELETE
--   grant)과 똑같은 「쓰기 경로에 grant/policy가 빠진」 구조적 갭이다.
--
-- 두 겹이 모두 필요하다:
--   ① 테이블 GRANT — RLS 이전에 테이블 권한이 먼저 거른다. UPDATE가 없으면 permission denied.
--   ② RLS UPDATE 정책 — grant만 주면 RLS가 UPDATE를 조용히 0행으로 거부해(무음 no-op) 되돌림이
--      「됐다」고 하고도 계보가 안 끊긴다. admin만 되돌릴 수 있게 private.is_admin()로 지킨다
--      (읽기·넣기 정책 admin_can_read/insert_patient_merges와 같은 술어).
grant update on table patient_merges to authenticated;

create policy admin_can_undo_patient_merges on patient_merges
  for update using (private.is_admin()) with check (private.is_admin());
