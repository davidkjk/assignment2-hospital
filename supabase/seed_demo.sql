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
  select sl.id as slot_id, sl.doctor_id, sl.slot_date, sl.start_time,
         row_number() over (partition by sl.doctor_id, sl.slot_date order by sl.start_time) as rn
  from appointment_slots sl
),
chosen as (
  select r.slot_id, r.doctor_id, r.slot_date, r.start_time, r.rn, d.department_id, d.k, d.cidx,
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
    -- ⭐ 오늘은 **슬롯 순번이 아니라 「지금 시각을 지났는지」**로 가른다(2026-08-28).
    --    순번으로만 정하면 오후 4시에 화면을 열어도 오전 11시 예약이 「예약확정」으로 남아
    --    「미접수·시각 경과」가 24건씩 쌓인다 — 창구에서 나올 수 없는 그림이다.
    else case
        when (c.slot_date + c.start_time) > (now() at time zone 'Asia/Seoul')
          -- 아직 오지 않은 시각: 대부분 확정이고, 가끔 취소가 섞인다.
          then case when c.rn % 9 = 0 then '환자취소' else '예약확정' end
          -- 이미 지난 시각: 진료가 끝났거나 진행 중이거나 대기 중이다.
          --   ⚠️ 여덟에 하나만 '예약확정'으로 남긴다 = **「미접수·시각 경과」 카드**(TODAY-NOSHOW-01).
          --      전부 남기면 카드가 오늘 예약 전체가 되고, 하나도 없으면 카드가 빈다.
          -- ⭐ 의사 색 번호를 더해 **의사마다 순번을 어긋나게** 한다. 안 그러면 여덟 의사가
          --    똑같은 순번에서 같은 상태가 되어 「미접수」 8건이 전부 같은 시각(13:30)에 몰린다.
          else case (c.rn + c.cidx) % 8
            when 0 then '예약확정'
            when 1 then '진료완료'
            when 2 then '진료완료'
            when 3 then '진료대기'
            when 4 then '도착'
            when 5 then '진료중'
            when 6 then '진료완료'
            else '예약부도' end
      end
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

-- ════════════════════════════════════════════════════════════════════════════
-- 10) 상태 이력 — 「장기 대기」 카드가 여기서 나온다 (TODAY-WAIT)
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ 이 시드는 postgres(superuser)로 돌아 auth.uid()가 없다 → 예약 상태 트리거가 이력을
--    조용히 스킵한다. 그래서 이력을 **직접 심는다.** 심지 않으면 「장기 대기」가 영원히 0이다
--    (대기 시각을 appointment_status_history의 `→진료대기` 행에서만 읽기 때문).
-- 대기 시간은 now() 기준 상대값이라 **언제 실행해도** 카드가 찬다(병원 설정 임계 30분).
insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, changed_at)
select a.id, '예약확정', '도착', 'bbbbbbbb-0000-0000-0000-000000000002',
       -- 도착은 진료대기보다 조금 앞선다. 값을 나머지연산으로 가둬 「몇 시간 대기」 같은
       -- 현실에 없는 숫자가 나오지 않게 한다(창구에서 읽을 수 있는 범위로).
       now() - make_interval(mins => 12 + ((row_number() over (order by a.id))::int * 13) % 70)
from appointments a
join appointment_slots s on s.id = a.slot_id
where s.slot_date = current_date and a.status in ('도착', '진료대기', '진료중', '진료완료');

-- 진료대기로 넘어간 시각 — 줄마다 다르게 흩어 「26분 대기」처럼 읽히게 한다.
-- ⭐ 아직 기다리는 사람(오늘 '진료대기')만 따로 센다 — 진료중·진료완료까지 한 번에 세면
--    넷에 하나 규칙이 그들에게도 나뉘어 장기 대기가 한두 건으로 쪼그라든다.
insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, changed_at)
select x.id, '도착', '진료대기', 'bbbbbbbb-0000-0000-0000-000000000002',
       -- 넷에 하나만 임계(병원 설정 30분)를 넘긴다. 전부 장기 대기면 카드가 무의미해지고,
       -- 하나도 없으면 화면이 무엇을 보여주려는 카드인지 알 수 없다.
       now() - case when x.rn % 4 = 0
                    then make_interval(mins => 34 + (x.rn * 9) % 30)
                    else make_interval(mins => 4 + (x.rn * 11) % 23)
               end
