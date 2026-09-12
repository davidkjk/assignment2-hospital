-- 00027_cancel_rejected.sql — 취소 반려를 「놓치면 손해」 배너로 띄우기 위한 저장 자리(hospital_change 패턴 대칭).
-- 직원웹 취소요청 반려가 이 두 칸을 채우고 cancellation_rejected 알림을 보낸다. 환자 [확인]이 비운다.
-- 경계 갭 해소(A안): 직원웹은 반려를 알림으로만 보내 예약 행에 상태·사유가 안 남았는데,
-- CANCEL-REJ-01·04·05(카드 위 배너 + [확인] 눌러야 사라짐 + 확인 후 QR 복귀)는 hospital_change_*와
-- 똑같은 「놓치면 손해」 패턴이라 상태를 남길 자리가 필요하다.
alter table appointments
  add column if not exists cancel_rejected_at timestamptz,
  add column if not exists cancel_rejected_reason text;
