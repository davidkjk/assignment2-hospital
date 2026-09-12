-- 이미 병원에 등록된 환자(㉯)를 가족으로 연결할 때, 요청자가 그 사람의 휴대폰에 접근할 수 있는지
-- 확인하는 임시 인증 요청.
--
-- ⭐ 갭 #58(계정 열거 방지) — 후보를 찾지 못했을 때도 이 행을 만든다(target_patient_id = null).
--    행을 안 만들면 응답이 갈리고, 응답이 갈리면 "그 사람이 이 병원 환자인가"가 새어 나간다.
create table family_link_requests (
  id                    uuid primary key default gen_random_uuid(),
  requesting_patient_id uuid not null references patients(id),
  target_patient_id     uuid references patients(id),   -- #58: 후보 0건·2건이면 null. 그래도 행은 남는다.
  phone_hash            text not null,                  -- 쿨다운은 번호 기준(B-3). 원문을 쌓지 않는다.
  relation              text not null,                  -- FAM-LINK-02: 입력한 관계를 연결 때 그대로 쓴다.
  code_hash             text not null,                  -- 대상이 없어도 무작위 코드를 만들어 넣는다(분기 없음).
  expires_at            timestamptz not null,           -- FAM-LINK-04: 5분
  verified_at           timestamptz,
  attempts              smallint not null default 0,    -- 6자리를 무한히 넣어보지 못하게(아래 주석)
  created_at            timestamptz not null default now()
);

-- #16: 재발송 간격(30초)을 서버가 검사한다 — 번호 기준과 요청자 기준 둘 다 이 인덱스로 본다.
create index family_link_requests_rate_idx
  on family_link_requests (requesting_patient_id, created_at desc);
create index family_link_requests_phone_rate_idx
  on family_link_requests (phone_hash, created_at desc);

alter table family_link_requests enable row level security;
-- 정책 없음 = 전부 거부. family_link_otp_service가 서비스 역할 커넥션으로만 접근한다.

comment on table family_link_requests is
  '㉯ 기존 환자 가족 연결의 본인확인 요청. 후보를 못 찾아도 행을 남긴다(갭 #58 계정 열거 방지).';
