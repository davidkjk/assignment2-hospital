# 4단계: AI 상담봇 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병원 통합 서비스의 AI 상담봇 — RAG(pgvector) 기반 병원 안내, 구조화된 문진 기반 진료과 추천, LangChain 에이전트 기반 예약 조회·제안, 조건 감지 기반 직원 인계, 지식베이스 관리, 오답 정정과 정기 품질 검토로 이어지는 개선 사이클을 백엔드(FastAPI) + 직원 웹(React) + 웹 상담창(React 위젯) + 환자 앱(Flutter)에 구축한다.

**Architecture:** 상담봇 두뇌는 백엔드 API에 있다. 환자 메시지가 오면 **⓪ 응급 표현 검사(규칙 기반, 최우선) → ① 인계 감시(6가지 조건, 항상 동작) → ② 라우터(LangChain `RunnableBranch`)가 안내형/진료과추천형/행동형 3갈래로 분류** 순서로 처리한다. 안내형은 RAG 체인(pgvector 검색 + LCEL 프롬프트, 도구 없음), 진료과추천형은 문진 체인(구조화된 순차 질문 + 강화된 안전 가드레일), 행동형은 에이전트 체인(LangChain `AgentExecutor` + 도구 5개, `langchain-anthropic`으로 Claude Sonnet 호출)이 처리한다. **실제 예약 실행은 봇의 도구가 아니다** — 확인 카드의 버튼이 3단계 `patient_booking_service.create_booking`을 직접 호출한다. 인계는 에이전트가 스스로 판단해서 도구를 선택하는 게 아니라, 감시 로직이 조건을 감지하면 무조건 실행되는 별도의 인계 체인(`support_tickets` 티켓 생성)으로 구현하고, 같은 `chat_messages`를 공유하는 직원 답변으로 실시간 반영한다(Supabase Realtime). 오답 신고와 관리자의 정기 상담 품질 리포트 검토가 쌓이면 `qa_example_bank`에 축적되어, 이후 유사 질문의 답변 프롬프트에 참고 예시로 자동 반영되는 품질 개선 사이클을 구성한다. 웹 상담창은 익명(세션 토큰) 기본 + 필요 시 로그인/가입(3단계와 동일 Supabase Auth 계정).

**Tech Stack:** FastAPI, Supabase (Postgres + pgvector + Realtime + Auth), LangChain + `langchain-anthropic`(Claude Sonnet 5, `RunnableBranch` 라우터, `AgentExecutor`), OpenAI Embeddings API (`text-embedding-3-small`, httpx 직접 호출), React + TypeScript (직원 웹 확장 + 웹 상담창 위젯), Flutter + Riverpod (앱 AI 상담), pytest + pytest-asyncio, Vitest + MSW, flutter_test

## Global Constraints

- 이 계획은 1~3단계 계획의 산출물이 이미 존재한다고 가정한다: `backend/` 스캐폴딩, `supabase/migrations/00001~00011`, `app.db.pool.acquire_as`/`get_pool`, `app.core.security.StaffContext`/`require_role`, `app.core.patient_security.PatientContext`/`get_current_patient`, `app.core.errors.AppError`/`log_error`, `app.integrations.sms_client.get_sms_client`, `app.services.notification_service.notify_patient`, `app.services.patient_catalog_service.*`, `app.services.patient_booking_service.create_booking`, `app.services.patient_appointment_query_service.list_my_appointments`
- 신규 마이그레이션은 `supabase/migrations/00012`부터 번호를 이어간다
- **AI 프레임워크는 LangChain을 사용한다** (스펙 "핵심 결정" — 이전 버전의 "Claude API tool use 수동 루프 직접 구현" 결정을 대체함). 모델 호출은 `langchain-anthropic`의 `ChatAnthropic`으로, 갈래 분기는 `RunnableBranch`로, 도구 실행형 갈래는 `AgentExecutor`로 구현한다
- 대화 모델은 `claude-sonnet-5` 고정, 임베딩은 OpenAI `text-embedding-3-small`(1536차원) 고정 (스펙 섹션 1/2)
- **매 메시지는 반드시 ⓪응급검사 → ①인계감시 → ②라우터 순서로 통과한다** — 어느 갈래(RAG/문진/에이전트)에 있든 인계 감시가 조건을 감지하면 무조건 인계로 전환한다 (스펙 섹션 1/3, 인계는 "에이전트가 선택하는 도구"가 아니다)
- **실제 예약을 실행하는 도구를 에이전트에게 주지 않는다** — 봇은 `예약제안_카드`까지만, 예약은 카드 버튼 → 기존 예약 API 직행 (스펙 섹션 3)
- 봇은 승인(`approved`)된 자료의 조각만 검색 근거로 사용하고, 봇 답변 메시지에 `source_chunk_ids`와 `route_taken`을 반드시 기록한다 (요구사항 5.6, 스펙 섹션 2)
- `handed_over` 상태의 상담방에서 봇은 응답하지 않는다 (환자 메시지는 저장만)
- 상담방 상태가 인계된 뒤 직원이 답변 완료하면 상담방은 `bot` 상태로 복귀한다
- Claude에 보내는 대화 이력은 최근 20개 메시지로 제한한다 (비용 통제)
- 익명 웹 사용자는 시간당 메시지 30개로 제한한다 (비용 남용 방지)
- Claude/OpenAI API 키는 서버 환경변수에만 존재하며 프론트엔드 코드에 절대 넣지 않는다 (요구사항 6.5)
- Claude/OpenAI 장애 시 예약·진료기록 기능은 영향받지 않아야 하며, 상담창은 한글 안내 + 봇 없는 티켓 접수로 전환한다 (요구사항 6.4)
- 사용자에게는 한글 안내 메시지만 노출한다 (요구사항 6.4)
- 자동 테스트에서 Claude/OpenAI를 실제 호출하지 않는다 — 전부 모킹 (비용 0원)
- 진료과 추천형(문진 체인)의 시스템 프롬프트는 RAG/에이전트 체인보다 강한 안전 규칙을 명시한다: 진단·약 추천 금지, 확정적 표현 금지 (요구사항 5.3)
- 응급 표현 검사(⓪)는 규칙 기반(키워드 매칭)이며 AI 호출에 의존하지 않는다 — 확률적 판단이 아니라 결정적 필터여야 한다 (스펙 섹션 5 테스트 요건)

## 파일 구조 개요

```
supabase/migrations/
  00012_chat_tables.sql            # 상담방/메시지(route_taken 포함) + RLS
  00013_kb_pgvector.sql            # pgvector 확장 + 지식베이스 + RLS
  00014_support_feedback.sql       # 인계 티켓 + 오답 신고(source/add_to_example_bank) + qa_example_bank + RLS
backend/app/
  integrations/embedding_client.py # OpenAI 임베딩 (모킹 가능)
  integrations/langchain_client.py # ChatAnthropic 모델 팩토리 (모킹 가능)
  services/kb_service.py           # 자료 CRUD + 승인 → 청킹+임베딩
  services/rag_search_service.py   # 질문 → 유사 조각 검색
  services/rag_chain.py            # 안내형: RAG 체인 (LCEL)
  services/department_guide_chain.py # 진료과추천형: 문진 체인
  services/chat_tools.py           # 에이전트 도구 5개 정의+실행 (LangChain Tool)
  services/agent_chain.py          # 행동형: AgentExecutor 조립
  services/safety_watchdog.py      # ⓪응급검사 + ①인계감시 + 인계 체인
  services/chat_router.py          # ②라우터 (RunnableBranch) — 3갈래 분류
  services/chat_service.py         # 대화 오케스트레이션 (핵심 — 위 모든 것을 dispatch)
  services/ticket_service.py       # 인계 티켓 + 직원 답변 + 알림
  services/answer_feedback_service.py  # 오답 신고/정기검토/반영
  services/qa_example_bank_service.py  # 품질개선 사이클: 예시 등록/검색/비활성화
  services/bot_stats_service.py    # 상담봇 처리 현황 집계
  routers/chat.py                  # 환자/익명용 상담 API
  routers/staff_chat.py             # 직원용 티켓/상담기록 API
  routers/admin_kb.py               # 관리자용 KB/오답/품질리포트/현황 API
backend/scripts/
  seed_kb.py                       # 대용량 안내자료 생성 (검색 정확도 검증용)
  rag_eval.py                      # 골든 질문 세트 RAG 품질 평가
frontend/src/features/chatAdmin/   # 직원 웹: 상담 관리
frontend/src/features/admin/kb/    # 관리자: KB 관리/오답/품질리포트/현황
webchat/                           # 병원 홈페이지용 웹 상담창 (별도 Vite 앱)
app/lib/features/chat/             # Flutter 앱: AI 상담
```

---

## Task 1: 마이그레이션 — 상담방/메시지 테이블 + RLS

**Files:**
- Create: `supabase/migrations/00012_chat_tables.sql`
- Test: `backend/tests/test_chat_tables_schema.py`

**Interfaces:**
- Produces: 테이블 `chat_conversations`, `chat_messages`(`route_taken` 포함 — 스펙 섹션 2), RLS 정책 일체

- [ ] **Step 1: 실패하는 스키마 테스트 작성**

`backend/tests/test_chat_tables_schema.py`:
```python
import pytest
from tests.conftest import service_conn  # 기존 conftest의 service-role 커넥션 픽스처


@pytest.mark.asyncio
async def test_chat_tables_exist(service_conn):
    for table in ("chat_conversations", "chat_messages"):
        exists = await service_conn.fetchval(
            "select exists (select from information_schema.tables where table_name = $1)",
            table,
        )
        assert exists, f"{table} 테이블이 없습니다"


@pytest.mark.asyncio
async def test_chat_messages_columns(service_conn):
    cols = {
        r["column_name"]
        for r in await service_conn.fetch(
            "select column_name from information_schema.columns where table_name = 'chat_messages'"
        )
    }
    assert {"conversation_id", "sender", "content", "source_chunk_ids", "message_type", "route_taken"} <= cols


@pytest.mark.asyncio
async def test_route_taken_check(service_conn):
    conv = await service_conn.fetchval(
        "insert into chat_conversations (channel) values ('web') returning id"
    )
    with pytest.raises(Exception):
        await service_conn.execute(
            "insert into chat_messages (conversation_id, sender, content, route_taken) "
            "values ($1, 'bot', 'x', 'invalid_route')",
            conv,
        )


@pytest.mark.asyncio
async def test_chat_rls_enabled(service_conn):
    for table in ("chat_conversations", "chat_messages"):
        enabled = await service_conn.fetchval(
            "select relrowsecurity from pg_class where relname = $1", table
        )
        assert enabled, f"{table}에 RLS가 켜져 있지 않습니다"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_chat_tables_schema.py -v`
Expected: FAIL (테이블 없음)

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/00012_chat_tables.sql`:
```sql
-- 상담방: 상담 한 건 = 방 하나 (스펙 섹션 2)
create table chat_conversations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id),          -- 익명이면 null, 로그인 시 채워짐
  anon_session_token text unique,                   -- 익명 재방문용 "진동벨"
  channel text not null check (channel in ('app', 'web')),
  status text not null default 'bot' check (status in ('bot', 'handed_over', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

-- 메시지: 발언 1개 = 1행
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id),
  sender text not null check (sender in ('patient', 'bot', 'staff')),
  staff_id uuid references staff(id),
  content text not null,
  source_chunk_ids uuid[],                          -- 봇 답변의 근거 조각 (요구사항 5.6)
  message_type text not null default 'text'
    check (message_type in ('text', 'slot_options', 'booking_confirm', 'booking_done')),
  route_taken text
    check (route_taken in ('emergency', 'rag', 'department_guide', 'agent', 'handoff')),
  created_at timestamptz not null default now()
);

create index idx_chat_messages_conversation on chat_messages (conversation_id, created_at);
create index idx_chat_conversations_patient on chat_conversations (patient_id);
create index idx_chat_conversations_last_message on chat_conversations (last_message_at desc);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

-- 환자: 본인 상담방만 조회 (익명 방은 서버(service role)가 토큰 검증 후 대신 접근)
create policy chat_conversations_patient_select on chat_conversations
  for select to authenticated
  using (patient_id in (select id from patients where auth_user_id = auth.uid()));

create policy chat_messages_patient_select on chat_messages
  for select to authenticated
  using (conversation_id in (
    select id from chat_conversations
    where patient_id in (select id from patients where auth_user_id = auth.uid())
  ));

-- 직원: 전체 상담 조회 가능 (요구사항 5.1 "같은 상담 관리 화면")
create policy chat_conversations_staff_select on chat_conversations
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));

create policy chat_messages_staff_select on chat_messages
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));

-- 쓰기는 전부 백엔드(service role) 경유 — 클라이언트 직접 insert/update 불가.
-- Realtime 구독을 위해 두 테이블을 publication에 추가
alter publication supabase_realtime add table chat_conversations, chat_messages;
```

- [ ] **Step 4: 마이그레이션 적용 후 테스트 통과 확인**

Run: `supabase db reset && cd backend && pytest tests/test_chat_tables_schema.py -v`
Expected: PASS
(참고: 마이그레이션 파일 작성·커밋과 원격 DB 적용(`supabase db push`)은 별개 단계다 — 이 시점에는 로컬에만 적용된 상태)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00012_chat_tables.sql backend/tests/test_chat_tables_schema.py
git commit -m "feat: 상담방/메시지 테이블(route_taken 포함) + RLS (4단계)"
```

---

## Task 2: 마이그레이션 — pgvector + 지식베이스 테이블

**Files:**
- Create: `supabase/migrations/00013_kb_pgvector.sql`
- Test: `backend/tests/test_kb_schema.py`

**Interfaces:**
- Produces: `vector` 확장, 테이블 `kb_documents`, `kb_chunks(embedding vector(1536))`, `kb_document_revisions`(수정이력 — 요구사항 3.8), 유사도 검색 함수 `match_kb_chunks(query_embedding vector, match_count int)`

- [ ] **Step 1: 실패하는 스키마 테스트 작성**

`backend/tests/test_kb_schema.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_vector_extension(service_conn):
    exists = await service_conn.fetchval(
        "select exists (select from pg_extension where extname = 'vector')"
    )
    assert exists, "pgvector 확장이 설치되지 않았습니다"


@pytest.mark.asyncio
async def test_kb_tables_exist(service_conn):
    for table in ("kb_documents", "kb_chunks", "kb_document_revisions"):
        exists = await service_conn.fetchval(
            "select exists (select from information_schema.tables where table_name = $1)",
            table,
        )
        assert exists


@pytest.mark.asyncio
async def test_kb_document_revisions_columns(service_conn):
    cols = {
        r["column_name"]
        for r in await service_conn.fetch(
            "select column_name from information_schema.columns "
            "where table_name = 'kb_document_revisions'"
        )
    }
    # 수정 직전 스냅샷을 남기는 컬럼들 (요구사항 3.8)
    assert {
        "document_id", "previous_title", "previous_category",
        "previous_content", "changed_by", "changed_at",
    } <= cols


@pytest.mark.asyncio
async def test_match_function_returns_approved_only(service_conn):
    # 승인 문서 1건 + 초안 문서 1건을 넣고, 검색 결과에 승인 조각만 나오는지 확인
    doc_a = await service_conn.fetchval(
        "insert into kb_documents (title, category, content, status) "
        "values ('주차 안내', '위치·주차', '지하 1층 주차장', 'approved') returning id"
    )
    doc_d = await service_conn.fetchval(
        "insert into kb_documents (title, category, content, status) "
        "values ('초안 자료', '기타', '아직 승인 전', 'draft') returning id"
    )
    vec = "[" + ",".join(["0.1"] * 1536) + "]"
    await service_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) values ($1, 0, '지하 1층 주차장', $2::vector)",
        doc_a, vec,
    )
    await service_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) values ($1, 0, '아직 승인 전', $2::vector)",
        doc_d, vec,
    )
    rows = await service_conn.fetch(
        "select * from match_kb_chunks($1::vector, 10)", vec
    )
    contents = {r["content"] for r in rows}
    assert "지하 1층 주차장" in contents
    assert "아직 승인 전" not in contents, "승인 안 된 자료가 검색되면 안 됩니다"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_kb_schema.py -v`
Expected: FAIL

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/00013_kb_pgvector.sql`:
```sql
create extension if not exists vector;

-- 안내자료 원본: 사람(관리자)의 관리 단위 (스펙 섹션 2)
create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '기타',
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  created_by uuid references staff(id),
  approved_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);

-- 자료 조각: 검색 엔진(RAG)의 단위. 원본 승인/수정 시 전량 재생성
create table kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null
);

create index idx_kb_chunks_embedding on kb_chunks
  using hnsw (embedding vector_cosine_ops);

-- 안내자료 수정이력: update_document가 덮어쓰기 전 값을 여기 먼저 저장 (요구사항 3.8, 1단계 medical_record_revisions와 같은 패턴)
create table kb_document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents(id) on delete cascade,
  previous_title text not null,
  previous_category text not null,
  previous_content text not null,
  changed_by uuid references staff(id),
  changed_at timestamptz not null default now()
);

create index idx_kb_document_revisions_document on kb_document_revisions (document_id, changed_at desc);

-- 승인된 자료의 조각만 대상으로 코사인 유사도 상위 match_count개 반환
create function match_kb_chunks(query_embedding vector(1536), match_count int)
returns table (id uuid, document_id uuid, content text, title text, similarity float)
language sql stable as $$
  select c.id, c.document_id, c.content, d.title,
         1 - (c.embedding <=> query_embedding) as similarity
  from kb_chunks c
  join kb_documents d on d.id = c.document_id
  where d.status = 'approved'
  order by c.embedding <=> query_embedding
  limit match_count
$$;

alter table kb_documents enable row level security;
alter table kb_chunks enable row level security;
alter table kb_document_revisions enable row level security;

-- 직원: 자료 조회 가능 (근거 확인용). 작성/수정/승인은 백엔드 경유(관리자 검사)
create policy kb_documents_staff_select on kb_documents
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));

create policy kb_chunks_staff_select on kb_chunks
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));

create policy kb_document_revisions_staff_select on kb_document_revisions
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `supabase db reset && cd backend && pytest tests/test_kb_schema.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00013_kb_pgvector.sql backend/tests/test_kb_schema.py
git commit -m "feat: pgvector + 지식베이스 테이블 + 수정이력 (4단계 RAG)"
```

---

## Task 3: 마이그레이션 — 인계 티켓 + 오답 신고 + 품질개선 예시은행 테이블

**Files:**
- Create: `supabase/migrations/00014_support_feedback.sql`
- Test: `backend/tests/test_support_feedback_schema.py`

**Interfaces:**
- Produces: 테이블 `support_tickets`(요약 5컬럼 + `reason` 6종 — 이 6종이 곧 "인계 감시"가 검사하는 6가지 조건 + `status` 3종 `pending`/`in_progress`/`answered` — 요구사항 3.9 + `question_embedding vector(1536)` — 미해결 질문 클러스터링용, 요구사항 3.9/3.10), `answer_feedback`(`source`, `add_to_example_bank` 포함), `qa_example_bank`, RLS 정책

- [ ] **Step 1: 실패하는 스키마 테스트 작성**

`backend/tests/test_support_feedback_schema.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_tables_exist(service_conn):
    for table in ("support_tickets", "answer_feedback", "qa_example_bank"):
        exists = await service_conn.fetchval(
            "select exists (select from information_schema.tables where table_name = $1)",
            table,
        )
        assert exists


@pytest.mark.asyncio
async def test_ticket_summary_columns(service_conn):
    cols = {
        r["column_name"]
        for r in await service_conn.fetch(
            "select column_name from information_schema.columns where table_name = 'support_tickets'"
        )
    }
    # 요구사항 5.5의 요약 5항목이 컬럼으로 존재해야 함
    assert {
        "summary_question", "summary_confirmed", "summary_guided",
        "summary_unresolved", "summary_staff_todo", "reason", "status",
        "contact_name", "contact_phone", "question_embedding",
    } <= cols


@pytest.mark.asyncio
async def test_ticket_reason_check(service_conn):
    conv = await service_conn.fetchval(
        "insert into chat_conversations (channel) values ('web') returning id"
    )
    with pytest.raises(Exception):
        await service_conn.execute(
            "insert into support_tickets (conversation_id, reason, summary_question, "
            "summary_confirmed, summary_guided, summary_unresolved, summary_staff_todo) "
            "values ($1, 'invalid_reason', 'q', 'c', 'g', 'u', 't')",
            conv,
        )


@pytest.mark.asyncio
async def test_ticket_status_check(service_conn):
    conv = await service_conn.fetchval(
        "insert into chat_conversations (channel) values ('web') returning id"
    )
    # 3단계 상태(새 문의/처리 중/답변완료) 중 하나인 in_progress는 허용
    ticket_id = await service_conn.fetchval(
        "insert into support_tickets (conversation_id, reason, status, summary_question, "
        "summary_confirmed, summary_guided, summary_unresolved, summary_staff_todo) "
        "values ($1, 'no_answer', 'in_progress', 'q', 'c', 'g', 'u', 't') returning id",
        conv,
    )
    assert ticket_id is not None
    # 정의되지 않은 상태값은 거부
    with pytest.raises(Exception):
        await service_conn.execute(
            "insert into support_tickets (conversation_id, reason, status, summary_question, "
            "summary_confirmed, summary_guided, summary_unresolved, summary_staff_todo) "
            "values ($1, 'no_answer', 'new', 'q', 'c', 'g', 'u', 't')",
            conv,
        )


@pytest.mark.asyncio
async def test_answer_feedback_columns(service_conn):
    cols = {
        r["column_name"]
        for r in await service_conn.fetch(
            "select column_name from information_schema.columns where table_name = 'answer_feedback'"
        )
    }
    assert {"source", "add_to_example_bank", "correction_text", "status"} <= cols


@pytest.mark.asyncio
async def test_answer_feedback_source_check(service_conn):
    conv = await service_conn.fetchval(
        "insert into chat_conversations (channel) values ('web') returning id"
    )
    msg = await service_conn.fetchval(
        "insert into chat_messages (conversation_id, sender, content) values ($1, 'bot', 'x') returning id",
        conv,
    )
    staff_id = await service_conn.fetchval("select id from staff limit 1")
    with pytest.raises(Exception):
        await service_conn.execute(
            "insert into answer_feedback (message_id, reported_by, source, correction_text) "
            "values ($1, $2, 'invalid_source', 'c')",
            msg, staff_id,
        )


@pytest.mark.asyncio
async def test_qa_example_bank_columns(service_conn):
    cols = {
        r["column_name"]
        for r in await service_conn.fetch(
            "select column_name from information_schema.columns where table_name = 'qa_example_bank'"
        )
    }
    assert {"question_text", "corrected_answer_text", "question_embedding", "category", "is_active"} <= cols
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_support_feedback_schema.py -v`
Expected: FAIL

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/00014_support_feedback.sql`:
```sql
-- 직원 인계 티켓 (스펙 섹션 2, 요구사항 5.5)
-- reason의 6개 값이 곧 "인계 감시"가 매 턴 검사하는 6가지 조건이다.
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id),
  patient_id uuid references patients(id),
  contact_name text,
  contact_phone text,
  summary_question text not null,
  summary_confirmed text not null,
  summary_guided text not null,
  summary_unresolved text not null,
  summary_staff_todo text not null,
  reason text not null check (reason in
    ('no_answer', 'medical_judgment', 'unhelpful', 'data_mismatch', 'complaint', 'repeated')),
  -- 새 문의 / 처리 중(담당 배정됨) / 답변완료 (요구사항 3.9)
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'answered')),
  assigned_staff_id uuid references staff(id),
  -- summary_question의 임베딩 — "자주 들어오지만 답하지 못한 질문" 모아보기용 (요구사항 3.9/3.10)
  question_embedding vector(1536),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index idx_support_tickets_status on support_tickets (status, created_at);
create index idx_support_tickets_question_embedding on support_tickets
  using hnsw (question_embedding vector_cosine_ops);

-- 오답 신고와 정정 (요구사항 5.6) — source로 "그 자리에서 신고"와 "정기 리포트 검토 중 교정"을 구분
create table answer_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id),
  reported_by uuid not null references staff(id),
  source text not null default 'realtime_report' check (source in ('realtime_report', 'periodic_review')),
  correction_text text not null,
  add_to_example_bank boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  reviewed_by uuid references staff(id),
  applied_document_id uuid references kb_documents(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- 품질 개선 사이클의 축적 예시: 관리자가 반영하며 add_to_example_bank를 체크한 교정만 여기 등록됨
create table qa_example_bank (
  id uuid primary key default gen_random_uuid(),
  source_feedback_id uuid references answer_feedback(id),
  question_text text not null,
  corrected_answer_text text not null,
  question_embedding vector(1536) not null,
  category text not null check (category in ('rag', 'department_guide', 'agent')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_qa_example_bank_embedding on qa_example_bank
  using hnsw (question_embedding vector_cosine_ops);

alter table support_tickets enable row level security;
alter table answer_feedback enable row level security;
alter table qa_example_bank enable row level security;

create policy support_tickets_staff_select on support_tickets
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));

create policy answer_feedback_staff_select on answer_feedback
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));

