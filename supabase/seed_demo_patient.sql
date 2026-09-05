-- ============================================================================
-- seed_demo_patient.sql — 환자앱 데모용 "풍부한" 환자 1명(+가족)을 심는다 (배포 SP2).
-- ----------------------------------------------------------------------------
-- 목적: 강사 시연 때 데모 환자 계정(전화·비밀번호는 seed_demo_patient.sh 환경변수로 주입)으로 로그인하면 홈·예약목록·방문이력·
--   알림·사전문진이 **한 계정 안에서 다양한 상태**로 채워져 보이게 한다.
--   (seed_demo.sql은 직원웹 손검수용 대규모 시드라 환자 auth 계정을 안 만든다 — 스태프만.
--    원격 환자 154명은 auth_user_id 연결 0명(with_auth=0)이라 환자앱 로그인이 불가했다.)
--
-- ⚠️ 전제: 전화 인증 auth.users(phone_confirm=true)는 **이 SQL이 만들지 않는다.**
--   Supabase Admin API로 미리 만들고(그 UID를 psql 변수 :demo_auth_uid 로 넘긴다) 여기선 그 UID에
--   patients 계정을 연결한다. 프로비저닝은 seed_demo_patient.sh 가 담당한다.
--     실행: psql "$URL" -v ON_ERROR_STOP=1 -v demo_auth_uid='<uid>' -f supabase/seed_demo_patient.sql
--
-- ⚠️ seed_demo.sql(전체 재시드)의 PREAMBLE은 `delete from patients`로 이 데모 환자도 지운다.
--   → **전체 재시드 뒤에는 이 시드를 반드시 다시 돌려야** 한다(seed-demo-remote.sh 끝에서 자동 호출).
--
-- 성질:
--   * postgres(superuser)로 실행 → RLS 우회. 상태이력 트리거는 auth.uid()가 없어 조용히 스킵된다(설계).
--     booking_code는 트리거가 자동 발급. 상태 전이 트리거는 UPDATE에만 걸려 여기 직접 INSERT는 자유.
--   * 고정 UUID를 쓰고 맨 앞에서 데모 환자 데이터를 지운 뒤 다시 넣는다 → 몇 번 돌려도 같은 결과(멱등).
--   * 슬롯 시각(current_date/now())은 psql 세션 시간대를 탄다 → **PGTZ=Asia/Seoul**로 넣어야
--     "오늘"이 서버가 보는 오늘과 맞는다.
-- ============================================================================

\set ON_ERROR_STOP on

-- demo_auth_uid 변수가 없으면 즉시 실패(계정 연결이 이 시드의 핵심이라 빈 채로 진행하면 안 된다).
\if :{?demo_auth_uid}
\else
\echo '✗ demo_auth_uid 변수가 필요합니다. seed_demo_patient.sh 로 실행하거나 -v demo_auth_uid=<uid> 를 주세요.'
\quit
\endif