from (
  select a.id, (row_number() over (order by a.id))::int as rn
  from appointments a
  join appointment_slots s on s.id = a.slot_id
  where s.slot_date = current_date and a.status = '진료대기'
) as x;

-- 이미 진료로 넘어간 사람들 — 대기 카드에는 안 잡히지만 이력이 비면 상세가 허전하다.
insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, changed_at)
select a.id, '도착', '진료대기', 'bbbbbbbb-0000-0000-0000-000000000002', now() - interval '55 min'
from appointments a
join appointment_slots s on s.id = a.slot_id
where s.slot_date = current_date and a.status in ('진료중', '진료완료');

insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, changed_at)
select a.id, '진료대기', '진료중', 'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '18 min'
from appointments a
join appointment_slots s on s.id = a.slot_id
where s.slot_date = current_date and a.status in ('진료중', '진료완료');

-- ════════════════════════════════════════════════════════════════════════════
-- 11) 취소·변경 상담 — 「확인 필요 예약」 카드 (SUPPORT-*)
-- ════════════════════════════════════════════════════════════════════════════
-- 마감 후 취소·변경 문의가 들어와 직원이 확인해야 하는 예약. 환자에게는 "상담으로 연결됐다"만
-- 말한다(취소가 접수됐다고 하지 않는다) — 그 상태를 만드는 데이터다.
update appointments a
   set support_requested_at = now() - make_interval(mins => 20 + (x.rn * 37)),
       request_type = case when x.rn % 2 = 0 then '취소' else '변경' end
  from (
    select a2.id, (row_number() over (order by a2.id))::int as rn
    from appointments a2
    join appointment_slots s2 on s2.id = a2.slot_id
    -- ⭐ 앞으로의 예약에만 붙인다 — 오늘 지난 시각의 '예약확정'은 「미접수·시각 경과」 카드가
    --    이미 가져간다. 같은 사람이 두 카드에 겹쳐 나오면 「지금 처리할 것」 숫자가 부풀고
    --    창구가 같은 건을 두 번 처리하게 된다.
    where a2.status = '예약확정' and s2.slot_date > current_date
    limit 7
  ) as x
 where a.id = x.id;

-- ════════════════════════════════════════════════════════════════════════════
-- 12) 안내 발송 기록 — /messages 목록 + 사이드바 배지(SEND-BADGE-01)
-- ════════════════════════════════════════════════════════════════════════════
-- 배지는 「전화해야 할 미처리 실패」만 센다: delivery_status='실패' · handled_at is null ·
-- kind<>'marketing' · 전화 필요 종류 · 환자 번호가 살아 있음(sms_dead=false).
-- 그래서 실패를 **처리된 것/안 된 것**으로 갈라 심는다 — 배지가 0도 아니고 전부도 아니게.
insert into notification_log
  (patient_id, appointment_id, sender_staff_id, notification_type, kind, body, channel,
   requested_channel, delivery_status, failure_code, retry_count, notification_date, sent_at,
   delivered_at, failed_at, handled_at)
select
  a.for_patient_id, a.id, 'bbbbbbbb-0000-0000-0000-000000000002',
  (array['reminder_day_before','reminder_today','rescheduled','hospital_cancelled','staff_direct'])[1 + (x.rn % 5)],
  'transactional',
  case (x.rn % 5)
    when 0 then '내일 예약 안내드립니다. 시간에 맞춰 방문해 주세요.'
    when 1 then '오늘 예약 안내드립니다. 접수는 창구에서 도와드립니다.'
    when 2 then '예약 시각이 변경되었습니다. 확인 부탁드립니다.'
    when 3 then '병원 사정으로 예약이 취소되었습니다. 창구로 연락 주세요.'
    else '병원에서 보내드리는 안내입니다.'
  end,
  case when x.rn % 3 = 0 then 'sms' else 'push' end,
  'push_sms',
  case (x.rn % 7) when 0 then '실패' when 1 then '실패' when 2 then '재시도중' when 3 then '발송중' else '도달' end,
  case when x.rn % 7 in (0, 1) then (array['unreachable','rejected','expired'])[1 + (x.rn % 3)] end,
  case when x.rn % 7 = 2 then 1 else 0 end,
  current_date, now() - make_interval(mins => 15 + x.rn * 9),
  case when x.rn % 7 > 3 then now() - make_interval(mins => 14 + x.rn * 9) end,
  case when x.rn % 7 in (0, 1) then now() - make_interval(mins => 13 + x.rn * 9) end,
  -- 실패 중 일부만 「처리함」 — 나머지가 배지 숫자가 된다.
  case when x.rn % 7 = 1 and x.rn % 2 = 1 then now() - interval '5 min' end