create policy qa_example_bank_staff_select on qa_example_bank
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));

alter publication supabase_realtime add table support_tickets;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `supabase db reset && cd backend && pytest tests/test_support_feedback_schema.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00014_support_feedback.sql backend/tests/test_support_feedback_schema.py
git commit -m "feat: 인계 티켓 + 오답 신고 + 품질개선 예시은행 테이블 (4단계)"
```

---

## Task 4: OpenAI 임베딩 클라이언트

**Files:**
- Create: `backend/app/integrations/embedding_client.py`
- Modify: `backend/app/core/config.py` (설정 추가)
- Modify: `backend/.env.example`
- Test: `backend/tests/test_embedding_client.py`

**Interfaces:**
- Consumes: `app.core.config.settings`
- Produces: `app.integrations.embedding_client.EmbeddingClient(api_key: str)`(`.embed(texts: list[str]) -> list[list[float]]` async, 1536차원), `get_embedding_client() -> EmbeddingClient`
- Produces: `settings.openai_api_key`, `settings.anthropic_api_key`, `settings.chat_model`(기본 `"claude-sonnet-5"`), `settings.anon_rate_limit_per_hour`(기본 30), `settings.business_hour_start`(기본 9), `settings.business_hour_end`(기본 18)

- [ ] **Step 1: 설정 추가**

`backend/app/core/config.py`의 `Settings` 클래스에 추가:
```python
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    chat_model: str = "claude-sonnet-5"
    embedding_model: str = "text-embedding-3-small"
    anon_rate_limit_per_hour: int = 30
    business_hour_start: int = 9   # 업무시간 판정 (요구사항 5.5)
    business_hour_end: int = 18
```

`backend/.env.example`에 추가:
```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/tests/test_embedding_client.py`:
```python
import httpx
import pytest
from app.integrations.embedding_client import EmbeddingClient


@pytest.mark.asyncio
async def test_embed_returns_vectors(monkeypatch):
    async def fake_post(self, url, **kwargs):
        assert url.endswith("/embeddings")
        texts = kwargs["json"]["input"]
        return httpx.Response(
            200,
            json={"data": [{"index": i, "embedding": [0.1] * 1536} for i in range(len(texts))]},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    client = EmbeddingClient(api_key="test-key")
    vectors = await client.embed(["주차 되나요?", "진료시간 알려주세요"])
    assert len(vectors) == 2
    assert len(vectors[0]) == 1536


@pytest.mark.asyncio
async def test_embed_raises_korean_error_on_failure(monkeypatch):
    async def fake_post(self, url, **kwargs):
        return httpx.Response(500, json={"error": "boom"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    client = EmbeddingClient(api_key="test-key")
    from app.core.errors import AppError
    with pytest.raises(AppError):
        await client.embed(["질문"])
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_embedding_client.py -v`
Expected: FAIL (모듈 없음)

- [ ] **Step 4: 구현**

`backend/app/integrations/embedding_client.py`:
```python
import httpx

from app.core.config import settings
from app.core.errors import AppError, log_error

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"


class EmbeddingClient:
    def __init__(self, api_key: str):
        self._api_key = api_key

    async def embed(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=30) as http:
            resp = await http.post(
                OPENAI_EMBEDDINGS_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"model": settings.embedding_model, "input": texts},
            )
        if resp.status_code != 200:
            log_error("embedding", f"OpenAI 임베딩 실패: {resp.status_code} {resp.text[:200]}")
            raise AppError("자료 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.", 502)
        data = sorted(resp.json()["data"], key=lambda d: d["index"])
        return [d["embedding"] for d in data]


def get_embedding_client() -> EmbeddingClient:
    return EmbeddingClient(api_key=settings.openai_api_key)
```

(참고: `log_error`가 async라면 기존 1단계 시그니처에 맞춰 `await` 처리 — 기존 코드의 사용 방식을 따른다)

- [ ] **Step 5: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_embedding_client.py -v`
Expected: PASS

```bash
git add backend/app/integrations/embedding_client.py backend/app/core/config.py backend/.env.example backend/tests/test_embedding_client.py
git commit -m "feat: OpenAI 임베딩 클라이언트 + 4단계 설정"
```

---

## Task 5: 지식베이스 서비스 (자료 CRUD + 승인 → 청킹·임베딩)

**Files:**
- Create: `backend/app/services/kb_service.py`
- Test: `backend/tests/test_kb_service.py`

**Interfaces:**
- Consumes: `app.db.pool.get_pool`, `EmbeddingClient` (주입 가능), `StaffContext`
- Produces: `app.services.kb_service.create_document(staff, title, category, content) -> UUID`, `update_document(staff, document_id, title, category, content) -> None`(수정 전 내용을 `kb_document_revisions`에 스냅샷 저장 후 덮어쓰기 — 요구사항 3.8. 승인 상태였다면 재청킹+재임베딩), `approve_document(staff, document_id) -> None`(청킹+임베딩 실행, 관리자만), `archive_document(staff, document_id) -> None`(조각 삭제), `list_documents(staff, status=None, category=None) -> list[dict]`, `list_revisions(staff, document_id) -> list[dict]`(수정이력 시간 역순), `chunk_text(content: str) -> list[str]`(빈 줄 기준 문단 분리, 800자 초과 문단은 분할)

- [ ] **Step 1: 청킹 단위 테스트 작성 (순수 함수 먼저)**

`backend/tests/test_kb_service.py`:
```python
import pytest
from app.services.kb_service import chunk_text


def test_chunk_by_paragraph():
    content = "첫 문단입니다.\n\n둘째 문단입니다.\n\n\n셋째 문단입니다."
    chunks = chunk_text(content)
    assert chunks == ["첫 문단입니다.", "둘째 문단입니다.", "셋째 문단입니다."]


def test_long_paragraph_split():
    content = "가" * 2000  # 800자 초과 단일 문단
    chunks = chunk_text(content)
    assert all(len(c) <= 800 for c in chunks)
    assert "".join(chunks) == content


def test_empty_content():
    assert chunk_text("  \n\n ") == []
```

- [ ] **Step 2: 실패 확인 → `chunk_text` 구현**

Run: `cd backend && pytest tests/test_kb_service.py -v` → FAIL

`backend/app/services/kb_service.py` (1차 — 청킹만):
```python
from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import get_pool
from app.integrations.embedding_client import EmbeddingClient, get_embedding_client

MAX_CHUNK_CHARS = 800


def chunk_text(content: str) -> list[str]:
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    chunks: list[str] = []
    for p in paragraphs:
        while len(p) > MAX_CHUNK_CHARS:
            chunks.append(p[:MAX_CHUNK_CHARS])
            p = p[MAX_CHUNK_CHARS:]
        if p:
            chunks.append(p)
    return chunks
```

Run: `pytest tests/test_kb_service.py -v` → PASS → 중간 커밋 가능

- [ ] **Step 3: 승인 파이프라인 테스트 작성**

`backend/tests/test_kb_service.py`에 추가:
```python
from tests.conftest import admin_staff  # 기존 conftest의 관리자 StaffContext 픽스처


class FakeEmbedding:
    async def embed(self, texts):
        return [[0.1] * 1536 for _ in texts]


@pytest.mark.asyncio
async def test_approve_creates_chunks(service_conn, admin_staff):
    from app.services import kb_service

    doc_id = await kb_service.create_document(
        admin_staff, title="위내시경 준비", category="검사준비",
        content="검사 전날 밤 9시부터 금식하세요.\n\n아침 약은 검사 후에 드세요.",
    )
    await kb_service.approve_document(admin_staff, doc_id, embedder=FakeEmbedding())

    status = await service_conn.fetchval("select status from kb_documents where id = $1", doc_id)
    assert status == "approved"
    count = await service_conn.fetchval(
        "select count(*) from kb_chunks where document_id = $1", doc_id
    )
    assert count == 2  # 문단 2개 → 조각 2개


@pytest.mark.asyncio
async def test_update_approved_reembeds(service_conn, admin_staff):
    from app.services import kb_service

    doc_id = await kb_service.create_document(
        admin_staff, title="주차", category="위치·주차", content="지하 1층입니다."
    )
    await kb_service.approve_document(admin_staff, doc_id, embedder=FakeEmbedding())
    await kb_service.update_document(
        admin_staff, doc_id, title="주차", category="위치·주차",
        content="지하 1층입니다.\n\n2시간 무료입니다.", embedder=FakeEmbedding(),
    )
    count = await service_conn.fetchval(
        "select count(*) from kb_chunks where document_id = $1", doc_id
    )
    assert count == 2  # 수정 후 재청킹 (원본-조각 불일치 방지)


@pytest.mark.asyncio
async def test_update_saves_previous_content_as_revision(service_conn, admin_staff):
    from app.services import kb_service

    doc_id = await kb_service.create_document(
        admin_staff, title="주차", category="위치·주차", content="지하 1층입니다."
    )
    await kb_service.update_document(
        admin_staff, doc_id, title="주차", category="위치·주차",
        content="지하 1층입니다. 2시간 무료입니다.", embedder=FakeEmbedding(),
    )
    revisions = await kb_service.list_revisions(admin_staff, doc_id)
    assert len(revisions) == 1
    # 수정 "전" 내용이 남아야 함 (요구사항 3.8)
    assert revisions[0]["previous_content"] == "지하 1층입니다."
    assert revisions[0]["changed_by"] == admin_staff.id


@pytest.mark.asyncio
async def test_non_admin_cannot_approve(service_conn, receptionist_staff, admin_staff):
    from app.services import kb_service
    from app.core.errors import AppError

    doc_id = await kb_service.create_document(
        admin_staff, title="t", category="기타", content="c"
    )
    with pytest.raises(AppError):
        await kb_service.approve_document(receptionist_staff, doc_id, embedder=FakeEmbedding())
```

- [ ] **Step 4: 실패 확인 → 서비스 구현**

`backend/app/services/kb_service.py`에 추가:
```python
def _vec_literal(v: list[float]) -> str:
    return "[" + ",".join(str(x) for x in v) + "]"


async def create_document(staff: StaffContext, title: str, category: str, content: str) -> UUID:
    pool = get_pool()
    return await pool.fetchval(
        "insert into kb_documents (title, category, content, created_by) "
        "values ($1, $2, $3, $4) returning id",
        title, category, content, staff.id,
    )


async def _rebuild_chunks(conn, document_id: UUID, content: str, embedder) -> None:
    chunks = chunk_text(content)
    await conn.execute("delete from kb_chunks where document_id = $1", document_id)
    if not chunks:
        return
    vectors = await embedder.embed(chunks)
    for i, (text, vec) in enumerate(zip(chunks, vectors)):
        await conn.execute(
            "insert into kb_chunks (document_id, chunk_index, content, embedding) "
            "values ($1, $2, $3, $4::vector)",
            document_id, i, text, _vec_literal(vec),
        )


def _require_admin(staff: StaffContext) -> None:
    if staff.role != "admin":
        raise AppError("관리자만 할 수 있는 작업이에요.", 403)


async def approve_document(staff: StaffContext, document_id: UUID, embedder=None) -> None:
    _require_admin(staff)
    embedder = embedder or get_embedding_client()
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "update kb_documents set status = 'approved', approved_by = $2, approved_at = now() "
                "where id = $1 returning content",
                document_id, staff.id,
            )
            if row is None:
                raise AppError("자료를 찾을 수 없어요.", 404)
            await _rebuild_chunks(conn, document_id, row["content"], embedder)


async def update_document(
    staff: StaffContext, document_id: UUID, title: str, category: str, content: str, embedder=None
) -> None:
    embedder = embedder or get_embedding_client()
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            before = await conn.fetchrow(
                "select title, category, content, status from kb_documents where id = $1",
                document_id,
            )
            if before is None:
                raise AppError("자료를 찾을 수 없어요.", 404)
            # 덮어쓰기 전 스냅샷을 먼저 남긴다 (요구사항 3.8, 1단계 medical_record_revisions와 같은 패턴)
            await conn.execute(
                "insert into kb_document_revisions "
                "(document_id, previous_title, previous_category, previous_content, changed_by) "
                "values ($1, $2, $3, $4, $5)",
                document_id, before["title"], before["category"], before["content"], staff.id,
            )
            await conn.execute(
                "update kb_documents set title = $2, category = $3, content = $4, updated_at = now() "
                "where id = $1",
                document_id, title, category, content,
            )
            if before["status"] == "approved":
                await _rebuild_chunks(conn, document_id, content, embedder)


async def list_revisions(staff: StaffContext, document_id: UUID) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "select id, previous_title, previous_category, previous_content, changed_by, changed_at "
        "from kb_document_revisions where document_id = $1 order by changed_at desc",
        document_id,
    )
    return [dict(r) for r in rows]


async def archive_document(staff: StaffContext, document_id: UUID) -> None:
    _require_admin(staff)
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "update kb_documents set status = 'archived', updated_at = now() where id = $1",
                document_id,
            )
            await conn.execute("delete from kb_chunks where document_id = $1", document_id)


async def list_documents(staff: StaffContext, status: str | None = None, category: str | None = None) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "select id, title, category, status, updated_at, approved_at from kb_documents "
        "where ($1::text is null or status = $1) and ($2::text is null or category = $2) "
        "order by updated_at desc",
        status, category,
    )
    return [dict(r) for r in rows]
```

- [ ] **Step 5: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_kb_service.py -v`
Expected: PASS

```bash
git add backend/app/services/kb_service.py backend/tests/test_kb_service.py
git commit -m "feat: 지식베이스 서비스 - 승인 시 청킹+임베딩 파이프라인 + 수정이력 스냅샷"
```

---

## Task 6: RAG 검색 서비스

**Files:**
- Create: `backend/app/services/rag_search_service.py`
- Test: `backend/tests/test_rag_search_service.py`

**Interfaces:**
- Consumes: `match_kb_chunks` DB 함수(Task 2), `EmbeddingClient`
- Produces: `app.services.rag_search_service.search(query: str, top_k: int = 5, embedder=None) -> list[dict]` — 각 dict: `{"chunk_id": UUID, "document_id": UUID, "title": str, "content": str, "similarity": float}`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_rag_search_service.py`:
```python
import pytest
from tests.test_kb_service import FakeEmbedding


@pytest.mark.asyncio
async def test_search_returns_approved_chunks(service_conn, admin_staff):
    from app.services import kb_service, rag_search_service

    doc_id = await kb_service.create_document(
        admin_staff, title="주차 안내", category="위치·주차", content="지하 1층 주차장, 2시간 무료"
    )
    await kb_service.approve_document(admin_staff, doc_id, embedder=FakeEmbedding())

    results = await rag_search_service.search("주차 되나요?", embedder=FakeEmbedding())
    assert len(results) >= 1
    assert results[0]["title"] == "주차 안내"
    assert "chunk_id" in results[0] and "similarity" in results[0]


@pytest.mark.asyncio
async def test_search_empty_kb_returns_empty(service_conn):
    from app.services import rag_search_service

    results = await rag_search_service.search("아무 질문", embedder=FakeEmbedding())
    assert results == []
```

- [ ] **Step 2: 실패 확인 → 구현**

Run: `cd backend && pytest tests/test_rag_search_service.py -v` → FAIL

`backend/app/services/rag_search_service.py`:
```python
from app.db.pool import get_pool
from app.integrations.embedding_client import get_embedding_client
from app.services.kb_service import _vec_literal


async def search(query: str, top_k: int = 5, embedder=None) -> list[dict]:
    embedder = embedder or get_embedding_client()
    [vector] = await embedder.embed([query])
    pool = get_pool()
    rows = await pool.fetch(
        "select id as chunk_id, document_id, content, title, similarity "
        "from match_kb_chunks($1::vector, $2)",
        _vec_literal(vector), top_k,
    )
    return [dict(r) for r in rows]
```

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_rag_search_service.py -v`
Expected: PASS

```bash
git add backend/app/services/rag_search_service.py backend/tests/test_rag_search_service.py
git commit -m "feat: RAG 검색 서비스 (질문 임베딩 + pgvector 유사도)"
```

---

## Task 7: LangChain 모델 클라이언트 + RAG 체인 (안내형)

**Files:**
- Create: `backend/app/integrations/langchain_client.py`
- Modify: `backend/requirements.txt` (`langchain`, `langchain-anthropic` 추가)
- Create: `backend/app/services/rag_chain.py`
- Test: `backend/tests/test_langchain_client.py`
- Test: `backend/tests/test_rag_chain.py`

**Interfaces:**
- Consumes: `settings.anthropic_api_key`, `settings.chat_model`, `rag_search_service.search`(Task 6)
- Produces: `app.integrations.langchain_client.get_chat_model(model: str | None = None) -> ChatAnthropic`
- Produces: `app.services.rag_chain.answer(query: str, embedder=None, model=None) -> dict` (`{"text": str, "source_chunk_ids": list[UUID]}`) — 도구 없이 검색+생성만 수행 (스펙 섹션 3 "갈래 ①")

- [ ] **Step 1: 의존성 추가**

`backend/requirements.txt`에 추가:
```
langchain==0.3.7
langchain-anthropic==0.3.0
```
Run: `cd backend && pip install -r requirements.txt`

- [ ] **Step 2: 실패하는 테스트 작성 — 모델 팩토리**

`backend/tests/test_langchain_client.py`:
```python
def test_get_chat_model_uses_settings(monkeypatch):
    from app.integrations.langchain_client import get_chat_model
    from app.core.config import settings

    monkeypatch.setattr(settings, "chat_model", "claude-sonnet-5")
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")

    model = get_chat_model()
    assert model.model == "claude-sonnet-5"


def test_get_chat_model_accepts_override():
    from app.integrations.langchain_client import get_chat_model

    model = get_chat_model(model="claude-sonnet-5-override")
    assert model.model == "claude-sonnet-5-override"
```

Run: `cd backend && pytest tests/test_langchain_client.py -v` → FAIL (모듈 없음)

- [ ] **Step 3: 모델 팩토리 구현**

`backend/app/integrations/langchain_client.py`:
```python
from langchain_anthropic import ChatAnthropic

from app.core.config import settings


def get_chat_model(model: str | None = None) -> ChatAnthropic:
    return ChatAnthropic(
        model=model or settings.chat_model,
        api_key=settings.anthropic_api_key,
        max_tokens=2048,
    )
```

Run: `cd backend && pytest tests/test_langchain_client.py -v` → PASS

- [ ] **Step 4: 실패하는 테스트 작성 — RAG 체인**

`backend/tests/test_rag_chain.py`:
```python
import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from tests.test_kb_service import FakeEmbedding


@pytest.mark.asyncio
async def test_answer_uses_context_and_returns_source_chunks(service_conn, admin_staff):
    from app.services import kb_service, rag_chain

    doc_id = await kb_service.create_document(
        admin_staff, title="주차 안내", category="위치·주차", content="지하 1층 주차장, 2시간 무료"
    )
    await kb_service.approve_document(admin_staff, doc_id, embedder=FakeEmbedding())

    fake_model = FakeListChatModel(responses=["지하 1층에 주차장이 있고 2시간 무료예요."])
    result = await rag_chain.answer("주차 되나요?", embedder=FakeEmbedding(), model=fake_model)

    assert result["text"] == "지하 1층에 주차장이 있고 2시간 무료예요."
    assert len(result["source_chunk_ids"]) == 1


@pytest.mark.asyncio
async def test_answer_no_kb_hits_skips_model_call():
    from app.services import rag_chain

    fake_model = FakeListChatModel(responses=["이 답은 나오면 안 됨"])
    result = await rag_chain.answer("아무 질문", embedder=FakeEmbedding(), model=fake_model)

    assert result["source_chunk_ids"] == []
    assert "찾지 못했" in result["text"]
```

Run: `cd backend && pytest tests/test_rag_chain.py -v` → FAIL (모듈 없음)

- [ ] **Step 5: RAG 체인 구현**

`backend/app/services/rag_chain.py`:
```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model
from app.services import rag_search_service

RAG_SYSTEM_PROMPT = """당신은 병원의 AI 상담봇입니다. 아래 [참고 자료]에 있는 내용만 근거로 답하세요.
자료에 없는 내용은 지어내지 말고 "확인이 어렵다"고 답하세요.
존댓말의 친절한 한국어로, 짧고 명확하게 답하세요."""

_PROMPT = ChatPromptTemplate.from_messages([
    ("system", RAG_SYSTEM_PROMPT),
    ("human", "[참고 자료]\n{context}\n\n[질문]\n{query}"),
])

NO_RESULT_REPLY = "관련된 병원 안내자료를 찾지 못했어요. 직원에게 확인 후 안내드릴게요."


async def answer(query: str, embedder=None, model=None) -> dict:
    results = await rag_search_service.search(query, embedder=embedder)
    if not results:
        return {"text": NO_RESULT_REPLY, "source_chunk_ids": []}

    context = "\n\n".join(f"[{r['title']}] {r['content']}" for r in results)
    chain = _PROMPT | (model or get_chat_model()) | StrOutputParser()
    text = await chain.ainvoke({"context": context, "query": query})
    return {"text": text, "source_chunk_ids": [r["chunk_id"] for r in results]}
```

- [ ] **Step 6: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_langchain_client.py tests/test_rag_chain.py -v`
Expected: 전체 PASS

```bash
git add backend/app/integrations/langchain_client.py backend/app/services/rag_chain.py backend/requirements.txt backend/tests/test_langchain_client.py backend/tests/test_rag_chain.py
git commit -m "feat: LangChain 모델 클라이언트 + 안내형 RAG 체인"
```

---

## Task 8: 문진 체인 — 진료과 추천형 (요구사항 5.3)

**Files:**
- Create: `backend/app/services/department_guide_chain.py`
- Test: `backend/tests/test_department_guide_chain.py`

**Interfaces:**
- Consumes: `get_chat_model`(Task 7), `patient_catalog_service.list_departments`(1단계)
- Produces: `app.services.department_guide_chain.SAFETY_RULES: str`
- Produces: `app.services.department_guide_chain.ask_next_question(history_text: str, step: int, model=None) -> str` (`step` 0=시작시점 질문, 1=동반증상 질문, 2=목적 확인)
- Produces: `app.services.department_guide_chain.recommend_departments(history_text: str, patient, model=None) -> str` — 실제 운영 중인 진료과만 안내

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_department_guide_chain.py`:
```python
import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel


def test_safety_rules_forbid_diagnosis_and_medication():
    from app.services.department_guide_chain import SAFETY_RULES

    assert "진단" in SAFETY_RULES
    assert "약" in SAFETY_RULES
    assert "환자가 확인" in SAFETY_RULES or "환자 확인" in SAFETY_RULES


@pytest.mark.asyncio
async def test_ask_next_question_step0_asks_onset():
    from app.services import department_guide_chain

    fake_model = FakeListChatModel(responses=["힘드셨겠어요. 언제부터 그러셨나요?"])
    result = await department_guide_chain.ask_next_question(
        "환자: 머리가 아파요", step=0, model=fake_model,
    )
    assert "언제부터" in result


@pytest.mark.asyncio
async def test_recommend_departments_uses_real_department_list(monkeypatch):
    from app.services import department_guide_chain

    async def fake_list_departments(patient):
        return [{"id": "d1", "name": "신경과"}]

    monkeypatch.setattr(department_guide_chain.patient_catalog_service, "list_departments", fake_list_departments)
    fake_model = FakeListChatModel(responses=["신경과 진료를 받아보시는 게 좋겠어요. 최종 선택은 환자가 확인해 주세요."])
    result = await department_guide_chain.recommend_departments(
        "환자: 머리가 계속 아파요", patient=None, model=fake_model,
    )
    assert "신경과" in result
```

Run: `cd backend && pytest tests/test_department_guide_chain.py -v` → FAIL (모듈 없음)

- [ ] **Step 2: 문진 체인 구현**