-- patients.phone에 넣을 표시 전화번호. 파일에 하드코딩하지 않고 seed_demo_patient.sh 가 넘긴다(D#1).
\if :{?demo_phone_display}
\else
\echo '✗ demo_phone_display 변수가 필요합니다. seed_demo_patient.sh 로 실행하세요(전화번호를 파일에 하드코딩하지 않습니다).'
\quit
\endif

-- 전역 알림 잠금(대상 DB 전체 prefs OFF·병원 마스터 스위치 OFF) 적용 여부(D#2). 기본은 off(건너뜀).
\if :{?apply_global_lock}
\else
\set apply_global_lock off
\endif

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 고정 UUID (가독성 있는 접두사 dede…). 재실행 시 이 집합만 지우고 다시 넣는다.
--   본인(계정):  dede…a1        가족:  dede…f1~f5
--   슬롯:        dede…0501~050E
-- ────────────────────────────────────────────────────────────────────────────

-- 0) PREAMBLE — 이 데모 환자 집합의 기존 데이터만 정리(FK 자식 → 부모 순서).
--    다른 데모 데이터(스태프 시드 154명·예약 1만 건)는 건드리지 않는다.
with demo_pat(id) as (values
  ('dede0000-0000-0000-0000-0000000000a1'::uuid),
  ('dede0000-0000-0000-0000-0000000000f1'::uuid),
  ('dede0000-0000-0000-0000-0000000000f2'::uuid),
  ('dede0000-0000-0000-0000-0000000000f3'::uuid),
  ('dede0000-0000-0000-0000-0000000000f4'::uuid),
  ('dede0000-0000-0000-0000-0000000000f5'::uuid)
),
demo_appt(id) as (
  select id from appointments
  where account_patient_id in (select id from demo_pat)
     or for_patient_id     in (select id from demo_pat)
)
delete from questionnaire_responses where appointment_id in (select id from demo_appt);

delete from notification_log
 where patient_id in (
   'dede0000-0000-0000-0000-0000000000a1','dede0000-0000-0000-0000-0000000000f1',
   'dede0000-0000-0000-0000-0000000000f2','dede0000-0000-0000-0000-0000000000f3',
   'dede0000-0000-0000-0000-0000000000f4','dede0000-0000-0000-0000-0000000000f5')
    or appointment_id in (
   select id from appointments
   where account_patient_id in (
     'dede0000-0000-0000-0000-0000000000a1','dede0000-0000-0000-0000-0000000000f1',
     'dede0000-0000-0000-0000-0000000000f2','dede0000-0000-0000-0000-0000000000f3',
     'dede0000-0000-0000-0000-0000000000f4','dede0000-0000-0000-0000-0000000000f5'));

delete from medical_records where appointment_id in (
  select id from appointments where account_patient_id = 'dede0000-0000-0000-0000-0000000000a1'
    or for_patient_id in (
      'dede0000-0000-0000-0000-0000000000f1','dede0000-0000-0000-0000-0000000000f2',
      'dede0000-0000-0000-0000-0000000000f3','dede0000-0000-0000-0000-0000000000f4',
      'dede0000-0000-0000-0000-0000000000f5'));

delete from appointment_status_history where appointment_id in (
  select id from appointments where account_patient_id = 'dede0000-0000-0000-0000-0000000000a1');

delete from appointments where account_patient_id = 'dede0000-0000-0000-0000-0000000000a1';

delete from appointment_slots where id in (
  'dede0000-0000-0000-0000-000000000501','dede0000-0000-0000-0000-000000000502',
  'dede0000-0000-0000-0000-000000000503','dede0000-0000-0000-0000-000000000504',
  'dede0000-0000-0000-0000-000000000505','dede0000-0000-0000-0000-000000000506',
  'dede0000-0000-0000-0000-000000000507','dede0000-0000-0000-0000-000000000508',
  'dede0000-0000-0000-0000-000000000509','dede0000-0000-0000-0000-00000000050a',
  'dede0000-0000-0000-0000-00000000050b','dede0000-0000-0000-0000-00000000050c',
  'dede0000-0000-0000-0000-00000000050d','dede0000-0000-0000-0000-00000000050e');

delete from patient_family_links where account_patient_id = 'dede0000-0000-0000-0000-0000000000a1';

delete from patients where id in (
  'dede0000-0000-0000-0000-0000000000a1','dede0000-0000-0000-0000-0000000000f1',
  'dede0000-0000-0000-0000-0000000000f2','dede0000-0000-0000-0000-0000000000f3',
  'dede0000-0000-0000-0000-0000000000f4','dede0000-0000-0000-0000-0000000000f5');

-- 이 전화 계정(demo_auth_uid)을 예전에 다른 환자 행이 쥐고 있으면(auth_user_id는 UNIQUE) 떼어낸다.
-- 원격(with_auth=0)에선 해당 없음. 이전 세션 데모 링크가 남은 로컬 등에서 자가치유하기 위한 안전장치.
update patients set auth_user_id = null
 where auth_user_id = :'demo_auth_uid'::uuid
   and id <> 'dede0000-0000-0000-0000-0000000000a1';

-- ────────────────────────────────────────────────────────────────────────────
-- 1) 본인(계정 주인) + 가족 5명.
--    본인만 auth_user_id로 전화 계정에 연결(가족은 auth 없음 = 계정 하나가 함께 보는 프로필).
--    notifications_seen_at은 넣지 않는다(NULL) → 알림 전부 "안 읽음" = 종 배지가 숫자를 보인다.
-- ────────────────────────────────────────────────────────────────────────────
insert into patients (id, name, birth_date, gender, phone, is_active, auth_user_id) values
  ('dede0000-0000-0000-0000-0000000000a1', '김바이', '1986-05-12', 'M', :'demo_phone_display', true, :'demo_auth_uid'::uuid),
  ('dede0000-0000-0000-0000-0000000000f1', '이수진', '1988-09-22', 'F', '010-0000-5679', true, null),  -- 배우자
  ('dede0000-0000-0000-0000-0000000000f2', '김도윤', '2016-07-08', 'M', null,            true, null),  -- 자녀(아들)
  ('dede0000-0000-0000-0000-0000000000f3', '김하린', '2019-11-30', 'F', null,            true, null),  -- 자녀(딸)
  ('dede0000-0000-0000-0000-0000000000f4', '김정호', '1958-01-15', 'M', '010-0000-5670', true, null),  -- 아버지
  ('dede0000-0000-0000-0000-0000000000f5', '박영자', '1960-09-03', 'F', '010-0000-5671', true, null);  -- 어머니

