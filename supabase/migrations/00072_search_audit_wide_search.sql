-- [SEARCH-LOG-06] 「넓은 검색」(조각 하나로 N명 이상 조회) 표시를 위한 데이터 적재 + 임계값.
--
-- 이전엔 검색 감사가 검색어(search_term)만 남기고 결과 건수·조각 수를 남기지 않아, 관리자
-- 기록장이 「1958 한 조각으로 41명을 훑음」과 「김 1234로 2명을 봄」을 구분할 수 없었다
-- (SB-22 A안이 데이터를 미리 쌓기로 했으나 실제 적재 경로가 없었다 — 문서가 낡음, 원문 확인).
--
-- ① access_audit_log에 검색 결과 건수·조각 수를 담을 칸(검색 사건에만 채운다, 그 밖은 null).
-- ② N(넓은 검색 판정 기준)은 병원이 조정할 설정값으로 둔다 — long_wait_threshold_minutes와
--    같은 패턴이라, 정책이 확정되면 관리자 설정에서 숫자만 바꾸면 된다. 기본 20명.

alter table access_audit_log
  add column result_count int,
  add column fragment_count int;

comment on column access_audit_log.result_count is
  '[SEARCH-LOG-06] 검색 사건의 결과 건수(전체, 페이징 전). 검색 아닌 사건은 null.';
comment on column access_audit_log.fragment_count is
  '[SEARCH-LOG-06] 검색어 조각 수(공백 분리). 1이면 좁히지 않은 한 조각 검색. 검색 아닌 사건은 null.';

alter table hospital_settings
  add column wide_search_threshold_count int not null default 20;

comment on column hospital_settings.wide_search_threshold_count is
  '[SEARCH-LOG-06] 넓은 검색 판정 N — 조각 하나(fragment_count=1)로 이 수 이상(result_count>=N) 조회하면 ⚠ 표시. 기본 20.';
