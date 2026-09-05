-- [SCHED-EXC-14] 특정 날짜 변경 「되돌리기」는 의사 예외 한 줄을 지운다.
--   doctor_schedule_exceptions에는 select/insert/update만 grant돼 있어(00002:32) DELETE가
--   테이블 권한에서 막혔다(RLS admin_can_manage_schedule_exceptions는 for all이라 통과하지만,
--   RLS 이전에 테이블 GRANT가 먼저 거른다). hospital_closures는 이미 delete가 있어(00041:34)
--   병원 휴무 되돌리기만 되고 의사 예외 되돌리기가 500(permission denied)이 났다.
--   삭제 자체는 admin_can_manage_schedule_exceptions(private.is_admin())가 계속 지킨다.
grant delete on table doctor_schedule_exceptions to authenticated;
