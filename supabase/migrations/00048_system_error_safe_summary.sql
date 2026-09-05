-- 결정 #20(안 B) — 관리자 오류 화면엔 '안전한 요약'만, 기술 상세는 redaction 후 뒷단에서.
-- safe_summary: 화면에 보이는 사람이 읽는 요약. message(기존): 저장 시점에 비밀키·PII를 지운 기술 상세.
alter table system_error_log add column safe_summary text;
comment on column system_error_log.safe_summary is
  '관리자 오류 화면에 보이는 안전한 요약(결정 #20). NULL이면 화면이 일반 안내로 대체한다.';
comment on column system_error_log.message is
  '기술 상세 — 저장 시점에 비밀키(6.5)·환자 개인정보를 redaction한 뒤 남긴다(결정 #20). 화면에 노출하지 않는다.';
-- ERRADM-LIST-05 — occurred_at desc, id desc 정렬 + limit 200 조회 인덱스
create index system_error_log_occurred_idx on system_error_log (occurred_at desc, id desc);
