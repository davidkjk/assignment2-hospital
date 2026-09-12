-- [ALOG-LIST-08][B-19] 열람 감사 안정 정렬 인덱스.
--
-- ⭐ /admin/access-logs는 (accessed_at desc, id desc)로 정렬해 최신 200건 + cursor/기간
--    이어보기(ALOG-FILTER-06·07)를 준다. 이 인덱스가 없으면 ①매 조회가 full scan이라
--    월 1회 점검(결정 4회차·2년+ 보존)이 느려지고 ②같은 초에 쌓인 동점 열람의 순서가
--    조회마다 흔들려 다음 페이지가 겹치거나 빠진다(SEARCH-ORDER-05가 경고한 사고).
--    id를 동점 키로 함께 넣어 정렬을 유일하게 못박는다.
--
-- ⚠️ payload 칸은 만들지 않는다 — ALOG-LIST-13의 지표·기간·건수·억제 여부 저장은 이 태스크
--    범위가 아니고(플랜 Task 15 Files는 인덱스 전용, 적재는 Task 13 소관), STAT-AUDIT-02는
--    payload에 원문·검색어 복사를 금지할 뿐 컬럼 신설을 요구하지 않는다.
create index if not exists access_audit_log_accessed_at_id_idx
  on access_audit_log (accessed_at desc, id desc);
