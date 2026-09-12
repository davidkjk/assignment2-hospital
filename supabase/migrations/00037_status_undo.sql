-- 갭 #82 (잔여3, 기반에서 넘어옴) — 예약 상태 「한 칸 역전이」 개통. (UNDO-* / Task 7)
--
-- 무엇: 오늘 병원 안의 진행 4상태(도착·진료대기·진료중·진료완료)에서 **각각 한 칸 뒤로만**
--       되돌릴 수 있게 한다. 잘못 누른 상태를 고치는 「되돌리기」는 확인창 없이(결정 2026-08-06)
--       상시 쓰이므로, 막는 곳이 하나라도 빠지면 「눌렀는데 실패」가 된다.
--
-- 막는 곳이 둘이다(UNDO-IMPL-02):
--   ① 파이썬 appointment_service.VALID_TRANSITIONS / undo_status  (서버 1차 안내)
--   ② DB 트리거 enforce_appointment_status_transition            (최종 방어선, 이 파일)
-- 트리거는 private.appointment_status_transitions 표를 읽어 전이 허용 여부를 판정하므로,
-- 여기서는 **함수를 고치지 않고** 역전이 4행을 표에 심는 것만으로 DB가 역전이를 허용한다.
-- (UNDO-IMPL-04: 1단계 00005는 이미 적용됐으므로 건드리지 않고 이 파일로 덧붙인다.)
--
-- 왜 한 칸만인가(UNDO-SCOPE-04): 진료대기·진료중을 지난 뒤 두 칸 이상 되돌리면 이미 받은
-- 순번과 뒷사람 순서를 어떻게 할지 또 정해야 한다 — 한 칸 규칙이면 그 문제가 애초에 생기지 않는다.
-- 취소 계열(환자취소·병원취소·예약부도)은 자리가 이미 풀렸으므로 역전이를 열지 않는다(새로 예약이 갈 길).

insert into private.appointment_status_transitions (from_status, to_status) values
  ('도착', '예약확정'),
  ('진료대기', '도착'),
  ('진료중', '진료대기'),
  ('진료완료', '진료중')
on conflict (from_status, to_status) do nothing;
