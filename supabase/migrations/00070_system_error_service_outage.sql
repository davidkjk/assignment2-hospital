-- A2 서비스 전체 장애 배지 (ERRADM-NOTI-02) — 데모병합 후속.
-- 결정19(안 A): 수신자별 발송 실패는 발송 이력(/messages)에만, "서비스 전체 장애"만 이 표에
--   한 줄로 소비한다. 그 "한 줄"을 amber 배지로 구분하려면 행마다 장애 여부 플래그가 필요하다.
--   데모(record/Errors.tsx)의 `service?: boolean`에 대응하는 백엔드 칸이 없어(실행플랜 §9 갭)
--   배지를 못 그리던 것을 이 칸으로 해소한다.
-- ⚠️ 이 칸은 "서비스 전체 장애"(발송 업체 무응답 등 시스템 차원)일 때만 true. 환자 한 명·한 채널의
--   개별 실패는 여기 오지 않는다(ERRADM-NOTI-01 — 발송 이력 소관). 채우는 주체는 향후 SMS/push
--   디스패처(배포 T30 공유)이며, 지금은 시드로만 몇 건 표시한다.
-- 업체 오류코드 → "문자 서비스 장애" 분류 매핑은 여전히 구현 계약(ERRADM-NOTI-02 매핑 BLOCKED).
alter table system_error_log
  add column if not exists is_service_outage boolean not null default false;

comment on column system_error_log.is_service_outage is
  '서비스 전체 장애 여부(ERRADM-NOTI-02·결정19). true면 관리자 오류 화면에 amber 배지로 한 줄 구분. '
  '환자별 개별 발송 실패는 여기 아니라 notification_log/발송 이력 소관(ERRADM-NOTI-01).';