-- 가족 연결 — 관계는 부모를 성별로 아버지/어머니로 표기(seed_demo.sql·사용자 요청과 동일 규약).
insert into patient_family_links
  (account_patient_id, family_patient_id, relation, is_active, linked_by, linked_at, verification_method) values
  ('dede0000-0000-0000-0000-0000000000a1','dede0000-0000-0000-0000-0000000000f1','배우자', true, 'bbbbbbbb-0000-0000-0000-000000000002', now() - interval '200 days', 'in_person'),
  ('dede0000-0000-0000-0000-0000000000a1','dede0000-0000-0000-0000-0000000000f2','자녀',   true, 'bbbbbbbb-0000-0000-0000-000000000002', now() - interval '180 days', 'in_person'),
  ('dede0000-0000-0000-0000-0000000000a1','dede0000-0000-0000-0000-0000000000f3','자녀',   true, 'bbbbbbbb-0000-0000-0000-000000000002', now() - interval '150 days', 'in_person'),
  ('dede0000-0000-0000-0000-0000000000a1','dede0000-0000-0000-0000-0000000000f4','아버지', true, 'bbbbbbbb-0000-0000-0000-000000000002', now() - interval '120 days', 'in_person'),
  ('dede0000-0000-0000-0000-0000000000a1','dede0000-0000-0000-0000-0000000000f5','어머니', true, 'bbbbbbbb-0000-0000-0000-000000000002', now() - interval '120 days', 'in_person');

-- ────────────────────────────────────────────────────────────────────────────
-- 2) 슬롯 14개(예약 1건당 1슬롯). 시각 분(minute)은 :05/:25/:35/:55만 써서 스태프 시드의
--    격자(10·15·20분 → 분은 0/10/15/20/30/40/45/50)와 절대 겹치지 않게 한다(unique 충돌 방지).
--    담당의는 진료과별로 결정적으로 고른다(order by id limit 1). status='예약됨'으로 넣어 예약칸을 점유.
--    (취소류 과거 예약의 슬롯도 예약됨으로 둔다 — 과거라 예약화면에 안 뜨고, 홈은 슬롯 status를 안 본다.)
-- ────────────────────────────────────────────────────────────────────────────
insert into appointment_slots (id, doctor_id, slot_date, start_time, status)
select v.id::uuid,
       (select id from staff where role='doctor' and department_id = v.dept::uuid order by id limit 1),
       (current_date + v.day_off)::date, v.st::time, '예약됨'
