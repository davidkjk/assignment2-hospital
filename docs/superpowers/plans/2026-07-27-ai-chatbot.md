# 4단계: AI 상담봇 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병원 통합 서비스의 AI 상담봇 — RAG(pgvector) 기반 병원 안내 답변, Claude API tool use 대화 엔진, 상담 중 예약 제안, 직원 인계 티켓, 지식베이스 관리, 오답 정정 워크플로를 백엔드(FastAPI) + 직원 웹(React) + 웹 상담창(React 위젯) + 환자 앱(Flutter)에 구축한다.

**Architecture:** 상담봇 두뇌는 백엔드 API에 있다. 환자 메시지가 오면 ① OpenAI 임베딩으로 질문을 벡터화해 pgvector로 승인된 `kb_chunks`에서 유사 조각을 검색(RAG)하고, ② Claude API(`claude-sonnet-5`)를 tool use 수동 루프로 호출한다(LangChain 미사용). 봇의 도구 6개는 기존 1~3단계 서비스(`patient_catalog_service` 등)를 얇게 감싼다. **실제 예약 실행은 봇의 도구가 아니다** — 확인 카드의 버튼이 3단계 `patient_booking_service.create_booking`을 직접 호출한다. 인계는 `support_tickets` 티켓 + 같은 `chat_messages`를 공유하는 직원 답변으로 구현하고, Supabase Realtime으로 양쪽 화면에 실시간 반영한다. 웹 상담창은 익명(세션 토큰) 기본 + 필요 시 로그인/가입(3단계와 동일 Supabase Auth 계정).

**Tech Stack:** FastAPI, Supabase (Postgres + pgvector + Realtime + Auth), `anthropic` Python SDK (Claude Sonnet 5, tool use), OpenAI Embeddings API (`text-embedding-3-small`, httpx 직접 호출), React + TypeScript (직원 웹 확장 + 웹 상담창 위젯), Flutter + Riverpod (앱 AI 상담), pytest + pytest-asyncio, Vitest + MSW, flutter_test

## Global Constraints

- 이 계획은 1~3단계 계획의 산출물이 이미 존재한다고 가정한다: `backend/` 스캐폴딩, `supabase/migrations/00001~00011`, `app.db.pool.acquire_as`/`get_pool`, `app.core.security.StaffContext`/`require_role`, `app.core.patient_security.PatientContext`/`get_current_patient`, `app.core.errors.AppError`/`log_error`, `app.integrations.sms_client.get_sms_client`, `app.services.notification_service.notify_patient`, `app.services.patient_catalog_service.*`, `app.services.patient_booking_service.create_booking`, `app.services.patient_appointment_query_service.list_my_appointments`
- 신규 마이그레이션은 `supabase/migrations/00012`부터 번호를 이어간다
- AI 프레임워크(LangChain 등) 금지 — Claude API tool use 수동 루프 직접 구현 (스펙 "핵심 결정")
- 대화 모델은 `claude-sonnet-5` 고정, 임베딩은 OpenAI `text-embedding-3-small`(1536차원) 고정 (스펙 섹션 1/2)
- **실제 예약을 실행하는 도구를 Claude에게 주지 않는다** — 봇은 `예약제안_카드`까지만, 예약은 카드 버튼 → 기존 예약 API 직행 (스펙 섹션 3)
- 봇은 승인(`approved`)된 자료의 조각만 검색 근거로 사용하고, 봇 답변 메시지에 `source_chunk_ids`를 반드시 기록한다 (요구사항 5.6)
- `handed_over` 상태의 상담방에서 봇은 응답하지 않는다 (환자 메시지는 저장만)
- 상담방 상태가 인계된 뒤 직원이 답변 완료하면 상담방은 `bot` 상태로 복귀한다
- Claude에 보내는 대화 이력은 최근 20개 메시지로 제한한다 (비용 통제)
- 익명 웹 사용자는 시간당 메시지 30개로 제한한다 (비용 남용 방지)
- Claude/OpenAI API 키는 서버 환경변수에만 존재하며 프론트엔드 코드에 절대 넣지 않는다 (요구사항 6.5)
- Claude/OpenAI 장애 시 예약·진료기록 기능은 영향받지 않아야 하며, 상담창은 한글 안내 + 봇 없는 티켓 접수로 전환한다 (요구사항 6.4)
- 사용자에게는 한글 안내 메시지만 노출한다 (요구사항 6.4)
- 자동 테스트에서 Claude/OpenAI를 실제 호출하지 않는다 — 전부 모킹 (비용 0원)
- 시스템 프롬프트에 반드시 포함: 진단·약 추천 금지, 확정적 표현 금지, 긴급 표현 시 119/응급실 안내 최우선, 모르면 지어내지 말고 인계 (요구사항 5.3/5.6)

## 파일 구조 개요

```
supabase/migrations/
  00012_chat_tables.sql            # 상담방/메시지 + RLS
  00013_kb_pgvector.sql            # pgvector 확장 + 지식베이스 + RLS
  00014_support_feedback.sql       # 인계 티켓 + 오답 신고 + RLS
backend/app/
  integrations/embedding_client.py # OpenAI 임베딩 (모킹 가능)
  integrations/claude_client.py    # Claude tool use 루프 (모킹 가능)
  services/kb_service.py           # 자료 CRUD + 승인 → 청킹+임베딩
  services/rag_search_service.py   # 질문 → 유사 조각 검색
  services/chat_tools.py           # 봇 도구 6개 정의+실행
  services/chat_service.py         # 대화 오케스트레이션 (핵심)
  services/ticket_service.py       # 인계 티켓 + 직원 답변 + 알림
  services/answer_feedback_service.py  # 오답 신고/반영
  services/bot_stats_service.py    # 상담봇 처리 현황 집계
  routers/chat.py                  # 환자/익명용 상담 API
  routers/staff_chat.py            # 직원용 티켓/상담기록 API
  routers/admin_kb.py              # 관리자용 KB/오답/현황 API
backend/scripts/
  seed_kb.py                       # 연습용 대용량 안내자료 생성
  rag_eval.py                      # 골든 질문 세트 RAG 품질 평가
frontend/src/features/chatAdmin/   # 직원 웹: 상담 관리
frontend/src/features/admin/kb/    # 관리자: KB 관리/오답/현황
webchat/                           # 병원 홈페이지용 웹 상담창 (별도 Vite 앱)
app/lib/features/chat/             # Flutter 앱: AI 상담
```

---

## Task 1: 마이그레이션 — 상담방/메시지 테이블 + RLS

**Files:**
- Create: `supabase/migrations/00012_chat_tables.sql`
- Test: `backend/tests/test_chat_tables_schema.py`

