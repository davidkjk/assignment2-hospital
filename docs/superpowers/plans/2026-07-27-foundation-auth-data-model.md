# 1단계: 기반(인증/권한 + 예약·진료상태·수정이력 데이터 모델) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병원 통합 서비스의 백엔드 기반 — 직원 인증/권한(Supabase Auth + RLS), 예약·진료상태·진료기록 수정이력을 포함한 핵심 데이터 모델을 FastAPI + Supabase(Postgres) 위에 구축한다.

**Architecture:** Supabase Postgres에 마이그레이션으로 스키마와 RLS 정책을 만들고, FastAPI는 요청자의 JWT 클레임을 DB 세션에 실어(`request.jwt.claims` + `set local role authenticated`) RLS가 실제 권한 집행을 하도록 한다. 서비스 계층(`app/services/*`)이 슬롯 조건부 UPDATE, 낙관적 잠금(`updated_at` 비교), 상태 이력·수정 이력 기록 같은 트랜잭션 로직을 담당하고, 라우터는 `require_role` 의존성으로 1차 권한 검사 후 서비스를 호출하는 얇은 계층이다.

**Tech Stack:** FastAPI, Supabase (Postgres/Auth), asyncpg, supabase-py(Auth Admin 호출용), pytest + pytest-asyncio, Supabase CLI(로컬 개발)

## Global Constraints

- 백엔드는 FastAPI + Supabase(Postgres)만 사용한다 (스펙 문서 "기술 스택")
- 권한은 Supabase RLS로 강제한다 (스펙 문서 섹션 1)
- 직원 세션은 30분 무활동 시 자동 로그아웃 (Supabase Auth JWT 만료 설정)
- 직원 계정은 관리자의 초대 링크로만 생성된다 (자가입 불가)
- 어떤 테이블도 실제 `DELETE`를 사용하지 않는다 — `is_active` 플래그로 소프트 삭제 (스펙 문서 섹션 2, 소프트 삭제 원칙)
- 완료된 진료기록 수정 시 사유(`reason`)가 필수이며 이전 내용은 `medical_record_revisions`에 보존된다 (스펙 문서 섹션 2)
- 같은 의사·같은 시간 이중예약은 `appointment_slots`의 조건부 UPDATE로 원천 차단한다 (스펙 문서 섹션 3)
- 동시 수정 충돌은 `updated_at` 낙관적 잠금으로 방지한다 (스펙 문서 섹션 3)
- 사용자에게는 한글 안내 메시지만 노출하고, 미처리 예외는 `system_error_log`에 기록한다 (스펙 문서 섹션 3)

---

## Task 1: 프로젝트 스캐폴딩 (FastAPI + Supabase 로컬 개발 환경)

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/pytest.ini`
- Test: `backend/tests/__init__.py`
- Test: `backend/tests/conftest.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Produces: `app.core.config.settings` (Settings 인스턴스, 속성: `supabase_url`, `supabase_anon_key`, `supabase_service_role_key`, `supabase_jwt_secret`, `database_url`, `session_timeout_minutes`)
- Produces: `app.main.app` (FastAPI 인스턴스)

- [ ] **Step 1: Supabase 로컬 스택 초기화**

리포지토리 루트에서 실행:
```bash
supabase init
supabase start
```
`supabase start` 출력에서 `API URL`, `anon key`, `service_role key`, `DB URL`, `JWT secret` 값을 확인한다(다음 스텝에서 `.env`에 채워 넣음).

`supabase/config.toml`에서 세션 만료(30분 자동 로그아웃, 스펙 섹션 1)를 설정한다:
```toml
[auth]
jwt_expiry = 1800
```

- [ ] **Step 2: 백엔드 의존성 정의**

`backend/requirements.txt`:
```
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic-settings==2.6.1
supabase==2.9.1
asyncpg==0.30.0
python-jose[cryptography]==3.3.0
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
```

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

- [ ] **Step 3: 환경설정 파일과 Settings 클래스 작성**

`backend/.env.example`:
```
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
SESSION_TIMEOUT_MINUTES=30
```

`backend/.env`를 `.env.example`을 복사해 만들고 `supabase start` 출력값으로 채운다.

`backend/app/core/config.py`:
```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    database_url: str
    session_timeout_minutes: int = 30

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
```

- [ ] **Step 4: 최소 FastAPI 앱과 헬스체크 작성**

`backend/app/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="Hospital Backend")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 5: 테스트 스캐폴딩 작성**

`backend/pytest.ini`:
```ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

`backend/tests/__init__.py`: 빈 파일.

`backend/tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)
```

`backend/tests/test_health.py`:
```python
def test_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 6: 테스트 실행 확인**

Run: `cd backend && pytest tests/test_health.py -v`
Expected: `test_health_returns_ok` PASS

- [ ] **Step 7: 커밋**

```bash
git add supabase/config.toml backend/requirements.txt backend/.env.example backend/app backend/pytest.ini backend/tests
git commit -m "chore: FastAPI + Supabase 로컬 개발 환경 스캐폴딩"
```

---

## Task 2: 마이그레이션 — departments, staff

**Files:**
- Create: `supabase/migrations/00001_departments_staff.sql`
- Modify: `backend/tests/conftest.py` (DB 픽스처·인증 헬퍼 추가)
- Test: `backend/tests/test_departments_staff_schema.py`

**Interfaces:**
- Produces: `tests.conftest.db_conn` (asyncpg 커넥션, 테스트마다 트랜잭션 롤백)
- Produces: `tests.conftest.seed_staff(conn, role, department_id=None, is_active=True) -> dict` (`{"auth_user_id": UUID, "staff_id": UUID}`)
- Produces: `tests.conftest.set_session_auth(conn, auth_user_id) -> None` (해당 커넥션을 그 사용자로 인증된 것처럼 RLS 세션 설정)
- Produces: DB 테이블 `departments(id, name, is_active)`, `staff(id, auth_user_id, name, role, department_id, is_active, deactivated_by, deactivated_at, created_at)`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/00001_departments_staff.sql`:
```sql
create extension if not exists pgcrypto;

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true
);

create type staff_role as enum ('receptionist', 'doctor', 'admin');

create table staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id),
  name text not null,
  role staff_role not null,
  department_id uuid references departments(id),
  is_active boolean not null default true,
  deactivated_by uuid references staff(id),
  deactivated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table departments enable row level security;
alter table staff enable row level security;

create policy "staff_can_read_departments" on departments
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "admin_can_manage_departments" on departments
  for all
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active))
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active));

create policy "staff_can_read_staff" on staff
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "admin_can_manage_staff" on staff
  for all
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active))
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active));
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 마이그레이션이 오류 없이 적용됨

- [ ] **Step 3: DB 테스트 픽스처와 인증 헬퍼를 conftest.py에 추가**

`backend/tests/conftest.py`에 추가:
```python
import json
import uuid
import pytest
import pytest_asyncio
import asyncpg
from app.core.config import settings


@pytest_asyncio.fixture
async def db_pool():
    pool = await asyncpg.create_pool(settings.database_url)
    yield pool
    await pool.close()


@pytest_asyncio.fixture
async def db_conn(db_pool):
    conn = await db_pool.acquire()
    tr = conn.transaction()
    await tr.start()
    try:
        yield conn
    finally:
        await tr.rollback()
        await db_pool.release(conn)


async def seed_staff(conn, role: str, department_id=None, is_active=True) -> dict:
    auth_user_id = uuid.uuid4()
    email = f"{auth_user_id}@test.local"
    await conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_user_id, email,
    )
    staff_id = await conn.fetchval(
        """
        insert into staff (auth_user_id, name, role, department_id, is_active)
        values ($1, 'Test Staff', $2, $3, $4)
        returning id
        """,
        auth_user_id, role, department_id, is_active,
    )
    return {"auth_user_id": auth_user_id, "staff_id": staff_id}


async def set_session_auth(conn, auth_user_id) -> None:
    await conn.execute(
        "select set_config('request.jwt.claims', $1, true)",
        json.dumps({"sub": str(auth_user_id), "role": "authenticated"}),
    )
    await conn.execute("set local role authenticated")
```

- [ ] **Step 4: 실패하는 스키마/RLS 테스트 작성**

`backend/tests/test_departments_staff_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_departments_table_has_is_active_column(db_conn):
    row = await db_conn.fetchrow(
        "select column_name from information_schema.columns "
        "where table_name = 'departments' and column_name = 'is_active'"
    )
    assert row is not None


@pytest.mark.asyncio
async def test_active_staff_can_read_departments(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await db_conn.execute("insert into departments (name) values ('내과')")
    await set_session_auth(db_conn, admin["auth_user_id"])

    rows = await db_conn.fetch("select * from departments")
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_receptionist_cannot_create_department(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, receptionist["auth_user_id"])

    with pytest.raises(Exception):
        await db_conn.execute("insert into departments (name) values ('정형외과')")


@pytest.mark.asyncio
async def test_inactive_staff_cannot_read_staff_list(db_conn):
    inactive = await seed_staff(db_conn, role="receptionist", is_active=False)
    await set_session_auth(db_conn, inactive["auth_user_id"])

    rows = await db_conn.fetch("select * from staff")
    assert rows == []
```

- [ ] **Step 5: 테스트 실행**

Run: `cd backend && pytest tests/test_departments_staff_schema.py -v`
Expected: 4개 테스트 모두 PASS

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/00001_departments_staff.sql backend/tests/conftest.py backend/tests/test_departments_staff_schema.py
git commit -m "feat: departments/staff 테이블과 RLS 정책 추가"
```

---

## Task 3: 마이그레이션 — doctor_schedule_rules, doctor_schedule_exceptions

**Files:**
- Create: `supabase/migrations/00002_doctor_schedule.sql`
- Test: `backend/tests/test_doctor_schedule_schema.py`

**Interfaces:**
- Consumes: `tests.conftest.db_conn`, `seed_staff`, `set_session_auth` (Task 2)
- Produces: DB 테이블 `doctor_schedule_rules(id, doctor_id, weekday, start_time, end_time, slot_duration_minutes, lunch_start, lunch_end, max_daily_appointments, booking_deadline)`, `doctor_schedule_exceptions(id, doctor_id, exception_date, is_closed, override_start_time, override_end_time)`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/00002_doctor_schedule.sql`:
```sql
create table doctor_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references staff(id),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes smallint not null,
  lunch_start time,
  lunch_end time,
  max_daily_appointments int not null,
  booking_deadline time
);