from (values
  -- 오늘 (본인 2 + 가족 2)
  ('dede0000-0000-0000-0000-000000000501', '11111111-1111-1111-1111-111111111111',  0, '15:05'),
  ('dede0000-0000-0000-0000-000000000502', '22222222-2222-2222-2222-222222222222',  0, '09:35'),
  ('dede0000-0000-0000-0000-000000000503', '44444444-4444-4444-4444-444444444444',  0, '14:05'),
  ('dede0000-0000-0000-0000-000000000504', '33333333-3333-3333-3333-333333333333',  0, '16:25'),
  -- 미래
  ('dede0000-0000-0000-0000-000000000505', '11111111-1111-1111-1111-111111111111',  3, '10:05'),
  ('dede0000-0000-0000-0000-000000000506', '44444444-4444-4444-4444-444444444444',  5, '11:05'),
  ('dede0000-0000-0000-0000-000000000507', '22222222-2222-2222-2222-222222222222',  7, '09:25'),
  ('dede0000-0000-0000-0000-000000000508', '11111111-1111-1111-1111-111111111111', 10, '14:35'),
  -- 과거(방문이력용)
  ('dede0000-0000-0000-0000-000000000509', '11111111-1111-1111-1111-111111111111', -14, '10:05'),
  ('dede0000-0000-0000-0000-00000000050a', '33333333-3333-3333-3333-333333333333', -45, '15:05'),
  ('dede0000-0000-0000-0000-00000000050b', '22222222-2222-2222-2222-222222222222', -30, '09:25'),
  ('dede0000-0000-0000-0000-00000000050c', '44444444-4444-4444-4444-444444444444', -20, '14:05'),
  ('dede0000-0000-0000-0000-00000000050d', '11111111-1111-1111-1111-111111111111', -10, '11:05'),
  ('dede0000-0000-0000-0000-00000000050e', '22222222-2222-2222-2222-222222222222', -25, '16:25')
) as v(id, dept, day_off, st);

-- ────────────────────────────────────────────────────────────────────────────
-- 3) 예약 14건. account_patient_id=본인, for_patient_id=본인/가족.
--    department_id·doctor_id는 슬롯이 이미 정한 것을 그대로 따른다(트리거가 담당의 일치를 강제).
--    source='app'(환자앱 예약), created_by=null(직원이 만든 게 아님).
-- ────────────────────────────────────────────────────────────────────────────
insert into appointments
  (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source, created_by,
   cancelled_by, cancelled_by_relation, cancelled_by_name, cancelled_at)
select
  sl.id, 'dede0000-0000-0000-0000-0000000000a1'::uuid, v.forpat::uuid, sl.s_dept, sl.s_doc,
  v.reason, v.status, 'app', null,
  v.cxl_by, v.cxl_rel, v.cxl_name,
  case when v.cxl_by is not null then now() - make_interval(days => v.cxl_days) end
from (values
  -- slot_id                                         for_patient                              reason          status       cxl_by   cxl_rel  cxl_name  cxl_days
  ('dede0000-0000-0000-0000-000000000501','dede0000-0000-0000-0000-0000000000a1','정기 검진 상담', '예약확정',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-000000000502','dede0000-0000-0000-0000-0000000000a1','무릎 통증',      '진료대기',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-000000000503','dede0000-0000-0000-0000-0000000000f2','기침 지속',      '예약확정',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-000000000504','dede0000-0000-0000-0000-0000000000f1','목 통증',        '예약확정',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-000000000505','dede0000-0000-0000-0000-0000000000a1','소화불량',      '예약확정',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-000000000506','dede0000-0000-0000-0000-0000000000f3','발열',          '예약신청',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-000000000507','dede0000-0000-0000-0000-0000000000f4','허리 통증',      '예약확정',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-000000000508','dede0000-0000-0000-0000-0000000000f5','두통',          '예약확정',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-000000000509','dede0000-0000-0000-0000-0000000000a1','감기 기운',      '진료완료',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-00000000050a','dede0000-0000-0000-0000-0000000000a1','어지럼증',      '진료완료',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-00000000050b','dede0000-0000-0000-0000-0000000000a1','발목 통증',      '예약부도',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-00000000050c','dede0000-0000-0000-0000-0000000000f2','복통',          '진료완료',   null,     null,   null,   0),
  ('dede0000-0000-0000-0000-00000000050d','dede0000-0000-0000-0000-0000000000f1','몸살',          '환자취소',   'patient','본인',  '김바이', 11),
  ('dede0000-0000-0000-0000-00000000050e','dede0000-0000-0000-0000-0000000000f4','정기 검진',      '병원취소',   'hospital', null,  null,    26)
) as v(slot_id, forpat, reason, status, cxl_by, cxl_rel, cxl_name, cxl_days)
join lateral (
  select s.id, s.doctor_id as s_doc, st.department_id as s_dept
  from appointment_slots s join staff st on st.id = s.doctor_id
  where s.id = v.slot_id::uuid
) sl on true;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) 진료기록 — 완료된 과거 진료(진료완료)마다 1건. doctor_id는 예약의 담당의와 일치(트리거 00006 강제).
-- ────────────────────────────────────────────────────────────────────────────
insert into medical_records
  (appointment_id, doctor_id, symptoms, diagnosis, treatment, patient_visible_notes, is_completed)
