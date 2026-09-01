-- 상담봇 안내형(RAG) 지식 원본 + pgvector 검색. 승인된 조각만 검색 근거로 쓴다(요구사항 5.6).
-- 진료시간·의사 소개는 KB에 넣지 않는다(item 7·8 — hospital_hours·staff 원본이 정본).
-- 번호 00058 = MIGRATION-LEDGER 정본(챗봇 00053~00059, kb_pgvector). 플랜 산문 00057은 +1로 읽는다.
create extension if not exists vector;

create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '기타',
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  is_restricted boolean not null default false,   -- A3: true면 근거로 재생성하지 않고 원문 그대로 별도 블록 안내
  -- R4-01·A2·G-06: 승인된 문서 수정은 라이브(title/content/is_restricted)를 두고 pending_*에 담는다.
  -- 재승인(approve_pending_edit) 전까지 챗봇은 라이브로 답한다.
  has_pending_edit boolean not null default false,
  pending_title text, pending_category text, pending_content text, pending_is_restricted boolean,
  pending_updated_by uuid references staff(id), pending_updated_at timestamptz,
  created_by uuid references staff(id), approved_by uuid references staff(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  approved_at timestamptz
);

create table kb_chunks (        -- 검색 단위. 원본 승인/재승인 시 전량 재생성.
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null
);
create index idx_kb_chunks_embedding on kb_chunks using hnsw (embedding vector_cosine_ops);

create table kb_document_revisions (   -- 라이브 교체 전 옛 값을 먼저 저장(G-06·1단계 medical_record_revisions 패턴).
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents(id) on delete cascade,
  previous_title text not null, previous_category text not null, previous_content text not null,
  previous_is_restricted boolean not null,
  changed_by uuid references staff(id), changed_at timestamptz not null default now()
);
create index idx_kb_revisions_document on kb_document_revisions (document_id, changed_at desc);

-- 승인 조각만 코사인 유사도 상위 match_count개.
create function match_kb_chunks(query_embedding vector(1536), match_count int)
returns table (id uuid, document_id uuid, content text, title text, is_restricted boolean, similarity float)
language sql stable as $$
  select c.id, c.document_id, c.content, d.title, d.is_restricted,
         1 - (c.embedding <=> query_embedding) as similarity
  from kb_chunks c join kb_documents d on d.id = c.document_id
  where d.status = 'approved'
  order by c.embedding <=> query_embedding
  limit match_count
$$;

alter table kb_documents enable row level security;
alter table kb_chunks enable row level security;
alter table kb_document_revisions enable row level security;
-- 직원은 근거 확인용 조회. 작성·수정·승인은 백엔드 경유(관리자 검사). 봇 검색은 서비스 역할(match_kb_chunks).
create policy kb_documents_staff_select on kb_documents for select to authenticated using (private.is_active_staff());
create policy kb_chunks_staff_select on kb_chunks for select to authenticated using (private.is_active_staff());
create policy kb_revisions_staff_select on kb_document_revisions for select to authenticated using (private.is_active_staff());
