-- 섹션4 ① 마감 후 취소·변경 공통 지원 요청 (갭 #6 / E3, ui-design-decisions:4188~4191, 4273~4276).
-- 옛 설계의 cancellation_requested_at 단일 필드를 폐기하고 support_requested_at + request_type로 대체한다.
-- (cancellation_requested_at은 마이그레이션에 실제 존재한 적이 없어 drop 대상이 없다 — 옛 플랜에만 있었다.)
-- 희망 일시는 저장하지 않는다: 새 시간은 상담 대화에서 정한다.
alter table appointments
  add column support_requested_at timestamptz,
  add column request_type text check (request_type in ('취소', '변경'));

-- 반쯤 채운 상태(요청 시각만 있고 종류가 없거나 그 반대)를 막는다.
alter table appointments
  add constraint appointments_support_request_consistent
  check ((support_requested_at is null) = (request_type is null));