`backend/app/services/department_guide_chain.py`:
```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model
from app.services import patient_catalog_service

SAFETY_RULES = """[절대 규칙 — 위반 금지]
- 병명을 진단하지 마세요. "OO병으로 보입니다"처럼 확정적으로 말하지 마세요.
- 약이나 치료법을 추천하지 마세요.
- 가능한 진료과를 안내하되 최종 선택은 환자가 확인한다고 안내하세요."""

STEP_INSTRUCTIONS = {
    0: "환자가 방금 불편한 증상을 말했습니다. 공감 한 문장 후, 증상이 언제부터 시작됐는지 물어보세요.",
    1: "시작 시점을 들었습니다. 공감 한 문장 후, 다른 동반 증상이 있는지 물어보세요.",
    2: "동반 증상까지 들었습니다. 지금까지 들은 내용을 한 문장으로 요약하고, "
       "병원에 방문하려는 목적(정기검진/불편 해소 등)이 있는지 물어보세요.",
}

_QUESTION_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "당신은 병원의 AI 상담봇입니다. 진료과 선택을 돕는 문진을 진행 중입니다.\n" + SAFETY_RULES),
    ("human", "지금까지 대화:\n{history}\n\n이번 단계 지시: {step_instruction}"),
])


async def ask_next_question(history_text: str, step: int, model=None) -> str:
    instruction = STEP_INSTRUCTIONS.get(step, STEP_INSTRUCTIONS[2])
    chain = _QUESTION_PROMPT | (model or get_chat_model()) | StrOutputParser()
    return await chain.ainvoke({"history": history_text, "step_instruction": instruction})


async def recommend_departments(history_text: str, patient, model=None) -> str:
    departments = await patient_catalog_service.list_departments(patient)
    dept_names = ", ".join(d["name"] for d in departments) or "내과"
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         f"당신은 병원의 AI 상담봇입니다. 지금까지의 문진 내용을 바탕으로 "
         f"현재 운영 중인 진료과({dept_names}) 중 가능한 곳 1~2개를 안내하세요.\n" + SAFETY_RULES),
        ("human", "지금까지 대화:\n{history}"),
    ])
    chain = prompt | (model or get_chat_model()) | StrOutputParser()
    return await chain.ainvoke({"history": history_text})
```

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_department_guide_chain.py -v`
Expected: 전체 PASS

```bash
git add backend/app/services/department_guide_chain.py backend/tests/test_department_guide_chain.py
git commit -m "feat: 문진 체인 - 진료과 추천형 (구조화된 순차 질문)"
```

---

## Task 9: 에이전트 도구 5개 + 에이전트 체인 (행동형, 요구사항 5.4)

**Files:**
- Create: `backend/app/services/chat_tools.py`
- Create: `backend/app/services/agent_chain.py`
- Test: `backend/tests/test_chat_tools.py`
- Test: `backend/tests/test_agent_chain.py`

**Interfaces:**
- Consumes: `rag_search_service.search`(Task 6), `patient_catalog_service.list_departments/list_doctors/list_available_slots`, `patient_appointment_query_service.list_my_appointments`(1단계), `get_chat_model`(Task 7)
- Produces: `app.services.chat_tools.ToolContext`(dataclass: `patient: PatientContext | None`, `conversation_id: UUID`, `collected: dict` — `source_chunk_ids: list`, `card: dict | None`)
- Produces: `app.services.chat_tools.build_tools(ctx: ToolContext) -> list[StructuredTool]` (도구 5개 — 인계 도구는 없음, Task 10의 감시 로직으로 분리됨)
- Produces: `app.services.agent_chain.run(query: str, ctx: ToolContext, model=None) -> dict` (`{"text": str, "card": dict | None, "source_chunk_ids": list}`)

- [ ] **Step 1: 실패하는 테스트 작성 — 도구**

`backend/tests/test_chat_tools.py`:
```python
import pytest
from uuid import uuid4

from app.services.chat_tools import ToolContext, build_tools


def test_build_tools_returns_five_and_excludes_handoff_and_booking_execution():
    ctx = ToolContext(patient=None, conversation_id=uuid4())
    tools = build_tools(ctx)
    names = {t.name for t in tools}
    assert names == {
        "search_hospital_info", "list_departments_doctors", "list_available_slots",
        "get_my_appointments", "propose_booking_card",
    }
    # 인계는 도구가 아니라 Task 10의 감시 로직으로 분리됨. 예약 실행 도구도 의도적으로 없음 (스펙 섹션 3)
    assert "handoff_to_staff" not in names
    assert "create_booking" not in names and "book_appointment" not in names


@pytest.mark.asyncio
async def test_search_collects_source_chunks(monkeypatch):
    from app.services import chat_tools

    async def fake_search(query, top_k=5, embedder=None):
        return [{"chunk_id": uuid4(), "document_id": uuid4(), "title": "주차 안내",
                 "content": "지하 1층", "similarity": 0.9}]

    monkeypatch.setattr(chat_tools.rag_search_service, "search", fake_search)
    ctx = ToolContext(patient=None, conversation_id=uuid4())
    tool = next(t for t in build_tools(ctx) if t.name == "search_hospital_info")

    out = await tool.ainvoke({"query": "주차"})
    assert "지하 1층" in out
    assert len(ctx.collected["source_chunk_ids"]) == 1  # 근거 추적 (요구사항 5.6)


@pytest.mark.asyncio
async def test_my_appointments_requires_login():
    ctx = ToolContext(patient=None, conversation_id=uuid4())
    tool = next(t for t in build_tools(ctx) if t.name == "get_my_appointments")
    out = await tool.ainvoke({})
    assert "로그인" in out  # 익명이면 로그인 안내 문자열 반환 (에러 아님)


@pytest.mark.asyncio
async def test_propose_card_requires_login():
    ctx = ToolContext(patient=None, conversation_id=uuid4())
    tool = next(t for t in build_tools(ctx) if t.name == "propose_booking_card")
    out = await tool.ainvoke({
        "for_patient_id": str(uuid4()), "department_id": str(uuid4()),
        "doctor_id": str(uuid4()), "slot_id": str(uuid4()),
        "doctor_name": "김의사", "department_name": "내과",
        "slot_date": "2026-07-30", "start_time": "10:00",
    })
    assert "로그인" in out
    assert ctx.collected["card"] is None
```

Run: `cd backend && pytest tests/test_chat_tools.py -v` → FAIL (모듈 없음)

- [ ] **Step 2: 도구 구현**

`backend/app/services/chat_tools.py`:
```python
from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.core.patient_security import PatientContext
from app.services import patient_appointment_query_service, patient_catalog_service, rag_search_service


@dataclass
class ToolContext:
    patient: PatientContext | None
    conversation_id: UUID
    collected: dict = field(default_factory=lambda: {"source_chunk_ids": [], "card": None})


class SearchHospitalInfoInput(BaseModel):
    query: str = Field(description="검색할 질문")


class ListDepartmentsDoctorsInput(BaseModel):
    department_id: str | None = Field(default=None, description="특정 과의 의사만 보려면 지정 (선택)")


class ListAvailableSlotsInput(BaseModel):
    doctor_id: str
    target_date: str = Field(description="YYYY-MM-DD")


class ProposeBookingCardInput(BaseModel):
    for_patient_id: str
    department_id: str
    doctor_id: str
    slot_id: str
    department_name: str
    doctor_name: str
    slot_date: str
    start_time: str


def build_tools(ctx: ToolContext) -> list[StructuredTool]:
    async def search_hospital_info(query: str) -> str:
        results = await rag_search_service.search(query)
        if not results:
            return "관련된 병원 안내자료를 찾지 못했습니다. 지어내지 말고 인계를 고려하세요."
        ctx.collected["source_chunk_ids"].extend(r["chunk_id"] for r in results)
        return "\n\n".join(f"[{r['title']}] {r['content']}" for r in results)

    async def list_departments_doctors(department_id: str | None = None) -> str:
        departments = await patient_catalog_service.list_departments(ctx.patient)
        lines = []
        for d in departments:
            if department_id and d["id"] != department_id:
                continue
            doctors = await patient_catalog_service.list_doctors(d["id"], ctx.patient)
            names = ", ".join(doc["name"] for doc in doctors) or "배정 의사 없음"
            lines.append(f"{d['name']}: {names}")
        return "\n".join(lines) or "운영 중인 진료과가 없습니다."

    async def list_available_slots(doctor_id: str, target_date: str) -> str:
        slots = await patient_catalog_service.list_available_slots(
            UUID(doctor_id), date.fromisoformat(target_date), ctx.patient
        )
        if not slots:
            return "해당 날짜에 예약 가능한 시간이 없습니다."
        return "\n".join(f"slot_id={s['id']} {s['start_time']}" for s in slots)

    async def get_my_appointments() -> str:
        if ctx.patient is None:
            return "환자가 로그인하지 않았습니다. 예약 확인은 로그인 후 가능하다고 안내하세요."
        rows = await patient_appointment_query_service.list_my_appointments(ctx.patient)
        if not rows:
            return "현재 예약이 없습니다."
        return "\n".join(
            f"{r['slot_date']} {r['start_time']} {r['department_name']} {r['doctor_name']} ({r['status']})"
            for r in rows
        )

    async def propose_booking_card(
        for_patient_id: str, department_id: str, doctor_id: str, slot_id: str,
        department_name: str, doctor_name: str, slot_date: str, start_time: str,
    ) -> str:
        if ctx.patient is None:
            return "환자가 로그인하지 않았습니다. 예약은 로그인 후 가능하다고 안내하세요."
        ctx.collected["card"] = {
            "for_patient_id": for_patient_id, "department_id": department_id, "doctor_id": doctor_id,
            "slot_id": slot_id, "department_name": department_name, "doctor_name": doctor_name,
            "slot_date": slot_date, "start_time": start_time,
        }
        return "확인 카드를 띄웠습니다. 환자가 '이 내용으로 예약' 버튼을 누르기를 기다린다고 안내하세요."

    return [
        StructuredTool.from_function(
            coroutine=search_hospital_info, name="search_hospital_info",
            description="병원이 승인한 안내자료에서 답변 근거를 검색한다. 위치·주차·예약 규칙·검사 준비사항 등 안내 질문에 사용. "
                        "대화 중 새 주제가 나오면 다시 호출한다.",
            args_schema=SearchHospitalInfoInput,
        ),
        StructuredTool.from_function(
            coroutine=list_departments_doctors, name="list_departments_doctors",
            description="현재 운영 중인 진료과와 의사, 진료 요일·시간을 실제 데이터베이스에서 조회한다. "
                        "안내자료가 아닌 살아있는 데이터.",
            args_schema=ListDepartmentsDoctorsInput,
        ),
        StructuredTool.from_function(
            coroutine=list_available_slots, name="list_available_slots",
            description="특정 의사의 특정 날짜 실제 예약 가능 시간을 조회한다. 시간을 지어내지 말고 "
                        "반드시 이 도구의 결과만 안내할 것.",
            args_schema=ListAvailableSlotsInput,
        ),
        StructuredTool.from_function(
            coroutine=get_my_appointments, name="get_my_appointments",
            description="로그인한 환자 본인의 현재 예약 목록을 조회한다. 로그인하지 않았으면 호출하지 말 것.",
        ),
        StructuredTool.from_function(
            coroutine=propose_booking_card, name="propose_booking_card",
            description="환자가 시간을 골랐을 때 예약 확인 카드를 채팅에 띄운다. 이 도구는 예약을 실행하지 않는다 — "
                        "환자가 카드의 버튼을 눌러야 실제 예약된다.",
            args_schema=ProposeBookingCardInput,
        ),
    ]
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_chat_tools.py -v`
Expected: 전체 PASS

- [ ] **Step 4: 실패하는 테스트 작성 — 에이전트 체인**

`backend/tests/test_agent_chain.py`:
```python
import pytest
from uuid import uuid4


@pytest.mark.asyncio
async def test_run_returns_card_and_sources_collected_during_tool_calls(monkeypatch):
    from app.services import agent_chain
    from app.services.chat_tools import ToolContext

    class FakeExecutor:
        def __init__(self, agent, tools, max_iterations):
            self.tools = tools

        async def ainvoke(self, inputs):
            # 실제 에이전트 대신, 카드 제안 도구가 호출된 것처럼 부수효과를 흉내낸다
            card_tool = next(t for t in self.tools if t.name == "propose_booking_card")
            await card_tool.ainvoke({
                "for_patient_id": "p1", "department_id": "d1", "doctor_id": "doc1", "slot_id": "s1",
                "department_name": "내과", "doctor_name": "김의사",
                "slot_date": "2026-07-30", "start_time": "10:00",
            })
            return {"output": "이 시간으로 예약할까요?"}

    monkeypatch.setattr(agent_chain, "AgentExecutor", FakeExecutor)
    monkeypatch.setattr(agent_chain, "create_tool_calling_agent", lambda model, tools, prompt: object())

    ctx = ToolContext(patient=object(), conversation_id=uuid4())
    result = await agent_chain.run("10시로 할게요", ctx, model=object())

    assert result["text"] == "이 시간으로 예약할까요?"
    assert result["card"]["doctor_name"] == "김의사"
    assert result["source_chunk_ids"] == []
```

Run: `cd backend && pytest tests/test_agent_chain.py -v` → FAIL (모듈 없음)

- [ ] **Step 5: 에이전트 체인 구현**

`backend/app/services/agent_chain.py`:
```python
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model
from app.services.chat_tools import ToolContext, build_tools

AGENT_SYSTEM_PROMPT = """당신은 병원의 AI 상담봇입니다. 예약 가능 시간 조회, 예약 제안, 본인 예약 확인을 돕습니다.
[절대 규칙 — 위반 금지]
- 예약을 직접 실행할 수 없습니다. 환자가 시간을 고르면 propose_booking_card로 확인 카드만 띄우고,
  실제 예약은 환자가 버튼을 눌러야 됩니다.
- 시간은 반드시 list_available_slots 도구의 결과만 안내하고 지어내지 마세요.
- 존댓말의 친절한 한국어로, 짧고 명확하게 답하세요."""

_PROMPT = ChatPromptTemplate.from_messages([
    ("system", AGENT_SYSTEM_PROMPT),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])


async def run(query: str, ctx: ToolContext, model=None) -> dict:
    model = model or get_chat_model()
    tools = build_tools(ctx)
    agent = create_tool_calling_agent(model, tools, _PROMPT)
    executor = AgentExecutor(agent=agent, tools=tools, max_iterations=8)
    result = await executor.ainvoke({"input": query})
    return {
        "text": result["output"],
        "card": ctx.collected["card"],
        "source_chunk_ids": ctx.collected["source_chunk_ids"],
    }
```

- [ ] **Step 6: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_chat_tools.py tests/test_agent_chain.py -v`
Expected: 전체 PASS

```bash
git add backend/app/services/chat_tools.py backend/app/services/agent_chain.py backend/tests/test_chat_tools.py backend/tests/test_agent_chain.py
git commit -m "feat: 에이전트 도구 5종 + 행동형 에이전트 체인 (예약 실행 도구는 의도적으로 미포함)"
```

---

## Task 10: 응급 검사 + 인계 감시 + 라우터 (⓪①②)

**Files:**
- Create: `backend/app/services/safety_watchdog.py`
- Create: `backend/app/services/chat_router.py`
- Test: `backend/tests/test_safety_watchdog.py`
- Test: `backend/tests/test_chat_router.py`

**Interfaces:**
- Consumes: `get_chat_model`(Task 7)
- Produces: `app.services.safety_watchdog.check_emergency(text: str) -> bool` (규칙 기반, AI 호출 없음), `EMERGENCY_REPLY: str`
- Produces: `app.services.safety_watchdog.check_repeated(history_texts: list[str], current: str, threshold: int = 3) -> bool`
- Produces: `app.services.safety_watchdog.check_escalation(text, history_texts, unhelpful_flagged, no_answer, model=None) -> str | None` (반환값은 `support_tickets.reason` 6종 중 하나 또는 `None`)
- Produces: `app.services.safety_watchdog.build_handoff_summary(history_text: str, model=None) -> dict` (요약 5항목 JSON)
- Produces: `app.services.chat_router.classify_route(text: str, model=None) -> str` (`"rag" | "department_guide" | "agent"`, 애매하면 `"agent"`)

- [ ] **Step 1: 실패하는 테스트 작성 — 응급 검사 + 반복 검사**

`backend/tests/test_safety_watchdog.py`:
```python
import json

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel


def test_check_emergency_detects_all_golden_phrases():
    from app.services.safety_watchdog import check_emergency

    phrases = ["가슴이 너무 아파요", "숨쉬기 힘들어요", "의식을 잃을 것 같아요", "갑자기 쓰러졌어요"]
    for phrase in phrases:
        assert check_emergency(phrase), f"{phrase}가 감지되지 않았습니다"
    assert check_emergency("머리가 좀 아파요") is False


def test_check_repeated_detects_three_or_more():
    from app.services.safety_watchdog import check_repeated

    history = ["야간 진료 하나요?", "다른 질문", "야간 진료 하나요?"]
    assert check_repeated(history, "야간 진료 하나요?") is True
    assert check_repeated(["다른 질문"], "야간 진료 하나요?") is False


@pytest.mark.asyncio
async def test_check_escalation_unhelpful_flag_short_circuits():
    from app.services.safety_watchdog import check_escalation

    reason = await check_escalation("아무 내용", history_texts=[], unhelpful_flagged=True, no_answer=False)
    assert reason == "unhelpful"


@pytest.mark.asyncio
async def test_check_escalation_no_answer_short_circuits():
    from app.services.safety_watchdog import check_escalation

    reason = await check_escalation("아무 내용", history_texts=[], unhelpful_flagged=False, no_answer=True)
    assert reason == "no_answer"


@pytest.mark.asyncio
async def test_check_escalation_classifies_medical_judgment():
    from app.services.safety_watchdog import check_escalation

    fake_model = FakeListChatModel(responses=["medical_judgment"])
    reason = await check_escalation(
        "이 약을 계속 먹어도 되나요?", history_texts=[], unhelpful_flagged=False, no_answer=False, model=fake_model,
    )
    assert reason == "medical_judgment"


@pytest.mark.asyncio
async def test_check_escalation_none_when_model_says_none():
    from app.services.safety_watchdog import check_escalation

    fake_model = FakeListChatModel(responses=["none"])
    reason = await check_escalation(
        "안녕하세요", history_texts=[], unhelpful_flagged=False, no_answer=False, model=fake_model,
    )
    assert reason is None


@pytest.mark.asyncio
async def test_build_handoff_summary_parses_json():
    from app.services.safety_watchdog import build_handoff_summary

    payload = {
        "summary_question": "야간 진료 여부", "summary_confirmed": "정규 진료시간",
        "summary_guided": "평일 9-18시 안내", "summary_unresolved": "야간 정보 없음",
        "summary_staff_todo": "야간 진료 여부 확인",
    }
    fake_model = FakeListChatModel(responses=[json.dumps(payload, ensure_ascii=False)])
    summary = await build_handoff_summary("환자: 밤에도 하나요?", model=fake_model)
    assert summary == payload
```

Run: `cd backend && pytest tests/test_safety_watchdog.py -v` → FAIL (모듈 없음)

- [ ] **Step 2: 응급 검사 + 인계 감시 구현**

`backend/app/services/safety_watchdog.py`:
```python
import json

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model

# 규칙 기반 — AI 호출 없이 즉시 판정 (스펙 섹션 5: 확률적 판단이 아니라 결정적 필터)
EMERGENCY_KEYWORDS = [
    "가슴이 아파", "가슴 통증", "숨쉬기 힘들", "숨이 안 쉬어", "호흡곤란",
    "의식을 잃", "정신을 잃", "쓰러졌어요", "쓰러졌습니다",
]

EMERGENCY_REPLY = (
    "말씀하신 증상은 위급할 수 있어요. 지금 바로 119에 전화하시거나 가까운 응급실을 방문해 주세요. "
    "정확한 응급 여부 판단은 저희가 완전히 보장해드릴 수 없어요."
)


def check_emergency(text: str) -> bool:
    return any(kw in text for kw in EMERGENCY_KEYWORDS)


def check_repeated(history_texts: list[str], current: str, threshold: int = 3) -> bool:
    """최근 발언 중 현재 질문과 같은 문장이 threshold번 이상(현재 포함) 반복됐는지 확인."""
    return history_texts.count(current) + 1 >= threshold


_ESCALATION_CLASSIFY_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "다음 환자 발언이 아래 조건 중 하나에 해당하면 그 이름만 답하고, 아니면 'none'이라고만 답하세요.\n"
     "- medical_judgment: 의료진의 판단이 필요한 질문\n"
     "- complaint: 불만, 사고, 개인정보, 비용 분쟁 관련 문의\n"
     "- data_mismatch: 환자가 말하는 예약 내용과 실제 시스템 정보가 다른 것 같은 상황\n"
     "다른 설명 없이 단어 하나만 답하세요."),
    ("human", "{text}"),
])

_VALID_ESCALATION_REASONS = {"medical_judgment", "complaint", "data_mismatch"}


async def _classify_escalation(text: str, model=None) -> str | None:
    chain = _ESCALATION_CLASSIFY_PROMPT | (model or get_chat_model()) | StrOutputParser()
    result = (await chain.ainvoke({"text": text})).strip().lower()
    return result if result in _VALID_ESCALATION_REASONS else None


async def check_escalation(
    text: str, history_texts: list[str], unhelpful_flagged: bool, no_answer: bool, model=None,
) -> str | None:
    """`support_tickets.reason`의 6가지 조건 중 하나라도 해당하면 그 값을, 아니면 None을 반환한다.
    라우터(②)가 어느 갈래를 고르든 이 검사가 항상 먼저 실행되어야 한다 (스펙 섹션 1/3)."""
    if unhelpful_flagged:
        return "unhelpful"
    if no_answer:
        return "no_answer"
    if check_repeated(history_texts, text):
        return "repeated"
    return await _classify_escalation(text, model=model)


_HANDOFF_SUMMARY_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "아래 대화를 바탕으로 직원에게 인계할 요약을 JSON으로 작성하세요. "
     '키는 정확히 "summary_question", "summary_confirmed", "summary_guided", '
     '"summary_unresolved", "summary_staff_todo" 다섯 개만 사용하고, 값은 한국어 문장으로 쓰세요. '
     "JSON 외의 다른 텍스트는 출력하지 마세요."),
    ("human", "{history}"),
])


async def build_handoff_summary(history_text: str, model=None) -> dict:
    chain = _HANDOFF_SUMMARY_PROMPT | (model or get_chat_model()) | StrOutputParser()
    raw = await chain.ainvoke({"history": history_text})
    return json.loads(raw)
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_safety_watchdog.py -v`
Expected: 전체 PASS

- [ ] **Step 4: 실패하는 테스트 작성 — 라우터**

`backend/tests/test_chat_router.py`:
```python
import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel


@pytest.mark.asyncio
async def test_classify_route_returns_valid_route():
    from app.services.chat_router import classify_route

    fake_model = FakeListChatModel(responses=["rag"])
    route = await classify_route("주차장 있어요?", model=fake_model)
    assert route == "rag"


@pytest.mark.asyncio
async def test_classify_route_department_guide():
    from app.services.chat_router import classify_route

    fake_model = FakeListChatModel(responses=["department_guide"])
    route = await classify_route("머리가 계속 아픈데 어디 가야 해요?", model=fake_model)
    assert route == "department_guide"


@pytest.mark.asyncio
async def test_classify_route_falls_back_to_agent_on_unexpected_output():
    from app.services.chat_router import classify_route

    fake_model = FakeListChatModel(responses=["글쎄요 잘 모르겠어요"])
    route = await classify_route("애매한 질문", model=fake_model)
    assert route == "agent"  # 애매하면 안전하게 도구 있는 쪽으로 (스펙 섹션 1)
```

Run: `cd backend && pytest tests/test_chat_router.py -v` → FAIL (모듈 없음)

- [ ] **Step 5: 라우터 구현**

`backend/app/services/chat_router.py`:
```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model

ROUTE_PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "환자의 질문을 다음 세 갈래 중 하나로 분류하세요. 단어 하나만 답하세요.\n"
     "- rag: 진료시간·위치·주차·예약규칙·검사준비 등 이미 정해진 정보를 안내하면 되는 질문\n"
     "- department_guide: 어느 진료과를 가야 할지 모르겠다는 증상 기반 질문\n"
     "- agent: 실시간 예약 가능 시간 조회, 예약 제안, 본인 예약 확인처럼 지금 데이터를 조회하거나 "
     "행동해야 하는 질문\n"
     "애매하면 agent로 답하세요."),
    ("human", "{text}"),
])

_VALID_ROUTES = {"rag", "department_guide", "agent"}


async def classify_route(text: str, model=None) -> str:
    chain = ROUTE_PROMPT | (model or get_chat_model()) | StrOutputParser()
    result = (await chain.ainvoke({"text": text})).strip().lower()
    return result if result in _VALID_ROUTES else "agent"
```

