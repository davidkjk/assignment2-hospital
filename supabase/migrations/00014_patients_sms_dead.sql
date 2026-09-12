-- 섹션4 ⑤ 문자 실패 표식 (ui-design-decisions:3568~3572).
-- 발송 목록을 뒤져서는 판정할 수 없어 환자 쪽에 붙인다. 번호를 고치면 두 칸을 비운다(서버 로직).
-- ⛔ 수신 차단(환자의 선택)은 여기 넣지 않는다 — 번호가 죽은 것과 별개다.
alter table patients
  add column sms_dead boolean not null default false,
  add column sms_dead_checked_at timestamptz;
