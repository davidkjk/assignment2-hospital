-- ============================================================================
-- seed_demo.sql — 직원웹 데모 손검수용 시드 데이터
-- ----------------------------------------------------------------------------
-- 실행: docker exec -i supabase_db_foundation-auth-data-model \
--         psql -U postgres -d postgres < supabase/seed_demo.sql
--
-- 성질:
--  * 멱등(재실행 안전). 모든 INSERT가 고정 UUID + ON CONFLICT DO NOTHING.
--    (questionnaire_templates는 BEFORE DELETE 트리거로 삭제가 금지돼 있어,
--     정리-후-재삽입 대신 ON CONFLICT 스킵 방식으로 멱등을 잡는다.)
--  * postgres(superuser)로 실행하므로 RLS를 우회한다. auth.uid()가 없으므로
--    appointments의 status-history 트리거는 조용히 스킵된다(설계된 동작).
--
-- 로그인 3계정(+데모용 2번째 의사):
--   admin@gaon.local     / demo1234  (admin)
--   reception@gaon.local / demo1234  (receptionist)
--   doctor@gaon.local    / demo1234  (doctor, 내과)
--   doctor2@gaon.local   / demo1234  (doctor, 정형외과)  ← 2번째 과를 채우기 위한 데모용
-- ============================================================================

begin;

-- ── 1) 진료과 ───────────────────────────────────────────────────────────────
insert into departments (id, name, is_active) values
  ('11111111-1111-1111-1111-111111111111', '내과',   true),
  ('22222222-2222-2222-2222-222222222222', '정형외과', true)
on conflict (id) do nothing;

-- ── 2) auth.users (bcrypt 비밀번호) ─────────────────────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'admin@gaon.local',
   crypt('demo1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'reception@gaon.local',
   crypt('demo1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'doctor@gaon.local',
   crypt('demo1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'doctor2@gaon.local',
   crypt('demo1234', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', false, now(), now(),
   '', '', '', '')
on conflict (id) do nothing;

-- auth.identities (이메일 provider) — 일부 gotrue 흐름이 이 행을 참조한다.
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from auth.users u
where u.id in (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000004'
)
on conflict (provider_id, provider) do nothing;

-- ── 3) staff (auth.users 연결) ──────────────────────────────────────────────
insert into staff (id, auth_user_id, name, role, department_id, is_active) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '김관리', 'admin',        null, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002',
   '박접수', 'receptionist', null, true),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003',
   '이의사', 'doctor',       '11111111-1111-1111-1111-111111111111', true),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000004',
   '최정형', 'doctor',       '22222222-2222-2222-2222-222222222222', true)
on conflict (id) do nothing;

-- ── 4) 주간 운영시간 (doctor_schedule_rules) ─────────────────────────────────
-- 두 의사 모두 월~금(weekday 1~5) 09:00~18:00, 30분 슬롯, 점심 12:00~13:00.
insert into doctor_schedule_rules
  (doctor_id, weekday, start_time, end_time, slot_duration_minutes,
   lunch_start, lunch_end, max_daily_appointments, booking_deadline)
select d.doctor_id, wd, time '09:00', time '18:00', 30,
       time '12:00', time '13:00', 20, time '17:00'
from (values
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid),
  ('bbbbbbbb-0000-0000-0000-000000000004'::uuid)
) as d(doctor_id)
cross join generate_series(1, 5) as wd
on conflict (doctor_id, weekday) do nothing;

-- ── 5) 오늘의 슬롯 ──────────────────────────────────────────────────────────
-- 5a) 예약에 물릴 슬롯은 고정 UUID + '예약됨'으로 먼저 넣는다.
insert into appointment_slots (id, doctor_id, slot_date, start_time, status) values
  -- 내과(이의사)
  ('e0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003', current_date, time '09:00', '예약됨'),
  ('e0000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000003', current_date, time '09:30', '예약됨'),
  ('e0000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000003', current_date, time '10:00', '예약됨'),
  ('e0000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000003', current_date, time '10:30', '예약됨'),
  ('e0000000-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000003', current_date, time '08:30', '예약됨'),
  -- 정형외과(최정형)
  ('e0000000-0000-0000-0000-000000000007', 'bbbbbbbb-0000-0000-0000-000000000004', current_date, time '09:00', '예약됨'),
  ('e0000000-0000-0000-0000-000000000008', 'bbbbbbbb-0000-0000-0000-000000000004', current_date, time '09:30', '예약됨'),
  ('e0000000-0000-0000-0000-000000000009', 'bbbbbbbb-0000-0000-0000-000000000004', current_date, time '08:30', '예약됨')
on conflict (doctor_id, slot_date, start_time) do nothing;