create table doctor_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references staff(id),
  exception_date date not null,
  is_closed boolean not null default true,
  override_start_time time,
  override_end_time time,
  unique (doctor_id, exception_date)
);

alter table doctor_schedule_rules enable row level security;
alter table doctor_schedule_exceptions enable row level security;

create policy "staff_can_read_schedule_rules" on doctor_schedule_rules
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "admin_can_manage_schedule_rules" on doctor_schedule_rules
  for all
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active))
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active));

create policy "staff_can_read_schedule_exceptions" on doctor_schedule_exceptions
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "admin_can_manage_schedule_exceptions" on doctor_schedule_exceptions
  for all
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active))
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active));
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 오류 없이 적용됨

- [ ] **Step 3: 실패하는 테스트 작성**

`backend/tests/test_doctor_schedule_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_admin_can_create_schedule_rule(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])

    await db_conn.execute(
        """
        insert into doctor_schedule_rules
            (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments)
        values ($1, 1, '09:00', '18:00', 20, 30)
        """,
        doctor["staff_id"],
    )
    rows = await db_conn.fetch("select * from doctor_schedule_rules")
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_doctor_cannot_create_schedule_rule(db_conn):
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, doctor["auth_user_id"])

    with pytest.raises(Exception):
        await db_conn.execute(
            """
            insert into doctor_schedule_rules
                (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments)
            values ($1, 1, '09:00', '18:00', 20, 30)
            """,
            doctor["staff_id"],
        )


@pytest.mark.asyncio
async def test_exception_date_unique_per_doctor(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])

    await db_conn.execute(
        "insert into doctor_schedule_exceptions (doctor_id, exception_date, is_closed) values ($1, '2026-08-15', true)",
        doctor["staff_id"],
    )
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into doctor_schedule_exceptions (doctor_id, exception_date, is_closed) values ($1, '2026-08-15', true)",
            doctor["staff_id"],
        )
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_doctor_schedule_schema.py -v`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00002_doctor_schedule.sql backend/tests/test_doctor_schedule_schema.py
git commit -m "feat: 의사 스케줄 규칙/예외 테이블과 RLS 정책 추가"
```

---

## Task 4: 마이그레이션 — patients, patient_family_links

**Files:**
- Create: `supabase/migrations/00003_patients.sql`
- Test: `backend/tests/test_patients_schema.py`

**Interfaces:**
- Consumes: `tests.conftest.db_conn`, `seed_staff`, `set_session_auth`
- Produces: DB 테이블 `patients(id, name, birth_date, gender, phone, is_active, updated_at, created_at)`, `patient_family_links(id, account_patient_id, family_patient_id, relation)`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/00003_patients.sql`:
```sql
create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  birth_date date not null,
  gender text not null,
  phone text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table patient_family_links (
  id uuid primary key default gen_random_uuid(),
  account_patient_id uuid not null references patients(id),
  family_patient_id uuid not null references patients(id),
  relation text not null,
  unique (account_patient_id, family_patient_id)
);

alter table patients enable row level security;
alter table patient_family_links enable row level security;

create policy "staff_can_read_patients" on patients
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "receptionist_admin_can_insert_patients" on patients
  for insert
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role in ('receptionist', 'admin') and s.is_active));

create policy "receptionist_admin_can_update_patients" on patients
  for update
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role in ('receptionist', 'admin') and s.is_active))
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role in ('receptionist', 'admin') and s.is_active));

create policy "staff_can_read_family_links" on patient_family_links
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 오류 없이 적용됨

- [ ] **Step 3: 실패하는 테스트 작성**

`backend/tests/test_patients_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_receptionist_can_register_patient(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, receptionist["auth_user_id"])

    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    assert patient_id is not None


@pytest.mark.asyncio
async def test_doctor_cannot_register_patient(db_conn):
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, doctor["auth_user_id"])

    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678')"
        )


@pytest.mark.asyncio
async def test_doctor_can_read_patients(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678')"
    )

    await set_session_auth(db_conn, doctor["auth_user_id"])
    rows = await db_conn.fetch("select * from patients")
    assert len(rows) == 1
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_patients_schema.py -v`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00003_patients.sql backend/tests/test_patients_schema.py
git commit -m "feat: patients/patient_family_links 테이블과 RLS 정책 추가"
```

---

## Task 5: 마이그레이션 — appointment_slots, appointments, appointment_status_history

**Files:**
- Create: `supabase/migrations/00004_appointments.sql`
- Test: `backend/tests/test_appointments_schema.py`

**Interfaces:**
- Consumes: `tests.conftest.db_conn`, `seed_staff`, `set_session_auth`, `departments`(Task 2), `patients`(Task 4)
- Produces: DB 테이블 `appointment_slots(id, doctor_id, slot_date, start_time, status)`, `appointments(id, slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source, queue_position, is_urgent_flag, created_by, updated_at, created_at)`, `appointment_status_history(id, appointment_id, from_status, to_status, changed_by, reason, changed_at)`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/00004_appointments.sql`:
```sql
create table appointment_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references staff(id),
  slot_date date not null,
  start_time time not null,
  status text not null default '빈시간' check (status in ('빈시간', '예약됨', '휴진')),
  unique (doctor_id, slot_date, start_time)
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid references appointment_slots(id),
  account_patient_id uuid not null references patients(id),
  for_patient_id uuid not null references patients(id),
  department_id uuid not null references departments(id),
  doctor_id uuid not null references staff(id),
  reason text,
  status text not null check (status in (
    '예약신청', '예약확정', '도착', '진료대기', '진료중', '진료완료',
    '환자취소', '병원취소', '예약부도'
  )),
  source text not null check (source in ('app', 'chatbot', 'staff')),
  queue_position int,
  is_urgent_flag boolean not null default false,
  created_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id),
  from_status text,
  to_status text not null,
  changed_by uuid not null references staff(id),
  reason text,
  changed_at timestamptz not null default now()
);

alter table appointment_slots enable row level security;
alter table appointments enable row level security;
alter table appointment_status_history enable row level security;

create policy "staff_can_read_slots" on appointment_slots
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "receptionist_admin_can_manage_slots" on appointment_slots
  for all
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role in ('receptionist', 'admin') and s.is_active))
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role in ('receptionist', 'admin') and s.is_active));

create policy "staff_can_read_appointments" on appointments
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "receptionist_admin_can_insert_appointments" on appointments
  for insert
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role in ('receptionist', 'admin') and s.is_active));

create policy "staff_can_update_own_scope_appointments" on appointments
  for update
  using (
    exists (
      select 1 from staff s
      where s.auth_user_id = auth.uid() and s.is_active
        and (s.role in ('receptionist', 'admin') or s.id = appointments.doctor_id)
    )
  )
  with check (
    exists (
      select 1 from staff s
      where s.auth_user_id = auth.uid() and s.is_active
        and (s.role in ('receptionist', 'admin') or s.id = appointments.doctor_id)
    )
  );

create policy "staff_can_read_status_history" on appointment_status_history
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "staff_can_insert_status_history" on appointment_status_history
  for insert
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 오류 없이 적용됨

- [ ] **Step 3: 실패하는 테스트 작성**

`backend/tests/test_appointments_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


async def _seed_department_and_patient(conn):
    dept_id = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    return dept_id, patient_id


@pytest.mark.asyncio
async def test_slot_unique_per_doctor_date_time(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])

    await db_conn.execute(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-01', '09:00')",
        doctor["staff_id"],
    )
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-01', '09:00')",
            doctor["staff_id"],
        )


@pytest.mark.asyncio
async def test_receptionist_can_create_appointment(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id, patient_id = await _seed_department_and_patient(db_conn)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    assert appointment_id is not None


@pytest.mark.asyncio
async def test_doctor_cannot_update_other_doctors_appointment(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor_a = await seed_staff(db_conn, role="doctor")
    doctor_b = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id, patient_id = await _seed_department_and_patient(db_conn)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor_a["staff_id"], receptionist["staff_id"],
    )

    await set_session_auth(db_conn, doctor_b["auth_user_id"])
    result = await db_conn.execute(
        "update appointments set status = '도착' where id = $1", appointment_id
    )
    assert result == "UPDATE 0"
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_appointments_schema.py -v`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00004_appointments.sql backend/tests/test_appointments_schema.py
git commit -m "feat: appointment_slots/appointments/appointment_status_history 테이블과 RLS 정책 추가"
```

---

## Task 6: 마이그레이션 — medical_records, medical_record_revisions

**Files:**
- Create: `supabase/migrations/00005_medical_records.sql`
- Test: `backend/tests/test_medical_records_schema.py`

**Interfaces:**
- Consumes: `tests.conftest.db_conn`, `seed_staff`, `set_session_auth`, `appointments`(Task 5)
- Produces: DB 테이블 `medical_records(id, appointment_id, doctor_id, symptoms, diagnosis, treatment, patient_visible_notes, is_completed, updated_at, created_at)`, `medical_record_revisions(id, record_id, previous_content, revised_by, reason, revised_at)`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/00005_medical_records.sql`:
```sql
create table medical_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) unique,
  doctor_id uuid not null references staff(id),
  symptoms text,
  diagnosis text,
  treatment text,
  patient_visible_notes text,
  is_completed boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table medical_record_revisions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references medical_records(id),
  previous_content jsonb not null,
  revised_by uuid not null references staff(id),
  reason text not null,
  revised_at timestamptz not null default now()
);

alter table medical_records enable row level security;
alter table medical_record_revisions enable row level security;

create policy "staff_can_read_medical_records" on medical_records
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "doctor_can_insert_own_medical_records" on medical_records
  for insert
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'doctor' and s.is_active and s.id = medical_records.doctor_id));

create policy "doctor_can_update_own_medical_records" on medical_records
  for update
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'doctor' and s.is_active and s.id = medical_records.doctor_id))
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'doctor' and s.is_active and s.id = medical_records.doctor_id));

create policy "staff_can_read_revisions" on medical_record_revisions
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "doctor_can_insert_own_revisions" on medical_record_revisions
  for insert
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'doctor' and s.is_active and s.id = medical_record_revisions.revised_by));
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 오류 없이 적용됨

- [ ] **Step 3: 실패하는 테스트 작성**

`backend/tests/test_medical_records_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


