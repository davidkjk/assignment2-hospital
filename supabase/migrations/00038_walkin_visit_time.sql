-- 기능 갭 #85 — 예약에 「실제 진료(방문) 시각」 칸을 연다. (QUEUE-WALK-18 / Task 9)
--
-- 무엇: appointments에 walkin_visit_time(timestamptz)을 더한다.
--   당일 방문(워크인) 환자는 슬롯을 잡지 않으므로(QUEUE-WALK-10·CAL-PAST-08) 예약 시각을
--   slot_id로 표현할 수 없다. 「지금」이 기본이지만 직원이 「아까 왔다」를 적을 수 있어야
--   하고(QUEUE-WALK-14), 그 시각은 실제로 일어난 일의 기록이라 5분 격자에 붙이지 않는다
--   (QUEUE-WALK-14d — 예약은 스냅, 방문 기록은 그대로).
--
-- 왜 slot_id와 별개인가(갭 #85 결정, ui-design-decisions.md:4110):
--   slot_id는 「예약 격자 위의 자리」, walkin_visit_time은 「실제 시각」이다. 둘은 대개 같지만
--   워크인·끼워넣기에서 갈라진다. 슬롯 없는 예약도 시각을 잃지 않도록 별도 칸에 적는다.
--
-- 범위: 이 태스크는 워크인의 방문 시각만 채운다(source='staff', 슬롯 없는 경로). 캘린더가
--   겹침을 시간 범위로 재기 위한 「실제 시작·종료」(CAL-GAP-09·SCHED-SLOT-04~06)는 같은 갭
--   #85의 다른 갈래로 Task 14(00039)가 다룬다. 여기서는 단일 방문 시각 칸만 연다.
--
-- 미래 시각 차단(QUEUE-WALK-16 「지금보다 뒤는 못 고른다」)은 서버층(appointment_service)이
-- 판정한다 — now()는 IMMUTABLE이 아니라 CHECK 제약으로 쓸 수 없다.

alter table appointments
  add column if not exists walkin_visit_time timestamptz;

comment on column appointments.walkin_visit_time is
  '당일 방문(워크인)의 실제 방문 시각(갭 #85). 슬롯 없는 예약이 시각을 잃지 않게 별도로 적는다. 5분 격자에 스냅하지 않는다(QUEUE-WALK-14d).';