-- 5b) 나머지 빈 슬롯은 09:00~17:30을 30분 간격으로 채운다(이미 있는 시간은 스킵).
insert into appointment_slots (doctor_id, slot_date, start_time, status)
select d.doctor_id, current_date, g.t::time, '빈시간'
from (values
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid),
  ('bbbbbbbb-0000-0000-0000-000000000004'::uuid)
) as d(doctor_id)
cross join generate_series(
  timestamp '2000-01-01 09:00', timestamp '2000-01-01 17:30', interval '30 min'
) as g(t)
on conflict (doctor_id, slot_date, start_time) do nothing;

-- ── 6) 환자 10명 ────────────────────────────────────────────────────────────
insert into patients (id, name, birth_date, gender, phone, is_active) values
  ('c0000000-0000-0000-0000-000000000001', '강민준', '1985-03-12', '남', '010-2001-0001', true),
  ('c0000000-0000-0000-0000-000000000002', '이서연', '1992-07-25', '여', '010-2001-0002', true),
  ('c0000000-0000-0000-0000-000000000003', '박도윤', '1978-11-03', '남', '010-2001-0003', true),
  ('c0000000-0000-0000-0000-000000000004', '최지우', '2001-01-19', '여', '010-2001-0004', true),
  ('c0000000-0000-0000-0000-000000000005', '정하준', '1965-09-30', '남', '010-2001-0005', true),
  ('c0000000-0000-0000-0000-000000000006', '윤서아', '1998-05-08', '여', '010-2001-0006', true),
  ('c0000000-0000-0000-0000-000000000007', '임예준', '1988-12-22', '남', '010-2001-0007', true),
  ('c0000000-0000-0000-0000-000000000008', '한지민', '1995-04-14', '여', '010-2001-0008', true),
  ('c0000000-0000-0000-0000-000000000009', '오시우', '1972-08-17', '남', '010-2001-0009', true),
  ('c0000000-0000-0000-0000-000000000010', '신유나', '2004-02-28', '여', '010-2001-0010', true)
on conflict (id) do nothing;

-- ── 7) 예약 (오늘, 상태 다양) ───────────────────────────────────────────────
-- 담당의 소속과 예약 진료과가 일치해야 하고(트리거), 슬롯 담당의도 일치해야 한다.
-- booking_code는 BEFORE INSERT 트리거가 자동 발급한다.
insert into appointments
  (id, slot_id, account_patient_id, for_patient_id, department_id, doctor_id,
   reason, status, source, queue_position, created_by) values
  -- 내과(이의사, dept 내과)
  ('d0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000003',
   '감기 기운', '예약확정', 'app', null, 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000003',
   '소화불량', '도착', 'staff', null, 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000003',
   '기침 지속', '진료대기', 'staff', 2, 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004',
   'c0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000003',
   '몸살', '진료중', 'app', 1, 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000005',
   'c0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000003',
   '정기 검진', '진료완료', 'app', null, 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000006', null,
   'c0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006',
   '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000003',
   '두통', '환자취소', 'app', null, 'bbbbbbbb-0000-0000-0000-000000000002'),
  -- 정형외과(최정형, dept 정형외과)
  ('d0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000007',
   'c0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000007',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000004',
   '무릎 통증', '예약확정', 'app', null, 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000008',
   'c0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000008',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000004',
   '발목 염좌', '진료대기', 'staff', 1, 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000009',
   'c0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000004',
   '허리 통증', '진료완료', 'staff', null, 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000010', null,
   'c0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000010',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000004',
   '어깨 통증', '병원취소', 'app', null, 'bbbbbbbb-0000-0000-0000-000000000002')
on conflict (id) do nothing;

-- ── 8) 문진표 버전 (진료과별 v1) ────────────────────────────────────────────
insert into questionnaire_templates (department_id, questions, version_no, is_active, created_by)
values
  ('11111111-1111-1111-1111-111111111111',
   '[{"id":"q1","type":"text","label":"현재 가장 불편한 증상을 알려주세요"},
     {"id":"q2","type":"single","label":"증상이 시작된 시점","options":["오늘","3일 이내","1주일 이상"]},
     {"id":"q3","type":"single","label":"복용 중인 약이 있나요?","options":["없음","있음"]}]'::jsonb,
   1, true, 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222',
   '[{"id":"q1","type":"text","label":"통증 부위를 알려주세요"},
     {"id":"q2","type":"single","label":"통증 정도","options":["약함","보통","심함"]},
     {"id":"q3","type":"single","label":"다친 경위가 있나요?","options":["없음","운동","낙상","기타"]}]'::jsonb,
   1, true, 'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (department_id, version_no) do nothing;

-- ── 9) 병원 설정 (싱글턴) ───────────────────────────────────────────────────
insert into hospital_settings (id, hospital_address, hospital_phone)
values (true, '서울특별시 강남구 테헤란로 123, 가온빌딩 3층', '02-1234-5678')
on conflict (id) do nothing;

commit;
