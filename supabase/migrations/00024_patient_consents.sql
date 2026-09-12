-- CONSENT-LOG-01·02 (갭 #108) — 동의 이력 표가 통째로 없었고 patients에도 동의 칸이 0개였다.
-- 동의는 가입 맨 앞(전화번호 전, CONSENT-STEP-01)이라 세션·patient 행이 아직 없다(CONSENT-STEP-03).
-- 그래서 화면이 로컬로 들고 있다가, 프로필 생성(POST /patient) 시점에 이 표에 함께 기록한다.
-- private.current_patient_id()=00017 · private.is_active_staff()=00001 재사용(device_tokens와 같은 꼴).

-- 광고 동의 '현재 상태'(가입 뒤 설정에서 켜고 끔 — CONSENT-LATER-01)
alter table patients add column if not exists ads_consent boolean not null default false;

-- 동의 이력 — 무엇에 · 언제 · 어느 판(버전)에 동의했는지(CONSENT-LOG-01).
-- 약관이 바뀌면 다시 받아야 하는데, 안 남기면 누구에게 다시 받아야 하는지 알 수 없다.
create table if not exists patient_consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  item text not null check (item in ('terms', 'privacy', 'sensitive', 'ads')), -- CONSENT-ITEM-01 줄 넷
  agreed boolean not null,
  terms_version text not null,
  consented_at timestamptz not null default now()
);
create index if not exists patient_consents_by_patient
  on patient_consents (patient_id, consented_at desc);

-- RLS: 본인만 자기 이력 읽기, 직원 읽기. 쓰기는 서비스 역할(get_pool)이라 정책 없음(device_tokens와 같은 꼴).
alter table patient_consents enable row level security;
drop policy if exists "patient_reads_own_consents" on patient_consents;
create policy "patient_reads_own_consents" on patient_consents
  for select using (private.current_patient_id() = patient_id);
drop policy if exists "staff_reads_consents" on patient_consents;
create policy "staff_reads_consents" on patient_consents
  for select using (private.is_active_staff());

-- AUTH-PWNEW-15 — 새 비밀번호 화면의 「이름 맞히기」를 5회 틀리면 그 번호의 재설정을 잠근다.
-- 서버 내부용(서비스 역할만 접근) — RLS를 켜지 않는다(환자·직원이 직접 볼 표가 아니다).
create table if not exists password_reset_locks (
  phone text primary key,
  fail_count int not null default 0,
  locked boolean not null default false,
  updated_at timestamptz not null default now()
);
