-- 3-A 통합 대화 스키마 ④ 답변 근거 스냅샷 + 보존/파기 클래스 (공백 5·7, SD-06·09).
-- 번호 00056 = MIGRATION-LEDGER 정본(챗봇 00053~00059). 플랜 산문의 00055는 +1로 읽는다
-- (직원웹이 00052를 가져간 뒤 챗봇 T1~T3=00053~00055로 확정, T4=00056).

-- ── chat_message_sources: 봇 답변이 쓴 KB 조각의 당시 스냅샷 (공백 5) ──
-- chunk_id는 소프트 참조(하드 FK 아님) — 조각이 재임베딩·삭제돼도 스냅샷은 남아야 한다(설계결정 1).
create table chat_message_sources (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id),  -- 근거가 붙는 봇 답변 메시지
  chunk_id uuid,                                          -- KB 조각 조회 편의용 소프트 참조(조각표=Task 7)
  rank int not null,                                      -- 당시 검색 순위
  similarity numeric,                                     -- 당시 유사도 점수
  title_snapshot text,                                    -- 답변 당시 조각 제목(문구 수정 뒤에도 보존)
  body_snapshot text,                                     -- 답변 당시 조각 본문
  created_at timestamptz not null default now()
);
create index idx_message_sources_message on chat_message_sources (message_id, rank);

-- 근거는 봇 답변에만 붙는다(직원·환자·시스템 메시지엔 금지).
create or replace function validate_source_is_bot_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sender text;
begin
  select sender_type into v_sender from public.chat_messages where id = new.message_id;
  if v_sender is distinct from 'bot' then
    raise exception '답변 근거는 봇 답변 메시지에만 붙일 수 있습니다.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_validate_source_is_bot_message
  before insert on chat_message_sources for each row execute function validate_source_is_bot_message();

-- ── retention_classes: 보존·파기 클래스 (공백 7, SD-09) ──
-- 전역 TTL 금지 → 6 클래스 분리(정본 §4). 법정값=코드 강제(설정칸 없음), 방침값=DB 기본 1년.
-- ⚠️ 실제 클래스별 TTL 파기 배치는 법무 게이트라 BLOCKED — 이 표는 구조·값 기록만(설계결정 2).
create table retention_classes (
  id text primary key,
  retention_period interval,                              -- null = "원 데이터와 동일"(pseudonymous)
  enforcement text not null check (enforcement in ('code_forced', 'policy_default')),
  legal_basis text,
  notes text
);
insert into retention_classes (id, retention_period, enforcement, legal_basis, notes) values
  ('medical_record',            interval '10 years', 'code_forced',
     '의료법 시행규칙 §15', '진료기록 편입분. 직원이 줄일 수 없음(설정칸 없음)'),
  ('access_audit',              interval '2 years',  'code_forced',
     '개인정보 안전성 확보조치 기준 §8', '직원 감사로그(민감정보 시스템)'),
  ('pseudonymous_or_tokenized', null,                'code_forced',
     '개인정보보호법 §58의2', '암호화 전화·재식별 토큰. 원 데이터 파기 시 함께'),
  ('appointment_operation',     interval '1 year',   'policy_default',
     null, '비진료 예약·운영. 법정 없음 — 병원 처리방침으로 조정'),
  ('consultation_message',      interval '1 year',   'policy_default',
     null, '상담·챗봇. 진료 편입분은 medical_record로 이관/복제(BLOCKED)'),
  ('notification_delivery',     interval '1 year',   'policy_default',
     null, '발송로그. 본문 미저장/최소화');

-- 상담 데이터군의 기본 클래스 태그. 진료기록 편입 시 medical_record 재분류 잡은 BLOCKED(법무·배포).
alter table chat_messages
  add column retention_class text not null default 'consultation_message'
    references retention_classes(id);
-- 익명 연락처(암호화 전화)는 pseudonymous_or_tokenized 군, 발송로그는 notification_delivery 군 —
-- 태그 칼럼을 표마다 늘리지 않고 표↔클래스 매핑을 파기 배치(BLOCKED)가 코드로 안다. 여기선 문서화만.
