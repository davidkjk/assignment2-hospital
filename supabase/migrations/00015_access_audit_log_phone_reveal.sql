-- 섹션4 ⑥ 번호 열람 기록 (ui-design-decisions:3582~3595).
-- 발송 이력에서 마스킹된 번호를 푸는 순간(reveal) 그 열람을 전수로 남긴다.
-- 00004의 inline check 제약(자동 이름 access_audit_log_resource_type_check)을 교체해 phone_reveal을 추가한다.
alter table access_audit_log drop constraint access_audit_log_resource_type_check;
alter table access_audit_log
  add constraint access_audit_log_resource_type_check
  check (resource_type in ('patient_detail', 'medical_record', 'phone_reveal'));