select a.id, a.doctor_id,
       a.reason || ' — 문진 및 진찰 시행.',
       case a.reason when '감기 기운' then '급성 상기도 감염'
                     when '어지럼증'  then '양성 체위성 어지럼'
                     when '복통'      then '장염 의증'
                     else '경증, 경과 관찰' end,
       case a.reason when '감기 기운' then '약물 처방(3일분)'
                     when '어지럼증'  then '경과 관찰 후 재내원 안내'
                     when '복통'      then '수분 섭취·휴식 권고'
                     else '대증 치료' end,
       '증상 지속 시 재방문해 주세요.', true
from appointments a
where a.account_patient_id = 'dede0000-0000-0000-0000-0000000000a1'
  and a.status = '진료완료';

-- ────────────────────────────────────────────────────────────────────────────
-- 5) 사전문진 응답 — 상태를 다양하게(미작성 / 작성 중 / 작성완료).
--    · 행 없음               → "미작성"  (T3·F1·F2·F4·P2 등: 아무 것도 안 넣음)
--    · completed_at NULL     → "작성 중"  (T2·F3: 일부만 답)
--    · completed_at 채움      → "작성완료"(T1·T4·P1·P4: 전 문항 답)
--    answers는 앱 계약과 같은 배열 [{question_id, question_text, value}]. 활성 템플릿에 맞춘다.
--    (QNR-PROG: answered=배열 길이, total=보이는 문항 수 → 작성완료는 길이==문항수)
-- ────────────────────────────────────────────────────────────────────────────

-- 작성완료 — 내과(v2, 4문항): T1(오늘 본인), P1(과거 본인)
insert into questionnaire_responses (appointment_id, template_id, answers, submitted_at, completed_at)
select a.id,
       (select id from questionnaire_templates where department_id = a.department_id and is_active),
       jsonb_build_array(
         jsonb_build_object('question_id','q1','question_text','현재 가장 불편한 증상을 알려주세요','value', a.reason),
         jsonb_build_object('question_id','q2','question_text','증상이 언제부터 어떻게 시작됐는지 적어주세요','value','며칠 전부터 서서히 심해졌어요.'),
         jsonb_build_object('question_id','q3','question_text','복용 중인 약이 있나요?','value','아니오'),
         jsonb_build_object('question_id','q4','question_text','알레르기가 있나요?','value','아니오')
       ),
       now() - interval '2 hours', now() - interval '2 hours'
from appointments a
where a.slot_id in ('dede0000-0000-0000-0000-000000000501','dede0000-0000-0000-0000-000000000509');

-- 작성완료 — 이비인후과(3문항): T4(오늘 배우자)
insert into questionnaire_responses (appointment_id, template_id, answers, submitted_at, completed_at)
select a.id,
       (select id from questionnaire_templates where department_id = a.department_id and is_active),
       jsonb_build_array(
         jsonb_build_object('question_id','q1','question_text','증상 부위를 알려주세요(코·귀·목)','value','목'),
         jsonb_build_object('question_id','q2','question_text','증상이 얼마나 지속됐는지, 어떤 상황에서 심한지 적어주세요','value','이틀 전부터 삼킬 때 아픕니다.'),
         jsonb_build_object('question_id','q3','question_text','발열이 있나요?','value','예')
       ),
       now() - interval '3 hours', now() - interval '3 hours'
