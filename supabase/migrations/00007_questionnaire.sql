create table questionnaire_templates (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id),
  questions jsonb not null
);

create table questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) unique,
  template_id uuid not null references questionnaire_templates(id),
  answers jsonb not null,
  submitted_at timestamptz not null default now()
);

alter table questionnaire_templates enable row level security;
alter table questionnaire_responses enable row level security;

grant select, insert, update on questionnaire_templates to authenticated;
grant select, insert on questionnaire_responses to authenticated;

create policy "staff_can_read_templates" on questionnaire_templates
  for select
  using (private.is_active_staff());

create policy "admin_can_manage_templates" on questionnaire_templates
  for all
  using (private.is_admin())
  with check (private.is_admin());

-- 사전문진은 "해당 의사만" 열람 가능해야 한다(고객요구사항) — 모든 활성 직원이 아니라
-- 예약 담당의만 조회하도록 제한한다. 관리자는 감사 목적으로만 예외 허용한다.
-- [정합성 검토 R2-02] "해당 의사"의 범위는 Task 5의 doctor_can_view_appointment()를 그대로 따른다
-- (본인 담당 예약 + 오늘 도착~진료중인 환자의 과거 기록).
create policy "assigned_doctor_can_read_responses" on questionnaire_responses
  for select
  using (
    exists (
      select 1 from staff s
      where s.auth_user_id = auth.uid() and s.is_active and s.role = 'admin'
    )
    or doctor_can_view_appointment(questionnaire_responses.appointment_id)
  );

-- 환자가 직접 제출하는 정책은 3단계(환자 앱)에서 환자 인증 연동 시 추가한다.
-- 그 전까지(1단계)는 전화/방문 접수 시 직원이 대신 입력하거나 관리자가 데이터를 넣을 방법이
-- 있어야 하므로, INSERT는 관리자에게만 우선 허용한다 — 브리프 SQL에 이 정책이 빠져 있었다
-- (RLS를 켠 테이블에 INSERT 정책이 하나도 없으면 기본값은 전체 거부).
create policy "admin_can_insert_responses" on questionnaire_responses
  for insert
  with check (private.is_admin());
