-- 상담봇 품질 개선 사이클: 상담 단위 검토(SD-08) + 오답 신고 bad inbox(B3) + 예시은행 + 미해결 클러스터.
-- 번호 00059 = MIGRATION-LEDGER 정본(챗봇 00053~00059, chat_quality). 플랜 산문 00058은 +1로 읽는다.

-- 상담 단위 검토(SD-08): 행이 있으면 봤고(문제없음/교정), 없으면 아직 안 봄. answer_feedback 확장으로는 이 구분이 안 된다.
create table chat_quality_reviews (
  id uuid primary key default gen_random_uuid(),
  ai_chat_session_id uuid not null unique references ai_chat_sessions(id),
  status text not null check (status in ('ok', 'corrected')),   -- ok=문제없음, corrected=교정 보냄
  reviewed_by uuid not null references staff(id),
  reviewed_at timestamptz not null default now()
);

-- 오답 신고 = bad inbox. realtime_report(그 자리 신고) / quality_review(정기 검토 중 교정). 즉시 KB 공개 금지 → 적용은 KB 승인 경유(B3).
create table answer_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id),
  reported_by uuid not null references staff(id),
  source text not null check (source in ('realtime_report', 'quality_review')),
  correction_text text,
  add_to_example_bank boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  resolved_by uuid references staff(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_answer_feedback_inbox on answer_feedback (status, created_at) where status = 'pending';

-- 품질 개선 예시: 적용된 교정을 쌓아 이후 유사 질문 답변 프롬프트에 참고로 넣는다.
create table qa_example_bank (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  embedding vector(1536) not null,
  is_active boolean not null default true,
  source_feedback_id uuid references answer_feedback(id),
  created_at timestamptz not null default now()
);
create index idx_qa_example_embedding on qa_example_bank using hnsw (embedding vector_cosine_ops) where is_active;

-- 미해결 질문(봇이 못 답해 인계된 질문) — 유사도로 자동 클러스터. 클러스터는 질문을 섞을 수 있음(화면이 안내).
create table unresolved_questions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id),
  question_text text not null,
  question_embedding vector(1536) not null,
  created_at timestamptz not null default now()
);
create index idx_unresolved_embedding on unresolved_questions using hnsw (question_embedding vector_cosine_ops);

alter table chat_quality_reviews enable row level security;
alter table answer_feedback enable row level security;
alter table qa_example_bank enable row level security;
alter table unresolved_questions enable row level security;
-- 직원은 조회, 작성·적용·반려는 백엔드 경유(관리자 검사). 봇 예시 검색은 서비스 역할.
create policy quality_reviews_staff_select on chat_quality_reviews for select to authenticated using (private.is_active_staff());
create policy answer_feedback_staff_select on answer_feedback for select to authenticated using (private.is_active_staff());
create policy qa_example_staff_select on qa_example_bank for select to authenticated using (private.is_active_staff());
create policy unresolved_staff_select on unresolved_questions for select to authenticated using (private.is_active_staff());
