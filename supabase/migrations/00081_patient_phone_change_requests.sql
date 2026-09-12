-- 직원이 대신 환자 전화번호를 바꿀 때(갭 #19·결정 #4), 새 번호 OTP 소유 증명을 거친다.
-- 직접 저장 ㉮는 계정 탈취·기록 오염으로 기각 — 새 번호로 6자리 코드를 보내 그 번호에 닿는
-- 사람만 바꾸게 한다. 번호가 바뀌어 계정에 못 들어가던 환자(갭 #19)를 여는 문이 이 창구다.
--
-- ⭐ 이 표는 「요청」이자 곧 「감사 이력」이다: verified_at이 찍힌 행 하나가
--    「누가(staff_id)·언제(verified_at)·어느 번호→어느 번호(old/new_phone_masked)」로 바꿨는지의
--    변경 한 줄이다(결정 #4 ⓒ). 별도 이력표를 두지 않고 성공한 요청 행을 이력으로 읽는다.
create table patient_phone_change_requests (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references patients(id),
  staff_id          uuid not null references staff(id),        -- 누가 시작했나(감사)
  new_phone_hash    text not null,                             -- 확인은 (patient_id, new_phone_hash)로 찾는다
  new_phone_masked  text not null,                             -- 감사 표시용(원문은 쌓지 않는다)
  old_phone_masked  text,                                      -- 확인 성공 때 채운다(바뀌기 직전 번호)
  code_hash         text not null,                             -- 6자리를 해시로만 보관
  expires_at        timestamptz not null,                      -- 5분(화면이 세는 값과 같다)
  attempts          smallint not null default 0,               -- 6자리를 무한히 넣어보지 못하게
  verified_at       timestamptz,                               -- 성공 시각 = 변경 이력의 「언제」
  created_at        timestamptz not null default now()
);

-- 재발송 쿨다운(30초)·확인 시 「그 환자의 그 번호로 온 최신 미검증 요청」 조회에 쓰는 인덱스.
create index patient_phone_change_requests_lookup_idx
  on patient_phone_change_requests (patient_id, new_phone_hash, created_at desc);

alter table patient_phone_change_requests enable row level security;
-- 정책 없음 = 전부 거부. staff_phone_change_service가 서비스 역할 커넥션으로만 접근한다
-- (family_link_requests 00030과 같은 방식 — 라우터가 receptionist/admin 역할을 이미 게이트한다).

comment on table patient_phone_change_requests is
  '직원 대행 전화번호 변경의 OTP 요청 겸 감사 이력. verified_at 행이 변경 한 줄(갭 #19·결정 #4).';
