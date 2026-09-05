-- [STAT-AUDIT-02][ALOG-LIST-13][BOTSTAT-DASH-15] 통계 드릴다운·CSV 내보내기 감사에 담을
-- 비(非)개인정보 payload 칸. 결정 #22: 실행자·시각(기존 칸)에 더해 지표·기간·대상 건수·
-- CSV 행 수·억제 여부까지 남긴다.
--
-- ⛔ 환자명·전화·생년월일·검색어(원문)는 절대 담지 않는다 — 이 표는 개인정보 열거를
--    만들지 않는다(MASK-SRV-01). stats_* 칸은 오직 「무슨 지표를 어느 기간 몇 건 봤나」다.
--
-- 00034가 patient_id nullable + stats_drilldown/stats_export 종류를 열었으나 담을 칸이 없어
-- audit_service.log_stats_* 가 지표·기간·건수·억제를 버리던 것(BLOCKED)을 이 마이그가 푼다.
-- 추가·되돌림 가능·데이터 무변경.
alter table access_audit_log
  add column stats_metric text,          -- 지표: inquiries/self_served/handed_off/ranking/…
  add column stats_period_from date,     -- 조회 기간 시작(포함) — null = 무제한
  add column stats_period_to date,       -- 조회 기간 끝 — null = 무제한
  add column stats_target_count int,     -- 드릴다운/내보내기 대상 건수(억제 전 원값)
  add column stats_csv_rows int,         -- CSV로 실제 쓴 데이터 행 수(내보내기만)
  add column stats_suppressed boolean;   -- k=5 익명성 억제가 한 셀이라도 일어났나(내보내기)

comment on column access_audit_log.stats_metric is
  '[STAT-AUDIT-02] 통계 감사 지표 키. 드릴다운/내보내기 행에만. 개인정보 아님.';
comment on column access_audit_log.stats_suppressed is
  '[BOTSTAT-DASH-13][ALOG-LIST-13] CSV 내보내기에서 5건 미만 셀을 가렸는지 여부.';