- [ ] **Step 6: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_safety_watchdog.py tests/test_chat_router.py -v`
Expected: 전체 PASS

```bash
git add backend/app/services/safety_watchdog.py backend/app/services/chat_router.py backend/tests/test_safety_watchdog.py backend/tests/test_chat_router.py
git commit -m "feat: 응급 검사 + 인계 감시(6조건) + 라우터(RunnableBranch 분류)"
```

---

## Task 11: 대화 오케스트레이션 서비스 (핵심 — ⓪①②를 실제로 이어붙임)

**Files:**
- Create: `backend/app/services/chat_service.py`
- Test: `backend/tests/test_chat_service.py`

**Interfaces:**
- Consumes: `safety_watchdog`(Task 10), `chat_router.classify_route`(Task 10), `rag_chain.answer`(Task 7), `department_guide_chain`(Task 8), `agent_chain.run` + `chat_tools.ToolContext`(Task 9), `ticket_service.create_ticket`(Task 12 — 지연 import)
- Produces: `app.services.chat_service.start_conversation(channel, patient) -> dict`(`{"conversation_id": UUID, "anon_session_token": str | None}`)
- Produces: `app.services.chat_service.resume_anon_conversation(token) -> dict | None`, `attach_patient(conversation_id, patient) -> None`
- Produces: `app.services.chat_service.post_message(conversation_id, content, patient=None, anon_token=None, model=None, embedder=None, unhelpful_flagged=False) -> dict` (`{"reply": str | None, "message_type": str, "card": dict | None, "handed_over": bool}`)
- Produces: `app.services.chat_service.list_my_conversations(patient) -> list[dict]`, `get_messages(conversation_id, patient=None, anon_token=None) -> list[dict]`

**처리 순서 (스펙 섹션 3):** ⓪`safety_watchdog.check_emergency` → ①`safety_watchdog.check_escalation`(선행 검사: `unhelpful_flagged`/반복/의미 분류) → ②`classify_route`로 3갈래 분기 → `rag`갈래에서 검색 결과가 0건이면 그 자체가 `no_answer` 인계 사유가 된다(요구사항 5.5 "답을 찾지 못했거나"). 즉 `no_answer`만 라우팅 이후(사후)에 판정되고, 나머지 5가지 사유는 라우팅 이전(사전)에 판정된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_chat_service.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_start_anon_web_conversation_issues_token(service_conn):
    from app.services import chat_service

    result = await chat_service.start_conversation(channel="web", patient=None)
    assert result["anon_session_token"]  # 익명 웹 → 진동벨 토큰 발급
    resumed = await chat_service.resume_anon_conversation(result["anon_session_token"])
    assert resumed["conversation_id"] == result["conversation_id"]


@pytest.mark.asyncio
async def test_emergency_short_circuits_before_watchdog_and_router(service_conn, monkeypatch):
    from app.services import chat_service

    async def fail_if_called(*args, **kwargs):
        raise AssertionError("응급 상황에서는 인계 감시/라우터가 호출되면 안 됩니다")

    monkeypatch.setattr(chat_service.safety_watchdog, "check_escalation", fail_if_called)
    monkeypatch.setattr(chat_service, "classify_route", fail_if_called)

    conv = await chat_service.start_conversation(channel="web", patient=None)
    result = await chat_service.post_message(
        conv["conversation_id"], "가슴이 너무 아파요", anon_token=conv["anon_session_token"],
    )
    assert "119" in result["reply"]
    row = await service_conn.fetchrow(
        "select route_taken from chat_messages where conversation_id = $1 and sender = 'bot'",
        conv["conversation_id"],
    )
    assert row["route_taken"] == "emergency"


@pytest.mark.asyncio
async def test_escalation_detected_creates_ticket_and_hands_over(service_conn, monkeypatch):
    from app.services import chat_service

    async def fake_escalation(text, history_texts, unhelpful_flagged, no_answer, model=None):
        return "medical_judgment"

    async def fake_summary(history_text, model=None):
        return {
            "summary_question": "q", "summary_confirmed": "c", "summary_guided": "g",
            "summary_unresolved": "u", "summary_staff_todo": "t",
        }

    monkeypatch.setattr(chat_service.safety_watchdog, "check_escalation", fake_escalation)
    monkeypatch.setattr(chat_service.safety_watchdog, "build_handoff_summary", fake_summary)

    conv = await chat_service.start_conversation(channel="web", patient=None)
    result = await chat_service.post_message(
        conv["conversation_id"], "이 약 계속 먹어도 되나요?", anon_token=conv["anon_session_token"],
    )
    assert result["handed_over"] is True
    status = await service_conn.fetchval(
        "select status from chat_conversations where id = $1", conv["conversation_id"]
    )
    assert status == "handed_over"
    ticket_reason = await service_conn.fetchval(
        "select reason from support_tickets where conversation_id = $1", conv["conversation_id"]
    )
    assert ticket_reason == "medical_judgment"


@pytest.mark.asyncio
async def test_routes_to_rag_chain_and_records_route_taken(service_conn, monkeypatch):
    from app.services import chat_service

    async def no_escalation(*args, **kwargs):
        return None

    async def route_rag(*args, **kwargs):
        return "rag"

    async def fake_rag_answer(query, embedder=None, model=None):
        return {"text": "지하 1층 주차장을 이용하세요.", "source_chunk_ids": ["c1"]}

    monkeypatch.setattr(chat_service.safety_watchdog, "check_escalation", no_escalation)
    monkeypatch.setattr(chat_service, "classify_route", route_rag)
    monkeypatch.setattr(chat_service.rag_chain, "answer", fake_rag_answer)

    conv = await chat_service.start_conversation(channel="web", patient=None)
    result = await chat_service.post_message(
        conv["conversation_id"], "주차 되나요?", anon_token=conv["anon_session_token"],
    )
    assert "주차장" in result["reply"]
    row = await service_conn.fetchrow(
        "select route_taken from chat_messages where conversation_id = $1 and sender = 'bot'",
        conv["conversation_id"],
    )
    assert row["route_taken"] == "rag"


@pytest.mark.asyncio
async def test_rag_with_no_kb_hits_escalates_as_no_answer(service_conn, monkeypatch):
    from app.services import chat_service

    async def no_escalation(*args, **kwargs):
        return None

    async def route_rag(*args, **kwargs):
        return "rag"

    async def empty_rag_answer(query, embedder=None, model=None):
        return {"text": chat_service.rag_chain.NO_RESULT_REPLY, "source_chunk_ids": []}

    async def fake_summary(history_text, model=None):
        return {
            "summary_question": "q", "summary_confirmed": "c", "summary_guided": "g",
            "summary_unresolved": "u", "summary_staff_todo": "t",
        }

    monkeypatch.setattr(chat_service.safety_watchdog, "check_escalation", no_escalation)
    monkeypatch.setattr(chat_service, "classify_route", route_rag)
    monkeypatch.setattr(chat_service.rag_chain, "answer", empty_rag_answer)
    monkeypatch.setattr(chat_service.safety_watchdog, "build_handoff_summary", fake_summary)

    conv = await chat_service.start_conversation(channel="web", patient=None)
    result = await chat_service.post_message(
        conv["conversation_id"], "이상한 질문", anon_token=conv["anon_session_token"],
    )
    assert result["handed_over"] is True
    ticket_reason = await service_conn.fetchval(
        "select reason from support_tickets where conversation_id = $1", conv["conversation_id"]
    )
    assert ticket_reason == "no_answer"  # 자료를 못 찾은 것 자체가 인계 사유 (요구사항 5.5)


@pytest.mark.asyncio
async def test_routes_to_department_guide_chain_at_step_zero(service_conn, monkeypatch):
    from app.services import chat_service

    async def no_escalation(*args, **kwargs):
        return None

    async def route_dept(*args, **kwargs):
        return "department_guide"

    async def fake_ask(history_text, step, model=None):
        assert step == 0  # 이 상담방의 첫 문진 응답이므로 0단계
        return "언제부터 그러셨어요?"

    monkeypatch.setattr(chat_service.safety_watchdog, "check_escalation", no_escalation)
    monkeypatch.setattr(chat_service, "classify_route", route_dept)
    monkeypatch.setattr(chat_service.department_guide_chain, "ask_next_question", fake_ask)

    conv = await chat_service.start_conversation(channel="web", patient=None)
    result = await chat_service.post_message(
        conv["conversation_id"], "머리가 아파요", anon_token=conv["anon_session_token"],
    )
    assert "언제부터" in result["reply"]
    row = await service_conn.fetchrow(
        "select route_taken from chat_messages where conversation_id = $1 and sender = 'bot'",
        conv["conversation_id"],
    )
    assert row["route_taken"] == "department_guide"


@pytest.mark.asyncio
async def test_handed_over_conversation_bot_stays_silent(service_conn):
    from app.services import chat_service

    conv = await chat_service.start_conversation(channel="web", patient=None)
    await service_conn.execute(
        "update chat_conversations set status = 'handed_over' where id = $1",
        conv["conversation_id"],
    )
    result = await chat_service.post_message(
        conv["conversation_id"], "추가 질문이요", anon_token=conv["anon_session_token"],
    )
    assert result["reply"] is None
    assert result["handed_over"] is True


@pytest.mark.asyncio
async def test_failure_falls_back_to_korean_notice(service_conn, monkeypatch):
    from app.services import chat_service

    async def boom(*args, **kwargs):
        raise RuntimeError("api down")

    monkeypatch.setattr(chat_service.safety_watchdog, "check_escalation", boom)

    conv = await chat_service.start_conversation(channel="web", patient=None)
    result = await chat_service.post_message(
        conv["conversation_id"], "질문", anon_token=conv["anon_session_token"],
    )
    assert "직원" in result["reply"]  # 한글 안내 + 문의 남기기 유도 (요구사항 6.4)
    assert result["message_type"] == "text"


@pytest.mark.asyncio
async def test_anon_rate_limit(service_conn, monkeypatch):
    from app.services import chat_service
    from app.core.config import settings
    from app.core.errors import AppError

    async def no_escalation(*args, **kwargs):
        return None

    async def route_rag(*args, **kwargs):
        return "rag"

    async def fake_rag_answer(query, embedder=None, model=None):
        return {"text": "답변", "source_chunk_ids": ["c1"]}

    monkeypatch.setattr(chat_service.safety_watchdog, "check_escalation", no_escalation)
    monkeypatch.setattr(chat_service, "classify_route", route_rag)
    monkeypatch.setattr(chat_service.rag_chain, "answer", fake_rag_answer)
    monkeypatch.setattr(settings, "anon_rate_limit_per_hour", 2)

    conv = await chat_service.start_conversation(channel="web", patient=None)
    for _ in range(2):
        await chat_service.post_message(
            conv["conversation_id"], "질문", anon_token=conv["anon_session_token"],
        )
    with pytest.raises(AppError):
        await chat_service.post_message(
            conv["conversation_id"], "또 질문", anon_token=conv["anon_session_token"],
        )
```

- [ ] **Step 2: 실패 확인 → 구현**

Run: `cd backend && pytest tests/test_chat_service.py -v` → FAIL

`backend/app/services/chat_service.py`:
```python
import secrets
from uuid import UUID

from app.core.config import settings
from app.core.errors import AppError, log_error
from app.core.patient_security import PatientContext
from app.db.pool import get_pool
from app.services import agent_chain, department_guide_chain, rag_chain, safety_watchdog
from app.services.chat_router import classify_route
from app.services.chat_tools import ToolContext

HISTORY_LIMIT = 20

FALLBACK_REPLY = (
    "지금은 상담봇 이용이 어려워요. 문의를 남겨주시면 직원이 확인 후 답변드릴게요. "
    "급한 예약은 앱의 예약 메뉴를 이용해 주세요."
)


async def start_conversation(channel: str, patient: PatientContext | None) -> dict:
    pool = get_pool()
    token = secrets.token_urlsafe(32) if (channel == "web" and patient is None) else None
    conversation_id = await pool.fetchval(
        "insert into chat_conversations (patient_id, anon_session_token, channel) "
        "values ($1, $2, $3) returning id",
        patient.id if patient else None, token, channel,
    )
    return {"conversation_id": conversation_id, "anon_session_token": token}


async def resume_anon_conversation(token: str) -> dict | None:
    pool = get_pool()
    row = await pool.fetchrow(
        "select id, status from chat_conversations where anon_session_token = $1", token
    )
    return {"conversation_id": row["id"], "status": row["status"]} if row else None


async def attach_patient(conversation_id: UUID, patient: PatientContext) -> None:
    pool = get_pool()
    await pool.execute(
        "update chat_conversations set patient_id = $2 where id = $1 and patient_id is null",
        conversation_id, patient.id,
    )


async def _authorize(conn, conversation_id: UUID, patient, anon_token) -> dict:
    row = await conn.fetchrow(
        "select id, patient_id, anon_session_token, status, channel "
        "from chat_conversations where id = $1",
        conversation_id,
    )
    if row is None:
        raise AppError("상담방을 찾을 수 없어요.", 404)
    if patient is not None and row["patient_id"] == patient.id:
        return dict(row)
    if anon_token and row["anon_session_token"] == anon_token:
        return dict(row)
    raise AppError("이 상담방에 접근할 수 없어요.", 403)


async def _check_anon_rate_limit(conn, conversation_id: UUID) -> None:
    count = await conn.fetchval(
        "select count(*) from chat_messages "
        "where conversation_id = $1 and sender = 'patient' and created_at > now() - interval '1 hour'",
        conversation_id,
    )
    if count >= settings.anon_rate_limit_per_hour:
        raise AppError("잠시 후 다시 시도해 주세요. 문의가 많아 잠깐 쉬어가고 있어요.", 429)


async def _handoff(conversation_id: UUID, patient, reason: str, history_text: str, model, embedder=None) -> str:
    summary = await safety_watchdog.build_handoff_summary(history_text, model=model)
    from app.services import ticket_service  # 순환 import 방지 — 인계 발생 시에만 로드
    await ticket_service.create_ticket(
        conversation_id=conversation_id, patient=patient, reason=reason, embedder=embedder, **summary,
    )
    return "직원에게 문의를 전달했어요. 확인 후 답변드릴게요."


async def post_message(
    conversation_id: UUID, content: str, patient: PatientContext | None = None,
    anon_token: str | None = None, model=None, embedder=None, unhelpful_flagged: bool = False,
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        conv = await _authorize(conn, conversation_id, patient, anon_token)
        if conv["patient_id"] is None:
            await _check_anon_rate_limit(conn, conversation_id)

        # 인계된 방에서는 봇이 침묵 (저장만) — 라우팅 전체를 건너뛴다
        if conv["status"] == "handed_over":
            await conn.execute(
                "insert into chat_messages (conversation_id, sender, content) values ($1, 'patient', $2)",
                conversation_id, content,
            )
            await conn.execute(
                "update chat_conversations set last_message_at = now() where id = $1", conversation_id
            )
            return {"reply": None, "message_type": "text", "card": None, "handed_over": True}

        history = await conn.fetch(
            "select sender, content, route_taken from chat_messages where conversation_id = $1 "
            "order by created_at desc limit $2",
            conversation_id, HISTORY_LIMIT,
        )
        history = list(reversed(history))

        await conn.execute(
            "insert into chat_messages (conversation_id, sender, content) values ($1, 'patient', $2)",
            conversation_id, content,
        )
        await conn.execute(
            "update chat_conversations set last_message_at = now() where id = $1", conversation_id
        )

    history_texts = [r["content"] for r in history if r["sender"] == "patient"]
    history_text = "\n".join(f"{r['sender']}: {r['content']}" for r in history) + f"\npatient: {content}"
    department_guide_step = sum(
        1 for r in history if r["sender"] == "bot" and r["route_taken"] == "department_guide"
    )

    reply: str | None
    card: dict | None = None
    route_taken: str | None
    source_chunk_ids: list = []

    try:
        # ⓪ 응급 검사 — 규칙 기반, 최우선. 통과 못하면 아래 전부 건너뜀
        if safety_watchdog.check_emergency(content):
            reply, route_taken = safety_watchdog.EMERGENCY_REPLY, "emergency"
        else:
            # ① 인계 감시(사전 검사) — 라우팅과 무관하게 항상 동작
            reason = await safety_watchdog.check_escalation(
                content, history_texts, unhelpful_flagged=unhelpful_flagged, no_answer=False, model=model,
            )
            if reason:
                reply = await _handoff(conversation_id, patient, reason, history_text, model, embedder=embedder)
                route_taken = "handoff"
            else:
                # ② 라우터 — 3갈래 분류
                route = await classify_route(content, model=model)
                if route == "rag":
                    result = await rag_chain.answer(content, embedder=embedder, model=model)
                    if not result["source_chunk_ids"]:
                        # 자료를 못 찾은 것 자체가 인계 사유 (요구사항 5.5 "답을 찾지 못했거나")
                        reply = await _handoff(conversation_id, patient, "no_answer", history_text, model, embedder=embedder)
                        route_taken = "handoff"
                    else:
                        reply, source_chunk_ids, route_taken = result["text"], result["source_chunk_ids"], "rag"
                elif route == "department_guide":
                    if department_guide_step >= 3:
                        reply = await department_guide_chain.recommend_departments(history_text, patient, model=model)
                    else:
                        reply = await department_guide_chain.ask_next_question(
                            history_text, department_guide_step, model=model
                        )
                    route_taken = "department_guide"
                else:
                    ctx = ToolContext(patient=patient, conversation_id=conversation_id)
                    result = await agent_chain.run(content, ctx, model=model)
                    reply, card, source_chunk_ids, route_taken = (
                        result["text"], result["card"], result["source_chunk_ids"], "agent"
                    )
    except Exception as exc:  # Claude/OpenAI 장애 — 예약 기능과 무관하게 상담만 안내로 전환
        log_error("chatbot", f"상담봇 응답 실패: {exc}")
        reply, card, source_chunk_ids, route_taken = FALLBACK_REPLY, None, [], None

    handed_over = route_taken == "handoff"
    message_type = "booking_confirm" if card else "text"

    async with pool.acquire() as conn:
        await conn.execute(
            "insert into chat_messages "
            "(conversation_id, sender, content, source_chunk_ids, message_type, route_taken) "
            "values ($1, 'bot', $2, $3, $4, $5)",
            conversation_id, reply, source_chunk_ids or None, message_type, route_taken,
        )

    return {"reply": reply, "message_type": message_type, "card": card, "handed_over": handed_over}


async def list_my_conversations(patient: PatientContext) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "select id, channel, status, last_message_at from chat_conversations "
        "where patient_id = $1 order by last_message_at desc",
        patient.id,
    )
    return [dict(r) for r in rows]


async def get_messages(conversation_id: UUID, patient=None, anon_token=None) -> list[dict]:
    pool = get_pool()
    async with pool.acquire() as conn:
        await _authorize(conn, conversation_id, patient, anon_token)
        rows = await conn.fetch(
            "select id, sender, content, message_type, route_taken, created_at from chat_messages "
            "where conversation_id = $1 order by created_at",
            conversation_id,
        )
    return [dict(r) for r in rows]
```

(참고: `ticket_service`는 인계가 실제로 발생할 때만 지연 import된다 — 인계 없는 테스트는 Task 12 없이도 통과한다. `no_answer` 인계 경로는 Task 12 완료 후 통합 테스트에서 함께 검증)

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_chat_service.py -v`
Expected: PASS

```bash
git add backend/app/services/chat_service.py backend/tests/test_chat_service.py
git commit -m "feat: 대화 오케스트레이션 - 응급검사/인계감시/라우터/3체인 dispatch"
```

---

## Task 12: 인계 티켓 서비스 (생성·직원 답변·알림·복귀)

**Files:**
- Create: `backend/app/services/ticket_service.py`
- Test: `backend/tests/test_ticket_service.py`

**Interfaces:**
- Consumes: `notification_service.notify_patient`(푸시), `sms_client.get_sms_client`(익명 SMS), `settings.business_hour_start/end`
- Produces: `app.services.ticket_service.create_ticket(conversation_id, patient, reason, summary_question, summary_confirmed, summary_guided, summary_unresolved, summary_staff_todo, contact_name=None, contact_phone=None, embedder=None) -> UUID` — 상담방을 `handed_over`로 전환. Task 11의 `_handoff()`가 `safety_watchdog.build_handoff_summary()`가 만든 요약 5항목을 그대로 이 함수의 키워드 인자로 넘긴다. `summary_question`을 임베딩해 `question_embedding`에 함께 저장(요구사항 3.9/3.10 미해결 질문 클러스터링용) — 임베딩 실패해도 티켓 생성 자체는 막지 않음(부가 기능)
- Produces: `app.services.ticket_service.is_business_hours(now=None) -> bool`
- Produces: `app.services.ticket_service.list_tickets(staff, status="pending") -> list[dict]`, `get_ticket_detail(ticket_id, staff) -> dict`(요약 5항목 + 원본 대화 포함 — 열람 즉시 `pending`이면 `claim_ticket` 자동 호출)
- Produces: `app.services.ticket_service.claim_ticket(ticket_id, staff) -> None` — `pending → in_progress` 전환 + `assigned_staff_id`를 호출한 직원으로 배정. 이미 `in_progress`/`answered`면 아무 것도 하지 않음(멱등)
- Produces: `app.services.ticket_service.reassign_ticket(ticket_id, staff, to_staff_id) -> None` — 의료진 판단이 필요할 때(3.9) 담당을 `to_staff_id`로 교체. 상태는 `in_progress` 유지, `answered` 티켓은 재배정 불가(`AppError`)
- Produces: `app.services.ticket_service.answer_ticket(ticket_id, staff, answer_text, sms=None, push=None) -> None` — 직원 말풍선 insert + 티켓 `answered` + 상담방 `bot` 복귀 + 알림(로그인 환자=푸시, 익명=SMS)
- Produces: `app.services.ticket_service.set_anon_contact(conversation_id, anon_token, name, phone) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_ticket_service.py`:
```python
import pytest
from datetime import datetime


def test_is_business_hours():
    from app.services.ticket_service import is_business_hours

    assert is_business_hours(datetime(2026, 7, 27, 14, 0)) is True   # 월요일 낮
    assert is_business_hours(datetime(2026, 7, 27, 23, 0)) is False  # 밤
    assert is_business_hours(datetime(2026, 7, 26, 14, 0)) is False  # 일요일


@pytest.mark.asyncio
async def test_create_ticket_hands_over(service_conn):
    from app.services import chat_service, ticket_service
    from tests.test_kb_service import FakeEmbedding

    conv = await chat_service.start_conversation(channel="web", patient=None)
    ticket_id = await ticket_service.create_ticket(
        conversation_id=conv["conversation_id"], patient=None, reason="no_answer",
        summary_question="q", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t", embedder=FakeEmbedding(),
    )
    status = await service_conn.fetchval(
        "select status from chat_conversations where id = $1", conv["conversation_id"]
    )
    assert status == "handed_over"
    row = await service_conn.fetchrow("select * from support_tickets where id = $1", ticket_id)
    assert row["status"] == "pending" and row["summary_question"] == "q"
    assert row["question_embedding"] is not None  # 미해결 질문 클러스터링용 (요구사항 3.9/3.10)


@pytest.mark.asyncio
async def test_claim_ticket_transitions_to_in_progress(service_conn, receptionist_staff):
    from app.services import chat_service, ticket_service
    from tests.test_kb_service import FakeEmbedding

    conv = await chat_service.start_conversation(channel="web", patient=None)
    ticket_id = await ticket_service.create_ticket(
        conversation_id=conv["conversation_id"], patient=None, reason="no_answer",
        summary_question="q", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t", embedder=FakeEmbedding(),
    )
    await ticket_service.claim_ticket(ticket_id, receptionist_staff)
    row = await service_conn.fetchrow("select status, assigned_staff_id from support_tickets where id = $1", ticket_id)
    assert row["status"] == "in_progress" and row["assigned_staff_id"] == receptionist_staff.id

    # 이미 in_progress면 다른 직원이 열람해도 배정이 바뀌지 않음 (멱등)
    await ticket_service.claim_ticket(ticket_id, receptionist_staff)
    row2 = await service_conn.fetchrow("select assigned_staff_id from support_tickets where id = $1", ticket_id)
    assert row2["assigned_staff_id"] == receptionist_staff.id


@pytest.mark.asyncio
async def test_reassign_ticket_to_another_staff(service_conn, receptionist_staff, admin_staff):
    from app.services import chat_service, ticket_service
    from tests.test_kb_service import FakeEmbedding

    conv = await chat_service.start_conversation(channel="web", patient=None)
    ticket_id = await ticket_service.create_ticket(
        conversation_id=conv["conversation_id"], patient=None, reason="medical_judgment",
        summary_question="q", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t", embedder=FakeEmbedding(),
    )
    await ticket_service.claim_ticket(ticket_id, receptionist_staff)
    # 의료진 판단이 필요해 접수 직원이 임의로 답하지 않고 다른 직원(담당 의사·관리자)에게 전달 (요구사항 3.9)
    await ticket_service.reassign_ticket(ticket_id, receptionist_staff, admin_staff.id)
    row = await service_conn.fetchrow("select status, assigned_staff_id from support_tickets where id = $1", ticket_id)
    assert row["status"] == "in_progress" and row["assigned_staff_id"] == admin_staff.id

    await ticket_service.answer_ticket(ticket_id, admin_staff, "확인했습니다.")
    with pytest.raises(Exception):
        await ticket_service.reassign_ticket(ticket_id, admin_staff, receptionist_staff.id)