async def _seed_appointment_for_doctor(conn, doctor_id, receptionist_id):
    dept_id = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appointment_id = await conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '진료중', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor_id, receptionist_id,
    )
    return appointment_id


@pytest.mark.asyncio
async def test_doctor_can_create_own_medical_record(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    appointment_id = await _seed_appointment_for_doctor(db_conn, doctor["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor["auth_user_id"])
    record_id = await db_conn.fetchval(
        "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침') returning id",
        appointment_id, doctor["staff_id"],
    )
    assert record_id is not None


@pytest.mark.asyncio
async def test_other_doctor_cannot_create_record_for_appointment(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor_a = await seed_staff(db_conn, role="doctor")
    doctor_b = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    appointment_id = await _seed_appointment_for_doctor(db_conn, doctor_a["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor_b["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침')",
            appointment_id, doctor_b["staff_id"],
        )


@pytest.mark.asyncio
async def test_receptionist_can_read_but_not_insert_records(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    appointment_id = await _seed_appointment_for_doctor(db_conn, doctor["staff_id"], receptionist["staff_id"])

    await set_session_auth(db_conn, doctor["auth_user_id"])
    await db_conn.execute(
        "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침')",
        appointment_id, doctor["staff_id"],
    )

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    rows = await db_conn.fetch("select * from medical_records")
    assert len(rows) == 1

    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into medical_records (appointment_id, doctor_id, symptoms) values ($1, $2, '기침')",
            appointment_id, doctor["staff_id"],
        )
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_medical_records_schema.py -v`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00005_medical_records.sql backend/tests/test_medical_records_schema.py
git commit -m "feat: medical_records/medical_record_revisions 테이블과 RLS 정책 추가"
```

---

## Task 7: 마이그레이션 — questionnaire_templates, questionnaire_responses

**Files:**
- Create: `supabase/migrations/00006_questionnaire.sql`
- Test: `backend/tests/test_questionnaire_schema.py`

**Interfaces:**
- Consumes: `tests.conftest.db_conn`, `seed_staff`, `set_session_auth`, `departments`(Task 2), `appointments`(Task 5)
- Produces: DB 테이블 `questionnaire_templates(id, department_id, questions)`, `questionnaire_responses(id, appointment_id, template_id, answers, submitted_at)`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/00006_questionnaire.sql`:
```sql
create table questionnaire_templates (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id),
  questions jsonb not null
);

create table questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) unique,
  template_id uuid not null references questionnaire_templates(id),
  answers jsonb not null,
  submitted_at timestamptz not null default now()
);

alter table questionnaire_templates enable row level security;
alter table questionnaire_responses enable row level security;

create policy "staff_can_read_templates" on questionnaire_templates
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "admin_can_manage_templates" on questionnaire_templates
  for all
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active))
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active));

create policy "staff_can_read_responses" on questionnaire_responses
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

-- 환자가 직접 제출하는 정책은 3단계(환자 앱)에서 환자 인증 연동 시 추가한다
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 오류 없이 적용됨

- [ ] **Step 3: 실패하는 테스트 작성**

`backend/tests/test_questionnaire_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_admin_can_create_template(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await db_conn.fetchval("insert into departments (name) values ('소아과') returning id")

    template_id = await db_conn.fetchval(
        """
        insert into questionnaire_templates (department_id, questions)
        values ($1, '[{"text": "오늘 불편한 증상은?", "type": "text", "required": true}]'::jsonb)
        returning id
        """,
        dept_id,
    )
    assert template_id is not None


@pytest.mark.asyncio
async def test_doctor_cannot_create_template(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id = await db_conn.fetchval("insert into departments (name) values ('소아과') returning id")

    await set_session_auth(db_conn, doctor["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            """
            insert into questionnaire_templates (department_id, questions)
            values ($1, '[]'::jsonb)
            """,
            dept_id,
        )
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_questionnaire_schema.py -v`
Expected: 2개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00006_questionnaire.sql backend/tests/test_questionnaire_schema.py
git commit -m "feat: questionnaire_templates/questionnaire_responses 테이블과 RLS 정책 추가"
```

---

## Task 8: 마이그레이션 — access_audit_log, system_error_log, patient_internal_notes, hospital_settings

**Files:**
- Create: `supabase/migrations/00007_audit_settings.sql`
- Test: `backend/tests/test_audit_settings_schema.py`

**Interfaces:**
- Consumes: `tests.conftest.db_conn`, `seed_staff`, `set_session_auth`, `patients`(Task 4)
- Produces: DB 테이블 `access_audit_log(id, staff_id, patient_id, resource_type, accessed_at)`, `system_error_log(id, occurred_at, feature, message)`, `patient_internal_notes(id, patient_id, staff_id, content, created_at)`, `hospital_settings(id, cancellation_deadline_hours)` (1행 싱글턴)

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/00007_audit_settings.sql`:
```sql
create table access_audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  patient_id uuid not null references patients(id),
  resource_type text not null check (resource_type in ('patient_detail', 'medical_record')),
  accessed_at timestamptz not null default now()
);

create table system_error_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  feature text not null,
  message text not null
);

create table patient_internal_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  staff_id uuid not null references staff(id),
  content text not null,
  created_at timestamptz not null default now()
);

create table hospital_settings (
  id boolean primary key default true check (id),
  cancellation_deadline_hours int not null default 24
);
insert into hospital_settings (id, cancellation_deadline_hours) values (true, 24);

alter table access_audit_log enable row level security;
alter table system_error_log enable row level security;
alter table patient_internal_notes enable row level security;
alter table hospital_settings enable row level security;

create policy "staff_can_insert_own_audit_log" on access_audit_log
  for insert
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active and s.id = access_audit_log.staff_id));

create policy "admin_can_read_audit_log" on access_audit_log
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active));

create policy "admin_can_read_error_log" on system_error_log
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active));

create policy "staff_can_read_internal_notes" on patient_internal_notes
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "staff_can_insert_own_internal_notes" on patient_internal_notes
  for insert
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active and s.id = patient_internal_notes.staff_id));

create policy "staff_can_read_hospital_settings" on hospital_settings
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));

create policy "admin_can_update_hospital_settings" on hospital_settings
  for update
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active))
  with check (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active));
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 오류 없이 적용됨

- [ ] **Step 3: 실패하는 테스트 작성**

`backend/tests/test_audit_settings_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_hospital_settings_is_singleton(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])

    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into hospital_settings (id, cancellation_deadline_hours) values (false, 12)"
        )


@pytest.mark.asyncio
async def test_receptionist_cannot_read_error_log(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, receptionist["auth_user_id"])

    rows = await db_conn.fetch("select * from system_error_log")
    assert rows == []


@pytest.mark.asyncio
async def test_staff_can_insert_internal_note_for_self(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, receptionist["auth_user_id"])
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )

    note_id = await db_conn.fetchval(
        "insert into patient_internal_notes (patient_id, staff_id, content) values ($1, $2, '연락처 확인 필요') returning id",
        patient_id, receptionist["staff_id"],
    )
    assert note_id is not None
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_audit_settings_schema.py -v`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00007_audit_settings.sql backend/tests/test_audit_settings_schema.py
git commit -m "feat: 감사로그/오류로그/내부메모/병원설정 테이블과 RLS 정책 추가"
```

---

## Task 9: 인증/권한 의존성 (get_current_staff, require_role, acquire_as)

**Files:**
- Create: `backend/app/db/__init__.py`
- Create: `backend/app/db/pool.py`
- Create: `backend/app/core/security.py`
- Test: `backend/tests/test_security.py`

**Interfaces:**
- Consumes: `app.core.config.settings`(Task 1), DB 테이블 `staff`(Task 2)
- Produces: `app.db.pool.get_pool() -> asyncpg.Pool`
- Produces: `app.db.pool.acquire_as(auth_user_id: str)` — async context manager, `yield`된 커넥션은 트랜잭션 내에서 `request.jwt.claims`와 `role=authenticated`가 설정됨
- Produces: `app.core.security.StaffContext` (dataclass: `id: UUID`, `auth_user_id: UUID`, `role: str`, `department_id: UUID | None`)
- Produces: `app.core.security.get_current_staff(request: Request) -> StaffContext` (FastAPI dependency)
- Produces: `app.core.security.require_role(*roles: str)` — dependency factory, 반환값은 `Depends`로 사용 가능한 async callable

- [ ] **Step 1: DB 커넥션 풀과 RLS 컨텍스트 헬퍼 작성**

`backend/app/db/pool.py`:
```python
import json
from contextlib import asynccontextmanager

import asyncpg

from app.core.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.database_url)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def acquire_as(auth_user_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "select set_config('request.jwt.claims', $1, true)",
                json.dumps({"sub": auth_user_id, "role": "authenticated"}),
            )
            await conn.execute("set local role authenticated")
            yield conn
```

- [ ] **Step 2: 실패하는 테스트 작성 — 유효하지 않은 토큰**

`backend/tests/test_security.py`:
```python
import json
import time
import uuid

import pytest
from jose import jwt

from app.core.config import settings
from tests.conftest import seed_staff


def make_token(auth_user_id: str) -> str:
    payload = {
        "sub": auth_user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


@pytest.mark.asyncio
async def test_missing_authorization_header_raises_401(client):
    response = client.get("/staff-only-test")
    assert response.status_code in (401, 404)
```

