-- Task 29 /admin/settings — 갭 #32·#72·#98·#102·#107·#125·#126.
-- 지금까지 설정 화면이 고칠 칸이 없었다(hospital_settings는 id·cancellation_deadline_hours·
-- long_wait_threshold_minutes 뿐). 이 화면이 저장할 칸을 만든다.
--
-- ⚠️ 알림 문구 표는 새로 만들지 않는다 — 기존 00013 notification_type_settings
--    (notification_type·body·also_sms)가 정확히 이 용도(종류별 문구 override·문자여부)로 이미 있다.
--    설정 서비스는 그 표를 재사용한다(body=override, also_sms=send_sms).

alter table hospital_settings
  -- ⚠️ 공유 칸: auto_confirm_app_bookings·sms_enabled는 환자앱(00020/00023)과 공유될 수 있어
  --    「먼저 적용하는 쪽 우선」이므로 순서와 무관하게 안 깨지도록 반드시 `if not exists`.
  add column if not exists auto_confirm_app_bookings boolean not null default true,  -- HSET-BOOK-05 기본 켜짐
  add column if not exists hospital_address text,                                     -- HSET-INFO-01(환자 앱 노출)
  add column if not exists hospital_phone text,
  add column if not exists sms_enabled boolean not null default true,                -- 결정31 문자 초기 ON
  add column if not exists sms_recipients text not null default 'app_only'
    check (sms_recipients in ('app_only', 'all')),                                    -- HSET-SMS-03 누구에게
  add column if not exists sms_opt_out_number text,                                   -- 수신거부 번호(노출값)
  add column if not exists version int not null default 1;                           -- HSETX-STATE-03 낙관적 동시성

-- HSETX-AUDIT-02: 설정 변경은 환자가 없어 access_audit_log(patient_id not null)에 못 담는다 → 전용 표.
create table settings_audit_log (
  id uuid primary key default gen_random_uuid(),
  changed_by uuid not null references staff(id),
  changed_at timestamptz not null default now(),
  setting_key text not null,
  old_value text,                          -- 비밀 계열이면 '변경됨'만(HSETX-AUDIT-01·SEC-02)
  new_value text
);
alter table settings_audit_log enable row level security;
grant select, insert on table settings_audit_log to authenticated;
create policy "admin_reads_settings_audit" on settings_audit_log
  for select using (private.is_admin());
create policy "admin_writes_settings_audit" on settings_audit_log
  for insert with check (private.is_admin());
create index settings_audit_log_key_idx on settings_audit_log (setting_key, changed_at desc);
