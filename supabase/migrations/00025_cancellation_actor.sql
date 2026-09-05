-- 갭 #11·C2-#6(2026-08-20) — 취소 주체·시각. appointments(00005)에 4칼럼 추가.
-- 이 파일이 유일한 생성 주체다(전엔 참조만 있고 DDL 부재 → SELECT가 column does not exist로 실패했다).
-- cancelled_by는 환자앱이 읽는 text 판별자('hospital'|'patient'). 직원 신원은 appointment_status_history.changed_by에 이미 있다.
alter table appointments
  add column if not exists cancelled_by text check (cancelled_by in ('hospital','patient')),
  add column if not exists cancelled_by_relation text,   -- 가족 대행 취소면 관계(예: '자녀')
  add column if not exists cancelled_by_name text,        -- 가족 대행 취소면 이름(CARD-CXL-03 '${relation} ${name} 님이 취소')
  add column if not exists cancelled_at timestamptz;
-- RLS·grant는 appointments가 표 단위로 이미 준다. 값 채우기는 이 서비스(환자='patient')·직원웹 취소(='hospital').

-- 환자 세션은 hospital_settings를 통째로 못 읽는다(민감칸·staff 전용 SELECT 정책 — Task 5 get_auto_confirm_app_bookings와 같은 상황).
-- 취소 마감 판정에 필요한 cancellation_deadline_hours 한 칸만 여는 definer 창구다. 행이 없으면 00004 기본값 24.
-- 이게 없으면 cancel_appointment가 환자 RLS로 hospital_settings를 읽어 NULL → timedelta(hours=None) TypeError로 터진다.
create or replace function get_cancellation_deadline_hours()
returns int
language sql security definer set search_path = '' as $$
  select coalesce((select cancellation_deadline_hours from public.hospital_settings limit 1), 24);
$$;
revoke execute on function get_cancellation_deadline_hours() from public;
grant execute on function get_cancellation_deadline_hours() to authenticated;