Run: `cd backend && pytest tests/test_security.py -v`
Expected: FAIL (`app.core.security` 모듈이 없음)

- [ ] **Step 3: get_current_staff와 require_role 구현**

`backend/app/core/security.py`:
```python
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt

from app.core.config import settings
from app.db.pool import acquire_as


@dataclass
class StaffContext:
    id: UUID
    auth_user_id: UUID
    role: str
    department_id: UUID | None


async def get_current_staff(request: Request) -> StaffContext:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    token = auth_header.removeprefix("Bearer ")
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="로그인 정보가 올바르지 않습니다.")

    auth_user_id = payload["sub"]
    async with acquire_as(auth_user_id) as conn:
        row = await conn.fetchrow(
            "select id, auth_user_id, role, department_id, is_active from staff where auth_user_id = $1",
            UUID(auth_user_id),
        )

    if row is None or not row["is_active"]:
        raise HTTPException(status_code=403, detail="사용 중지된 계정이거나 등록되지 않은 계정입니다.")

    return StaffContext(
        id=row["id"],
        auth_user_id=row["auth_user_id"],
        role=row["role"],
        department_id=row["department_id"],
    )


def require_role(*roles: str):
    async def dependency(staff: StaffContext = Depends(get_current_staff)) -> StaffContext:
        if staff.role not in roles:
            raise HTTPException(status_code=403, detail="이 기능에 대한 권한이 없습니다.")
        return staff

    return dependency
```

- [ ] **Step 4: get_current_staff에 대한 통합 테스트 작성**

`backend/tests/test_security.py`에 추가:
```python
@pytest.mark.asyncio
async def test_get_current_staff_returns_context_for_valid_token(db_conn):
    from app.core.security import get_current_staff
    from starlette.requests import Request

    doctor = await seed_staff(db_conn, role="doctor")
    token = make_token(str(doctor["auth_user_id"]))

    scope = {
        "type": "http",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
    }
    request = Request(scope)
    staff = await get_current_staff(request)

    assert staff.role == "doctor"
    assert staff.id == doctor["staff_id"]


@pytest.mark.asyncio
async def test_get_current_staff_rejects_missing_header():
    from app.core.security import get_current_staff
    from starlette.requests import Request
    from fastapi import HTTPException

    scope = {"type": "http", "headers": []}
    request = Request(scope)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_staff(request)
    assert exc_info.value.status_code == 401
```

- [ ] **Step 5: 테스트 실행**

Run: `cd backend && pytest tests/test_security.py -v`
Expected: 모든 테스트 PASS
(주: `test_missing_authorization_header_raises_401`은 아직 라우터가 없으므로 404를 반환 — Task 17에서 실제 보호 라우트가 생기면 의미 있는 401 검증으로 대체된다.)

- [ ] **Step 6: 커밋**

```bash
git add backend/app/db backend/app/core/security.py backend/tests/test_security.py
git commit -m "feat: JWT 기반 인증/권한 의존성과 RLS 세션 컨텍스트 추가"
```

---

## Task 10: 오류 처리 기반 (AppError, system_error_log 기록, 예외 핸들러)

**Files:**
- Create: `backend/app/core/errors.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_error_handling.py`

**Interfaces:**
- Consumes: `app.db.pool.get_pool`(Task 9), DB 테이블 `system_error_log`(Task 8)
- Produces: `app.core.errors.AppError(message: str, status_code: int = 400)`
- Produces: `app.core.errors.log_error(feature: str, message: str) -> None`
- Produces: `app.core.errors.app_error_handler`, `app.core.errors.unhandled_exception_handler` (FastAPI 예외 핸들러)

- [ ] **Step 1: AppError와 예외 핸들러 작성**

`backend/app/core/errors.py`:
```python
from fastapi import Request
from fastapi.responses import JSONResponse

from app.db.pool import get_pool


class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code


async def log_error(feature: str, message: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "insert into system_error_log (feature, message) values ($1, $2)",
            feature, message,
        )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    await log_error(feature=request.url.path, message=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의하세요."},
    )
```

- [ ] **Step 2: main.py에 핸들러 등록**

`backend/app/main.py` 수정:
```python
from fastapi import FastAPI

from app.core.errors import AppError, app_error_handler, unhandled_exception_handler

app = FastAPI(title="Hospital Backend")
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`backend/tests/test_error_handling.py`:
```python
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import AppError, app_error_handler, unhandled_exception_handler


def build_test_app() -> FastAPI:
    app = FastAPI()
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    @app.get("/boom-app-error")
    def boom_app_error():
        raise AppError("이미 취소된 예약입니다.", status_code=409)

    @app.get("/boom-unhandled")
    def boom_unhandled():
        raise ValueError("unexpected db failure")

    return app


def test_app_error_returns_korean_message_and_status():
    client = TestClient(build_test_app())
    response = client.get("/boom-app-error")
    assert response.status_code == 409
    assert response.json() == {"detail": "이미 취소된 예약입니다."}


def test_unhandled_exception_hides_internal_message():
    client = TestClient(build_test_app(), raise_server_exceptions=False)
    response = client.get("/boom-unhandled")
    assert response.status_code == 500
    assert "unexpected db failure" not in response.text


@pytest.mark.asyncio
async def test_unhandled_exception_is_logged(db_conn):
    from app.core.errors import log_error

    await log_error(feature="/boom-unhandled", message="unexpected db failure")
    row = await db_conn.fetchrow(
        "select feature, message from system_error_log where feature = '/boom-unhandled'"
    )
    assert row["message"] == "unexpected db failure"
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_error_handling.py -v`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/app/core/errors.py backend/app/main.py backend/tests/test_error_handling.py
git commit -m "feat: 한글 오류 메시지와 system_error_log 기록 처리 추가"
```

---

## Task 11: 환자 등록/조회 서비스

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/patient_service.py`
- Test: `backend/tests/test_patient_service.py`

**Interfaces:**
- Consumes: `app.db.pool.acquire_as`(Task 9), `app.core.security.StaffContext`(Task 9), DB 테이블 `patients`(Task 4)
- Produces: `app.services.patient_service.find_by_phone_and_birthdate(phone: str, birth_date: date, staff: StaffContext) -> UUID | None`
- Produces: `app.services.patient_service.register_patient(name: str, birth_date: date, gender: str, phone: str, staff: StaffContext) -> UUID`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_patient_service.py`:
```python
from datetime import date

import pytest

from app.core.security import StaffContext
from app.services import patient_service
from tests.conftest import seed_staff


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


@pytest.mark.asyncio
async def test_register_and_find_patient(db_conn):
    seed = await seed_staff(db_conn, role="receptionist")
    staff = _to_context(seed, "receptionist")

    patient_id = await patient_service.register_patient(
        name="홍길동", birth_date=date(1985, 3, 1), gender="M", phone="01012345678", staff=staff,
    )
    assert patient_id is not None

    found_id = await patient_service.find_by_phone_and_birthdate(
        phone="01012345678", birth_date=date(1985, 3, 1), staff=staff,
    )
    assert found_id == patient_id


@pytest.mark.asyncio
async def test_find_returns_none_when_no_match(db_conn):
    seed = await seed_staff(db_conn, role="receptionist")
    staff = _to_context(seed, "receptionist")

    found_id = await patient_service.find_by_phone_and_birthdate(
        phone="01099999999", birth_date=date(1990, 1, 1), staff=staff,
    )
    assert found_id is None
```

Run: `cd backend && pytest tests/test_patient_service.py -v`
Expected: FAIL (`app.services.patient_service` 모듈 없음)

- [ ] **Step 2: 최소 구현 작성**

`backend/app/services/patient_service.py`:
```python
from datetime import date
from uuid import UUID

from app.core.security import StaffContext
from app.db.pool import acquire_as


async def find_by_phone_and_birthdate(phone: str, birth_date: date, staff: StaffContext) -> UUID | None:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select id from patients where phone = $1 and birth_date = $2 and is_active",
            phone, birth_date,
        )
    return row["id"] if row else None


async def register_patient(name: str, birth_date: date, gender: str, phone: str, staff: StaffContext) -> UUID:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        patient_id = await conn.fetchval(
            """
            insert into patients (name, birth_date, gender, phone)
            values ($1, $2, $3, $4)
            returning id
            """,
            name, birth_date, gender, phone,
        )
    return patient_id
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_service.py -v`
Expected: 2개 테스트 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/app/services/__init__.py backend/app/services/patient_service.py backend/tests/test_patient_service.py
git commit -m "feat: 환자 등록/조회 서비스 추가"
```

---

## Task 12: 직원 초대/중지 서비스

**Files:**
- Create: `backend/app/db/admin_client.py`
- Create: `backend/app/services/staff_service.py`
- Test: `backend/tests/test_staff_service.py`

**Interfaces:**
- Consumes: `app.core.config.settings`(Task 1), `app.db.pool.acquire_as`(Task 9), `app.core.security.StaffContext`(Task 9)
- Produces: `app.db.admin_client.get_admin_client() -> supabase.Client` (service role 클라이언트)
- Produces: `app.services.staff_service.invite_staff(email: str, name: str, role: str, department_id: UUID | None, invited_by: StaffContext) -> UUID`
- Produces: `app.services.staff_service.deactivate_staff(staff_id: UUID, deactivated_by: StaffContext) -> None`

- [ ] **Step 1: Supabase Admin 클라이언트 팩토리 작성**

`backend/app/db/admin_client.py`:
```python
from supabase import Client, create_client

from app.core.config import settings


def get_admin_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
```

- [ ] **Step 2: 실패하는 테스트 작성 (Admin 호출은 mock 처리)**

`backend/tests/test_staff_service.py`:
```python
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.core.security import StaffContext
from app.services import staff_service
from tests.conftest import seed_staff


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