from appointments a
where a.slot_id = 'dede0000-0000-0000-0000-000000000504';

-- 작성완료 — 소아과(3문항): P4(과거 자녀)
insert into questionnaire_responses (appointment_id, template_id, answers, submitted_at, completed_at)
select a.id,
       (select id from questionnaire_templates where department_id = a.department_id and is_active),
       jsonb_build_array(
         jsonb_build_object('question_id','q1','question_text','아이의 증상을 알려주세요','value','복통'),
         jsonb_build_object('question_id','q2','question_text','증상이 시작된 시점과 지금까지의 변화를 적어주세요','value','어제 저녁부터 배가 아프다고 했어요.'),
         jsonb_build_object('question_id','q3','question_text','예방접종은 최신인가요?','value','예')
       ),
       now() - interval '20 days', now() - interval '20 days'
from appointments a
where a.slot_id = 'dede0000-0000-0000-0000-00000000050c';

-- 작성 중 — 정형외과(3문항 중 1개만, completed_at NULL): T2(오늘 본인), F3(미래 아버지)
insert into questionnaire_responses (appointment_id, template_id, answers, submitted_at, completed_at)
select a.id,
       (select id from questionnaire_templates where department_id = a.department_id and is_active),
       jsonb_build_array(
         jsonb_build_object('question_id','q1','question_text','통증 부위를 알려주세요','value', a.reason)
       ),
       now() - interval '30 minutes', null
from appointments a
where a.slot_id in ('dede0000-0000-0000-0000-000000000502','dede0000-0000-0000-0000-000000000507');

-- ────────────────────────────────────────────────────────────────────────────
-- 6) 알림함 — 안 읽은 알림 4건(patient_id=본인 계정 → 알림함은 본인 것만 읽는다).
--    notifications_seen_at을 안 넣었으므로 전부 안 읽음 → 종 배지 = 4.
-- ────────────────────────────────────────────────────────────────────────────
insert into notification_log
  (patient_id, appointment_id, sender_staff_id, notification_type, kind, body, channel, delivery_status, sent_at)
values
  -- 오늘 본인 예약(T1) 당일 안내
  ('dede0000-0000-0000-0000-0000000000a1',
   (select id from appointments where slot_id='dede0000-0000-0000-0000-000000000501'),
   'bbbbbbbb-0000-0000-0000-000000000002', 'reminder_today', 'transactional',
   '오늘 예약 안내드립니다. 접수는 창구에서 도와드립니다.', 'push', '도달', now() - interval '2 hours'),
  -- 미래 본인 예약(F1) 시각 변경 안내
  ('dede0000-0000-0000-0000-0000000000a1',
   (select id from appointments where slot_id='dede0000-0000-0000-0000-000000000505'),
   'bbbbbbbb-0000-0000-0000-000000000002', 'rescheduled', 'transactional',
   '예약 시각이 변경되었습니다. 확인 부탁드립니다.', 'sms', '도달', now() - interval '1 day'),
  -- 미래 아버지 예약(F3) 전일 안내
  ('dede0000-0000-0000-0000-0000000000a1',
   (select id from appointments where slot_id='dede0000-0000-0000-0000-000000000507'),
   'bbbbbbbb-0000-0000-0000-000000000002', 'reminder_day_before', 'transactional',
   '내일 예약 안내드립니다. 시간에 맞춰 방문해 주세요.', 'push', '도달', now() - interval '5 hours'),
  -- 예약과 무관한 병원 안내
  ('dede0000-0000-0000-0000-0000000000a1', null,
   'bbbbbbbb-0000-0000-0000-000000000002', 'staff_direct', 'transactional',
   '병원에서 보내드리는 안내입니다. 진료 시간은 평일 09:00~18:00입니다.', 'push', '도달', now() - interval '3 hours');

