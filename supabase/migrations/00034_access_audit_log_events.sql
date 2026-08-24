-- ① 검색은 환자 1명이 아니다 → patient_id를 풀되, 환자 대상 사건에는 여전히 요구한다.
alter table access_audit_log alter column patient_id drop not null;

-- ② 검색어를 남길 칸 (SEARCH-LOG-01: "무엇으로 검색했는지")
alter table access_audit_log add column search_term text;

-- ③ 사건 종류 확장. 통계는 aggregate·filter를 남기지 않고 drilldown·export만 남긴다(결정 #22).
alter table access_audit_log drop constraint if exists access_audit_log_resource_type_check;
alter table access_audit_log add constraint access_audit_log_resource_type_check
  check (resource_type in (
    'patient_detail', 'medical_record', 'phone_reveal',
    'search', 'bulk_view', 'patient_merge', 'patient_merge_undo', 'stats_drilldown', 'stats_export'));

-- 환자를 겨냥한 사건은 환자를 비울 수 없다 (MASK-VIEW-02).
alter table access_audit_log add constraint access_audit_log_patient_required
  check (patient_id is not null or resource_type in ('search', 'stats_drilldown', 'stats_export'));