@pytest.mark.asyncio
async def test_invite_staff_creates_staff_row(db_conn, monkeypatch):
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")

    invited_auth_id = uuid4()
    fake_user = MagicMock()
    fake_user.user.id = str(invited_auth_id)
    fake_admin_client = MagicMock()
    fake_admin_client.auth.admin.invite_user_by_email.return_value = fake_user

    async def fake_seed_auth_user(conn):
        await conn.execute(
            """
            insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
            values ($1, 'new-doctor@test.local', '', now(), now(), now(), 'authenticated', 'authenticated')
            """,
            invited_auth_id,
        )

    await fake_seed_auth_user(db_conn)

    with patch("app.services.staff_service.get_admin_client", return_value=fake_admin_client):
        staff_id = await staff_service.invite_staff(
            email="new-doctor@test.local", name="김의사", role="doctor", department_id=None, invited_by=admin_ctx,
        )

    assert staff_id is not None
    row = await db_conn.fetchrow("select role, name from staff where id = $1", staff_id)
    assert row["role"] == "doctor"
    assert row["name"] == "김의사"


@pytest.mark.asyncio
async def test_deactivate_staff_sets_flags(db_conn):
    admin_seed = await seed_staff(db_conn, role="admin")
    admin_ctx = _to_context(admin_seed, "admin")
    target = await seed_staff(db_conn, role="receptionist")

    await staff_service.deactivate_staff(target["staff_id"], deactivated_by=admin_ctx)

    row = await db_conn.fetchrow(
        "select is_active, deactivated_by from staff where id = $1", target["staff_id"]
    )
    assert row["is_active"] is False
    assert row["deactivated_by"] == admin_ctx.id
```

Run: `cd backend && pytest tests/test_staff_service.py -v`
Expected: FAIL (`app.services.staff_service` 모듈 없음)

- [ ] **Step 3: staff_service 구현**

`backend/app/services/staff_service.py`:
```python
from uuid import UUID

from app.core.security import StaffContext
from app.db.admin_client import get_admin_client
from app.db.pool import acquire_as


async def invite_staff(
    email: str,
    name: str,
    role: str,
    department_id: UUID | None,
    invited_by: StaffContext,
) -> UUID:
    admin = get_admin_client()
    result = admin.auth.admin.invite_user_by_email(email)
    auth_user_id = UUID(result.user.id)

    async with acquire_as(str(invited_by.auth_user_id)) as conn:
        staff_id = await conn.fetchval(
            """
            insert into staff (auth_user_id, name, role, department_id)
            values ($1, $2, $3, $4)
            returning id
            """,
            auth_user_id, name, role, department_id,
        )
    return staff_id


async def deactivate_staff(staff_id: UUID, deactivated_by: StaffContext) -> None:
    async with acquire_as(str(deactivated_by.auth_user_id)) as conn:
        await conn.execute(
            """
            update staff
            set is_active = false, deactivated_by = $2, deactivated_at = now()
            where id = $1
            """,
            staff_id, deactivated_by.id,
        )
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_staff_service.py -v`
Expected: 2개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/app/db/admin_client.py backend/app/services/staff_service.py backend/tests/test_staff_service.py
git commit -m "feat: 관리자 초대 링크 기반 직원 계정 생성/중지 서비스 추가"
```

---

## Task 13: 슬롯 예약 서비스 + 동시성 테스트

**Files:**
- Create: `backend/app/services/slot_service.py`
- Test: `backend/tests/test_slot_service.py`

**Interfaces:**
- Consumes: `app.db.pool.acquire_as`(Task 9), `app.core.security.StaffContext`(Task 9), DB 테이블 `appointment_slots`(Task 5)
- Produces: `app.services.slot_service.book_slot(slot_id: UUID, staff: StaffContext, conn=None) -> bool` (기존 커넥션을 재사용할 수 있도록 `conn` 선택적 인자를 받음)

- [ ] **Step 1: 실패하는 동시성 테스트 작성**

`backend/tests/test_slot_service.py`:
```python
import asyncio

import pytest

from app.core.security import StaffContext
from app.services import slot_service
from tests.conftest import seed_staff


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


@pytest.mark.asyncio
async def test_book_slot_succeeds_on_empty_slot(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    staff = _to_context(admin, "admin")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-01', '09:00') returning id",
        doctor["staff_id"],
    )

    booked = await slot_service.book_slot(slot_id, staff, conn=db_conn)
    assert booked is True
    status = await db_conn.fetchval("select status from appointment_slots where id = $1", slot_id)
    assert status == "예약됨"


@pytest.mark.asyncio
async def test_book_slot_fails_when_already_booked(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    staff = _to_context(admin, "admin")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '예약됨') returning id",
        doctor["staff_id"],
    )

    booked = await slot_service.book_slot(slot_id, staff, conn=db_conn)
    assert booked is False


@pytest.mark.asyncio
async def test_only_one_concurrent_booking_succeeds(db_pool):
    async with db_pool.acquire() as setup_conn:
        admin_auth_id = await _seed_admin(setup_conn)
        doctor_id = await _seed_doctor(setup_conn)
        slot_id = await setup_conn.fetchval(
            "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-02', '10:00') returning id",
            doctor_id,
        )

    admin_a = StaffContext(id=None, auth_user_id=admin_auth_id, role="admin", department_id=None)
    admin_b = StaffContext(id=None, auth_user_id=admin_auth_id, role="admin", department_id=None)

    results = await asyncio.gather(
        slot_service.book_slot(slot_id, admin_a),
        slot_service.book_slot(slot_id, admin_b),
    )

    assert sorted(results) == [False, True]


async def _seed_admin(conn) -> "uuid.UUID":
    import uuid

    auth_user_id = uuid.uuid4()
    await conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_user_id, f"{auth_user_id}@test.local",
    )
    await conn.execute(
        "insert into staff (auth_user_id, name, role) values ($1, 'Concurrency Admin', 'admin')",
        auth_user_id,
    )
    return auth_user_id


async def _seed_doctor(conn) -> "uuid.UUID":
    import uuid

    auth_user_id = uuid.uuid4()
    await conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_user_id, f"{auth_user_id}@test.local",
    )
    return await conn.fetchval(
        "insert into staff (auth_user_id, name, role) values ($1, 'Concurrency Doctor', 'doctor') returning id",
        auth_user_id,
    )
```

주: `test_only_one_concurrent_booking_succeeds`는 `db_conn`(트랜잭션 롤백) 픽스처가 아니라 `db_pool`을 직접 써서 커밋된 데이터로 실제 동시 커넥션 경합을 재현한다. 테스트 종료 시 시드 데이터를 정리해야 하므로, `conftest.py`에 세션 종료 후 `truncate` 하는 픽스처를 추가한다(다음 스텝).

Run: `cd backend && pytest tests/test_slot_service.py -v`
Expected: FAIL (`app.services.slot_service` 모듈 없음)

- [ ] **Step 2: conftest.py에 커밋 기반 테스트용 정리 픽스처 추가**

`backend/tests/conftest.py`에 추가:
```python
@pytest_asyncio.fixture(autouse=True)
async def _cleanup_committed_data(db_pool):
    yield
    async with db_pool.acquire() as conn:
        await conn.execute("delete from appointment_slots")
        await conn.execute("delete from staff")
        await conn.execute("delete from auth.users where email like '%@test.local'")
```

- [ ] **Step 3: slot_service 구현**

`backend/app/services/slot_service.py`:
```python
from uuid import UUID

from app.core.security import StaffContext
from app.db.pool import acquire_as


async def book_slot(slot_id: UUID, staff: StaffContext, conn=None) -> bool:
    async def _run(c) -> bool:
        result = await c.execute(
            "update appointment_slots set status = '예약됨' where id = $1 and status = '빈시간'",
            slot_id,
        )
        return result == "UPDATE 1"

    if conn is not None:
        return await _run(conn)

    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_slot_service.py -v`
Expected: 3개 테스트 모두 PASS (동시성 테스트는 두 번의 `book_slot` 호출 중 정확히 하나만 `True`)

- [ ] **Step 5: 커밋**

```bash
git add backend/app/services/slot_service.py backend/tests/test_slot_service.py backend/tests/conftest.py
git commit -m "feat: 슬롯 조건부 예약 서비스와 동시성 테스트 추가"
```

---

## Task 14: 예약 생성/상태전이/대기순서/응급표시 서비스

**Files:**
- Create: `backend/app/services/appointment_service.py`
- Test: `backend/tests/test_appointment_service.py`

