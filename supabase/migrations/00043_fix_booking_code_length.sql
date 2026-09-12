-- [갭 #127] random()*32는 0 이상 32 미만인데 ::int가 반올림이라 31.5 이상이면 32가 되고,
-- +1 해서 33번째 글자를 찾는다. 글자 목록은 32자뿐이라 substr이 빈 문자열을 돌려주고
-- 그 자리가 통째로 빠졌다 — 실측 2만 건에서 5자리 8.3%, 4자리 0.4%.
-- CHKIN-CODE-04가 "6자리가 아니면 조회하지 않는다"이므로, 서버가 발급한 멀쩡한 번호를
-- 접수 화면이 거절하는 막다른 길이었다. 반올림을 버림(floor)으로 바꾼다.
create or replace function generate_booking_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', floor(random() * 32)::int + 1, 1), '')
  from generate_series(1, 6);
$$;