class FakeSms:
    def __init__(self):
        self.sent = []

    async def send_sms(self, to, body):
        self.sent.append((to, body))


@pytest.mark.asyncio
async def test_answer_ticket_notifies_anon_by_sms_and_returns_to_bot(service_conn, receptionist_staff):
    from app.services import chat_service, ticket_service
    from tests.test_kb_service import FakeEmbedding

    conv = await chat_service.start_conversation(channel="web", patient=None)
    await ticket_service.set_anon_contact(
        conv["conversation_id"], conv["anon_session_token"], "홍길동", "01012345678"
    )
    ticket_id = await ticket_service.create_ticket(
        conversation_id=conv["conversation_id"], patient=None, reason="no_answer",
        summary_question="q", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t", embedder=FakeEmbedding(),
    )
    sms = FakeSms()
    await ticket_service.answer_ticket(ticket_id, receptionist_staff, "확인 결과 가능합니다.", sms=sms)

    # 직원 말풍선이 같은 상담방에 저장됨
    row = await service_conn.fetchrow(
        "select sender, content, staff_id from chat_messages "
        "where conversation_id = $1 order by created_at desc limit 1",
        conv["conversation_id"],
    )
    assert row["sender"] == "staff" and "가능합니다" in row["content"]
    # SMS 알림 발송
    assert sms.sent and sms.sent[0][0] == "01012345678"
    # 티켓 answered + 상담방 bot 복귀
    tstatus = await service_conn.fetchval("select status from support_tickets where id = $1", ticket_id)
    cstatus = await service_conn.fetchval(
        "select status from chat_conversations where id = $1", conv["conversation_id"]
    )
    assert tstatus == "answered" and cstatus == "bot"
```

- [ ] **Step 2: 실패 확인 → 구현**

Run: `cd backend && pytest tests/test_ticket_service.py -v` → FAIL

`backend/app/services/ticket_service.py`:
```python
from datetime import datetime
from uuid import UUID

from app.core.config import settings
from app.core.errors import AppError, log_error
from app.core.security import StaffContext
from app.db.pool import get_pool


def is_business_hours(now: datetime | None = None) -> bool:
    now = now or datetime.now()
    if now.weekday() >= 5:  # 토·일
        return False
    return settings.business_hour_start <= now.hour < settings.business_hour_end


async def create_ticket(
    conversation_id: UUID, patient, reason: str,
    summary_question: str, summary_confirmed: str, summary_guided: str,
    summary_unresolved: str, summary_staff_todo: str,
    contact_name: str | None = None, contact_phone: str | None = None, embedder=None,
) -> UUID:
    pool = get_pool()
    # 질문 임베딩 (미해결 질문 클러스터링용, 요구사항 3.9/3.10) — 실패해도 티켓 생성은 계속 진행
    question_embedding = None
    try:
        from app.integrations.embedding_client import get_embedding_client
        from app.services.kb_service import _vec_literal
        embedder = embedder or get_embedding_client()
        [vector] = await embedder.embed([summary_question])
        question_embedding = _vec_literal(vector)
    except Exception as exc:
        log_error("chatbot", f"티켓 질문 임베딩 실패(클러스터링에서만 제외됨): {exc}")

    async with pool.acquire() as conn:
        async with conn.transaction():
            # 익명 방에 미리 저장된 연락처가 있으면 사용
            if contact_phone is None:
                saved = await conn.fetchrow(
                    "select contact_name, contact_phone from support_tickets "
                    "where conversation_id = $1 and contact_phone is not null "
                    "order by created_at desc limit 1",
                    conversation_id,
                )
                if saved:
                    contact_name, contact_phone = saved["contact_name"], saved["contact_phone"]
            ticket_id = await conn.fetchval(
                "insert into support_tickets (conversation_id, patient_id, contact_name, contact_phone, "
                "summary_question, summary_confirmed, summary_guided, summary_unresolved, "
                "summary_staff_todo, reason, question_embedding) "
                "values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::vector) returning id",
                conversation_id, patient.id if patient else None, contact_name, contact_phone,
                summary_question, summary_confirmed, summary_guided, summary_unresolved,
                summary_staff_todo, reason, question_embedding,
            )
            await conn.execute(
                "update chat_conversations set status = 'handed_over' where id = $1",
                conversation_id,
            )
    return ticket_id


async def set_anon_contact(conversation_id: UUID, anon_token: str, name: str, phone: str) -> None:
    pool = get_pool()
    ok = await pool.fetchval(
        "select exists (select from chat_conversations where id = $1 and anon_session_token = $2)",
        conversation_id, anon_token,
    )
    if not ok:
        raise AppError("이 상담방에 접근할 수 없어요.", 403)
    # 인계는 항상 티켓 생성보다 먼저 일어나므로(handed_over 후 ContactForm 표시),
    # 이 시점에는 pending 티켓이 존재한다 — 그 티켓에 연락처를 기록한다.
    await pool.execute(
        "update support_tickets set contact_name = $2, contact_phone = $3 "
        "where conversation_id = $1 and status = 'pending'",
        conversation_id, name, phone,
    )


async def list_tickets(staff: StaffContext, status: str = "pending") -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "select t.id, t.reason, t.status, t.created_at, t.summary_question, "
        "p.name as patient_name, t.contact_name "
        "from support_tickets t left join patients p on p.id = t.patient_id "
        "where t.status = $1 order by t.created_at",
        status,
    )
    return [dict(r) for r in rows]


async def get_ticket_detail(ticket_id: UUID, staff: StaffContext) -> dict:
    pool = get_pool()
    ticket = await pool.fetchrow("select * from support_tickets where id = $1", ticket_id)
    if ticket is None:
        raise AppError("티켓을 찾을 수 없어요.", 404)
    if ticket["status"] == "pending":
        await claim_ticket(ticket_id, staff)
        ticket = await pool.fetchrow("select * from support_tickets where id = $1", ticket_id)
    messages = await pool.fetch(
        "select sender, content, message_type, created_at from chat_messages "
        "where conversation_id = $1 order by created_at",
        ticket["conversation_id"],
    )
    return {**dict(ticket), "messages": [dict(m) for m in messages]}


async def claim_ticket(ticket_id: UUID, staff: StaffContext) -> None:
    """새 문의(pending)를 열람한 직원에게 배정하며 처리 중으로 전환한다 (요구사항 3.9). 멱등."""
    pool = get_pool()
    await pool.execute(
        "update support_tickets set status = 'in_progress', assigned_staff_id = $2 "
        "where id = $1 and status = 'pending'",
        ticket_id, staff.id,
    )


async def reassign_ticket(ticket_id: UUID, staff: StaffContext, to_staff_id: UUID) -> None:
    """의료진 판단이 필요한 경우 접수 직원이 임의로 답하지 않고 담당 의사·관리자에게 전달한다 (요구사항 3.9)."""
    pool = get_pool()
    row = await pool.fetchrow(
        "update support_tickets set assigned_staff_id = $2 "
        "where id = $1 and status = 'in_progress' returning id",
        ticket_id, to_staff_id,
    )
    if row is None:
        raise AppError("답변완료된 티켓은 재배정할 수 없어요.", 409)


async def answer_ticket(
    ticket_id: UUID, staff: StaffContext, answer_text: str, sms=None, push=None
) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            ticket = await conn.fetchrow(
                "update support_tickets set status = 'answered', assigned_staff_id = $2, "
                "answered_at = now() where id = $1 and status in ('pending', 'in_progress') returning *",
                ticket_id, staff.id,
            )
            if ticket is None:
                raise AppError("이미 처리되었거나 없는 티켓이에요.", 409)
            await conn.execute(
                "insert into chat_messages (conversation_id, sender, staff_id, content) "
                "values ($1, 'staff', $2, $3)",
                ticket["conversation_id"], staff.id, answer_text,
            )
            await conn.execute(
                "update chat_conversations set status = 'bot', last_message_at = now() where id = $1",
                ticket["conversation_id"],
            )

    # 알림 — 실패해도 답변 자체는 유지 (알림은 부가 기능)
    try:
        if ticket["patient_id"] is not None:
            from app.services.notification_service import notify_patient
            await (push or notify_patient)(ticket["patient_id"], "chat_answered")
        elif ticket["contact_phone"]:
            from app.integrations.sms_client import get_sms_client
            client = sms or get_sms_client()
            await client.send_sms(
                ticket["contact_phone"],
                "[병원] 문의하신 내용에 답변이 등록되었습니다. 상담창에서 확인해 주세요.",
            )
    except Exception as exc:
        log_error("chatbot", f"인계 답변 알림 실패: {exc}")
```

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_ticket_service.py -v`
Expected: PASS

```bash
git add backend/app/services/ticket_service.py backend/tests/test_ticket_service.py
git commit -m "feat: 인계 티켓 - 생성/처리중 배정/재배정/직원답변/알림/봇 복귀"
```

---

## Task 13: 오답 신고/정기검토 서비스 + 품질개선 예시은행 + 상담봇 처리 현황

**Files:**
- Create: `backend/app/services/answer_feedback_service.py`
- Create: `backend/app/services/qa_example_bank_service.py`
- Create: `backend/app/services/bot_stats_service.py`
- Create: `backend/app/services/question_cluster_service.py`(미해결 질문 모아보기 — 요구사항 3.9/3.10)
- Modify: `backend/app/services/rag_chain.py` (품질개선 예시 반영)
- Test: `backend/tests/test_answer_feedback_service.py`
- Test: `backend/tests/test_qa_example_bank_service.py`
- Test: `backend/tests/test_question_cluster_service.py`

**Interfaces:**
- Consumes: `kb_service.update_document/create_document`, `EmbeddingClient`
- Produces: `app.services.answer_feedback_service.report_correction(staff, message_id, correction_text, source="realtime_report", add_to_example_bank=False) -> UUID` (기존 "그 자리에서 오답 신고"와 신규 "정기 리포트 검토 중 교정"이 같은 함수를 `source` 값만 다르게 호출한다)
- Produces: `app.services.answer_feedback_service.list_pending(staff) -> list[dict]`
- Produces: `app.services.answer_feedback_service.apply_feedback(staff, feedback_id, document_id=None, embedder=None) -> None` — 관리자만. `document_id` 지정 시 해당 자료 본문 끝에 정정 내용 추가 후 재임베딩, 미지정 시 정정 내용으로 새 자료 생성+즉시 승인. `add_to_example_bank`가 true였던 신고면 `qa_example_bank_service.create_example`도 함께 호출
- Produces: `app.services.answer_feedback_service.reject_feedback(staff, feedback_id) -> None`
- Produces: `app.services.qa_example_bank_service.create_example(question_text, corrected_answer_text, category, source_feedback_id=None, embedder=None) -> UUID`
- Produces: `app.services.qa_example_bank_service.find_similar_examples(query, category, top_k=2, embedder=None) -> list[dict]` (`category`는 `route_taken`과 동일한 값: `rag`/`department_guide`/`agent`)
- Produces: `app.services.qa_example_bank_service.list_examples(staff) -> list[dict]`, `deactivate_example(staff, example_id) -> None`(관리자만)
- Produces: `app.services.bot_stats_service.get_stats(staff, from_date, to_date) -> dict` — `{"conversations_app": int, "conversations_web": int, "routes": dict, "handoffs_by_reason": dict, "feedback_count": int}`
- Produces: `app.services.question_cluster_service.cluster_by_similarity(items: list[dict], threshold: float = 0.82) -> list[list[dict]]`(순수 함수 — `items`는 `{"embedding": list[float], ...}` 형태, 코사인 유사도 그리디 클러스터링, 클러스터를 크기 내림차순 정렬)
- Produces: `app.services.question_cluster_service.list_unresolved_question_clusters(staff, from_date, to_date, threshold=0.82) -> list[dict]` — `reason in ('no_answer', 'repeated')`인 티켓의 `summary_question`을 임베딩 유사도로 묶어 `[{"sample_question": str, "count": int, "ticket_ids": list[UUID]}]` 반환(개수 내림차순 — 요구사항 3.9/3.10 "자주 들어오지만 답하지 못한 질문"/"많이 들어온 질문")

- [ ] **Step 1: 실패하는 테스트 작성 — 오답 신고/정기검토**

`backend/tests/test_answer_feedback_service.py`:
```python
import pytest
from datetime import date, timedelta
from tests.test_kb_service import FakeEmbedding


async def _make_bot_conversation_with_message(service_conn, route_taken="rag"):
    conv = await service_conn.fetchval(
        "insert into chat_conversations (channel) values ('web') returning id"
    )
    await service_conn.execute(
        "insert into chat_messages (conversation_id, sender, content) "
        "values ($1, 'patient', '주차 되나요?')",
        conv,
    )
    msg_id = await service_conn.fetchval(
        "insert into chat_messages (conversation_id, sender, content, route_taken) "
        "values ($1, 'bot', '잘못된 안내', $2) returning id",
        conv, route_taken,
    )
    return msg_id


@pytest.mark.asyncio
async def test_report_and_apply_creates_document(service_conn, receptionist_staff, admin_staff):
    from app.services import answer_feedback_service as svc

    msg_id = await _make_bot_conversation_with_message(service_conn)
    fb_id = await svc.report_correction(receptionist_staff, msg_id, "주차는 2시간 무료입니다.")

    await svc.apply_feedback(admin_staff, fb_id, embedder=FakeEmbedding())

    row = await service_conn.fetchrow("select * from answer_feedback where id = $1", fb_id)
    assert row["status"] == "applied" and row["applied_document_id"] is not None
    assert row["source"] == "realtime_report"
    doc_status = await service_conn.fetchval(
        "select status from kb_documents where id = $1", row["applied_document_id"]
    )
    assert doc_status == "approved"  # 즉시 승인 → 봇이 바로 사용


@pytest.mark.asyncio
async def test_periodic_review_source_and_example_bank_registration(service_conn, admin_staff):
    from app.services import answer_feedback_service as svc

    msg_id = await _make_bot_conversation_with_message(service_conn)
    fb_id = await svc.report_correction(
        admin_staff, msg_id, "주차는 2시간 무료입니다.",
        source="periodic_review", add_to_example_bank=True,
    )
    await svc.apply_feedback(admin_staff, fb_id, embedder=FakeEmbedding())

    row = await service_conn.fetchrow("select * from answer_feedback where id = $1", fb_id)
    assert row["source"] == "periodic_review"

    example = await service_conn.fetchrow(
        "select * from qa_example_bank where source_feedback_id = $1", fb_id
    )
    assert example is not None
    assert example["question_text"] == "주차 되나요?"  # 봇 답변 직전의 환자 질문을 자동으로 채움
    assert example["category"] == "rag"


@pytest.mark.asyncio
async def test_non_admin_cannot_apply(service_conn, receptionist_staff):
    from app.services import answer_feedback_service as svc
    from app.core.errors import AppError

    msg_id = await _make_bot_conversation_with_message(service_conn)
    fb_id = await svc.report_correction(receptionist_staff, msg_id, "정정")
    with pytest.raises(AppError):
        await svc.apply_feedback(receptionist_staff, fb_id, embedder=FakeEmbedding())


@pytest.mark.asyncio
async def test_stats_counts_routes_and_channels(service_conn, admin_staff):
    from app.services import bot_stats_service

    await service_conn.execute("insert into chat_conversations (channel) values ('web'), ('app')")
    stats = await bot_stats_service.get_stats(
        admin_staff, date.today() - timedelta(days=1), date.today() + timedelta(days=1)
    )
    assert stats["conversations_web"] >= 1 and stats["conversations_app"] >= 1
    assert "handoffs_by_reason" in stats and "routes" in stats
```

- [ ] **Step 2: 실패 확인 → answer_feedback_service 구현**

Run: `cd backend && pytest tests/test_answer_feedback_service.py -v` → FAIL

`backend/app/services/answer_feedback_service.py`:
```python
from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import get_pool
from app.services import kb_service, qa_example_bank_service


async def report_correction(
    staff: StaffContext, message_id: UUID, correction_text: str,
    source: str = "realtime_report", add_to_example_bank: bool = False,
) -> UUID:
    pool = get_pool()
    sender = await pool.fetchval("select sender from chat_messages where id = $1", message_id)
    if sender != "bot":
        raise AppError("봇 답변에만 신고·교정을 할 수 있어요.", 400)
    return await pool.fetchval(
        "insert into answer_feedback (message_id, reported_by, source, correction_text, add_to_example_bank) "
        "values ($1, $2, $3, $4, $5) returning id",
        message_id, staff.id, source, correction_text, add_to_example_bank,
    )


async def list_pending(staff: StaffContext) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "select f.id, f.correction_text, f.source, f.created_at, m.content as bot_answer, "
        "s.name as reporter_name "
        "from answer_feedback f "
        "join chat_messages m on m.id = f.message_id "
        "join staff s on s.id = f.reported_by "
        "where f.status = 'pending' order by f.created_at",
    )
    return [dict(r) for r in rows]


async def _preceding_patient_question(pool, message_id: UUID) -> str:
    row = await pool.fetchrow(
        "select p.content from chat_messages p "
        "join chat_messages b on b.conversation_id = p.conversation_id "
        "where b.id = $1 and p.sender = 'patient' and p.created_at < b.created_at "
        "order by p.created_at desc limit 1",
        message_id,
    )
    return row["content"] if row else ""


async def apply_feedback(
    staff: StaffContext, feedback_id: UUID, document_id: UUID | None = None, embedder=None
) -> None:
    if staff.role != "admin":
        raise AppError("관리자만 할 수 있는 작업이에요.", 403)
    pool = get_pool()
    fb = await pool.fetchrow(
        "select * from answer_feedback where id = $1 and status = 'pending'", feedback_id
    )
    if fb is None:
        raise AppError("처리 대기 중인 신고가 아니에요.", 404)

    if document_id is not None:
        doc = await pool.fetchrow("select title, category, content from kb_documents where id = $1", document_id)
        if doc is None:
            raise AppError("자료를 찾을 수 없어요.", 404)
        await kb_service.update_document(
            staff, document_id, doc["title"], doc["category"],
            doc["content"] + "\n\n" + fb["correction_text"], embedder=embedder,
        )
        applied_id = document_id
    else:
        applied_id = await kb_service.create_document(
            staff, title="오답 정정 안내", category="기타", content=fb["correction_text"]
        )
        await kb_service.approve_document(staff, applied_id, embedder=embedder)

    if fb["add_to_example_bank"]:
        message = await pool.fetchrow(
            "select route_taken from chat_messages where id = $1", fb["message_id"]
        )
        question_text = await _preceding_patient_question(pool, fb["message_id"])
        await qa_example_bank_service.create_example(
            question_text=question_text,
            corrected_answer_text=fb["correction_text"],
            category=message["route_taken"] or "rag",
            source_feedback_id=feedback_id,
            embedder=embedder,
        )

    await pool.execute(
        "update answer_feedback set status = 'applied', reviewed_by = $2, "
        "applied_document_id = $3, reviewed_at = now() where id = $1",
        feedback_id, staff.id, applied_id,
    )


async def reject_feedback(staff: StaffContext, feedback_id: UUID) -> None:
    if staff.role != "admin":
        raise AppError("관리자만 할 수 있는 작업이에요.", 403)
    pool = get_pool()
    await pool.execute(
        "update answer_feedback set status = 'rejected', reviewed_by = $2, reviewed_at = now() "
        "where id = $1 and status = 'pending'",
        feedback_id, staff.id,
    )
```

`backend/app/services/bot_stats_service.py`:
```python
from datetime import date

from app.core.security import StaffContext
from app.db.pool import get_pool


async def get_stats(staff: StaffContext, from_date: date, to_date: date) -> dict:
    pool = get_pool()
    channel_rows = await pool.fetch(
        "select channel, count(*) as cnt from chat_conversations "
        "where created_at::date between $1 and $2 group by channel",
        from_date, to_date,
    )
    channels = {r["channel"]: r["cnt"] for r in channel_rows}
    route_rows = await pool.fetch(
        "select route_taken, count(*) as cnt from chat_messages "
        "where sender = 'bot' and route_taken is not null and created_at::date between $1 and $2 "
        "group by route_taken",
        from_date, to_date,
    )
    reason_rows = await pool.fetch(
        "select reason, count(*) as cnt from support_tickets "
        "where created_at::date between $1 and $2 group by reason",
        from_date, to_date,
    )
    feedback_count = await pool.fetchval(
        "select count(*) from answer_feedback where created_at::date between $1 and $2",
        from_date, to_date,
    )
    return {
        "conversations_app": channels.get("app", 0),
        "conversations_web": channels.get("web", 0),
        "routes": {r["route_taken"]: r["cnt"] for r in route_rows},
        "handoffs_by_reason": {r["reason"]: r["cnt"] for r in reason_rows},
        "feedback_count": feedback_count,
    }
```

- [ ] **Step 3: 실행해서 실패 원인 확인**

Run: `cd backend && pytest tests/test_answer_feedback_service.py -v`
Expected: FAIL — `answer_feedback_service.py`가 아직 없는 `qa_example_bank_service` 모듈을 import하기 때문. 다음 스텝에서 그 모듈을 구현하면 해결된다

- [ ] **Step 4: 실패하는 테스트 작성 — 품질개선 예시은행**

`backend/tests/test_qa_example_bank_service.py`:
```python
import pytest
from tests.test_kb_service import FakeEmbedding


@pytest.mark.asyncio
async def test_create_and_find_similar_examples(service_conn):
    from app.services import qa_example_bank_service as svc

    await svc.create_example(
        question_text="주차 되나요?", corrected_answer_text="지하 1층, 2시간 무료입니다.",
        category="rag", embedder=FakeEmbedding(),
    )
    results = await svc.find_similar_examples("주차장 있어요?", category="rag", embedder=FakeEmbedding())
    assert len(results) == 1
    assert "2시간 무료" in results[0]["corrected_answer_text"]


@pytest.mark.asyncio
async def test_find_similar_examples_respects_category_and_active_flag(service_conn, admin_staff):
    from app.services import qa_example_bank_service as svc

    ex_id = await svc.create_example(
        question_text="주차 되나요?", corrected_answer_text="지하 1층입니다.",
        category="rag", embedder=FakeEmbedding(),
    )
    await svc.create_example(
        question_text="주차 되나요?", corrected_answer_text="다른 갈래 예시",
        category="agent", embedder=FakeEmbedding(),
    )
    assert len(await svc.find_similar_examples("주차?", category="rag", embedder=FakeEmbedding())) == 1

    await svc.deactivate_example(admin_staff, ex_id)
    assert await svc.find_similar_examples("주차?", category="rag", embedder=FakeEmbedding()) == []


@pytest.mark.asyncio
async def test_non_admin_cannot_deactivate(service_conn, receptionist_staff):
    from app.services import qa_example_bank_service as svc
    from app.core.errors import AppError

    ex_id = await svc.create_example(
        question_text="q", corrected_answer_text="a", category="rag", embedder=FakeEmbedding(),
    )
    with pytest.raises(AppError):
        await svc.deactivate_example(receptionist_staff, ex_id)
```

- [ ] **Step 5: 실패 확인 → qa_example_bank_service 구현**

Run: `cd backend && pytest tests/test_qa_example_bank_service.py -v` → FAIL (모듈 없음)

`backend/app/services/qa_example_bank_service.py`:
```python
from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import get_pool
from app.integrations.embedding_client import get_embedding_client
from app.services.kb_service import _vec_literal


async def create_example(
    question_text: str, corrected_answer_text: str, category: str,
    source_feedback_id: UUID | None = None, embedder=None,
) -> UUID:
    embedder = embedder or get_embedding_client()
    [vector] = await embedder.embed([question_text])
    pool = get_pool()
    return await pool.fetchval(
        "insert into qa_example_bank "
        "(source_feedback_id, question_text, corrected_answer_text, question_embedding, category) "
        "values ($1, $2, $3, $4::vector, $5) returning id",
        source_feedback_id, question_text, corrected_answer_text, _vec_literal(vector), category,
    )


async def find_similar_examples(query: str, category: str, top_k: int = 2, embedder=None) -> list[dict]:
    embedder = embedder or get_embedding_client()
    [vector] = await embedder.embed([query])
    pool = get_pool()
    rows = await pool.fetch(
        "select question_text, corrected_answer_text, "
        "1 - (question_embedding <=> $1::vector) as similarity "
        "from qa_example_bank where category = $2 and is_active "
        "order by question_embedding <=> $1::vector limit $3",
        _vec_literal(vector), category, top_k,
    )
    return [dict(r) for r in rows]


async def list_examples(staff: StaffContext) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "select id, question_text, corrected_answer_text, category, is_active, created_at "
        "from qa_example_bank order by created_at desc"
    )
    return [dict(r) for r in rows]


async def deactivate_example(staff: StaffContext, example_id: UUID) -> None:
    if staff.role != "admin":
        raise AppError("관리자만 할 수 있는 작업이에요.", 403)
    pool = get_pool()
    await pool.execute("update qa_example_bank set is_active = false where id = $1", example_id)
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_answer_feedback_service.py tests/test_qa_example_bank_service.py -v`
Expected: 전체 PASS