-- ────────────────────────────────────────────────────────────────────────────
-- 9) 데모 발송 안전장치 (문자 오발송·코인 봉쇄). 3중 잠금.
--    ② 데모 가족 sms_dead 표식은 고정 UUID로 범위가 좁으니 항상 적용한다.
--    ①③ 병원 마스터 스위치 OFF + 대상 DB "전체" 환자 prefs OFF 는 대상 DB 전체를 건드리는
--        파괴적 변경이라 apply_global_lock=on 일 때만 적용한다(seed_demo_patient.sh 가
--        허용 project ref + 명시 동의 APPLY_GLOBAL_NOTIFY_LOCK 확인 후 넘긴다 — 코드리뷰 D#2).
--    ⚠️ ③이 "전체" 환자를 대상으로 하는 건 의도다: 스태프 시드 환자(약 150명, seed_demo.sql:235)는
--        그럴듯한 010 번호를 갖고 sms_dead도 아니라, 마스터 스위치를 켜는 순간 그들에게도 문자가 나갈 수 있다.
--        전역 OFF라야 시연 때 문자가 본인(김바이)에게만 간다 → 범위를 데모 UUID로 좁히면 안전장치가 깨진다.
--    시연 때 실제 문자를 보고 싶으면: ① 직원웹 설정에서 병원 문자스위치 ON
--    ② 환자앱에서 본인(김바이) 알림 ON — 둘 다 켜야만, 그것도 김바이(유효·살아있는 번호)에게만 나간다.
--    납품(실운영) 전환 = 실제 환자 데이터 넣고 이 블록의 반대(sms_enabled=true·해당 update 제거)로.
-- ────────────────────────────────────────────────────────────────────────────
-- ② 데모 가족(가짜지만 유효형식 번호) 문자 죽음 표식 → 라우팅 불가. 본인(a1=김바이)은 살려둔다. (범위 좁음: 항상 적용)
update patients set sms_dead = true, sms_dead_checked_at = now()
 where id in ('dede0000-0000-0000-0000-0000000000f1','dede0000-0000-0000-0000-0000000000f2',
              'dede0000-0000-0000-0000-0000000000f3','dede0000-0000-0000-0000-0000000000f4',
              'dede0000-0000-0000-0000-0000000000f5');

\if :apply_global_lock
-- ① 병원 문자 마스터 스위치 OFF (전원 공통 차단). (전역: 승인 시에만)
update hospital_settings set sms_enabled = false;
-- ③ 모든 환자 × 모든 알림종류 = 꺼짐(행 없으면 기본 ON이라 명시로 박는다). 본인 포함 — 앱에서 직접 켜서 테스트. (전역: 승인 시에만)
insert into notification_preferences (patient_id, notification_type, enabled)
select p.id, t.ntype, false
  from patients p
  cross join (values ('changed'),('hospital_cancelled'),('cancellation_approved'),
                     ('cancellation_rejected'),('requested'),('confirmed'),
                     ('reminder_day_before'),('reminder_today'),('questionnaire_missing'),
                     ('questionnaire_partial'),('visit_completed'),('support_answered'),
                     ('family_linked')) as t(ntype)
on conflict (patient_id, notification_type) do update set enabled = false;
\echo '🔒 전역 알림 잠금 적용: 병원 문자스위치 OFF · 대상 DB 전체 환자 알림설정 OFF.'
\else
\echo '⚠ 전역 알림 잠금(①병원 마스터 OFF·③전원 prefs OFF)을 건너뜀 — apply_global_lock=off.'
\echo '   데모에서 문자 마스터 스위치를 켜면 다른 데모 환자(스태프 시드 약 150명)에게도 문자가 나갈 수 있습니다.'
\echo '   전체 안전장치가 필요하면 APPLY_GLOBAL_NOTIFY_LOCK=1 로 seed_demo_patient.sh 를 다시 실행하세요.'
\endif

commit;

\echo '✅ 데모 환자 김바이 + 가족 5명 + 예약 14건 + 문진·알림 적재 완료.'
\echo '🔒 데모 가족 sms_dead=true (본인만 살아있음). 전역 알림 잠금 적용 여부는 위 메시지를 참조하세요.'
