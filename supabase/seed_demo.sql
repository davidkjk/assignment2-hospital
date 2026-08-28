-- ============================================================================
-- seed_demo.sql — 직원웹 데모 손검수용 "대규모" 시드 데이터
-- ----------------------------------------------------------------------------
-- 실행: docker exec -i supabase_db_foundation-auth-data-model \
--         psql -U postgres -d postgres < supabase/seed_demo.sql
--
-- 규모(손검수용):
--   * 진료과 4개(내과·정형외과·이비인후과·소아과), 과당 의사 2명 = 의사 8명.
--   * 의사 8명 로그인: doctor1@gaon.local ~ doctor8@gaon.local / demo1234.
--   * 관리자 admin@gaon.local, 접수 reception@gaon.local / demo1234 (유지).
--   * 환자 150명.
--   * 예약 ~100건/일 × 3일(어제·오늘·내일) = ~300건. 각 예약은 고유 슬롯 참조.
--
-- 성질:
--   * postgres(superuser)로 실행 → RLS 우회. auth.uid()가 없으므로 status-history
--     트리거는 조용히 스킵된다(설계된 동작). booking_code는 트리거 자동발급.
--   * 맨 위 preamble이 데모 트랜잭션 데이터를 FK 순서대로 지운다(재실행 안전).
--     로그인 계정(admin·reception)과 진료과·문진표 템플릿은 보존/재사용한다.
--     questionnaire_templates는 BEFORE DELETE 트리거로 삭제금지 → ON CONFLICT 스킵.
-- ============================================================================

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 0) PREAMBLE — 데모 트랜잭션 데이터 정리 (FK 자식 → 부모 순서)
-- ════════════════════════════════════════════════════════════════════════════
-- appointments / patients / staff(의사)를 참조하는 모든 테이블을 먼저 비운다.
delete from schedule_change_acks;
delete from medical_record_revisions;
delete from medical_records;
delete from questionnaire_responses;
delete from scheduled_notification_recipients;
delete from scheduled_notifications;
delete from notification_log;
delete from notification_preferences;
delete from device_tokens;
delete from access_audit_log;
delete from settings_audit_log;
delete from doctor_quick_phrases;
delete from patient_internal_notes;
delete from patient_family_links;
delete from patient_merges;
delete from appointment_status_history;
delete from appointments;
delete from appointment_slots;
delete from doctor_schedule_exceptions;
delete from doctor_schedule_rules;
delete from patients;

-- 옛 의사 계정을 제거한다(admin·reception은 유지). 위에서 참조 테이블을 모두 비웠다.
delete from staff where role = 'doctor';
delete from auth.identities
  where user_id in (select id from auth.users where email like 'doctor%@gaon.local');
delete from auth.users where email like 'doctor%@gaon.local';

-- ════════════════════════════════════════════════════════════════════════════
-- 1) 진료과 4개
-- ════════════════════════════════════════════════════════════════════════════
insert into departments (id, name, is_active) values
  ('11111111-1111-1111-1111-111111111111', '내과',     true),
  ('22222222-2222-2222-2222-222222222222', '정형외과', true),
  ('33333333-3333-3333-3333-333333333333', '이비인후과', true),
  ('44444444-4444-4444-4444-444444444444', '소아과',   true)
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) auth.users (bcrypt 비밀번호 = demo1234) — 관리자·접수 + 의사 8명
-- ════════════════════════════════════════════════════════════════════════════
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id,
  'authenticated', 'authenticated', u.email,
  crypt('demo1234', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', false, now(), now(),
  '', '', '', ''
from (values
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'admin@gaon.local'),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'reception@gaon.local'),
  ('aaaaaaaa-0000-0000-0000-000000000011'::uuid, 'doctor1@gaon.local'),
  ('aaaaaaaa-0000-0000-0000-000000000012'::uuid, 'doctor2@gaon.local'),
  ('aaaaaaaa-0000-0000-0000-000000000013'::uuid, 'doctor3@gaon.local'),
  ('aaaaaaaa-0000-0000-0000-000000000014'::uuid, 'doctor4@gaon.local'),
  ('aaaaaaaa-0000-0000-0000-000000000015'::uuid, 'doctor5@gaon.local'),
  ('aaaaaaaa-0000-0000-0000-000000000016'::uuid, 'doctor6@gaon.local'),
  ('aaaaaaaa-0000-0000-0000-000000000017'::uuid, 'doctor7@gaon.local'),
  ('aaaaaaaa-0000-0000-0000-000000000018'::uuid, 'doctor8@gaon.local')
) as u(id, email)
on conflict (id) do nothing;