**Interfaces:**
- Consumes: `app.db.pool.acquire_as`(Task 9), `app.core.errors.AppError`(Task 10), `app.services.slot_service.book_slot`(Task 13), `app.core.security.StaffContext`(Task 9)
- Produces: `app.services.appointment_service.create_appointment(staff, account_patient_id, for_patient_id, department_id, doctor_id, reason, source, initial_status, slot_id=None) -> UUID`
- Produces: `app.services.appointment_service.transition_status(appointment_id, new_status, staff, reason, expected_updated_at) -> None`
- Produces: `app.services.appointment_service.reorder_queue(appointment_id, new_position, staff, reason) -> None`
- Produces: `app.services.appointment_service.set_urgent_flag(appointment_id, is_urgent, staff, expected_updated_at) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_appointment_service.py`:
```python
import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import appointment_service, slot_service
from tests.conftest import seed_staff


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


async def _seed_base(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    return {
        "admin": _to_context(admin, "admin"),
        "receptionist": _to_context(receptionist, "receptionist"),
        "doctor": _to_context(doctor, "doctor"),
        "dept_id": dept_id,
        "patient_id": patient_id,
    }


@pytest.mark.asyncio
async def test_create_appointment_without_slot(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await appointment_service.create_appointment(
        staff=ctx["receptionist"],
        account_patient_id=ctx["patient_id"],
        for_patient_id=ctx["patient_id"],
        department_id=ctx["dept_id"],
        doctor_id=ctx["doctor"].id,
        reason="감기",
        source="staff",
        initial_status="예약확정",
    )
    row = await db_conn.fetchrow("select status, slot_id from appointments where id = $1", appointment_id)
    assert row["status"] == "예약확정"
    assert row["slot_id"] is None


@pytest.mark.asyncio
async def test_create_appointment_with_already_booked_slot_raises(db_conn):
    ctx = await _seed_base(db_conn)
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '예약됨') returning id",
        ctx["doctor"].id,
    )

    with pytest.raises(AppError):
        await appointment_service.create_appointment(
            staff=ctx["receptionist"],
            account_patient_id=ctx["patient_id"],
            for_patient_id=ctx["patient_id"],
            department_id=ctx["dept_id"],
            doctor_id=ctx["doctor"].id,
            reason="감기",
            source="staff",
            initial_status="예약확정",
            slot_id=slot_id,
        )


@pytest.mark.asyncio
async def test_transition_status_records_history(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await appointment_service.create_appointment(
        staff=ctx["receptionist"],
        account_patient_id=ctx["patient_id"],
        for_patient_id=ctx["patient_id"],
        department_id=ctx["dept_id"],
        doctor_id=ctx["doctor"].id,
        reason="감기",
        source="staff",
        initial_status="예약확정",
    )
    row = await db_conn.fetchrow("select updated_at from appointments where id = $1", appointment_id)

    await appointment_service.transition_status(
        appointment_id, "도착", ctx["receptionist"], reason=None, expected_updated_at=row["updated_at"],
    )

    status = await db_conn.fetchval("select status from appointments where id = $1", appointment_id)
    assert status == "도착"
    history_count = await db_conn.fetchval(
        "select count(*) from appointment_status_history where appointment_id = $1", appointment_id
    )
    assert history_count == 2  # 생성 시 1건 + 상태전이 1건


@pytest.mark.asyncio
async def test_transition_status_rejects_stale_updated_at(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await appointment_service.create_appointment(
        staff=ctx["receptionist"],
        account_patient_id=ctx["patient_id"],
        for_patient_id=ctx["patient_id"],
        department_id=ctx["dept_id"],
        doctor_id=ctx["doctor"].id,
        reason="감기",
        source="staff",
        initial_status="예약확정",
    )

    from datetime import datetime, timezone

    with pytest.raises(AppError) as exc_info:
        await appointment_service.transition_status(
            appointment_id, "도착", ctx["receptionist"], reason=None,
            expected_updated_at=datetime(2000, 1, 1, tzinfo=timezone.utc),
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_transition_status_rejects_invalid_transition(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await appointment_service.create_appointment(
        staff=ctx["receptionist"],
        account_patient_id=ctx["patient_id"],
        for_patient_id=ctx["patient_id"],
        department_id=ctx["dept_id"],
        doctor_id=ctx["doctor"].id,
        reason="감기",
        source="staff",
        initial_status="예약확정",
    )
    row = await db_conn.fetchrow("select updated_at from appointments where id = $1", appointment_id)

    with pytest.raises(AppError) as exc_info:
        await appointment_service.transition_status(
            appointment_id, "진료완료", ctx["receptionist"], reason=None, expected_updated_at=row["updated_at"],
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_reorder_queue_updates_position_and_reason(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by, queue_position)
        values ($1, $1, $2, $3, '진료대기', 'staff', $4, 1)
        returning id
        """,
        ctx["patient_id"], ctx["dept_id"], ctx["doctor"].id, ctx["receptionist"].id,
    )

    await appointment_service.reorder_queue(appointment_id, 3, ctx["receptionist"], reason="응급환자 우선")

    position = await db_conn.fetchval("select queue_position from appointments where id = $1", appointment_id)
    assert position == 3
    reason = await db_conn.fetchval(
        "select reason from appointment_status_history where appointment_id = $1 order by changed_at desc limit 1",
        appointment_id,
    )
    assert reason == "응급환자 우선"


@pytest.mark.asyncio
async def test_set_urgent_flag(db_conn):
    ctx = await _seed_base(db_conn)
    appointment_id = await appointment_service.create_appointment(
        staff=ctx["receptionist"],
        account_patient_id=ctx["patient_id"],
        for_patient_id=ctx["patient_id"],
        department_id=ctx["dept_id"],
        doctor_id=ctx["doctor"].id,
        reason="흉통 호소",
        source="staff",
        initial_status="도착",
    )
    row = await db_conn.fetchrow("select updated_at from appointments where id = $1", appointment_id)

    await appointment_service.set_urgent_flag(appointment_id, True, ctx["receptionist"], row["updated_at"])

    flag = await db_conn.fetchval("select is_urgent_flag from appointments where id = $1", appointment_id)
    assert flag is True
```

Run: `cd backend && pytest tests/test_appointment_service.py -v`
Expected: FAIL (`app.services.appointment_service` 모듈 없음)

- [ ] **Step 2: appointment_service 구현**

`backend/app/services/appointment_service.py`:
```python
from datetime import datetime
from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import acquire_as
from app.services.slot_service import book_slot

VALID_TRANSITIONS: dict[str, set[str]] = {
    "예약신청": {"예약확정", "환자취소", "병원취소"},
    "예약확정": {"도착", "환자취소", "병원취소", "예약부도"},
    "도착": {"진료대기"},
    "진료대기": {"진료중"},
    "진료중": {"진료완료"},
}


async def create_appointment(
    staff: StaffContext,
    account_patient_id: UUID,
    for_patient_id: UUID,
    department_id: UUID,
    doctor_id: UUID,
    reason: str,
    source: str,
    initial_status: str,
    slot_id: UUID | None = None,
) -> UUID:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        if slot_id is not None:
            booked = await book_slot(slot_id, staff, conn=conn)
            if not booked:
                raise AppError("이미 예약된 시간입니다. 다른 시간을 선택하세요.", status_code=409)

        appointment_id = await conn.fetchval(
            """
            insert into appointments
                (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source, created_by)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            returning id
            """,
            slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason,
            initial_status, source, staff.id,
        )
        await conn.execute(
            """
            insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
            values ($1, null, $2, $3, '예약 생성')
            """,
            appointment_id, initial_status, staff.id,
        )
    return appointment_id


async def transition_status(
    appointment_id: UUID,
    new_status: str,
    staff: StaffContext,
    reason: str | None,
    expected_updated_at: datetime,
) -> None:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select status, updated_at from appointments where id = $1", appointment_id,
        )
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        if row["updated_at"] != expected_updated_at:
            raise AppError("다른 직원이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.", status_code=409)
        if new_status not in VALID_TRANSITIONS.get(row["status"], set()):
            raise AppError(
                f"'{row['status']}' 상태에서는 '{new_status}'(으)로 변경할 수 없습니다.", status_code=400,
            )

        await conn.execute(
            "update appointments set status = $1, updated_at = now() where id = $2",
            new_status, appointment_id,
        )
        await conn.execute(
            """
            insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
            values ($1, $2, $3, $4, $5)
            """,
            appointment_id, row["status"], new_status, staff.id, reason,
        )


async def reorder_queue(
    appointment_id: UUID,
    new_position: int,
    staff: StaffContext,
    reason: str,
) -> None:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select id from appointments where id = $1 and status = '진료대기'", appointment_id,
        )
        if row is None:
            raise AppError("대기 중인 예약만 순서를 변경할 수 있습니다.", status_code=400)

        await conn.execute(
            "update appointments set queue_position = $1, updated_at = now() where id = $2",
            new_position, appointment_id,
        )
        await conn.execute(
            """
            insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
            values ($1, '진료대기', '진료대기', $2, $3)
            """,
            appointment_id, staff.id, reason,
        )


async def set_urgent_flag(
    appointment_id: UUID,
    is_urgent: bool,
    staff: StaffContext,
    expected_updated_at: datetime,
) -> None:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        result = await conn.execute(
            "update appointments set is_urgent_flag = $1, updated_at = now() where id = $2 and updated_at = $3",
            is_urgent, appointment_id, expected_updated_at,
        )
    if result == "UPDATE 0":
        raise AppError("다른 직원이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.", status_code=409)
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_appointment_service.py -v`
Expected: 7개 테스트 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/app/services/appointment_service.py backend/tests/test_appointment_service.py
git commit -m "feat: 예약 생성/상태전이/대기순서/응급표시 서비스 추가"
```

---

## Task 15: 진료기록 서비스 (임시저장/완료/수정이력)

**Files:**
- Create: `backend/app/services/medical_record_service.py`
- Test: `backend/tests/test_medical_record_service.py`

**Interfaces:**
- Consumes: `app.db.pool.acquire_as`(Task 9), `app.core.errors.AppError`(Task 10), `app.core.security.StaffContext`(Task 9)
- Produces: `app.services.medical_record_service.save_draft(appointment_id, staff, symptoms, diagnosis, treatment, patient_visible_notes) -> UUID`
- Produces: `app.services.medical_record_service.complete_record(record_id, staff) -> None`
- Produces: `app.services.medical_record_service.revise_record(record_id, staff, new_content: dict, reason: str, expected_updated_at) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_medical_record_service.py`:
```python
import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import medical_record_service
from tests.conftest import seed_staff


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


async def _seed_appointment(db_conn, doctor_ctx, receptionist_id):
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    return await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '진료중', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor_ctx.id, receptionist_id,
    )


@pytest.mark.asyncio
async def test_save_draft_creates_then_updates_record(db_conn):
    doctor = _to_context(await seed_staff(db_conn, role="doctor"), "doctor")
    receptionist = await seed_staff(db_conn, role="receptionist")
    appointment_id = await _seed_appointment(db_conn, doctor, receptionist["staff_id"])

    record_id = await medical_record_service.save_draft(
        appointment_id, doctor, symptoms="기침", diagnosis="", treatment="", patient_visible_notes="",
    )
    record_id_2 = await medical_record_service.save_draft(
        appointment_id, doctor, symptoms="기침, 발열", diagnosis="감기", treatment="처방전 발행", patient_visible_notes="충분히 쉬세요",
    )
    assert record_id == record_id_2

    row = await db_conn.fetchrow("select symptoms, diagnosis from medical_records where id = $1", record_id)
    assert row["symptoms"] == "기침, 발열"
    assert row["diagnosis"] == "감기"