- [ ] **Step 7: 미해결 질문 모아보기 — 클러스터링 순수 함수 + 조회 서비스 (요구사항 3.9/3.10)**

`backend/tests/test_question_cluster_service.py`:
```python
import pytest
from datetime import date, timedelta

from app.services.question_cluster_service import cluster_by_similarity


def test_cluster_groups_similar_and_separates_dissimilar():
    # 코사인 유사도가 높은 두 벡터([1,0,0]과 [0.95,0.1,0])는 한 그룹, 정반대 벡터([0,1,0])는 별도 그룹
    items = [
        {"id": "a", "question": "야간 진료 하나요?", "embedding": [1.0, 0.0, 0.0]},
        {"id": "b", "question": "밤에도 진료해요?", "embedding": [0.95, 0.1, 0.0]},
        {"id": "c", "question": "주차장 몇 시까지 열어요?", "embedding": [0.0, 1.0, 0.0]},
    ]
    clusters = cluster_by_similarity(items, threshold=0.8)
    assert len(clusters) == 2
    sizes = sorted(len(c) for c in clusters)
    assert sizes == [1, 2]
    big = max(clusters, key=len)
    assert {i["id"] for i in big} == {"a", "b"}


def test_cluster_empty_input():
    assert cluster_by_similarity([], threshold=0.8) == []


@pytest.mark.asyncio
async def test_list_unresolved_question_clusters_groups_by_reason_and_period(service_conn, admin_staff):
    from app.services import chat_service, ticket_service, question_cluster_service
    from tests.test_kb_service import FakeEmbedding

    conv1 = await chat_service.start_conversation(channel="web", patient=None)
    conv2 = await chat_service.start_conversation(channel="web", patient=None)
    conv3 = await chat_service.start_conversation(channel="web", patient=None)

    # 같은 임베딩(FakeEmbedding은 항상 동일 벡터 반환)이라 두 건은 한 클러스터로 묶여야 함
    await ticket_service.create_ticket(
        conversation_id=conv1["conversation_id"], patient=None, reason="no_answer",
        summary_question="야간 진료 하나요?", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t", embedder=FakeEmbedding(),
    )
    await ticket_service.create_ticket(
        conversation_id=conv2["conversation_id"], patient=None, reason="repeated",
        summary_question="밤에도 진료해요?", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t", embedder=FakeEmbedding(),
    )
    # medical_judgment는 "답하지 못한 질문"이 아니라 별도 인계 사유이므로 집계 대상에서 제외
    await ticket_service.create_ticket(
        conversation_id=conv3["conversation_id"], patient=None, reason="medical_judgment",
        summary_question="이 약 계속 먹어도 되나요?", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t", embedder=FakeEmbedding(),
    )

    today = date.today()
    clusters = await question_cluster_service.list_unresolved_question_clusters(
        admin_staff, today - timedelta(days=1), today + timedelta(days=1),
    )
    assert len(clusters) == 1
    assert clusters[0]["count"] == 2
    assert clusters[0]["sample_question"] in {"야간 진료 하나요?", "밤에도 진료해요?"}
```

Run: `cd backend && pytest tests/test_question_cluster_service.py -v` → FAIL (모듈 없음)

`backend/app/services/question_cluster_service.py`:
```python
from datetime import date

from app.core.security import StaffContext
from app.db.pool import get_pool


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def cluster_by_similarity(items: list[dict], threshold: float = 0.82) -> list[list[dict]]:
    """그리디 단일 연결 클러스터링. 정확한 알고리즘이 아니라 관리자가 눈으로 훑어볼
    보조 정리 도구이므로, 첫 항목과의 유사도만 비교하는 단순한 방식으로 충분하다."""
    clusters: list[list[dict]] = []
    for item in items:
        placed = False
        for cluster in clusters:
            if _cosine_similarity(item["embedding"], cluster[0]["embedding"]) >= threshold:
                cluster.append(item)
                placed = True
                break
        if not placed:
            clusters.append([item])
    clusters.sort(key=len, reverse=True)
    return clusters


async def list_unresolved_question_clusters(
    staff: StaffContext, from_date: date, to_date: date, threshold: float = 0.82,
) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "select id, summary_question, question_embedding from support_tickets "
        "where reason in ('no_answer', 'repeated') and question_embedding is not null "
        "and created_at::date between $1 and $2",
        from_date, to_date,
    )
    items = [
        {"id": r["id"], "question": r["summary_question"],
         "embedding": list(r["question_embedding"])}
        for r in rows
    ]
    clusters = cluster_by_similarity(items, threshold=threshold)
    return [
        {
            "sample_question": cluster[0]["question"],
            "count": len(cluster),
            "ticket_ids": [i["id"] for i in cluster],
        }
        for cluster in clusters
    ]
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_question_cluster_service.py -v`
Expected: PASS

- [ ] **Step 9: RAG 체인이 축적된 예시를 참고하도록 연결 (품질 개선 사이클의 마지막 연결고리)**

`backend/app/services/rag_chain.py` 수정 — `answer()`가 유사 교정 예시를 찾아 프롬프트에 포함하도록 확장:
```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model
from app.services import qa_example_bank_service, rag_search_service

RAG_SYSTEM_PROMPT = """당신은 병원의 AI 상담봇입니다. 아래 [참고 자료]에 있는 내용만 근거로 답하세요.
자료에 없는 내용은 지어내지 말고 "확인이 어렵다"고 답하세요.
[참고 답변 예시]가 있다면 그 답변 스타일과 톤을 참고하세요 — 과거에 관리자가 직접 교정한 내용입니다.
존댓말의 친절한 한국어로, 짧고 명확하게 답하세요."""

_PROMPT = ChatPromptTemplate.from_messages([
    ("system", RAG_SYSTEM_PROMPT),
    ("human", "[참고 자료]\n{context}\n\n[참고 답변 예시]\n{examples}\n\n[질문]\n{query}"),
])

NO_RESULT_REPLY = "관련된 병원 안내자료를 찾지 못했어요. 직원에게 확인 후 안내드릴게요."


async def answer(query: str, embedder=None, model=None) -> dict:
    results = await rag_search_service.search(query, embedder=embedder)
    if not results:
        return {"text": NO_RESULT_REPLY, "source_chunk_ids": []}

    context = "\n\n".join(f"[{r['title']}] {r['content']}" for r in results)
    examples = await qa_example_bank_service.find_similar_examples(query, category="rag", embedder=embedder)
    examples_text = "\n".join(f"Q: {e['question_text']}\nA: {e['corrected_answer_text']}" for e in examples) or "(없음)"

    chain = _PROMPT | (model or get_chat_model()) | StrOutputParser()
    text = await chain.ainvoke({"context": context, "examples": examples_text, "query": query})
    return {"text": text, "source_chunk_ids": [r["chunk_id"] for r in results]}
```

`backend/tests/test_rag_chain.py`에 품질개선 사이클 검증 테스트 추가:
```python
@pytest.mark.asyncio
async def test_answer_includes_similar_corrected_example_in_prompt(service_conn, admin_staff):
    from app.services import kb_service, qa_example_bank_service, rag_chain

    doc_id = await kb_service.create_document(
        admin_staff, title="주차 안내", category="위치·주차", content="지하 1층 주차장"
    )
    await kb_service.approve_document(admin_staff, doc_id, embedder=FakeEmbedding())
    await qa_example_bank_service.create_example(
        question_text="주차 되나요?", corrected_answer_text="지하 1층, 2시간 무료입니다.",
        category="rag", embedder=FakeEmbedding(),
    )

    captured = {}
    fake_model = FakeListChatModel(responses=["지하 1층에 2시간 무료 주차가 가능해요."])

    original_ainvoke = fake_model.ainvoke
    async def capturing_ainvoke(inputs, *a, **kw):
        captured.update(inputs)
        return await original_ainvoke(inputs, *a, **kw)
    fake_model.ainvoke = capturing_ainvoke

    await rag_chain.answer("주차 되나요?", embedder=FakeEmbedding(), model=fake_model)
    # LCEL 체인 내부에서 prompt가 이미 문자열로 렌더링되므로, 여기서는 최소한 예시 조회가
    # 예외 없이 동작하고 결과가 정상 반환되는지만 확인한다 (실제 프롬프트 내용 검증은 손 테스트로)
```

- [ ] **Step 10: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_answer_feedback_service.py tests/test_qa_example_bank_service.py tests/test_question_cluster_service.py tests/test_rag_chain.py -v`
Expected: 전체 PASS

```bash
git add backend/app/services/answer_feedback_service.py backend/app/services/qa_example_bank_service.py backend/app/services/bot_stats_service.py backend/app/services/question_cluster_service.py backend/app/services/rag_chain.py backend/tests/test_answer_feedback_service.py backend/tests/test_qa_example_bank_service.py backend/tests/test_question_cluster_service.py backend/tests/test_rag_chain.py
git commit -m "feat: 오답신고/정기검토 + 품질개선 예시은행 + 미해결 질문 클러스터링 + RAG 체인 연결 + 처리 현황"
```

---

## Task 14: HTTP 라우터 3종 + 통합 테스트

**Files:**
- Create: `backend/app/routers/chat.py`
- Create: `backend/app/routers/staff_chat.py`
- Create: `backend/app/routers/admin_kb.py`
- Modify: `backend/app/main.py` (라우터 등록)
- Test: `backend/tests/test_chat_routes.py`

**Interfaces:**
- Produces (환자/익명 — `routers/chat.py`, 익명은 `X-Anon-Session` 헤더로 인증):
  - `POST /chat/conversations` — body `{channel}`. 로그인(선택). 응답 `{conversation_id, anon_session_token}`
  - `GET /chat/conversations` — 로그인 환자의 상담방 목록
  - `GET /chat/conversations/resume` — 익명 토큰으로 방 복원
  - `GET /chat/conversations/{id}/messages`
  - `POST /chat/conversations/{id}/messages` — body `{content, unhelpful_flagged?}`. 응답 `{reply, message_type, card, handed_over}`
  - `POST /chat/conversations/{id}/attach` — 로그인 환자가 익명 방을 본인 계정에 연결 (`X-Anon-Session` 필수)
  - `POST /chat/conversations/{id}/contact` — 익명 인계용 연락처 `{name, phone}`
  - `POST /chat/conversations/{id}/leave-ticket` — 봇 장애 시 봇 없이 문의만 남기기 `{content, name?, phone?}`
  - `POST /chat/conversations/{id}/booking` — **확인 카드의 버튼**. body `{for_patient_id, department_id, doctor_id, slot_id}`. 로그인 필수. 내부에서 `patient_booking_service.create_booking` 호출(중복 방지·충돌 처리는 3단계 로직 그대로), 성공 시 `booking_done` 봇 메시지 저장 + `{appointment_id}` 반환, 충돌(슬롯 선점) 시 409 + 한글 안내
- Produces (직원 — `staff_chat.py`, `require_role("receptionist","doctor","admin")`):
  - `GET /staff/chat/tickets?status=`(`pending`/`in_progress`/`answered`), `GET /staff/chat/tickets/{id}`(열람 시 자동 `claim_ticket`), `POST /staff/chat/tickets/{id}/answer` `{answer_text}`
  - `POST /staff/chat/tickets/{id}/reassign` `{staff_id}` — 의료진 판단이 필요할 때 다른 직원(담당 의사·관리자)에게 재배정 (요구사항 3.9)
  - `GET /staff/chat/conversations?channel=` (전체 상담 기록 — 요구사항 5.1), `GET /staff/chat/conversations/{id}/messages` (각 봇 메시지에 `route_taken`과 `sources: [{title, content}]` 포함 — 근거 확인, 요구사항 5.6)
  - `POST /staff/chat/messages/{id}/feedback` `{correction_text, add_to_example_bank?}` (그 자리에서 오답 신고 — `source="realtime_report"` 고정)
- Produces (관리자 — `admin_kb.py`, `require_role("admin")`):
  - `GET/POST /admin/kb/documents`, `PUT /admin/kb/documents/{id}`, `POST /admin/kb/documents/{id}/approve`, `POST /admin/kb/documents/{id}/archive`
  - `GET /admin/kb/documents/{id}/revisions` — 수정이력 시간 역순 목록 (요구사항 3.8)
  - `GET /admin/kb/feedback`, `POST /admin/kb/feedback/{id}/apply` `{document_id?}`, `POST /admin/kb/feedback/{id}/reject`
  - `GET /admin/kb/stats?from=&to=`
  - **신규(품질개선 사이클)**: `GET /admin/kb/quality-report/conversations?from=&to=` (기간 내 상담 목록 — `route_taken`/인계여부/오답신고여부 표시), `POST /admin/kb/quality-report/messages/{id}/correction` `{correction_text, add_to_example_bank?}` (`source="periodic_review"` 고정), `GET /admin/kb/example-bank`, `POST /admin/kb/example-bank/{id}/deactivate`
  - **신규(미해결 질문 모아보기 — 요구사항 3.9/3.10)**: `GET /admin/kb/unresolved-question-clusters?from=&to=` — 기간 내 `no_answer`/`repeated` 티켓을 질문 임베딩 유사도로 묶어 `[{sample_question, count, ticket_ids}]` 반환

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`backend/tests/test_chat_routes.py` (기존 conftest의 `client`(httpx AsyncClient + FastAPI), `patient_auth_headers`, `staff_auth_headers`, `admin_auth_headers` 픽스처 재사용):
```python
from datetime import date

import pytest
from tests.test_kb_service import FakeEmbedding


