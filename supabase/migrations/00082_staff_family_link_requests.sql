-- 직원이 대신 가족을 연결할 때(결정 #3 ㉠·배포 Task 7E), B 번호 OTP 본인확인을 거친다.
-- 가족 연결 본인확인부는 3층이다(결정 #3): ㉠기본=B 번호로 OTP · ㉡예외=번호 없을 때만 대면·서류
-- (patient_service.link_family_member의 method!="otp" 경로가 담당) · ㉢항상=연결 완료 시 B 통보.
-- 이 표는 ㉠(OTP) 요청 겸 감사 이력이다: 대상 B는 이미 특정돼 있고, B의 등록번호로 6자리를 보내
-- 그 번호에 닿는 사람만 연결되게 한다. verified_at이 찍힌 행이 「누가(staff_id)·언제(verified_at)·
-- 누구를(account/family) 어떤 관계로(relation) OTP로 확인해 연결했는지」의 한 줄이다.
--
-- ⚠️ family_link_requests(00030)는 requesting_patient_id NOT NULL(환자 앱이 스스로 거는 요청)이라
--    직원 대행(요청자가 환자가 아니라 직원)에는 재사용할 수 없다 — 별도 표를 둔다.
create table staff_family_link_requests (
  id                  uuid primary key default gen_random_uuid(),
  account_patient_id  uuid not null references patients(id),   -- A(계정 소유자)
  family_patient_id   uuid not null references patients(id),   -- B(연결 대상 = 코드 수신자)
  staff_id            uuid not null references staff(id),       -- 누가 시작했나(감사)
  relation            text not null,                            -- 확인 성공 시 이 관계로 연결
  code_hash           text not null,                            -- 6자리를 해시로만 보관
  expires_at          timestamptz not null,                     -- 5분(화면이 세는 값과 같다)
  attempts            smallint not null default 0,              -- 6자리를 무한히 넣어보지 못하게
  verified_at         timestamptz,                              -- 성공 시각 = 연결 확인의 「언제」
  created_at          timestamptz not null default now()
);

-- 재발송 쿨다운(30초)·확인 시 「그 A·B 쌍의 최신 미검증 요청」 조회에 쓰는 인덱스.
create index staff_family_link_requests_lookup_idx
  on staff_family_link_requests (account_patient_id, family_patient_id, created_at desc);

alter table staff_family_link_requests enable row level security;
-- 정책 없음 = 전부 거부. staff_family_link_otp_service가 서비스 역할 커넥션으로만 접근한다
-- (patient_phone_change_requests 00081과 같은 방식 — 라우터가 receptionist/admin 역할을 이미 게이트한다).

comment on table staff_family_link_requests is
  '직원 대행 가족 연결의 OTP 요청 겸 감사 이력. verified_at 행이 OTP 확인 연결 한 줄(결정 #3 ㉠·배포 Task 7E).';
