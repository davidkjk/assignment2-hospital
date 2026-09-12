-- [SCHED-SLOT-09][SCHED-WINDOW-01·02] 예약 가능 기간(주)을 관리자가 바꿀 창구.
-- 지금까지 `REGENERATION_WEEKS=8`이 파이썬 상수라 병원이 못 바꿨다 → hospital_settings에 칸을 둔다.
-- 슬롯 생성·예약 검증·문자 예약·대시보드가 이 값을 읽는다(상수는 기본값 fallback으로만 남는다).
-- 범위 1~26주(CHECK). 기본 8주 = 기존 상수와 같아 바꾸기 전엔 동작 불변.
alter table hospital_settings
  add column booking_window_weeks int not null default 8
    check (booking_window_weeks between 1 and 26);

comment on column hospital_settings.booking_window_weeks is
  '[SCHED-WINDOW-01] 오늘부터 몇 주 뒤까지 예약을 받나. 슬롯 생성·예약 검증 공통. 1~26.';

-- [SCHED-WINDOW-03] 예약 기간을 줄이면 범위 밖 빈 자리를 삭제해야 한다(막다른 길 방지).
-- RLS 정책 `receptionist_admin_can_manage_slots`(00005)는 ALL(DELETE 포함)을 접수/관리자에게
-- 이미 허용하나, 테이블 GRANT에 DELETE가 빠져 있어 정책이 발동하지 못했다(잠재 버그 — 슬롯 재생성이
-- 빈 자리를 지우려 할 때 authenticated 역할에서 permission denied). DELETE grant를 더한다.
-- 환자에게는 DELETE 정책이 없으므로(read·update-for-booking만) 여전히 지울 수 없다.
grant delete on table appointment_slots to authenticated;
