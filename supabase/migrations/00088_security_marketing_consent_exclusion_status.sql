-- [보안 F-04] 광고 발송 시점 수신동의 재확인 — '제외' 배달 상태 추가.
-- 정본: docs/security-audit-2026-09-04/ F-04(Medium, confirmed) + 규칙 SEND-ADS-01.
--
-- 광고(kind=marketing)는 예약 순간에 동의자만 명단에 남기지만(message_service.resolve_recipients),
-- 예약 후 발송 전에 환자가 동의를 철회할 수 있다. 발송 시점(dispatch_service._dispatch_one)에
-- 현재 ads_consent를 한 번 더 확인해, 철회했으면 「조용히 누락」하지 않고 '제외'로 기록한다
-- (코디 결정 2026-09-04: 로그 남기고 제외). 이를 위해 delivery_status CHECK(00011)에 '제외'를 더한다.
--
-- '제외'는 배달 실패('실패')와 구분된다 — 실패는 직원의 「전화해야 할」 후속(SEND-BADGE·failed_list)을
-- 부르지만 '제외'는 정책상 안 보낸 것이라 후속이 없다. 값 추가만·기존 값/데이터 무변경·되돌림 가능.
-- ⚠️ 원격 미적용 — 로컬 apply만. 배포 시 db push.

alter table notification_log drop constraint notification_log_delivery_status_check;
alter table notification_log add constraint notification_log_delivery_status_check
  check (delivery_status in ('발송중', '도달', '실패', '재시도중', '제외'));