@pytest.mark.asyncio
async def test_complete_record_marks_completed(db_conn):
    doctor = _to_context(await seed_staff(db_conn, role="doctor"), "doctor")
    receptionist = await seed_staff(db_conn, role="receptionist")
    appointment_id = await _seed_appointment(db_conn, doctor, receptionist["staff_id"])
    record_id = await medical_record_service.save_draft(
        appointment_id, doctor, symptoms="기침", diagnosis="감기", treatment="처방", patient_visible_notes="휴식 권장",
    )

    await medical_record_service.complete_record(record_id, doctor)

    is_completed = await db_conn.fetchval("select is_completed from medical_records where id = $1", record_id)
    assert is_completed is True


@pytest.mark.asyncio
async def test_save_draft_after_completion_raises(db_conn):
    doctor = _to_context(await seed_staff(db_conn, role="doctor"), "doctor")
    receptionist = await seed_staff(db_conn, role="receptionist")
    appointment_id = await _seed_appointment(db_conn, doctor, receptionist["staff_id"])
    record_id = await medical_record_service.save_draft(
        appointment_id, doctor, symptoms="기침", diagnosis="감기", treatment="처방", patient_visible_notes="휴식 권장",
    )
    await medical_record_service.complete_record(record_id, doctor)

    with pytest.raises(AppError):
        await medical_record_service.save_draft(
            appointment_id, doctor, symptoms="수정 시도", diagnosis="감기", treatment="처방", patient_visible_notes="휴식 권장",
        )


@pytest.mark.asyncio
async def test_revise_record_requires_reason_and_preserves_history(db_conn):
    doctor = _to_context(await seed_staff(db_conn, role="doctor"), "doctor")
    receptionist = await seed_staff(db_conn, role="receptionist")
    appointment_id = await _seed_appointment(db_conn, doctor, receptionist["staff_id"])
    record_id = await medical_record_service.save_draft(
        appointment_id, doctor, symptoms="기침", diagnosis="감기", treatment="처방", patient_visible_notes="휴식 권장",
    )
    await medical_record_service.complete_record(record_id, doctor)
    row = await db_conn.fetchrow("select updated_at from medical_records where id = $1", record_id)

    with pytest.raises(AppError):
        await medical_record_service.revise_record(
            record_id, doctor,
            new_content={"symptoms": "기침(오타수정)", "diagnosis": "감기", "treatment": "처방", "patient_visible_notes": "휴식 권장"},
            reason="",
            expected_updated_at=row["updated_at"],
        )

    await medical_record_service.revise_record(
        record_id, doctor,
        new_content={"symptoms": "기침(오타수정)", "diagnosis": "감기", "treatment": "처방", "patient_visible_notes": "휴식 권장"},
        reason="증상 오타 수정",
        expected_updated_at=row["updated_at"],
    )

    updated = await db_conn.fetchrow("select symptoms from medical_records where id = $1", record_id)
    assert updated["symptoms"] == "기침(오타수정)"

    revision = await db_conn.fetchrow(
        "select previous_content, reason from medical_record_revisions where record_id = $1", record_id
    )
    assert revision["reason"] == "증상 오타 수정"
    assert revision["previous_content"]["symptoms"] == "기침"
```

Run: `cd backend && pytest tests/test_medical_record_service.py -v`
Expected: FAIL (`app.services.medical_record_service` 모듈 없음)

- [ ] **Step 2: medical_record_service 구현**

`backend/app/services/medical_record_service.py`:
```python
import json
from datetime import datetime
from uuid import UUID

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import acquire_as


async def save_draft(
    appointment_id: UUID,
    staff: StaffContext,
    symptoms: str,
    diagnosis: str,
    treatment: str,
    patient_visible_notes: str,
) -> UUID:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        existing = await conn.fetchrow(
            "select id, is_completed from medical_records where appointment_id = $1", appointment_id,
        )
        if existing and existing["is_completed"]:
            raise AppError(
                "완료된 진료기록은 임시저장할 수 없습니다. 수정하려면 수정 사유를 입력하세요.", status_code=400,
            )

        if existing:
            await conn.execute(
                """
                update medical_records
                set symptoms = $1, diagnosis = $2, treatment = $3, patient_visible_notes = $4, updated_at = now()
                where id = $5
                """,
                symptoms, diagnosis, treatment, patient_visible_notes, existing["id"],
            )
            return existing["id"]

        return await conn.fetchval(
            """
            insert into medical_records (appointment_id, doctor_id, symptoms, diagnosis, treatment, patient_visible_notes)
            values ($1, $2, $3, $4, $5, $6)
            returning id
            """,
            appointment_id, staff.id, symptoms, diagnosis, treatment, patient_visible_notes,
        )


async def complete_record(record_id: UUID, staff: StaffContext) -> None:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        result = await conn.execute(
            "update medical_records set is_completed = true, updated_at = now() where id = $1 and doctor_id = $2",
            record_id, staff.id,
        )
    if result == "UPDATE 0":
        raise AppError("진료기록을 완료 처리할 수 없습니다.", status_code=400)


