-- 섹션4 ③ 발송 직전 종류별 검사 (ui-design-decisions:777~790, 3241~3247; screen-behaviors:3266~3299).
-- 환자별 (알림 종류 on/off, 문자 여부). FCM 토큰은 여기서 지우지 않는다(토큰은 device_tokens, 3단계).
-- 줄이 없으면 코드 기본값(켜짐)으로 본다 — dispatcher가 발송 함수 한 곳에서 검사한다.
create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  notification_type text not null,
  enabled boolean not null default true,      -- 종류 on/off (전부 끌 수 있음, 필수 잠금 없음)
  sms_enabled boolean not null default false, -- 문자로도 받을지
  unique (patient_id, notification_type)
);

alter table notification_preferences enable row level security;
grant select, insert, update on table notification_preferences to authenticated;
-- insert/update grant는 stage-3(환자 인증 연동)에서 환자 본인 정책이 붙기 전까지는 RLS 기본 거부로 무효다(dispatcher는 서비스 역할로 write).

-- 정책 없음: dispatcher가 서비스 역할로 읽고, 환자 본인 읽기/수정 정책은 3단계(환자 인증)에서 추가한다.
-- (일반 직원은 환자 알림 선호를 보지 않는다.)