**Interfaces:**
- Produces: 테이블 `chat_conversations`, `chat_messages` (스펙 섹션 2의 컬럼 그대로), RLS 정책 일체

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
    assert {"conversation_id", "sender", "content", "source_chunk_ids", "message_type"} <= cols


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
git commit -m "feat: 상담방/메시지 테이블 + RLS (4단계)"
```

---

## Task 2: 마이그레이션 — pgvector + 지식베이스 테이블

**Files:**
- Create: `supabase/migrations/00013_kb_pgvector.sql`
- Test: `backend/tests/test_kb_schema.py`

**Interfaces:**
- Produces: `vector` 확장, 테이블 `kb_documents`, `kb_chunks(embedding vector(1536))`, 유사도 검색 함수 `match_kb_chunks(query_embedding vector, match_count int)`

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
    for table in ("kb_documents", "kb_chunks"):
        exists = await service_conn.fetchval(
            "select exists (select from information_schema.tables where table_name = $1)",
            table,
        )
        assert exists


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

-- 직원: 자료 조회 가능 (근거 확인용). 작성/수정/승인은 백엔드 경유(관리자 검사)
create policy kb_documents_staff_select on kb_documents
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));

create policy kb_chunks_staff_select on kb_chunks
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `supabase db reset && cd backend && pytest tests/test_kb_schema.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00013_kb_pgvector.sql backend/tests/test_kb_schema.py
git commit -m "feat: pgvector + 지식베이스 테이블 (4단계 RAG)"
```

---

## Task 3: 마이그레이션 — 인계 티켓 + 오답 신고 테이블

**Files:**
- Create: `supabase/migrations/00014_support_feedback.sql`
- Test: `backend/tests/test_support_feedback_schema.py`

**Interfaces:**
- Produces: 테이블 `support_tickets`(요약 5컬럼 + `reason` 6종), `answer_feedback`, RLS 정책

- [ ] **Step 1: 실패하는 스키마 테스트 작성**

`backend/tests/test_support_feedback_schema.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_tables_exist(service_conn):
    for table in ("support_tickets", "answer_feedback"):
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
        "contact_name", "contact_phone",
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_support_feedback_schema.py -v`
Expected: FAIL

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/00014_support_feedback.sql`:
```sql
-- 직원 인계 티켓 (스펙 섹션 2, 요구사항 5.5)
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
  status text not null default 'pending' check (status in ('pending', 'answered')),
  assigned_staff_id uuid references staff(id),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index idx_support_tickets_status on support_tickets (status, created_at);

-- 오답 신고와 정정 (요구사항 5.6)
create table answer_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id),
  reported_by uuid not null references staff(id),
  correction_text text not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  reviewed_by uuid references staff(id),
  applied_document_id uuid references kb_documents(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table support_tickets enable row level security;
alter table answer_feedback enable row level security;

create policy support_tickets_staff_select on support_tickets
  for select to authenticated
  using (exists (select from staff where auth_user_id = auth.uid() and is_active));

create policy answer_feedback_staff_select on answer_feedback
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
git commit -m "feat: 인계 티켓 + 오답 신고 테이블 (4단계)"
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
- Produces: `app.services.kb_service.create_document(staff, title, category, content) -> UUID`, `update_document(staff, document_id, title, category, content) -> None`(승인 상태였다면 재청킹+재임베딩), `approve_document(staff, document_id) -> None`(청킹+임베딩 실행, 관리자만), `archive_document(staff, document_id) -> None`(조각 삭제), `list_documents(staff, status=None, category=None) -> list[dict]`, `chunk_text(content: str) -> list[str]`(빈 줄 기준 문단 분리, 800자 초과 문단은 분할)

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
            row = await conn.fetchrow(
                "update kb_documents set title = $2, category = $3, content = $4, updated_at = now() "
                "where id = $1 returning status",
                document_id, title, category, content,
            )
            if row is None:
                raise AppError("자료를 찾을 수 없어요.", 404)
            if row["status"] == "approved":
                await _rebuild_chunks(conn, document_id, content, embedder)


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
git commit -m "feat: 지식베이스 서비스 - 승인 시 청킹+임베딩 파이프라인"
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

## Task 7: Claude 클라이언트 (tool use 수동 루프)

**Files:**
- Create: `backend/app/integrations/claude_client.py`
- Modify: `backend/requirements.txt` (`anthropic` 추가)
- Test: `backend/tests/test_claude_client.py`

**Interfaces:**
- Consumes: `anthropic` SDK, `settings.anthropic_api_key`, `settings.chat_model`
- Produces: `app.integrations.claude_client.run_agent_turn(system: str, messages: list[dict], tools: list[dict], tool_executor, client=None) -> AgentResult`
  - `tool_executor(name: str, tool_input: dict) -> str` (async) — 도구 실행 콜백. 실행 결과 문자열 반환
  - `AgentResult`(dataclass): `text: str`(최종 답변), `tool_calls: list[dict]`(실행된 도구 이름/입력 기록 — chat_service가 인계·카드 여부 판단에 사용)
  - 루프는 `stop_reason == "tool_use"`인 동안 반복, 최대 8회 반복 후 강제 종료

- [ ] **Step 1: 의존성 추가**

`backend/requirements.txt`에 추가:
```
anthropic==0.116.0
```
Run: `cd backend && pip install -r requirements.txt`

- [ ] **Step 2: 실패하는 테스트 작성 (가짜 Anthropic 클라이언트)**

`backend/tests/test_claude_client.py`:
```python
import pytest
from types import SimpleNamespace


class FakeBlock(SimpleNamespace):
    pass


