-- 00077 · 환자 앱 병원 공개정보 창구 (HSETX-SEC-01) — hospital_settings 환자 read 500 해소.
--
-- 근본원인: hospital_settings SELECT 정책이 staff_can_read_hospital_settings
--   (private.is_active_staff()) 하나뿐이라 환자/익명 컨텍스트는 0행 →
--   settings_service.get_public_hospital_info 가 dict(None) 으로 500.
--   (hospital_hours·hospital_closures 는 00031 이 환자 read 정책을 얹어 정상.)
-- 훼손 3화면: 예약상세 장소·전화(APPT-INFO-04·05) / 홈 병원정보줄(HOME-INFO) / 설정 병원안내.
--
-- 해결: 공개 2필드(주소·전화)만 반환하는 SECURITY DEFINER 함수.
--   함수 소유자(postgres) 권한으로 RLS 를 우회하되 딱 이 두 컬럼만 노출 →
--   운영시간·취소마감·자동확정·문자 시크릿 등 내부 설정 유출면 0 (좁은 창구 유지).

create or replace function public.get_public_hospital_info()
returns table (hospital_address text, hospital_phone text)
language sql
stable
security definer
set search_path = public
as $$
  select hospital_address, hospital_phone from hospital_settings where id;
$$;

revoke all on function public.get_public_hospital_info() from public;
grant execute on function public.get_public_hospital_info() to anon, authenticated;