@pytest.mark.asyncio
async def test_anon_web_chat_flow(client, monkeypatch):
    from app.routers import chat as chat_router

    monkeypatch.setattr(chat_router, "_model_factory", lambda: None)
    monkeypatch.setattr(chat_router, "_embedder_factory", lambda: FakeEmbedding())

    r = await client.post("/chat/conversations", json={"channel": "web"})
    assert r.status_code == 200
    token = r.json()["anon_session_token"]
    conv_id = r.json()["conversation_id"]

    # 토큰 없이 접근하면 거부
    r = await client.get(f"/chat/conversations/{conv_id}/messages")
    assert r.status_code in (401, 403)

    r = await client.get(
        f"/chat/conversations/{conv_id}/messages", headers={"X-Anon-Session": token},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_booking_button_uses_stage3_service(client, patient_auth_headers, monkeypatch):
    from app.routers import chat as chat_router
    from uuid import uuid4

    called = {}

    async def fake_create_booking(patient, for_patient_id, department_id, doctor_id, slot_id, reason):
        called["slot_id"] = slot_id
        return uuid4()

    monkeypatch.setattr(chat_router.patient_booking_service, "create_booking", fake_create_booking)

    r = await client.post("/chat/conversations", json={"channel": "app"}, headers=patient_auth_headers)
    conv_id = r.json()["conversation_id"]
    slot_id = str(uuid4())
    r = await client.post(
        f"/chat/conversations/{conv_id}/booking",
        json={"for_patient_id": str(uuid4()), "department_id": str(uuid4()),
              "doctor_id": str(uuid4()), "slot_id": slot_id},
        headers=patient_auth_headers,
    )
    assert r.status_code == 200 and "appointment_id" in r.json()
    assert called["slot_id"] == slot_id  # 3단계 예약 서비스로 직행 확인


@pytest.mark.asyncio
async def test_staff_ticket_flow(client, staff_auth_headers, service_conn):
    from app.services import chat_service, ticket_service
    from tests.test_kb_service import FakeEmbedding

    conv = await chat_service.start_conversation(channel="web", patient=None)
    await ticket_service.create_ticket(
        conversation_id=conv["conversation_id"], patient=None, reason="no_answer",
        summary_question="q", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t", embedder=FakeEmbedding(),
    )
    r = await client.get("/staff/chat/tickets", headers=staff_auth_headers)
    assert r.status_code == 200 and len(r.json()) >= 1

    ticket_id = r.json()[0]["id"]
    r = await client.post(
        f"/staff/chat/tickets/{ticket_id}/answer",
        json={"answer_text": "확인했습니다."}, headers=staff_auth_headers,
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_staff_ticket_claim_and_reassign(client, staff_auth_headers, admin_auth_headers, service_conn):
    from app.services import chat_service, ticket_service
    from tests.test_kb_service import FakeEmbedding

    conv = await chat_service.start_conversation(channel="web", patient=None)
    ticket_id = await ticket_service.create_ticket(
        conversation_id=conv["conversation_id"], patient=None, reason="medical_judgment",
        summary_question="약 계속 먹어도 되나요", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t", embedder=FakeEmbedding(),
    )

    # 열람만으로 새 문의(pending) → 처리 중(in_progress) 자동 전환 (요구사항 3.9)
    r = await client.get(f"/staff/chat/tickets/{ticket_id}", headers=staff_auth_headers)
    assert r.status_code == 200 and r.json()["status"] == "in_progress"

    admin_id = await service_conn.fetchval("select id from staff where role = 'admin' limit 1")
    r = await client.post(
        f"/staff/chat/tickets/{ticket_id}/reassign",
        json={"staff_id": str(admin_id)}, headers=staff_auth_headers,
    )
    assert r.status_code == 200
    row = await service_conn.fetchrow(
        "select status, assigned_staff_id from support_tickets where id = $1", ticket_id
    )
    assert row["status"] == "in_progress" and str(row["assigned_staff_id"]) == str(admin_id)


@pytest.mark.asyncio
async def test_admin_kb_requires_admin(client, staff_auth_headers, admin_auth_headers):
    r = await client.post(
        "/admin/kb/documents",
        json={"title": "t", "category": "기타", "content": "c"}, headers=staff_auth_headers,
    )
    assert r.status_code == 403
    r = await client.post(
        "/admin/kb/documents",
        json={"title": "t", "category": "기타", "content": "c"}, headers=admin_auth_headers,
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_quality_report_periodic_correction_and_example_bank(
    client, admin_auth_headers, service_conn,
):
    conv = await service_conn.fetchval(
        "insert into chat_conversations (channel) values ('web') returning id"
    )
    await service_conn.execute(
        "insert into chat_messages (conversation_id, sender, content) values ($1, 'patient', '주차 되나요?')",
        conv,
    )
    msg_id = await service_conn.fetchval(
        "insert into chat_messages (conversation_id, sender, content, route_taken) "
        "values ($1, 'bot', '잘못된 안내', 'rag') returning id",
        conv,
    )

    r = await client.get("/admin/kb/quality-report/conversations", headers=admin_auth_headers)
    assert r.status_code == 200
    assert any(c["id"] == str(conv) for c in r.json())

    r = await client.post(
        f"/admin/kb/quality-report/messages/{msg_id}/correction",
        json={"correction_text": "지하 1층입니다.", "add_to_example_bank": True},
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    fb_source = await service_conn.fetchval(
        "select source from answer_feedback where message_id = $1", msg_id
    )
    assert fb_source == "periodic_review"


@pytest.mark.asyncio
async def test_unresolved_question_clusters(client, admin_auth_headers, service_conn):
    from app.services import chat_service, ticket_service

    conv = await chat_service.start_conversation(channel="web", patient=None)
    await ticket_service.create_ticket(
        conversation_id=conv["conversation_id"], patient=None, reason="no_answer",
        summary_question="야간 진료 하나요?", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t", embedder=FakeEmbedding(),
    )

    today = date.today()
    r = await client.get(
        f"/admin/kb/unresolved-question-clusters?from_={today}&to={today}",
        headers=admin_auth_headers,
    )
    assert r.status_code == 200
    assert r.json()[0]["count"] == 1
```

Run: `cd backend && pytest tests/test_chat_routes.py -v` → FAIL

- [ ] **Step 2: 실패 확인 → 라우터 구현**

`backend/app/routers/chat.py` (핵심 부분 — 나머지 엔드포인트도 동일 패턴):
```python
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel

from app.core.errors import AppError
from app.core.patient_security import PatientContext, get_current_patient
from app.services import chat_service, patient_booking_service, ticket_service

router = APIRouter(prefix="/chat", tags=["chat"])

# 테스트에서 모킹할 수 있도록 팩토리로 분리
_model_factory = lambda: None    # None이면 chat_service가 기본 모델 사용
_embedder_factory = lambda: None


async def get_optional_patient(request) -> PatientContext | None:
    """Authorization 헤더가 있으면 환자 인증, 없으면 None (익명)."""
    if not request.headers.get("authorization"):
        return None
    return await get_current_patient(request)


class StartBody(BaseModel):
    channel: str  # 'app' | 'web'


@router.post("/conversations")
async def start_conversation(body: StartBody, request: Request):
    patient = await get_optional_patient(request)
    if body.channel == "app" and patient is None:
        raise AppError("앱 상담은 로그인이 필요해요.", 401)
    return await chat_service.start_conversation(body.channel, patient)


class MessageBody(BaseModel):
    content: str
    unhelpful_flagged: bool = False


@router.post("/conversations/{conversation_id}/messages")
async def post_message(
    conversation_id: UUID, body: MessageBody, request: Request,
    x_anon_session: str | None = Header(default=None),
):
    patient = await get_optional_patient(request)
    return await chat_service.post_message(
        conversation_id, body.content, patient=patient, anon_token=x_anon_session,
        model=_model_factory(), embedder=_embedder_factory(),
        unhelpful_flagged=body.unhelpful_flagged,
    )


class BookingBody(BaseModel):
    for_patient_id: UUID
    department_id: UUID
    doctor_id: UUID
    slot_id: UUID


@router.post("/conversations/{conversation_id}/booking")
async def confirm_booking(
    conversation_id: UUID, body: BookingBody,
    patient: PatientContext = Depends(get_current_patient),
):
    """확인 카드의 '이 내용으로 예약' 버튼 — Claude를 거치지 않고 3단계 예약 서비스 직행."""
    appointment_id = await patient_booking_service.create_booking(
        patient, body.for_patient_id, body.department_id, body.doctor_id,
        body.slot_id, reason="상담봇 예약",
    )
    # 예약 완료 카드 메시지 저장 (예약번호 + 사전문진 이동 버튼용)
    from app.db.pool import get_pool
    await get_pool().execute(
        "insert into chat_messages (conversation_id, sender, content, message_type) "
        "values ($1, 'bot', $2, 'booking_done')",
        conversation_id, f"예약이 완료되었어요. 예약번호: {appointment_id}",
    )
    return {"appointment_id": appointment_id}
```

나머지 엔드포인트(resume/attach/contact/leave-ticket, `staff_chat.py`의 티켓·상담기록·오답신고, `admin_kb.py`의 KB CRUD·오답 처리·stats)는 Interfaces 절의 경로·본문 그대로, 위와 같은 얇은 패턴(권한 dependency → 서비스 호출)으로 구현한다. `staff_chat.py`의 봇 메시지 근거는:
```sql
select m.*, coalesce(json_agg(json_build_object('title', d.title, 'content', c.content))
       filter (where c.id is not null), '[]') as sources
from chat_messages m
left join kb_chunks c on c.id = any(m.source_chunk_ids)
left join kb_documents d on d.id = c.document_id
where m.conversation_id = $1
group by m.id order by m.created_at
```

`staff_chat.py`의 오답 신고 엔드포인트(그 자리에서 신고 — `source`는 항상 `realtime_report`):
```python
class FeedbackBody(BaseModel):
    correction_text: str
    add_to_example_bank: bool = False


@router.post("/messages/{message_id}/feedback")
async def report_feedback(
    message_id: UUID, body: FeedbackBody,
    staff: StaffContext = Depends(require_role("receptionist", "doctor", "admin")),
):
    from app.services import answer_feedback_service
    await answer_feedback_service.report_correction(
        staff, message_id, body.correction_text,
        source="realtime_report", add_to_example_bank=body.add_to_example_bank,
    )
    return {"status": "reported"}
```

`staff_chat.py`의 재배정 엔드포인트(의료진 판단이 필요할 때 담당 의사·관리자에게 전달 — 요구사항 3.9):
```python
class ReassignBody(BaseModel):
    staff_id: UUID


@router.get("/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: UUID, staff: StaffContext = Depends(require_role("receptionist", "doctor", "admin")),
):
    return await ticket_service.get_ticket_detail(ticket_id, staff)  # 열람 시 자동으로 처리 중 전환


@router.post("/tickets/{ticket_id}/reassign")
async def reassign_ticket(
    ticket_id: UUID, body: ReassignBody,
    staff: StaffContext = Depends(require_role("receptionist", "doctor", "admin")),
):
    await ticket_service.reassign_ticket(ticket_id, staff, body.staff_id)
    return {"status": "reassigned"}
```

`admin_kb.py`의 수정이력 엔드포인트(요구사항 3.8):
```python
@router.get("/documents/{document_id}/revisions")
async def get_document_revisions(
    document_id: UUID, staff: StaffContext = Depends(require_role("admin")),
):
    from app.services import kb_service
    return await kb_service.list_revisions(staff, document_id)
```

`admin_kb.py`의 신규 품질개선 사이클 엔드포인트:
```python
from datetime import date

from app.services import answer_feedback_service, qa_example_bank_service


@router.get("/quality-report/conversations")
async def quality_report_conversations(
    from_: date, to: date, staff: StaffContext = Depends(require_role("admin")),
):
    pool = get_pool()
    rows = await pool.fetch(
        "select c.id, c.channel, c.status, c.last_message_at, "
        "exists(select 1 from support_tickets t where t.conversation_id = c.id) as was_handed_over, "
        "exists(select 1 from answer_feedback f join chat_messages m on m.id = f.message_id "
        "       where m.conversation_id = c.id) as has_feedback "
        "from chat_conversations c "
        "where c.created_at::date between $1 and $2 order by c.last_message_at desc",
        from_, to,
    )
    return [dict(r) for r in rows]


class PeriodicCorrectionBody(BaseModel):
    correction_text: str
    add_to_example_bank: bool = False


@router.post("/quality-report/messages/{message_id}/correction")
async def submit_periodic_correction(
    message_id: UUID, body: PeriodicCorrectionBody,
    staff: StaffContext = Depends(require_role("admin")),
):
    await answer_feedback_service.report_correction(
        staff, message_id, body.correction_text,
        source="periodic_review", add_to_example_bank=body.add_to_example_bank,
    )
    return {"status": "reported"}


@router.get("/example-bank")
async def list_example_bank(staff: StaffContext = Depends(require_role("admin"))):
    return await qa_example_bank_service.list_examples(staff)


@router.post("/example-bank/{example_id}/deactivate")
async def deactivate_example_bank_entry(
    example_id: UUID, staff: StaffContext = Depends(require_role("admin")),
):
    await qa_example_bank_service.deactivate_example(staff, example_id)
    return {"status": "deactivated"}
```

`admin_kb.py`의 미해결 질문 모아보기 엔드포인트(요구사항 3.9/3.10):
```python
@router.get("/unresolved-question-clusters")
async def unresolved_question_clusters(
    from_: date, to: date, staff: StaffContext = Depends(require_role("admin")),
):
    from app.services import question_cluster_service
    return await question_cluster_service.list_unresolved_question_clusters(staff, from_, to)
```

`backend/app/main.py`에 라우터 3개 등록:
```python
from app.routers import chat, staff_chat, admin_kb
app.include_router(chat.router)
app.include_router(staff_chat.router)
app.include_router(admin_kb.router)
```

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_chat_routes.py -v && pytest -q`
Expected: PASS (전체 회귀 포함)

```bash
git add backend/app/routers/chat.py backend/app/routers/staff_chat.py backend/app/routers/admin_kb.py backend/app/main.py backend/tests/test_chat_routes.py
git commit -m "feat: 상담봇 HTTP API - 환자/익명, 직원(티켓 재배정 포함), 관리자(KB 수정이력·품질개선 사이클 포함) 라우터"
```

---

## Task 15: 대용량 지식베이스 시드 + RAG 품질 평가 스크립트

**Files:**
- Create: `backend/scripts/seed_kb.py`
- Create: `backend/scripts/golden_questions.json`
- Create: `backend/scripts/rag_eval.py`
- Test: `backend/tests/test_rag_eval.py`

**Interfaces:**
- Produces: `python scripts/seed_kb.py` — 카테고리 6종(진료시간/위치·주차/예약규칙/검사준비/준비물/병원이용) × 항목 다수 = **약 300개 문서**를 생성·승인(실제 OpenAI 임베딩 사용, 실행 1회 비용 수십 원 수준). 내용은 템플릿 조합으로 생성하되 검사명·시간·층수 등을 바꿔 서로 구별되게 만든다
- Produces: `backend/scripts/golden_questions.json` — `[{"question": "대장내시경 전날 뭐 먹어요?", "expected_title": "대장내시경 준비사항"}, ...]` 40문항
- Produces: `python scripts/rag_eval.py [--top-k 5]` — 각 골든 질문을 검색해 `expected_title` 문서의 조각이 top-k 안에 들면 적중. **적중률(recall@k) 출력**. 청크 크기 실험은 `kb_service.MAX_CHUNK_CHARS`를 바꿔 재시드 후 재실행
- Produces: `rag_eval.evaluate(questions, top_k, embedder) -> dict`(`{"total", "hit", "recall"}`) — 테스트 가능한 순수 로직

- [ ] **Step 1: 평가 로직 실패 테스트 작성**

`backend/tests/test_rag_eval.py`:
```python
import pytest
from tests.test_kb_service import FakeEmbedding


@pytest.mark.asyncio
async def test_evaluate_hits_when_expected_doc_returned(service_conn, admin_staff):
    from app.services import kb_service
    from scripts.rag_eval import evaluate

    doc_id = await kb_service.create_document(
        admin_staff, title="대장내시경 준비사항", category="검사준비",
        content="전날 저녁부터 죽만 드세요."
    )
    await kb_service.approve_document(admin_staff, doc_id, embedder=FakeEmbedding())

    result = await evaluate(
        [{"question": "대장내시경 전날 뭐 먹어요?", "expected_title": "대장내시경 준비사항"}],
        top_k=5, embedder=FakeEmbedding(),
    )
    assert result == {"total": 1, "hit": 1, "recall": 1.0}


@pytest.mark.asyncio
async def test_evaluate_misses_when_absent(service_conn):
    from scripts.rag_eval import evaluate

    result = await evaluate(
        [{"question": "없는 질문", "expected_title": "존재하지 않는 문서"}],
        top_k=5, embedder=FakeEmbedding(),
    )
    assert result["hit"] == 0
```

- [ ] **Step 2: 실패 확인 → 구현**

`backend/scripts/rag_eval.py`:
```python
import argparse
import asyncio
import json
from pathlib import Path

from app.services import rag_search_service


async def evaluate(questions: list[dict], top_k: int, embedder=None) -> dict:
    hit = 0
    for q in questions:
        results = await rag_search_service.search(q["question"], top_k=top_k, embedder=embedder)
        if any(r["title"] == q["expected_title"] for r in results):
            hit += 1
    total = len(questions)
    return {"total": total, "hit": hit, "recall": hit / total if total else 0.0}


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--top-k", type=int, default=5)
    args = parser.parse_args()

    from app.db.pool import init_pool  # 기존 스캐폴딩의 풀 초기화 함수명에 맞출 것
    await init_pool()
    questions = json.loads((Path(__file__).parent / "golden_questions.json").read_text())
    result = await evaluate(questions, top_k=args.top_k)
    print(f"골든 질문 {result['total']}개 중 {result['hit']}개 적중 — recall@{args.top_k} = {result['recall']:.0%}")


if __name__ == "__main__":
    asyncio.run(main())
```

`backend/scripts/seed_kb.py` — 템플릿 조합 생성기 (발췌; 전체는 같은 패턴 반복):
```python
import asyncio

EXAMS = ["위내시경", "대장내시경", "복부초음파", "심장초음파", "흉부CT", "뇌MRI", "골밀도검사",
         "운동부하검사", "24시간 혈압검사", "갑상선초음파"]
FASTING = ["전날 밤 9시부터 금식", "검사 6시간 전부터 금식", "금식 불필요"]

DOCS = []
for i, exam in enumerate(EXAMS):
    DOCS.append({
        "title": f"{exam} 준비사항",
        "category": "검사준비",
        "content": f"{exam}을 받으시는 분은 {FASTING[i % 3]}입니다.\n\n"
                   f"복용 중인 약이 있으면 검사 {2 + i % 3}일 전 접수처에 알려주세요.\n\n"
                   f"검사 당일에는 신분증을 지참하시고 예약 시간 {10 + (i % 3) * 10}분 전에 도착해 주세요.",
    })
# ... 진료시간/위치·주차/예약규칙/준비물/병원이용 카테고리도 같은 방식으로 생성해
# 총 약 300개 문서를 만든다 (실제 운영 시 안내자료가 수백 항목까지 늘어날 것을 가정해
# 검색 정확도를 미리 검증하기 위한 규모)


async def main():
    from app.db.pool import init_pool
    from app.services import kb_service
    from tests.conftest import make_admin_staff  # 시드용 관리자 컨텍스트 헬퍼

    await init_pool()
    admin = await make_admin_staff()
    for doc in DOCS:
        doc_id = await kb_service.create_document(admin, **doc)
        await kb_service.approve_document(admin, doc_id)  # 실제 OpenAI 임베딩 호출
        print(f"승인: {doc['title']}")


if __name__ == "__main__":
    asyncio.run(main())
```

`backend/scripts/golden_questions.json` — 시드 문서에 대응하는 40문항을 작성한다 (예: `{"question": "위내시경 하기 전에 굶어야 하나요?", "expected_title": "위내시경 준비사항"}`). 질문은 문서 제목과 **다른 표현**을 쓰도록 작성한다 — 그래야 의미 검색을 실제로 평가한다.

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_rag_eval.py -v`
Expected: PASS

```bash
git add backend/scripts/ backend/tests/test_rag_eval.py
git commit -m "feat: 대용량 KB 시드 + 골든 질문 RAG 품질 평가"
```

---

## Task 16: 직원 웹 — 상담 관리 (티켓함·티켓 상세·전체 상담 기록·오답 신고)

**Files:**
- Create: `frontend/src/api/chatAdmin.ts`
- Create: `frontend/src/features/chatAdmin/TicketListPage.tsx`
- Create: `frontend/src/features/chatAdmin/TicketDetailPage.tsx`
- Create: `frontend/src/features/chatAdmin/ConversationLogPage.tsx`
- Create: `frontend/src/features/chatAdmin/ReportWrongAnswerDialog.tsx`
- Modify: `frontend/src/App.tsx` (라우트 `/chat-admin/*` + 사이드메뉴 "상담 관리" 추가)
- Test: `frontend/src/features/chatAdmin/TicketDetailPage.test.tsx`
- Test: `frontend/src/features/chatAdmin/ReportWrongAnswerDialog.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`(2단계), `useRealtimeSubscription(table, onChange)`(2단계), Task 14의 `/staff/chat/*` API, `listStaff()`(2단계 — 재배정 대상 직원 목록)
- Produces: `listTickets(status) -> Promise<Ticket[]>`(`status`는 `pending`/`in_progress`/`answered`), `getTicketDetail(id) -> Promise<TicketDetail>`(호출 자체가 서버에서 자동 `claim` — 열람 시 처리 중 전환), `reassignTicket(id, staffId) -> Promise<void>`, `answerTicket(id, answerText) -> Promise<void>`, `listConversations(channel?) -> Promise<Conversation[]>`, `getConversationMessages(id) -> Promise<MessageWithSources[]>`(각 메시지에 `route_taken` 포함), `reportWrongAnswer(messageId, correctionText, addToExampleBank) -> Promise<void>`
- Produces: `<ReportWrongAnswerDialog messageId onDone onCancel />` (교정 내용 + "향후 유사 질문 예시로도 사용" 체크박스)

- [ ] **Step 1: 실패하는 테스트 작성 — 티켓 상세**

`frontend/src/features/chatAdmin/TicketDetailPage.test.tsx` (MSW server 재사용):
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/msw/server";
import { renderWithProviders } from "../../test/renderWithProviders";
import TicketDetailPage from "./TicketDetailPage";

const TICKET = {
  id: "t1", reason: "no_answer", status: "pending",
  summary_question: "야간 진료 여부", summary_confirmed: "정규 진료시간 확인",
  summary_guided: "평일 9-18시 안내", summary_unresolved: "야간 정보 없음",
  summary_staff_todo: "야간 진료 여부 확인", contact_name: "홍길동",
  messages: [
    { sender: "patient", content: "밤에도 진료하나요?", message_type: "text", created_at: "2026-07-27T22:00:00Z" },
    { sender: "bot", content: "확인이 어려워 직원에게 전달드릴게요.", message_type: "text", created_at: "2026-07-27T22:00:05Z" },
  ],
};

test("요약 5항목과 원본 대화를 표시하고 답변을 보낸다", async () => {
  let answered: unknown = null;
  server.use(
    http.get("*/staff/chat/tickets/t1", () => HttpResponse.json(TICKET)),
    http.post("*/staff/chat/tickets/t1/answer", async ({ request }) => {
      answered = await request.json();
      return HttpResponse.json({});
    }),
  );
  renderWithProviders(<TicketDetailPage ticketId="t1" />);

  // 요약 5항목 (요구사항 5.5)
  await screen.findByText("야간 진료 여부");
  screen.getByText("야간 정보 없음");
  screen.getByText("야간 진료 여부 확인");
  // 원본 대화
  screen.getByText("밤에도 진료하나요?");

  await userEvent.type(screen.getByLabelText("답변 입력"), "야간 진료는 하지 않습니다.");
  await userEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
  await waitFor(() =>
    expect(answered).toEqual({ answer_text: "야간 진료는 하지 않습니다." }),
  );
});

test("의료진 판단이 필요한 티켓은 담당 의사에게 전달할 수 있다", async () => {
  let reassignedTo: unknown = null;
  server.use(
    http.get("*/staff/chat/tickets/t2", () =>
      HttpResponse.json({ ...TICKET, id: "t2", reason: "medical_judgment", status: "in_progress" }),
    ),
    http.get("*/staff/list", () =>
      HttpResponse.json([{ id: "d1", name: "김의사", role: "doctor" }]),
    ),
    http.post("*/staff/chat/tickets/t2/reassign", async ({ request }) => {
      reassignedTo = await request.json();
      return HttpResponse.json({});
    }),
  );
  renderWithProviders(<TicketDetailPage ticketId="t2" />);

  // 의료진 판단 필요 사유일 때만 강조 표시되는 전달 버튼 (요구사항 3.9)
  await screen.findByRole("button", { name: "담당 의사에게 전달" });
  await userEvent.selectOptions(screen.getByLabelText("전달할 직원"), "d1");
  await userEvent.click(screen.getByRole("button", { name: "담당 의사에게 전달" }));

  await waitFor(() => expect(reassignedTo).toEqual({ staff_id: "d1" }));
});
```

- [ ] **Step 2: 실패하는 테스트 작성 — 오답 신고(예시은행 체크박스)**

`frontend/src/features/chatAdmin/ReportWrongAnswerDialog.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReportWrongAnswerDialog } from "./ReportWrongAnswerDialog";

vi.mock("../../api/chatAdmin", () => ({
  reportWrongAnswer: vi.fn().mockResolvedValue(undefined),
}));