class FakeAnthropicClient:
    """호출 순서대로 미리 정의된 응답을 돌려주는 가짜 클라이언트."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.requests = []
        self.messages = self  # client.messages.create 형태 호환

    async def create(self, **kwargs):
        self.requests.append(kwargs)
        return self._responses.pop(0)


def text_response(text):
    return SimpleNamespace(
        stop_reason="end_turn",
        content=[FakeBlock(type="text", text=text)],
    )


def tool_response(name, tool_input, tool_id="toolu_1"):
    return SimpleNamespace(
        stop_reason="tool_use",
        content=[FakeBlock(type="tool_use", id=tool_id, name=name, input=tool_input)],
    )


@pytest.mark.asyncio
async def test_simple_text_answer():
    from app.integrations.claude_client import run_agent_turn

    fake = FakeAnthropicClient([text_response("주차는 지하 1층입니다.")])
    result = await run_agent_turn(
        system="병원 상담봇", messages=[{"role": "user", "content": "주차?"}],
        tools=[], tool_executor=None, client=fake,
    )
    assert result.text == "주차는 지하 1층입니다."
    assert result.tool_calls == []


@pytest.mark.asyncio
async def test_tool_loop_executes_and_feeds_back():
    from app.integrations.claude_client import run_agent_turn

    executed = []

    async def executor(name, tool_input):
        executed.append((name, tool_input))
        return "빈 시간: 7/30 10:00"

    fake = FakeAnthropicClient([
        tool_response("예약가능시간_조회", {"doctor_id": "d1"}),
        text_response("7월 30일 10시가 가능해요."),
    ])
    result = await run_agent_turn(
        system="s", messages=[{"role": "user", "content": "내일 예약 돼요?"}],
        tools=[{"name": "예약가능시간_조회"}], tool_executor=executor, client=fake,
    )
    assert executed == [("예약가능시간_조회", {"doctor_id": "d1"})]
    assert result.text == "7월 30일 10시가 가능해요."
    assert result.tool_calls[0]["name"] == "예약가능시간_조회"
    # 두 번째 요청에 tool_result가 포함되었는지 확인
    second = fake.requests[1]["messages"]
    assert second[-1]["role"] == "user"
    assert second[-1]["content"][0]["type"] == "tool_result"


@pytest.mark.asyncio
async def test_loop_cap_stops_infinite_tools():
    from app.integrations.claude_client import run_agent_turn

    async def executor(name, tool_input):
        return "ok"

    fake = FakeAnthropicClient([tool_response("t", {}, f"id{i}") for i in range(10)])
    result = await run_agent_turn(
        system="s", messages=[{"role": "user", "content": "x"}],
        tools=[{"name": "t"}], tool_executor=executor, client=fake,
    )
    assert len(fake.requests) <= 8  # 최대 반복 제한
    assert result.text  # 강제 종료 시에도 한글 안내 문자열 반환
```

- [ ] **Step 3: 실패 확인 → 구현**

Run: `cd backend && pytest tests/test_claude_client.py -v` → FAIL

`backend/app/integrations/claude_client.py`:
```python
from dataclasses import dataclass, field

from anthropic import AsyncAnthropic

from app.core.config import settings

MAX_LOOPS = 8


@dataclass
class AgentResult:
    text: str
    tool_calls: list[dict] = field(default_factory=list)


def get_claude_client() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=settings.anthropic_api_key)


async def run_agent_turn(system, messages, tools, tool_executor, client=None) -> AgentResult:
    client = client or get_claude_client()
    messages = list(messages)
    tool_calls: list[dict] = []

    for _ in range(MAX_LOOPS):
        response = await client.messages.create(
            model=settings.chat_model,
            max_tokens=2048,
            system=system,
            messages=messages,
            tools=tools,
        )

        text_parts = [b.text for b in response.content if b.type == "text"]
        tool_blocks = [b for b in response.content if b.type == "tool_use"]

        if response.stop_reason != "tool_use" or not tool_blocks:
            return AgentResult(text="".join(text_parts), tool_calls=tool_calls)

        # assistant 턴 전체를 이력에 추가한 뒤, 각 도구 실행 결과를 하나의 user 턴으로 반환
        messages.append({"role": "assistant", "content": response.content})
        results = []
        for block in tool_blocks:
            tool_calls.append({"name": block.name, "input": block.input})
            output = await tool_executor(block.name, block.input)
            results.append({
                "type": "tool_result", "tool_use_id": block.id, "content": output,
            })
        messages.append({"role": "user", "content": results})

    return AgentResult(
        text="죄송해요, 지금은 답변을 정리하지 못했어요. 직원 연결을 도와드릴까요?",
        tool_calls=tool_calls,
    )
```

- [ ] **Step 4: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_claude_client.py -v`
Expected: PASS

```bash
git add backend/app/integrations/claude_client.py backend/requirements.txt backend/tests/test_claude_client.py
git commit -m "feat: Claude tool use 수동 루프 클라이언트"
```

---

## Task 8: 봇 도구 6개 (정의 + 실행기)

**Files:**
- Create: `backend/app/services/chat_tools.py`
- Test: `backend/tests/test_chat_tools.py`

**Interfaces:**
- Consumes: `rag_search_service.search`, `patient_catalog_service.list_departments/list_doctors/list_available_slots`, `patient_appointment_query_service.list_my_appointments`, `ticket_service.create_ticket`(Task 10 — 이 Task에서는 콜백 주입으로 우회)
- Produces: `app.services.chat_tools.TOOL_DEFINITIONS: list[dict]` (Claude `tools` 파라미터 형식, 도구 6개)
- Produces: `app.services.chat_tools.ToolContext`(dataclass: `patient: PatientContext | None`, `conversation_id: UUID`, `collected: dict` — 실행 부수효과 수집용: `source_chunk_ids: list`, `handoff: dict | None`, `card: dict | None`)
- Produces: `app.services.chat_tools.execute_tool(ctx: ToolContext, name: str, tool_input: dict) -> str` (async)

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_chat_tools.py`:
```python
import pytest
from uuid import uuid4
from app.services.chat_tools import TOOL_DEFINITIONS, ToolContext, execute_tool


def test_definitions_shape():
    names = {t["name"] for t in TOOL_DEFINITIONS}
    assert names == {
        "search_hospital_info", "list_departments_doctors", "list_available_slots",
        "get_my_appointments", "propose_booking_card", "handoff_to_staff",
    }
    for t in TOOL_DEFINITIONS:
        assert "description" in t and "input_schema" in t
    # 실제 예약을 실행하는 도구가 없어야 함 (스펙 섹션 3 핵심) — 카드 '제안' 도구만 존재
    assert "create_booking" not in names
    assert "book_appointment" not in names


@pytest.mark.asyncio
async def test_search_collects_source_chunks(monkeypatch):
    from app.services import chat_tools

    async def fake_search(query, top_k=5, embedder=None):
        return [{"chunk_id": uuid4(), "document_id": uuid4(), "title": "주차 안내",
                 "content": "지하 1층", "similarity": 0.9}]

    monkeypatch.setattr(chat_tools.rag_search_service, "search", fake_search)
    ctx = ToolContext(patient=None, conversation_id=uuid4())
    out = await execute_tool(ctx, "search_hospital_info", {"query": "주차"})
    assert "지하 1층" in out
    assert len(ctx.collected["source_chunk_ids"]) == 1  # 근거 추적 (요구사항 5.6)


@pytest.mark.asyncio
async def test_my_appointments_requires_login():
    ctx = ToolContext(patient=None, conversation_id=uuid4())
    out = await execute_tool(ctx, "get_my_appointments", {})
    assert "로그인" in out  # 익명이면 로그인 안내 문자열 반환 (에러 아님)


@pytest.mark.asyncio
async def test_handoff_collects_summary():
    ctx = ToolContext(patient=None, conversation_id=uuid4())
    out = await execute_tool(ctx, "handoff_to_staff", {
        "reason": "no_answer",
        "summary_question": "야간 진료 여부", "summary_confirmed": "정규 진료시간",
        "summary_guided": "평일 9-18시 안내", "summary_unresolved": "야간 정보 없음",
        "summary_staff_todo": "야간 진료 여부 확인",
    })
    assert ctx.collected["handoff"]["reason"] == "no_answer"
    assert "직원" in out


@pytest.mark.asyncio
async def test_propose_card_requires_login():
    ctx = ToolContext(patient=None, conversation_id=uuid4())
    out = await execute_tool(ctx, "propose_booking_card", {
        "for_patient_id": str(uuid4()), "department_id": str(uuid4()),
        "doctor_id": str(uuid4()), "slot_id": str(uuid4()),
        "doctor_name": "김의사", "department_name": "내과",
        "slot_date": "2026-07-30", "start_time": "10:00",
    })
    assert "로그인" in out
    assert ctx.collected["card"] is None
```

- [ ] **Step 2: 실패 확인 → 구현**

Run: `cd backend && pytest tests/test_chat_tools.py -v` → FAIL

`backend/app/services/chat_tools.py`:
```python
from dataclasses import dataclass, field
from uuid import UUID

from app.core.patient_security import PatientContext
from app.services import patient_appointment_query_service, patient_catalog_service, rag_search_service

TOOL_DEFINITIONS = [
    {
        "name": "search_hospital_info",
        "description": "병원이 승인한 안내자료에서 답변 근거를 검색한다. 위치·주차·예약 규칙·검사 준비사항 등 안내 질문에 사용. 대화 중 새 주제가 나오면 다시 호출한다.",
        "input_schema": {"type": "object", "properties": {"query": {"type": "string", "description": "검색할 질문"}}, "required": ["query"]},
    },
    {
        "name": "list_departments_doctors",
        "description": "현재 운영 중인 진료과와 의사, 진료 요일·시간을 실제 데이터베이스에서 조회한다. '어떤 과가 있어요?', '무슨 요일에 나오세요?' 같은 질문에 사용. 안내자료가 아닌 살아있는 데이터.",
        "input_schema": {"type": "object", "properties": {"department_id": {"type": "string", "description": "특정 과의 의사만 보려면 지정 (선택)"}}, "required": []},
    },
    {
        "name": "list_available_slots",
        "description": "특정 의사의 특정 날짜 실제 예약 가능 시간을 조회한다. 시간을 지어내지 말고 반드시 이 도구의 결과만 안내할 것.",
        "input_schema": {"type": "object", "properties": {
            "doctor_id": {"type": "string"}, "target_date": {"type": "string", "description": "YYYY-MM-DD"},
        }, "required": ["doctor_id", "target_date"]},
    },
    {
        "name": "get_my_appointments",
        "description": "로그인한 환자 본인의 현재 예약 목록을 조회한다. 로그인하지 않았으면 호출하지 말고 로그인을 안내할 것.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "propose_booking_card",
        "description": "환자가 시간을 골랐을 때 예약 확인 카드를 채팅에 띄운다. 이 도구는 예약을 실행하지 않는다 — 환자가 카드의 버튼을 눌러야 실제 예약된다. 카드를 띄운 뒤에는 환자의 버튼 선택을 기다린다고 안내할 것.",
        "input_schema": {"type": "object", "properties": {
            "for_patient_id": {"type": "string"}, "department_id": {"type": "string"},
            "doctor_id": {"type": "string"}, "slot_id": {"type": "string"},
            "department_name": {"type": "string"}, "doctor_name": {"type": "string"},
            "slot_date": {"type": "string"}, "start_time": {"type": "string"},
        }, "required": ["for_patient_id", "department_id", "doctor_id", "slot_id",
                         "department_name", "doctor_name", "slot_date", "start_time"]},
    },
    {
        "name": "handoff_to_staff",
        "description": "병원 자료에서 답을 찾지 못했거나, 의료진 판단이 필요하거나, 환자가 불만·사고·개인정보·비용 분쟁을 문의하거나, 답변이 도움되지 않았거나, 같은 질문이 반복될 때 직원에게 인계한다. 요약 5개 항목을 성실히 작성할 것.",
        "input_schema": {"type": "object", "properties": {
            "reason": {"type": "string", "enum": ["no_answer", "medical_judgment", "unhelpful", "data_mismatch", "complaint", "repeated"]},
            "summary_question": {"type": "string", "description": "환자가 궁금해한 내용"},
            "summary_confirmed": {"type": "string", "description": "상담봇이 확인한 정보"},
            "summary_guided": {"type": "string", "description": "이미 안내한 내용"},
            "summary_unresolved": {"type": "string", "description": "해결되지 않은 이유"},
            "summary_staff_todo": {"type": "string", "description": "직원이 확인할 사항"},
        }, "required": ["reason", "summary_question", "summary_confirmed",
                         "summary_guided", "summary_unresolved", "summary_staff_todo"]},
    },
]


@dataclass
class ToolContext:
    patient: PatientContext | None
    conversation_id: UUID
    collected: dict = field(default_factory=lambda: {
        "source_chunk_ids": [], "handoff": None, "card": None,
    })


async def execute_tool(ctx: ToolContext, name: str, tool_input: dict) -> str:
    if name == "search_hospital_info":
        results = await rag_search_service.search(tool_input["query"])
        if not results:
            return "관련된 병원 안내자료를 찾지 못했습니다. 지어내지 말고 인계를 고려하세요."
        ctx.collected["source_chunk_ids"].extend(r["chunk_id"] for r in results)
        return "\n\n".join(f"[{r['title']}] {r['content']}" for r in results)

    if name == "list_departments_doctors":
        departments = await patient_catalog_service.list_departments(ctx.patient)
        lines = []
        for d in departments:
            doctors = await patient_catalog_service.list_doctors(d["id"], ctx.patient)
            names = ", ".join(doc["name"] for doc in doctors) or "배정 의사 없음"
            lines.append(f"{d['name']}: {names}")
        return "\n".join(lines) or "운영 중인 진료과가 없습니다."

    if name == "list_available_slots":
        from datetime import date
        slots = await patient_catalog_service.list_available_slots(
            UUID(tool_input["doctor_id"]), date.fromisoformat(tool_input["target_date"]), ctx.patient
        )
        if not slots:
            return "해당 날짜에 예약 가능한 시간이 없습니다."
        return "\n".join(f"slot_id={s['id']} {s['start_time']}" for s in slots)

    if name == "get_my_appointments":
        if ctx.patient is None:
            return "환자가 로그인하지 않았습니다. 예약 확인은 로그인 후 가능하다고 안내하세요."
        rows = await patient_appointment_query_service.list_my_appointments(ctx.patient)
        if not rows:
            return "현재 예약이 없습니다."
        return "\n".join(f"{r['slot_date']} {r['start_time']} {r['department_name']} {r['doctor_name']} ({r['status']})" for r in rows)

    if name == "propose_booking_card":
        if ctx.patient is None:
            return "환자가 로그인하지 않았습니다. 예약은 로그인 후 가능하다고 안내하세요."
        ctx.collected["card"] = tool_input
        return "확인 카드를 띄웠습니다. 환자가 '이 내용으로 예약' 버튼을 누르기를 기다린다고 안내하세요."

    if name == "handoff_to_staff":
        ctx.collected["handoff"] = tool_input
        return "직원 인계가 접수되었습니다. 환자에게 접수 사실과 답변 방식(업무시간 여부에 따라)을 안내하세요."

    return f"알 수 없는 도구: {name}"
```

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_chat_tools.py -v`
Expected: PASS

```bash
git add backend/app/services/chat_tools.py backend/tests/test_chat_tools.py
git commit -m "feat: 상담봇 도구 6종 (예약 실행 도구는 의도적으로 미포함)"
```

---

## Task 9: 대화 오케스트레이션 서비스 (핵심)

**Files:**
- Create: `backend/app/services/chat_service.py`
- Test: `backend/tests/test_chat_service.py`

**Interfaces:**
- Consumes: `run_agent_turn`(Task 7), `chat_tools`(Task 8), `rag_search_service`, `ticket_service.create_ticket`(Task 10 — 여기서는 지연 import; Task 10 완료 전까지는 테스트에서 모킹)
- Produces: `app.services.chat_service.start_conversation(channel: str, patient: PatientContext | None) -> dict`(`{"conversation_id": UUID, "anon_session_token": str | None}` — 익명 web이면 토큰 발급)
- Produces: `app.services.chat_service.resume_anon_conversation(token: str) -> dict | None`
- Produces: `app.services.chat_service.attach_patient(conversation_id: UUID, patient: PatientContext) -> None`(익명 방을 로그인 계정에 연결)
- Produces: `app.services.chat_service.post_message(conversation_id, content, patient=None, anon_token=None, claude=None, embedder=None) -> dict`(`{"reply": str, "message_type": str, "card": dict | None, "handed_over": bool}`)
- Produces: `app.services.chat_service.SYSTEM_PROMPT: str`
- Produces: `app.services.chat_service.list_my_conversations(patient) -> list[dict]`, `get_messages(conversation_id, patient=None, anon_token=None) -> list[dict]`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_chat_service.py`:
```python
import pytest
from tests.test_kb_service import FakeEmbedding
from tests.test_claude_client import FakeAnthropicClient, text_response, tool_response


@pytest.mark.asyncio
async def test_start_anon_web_conversation_issues_token(service_conn):
    from app.services import chat_service

    result = await chat_service.start_conversation(channel="web", patient=None)
    assert result["anon_session_token"]  # 익명 웹 → 진동벨 토큰 발급
    resumed = await chat_service.resume_anon_conversation(result["anon_session_token"])
    assert resumed["conversation_id"] == result["conversation_id"]


@pytest.mark.asyncio
async def test_post_message_saves_and_replies(service_conn):
    from app.services import chat_service

    conv = await chat_service.start_conversation(channel="web", patient=None)
    fake = FakeAnthropicClient([text_response("지하 1층 주차장을 이용하세요.")])
    result = await chat_service.post_message(
        conv["conversation_id"], "주차 되나요?",
        anon_token=conv["anon_session_token"], claude=fake, embedder=FakeEmbedding(),
    )
    assert "주차장" in result["reply"]
    rows = await service_conn.fetch(
        "select sender, content from chat_messages where conversation_id = $1 order by created_at",
        conv["conversation_id"],
    )
    assert [r["sender"] for r in rows] == ["patient", "bot"]


@pytest.mark.asyncio
async def test_handed_over_conversation_bot_stays_silent(service_conn):
    from app.services import chat_service

    conv = await chat_service.start_conversation(channel="web", patient=None)
    await service_conn.execute(
        "update chat_conversations set status = 'handed_over' where id = $1",
        conv["conversation_id"],
    )
    fake = FakeAnthropicClient([])  # 호출되면 IndexError → 봇이 침묵해야 통과
    result = await chat_service.post_message(
        conv["conversation_id"], "추가 질문이요",
        anon_token=conv["anon_session_token"], claude=fake, embedder=FakeEmbedding(),
    )
    assert result["reply"] is None
    assert result["handed_over"] is True


@pytest.mark.asyncio
async def test_claude_failure_falls_back_to_korean_notice(service_conn):
    from app.services import chat_service

    class BrokenClaude:
        class messages:
            @staticmethod
            async def create(**kwargs):
                raise RuntimeError("api down")

    conv = await chat_service.start_conversation(channel="web", patient=None)
    result = await chat_service.post_message(
        conv["conversation_id"], "질문",
        anon_token=conv["anon_session_token"], claude=BrokenClaude(), embedder=FakeEmbedding(),
    )
    assert "직원" in result["reply"]  # 한글 안내 + 문의 남기기 유도 (요구사항 6.4)
    assert result["message_type"] == "text"


@pytest.mark.asyncio
async def test_anon_rate_limit(service_conn, monkeypatch):
    from app.services import chat_service
    from app.core.config import settings
    from app.core.errors import AppError

    monkeypatch.setattr(settings, "anon_rate_limit_per_hour", 2)
    conv = await chat_service.start_conversation(channel="web", patient=None)
    for _ in range(2):
        fake = FakeAnthropicClient([text_response("답변")])
        await chat_service.post_message(
            conv["conversation_id"], "질문", anon_token=conv["anon_session_token"],
            claude=fake, embedder=FakeEmbedding(),
        )
    with pytest.raises(AppError):
        await chat_service.post_message(
            conv["conversation_id"], "또 질문", anon_token=conv["anon_session_token"],
            claude=FakeAnthropicClient([text_response("x")]), embedder=FakeEmbedding(),
        )


@pytest.mark.asyncio
async def test_system_prompt_contains_safety_rules():
    from app.services.chat_service import SYSTEM_PROMPT

    for keyword in ("진단", "119", "지어내"):
        assert keyword in SYSTEM_PROMPT
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
from app.integrations.claude_client import get_claude_client, run_agent_turn
from app.services.chat_tools import TOOL_DEFINITIONS, ToolContext, execute_tool

HISTORY_LIMIT = 20

SYSTEM_PROMPT = """당신은 병원의 AI 상담봇입니다. 병원 안내, 진료과 선택 도움, 예약 안내를 담당합니다.