async def revise_record(
    record_id: UUID,
    staff: StaffContext,
    new_content: dict,
    reason: str,
    expected_updated_at: datetime,
) -> None:
    if not reason.strip():
        raise AppError("수정 사유를 입력해야 합니다.", status_code=400)

    async with acquire_as(str(staff.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select symptoms, diagnosis, treatment, patient_visible_notes, is_completed, updated_at "
            "from medical_records where id = $1 and doctor_id = $2",
            record_id, staff.id,
        )
        if row is None:
            raise AppError("진료기록을 찾을 수 없습니다.", status_code=404)
        if not row["is_completed"]:
            raise AppError("완료되지 않은 기록은 임시저장 기능으로 수정하세요.", status_code=400)
        if row["updated_at"] != expected_updated_at:
            raise AppError("다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.", status_code=409)

        previous_content = {
            "symptoms": row["symptoms"],
            "diagnosis": row["diagnosis"],
            "treatment": row["treatment"],
            "patient_visible_notes": row["patient_visible_notes"],
        }

        await conn.execute(
            """
            insert into medical_record_revisions (record_id, previous_content, revised_by, reason)
            values ($1, $2, $3, $4)
            """,
            record_id, json.dumps(previous_content), staff.id, reason,
        )
        await conn.execute(
            """
            update medical_records
            set symptoms = $1, diagnosis = $2, treatment = $3, patient_visible_notes = $4, updated_at = now()
            where id = $5
            """,
            new_content["symptoms"], new_content["diagnosis"], new_content["treatment"],
            new_content["patient_visible_notes"], record_id,
        )
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_medical_record_service.py -v`
Expected: 4개 테스트 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/app/services/medical_record_service.py backend/tests/test_medical_record_service.py
git commit -m "feat: 진료기록 임시저장/완료/수정이력 서비스 추가"
```

---

## Task 16: 열람 감사로그 서비스

**Files:**
- Create: `backend/app/services/audit_service.py`
- Test: `backend/tests/test_audit_service.py`

**Interfaces:**
- Consumes: `app.db.pool.acquire_as`(Task 9), `app.core.security.StaffContext`(Task 9), DB 테이블 `access_audit_log`(Task 8)
- Produces: `app.services.audit_service.log_access(patient_id: UUID, resource_type: str, staff: StaffContext) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_audit_service.py`:
```python
import pytest

from app.core.security import StaffContext
from app.services import audit_service
from tests.conftest import seed_staff


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


@pytest.mark.asyncio
async def test_log_access_records_entry(db_conn):
    receptionist = _to_context(await seed_staff(db_conn, role="receptionist"), "receptionist")
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )

    await audit_service.log_access(patient_id, "patient_detail", receptionist)

    row = await db_conn.fetchrow(
        "select staff_id, patient_id, resource_type from access_audit_log where patient_id = $1", patient_id,
    )
    assert row["staff_id"] == receptionist.id
    assert row["resource_type"] == "patient_detail"
```

Run: `cd backend && pytest tests/test_audit_service.py -v`
Expected: FAIL (`app.services.audit_service` 모듈 없음)

- [ ] **Step 2: audit_service 구현**

`backend/app/services/audit_service.py`:
```python
from uuid import UUID

from app.core.security import StaffContext
from app.db.pool import acquire_as


async def log_access(patient_id: UUID, resource_type: str, staff: StaffContext) -> None:
    async with acquire_as(str(staff.auth_user_id)) as conn:
        await conn.execute(
            "insert into access_audit_log (staff_id, patient_id, resource_type) values ($1, $2, $3)",
            staff.id, patient_id, resource_type,
        )
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_audit_service.py -v`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/app/services/audit_service.py backend/tests/test_audit_service.py
git commit -m "feat: 환자정보/진료기록 열람 감사로그 서비스 추가"
```

---

## Task 17: 라우터 연결 + 통합 테스트

**Files:**
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/routers/staff.py`
- Create: `backend/app/routers/appointments.py`
- Create: `backend/app/routers/medical_records.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_routers_integration.py`

**Interfaces:**
- Consumes: 모든 이전 태스크의 서비스/의존성
- Produces: `POST /staff`, `PATCH /staff/{staff_id}/deactivate`, `POST /appointments`, `PATCH /appointments/{appointment_id}/status`, `PATCH /appointments/{appointment_id}/queue-position`, `PATCH /appointments/{appointment_id}/urgent-flag`, `POST /medical-records/draft`, `PATCH /medical-records/{record_id}/complete`, `PATCH /medical-records/{record_id}/revise`

- [ ] **Step 1: staff 라우터 작성**

`backend/app/routers/staff.py`:
```python
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import staff_service

router = APIRouter(prefix="/staff", tags=["staff"])


class InviteStaffRequest(BaseModel):
    email: str
    name: str
    role: str
    department_id: UUID | None = None


class InviteStaffResponse(BaseModel):
    staff_id: UUID


@router.post("", response_model=InviteStaffResponse)
async def invite_staff(
    body: InviteStaffRequest,
    staff: StaffContext = Depends(require_role("admin")),
) -> InviteStaffResponse:
    staff_id = await staff_service.invite_staff(
        email=body.email, name=body.name, role=body.role, department_id=body.department_id, invited_by=staff,
    )
    return InviteStaffResponse(staff_id=staff_id)


@router.patch("/{staff_id}/deactivate")
async def deactivate_staff(
    staff_id: UUID,
    staff: StaffContext = Depends(require_role("admin")),
) -> dict:
    await staff_service.deactivate_staff(staff_id, deactivated_by=staff)
    return {"status": "deactivated"}
```

- [ ] **Step 2: appointments 라우터 작성**

`backend/app/routers/appointments.py`:
```python
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import appointment_service

router = APIRouter(prefix="/appointments", tags=["appointments"])


class CreateAppointmentRequest(BaseModel):
    account_patient_id: UUID
    for_patient_id: UUID
    department_id: UUID
    doctor_id: UUID
    reason: str
    source: str
    initial_status: str
    slot_id: UUID | None = None


class CreateAppointmentResponse(BaseModel):
    appointment_id: UUID


@router.post("", response_model=CreateAppointmentResponse)
async def create_appointment(
    body: CreateAppointmentRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> CreateAppointmentResponse:
    appointment_id = await appointment_service.create_appointment(
        staff=staff,
        account_patient_id=body.account_patient_id,
        for_patient_id=body.for_patient_id,
        department_id=body.department_id,
        doctor_id=body.doctor_id,
        reason=body.reason,
        source=body.source,
        initial_status=body.initial_status,
        slot_id=body.slot_id,
    )
    return CreateAppointmentResponse(appointment_id=appointment_id)


class TransitionStatusRequest(BaseModel):
    new_status: str
    reason: str | None = None
    expected_updated_at: datetime


@router.patch("/{appointment_id}/status")
async def change_status(
    appointment_id: UUID,
    body: TransitionStatusRequest,
    staff: StaffContext = Depends(require_role("receptionist", "doctor", "admin")),
) -> dict:
    await appointment_service.transition_status(
        appointment_id, body.new_status, staff, body.reason, body.expected_updated_at,
    )
    return {"status": "updated"}


class ReorderQueueRequest(BaseModel):
    new_position: int
    reason: str


@router.patch("/{appointment_id}/queue-position")
async def change_queue_position(
    appointment_id: UUID,
    body: ReorderQueueRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    await appointment_service.reorder_queue(appointment_id, body.new_position, staff, body.reason)
    return {"status": "reordered"}


class SetUrgentFlagRequest(BaseModel):
    is_urgent: bool
    expected_updated_at: datetime


@router.patch("/{appointment_id}/urgent-flag")
async def change_urgent_flag(
    appointment_id: UUID,
    body: SetUrgentFlagRequest,
    staff: StaffContext = Depends(require_role("receptionist", "admin")),
) -> dict:
    await appointment_service.set_urgent_flag(appointment_id, body.is_urgent, staff, body.expected_updated_at)
    return {"status": "updated"}
```

- [ ] **Step 3: medical_records 라우터 작성**

`backend/app/routers/medical_records.py`:
```python
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import StaffContext, require_role
from app.services import medical_record_service

router = APIRouter(prefix="/medical-records", tags=["medical-records"])


class SaveDraftRequest(BaseModel):
    appointment_id: UUID
    symptoms: str
    diagnosis: str
    treatment: str
    patient_visible_notes: str


class SaveDraftResponse(BaseModel):
    record_id: UUID


@router.post("/draft", response_model=SaveDraftResponse)
async def save_draft(
    body: SaveDraftRequest,
    staff: StaffContext = Depends(require_role("doctor")),
) -> SaveDraftResponse:
    record_id = await medical_record_service.save_draft(
        body.appointment_id, staff, body.symptoms, body.diagnosis, body.treatment, body.patient_visible_notes,
    )
    return SaveDraftResponse(record_id=record_id)


@router.patch("/{record_id}/complete")
async def complete_record(
    record_id: UUID,
    staff: StaffContext = Depends(require_role("doctor")),
) -> dict:
    await medical_record_service.complete_record(record_id, staff)
    return {"status": "completed"}


class ReviseRecordRequest(BaseModel):
    symptoms: str
    diagnosis: str
    treatment: str
    patient_visible_notes: str
    reason: str
    expected_updated_at: datetime


@router.patch("/{record_id}/revise")
async def revise_record(
    record_id: UUID,
    body: ReviseRecordRequest,
    staff: StaffContext = Depends(require_role("doctor")),
) -> dict:
    await medical_record_service.revise_record(
        record_id, staff,
        new_content={
            "symptoms": body.symptoms,
            "diagnosis": body.diagnosis,
            "treatment": body.treatment,
            "patient_visible_notes": body.patient_visible_notes,
        },
        reason=body.reason,
        expected_updated_at=body.expected_updated_at,
    )
    return {"status": "revised"}
```

- [ ] **Step 4: main.py에 라우터 연결**

`backend/app/main.py` 수정:
```python
from fastapi import FastAPI

from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.routers import appointments, medical_records, staff

app = FastAPI(title="Hospital Backend")
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(staff.router)
app.include_router(appointments.router)
app.include_router(medical_records.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 5: 실패하는 통합 테스트 작성**

`backend/tests/test_routers_integration.py`:
```python
import time

import pytest
from jose import jwt

from app.core.config import settings
from tests.conftest import seed_staff


def make_token(auth_user_id: str) -> str:
    payload = {
        "sub": auth_user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def test_appointments_endpoint_requires_auth(client):
    response = client.post("/appointments", json={})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_receptionist_can_create_appointment_via_api(client, db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    token = make_token(str(receptionist["auth_user_id"]))

    response = client.post(
        "/appointments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "account_patient_id": str(patient_id),
            "for_patient_id": str(patient_id),
            "department_id": str(dept_id),
            "doctor_id": str(doctor["staff_id"]),
            "reason": "감기",
            "source": "staff",
            "initial_status": "예약확정",
        },
    )

    assert response.status_code == 200
    assert "appointment_id" in response.json()


@pytest.mark.asyncio
async def test_doctor_cannot_invite_staff_via_api(client, db_conn):
    doctor = await seed_staff(db_conn, role="doctor")
    token = make_token(str(doctor["auth_user_id"]))

    response = client.post(
        "/staff",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "new@test.local", "name": "새직원", "role": "receptionist"},
    )

    assert response.status_code == 403
```

주: `test_receptionist_can_create_appointment_via_api`와 `test_doctor_cannot_invite_staff_via_api`는 `db_conn`(트랜잭션 롤백)으로 시딩하지만, FastAPI `TestClient`의 요청은 별도 커넥션(풀에서 새로 획득)으로 실행되므로 `db_conn` 트랜잭션이 커밋되기 전에는 라우터가 시드 데이터를 볼 수 없다. 이를 해결하기 위해 이 테스트 파일에서는 `db_conn` 대신 커밋 기반 픽스처를 사용한다 — 다음 스텝에서 conftest.py에 추가한다.

- [ ] **Step 6: 커밋 기반 통합 테스트 픽스처 추가**

`backend/tests/conftest.py`에 추가:
```python
@pytest_asyncio.fixture
async def committed_conn(db_pool):
    async with db_pool.acquire() as conn:
        yield conn
    async with db_pool.acquire() as cleanup_conn:
        await cleanup_conn.execute("delete from appointment_status_history")
        await cleanup_conn.execute("delete from appointments")
        await cleanup_conn.execute("delete from patients")
        await cleanup_conn.execute("delete from departments")
        await cleanup_conn.execute("delete from staff")
        await cleanup_conn.execute("delete from auth.users where email like '%@test.local'")
```

`test_routers_integration.py`에서 `db_conn` 인자를 `committed_conn`으로 교체한다 (두 통합 테스트 함수의 시그니처와 본문 내 `db_conn` 사용처를 `committed_conn`으로 변경).

- [ ] **Step 7: 테스트 실행**

Run: `cd backend && pytest tests/test_routers_integration.py -v`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 8: 전체 테스트 스위트 실행**

Run: `cd backend && pytest -v`
Expected: 전체 테스트 PASS (Task 1~17에서 작성한 모든 테스트)

- [ ] **Step 9: 커밋**

```bash
git add backend/app/routers backend/app/main.py backend/tests/test_routers_integration.py backend/tests/conftest.py
git commit -m "feat: 직원/예약/진료기록 라우터 연결 및 통합 테스트 추가"
```

---

## 스펙 커버리지 확인

- 인증/권한(초대 링크, 자가입 불가, 30분 세션, 역할별 RLS, 열람 감사로그) → Task 1, 2, 9, 16
- 소프트 삭제 원칙 → Task 2, 12 (`is_active`/`deactivated_by`/`deactivated_at`, 실제 DELETE 미사용)
- 진료과·의사 일정(요일/시간/슬롯단위/점심시간/휴진/하루최대인원/예약마감) → Task 3
- 환자·가족 관계 → Task 4, 11
- 예약 슬롯 유니크 제약과 조건부 UPDATE 동시성 제어, 워크인(슬롯 없는 예약) → Task 5, 13, 14
- 예약 9단계 상태·이력·대기순서·응급표시 → Task 5, 14
- 진료기록 임시저장/완료/수정사유 필수/이전내용 보존/의사 단독 작성 → Task 6, 15
- 사전문진 진료과별 양식(JSON, 자체완결 저장) → Task 7
- 오류 로그, 내부메모, 취소마감 설정 → Task 8, 10
- 낙관적 잠금(동시 수정 충돌 방지) → Task 14, 15
- 한글 오류 메시지·외부서비스 장애로부터 핵심 기능 분리 → Task 10

이번 단계에서 다루지 않는 항목(2~5단계에서 다룸): 병원 안내/상담봇 지식관리, 상담문의관리, 운영통계 화면, 알림 발송, 배포/백업 — 스펙 문서의 "이번 단계에서 다루지 않는 것" 섹션과 동일.
