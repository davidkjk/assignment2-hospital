-- [Task 19] 의사 프로필·캘린더 색 (갭 #7·#83)
-- staff에 전공·소개·사진·색 칸이 하나도 없어서 3단계 예약 화면·캘린더 색 구분·상담봇 지식이
-- 통째로 막혀 있었다. 1단계 00001을 고치지 않고 얹는다.

alter table staff
  add column specialty text,
  add column bio text,
  add column photo_url text,
  add column calendar_color_index smallint;

-- 팔레트는 10색이다(CAL-COLOR-11). 11번은 토큰이 없어 화면에서 색 없는 블록이 된다.
alter table staff add constraint staff_color_range
  check (calendar_color_index is null or calendar_color_index between 0 and 9);

-- 색은 의사에게만(CAL-COLOR-08). 접수직원·관리자는 캘린더에 열이 생기지 않는다.
alter table staff add constraint staff_color_doctor_only
  check (calendar_color_index is null or role = 'doctor');

-- ⛔ unique 제약을 걸지 않는다(CAL-COLOR-07). 의사가 팔레트보다 많아지면 계정 생성 자체가
--    막히는 막다른 길이 된다. 겹침은 화면이 「사용중」으로 알린다.

-- 사진 저장소 — 환자 앱 의사 카드가 읽으므로 공개 읽기다(BOOK-DOC-02).
insert into storage.buckets (id, name, public)
  values ('doctor-photos', 'doctor-photos', true)
  on conflict (id) do nothing;

-- 읽기는 열려 있다(누구나 의사 사진을 본다).
drop policy if exists "doctor_photos_public_read" on storage.objects;
create policy "doctor_photos_public_read" on storage.objects
  for select using (bucket_id = 'doctor-photos');

-- 쓰기·지우기는 관리자만. 아무나 의사 사진을 바꿔 놓을 수 없다(STAFF-PROFILE-06).
drop policy if exists "doctor_photos_admin_write" on storage.objects;
create policy "doctor_photos_admin_write" on storage.objects
  for all using (bucket_id = 'doctor-photos' and private.is_admin())
  with check (bucket_id = 'doctor-photos' and private.is_admin());