[절대 규칙 — 위반 금지]
1. 심한 흉통, 호흡곤란, 의식 저하 등 긴급한 표현이 나오면 예약 진행을 멈추고 즉시 119 또는 응급실 이용을 안내하세요. 긴급 여부 판단을 완벽하게 보장한다고 표현하지 마세요.
2. 병명을 진단하지 마세요. 약이나 치료법을 추천하지 마세요. "OO병으로 보입니다"처럼 확정적으로 말하지 마세요. 가능한 진료과를 안내하되 최종 선택은 환자가 확인합니다.
3. 병원 안내는 반드시 search_hospital_info로 검색한 승인 자료를 근거로만 답하세요. 자료에 없는 내용을 지어내지 마세요. 답을 찾지 못하면 handoff_to_staff로 직원에게 인계하세요.
4. 의료진 판단이 필요한 질문, 불만·사고·개인정보·비용 분쟁 문의, 환자가 답변이 도움되지 않았다고 한 경우, 같은 질문이 반복 해결되지 않는 경우에도 인계하세요.
5. 예약을 직접 실행할 수 없습니다. 환자가 시간을 고르면 propose_booking_card로 확인 카드만 띄우고, 실제 예약은 환자가 버튼을 눌러야 됩니다.
6. 존댓말의 친절한 한국어로, 짧고 명확하게 답하세요."""


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


FALLBACK_REPLY = (
    "지금은 상담봇 이용이 어려워요. 문의를 남겨주시면 직원이 확인 후 답변드릴게요. "
    "급한 예약은 앱의 예약 메뉴를 이용해 주세요."
)


async def post_message(
    conversation_id: UUID, content: str, patient: PatientContext | None = None,
    anon_token: str | None = None, claude=None, embedder=None,
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        conv = await _authorize(conn, conversation_id, patient, anon_token)
        if conv["patient_id"] is None:
            await _check_anon_rate_limit(conn, conversation_id)

        await conn.execute(
            "insert into chat_messages (conversation_id, sender, content) values ($1, 'patient', $2)",
            conversation_id, content,
        )
        await conn.execute(
            "update chat_conversations set last_message_at = now() where id = $1", conversation_id
        )

        # 인계된 방에서는 봇이 침묵 (저장만)
        if conv["status"] == "handed_over":
            return {"reply": None, "message_type": "text", "card": None, "handed_over": True}

        history = await conn.fetch(
            "select sender, content from chat_messages where conversation_id = $1 "
            "order by created_at desc limit $2",
            conversation_id, HISTORY_LIMIT,
        )

    claude_messages = [
        {"role": "user" if r["sender"] == "patient" else "assistant", "content": r["content"]}
        for r in reversed(history)
    ]

    ctx = ToolContext(patient=patient, conversation_id=conversation_id)

    async def executor(name: str, tool_input: dict) -> str:
        if embedder is not None and name == "search_hospital_info":
            from app.services import rag_search_service
            results = await rag_search_service.search(tool_input["query"], embedder=embedder)
            if not results:
                return "관련 자료 없음. 지어내지 말고 인계를 고려하세요."
            ctx.collected["source_chunk_ids"].extend(r["chunk_id"] for r in results)
            return "\n\n".join(f"[{r['title']}] {r['content']}" for r in results)
        return await execute_tool(ctx, name, tool_input)

    try:
        result = await run_agent_turn(
            system=SYSTEM_PROMPT, messages=claude_messages,
            tools=TOOL_DEFINITIONS, tool_executor=executor, client=claude,
        )
        reply = result.text or FALLBACK_REPLY
    except Exception as exc:  # Claude/OpenAI 장애 — 예약 기능과 무관하게 상담만 안내로 전환
        log_error("chatbot", f"상담봇 응답 실패: {exc}")
        reply = FALLBACK_REPLY

    handed_over = False
    if ctx.collected["handoff"]:
        from app.services import ticket_service
        await ticket_service.create_ticket(
            conversation_id=conversation_id, patient=patient, **ctx.collected["handoff"]
        )
        handed_over = True

    message_type = "booking_confirm" if ctx.collected["card"] else "text"
    async with pool.acquire() as conn:
        await conn.execute(
            "insert into chat_messages (conversation_id, sender, content, source_chunk_ids, message_type) "
            "values ($1, 'bot', $2, $3, $4)",
            conversation_id, reply, ctx.collected["source_chunk_ids"] or None, message_type,
        )

    return {
        "reply": reply, "message_type": message_type,
        "card": ctx.collected["card"], "handed_over": handed_over,
    }


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
            "select id, sender, content, message_type, created_at from chat_messages "
            "where conversation_id = $1 order by created_at",
            conversation_id,
        )
    return [dict(r) for r in rows]
```

(참고: `test_handed_over...`와 `test_claude_failure...`는 Task 10 이전에 실행되므로, `ticket_service` import는 인계 발생 시에만 지연 로드된다 — 인계 없는 테스트는 Task 10 없이 통과한다. 인계 경로 테스트는 Task 10에서 추가)

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_chat_service.py -v`
Expected: PASS

```bash
git add backend/app/services/chat_service.py backend/tests/test_chat_service.py
git commit -m "feat: 상담 오케스트레이션 - RAG+tool use+침묵 규칙+장애 폴백+익명 제한"
```

---

## Task 10: 인계 티켓 서비스 (생성·직원 답변·알림·복귀)

**Files:**
- Create: `backend/app/services/ticket_service.py`
- Test: `backend/tests/test_ticket_service.py`

**Interfaces:**
- Consumes: `notification_service.notify_patient`(푸시), `sms_client.get_sms_client`(익명 SMS), `settings.business_hour_start/end`
- Produces: `app.services.ticket_service.create_ticket(conversation_id, patient, reason, summary_question, summary_confirmed, summary_guided, summary_unresolved, summary_staff_todo, contact_name=None, contact_phone=None) -> UUID` — 상담방을 `handed_over`로 전환
- Produces: `app.services.ticket_service.is_business_hours(now=None) -> bool`
- Produces: `app.services.ticket_service.list_tickets(staff, status="pending") -> list[dict]`, `get_ticket_detail(ticket_id, staff) -> dict`(요약 5항목 + 원본 대화 포함)
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

    conv = await chat_service.start_conversation(channel="web", patient=None)
    ticket_id = await ticket_service.create_ticket(
        conversation_id=conv["conversation_id"], patient=None, reason="no_answer",
        summary_question="q", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t",
    )
    status = await service_conn.fetchval(
        "select status from chat_conversations where id = $1", conv["conversation_id"]
    )
    assert status == "handed_over"
    row = await service_conn.fetchrow("select * from support_tickets where id = $1", ticket_id)
    assert row["status"] == "pending" and row["summary_question"] == "q"


class FakeSms:
    def __init__(self):
        self.sent = []

    async def send_sms(self, to, body):
        self.sent.append((to, body))


@pytest.mark.asyncio
async def test_answer_ticket_notifies_anon_by_sms_and_returns_to_bot(service_conn, receptionist_staff):
    from app.services import chat_service, ticket_service

    conv = await chat_service.start_conversation(channel="web", patient=None)
    await ticket_service.set_anon_contact(
        conv["conversation_id"], conv["anon_session_token"], "홍길동", "01012345678"
    )
    ticket_id = await ticket_service.create_ticket(
        conversation_id=conv["conversation_id"], patient=None, reason="no_answer",
        summary_question="q", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t",
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
    contact_name: str | None = None, contact_phone: str | None = None,
) -> UUID:
    pool = get_pool()
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
                "summary_staff_todo, reason) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
                conversation_id, patient.id if patient else None, contact_name, contact_phone,
                summary_question, summary_confirmed, summary_guided, summary_unresolved,
                summary_staff_todo, reason,
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
    messages = await pool.fetch(
        "select sender, content, message_type, created_at from chat_messages "
        "where conversation_id = $1 order by created_at",
        ticket["conversation_id"],
    )
    return {**dict(ticket), "messages": [dict(m) for m in messages]}


async def answer_ticket(
    ticket_id: UUID, staff: StaffContext, answer_text: str, sms=None, push=None
) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            ticket = await conn.fetchrow(
                "update support_tickets set status = 'answered', assigned_staff_id = $2, "
                "answered_at = now() where id = $1 and status = 'pending' returning *",
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
git commit -m "feat: 인계 티켓 - 생성/직원답변/알림/봇 복귀"
```

---

## Task 11: 오답 신고 서비스 + 상담봇 처리 현황

**Files:**
- Create: `backend/app/services/answer_feedback_service.py`
- Create: `backend/app/services/bot_stats_service.py`
- Test: `backend/tests/test_answer_feedback_service.py`

**Interfaces:**
- Consumes: `kb_service.update_document/create_document`
- Produces: `app.services.answer_feedback_service.report_wrong_answer(staff, message_id, correction_text) -> UUID`
- Produces: `app.services.answer_feedback_service.list_pending(staff) -> list[dict]`(신고 + 대상 봇 답변 + 근거 자료 제목 포함)
- Produces: `app.services.answer_feedback_service.apply_feedback(staff, feedback_id, document_id=None, embedder=None) -> None` — 관리자만. `document_id` 지정 시 해당 자료 본문 끝에 정정 내용 추가 후 재임베딩, 미지정 시 정정 내용으로 새 자료 생성+즉시 승인. `applied_document_id` 기록
- Produces: `app.services.answer_feedback_service.reject_feedback(staff, feedback_id) -> None`
- Produces: `app.services.bot_stats_service.get_stats(staff, from_date, to_date) -> dict` — `{"conversations_app": int, "conversations_web": int, "handoffs_by_reason": dict, "feedback_count": int}`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_answer_feedback_service.py`:
```python
import pytest
from datetime import date, timedelta
from tests.test_kb_service import FakeEmbedding


async def _make_bot_message(service_conn):
    conv = await service_conn.fetchval(
        "insert into chat_conversations (channel) values ('web') returning id"
    )
    return await service_conn.fetchval(
        "insert into chat_messages (conversation_id, sender, content) "
        "values ($1, 'bot', '잘못된 안내') returning id",
        conv,
    )


@pytest.mark.asyncio
async def test_report_and_apply_creates_document(service_conn, receptionist_staff, admin_staff):
    from app.services import answer_feedback_service as svc

    msg_id = await _make_bot_message(service_conn)
    fb_id = await svc.report_wrong_answer(receptionist_staff, msg_id, "주차는 2시간 무료입니다.")

    await svc.apply_feedback(admin_staff, fb_id, embedder=FakeEmbedding())

    row = await service_conn.fetchrow("select * from answer_feedback where id = $1", fb_id)
    assert row["status"] == "applied" and row["applied_document_id"] is not None
    doc_status = await service_conn.fetchval(
        "select status from kb_documents where id = $1", row["applied_document_id"]
    )
    assert doc_status == "approved"  # 즉시 승인 → 봇이 바로 사용


@pytest.mark.asyncio
async def test_non_admin_cannot_apply(service_conn, receptionist_staff):
    from app.services import answer_feedback_service as svc
    from app.core.errors import AppError

    msg_id = await _make_bot_message(service_conn)
    fb_id = await svc.report_wrong_answer(receptionist_staff, msg_id, "정정")
    with pytest.raises(AppError):
        await svc.apply_feedback(receptionist_staff, fb_id, embedder=FakeEmbedding())


@pytest.mark.asyncio
async def test_stats_counts(service_conn, admin_staff):
    from app.services import bot_stats_service

    await service_conn.execute("insert into chat_conversations (channel) values ('web'), ('app')")
    stats = await bot_stats_service.get_stats(
        admin_staff, date.today() - timedelta(days=1), date.today() + timedelta(days=1)
    )
    assert stats["conversations_web"] >= 1 and stats["conversations_app"] >= 1
    assert "handoffs_by_reason" in stats
```

- [ ] **Step 2: 실패 확인 → 구현**

Run: `cd backend && pytest tests/test_answer_feedback_service.py -v` → FAIL

`backend/app/services/answer_feedback_service.py`:
```python
from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import get_pool
from app.services import kb_service


async def report_wrong_answer(staff: StaffContext, message_id: UUID, correction_text: str) -> UUID:
    pool = get_pool()
    sender = await pool.fetchval("select sender from chat_messages where id = $1", message_id)
    if sender != "bot":
        raise AppError("봇 답변에만 오답 신고를 할 수 있어요.", 400)
    return await pool.fetchval(
        "insert into answer_feedback (message_id, reported_by, correction_text) "
        "values ($1, $2, $3) returning id",
        message_id, staff.id, correction_text,
    )


async def list_pending(staff: StaffContext) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "select f.id, f.correction_text, f.created_at, m.content as bot_answer, "
        "s.name as reporter_name "
        "from answer_feedback f "
        "join chat_messages m on m.id = f.message_id "
        "join staff s on s.id = f.reported_by "
        "where f.status = 'pending' order by f.created_at",
    )
    return [dict(r) for r in rows]


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
        "handoffs_by_reason": {r["reason"]: r["cnt"] for r in reason_rows},
        "feedback_count": feedback_count,
    }
```

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd backend && pytest tests/test_answer_feedback_service.py -v`
Expected: PASS

```bash
git add backend/app/services/answer_feedback_service.py backend/app/services/bot_stats_service.py backend/tests/test_answer_feedback_service.py
git commit -m "feat: 오답 신고/반영 + 상담봇 처리 현황 집계"
```

---

## Task 12: HTTP 라우터 3종 + 통합 테스트

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
  - `POST /chat/conversations/{id}/messages` — body `{content}`. 응답 `{reply, message_type, card, handed_over}`
  - `POST /chat/conversations/{id}/attach` — 로그인 환자가 익명 방을 본인 계정에 연결 (`X-Anon-Session` 필수)
  - `POST /chat/conversations/{id}/contact` — 익명 인계용 연락처 `{name, phone}`
  - `POST /chat/conversations/{id}/leave-ticket` — 봇 장애 시 봇 없이 문의만 남기기 `{content, name?, phone?}`
  - `POST /chat/conversations/{id}/booking` — **확인 카드의 버튼**. body `{for_patient_id, department_id, doctor_id, slot_id}`. 로그인 필수. 내부에서 `patient_booking_service.create_booking` 호출(중복 방지·충돌 처리는 3단계 로직 그대로), 성공 시 `booking_done` 봇 메시지 저장 + `{appointment_id}` 반환, 충돌(슬롯 선점) 시 409 + 한글 안내
- Produces (직원 — `staff_chat.py`, `require_role("receptionist","doctor","admin")`):
  - `GET /staff/chat/tickets?status=`, `GET /staff/chat/tickets/{id}`, `POST /staff/chat/tickets/{id}/answer` `{answer_text}`
  - `GET /staff/chat/conversations?channel=` (전체 상담 기록 — 요구사항 5.1), `GET /staff/chat/conversations/{id}/messages` (각 봇 메시지에 `sources: [{title, content}]` 포함 — 근거 확인, 요구사항 5.6)
  - `POST /staff/chat/messages/{id}/feedback` `{correction_text}` (오답 신고)
- Produces (관리자 — `admin_kb.py`, `require_role("admin")`):
  - `GET/POST /admin/kb/documents`, `PUT /admin/kb/documents/{id}`, `POST /admin/kb/documents/{id}/approve`, `POST /admin/kb/documents/{id}/archive`
  - `GET /admin/kb/feedback`, `POST /admin/kb/feedback/{id}/apply` `{document_id?}`, `POST /admin/kb/feedback/{id}/reject`
  - `GET /admin/kb/stats?from=&to=`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`backend/tests/test_chat_routes.py` (기존 conftest의 `client`(httpx AsyncClient + FastAPI), `patient_auth_headers`, `staff_auth_headers`, `admin_auth_headers` 픽스처 재사용):
```python
import pytest
from tests.test_claude_client import FakeAnthropicClient, text_response
from tests.test_kb_service import FakeEmbedding


@pytest.mark.asyncio
async def test_anon_web_chat_flow(client, monkeypatch):
    from app.routers import chat as chat_router

    monkeypatch.setattr(chat_router, "_claude_factory", lambda: FakeAnthropicClient([text_response("안내드릴게요.")]))
    monkeypatch.setattr(chat_router, "_embedder_factory", lambda: FakeEmbedding())

    r = await client.post("/chat/conversations", json={"channel": "web"})
    assert r.status_code == 200
    token = r.json()["anon_session_token"]
    conv_id = r.json()["conversation_id"]

    r = await client.post(
        f"/chat/conversations/{conv_id}/messages",
        json={"content": "주차 되나요?"}, headers={"X-Anon-Session": token},
    )
    assert r.status_code == 200
    assert r.json()["reply"]

    # 토큰 없이 접근하면 거부
    r = await client.get(f"/chat/conversations/{conv_id}/messages")
    assert r.status_code in (401, 403)


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

    conv = await chat_service.start_conversation(channel="web", patient=None)
    await ticket_service.create_ticket(
        conversation_id=conv["conversation_id"], patient=None, reason="no_answer",
        summary_question="q", summary_confirmed="c", summary_guided="g",
        summary_unresolved="u", summary_staff_todo="t",
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
```

- [ ] **Step 2: 실패 확인 → 라우터 구현**

Run: `cd backend && pytest tests/test_chat_routes.py -v` → FAIL

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
_claude_factory = lambda: None    # None이면 chat_service가 기본 클라이언트 사용
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


@router.post("/conversations/{conversation_id}/messages")
async def post_message(
    conversation_id: UUID, body: MessageBody, request: Request,
    x_anon_session: str | None = Header(default=None),
):
    patient = await get_optional_patient(request)
    return await chat_service.post_message(
        conversation_id, body.content, patient=patient, anon_token=x_anon_session,
        claude=_claude_factory(), embedder=_embedder_factory(),
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

나머지 엔드포인트(resume/attach/contact/leave-ticket/messages 조회, `staff_chat.py`의 티켓·상담기록·오답신고, `admin_kb.py`의 KB CRUD·오답 처리·stats)는 Interfaces 절의 경로·본문 그대로, 위와 같은 얇은 패턴(권한 dependency → 서비스 호출)으로 구현한다. `staff_chat.py`의 봇 메시지 근거는:
```sql
select m.*, coalesce(json_agg(json_build_object('title', d.title, 'content', c.content))
       filter (where c.id is not null), '[]') as sources
from chat_messages m
left join kb_chunks c on c.id = any(m.source_chunk_ids)
left join kb_documents d on d.id = c.document_id
where m.conversation_id = $1
group by m.id order by m.created_at
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
git commit -m "feat: 상담봇 HTTP API - 환자/익명, 직원, 관리자 라우터"
```

---

## Task 13: 연습용 대용량 지식베이스 시드 + RAG 품질 평가 스크립트

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
# 총 약 300개 문서를 만든다 (연습용 대용량 — RAG 실습 목적)


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

## Task 14: 직원 웹 — 상담 관리 (티켓함·티켓 상세·전체 상담 기록·오답 신고)

**Files:**
- Create: `frontend/src/api/chatAdmin.ts`
- Create: `frontend/src/features/chatAdmin/TicketListPage.tsx`
- Create: `frontend/src/features/chatAdmin/TicketDetailPage.tsx`
- Create: `frontend/src/features/chatAdmin/ConversationLogPage.tsx`
- Create: `frontend/src/features/chatAdmin/ReportWrongAnswerDialog.tsx`
- Modify: `frontend/src/App.tsx` (라우트 `/chat-admin/*` + 사이드메뉴 "상담 관리" 추가)
- Test: `frontend/src/features/chatAdmin/TicketDetailPage.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`(2단계), `useRealtimeSubscription(table, onChange)`(2단계), Task 12의 `/staff/chat/*` API
- Produces: `listTickets(status) -> Promise<Ticket[]>`, `getTicketDetail(id) -> Promise<TicketDetail>`, `answerTicket(id, answerText) -> Promise<void>`, `listConversations(channel?) -> Promise<Conversation[]>`, `getConversationMessages(id) -> Promise<MessageWithSources[]>`, `reportWrongAnswer(messageId, correctionText) -> Promise<void>`
- Produces: `<ReportWrongAnswerDialog messageId onDone onCancel />`

- [ ] **Step 1: 실패하는 테스트 작성**

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
```

- [ ] **Step 2: 실패 확인 → 구현**

Run: `cd frontend && npx vitest run src/features/chatAdmin` → FAIL

구현 요점:
- `chatAdmin.ts`: 위 Interfaces의 함수들을 `apiFetch`로 구현
- `TicketListPage`: `pending` 티켓을 접수 순으로 표시. `useRealtimeSubscription("support_tickets", refetch)`로 새 티켓 실시간 반영. 행 클릭 → 상세로 이동
- `TicketDetailPage`: 상단에 요약 5항목(항목명 라벨과 함께), 아래에 원본 대화(말풍선 — `sender`별 정렬/색 구분), 하단 답변 입력란(`aria-label="답변 입력"`) + "답변 보내기" 버튼. `useRealtimeSubscription("chat_messages", refetch)`로 환자 추가 발언 실시간 표시(사실상 채팅처럼 오감). 답변 성공 시 "답변이 전송되었어요" 안내 후 목록으로
- `ConversationLogPage`: 앱·웹 통합 목록(채널 필터), 방 클릭 시 메시지 표시. 봇 메시지 클릭 → `sources`(근거 자료 제목+내용)를 우측 패널에 표시(요구사항 5.6). 봇 메시지 hover 시 "잘못된 답변" 버튼 → `ReportWrongAnswerDialog`(정정 내용 textarea + 제출)
- `App.tsx`: 접수직원·의사·관리자 모두 접근 가능한 "상담 관리" 메뉴 추가

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd frontend && npx vitest run src/features/chatAdmin && npx tsc --noEmit`
Expected: PASS

```bash
git add frontend/src/api/chatAdmin.ts frontend/src/features/chatAdmin/ frontend/src/App.tsx
git commit -m "feat: 직원 웹 상담 관리 - 티켓함/상세/상담기록/오답신고"
```

---

## Task 15: 관리자 웹 — KB 관리·오답 처리함·상담봇 현황

**Files:**
- Create: `frontend/src/api/kbAdmin.ts`
- Create: `frontend/src/features/admin/kb/KbDocumentsPage.tsx`
- Create: `frontend/src/features/admin/kb/KbEditorDialog.tsx`
- Create: `frontend/src/features/admin/kb/FeedbackInboxPage.tsx`
- Create: `frontend/src/features/admin/kb/BotStatsPage.tsx`
- Modify: `frontend/src/App.tsx` (관리자 메뉴에 "병원 안내자료", "오답 처리함", "상담봇 현황" 추가)
- Test: `frontend/src/features/admin/kb/KbDocumentsPage.test.tsx`

**Interfaces:**
- Consumes: Task 12의 `/admin/kb/*` API, `<RequireRole roles={["admin"]}>`(2단계), `<StatTile />`(2단계)
- Produces: `listKbDocuments(status?, category?)`, `createKbDocument(body)`, `updateKbDocument(id, body)`, `approveKbDocument(id)`, `archiveKbDocument(id)`, `listFeedback()`, `applyFeedback(id, documentId?)`, `rejectFeedback(id)`, `getBotStats(from, to)`

- [ ] **Step 1: 실패하는 테스트 작성**

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
```

- [ ] **Step 2: 실패 확인 → 구현**

구현 요점:
- `KbDocumentsPage`: 자료 목록 테이블(제목/분류/상태/수정일), 상태·분류 필터, "새 자료" 버튼 → `KbEditorDialog`(제목·분류 select·본문 textarea). `draft` 행에 "승인" 버튼(승인 시 "승인하면 상담봇이 이 자료를 근거로 사용해요. 자동으로 검색용 조각과 임베딩이 만들어져요" 확인창), `approved` 행에 "수정"(수정 시 재임베딩됨을 안내)과 "보관" 버튼
- `FeedbackInboxPage`: pending 신고 목록(봇 답변 원문 + 직원 정정 내용 + 신고자). 각 행에 "반영"(자료 선택 select — 미선택 시 새 자료로 생성됨 안내) / "반려" 버튼
- `BotStatsPage`: 기간 선택(from/to) + `StatTile` 4개(앱 상담 수/웹 상담 수/인계 건수/오답 신고 수) + 인계 사유별 건수 목록(거창한 차트 없이 숫자 카드 수준 — 스펙 섹션 4)

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd frontend && npx vitest run src/features/admin/kb && npx tsc --noEmit`
Expected: PASS

```bash
git add frontend/src/api/kbAdmin.ts frontend/src/features/admin/kb/ frontend/src/App.tsx
git commit -m "feat: 관리자 KB 관리/오답 처리함/상담봇 현황"
```

---

## Task 16: 웹 상담창 위젯 (별도 Vite 앱)

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
- Consumes: Task 12의 `/chat/*` API, Supabase JS SDK(전화번호+비밀번호 로그인 — 3단계와 동일 Auth, 가입은 OTP 본인확인 → 비밀번호 설정)
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
- `ChatWindow`: 말풍선 목록(환자/봇/직원 구분), 입력창(placeholder "궁금한 점을 입력하세요") + "보내기". 전송 중 버튼 비활성(중복 클릭 방지). 실패 시 말풍선에 "전송에 실패했어요" + "다시 보내기". `message_type`별 렌더: `booking_confirm` → `<BookingCard>`, `booking_done` → 예약번호 + "사전문진은 앱에서 작성할 수 있어요" 안내
- `BookingCard`: 환자·진료과·의사·날짜·시간 표 + `이 내용으로 예약` 버튼 1개. 클릭 → 로그인 상태면 `POST /chat/conversations/{id}/booking`(Supabase 세션의 access token을 Authorization 헤더로), 비로그인이면 `<AuthModal>` 열기. 409(선점) 응답이면 "방금 그 시간이 마감됐어요. 봇에게 다른 시간을 물어보세요" 표시
- `AuthModal`: 로그인 탭(전화번호+비밀번호 — `supabase.auth.signInWithPassword({phone, password})`) / 가입 탭(전화번호 → `signInWithOtp` → OTP 확인 → 비밀번호·이름·생년월일·성별 → 3단계 가입 API 재사용). 성공 시 `POST /chat/conversations/{id}/attach`로 익명 대화를 계정에 연결 후 모달 닫기. 채팅창 위를 덮는 전체 모달(별도 페이지 방식 — 스펙 확정)
- `ContactForm`: 봇 응답의 `handed_over === true`이고 비로그인 상태면 채팅에 인라인 표시 — 이름·휴대폰 입력 → `POST /chat/conversations/{id}/contact`. 제출 후 "답변이 등록되면 문자로 알려드릴게요"
- 직원 답변 실시간 수신: Supabase Realtime은 익명 사용자에게 못 쓰므로(RLS), 웹 위젯은 채팅창이 열려 있는 동안 15초 간격 폴링으로 새 메시지 확인 (단순·충분)

- [ ] **Step 4: 테스트 통과 확인 후 Commit**

Run: `cd webchat && npx vitest run && npx tsc --noEmit`
Expected: PASS

```bash
git add webchat/
git commit -m "feat: 병원 홈페이지용 웹 상담창 위젯 (익명+로그인 전환)"
```

---

## Task 17: Flutter 앱 — AI 상담 화면

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
- Produces: `ChatMessage`(모델: `id, sender, content, messageType, createdAt`), `ChatCard`(모델: 카드 필드), `ChatController`(`AsyncNotifier<List<ChatMessage>>`: `load(conversationId)`, `send(text) -> Future<SendResult>`, `confirmBooking(card) -> Future<String>`(appointment_id), `sendFeedback(messageId, helpful)`)
- Produces: `SendResult`(모델: `reply, messageType, card, handedOver`)

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
    });
    expect(result.messageType, 'booking_confirm');
    expect(result.card!.departmentName, '내과');
  });

  test('인계 응답을 파싱한다 (reply가 null이어도 안전)', () {
    final result = SendResult.fromJson({
      'reply': null, 'message_type': 'text', 'card': null, 'handed_over': true,
    });
    expect(result.handedOver, true);
    expect(result.reply, isNull);
  });
}
```

- [ ] **Step 2: 실패 확인 → 구현**

Run: `cd app && flutter test test/features/chat/` → FAIL

구현 요점:
- `chat_api.dart`: `ApiClient`로 `/chat/*` 호출 (앱은 항상 로그인 상태 — Authorization 자동)
- `chat_list_screen.dart`: `GET /chat/conversations` 목록(마지막 발언 시각 순) + "새 상담 시작" 버튼
- `chat_screen.dart`: 말풍선 UI. 입력 + 전송(`BusyButton` 재사용 — 처리 중 중복 전송 방지). 전송 실패 시 말풍선에 실패 표시 + 재전송(요구사항 4.8 "저장된 것처럼 보이면 안 됨"). 봇 말풍선 하단에 👍/👎 아이콘 — 👎 탭 시 "직원에게 문의를 넘겨드릴까요?" 다이얼로그 → 확인 시 `send("방금 답변이 도움이 되지 않았어요. 직원에게 연결해 주세요.")` 호출(봇이 `handoff_to_staff(reason='unhelpful')`을 사용하게 유도). `message_type` 렌더: `booking_confirm` → `booking_card.dart`, `booking_done` → 예약번호 카드 + "사전문진 작성하기" 버튼(3단계 문진 화면으로 이동)
- `booking_card.dart`: 확인 카드 — 주요 버튼 `이 내용으로 예약` 1개(`BusyButton`). 성공 시 완료 처리, 409면 "방금 그 시간이 마감됐어요" 스낵바 + 봇에게 재문의 유도
- 인계 후: `handedOver == true`면 "업무시간에는 곧, 업무시간이 아니면 다음 영업일에 직원이 답변드려요. 답변이 오면 알림을 보내드릴게요" 시스템 말풍선 표시. FCM `chat_answered` 수신 시 해당 상담방으로 이동
- 직원 답변 실시간 반영: 앱은 로그인 상태이므로 Supabase Realtime 구독(`chat_messages`, 본인 RLS 통과분)으로 새 말풍선 자동 추가

- [ ] **Step 3: 테스트 통과 확인 후 Commit**

Run: `cd app && flutter test && flutter analyze`
Expected: PASS

```bash
git add app/lib/features/chat/ app/lib/router.dart app/test/features/chat/
git commit -m "feat: 앱 AI 상담 - 채팅/카드/피드백/인계/푸시 연동"
```

---

## 실행 순서와 의존 관계

```
Task 1 ─┐
Task 2 ─┼─ Task 4 ── Task 5 ── Task 6 ─┐
Task 3 ─┘                              ├─ Task 8 ── Task 9 ── Task 10 ── Task 11 ── Task 12 ── Task 13
                       Task 7 ─────────┘
백엔드(Task 12) 완료 후: Task 14 / Task 15 / Task 16 / Task 17은 서로 독립 (병렬 가능)
```

## 수동 검증 시나리오 (전체 구현 후)

1. `python scripts/seed_kb.py` 실행(실제 임베딩 — 1회) → `python scripts/rag_eval.py`로 recall 확인. `MAX_CHUNK_CHARS`를 400/800/1600으로 바꿔 재시드하며 점수 비교(RAG 실습 핵심)
2. 웹 상담창(익명): "가슴이 너무 아파요" → 119/응급실 안내 확인, "무슨 병이에요?" → 진단 거절+진료과 안내 확인
3. 웹 상담창(익명): 답 없는 질문 → 인계 → 연락처 남기기 → 직원 웹에서 답변 → SMS 수신 확인 → 같은 브라우저 재방문 시 대화 복원 확인
4. 앱: 상담 → 시간 조회 → 확인 카드 → 버튼 → 예약 완료 카드(예약번호+문진 버튼) → 직원 웹 캘린더에 예약 표시 확인
5. 두 기기로 같은 슬롯 경쟁: 한쪽 카드 버튼이 409 → 봇 재안내 확인
6. 직원 웹: 상담 기록에서 봇 답변 근거 확인 → 오답 신고 → 관리자 반영 → 같은 질문에 정정된 답 확인
7. `ANTHROPIC_API_KEY`를 빈 값으로 바꾸고 상담 시도 → 한글 안내 + 문의 남기기 동작, 앱 예약 기능은 정상 동작 확인 (요구사항 6.4)