from (
  select a2.id, a2.for_patient_id, (row_number() over (order by a2.id))::int as rn
  from appointments a2
  join appointment_slots s2 on s2.id = a2.slot_id
  where s2.slot_date between current_date - 1 and current_date + 1
  limit 40
) as x
join appointments a on a.id = x.id;

-- ════════════════════════════════════════════════════════════════════════════
-- 13) 접근 기록 — /admin/access-logs (누가 언제 무엇을 열었나)
-- ════════════════════════════════════════════════════════════════════════════
-- 환자를 여는 일(patient_detail·phone_reveal)과 환자 없이 남는 일(search)을 섞는다.
insert into access_audit_log (staff_id, patient_id, resource_type, accessed_at, search_term)
select
  case when x.rn % 3 = 0 then 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
       else 'bbbbbbbb-0000-0000-0000-000000000002'::uuid end,
  case when x.rn % 4 = 3 then null else x.id end,
  case (x.rn % 4) when 0 then 'patient_detail' when 1 then 'phone_reveal'
                  when 2 then 'medical_record' else 'search' end,
  now() - make_interval(mins => 3 + x.rn * 13),
  case when x.rn % 4 = 3 then (array['김','010-28','이말','1955','박강'])[1 + (x.rn % 5)] end
from (select p.id, (row_number() over (order by p.id))::int as rn from patients p limit 30) as x;

-- ════════════════════════════════════════════════════════════════════════════
-- 14) 환자 상세를 채우는 것들 — 내부 메모 · 가족 연결
-- ════════════════════════════════════════════════════════════════════════════
insert into patient_internal_notes (patient_id, staff_id, content, created_at)
select x.id, 'bbbbbbbb-0000-0000-0000-000000000002',
       (array[
         '귀가 어두우셔서 창구에서 큰 소리로 안내 필요.',
         '보호자(딸) 동행이 많음. 연락은 보호자 번호로.',
         '거동이 불편해 1층 대기실 이용 권장.',
         '문자 수신을 어려워하심 — 전화로 안내.',
         '진료 후 수납 안내를 다시 한 번 드릴 것.'
       ])[1 + (x.rn % 5)],
       now() - make_interval(days => 1 + x.rn)
from (select p.id, (row_number() over (order by p.id))::int as rn from patients p limit 12) as x;

-- 가족 연결 — 앱 계정 하나가 가족 환자를 함께 보는 관계(직원이 창구에서 확인해 연결).
insert into patient_family_links
  (account_patient_id, family_patient_id, relation, is_active, linked_by, linked_at, verification_method)
select x.a, x.b, (array['자녀','배우자','부모'])[1 + (x.rn % 3)], true,
       'bbbbbbbb-0000-0000-0000-000000000002', now() - make_interval(days => 2 + x.rn), 'in_person'
from (
  select p1.id as a, p2.id as b, (row_number() over (order by p1.id))::int as rn
  from (select id, row_number() over (order by id) as r from patients limit 16) p1
  join (select id, row_number() over (order by id) as r from patients limit 16) p2
    on p2.r = p1.r + 8
  where p1.r <= 8
) as x;

-- ════════════════════════════════════════════════════════════════════════════
-- 15) 중복 환자 후보 — /admin/patient-merge-candidates
-- ════════════════════════════════════════════════════════════════════════════
-- 같은 사람이 두 번 등록된 상황을 만든다(전화·생년월일이 같고 이름 표기만 다름).
-- ⛔ 병합 결과(patient_merges)는 심지 않는다 — 「후보를 검토하는 화면」을 보려는 것이지
--    이미 병합된 이력을 보려는 게 아니다.
insert into patients (name, birth_date, gender, phone, is_active)
select p.name, p.birth_date, p.gender, p.phone, true
from (select * from patients order by id limit 4) p;

commit;
