-- 3단계 알림: FCM 기기 토큰의 '환자 소유·확장'.
-- ⭐ 표 골격은 직원웹 T30(00050)이 먼저 세웠다 — 디스패처의 죽은 토큰 삭제(SEND-RESULT-03b)가
--    삭제할 대상이 필요했기 때문. 00050 주석의 계약("환자앱 3단계가 소유·확장을 이어받는다")대로
--    여기서 등록/해제 권한과 본인 관리 RLS 정책을 이어붙인다.
--    LEDGER: device_tokens 소유=환자앱 T9(00023) / 골격 선생성=직원웹 T30(00050).
-- ⚠️ 컬럼명은 실제 적용된 00050 스키마(token)를 따른다 — dispatch_service._try_push가 token을 읽는다.
--    (플랜 초안의 fcm_token은 폐기: '먼저 적용하는 쪽 우선' — 실제 DB가 token으로 앞섰다.)
--
-- 표 골격(00050과 동일). 두 경우 모두 안전하다:
--   ① 클린 리셋에서 00023이 00050보다 먼저 실행되면 여기서 만들고, 뒤의 00050 create는 no-op.
--   ② 00050이 이미 적용된 DB에선 이 create가 no-op이고 아래 grant/정책만 얹힌다.
create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  token text not null unique,        -- FCM 등록 토큰(같은 기기 재등록은 on conflict do nothing으로 무해)
  platform text,                     -- 'ios' | 'android' (참고용)
  created_at timestamptz not null default now()
);
create index if not exists idx_device_tokens_patient on device_tokens (patient_id);
alter table device_tokens enable row level security;

-- C6-#5: 등록/해제(authenticated 세션)가 권한부족으로 실패하지 않도록 insert/delete grant.
--   행 범위는 아래 RLS 정책이 '본인 것만'으로 막는다. select는 00050이 이미 부여했다(중복 무해).
grant select, insert, delete on table device_tokens to authenticated;

-- 로그인 본인만 자기 토큰을 관리한다(가족은 로그인하지 않아 토큰이 없다 —
--   current_patient_id로 못박아 가족 id 등록을 막는다). drop-then-create로 재적용에도 안전.
drop policy if exists "patients_can_manage_own_device_tokens" on device_tokens;
create policy "patients_can_manage_own_device_tokens" on device_tokens
  for all
  using (private.current_patient_id() = device_tokens.patient_id)
  with check (private.current_patient_id() = device_tokens.patient_id);

-- 직원 발송(2단계)은 서비스 역할(RLS 우회)로 조회하지만, authenticated 직원 조회 경로를 위해 열어둔다.
drop policy if exists "staff_can_read_device_tokens" on device_tokens;
create policy "staff_can_read_device_tokens" on device_tokens
  for select
  using (private.is_active_staff());

-- #111: notify_patient가 병원 문자정책(문자 전체 on/off)을 판정에 넣는다(HSET-SMS-01 ①).
--   칸의 원소유는 직원웹 T29(00051)지만 발송이 반드시 읽어야 하고 순서상 화면보다 앞서므로 물리적 생성만 한다.
--   먼저 적용하는 쪽이 만들고 뒤는 no-op(if not exists) — auto_confirm_app_bookings 선례와 동일.
alter table hospital_settings
  add column if not exists sms_enabled boolean not null default true;