-- auth.identities (이메일 provider)
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
from auth.users u
where u.email in (
  'admin@gaon.local','reception@gaon.local',
  'doctor1@gaon.local','doctor2@gaon.local','doctor3@gaon.local','doctor4@gaon.local',
  'doctor5@gaon.local','doctor6@gaon.local','doctor7@gaon.local','doctor8@gaon.local'
)
on conflict (provider_id, provider) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) staff — 관리자·접수 + 의사 8명(진료과 분산·색 0~7·전공)
-- ════════════════════════════════════════════════════════════════════════════
insert into staff (id, auth_user_id, name, role, department_id, is_active) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '김관리', 'admin',        null, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002',
   '박접수', 'receptionist', null, true)
on conflict (id) do nothing;

insert into staff (id, auth_user_id, name, role, department_id, is_active, specialty, calendar_color_index) values
  ('bbbbbbbb-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000011',
   '이정민', 'doctor', '11111111-1111-1111-1111-111111111111', true, '소화기내과', 0),
  ('bbbbbbbb-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000012',
   '김서준', 'doctor', '11111111-1111-1111-1111-111111111111', true, '호흡기내과', 1),
  ('bbbbbbbb-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000013',
   '최도윤', 'doctor', '22222222-2222-2222-2222-222222222222', true, '척추·관절', 2),
  ('bbbbbbbb-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000014',
   '정하은', 'doctor', '22222222-2222-2222-2222-222222222222', true, '스포츠의학', 3),
  ('bbbbbbbb-0000-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000015',
   '강수아', 'doctor', '33333333-3333-3333-3333-333333333333', true, '비염·부비동', 4),
  ('bbbbbbbb-0000-0000-0000-000000000016', 'aaaaaaaa-0000-0000-0000-000000000016',
   '윤지호', 'doctor', '33333333-3333-3333-3333-333333333333', true, '이명·난청', 5),
  ('bbbbbbbb-0000-0000-0000-000000000017', 'aaaaaaaa-0000-0000-0000-000000000017',
   '임채원', 'doctor', '44444444-4444-4444-4444-444444444444', true, '영유아 검진', 6),
  ('bbbbbbbb-0000-0000-0000-000000000018', 'aaaaaaaa-0000-0000-0000-000000000018',
   '한지우', 'doctor', '44444444-4444-4444-4444-444444444444', true, '소아 호흡기', 7)
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) 주간 운영시간 (doctor_schedule_rules) — 의사 8명 월~금 09:00~18:00
-- ════════════════════════════════════════════════════════════════════════════
insert into doctor_schedule_rules
  (doctor_id, weekday, start_time, end_time, slot_duration_minutes,
   lunch_start, lunch_end, max_daily_appointments, booking_deadline)
select s.id, wd, time '09:00', time '18:00', 30,
       time '12:00', time '13:00', 20, time '17:00'
from staff s
cross join generate_series(1, 5) as wd
where s.role = 'doctor'
on conflict (doctor_id, weekday) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 5) 환자 150명 (다양한 한국 이름·전화·생년월일)
-- ════════════════════════════════════════════════════════════════════════════
insert into patients (name, birth_date, gender, phone, is_active)
select
  (array['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','류','전'])[((i-1)%20)+1]
  || (array['민준','서연','도윤','지우','하준','서아','예준','지민','시우','유나',
            '지호','수아','건우','하은','우진','채원','지훈','다은','현우','예은',
            '준서','소율','시윤','예린','도현'])[((i*7)%25)+1],
  (date '1948-01-01' + ((i*211)%26000) * interval '1 day')::date,
  case when i % 2 = 0 then '남' else '여' end,
  '010-' || lpad(((i*37) % 9000 + 1000)::text, 4, '0')
        || '-' || lpad(((i*53) % 9000 + 1000)::text, 4, '0'),
  true
from generate_series(1, 150) as i;