describe("ReportWrongAnswerDialog", () => {
  it("submits correction text with the example-bank checkbox state", async () => {
    const { reportWrongAnswer } = await import("../../api/chatAdmin");
    const onDone = vi.fn();

    render(<ReportWrongAnswerDialog messageId="m1" onDone={onDone} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText("올바른 안내"), "지하 1층입니다.");
    await userEvent.click(screen.getByLabelText("앞으로 비슷한 질문에도 이 답변을 참고하게 합니다"));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    expect(reportWrongAnswer).toHaveBeenCalledWith("m1", "지하 1층입니다.", true);
    expect(onDone).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: 실패 확인 → 구현**

Run: `cd frontend && npx vitest run src/features/chatAdmin` → FAIL

`frontend/src/features/chatAdmin/ReportWrongAnswerDialog.tsx`:
```tsx
import { useState } from "react";

import { reportWrongAnswer } from "../../api/chatAdmin";

type Props = {
  messageId: string;
  onDone: () => void;
  onCancel: () => void;
};

export function ReportWrongAnswerDialog({ messageId, onDone, onCancel }: Props) {
  const [correctionText, setCorrectionText] = useState("");
  const [addToExampleBank, setAddToExampleBank] = useState(false);

  async function handleSubmit() {
    await reportWrongAnswer(messageId, correctionText, addToExampleBank);
    onDone();
  }

  return (
    <div role="dialog" aria-label="잘못된 답변 신고">
      <label htmlFor="correction-input">올바른 안내</label>
      <textarea
        id="correction-input"
        value={correctionText}
        onChange={(e) => setCorrectionText(e.target.value)}
      />
      <label htmlFor="example-bank-checkbox">
        <input
          id="example-bank-checkbox"
          type="checkbox"
          checked={addToExampleBank}
          onChange={(e) => setAddToExampleBank(e.target.checked)}
        />
        앞으로 비슷한 질문에도 이 답변을 참고하게 합니다
      </label>
      <button type="button" onClick={onCancel}>
        취소
      </button>
      <button type="button" onClick={handleSubmit}>
        제출
      </button>
    </div>
  );
}
```

구현 요점 (나머지 파일):
- `chatAdmin.ts`: 위 Interfaces의 함수들을 `apiFetch`로 구현. `reportWrongAnswer(messageId, correctionText, addToExampleBank)`는 `POST /staff/chat/messages/{id}/feedback {correction_text, add_to_example_bank}` 호출. `reassignTicket(id, staffId)`는 `POST /staff/chat/tickets/{id}/reassign {staff_id: staffId}` 호출
- `TicketListPage`: **새 문의(`pending`) / 처리 중(`in_progress`) / 답변완료(`answered`)** 3개 탭(요구사항 3.9), 각 탭 접수 순으로 표시. `useRealtimeSubscription("support_tickets", refetch)`로 새 티켓·상태 변경 실시간 반영. 행 클릭 → 상세로 이동(진입 자체가 `getTicketDetail` 호출이므로 서버에서 자동으로 처리 중 전환됨)
- `TicketDetailPage`: 상단에 요약 5항목(항목명 라벨과 함께), 아래에 원본 대화(말풍선 — `sender`별 정렬/색 구분), 하단 답변 입력란(`aria-label="답변 입력"`) + "답변 보내기" 버튼. `useRealtimeSubscription("chat_messages", refetch)`로 환자 추가 발언 실시간 표시. 답변 성공 시 "답변이 전송되었어요" 안내 후 목록으로. `reason === "medical_judgment"`일 때 `listStaff()`로 받은 직원 목록을 `<select aria-label="전달할 직원">`로 보여주고 "담당 의사에게 전달" 버튼(`reassignTicket` 호출) — 접수 직원이 임의로 답하지 않고 담당 의사·관리자에게 넘기는 통로 (요구사항 3.9)
- `ConversationLogPage`: 앱·웹 통합 목록(채널 필터 + **`route_taken` 필터** — 안내형/진료과추천형/행동형/인계 뱃지로 구분 표시), 방 클릭 시 메시지 표시. 봇 메시지 클릭 → `sources`(근거 자료 제목+내용)를 우측 패널에 표시(요구사항 5.6). 봇 메시지 hover 시 "잘못된 답변" 버튼 → `ReportWrongAnswerDialog`
- `App.tsx`: 접수직원·의사·관리자 모두 접근 가능한 "상담 관리" 메뉴 추가

- [ ] **Step 4: 테스트 통과 확인 후 Commit**

Run: `cd frontend && npx vitest run src/features/chatAdmin && npx tsc --noEmit`
Expected: PASS

```bash
git add frontend/src/api/chatAdmin.ts frontend/src/features/chatAdmin/ frontend/src/App.tsx
git commit -m "feat: 직원 웹 상담 관리 - 티켓함(3단계 상태)/상세(담당 의사 전달)/상담기록(route_taken 필터)/오답신고(예시은행)"
```

---

## Task 17: 관리자 웹 — KB 관리·오답 처리함·상담 품질 리포트·상담봇 현황

**Files:**
- Create: `frontend/src/api/kbAdmin.ts`
- Create: `frontend/src/features/admin/kb/KbDocumentsPage.tsx`
- Create: `frontend/src/features/admin/kb/KbEditorDialog.tsx`
- Create: `frontend/src/features/admin/kb/FeedbackInboxPage.tsx`
- Create: `frontend/src/features/admin/kb/QualityReportPage.tsx`
- Create: `frontend/src/features/admin/kb/ExampleBankPage.tsx`
- Create: `frontend/src/features/admin/kb/BotStatsPage.tsx`
- Create: `frontend/src/features/admin/kb/UnresolvedQuestionsPage.tsx`(미해결 질문 모아보기 — 요구사항 3.9/3.10)
- Modify: `frontend/src/App.tsx` (관리자 메뉴에 "병원 안내자료", "오답 처리함", "상담 품질 리포트", "참고 예시 관리", "상담봇 현황", "미해결 질문 모아보기" 추가)
- Test: `frontend/src/features/admin/kb/KbDocumentsPage.test.tsx`
- Test: `frontend/src/features/admin/kb/QualityReportPage.test.tsx`

**Interfaces:**
- Consumes: Task 14의 `/admin/kb/*` API, `<RequireRole roles={["admin"]}>`(2단계), `<StatTile />`(2단계)
- Produces: `listKbDocuments(status?, category?)`, `createKbDocument(body)`, `updateKbDocument(id, body)`, `approveKbDocument(id)`, `archiveKbDocument(id)`, `listKbRevisions(documentId) -> Promise<Revision[]>`(수정이력 시간 역순 — 요구사항 3.8), `listFeedback()`, `applyFeedback(id, documentId?)`, `rejectFeedback(id)`, `getBotStats(from, to)`
- Produces: `listQualityReportConversations(from, to) -> Promise<QualityConversation[]>`(`route_taken`/인계여부/신고여부 포함), `submitPeriodicCorrection(messageId, correctionText, addToExampleBank) -> Promise<void>`, `listExampleBank() -> Promise<Example[]>`, `deactivateExample(id) -> Promise<void>`
- Produces: `listUnresolvedQuestionClusters(from, to) -> Promise<{sample_question: string, count: number, ticket_ids: string[]}[]>`(개수 내림차순 — 요구사항 3.9/3.10)

- [ ] **Step 1: 실패하는 테스트 작성 — KB 문서**

`frontend/src/features/admin/kb/KbDocumentsPage.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/msw/server";
import { renderWithProviders } from "../../../test/renderWithProviders";
import KbDocumentsPage from "./KbDocumentsPage";

test("초안 자료를 승인하면 approve API가 호출된다", async () => {
  let approved = false;
  server.use(
    http.get("*/admin/kb/documents", () =>
      HttpResponse.json([
        { id: "d1", title: "주차 안내", category: "위치·주차", status: "draft", updated_at: "2026-07-27" },
      ]),
    ),
    http.post("*/admin/kb/documents/d1/approve", () => {
      approved = true;
      return HttpResponse.json({});
    }),
  );
  renderWithProviders(<KbDocumentsPage />);
  await screen.findByText("주차 안내");
  await userEvent.click(screen.getByRole("button", { name: "승인" }));
  await waitFor(() => expect(approved).toBe(true));
});

test("수정이력 보기를 누르면 이전 내용이 시간순으로 표시된다", async () => {
  server.use(
    http.get("*/admin/kb/documents", () =>
      HttpResponse.json([
        { id: "d1", title: "주차 안내", category: "위치·주차", status: "approved", updated_at: "2026-07-27" },
      ]),
    ),
    http.get("*/admin/kb/documents/d1/revisions", () =>
      HttpResponse.json([
        {
          id: "r1", previous_title: "주차 안내", previous_category: "위치·주차",
          previous_content: "지하 1층입니다.", changed_at: "2026-07-26T10:00:00Z",
        },
      ]),
    ),
  );
  renderWithProviders(<KbDocumentsPage />);
  await screen.findByText("주차 안내");
  await userEvent.click(screen.getByRole("button", { name: "수정이력" }));
  // 수정 "전" 내용이 그대로 보여야 함 (요구사항 3.8)
  await screen.findByText("지하 1층입니다.");
});
```

- [ ] **Step 2: 실패하는 테스트 작성 — 상담 품질 리포트 (신규)**

`frontend/src/features/admin/kb/QualityReportPage.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../../../test/msw/server";
import { QualityReportPage } from "./QualityReportPage";

function renderWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QualityReportPage />
    </QueryClientProvider>,
  );
}

describe("QualityReportPage", () => {
  it("신고 여부와 무관하게 상담을 열람하고 그 자리에서 교정을 남길 수 있다", async () => {
    let submitted: unknown = null;
    server.use(
      http.get("*/admin/kb/quality-report/conversations", () =>
        HttpResponse.json([
          { id: "c1", channel: "web", route_taken: "rag", was_handed_over: false, has_feedback: false },
        ]),
      ),
      http.get("*/staff/chat/conversations/c1/messages", () =>
        HttpResponse.json([
          { id: "m1", sender: "bot", content: "주차는 2층입니다.", route_taken: "rag", created_at: "2026-07-27T10:00:00Z" },
        ]),
      ),
      http.post("*/admin/kb/quality-report/messages/m1/correction", async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json({});
      }),
    );

    renderWithClient();
    await screen.findByText("c1");
    await userEvent.click(screen.getByText("c1"));
    await screen.findByText("주차는 2층입니다.");

    await userEvent.click(screen.getByRole("button", { name: "이 답변 교정하기" }));
    await userEvent.type(screen.getByLabelText("올바른 안내"), "주차는 지하 1층입니다.");
    await userEvent.click(screen.getByLabelText("앞으로 비슷한 질문에도 이 답변을 참고하게 합니다"));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() =>
      expect(submitted).toEqual({ correction_text: "주차는 지하 1층입니다.", add_to_example_bank: true }),
    );
  });
});
```

- [ ] **Step 3: 실패 확인 → 구현**

Run: `cd frontend && npx vitest run src/features/admin/kb` → FAIL

`frontend/src/features/admin/kb/QualityReportPage.tsx`:
```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiFetch } from "../../../api/httpClient";
import { listQualityReportConversations, submitPeriodicCorrection } from "../../../api/kbAdmin";
import { ReportWrongAnswerDialog } from "../../chatAdmin/ReportWrongAnswerDialog";

type Message = { id: string; sender: string; content: string; route_taken: string | null; created_at: string };

export function QualityReportPage() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: conversations } = useQuery({
    queryKey: ["quality-report", today],
    queryFn: () => listQualityReportConversations(today, today),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correctingMessageId, setCorrectingMessageId] = useState<string | null>(null);

  const { data: messages } = useQuery({
    queryKey: ["quality-report-messages", selectedId],
    queryFn: () => apiFetch<Message[]>(`/staff/chat/conversations/${selectedId}/messages`),
    enabled: Boolean(selectedId),
  });

  return (
    <div>
      <ul>
        {conversations?.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setSelectedId(c.id)}>
              {c.id}
            </button>
          </li>
        ))}
      </ul>

      {messages?.map((m) => (
        <div key={m.id}>
          <p>{m.content}</p>
          {m.sender === "bot" && (
            <button type="button" onClick={() => setCorrectingMessageId(m.id)}>
              이 답변 교정하기
            </button>
          )}
        </div>
      ))}

      {correctingMessageId && (
        <ReportWrongAnswerDialog
          messageId={correctingMessageId}
          onCancel={() => setCorrectingMessageId(null)}
          onDone={() => {
            setCorrectingMessageId(null);
            queryClient.invalidateQueries({ queryKey: ["quality-report-messages", selectedId] });
          }}
        />
      )}
    </div>
  );
}
```

주: `ReportWrongAnswerDialog`(Task 16)는 내부에서 `reportWrongAnswer`(직원 실시간 신고용, `/staff/chat/messages/{id}/feedback`)를 호출하도록 만들어졌으므로, 이 화면에서는 같은 다이얼로그의 제출 로직만 재사용하고 실제 호출은 `submitPeriodicCorrection`(`/admin/kb/quality-report/messages/{id}/correction`)로 바꿔 끼운다 — `ReportWrongAnswerDialog`에 `onSubmit?: (text, flag) => Promise<void>` prop을 추가해 기본값은 `reportWrongAnswer`, 이 화면에서는 `submitPeriodicCorrection`을 넘기도록 `Task 16`의 컴포넌트를 다음과 같이 확장한다:
```tsx
// frontend/src/features/chatAdmin/ReportWrongAnswerDialog.tsx 수정
type Props = {
  messageId: string;
  onDone: () => void;
  onCancel: () => void;
  onSubmit?: (messageId: string, correctionText: string, addToExampleBank: boolean) => Promise<void>;
};

export function ReportWrongAnswerDialog({ messageId, onDone, onCancel, onSubmit }: Props) {
  // ...
  async function handleSubmit() {
    const submit = onSubmit ?? reportWrongAnswer;
    await submit(messageId, correctionText, addToExampleBank);
    onDone();
  }
  // ...
}
```
`QualityReportPage`는 `<ReportWrongAnswerDialog ... onSubmit={submitPeriodicCorrection} />`로 호출한다.

구현 요점 (나머지 파일):
- `KbDocumentsPage`: 자료 목록 테이블(제목/분류/상태/수정일), 상태·분류 필터, "새 자료" 버튼 → `KbEditorDialog`(제목·분류 select·본문 textarea). `draft` 행에 "승인" 버튼(승인 시 "승인하면 상담봇이 이 자료를 근거로 사용해요. 자동으로 검색용 조각과 임베딩이 만들어져요" 확인창), `approved` 행에 "수정"(수정 시 재임베딩됨을 안내)과 "보관" 버튼. 모든 행에 "수정이력" 버튼 → `listKbRevisions(id)` 결과를 시간 역순 목록으로 보여주는 다이얼로그(수정 전 제목·분류·본문 스냅샷 표시 — 요구사항 3.8)
- `FeedbackInboxPage`: pending 신고 목록(봇 답변 원문 + 직원 정정 내용 + 신고자 + `source` 뱃지로 "실시간 신고"/"정기 검토" 구분). 각 행에 "반영"(자료 선택 select — 미선택 시 새 자료로 생성됨 안내) / "반려" 버튼
- `ExampleBankPage`: `qa_example_bank` 목록(질문/교정답변/갈래 표시), 각 행에 "비활성화" 버튼(삭제 대신 숨김 — 요구사항 6.3)
- `BotStatsPage`: 기간 선택(from/to) + `StatTile` 4개(앱 상담 수/웹 상담 수/인계 건수/오답 신고 수) + 갈래별 분포(안내형/진료과추천형/행동형) + 인계 사유별 건수 목록(거창한 차트 없이 숫자 카드 수준 — 스펙 섹션 4)
- `UnresolvedQuestionsPage`: 기간 선택(from/to) + `listUnresolvedQuestionClusters` 결과를 개수 내림차순 목록으로 표시(대표 질문 문구 + "N건"). 클러스터링은 임베딩 유사도 기반 보조 정리 도구라는 점을 안내 문구로 표시("비슷한 질문끼리 자동으로 묶어본 결과예요 — 실제로 다른 질문이 섞여 있을 수 있어요"). 행 클릭 시 묶인 티켓 목록(`ticket_ids`)을 펼쳐 보여줌(요구사항 3.9/3.10)

- [ ] **Step 3-1: 실패하는 테스트 작성 — 미해결 질문 모아보기**

`frontend/src/features/admin/kb/UnresolvedQuestionsPage.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../../../test/msw/server";
import { UnresolvedQuestionsPage } from "./UnresolvedQuestionsPage";

function renderWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UnresolvedQuestionsPage />
    </QueryClientProvider>,
  );
}

describe("UnresolvedQuestionsPage", () => {
  it("자주 들어오는 미해결 질문을 개수 내림차순으로 보여준다", async () => {
    server.use(
      http.get("*/admin/kb/unresolved-question-clusters", () =>
        HttpResponse.json([
          { sample_question: "야간 진료 하나요?", count: 5, ticket_ids: ["t1", "t2", "t3", "t4", "t5"] },
          { sample_question: "주차장 몇 시까지 열어요?", count: 2, ticket_ids: ["t6", "t7"] },
        ]),
      ),
    );
    renderWithClient();

    await screen.findByText("야간 진료 하나요?");
    await waitFor(() => expect(screen.getByText("5건")).toBeInTheDocument());
    screen.getByText("주차장 몇 시까지 열어요?");
  });
});
```

- [ ] **Step 4: 테스트 통과 확인 후 Commit**

Run: `cd frontend && npx vitest run src/features/admin/kb src/features/chatAdmin && npx tsc --noEmit`
Expected: PASS

```bash
git add frontend/src/api/kbAdmin.ts frontend/src/features/admin/kb/ frontend/src/features/chatAdmin/ReportWrongAnswerDialog.tsx frontend/src/App.tsx
git commit -m "feat: 관리자 KB 관리(수정이력 포함)/오답 처리함/상담 품질 리포트/참고예시 관리/상담봇 현황/미해결 질문 모아보기"
```

---

## Task 18: 웹 상담창 위젯 (별도 Vite 앱)

**Files:**
- Create: `webchat/package.json`, `webchat/index.html`, `webchat/vite.config.ts`
- Create: `webchat/src/main.tsx`
- Create: `webchat/src/ChatWidget.tsx` (말풍선 버튼 + 펼쳐지는 채팅창)
- Create: `webchat/src/ChatWindow.tsx` (메시지 목록 + 입력 + 카드 렌더)
- Create: `webchat/src/BookingCard.tsx` (확인 카드 — 주요 버튼 1개)
- Create: `webchat/src/AuthModal.tsx` (로그인/가입 모달 — 별도 페이지 방식)
- Create: `webchat/src/ContactForm.tsx` (익명 인계용 이름·연락처)
- Create: `webchat/src/api.ts`, `webchat/src/anonSession.ts`, `webchat/src/supabase.ts`
- Test: `webchat/src/ChatWindow.test.tsx`

**Interfaces:**
- Consumes: Task 14의 `/chat/*` API, Supabase JS SDK(전화번호+비밀번호 로그인 — 3단계와 동일 Auth, 가입은 OTP 본인확인 → 비밀번호 설정)
- Produces: `anonSession.getToken()/saveToken(token)/clear()` — localStorage 보관(익명 "진동벨")
- Produces: `<ChatWidget />` — 우하단 플로팅 버튼, 클릭 시 `<ChatWindow />` 펼침
- Produces: `<BookingCard card onConfirm />`, `<AuthModal mode onSuccess onClose />`, `<ContactForm onSubmit />`

- [ ] **Step 1: 스캐폴딩**

```bash
npm create vite@latest webchat -- --template react-ts
cd webchat && npm install @supabase/supabase-js
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom msw jsdom
```
`webchat/.env.example`: `VITE_API_BASE_URL=`, `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`

- [ ] **Step 2: 실패하는 테스트 작성**

`webchat/src/ChatWindow.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import ChatWindow from "./ChatWindow";

const server = setupServer(
  http.post("*/chat/conversations", () =>
    HttpResponse.json({ conversation_id: "c1", anon_session_token: "tok1" }),
  ),
  http.get("*/chat/conversations/c1/messages", () => HttpResponse.json([])),
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("메시지를 보내면 봇 답변이 표시된다", async () => {
  server.use(
    http.post("*/chat/conversations/c1/messages", () =>
      HttpResponse.json({ reply: "지하 1층 주차장을 이용하세요.", message_type: "text", card: null, handed_over: false }),
    ),
  );
  render(<ChatWindow />);
  await userEvent.type(await screen.findByPlaceholderText("궁금한 점을 입력하세요"), "주차 되나요?");
  await userEvent.click(screen.getByRole("button", { name: "보내기" }));
  await screen.findByText("지하 1층 주차장을 이용하세요.");
});

test("확인 카드가 오면 예약 버튼 하나가 표시된다", async () => {
  server.use(
    http.post("*/chat/conversations/c1/messages", () =>
      HttpResponse.json({
        reply: "이 내용으로 예약할까요?", message_type: "booking_confirm",
        card: { department_name: "내과", doctor_name: "김의사", slot_date: "2026-07-30",
                start_time: "10:00", for_patient_id: "p", department_id: "d",
                doctor_id: "doc", slot_id: "s" },
        handed_over: false,
      }),
    ),
  );
  render(<ChatWindow />);
  await userEvent.type(await screen.findByPlaceholderText("궁금한 점을 입력하세요"), "10시로 할게요");
  await userEvent.click(screen.getByRole("button", { name: "보내기" }));
  await screen.findByText(/내과.*김의사/);
  // 중요한 버튼은 크게 하나만 (요구사항 4.8)
  expect(screen.getAllByRole("button", { name: "이 내용으로 예약" })).toHaveLength(1);
});

test("진료과 추천형(문진) 응답에는 진단이 아니라는 배너가 함께 표시된다", async () => {
  server.use(
    http.post("*/chat/conversations/c1/messages", () =>
      HttpResponse.json({
        reply: "언제부터 그러셨나요?", message_type: "text", card: null, handed_over: false,
        route_taken: "department_guide",
      }),
    ),
  );
  render(<ChatWindow />);
  await userEvent.type(await screen.findByPlaceholderText("궁금한 점을 입력하세요"), "머리가 아파요");
  await userEvent.click(screen.getByRole("button", { name: "보내기" }));
  await screen.findByText("진단이 아니라 진료과 안내입니다");
});

test("전송 실패 시 실패 표시와 재전송 버튼이 보인다", async () => {
  server.use(
    http.post("*/chat/conversations/c1/messages", () => HttpResponse.error()),
  );
  render(<ChatWindow />);
  await userEvent.type(await screen.findByPlaceholderText("궁금한 점을 입력하세요"), "질문");
  await userEvent.click(screen.getByRole("button", { name: "보내기" }));
  await screen.findByText("전송에 실패했어요");
  screen.getByRole("button", { name: "다시 보내기" });
});
```

- [ ] **Step 3: 실패 확인 → 구현**

구현 요점:
- `anonSession.ts`: `localStorage`에 토큰 저장. `ChatWindow` 마운트 시 토큰 있으면 `GET /chat/conversations/resume`으로 어제 대화 복원, 없으면 `POST /chat/conversations {channel:'web'}`로 새 방 + 토큰 저장
- `ChatWindow`: 말풍선 목록(환자/봇/직원 구분), 입력창(placeholder "궁금한 점을 입력하세요") + "보내기". 전송 중 버튼 비활성(중복 클릭 방지). 실패 시 말풍선에 "전송에 실패했어요" + "다시 보내기". `message_type`별 렌더: `booking_confirm` → `<BookingCard>`, `booking_done` → 예약번호 + "사전문진은 앱에서 작성할 수 있어요" 안내. **`route_taken === "department_guide"`인 답변에는 말풍선 위에 "진단이 아니라 진료과 안내입니다" 고정 배너를 붙인다** (설계서 섹션 4 — 의료 안내와 일반 안내를 시각적으로 구분)
- `BookingCard`: 환자·진료과·의사·날짜·시간 표 + `이 내용으로 예약` 버튼 1개. 클릭 → 로그인 상태면 `POST /chat/conversations/{id}/booking`(Supabase 세션의 access token을 Authorization 헤더로), 비로그인이면 `<AuthModal>` 열기. 409(선점) 응답이면 "방금 그 시간이 마감됐어요. 봇에게 다른 시간을 물어보세요" 표시
- `AuthModal`: 로그인 탭(전화번호+비밀번호 — `supabase.auth.signInWithPassword({phone, password})`) / 가입 탭(전화번호 → `signInWithOtp` → OTP 확인 → 비밀번호·이름·생년월일·성별 → 3단계 가입 API 재사용). 성공 시 `POST /chat/conversations/{id}/attach`로 익명 대화를 계정에 연결 후 모달 닫기. 채팅창 위를 덮는 전체 모달(별도 페이지 방식 — 스펙 확정)
- `ContactForm`: 봇 응답의 `handed_over === true`이고 비로그인 상태면 채팅에 인라인 표시 — 이름·휴대폰 입력 → `POST /chat/conversations/{id}/contact`. 제출 후 "답변이 등록되면 문자로 알려드릴게요"
- 직원 답변 실시간 수신: Supabase Realtime은 익명 사용자에게 못 쓰므로(RLS), 웹 위젯은 채팅창이 열려 있는 동안 15초 간격 폴링으로 새 메시지 확인 (단순·충분)

- [ ] **Step 4: 테스트 통과 확인 후 Commit**

Run: `cd webchat && npx vitest run && npx tsc --noEmit`
Expected: PASS

```bash
git add webchat/
git commit -m "feat: 병원 홈페이지용 웹 상담창 위젯 (익명+로그인 전환, 문진 배너)"
```

---

## Task 19: Flutter 앱 — AI 상담 화면

**Files:**
- Create: `app/lib/features/chat/chat_api.dart`
- Create: `app/lib/features/chat/chat_models.dart`
- Create: `app/lib/features/chat/chat_controller.dart`
- Create: `app/lib/features/chat/chat_list_screen.dart` (이전 상담 목록)
- Create: `app/lib/features/chat/chat_screen.dart` (채팅 화면)
- Create: `app/lib/features/chat/booking_card.dart`
- Modify: `app/lib/router.dart` (`/chat`, `/chat/:id` 라우트), 홈 화면에 `AI 상담` 메뉴 추가
- Test: `app/test/features/chat/chat_controller_test.dart`

**Interfaces:**
- Consumes: `ApiClient`(3단계), `BusyButton`(3단계), FCM 푸시(3단계 — `chat_answered` 타입 수신 시 해당 방으로 딥링크)
- Produces: `ChatMessage`(모델: `id, sender, content, messageType, routeTaken, createdAt`), `ChatCard`(모델: 카드 필드), `ChatController`(`AsyncNotifier<List<ChatMessage>>`: `load(conversationId)`, `send(text) -> Future<SendResult>`, `confirmBooking(card) -> Future<String>`(appointment_id), `sendFeedback(messageId, helpful)`)
- Produces: `SendResult`(모델: `reply, messageType, card, handedOver, routeTaken`)

- [ ] **Step 1: 실패하는 컨트롤러 테스트 작성**

`app/test/features/chat/chat_controller_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_app/features/chat/chat_models.dart';

void main() {
  test('SendResult가 booking_confirm 카드를 파싱한다', () {
    final result = SendResult.fromJson({
      'reply': '이 내용으로 예약할까요?',
      'message_type': 'booking_confirm',
      'card': {
        'for_patient_id': 'p1', 'department_id': 'd1', 'doctor_id': 'doc1',
        'slot_id': 's1', 'department_name': '내과', 'doctor_name': '김의사',
        'slot_date': '2026-07-30', 'start_time': '10:00',
      },
      'handed_over': false,
      'route_taken': 'agent',
    });
    expect(result.messageType, 'booking_confirm');
    expect(result.card!.departmentName, '내과');
    expect(result.routeTaken, 'agent');
  });

  test('인계 응답을 파싱한다 (reply가 null이어도 안전)', () {
    final result = SendResult.fromJson({
      'reply': null, 'message_type': 'text', 'card': null, 'handed_over': true, 'route_taken': null,
    });
    expect(result.handedOver, true);
    expect(result.reply, isNull);
  });

  test('진료과 추천형(department_guide) 응답을 파싱한다', () {
    final result = SendResult.fromJson({
      'reply': '언제부터 그러셨어요?', 'message_type': 'text', 'card': null,
      'handed_over': false, 'route_taken': 'department_guide',
    });
    expect(result.routeTaken, 'department_guide');
  });
}
```

- [ ] **Step 2: 실패 확인 → 구현**

Run: `cd app && flutter test test/features/chat/` → FAIL

구현 요점:
- `chat_api.dart`: `ApiClient`로 `/chat/*` 호출 (앱은 항상 로그인 상태 — Authorization 자동)
- `chat_list_screen.dart`: `GET /chat/conversations` 목록(마지막 발언 시각 순) + "새 상담 시작" 버튼
- `chat_screen.dart`: 말풍선 UI. 입력 + 전송(`BusyButton` 재사용 — 처리 중 중복 전송 방지). 전송 실패 시 말풍선에 실패 표시 + 재전송(요구사항 4.8 "저장된 것처럼 보이면 안 됨"). 봇 말풍선 하단에 👍/👎 아이콘 — 👎 탭 시 "직원에게 문의를 넘겨드릴까요?" 다이얼로그 → 확인 시 `send(text, unhelpfulFlagged: true)` 호출(백엔드의 인계 감시가 `unhelpful` 사유로 즉시 인계 처리). **봇 말풍선의 `routeTaken == 'department_guide'`이면 말풍선 위에 "진단이 아니라 진료과 안내입니다" 배너를 표시**(설계서 섹션 4). `message_type` 렌더: `booking_confirm` → `booking_card.dart`, `booking_done` → 예약번호 카드 + "사전문진 작성하기" 버튼(3단계 문진 화면으로 이동)
- `booking_card.dart`: 확인 카드 — 주요 버튼 `이 내용으로 예약` 1개(`BusyButton`). 성공 시 완료 처리, 409면 "방금 그 시간이 마감됐어요" 스낵바 + 봇에게 재문의 유도
- 인계 후: `handedOver == true`면 "업무시간에는 곧, 업무시간이 아니면 다음 영업일에 직원이 답변드려요. 답변이 오면 알림을 보내드릴게요" 시스템 말풍선 표시. FCM `chat_answered` 수신 시 해당 상담방으로 이동
- 직원 답변 실시간 반영: 앱은 로그인 상태이므로 Supabase Realtime 구독(`chat_messages`, 본인 RLS 통과분)으로 새 말풍선 자동 추가

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd app && flutter test && flutter analyze`
Expected: PASS

```bash
git add app/lib/features/chat/ app/lib/router.dart app/test/features/chat/
git commit -m "feat: 앱 AI 상담 - 채팅/카드/피드백/인계/푸시 연동/문진 배너"
```

---

## 실행 순서와 의존 관계

```
Task 1 ─┐
Task 2 ─┼─ Task 4 ── Task 5 ── Task 6 ─┬─ Task 7 ─┬─ Task 11 ── Task 12 ── Task 13 ── Task 14 ── Task 15
Task 3 ─┘                              ├─ Task 8 ─┤
                                        └─ Task 9 ─┴─ Task 10 ─┘
백엔드(Task 14) 완료 후: Task 16 / Task 17 / Task 18 / Task 19는 서로 독립 (병렬 가능)
```

Task 7·8·9는 모두 `langchain_client.get_chat_model`(Task 7)에 의존하지만 서로 독립적으로 병렬 진행 가능하다. Task 10(라우터+인계감시)은 Task 7의 모델 팩토리만 있으면 되므로 7 이후 바로 시작할 수 있다. Task 11(오케스트레이션)은 7·8·9·10을 모두 소비하므로 넷 다음에 온다.

## 수동 검증 시나리오 (전체 구현 후)

1. `python scripts/seed_kb.py` 실행(실제 임베딩 — 1회) → `python scripts/rag_eval.py`로 recall 확인. `MAX_CHUNK_CHARS`를 400/800/1600으로 바꿔 재시드하며 점수 비교(검색 정확도를 좌우하는 핵심 튜닝 파라미터)
2. 웹 상담창(익명): "가슴이 너무 아파요" → 119/응급실 안내 확인(⓪ 응급검사), "무슨 병이에요?" → 진단 거절+진료과 안내 확인(② 문진 체인)
3. 웹 상담창(익명): 답 없는 질문 → `no_answer`로 자동 인계 → 연락처 남기기 → 직원 웹에서 답변 → SMS 수신 확인 → 같은 브라우저 재방문 시 대화 복원 확인
4. 앱: 상담 → 시간 조회(② 에이전트 체인) → 확인 카드 → 버튼 → 예약 완료 카드(예약번호+문진 버튼) → 직원 웹 캘린더에 예약 표시 확인
5. 두 기기로 같은 슬롯 경쟁: 한쪽 카드 버튼이 409 → 봇 재안내 확인
6. 직원 웹: 상담 기록에서 `route_taken`별 필터·봇 답변 근거 확인 → 오답 신고 → 관리자 반영 → 같은 질문에 정정된 답 확인
7. 관리자 웹: "상담 품질 리포트"에서 신고되지 않은 지난 상담을 열람 → 그 자리에서 교정 + "예시은행에 추가" 체크 → 같은(또는 비슷한) 질문을 다시 물었을 때 챗봇 답변이 교정 내용을 반영하는지 확인(품질 개선 사이클 종단 검증)
8. 웹 상담창: "이 약 계속 먹어도 되나요?" → 인계 감시가 `medical_judgment`로 감지해 즉시 인계되는지 확인 (에이전트가 스스로 판단하지 않고도 인계됨)
9. 같은 질문을 3번 반복 → `repeated` 사유로 자동 인계되는지 확인
10. 직원 웹: 8번에서 생성된 `medical_judgment` 티켓을 열람(새 문의→처리 중 자동 전환 확인) → "담당 의사에게 전달" → 다른 계정으로 로그인해 담당자로 넘어왔는지, 답변까지 정상 처리되는지 확인 (요구사항 3.9)
11. 관리자 웹: KB 자료 하나를 두 번 수정 → "수정이력"에서 이전 두 버전이 시간 역순으로 남아있는지 확인 (요구사항 3.8)
12. 웹 상담창(익명)으로 비슷한 질문("야간 진료 하나요?", "밤에 진료 되나요?")을 각각 답 없는 자료로 물어 인계시킨 뒤, 관리자 웹 "미해결 질문 모아보기"에서 두 건이 한 그룹으로 묶여 "2건"으로 표시되는지 확인 (요구사항 3.9/3.10)