-- ════════════════════════════════════════════════════════════════════════════
-- 6) 예약 슬롯 — 의사 8명 × 3일(어제·오늘·내일) × 16타임(30분, 점심 12~13 제외)
-- ════════════════════════════════════════════════════════════════════════════
-- 타임: 09:00~11:30(6) + 13:00~17:30(10) = 16. 모두 '빈시간'으로 넣고,
-- 예약이 물린 슬롯만 뒤에서 '예약됨'으로 바꾼다.
insert into appointment_slots (doctor_id, slot_date, start_time, status)
select s.id, dy.dd, t.st, '빈시간'
from staff s
cross join (values (current_date - 1), (current_date), (current_date + 1)) as dy(dd)
cross join (
  select (timestamp '2000-01-01 09:00' + (n * interval '30 min'))::time as st
  from generate_series(0, 5) as n           -- 09:00 ~ 11:30
  union all
  select (timestamp '2000-01-01 13:00' + (n * interval '30 min'))::time as st
  from generate_series(0, 9) as n           -- 13:00 ~ 17:30
) as t
where s.role = 'doctor'
on conflict (doctor_id, slot_date, start_time) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 7) 예약 ~300건 — 각 (의사,일자)의 앞 K개 슬롯을 채운다
-- ════════════════════════════════════════════════════════════════════════════
-- K: 색 0~3 의사는 13건, 4~7 의사는 12건 → 하루 4*13+4*12 = 100건.
-- 상태 분포:
--   어제(y): rn1=환자취소, rn2·3=예약부도, 나머지=진료완료.
--   오늘(t): 확정·도착·진료대기·진료중(1/의사)·완료·환자취소·병원취소·부도 골고루.
--   내일(m): 전부 예약확정.
with docs as (
  select s.id as doctor_id, s.department_id, s.calendar_color_index as cidx,
         case when s.calendar_color_index < 4 then 13 else 12 end as k
  from staff s where s.role = 'doctor'
),
ranked as (
  select sl.id as slot_id, sl.doctor_id, sl.slot_date,
         row_number() over (partition by sl.doctor_id, sl.slot_date order by sl.start_time) as rn
  from appointment_slots sl
),
chosen as (
  select r.slot_id, r.doctor_id, r.slot_date, r.rn, d.department_id, d.k,
         case
           when r.slot_date > current_date then 'm'
           when r.slot_date < current_date then 'y'
           else 't'
         end as tag
  from ranked r
  join docs d on d.doctor_id = r.doctor_id
  where r.rn <= d.k
)
insert into appointments
  (slot_id, account_patient_id, for_patient_id, department_id, doctor_id,
   reason, status, source, created_by)
select
  c.slot_id, pt.pid, pt.pid, c.department_id, c.doctor_id,
  (array['감기 기운','소화불량','기침 지속','몸살','정기 검진','두통','복통',
         '어지럼증','발열','피로감','알레르기 증상','목 통증','무릎 통증',
         '허리 통증','건강검진 상담'])[(c.rn % 15) + 1],
  case c.tag
    when 'm' then '예약확정'
    when 'y' then case
        when c.rn = 1 then '환자취소'
        when c.rn in (2, 3) then '예약부도'
        when c.rn = 4 then '진료대기'   -- 마감 안 된 전일 미완료(도착/대기) → /today「전일 미완료」가 산다
        when c.rn = 5 then '도착'
        else '진료완료' end
    else case c.rn                              -- 오늘
        when 1 then '진료완료'
        when 2 then '진료완료'
        when 3 then '도착'
        when 4 then '진료대기'
        when 5 then '진료중'
        when 6 then '예약확정'
        when 7 then '예약확정'
        when 8 then '도착'
        when 9 then '진료대기'
        when 10 then '예약확정'
        when 11 then '환자취소'
        when 12 then '병원취소'
        else '예약부도' end
  end,
  case when c.rn % 3 = 0 then 'staff'
       when c.rn % 5 = 0 then 'chatbot'
       else 'app' end,
  'bbbbbbbb-0000-0000-0000-000000000002'
from chosen c
join lateral (
  select p.id as pid from patients p
  order by md5(c.slot_id::text || p.id::text)
  limit 1
) pt on true;

-- 예약이 물린(취소류가 아닌) 슬롯만 '예약됨'으로. 취소류는 자리를 놓아준 상태로 둔다
-- (슬롯 status는 '빈시간'이되 예약 행은 slot_id를 유지 → 일자 스코프가 slot_date로 잡힌다).
update appointment_slots sl
set status = '예약됨'
where exists (
  select 1 from appointments a
  where a.slot_id = sl.id
    and a.status not in ('환자취소', '병원취소', '예약부도')
);

-- ════════════════════════════════════════════════════════════════════════════
-- 8) 문진표 버전 (진료과별 v1) — 삭제금지 트리거 → ON CONFLICT 스킵
-- ════════════════════════════════════════════════════════════════════════════
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
   1, true, 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('33333333-3333-3333-3333-333333333333',
   '[{"id":"q1","type":"text","label":"증상 부위를 알려주세요(코·귀·목)"},
     {"id":"q2","type":"single","label":"증상 기간","options":["3일 이내","1주일","2주 이상"]},
     {"id":"q3","type":"single","label":"발열이 있나요?","options":["없음","있음"]}]'::jsonb,
   1, true, 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444444',
   '[{"id":"q1","type":"text","label":"아이의 증상을 알려주세요"},
     {"id":"q2","type":"single","label":"체온","options":["정상","미열(37~38도)","고열(38도 이상)"]},
     {"id":"q3","type":"single","label":"예방접종은 최신인가요?","options":["예","아니오","모름"]}]'::jsonb,
   1, true, 'bbbbbbbb-0000-0000-0000-000000000001')
on conflict (department_id, version_no) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 9) 병원 설정 (싱글턴)
-- ════════════════════════════════════════════════════════════════════════════
insert into hospital_settings (id, hospital_address, hospital_phone)
values (true, '서울특별시 강남구 테헤란로 123, 가온빌딩 3층', '02-1234-5678')
on conflict (id) do nothing;

commit;
