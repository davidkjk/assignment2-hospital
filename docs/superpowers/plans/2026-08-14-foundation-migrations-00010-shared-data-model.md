# 1단계 공용 데이터 모델 마이그레이션(`00010~00016`) 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 각 태스크는 TDD(실패 테스트 → 마이그레이션 → 통과)로 진행한다.

**Goal:** 직원 웹·환자 앱·상담봇이 **공통으로 소비하는** 데이터 모델(섹션 4 ①~⑦)을 `supabase/migrations/00010_*.sql`부터 순차 파일로 신설·확장하고, 각 마이그레이션마다 스키마·RLS 테스트를 짝으로 붙인다.

**Architecture:** 이미 적용된 `00001~00009`(기반) 위에 **추가만** 한다(기존 파일 수정·`db reset` 없음). 논리 단위 하나 = 마이그레이션 파일 하나 = 테스트 파일 하나 = 태스크 하나. 서버(dispatcher)만 쓰는 표는 서비스 역할 커넥션이 RLS를 우회해 읽고 쓰며, 직원이 화면에서 읽는 표만 `is_active_staff`/`admin` 정책을 연다. 환자 인증이 붙는 정책은 3단계(환자 앱)로 미룬다 — `00007`이 "환자 제출 정책은 3단계에서 추가"라고 미룬 것과 같은 방식.

**Tech Stack:** PostgreSQL(Supabase) 순수 SQL 마이그레이션 · RLS(Row Level Security) · pytest + pytest-asyncio + asyncpg 스키마 테스트.

**Spec:** `docs/superpowers/specs/2026-07-27-foundation-auth-data-model-design.md` 섹션 4 (`00010_` 이후 공용 데이터 모델). 근거 결정로그: `docs/superpowers/specs/2026-07-31-ui-design-decisions.md`(기능 갭 번호로 추적).

## Global Constraints

이 절의 규칙은 **모든 태스크에 암묵적으로 포함**된다.

- **번호**: 실제 적용 최신 `00009` 다음 **`00010`부터 순차**. 옛 플랜의 `00200~00204` 번호대는 폐기·재번호(patient-app-design:170).
- **추가만**: `00001~00009` 기존 파일을 수정하지 않는다. 컬럼·제약 변경도 새 `ALTER` 마이그레이션으로.
- ⛔ **`supabase db reset` 금지** — 로컬 DB는 다른 세션과 공용이다. 새 마이그레이션 적용은 **`supabase migration up`**(대기 중인 것만 추가 적용, 비파괴)으로만 한다. reset이 필요하면 사용자 신호를 먼저 받는다.
- **RLS 헬퍼(이미 존재)**: `private.current_staff_id()` · `private.current_staff_role()` · `private.is_active_staff()` · `private.is_admin()`. 새로 만들지 않는다.
- **트랜잭션 래퍼 없음**: Supabase가 각 마이그레이션을 감싼다. 파일에 `begin/commit`을 쓰지 않는다(기존 `00001~00009`와 동일).
- **`notification_log`를 다른 이름으로 복제 금지**(3-A 결정 갈래 ①, ui-design-decisions:4646~4651). 익명 수신자는 같은 표의 컬럼으로 받는다.
- **①**: 마감 후 취소·변경은 **하나의 기록·흐름**으로 처리하되 `request_type`으로 구분한다. **희망 일시는 저장하지 않는다.** 전용 `/cancellation-requests` 대기열은 되살리지 않는다.
- **②**: `channel`에는 **실제 보낸 채널**을 기록한다(상수 `'push'` 박기 금지, #120 — dispatcher 계약). **실패 줄은 dedup 유니크에서 제외**하되 자물쇠 자체는 없애지 않는다("닿은 것만 「보냈다」로 본다", #121). 광고(`marketing`)는 법이 달라 시스템이 갈라야 한다(#110/#104).
- **③**: 끈 알림은 푸시·문자·앱 알림함 **어디에도 생성하지 않는다**. **전부 끌 수 있다**(필수 잠금 없음). **FCM 토큰은 지우지 않는다**(토큰은 `device_tokens`, 3단계 소유).
- **④**: **기본 문구는 DB에 넣지 않는다** — 코드의 기본 문구 표가 원본이고, DB에 줄이 없으면 코드 값을 쓰며 되돌리기는 그 줄을 지우는 것이다. 그래서 이 표에는 **초기 seed insert를 하지 않는다**.
- **⑤**: 수신 차단(환자 선택)은 여기 넣지 않는다 — 번호가 죽은 것과 별개다. "번호를 고치면 두 칸을 비운다"는 서버 로직(consumer)이지 DB 제약이 아니다.

### 테스트 하니스 규칙(기존 `conftest.py`)

- `db_conn` fixture = 트랜잭션을 열고 **끝나면 롤백**한다. 커밋 정리 불필요.
- `set_session_auth(conn, auth_user_id)`를 **호출하기 전**의 `db_conn`은 커넥션 소유자 역할(postgres)이라 **RLS를 우회**한다 → **구조·제약 검증**에 쓴다.
- `set_session_auth(conn, auth_user_id)`를 **호출한 뒤**는 `authenticated` 역할이 되어 **RLS가 적용**된다 → **권한 검증**에 쓴다. `seed_staff(conn, role=...)`로 직원 행+`auth.users`를 만든다.
- ⚠️ 한 트랜잭션 안에서 SQL이 에러를 던지면 그 트랜잭션은 **중단(abort)** 된다 → `pytest.raises`로 확인하는 케이스는 **그 에러가 마지막 문장**이 되도록 테스트를 구성한다.
- ⚠️ `_cleanup_committed_data`는 **고정 테이블 목록**만 지운다. 커밋이 필요한 테스트(`committed_conn`)에서 새 표를 쓸 경우 이 목록에 추가해야 한다 — 이 플랜의 테스트는 전부 `db_conn`(롤백)만 쓰므로 목록 수정이 필요 없다.

---

## File Structure

| 태스크 | 마이그레이션 파일 | 테스트 파일 | 섹션4 | 종류 |
|---|---|---|---|---|
| 1 | `supabase/migrations/00010_appointments_support_request.sql` | `backend/tests/test_appointments_support_request_schema.py` | ① | ALTER |
| 2 | `supabase/migrations/00011_notification_log.sql` | `backend/tests/test_notification_log_schema.py` | ② | CREATE |
| 3 | `supabase/migrations/00012_notification_preferences.sql` | `backend/tests/test_notification_preferences_schema.py` | ③ | CREATE |
| 4 | `supabase/migrations/00013_notification_type_settings.sql` | `backend/tests/test_notification_type_settings_schema.py` | ④ | CREATE |
| 5 | `supabase/migrations/00014_patients_sms_dead.sql` | `backend/tests/test_patients_sms_dead_schema.py` | ⑤ | ALTER |
| 6 | `supabase/migrations/00015_access_audit_log_phone_reveal.sql` | `backend/tests/test_access_audit_log_phone_reveal_schema.py` | ⑥ | ALTER(check) |
| 7 | `supabase/migrations/00016_scheduled_notifications.sql` | `backend/tests/test_scheduled_notifications_schema.py` | ⑦ | CREATE |

**의존 순서**: 태스크 번호 순서가 곧 마이그레이션 번호 순서다. 태스크들은 서로 다른 표를 다뤄 대체로 독립적이나, 번호가 낮은 것이 먼저 적용되어야 한다(상담봇 4단계가 `00011 notification_log`·`00010 appointments` 위에 FK를 걸 수 있도록 이 공용 계열이 먼저 깔린다). ⑧ Twilio 도달 되알림은 **표가 아니라 dispatcher·배포 계약**이라 이 플랜에 마이그레이션이 없다 — 배포 플랜(공개 엔드포인트·서명 검증)과 발송 함수(3단계)에서 다룬다.

**범위 밖(각 단계 플랜이 소유)**: 상담 3-A 8테이블(`chat_threads`·`chat_messages`·`support_tickets` 등, 4단계) · `device_tokens`·가입 동의·예약 멱등 키(3단계) · `staff` 팔레트 인덱스 컬럼 #83·`AD-050` 문진 RLS admin 예외 제거(2단계). 이들은 자기 단계 마이그레이션으로 `00017+`에 이어 붙인다.

---

## Task 1: `appointments` 마감 후 지원 요청 컬럼 (섹션4 ①, 갭 #6/E3)

**Files:**
- Create: `supabase/migrations/00010_appointments_support_request.sql`
- Test: `backend/tests/test_appointments_support_request_schema.py`

**Interfaces:**
- Consumes: 기존 `appointments` 테이블(`00005`).
- Produces: `appointments.support_requested_at (timestamptz, nullable)`, `appointments.request_type (text, nullable, check in ('취소','변경'))`. 앱(기록·배지)·직원 `/today`·캘린더·상담봇 `support_tickets.appointment_id`가 소비.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_appointments_support_request_schema.py`:
```python
import pytest
from tests.conftest import seed_staff


async def _seed_appointment(conn):
    """지원 요청 컬럼을 붙일 대상 예약 하나를 소유자 역할로 만든다(RLS 우회)."""
    dept_id = await conn.fetchval(
        "insert into departments (name) values ('내과') returning id"
    )
    doctor = await seed_staff(conn, role="doctor", department_id=dept_id)
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appt_id = await conn.fetchval(
        """
        insert into appointments
          (account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $1, $2, $3, '예약확정', 'app')
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"],
    )
    return appt_id


@pytest.mark.asyncio
async def test_support_request_columns_exist_and_default_null(db_conn):
    appt_id = await _seed_appointment(db_conn)
    row = await db_conn.fetchrow(
        "select support_requested_at, request_type from appointments where id = $1",
        appt_id,
    )
    assert row["support_requested_at"] is None
    assert row["request_type"] is None


@pytest.mark.asyncio
async def test_request_type_accepts_cancel_and_change(db_conn):
    appt_id = await _seed_appointment(db_conn)
    await db_conn.execute(
        "update appointments set support_requested_at = now(), request_type = '취소' where id = $1",
        appt_id,
    )
    await db_conn.execute("update appointments set request_type = '변경' where id = $1", appt_id)
    val = await db_conn.fetchval("select request_type from appointments where id = $1", appt_id)
    assert val == '변경'


@pytest.mark.asyncio
async def test_request_type_rejects_unknown_value(db_conn):
    appt_id = await _seed_appointment(db_conn)
    with pytest.raises(Exception):
        await db_conn.execute(
            "update appointments set request_type = '반려' where id = $1", appt_id
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_appointments_support_request_schema.py -v`
Expected: FAIL — `column "support_requested_at" does not exist` (아직 마이그레이션 없음).

- [ ] **Step 3: Write the migration**

`supabase/migrations/00010_appointments_support_request.sql`:
```sql
-- 섹션4 ① 마감 후 취소·변경 공통 지원 요청 (갭 #6 / E3, ui-design-decisions:4188~4191, 4273~4276).
-- 옛 설계의 cancellation_requested_at 단일 필드를 폐기하고 support_requested_at + request_type로 대체한다.
-- (cancellation_requested_at은 마이그레이션에 실제 존재한 적이 없어 drop 대상이 없다 — 옛 플랜에만 있었다.)
-- 희망 일시는 저장하지 않는다: 새 시간은 상담 대화에서 정한다.
alter table appointments
  add column support_requested_at timestamptz,
  add column request_type text check (request_type in ('취소', '변경'));

-- 반쯤 채운 상태(요청 시각만 있고 종류가 없거나 그 반대)를 막는다.
alter table appointments
  add constraint appointments_support_request_consistent
  check ((support_requested_at is null) = (request_type is null));
```

- [ ] **Step 4: Apply migration and run test to verify it passes**

Run: `supabase migration up && cd backend && pytest tests/test_appointments_support_request_schema.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00010_appointments_support_request.sql backend/tests/test_appointments_support_request_schema.py
git commit -m "feat: appointments 마감 후 취소·변경 지원 요청 컬럼(00010, 섹션4 ①)"
```

---

## Task 2: `notification_log` 단일 발송 원장 (섹션4 ②, 갭 #110·#115·#119·#120·#121)

**Files:**
- Create: `supabase/migrations/00011_notification_log.sql`
- Test: `backend/tests/test_notification_log_schema.py`

**Interfaces:**
- Consumes: `appointments`, `patients`, `staff`.
- Produces: `notification_log` 테이블. 주요 컬럼: `id, appointment_id(nullable FK), patient_id(nullable FK), sender_staff_id(nullable FK), target_count(int), notification_type(text), kind(text 'transactional'|'marketing'), body(text), channel(text 'push'|'sms'), delivery_status(text '발송중'|'도달'|'실패'|'재시도중'), failure_code(text), retry_count(int), anonymous_session_id(uuid), anonymous_contact_id(uuid), notification_date(date), sent_at(timestamptz)`. 부분 유니크 인덱스 2개(dedup, 실패 줄 제외). dispatcher(서버, 서비스 역할)가 읽고 쓰며, 직원 발송 이력 화면이 `select`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_notification_log_schema.py`:
```python
import uuid
import pytest
from tests.conftest import seed_staff


async def _seed_patient_and_appt(conn):
    dept_id = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor = await seed_staff(conn, role="doctor", department_id=dept_id)
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appt_id = await conn.fetchval(
        """
        insert into appointments
          (account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $1, $2, $3, '예약확정', 'app') returning id
        """,
        patient_id, dept_id, doctor["staff_id"],
    )
    return patient_id, appt_id


@pytest.mark.asyncio
async def test_defaults_and_all_columns_insertable(db_conn):
    patient_id, appt_id = await _seed_patient_and_appt(db_conn)
    row_id = await db_conn.fetchval(
        """
        insert into notification_log (appointment_id, patient_id, notification_type, channel)
        values ($1, $2, 'confirmed', 'push') returning id
        """,
        appt_id, patient_id,
    )
    row = await db_conn.fetchrow("select * from notification_log where id = $1", row_id)
    assert row["kind"] == "transactional"          # 기본 분류
    assert row["delivery_status"] == "발송중"        # 기본 상태
    assert row["retry_count"] == 0
    assert row["notification_date"] is not None      # KST 기본값


@pytest.mark.asyncio
async def test_appointment_id_nullable_for_marketing(db_conn):
    # #110: 광고 발송은 특정 예약이 없다 → appointment_id 없이 기록 가능.
    row_id = await db_conn.fetchval(
        """
        insert into notification_log (notification_type, channel, kind, sender_staff_id, target_count, body)
        values ('promo', 'sms', 'marketing', null, 1500, '건강검진 할인 안내') returning id
        """,
    )
    assert row_id is not None


@pytest.mark.asyncio
async def test_anonymous_recipient_columns(db_conn):
    # 3-A: 익명 상담 연락처는 patients 행 없이 같은 원장에 남는다.
    row_id = await db_conn.fetchval(
        """
        insert into notification_log
          (notification_type, channel, anonymous_session_id, anonymous_contact_id)
        values ('support_answered', 'sms', $1, $2) returning id  -- C3-2 정본(2026-08-20, ~~chat_reply~~ 통일)
        """,
        uuid.uuid4(), uuid.uuid4(),
    )
    assert row_id is not None


@pytest.mark.asyncio
async def test_check_constraints_reject_bad_values(db_conn):
    for col, bad in [("kind", "spam"), ("channel", "email"), ("delivery_status", "완료")]:
        with pytest.raises(Exception):
            await db_conn.execute(
                f"insert into notification_log (notification_type, channel, {col}) "
                f"values ('x', 'push', $1)" if col != "channel"
                else "insert into notification_log (notification_type, channel) values ('x', $1)",
                bad,
            )


@pytest.mark.asyncio
async def test_dedup_once_type_blocks_duplicate(db_conn):
    _, appt_id = await _seed_patient_and_appt(db_conn)
    await db_conn.execute(
        "insert into notification_log (appointment_id, notification_type, channel) "
        "values ($1, 'confirmed', 'push')", appt_id,
    )
    with pytest.raises(Exception):  # 같은 예약+1회성 종류는 두 번 안 됨
        await db_conn.execute(
            "insert into notification_log (appointment_id, notification_type, channel) "
            "values ($1, 'confirmed', 'push')", appt_id,
        )


@pytest.mark.asyncio
async def test_failed_row_excluded_from_dedup(db_conn):
    # #121: 실패한 줄은 자물쇠에서 빠져 다시 보낼 수 있다("닿은 것만 보냈다로 본다").
    _, appt_id = await _seed_patient_and_appt(db_conn)
    await db_conn.execute(
        "insert into notification_log (appointment_id, notification_type, channel, delivery_status) "
        "values ($1, 'confirmed', 'push', '실패')", appt_id,
    )
    # 실패 줄이 있어도 재발송 기록이 가능해야 한다.
    ok_id = await db_conn.fetchval(
        "insert into notification_log (appointment_id, notification_type, channel, delivery_status) "
        "values ($1, 'confirmed', 'push', '발송중') returning id", appt_id,
    )
    assert ok_id is not None
    # 그러나 성공(비실패) 줄이 생기면 그 다음 중복은 다시 막힌다.
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into notification_log (appointment_id, notification_type, channel) "
            "values ($1, 'confirmed', 'push')", appt_id,
        )


@pytest.mark.asyncio
async def test_staff_can_read_but_authenticated_cannot_insert(db_conn):
    from tests.conftest import set_session_auth
    _, appt_id = await _seed_patient_and_appt(db_conn)
    await db_conn.execute(
        "insert into notification_log (appointment_id, notification_type, channel) "
        "values ($1, 'confirmed', 'push')", appt_id,
    )
    staff = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, staff["auth_user_id"])
    rows = await db_conn.fetch("select * from notification_log")
    assert len(rows) == 1                              # 발송 이력 조회 허용
    with pytest.raises(Exception):                     # 쓰기는 서버(서비스 역할)만
        await db_conn.execute(
            "insert into notification_log (notification_type, channel) values ('x', 'push')"
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_notification_log_schema.py -v`
Expected: FAIL — `relation "notification_log" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/00011_notification_log.sql`:
```sql
-- 섹션4 ② 단일 발송 원장 (ui-design-decisions:3014~3170, 3499~3597, 3615~3626; 3-A 익명 :4554~4651).
-- 등록 환자와 익명 상담 연락처가 같은 dispatcher·배칭·결과/재시도 원장을 쓴다.
-- notification_log는 마이그레이션에 없었고(옛 플랜 00204는 폐기·재번호) 여기서 확장분까지 합쳐 신설한다.
create table notification_log (
  id uuid primary key default gen_random_uuid(),
  -- #110: 광고 발송은 특정 예약이 없어 nullable. 익명 발송은 patient_id도 없다.
  appointment_id uuid references appointments(id),
  patient_id uuid references patients(id),
  -- #115: 누가 보냈나(자동 발송은 null=서버), 전 환자 발송 규모.
  sender_staff_id uuid references staff(id),
  target_count int,
  notification_type text not null,
  -- #110/#104: 광고는 법(정보통신망법)이 달라 시스템이 갈라야 한다.
  kind text not null default 'transactional' check (kind in ('transactional', 'marketing')),
  -- #110: 직원이 직접 쓴 발송 문구를 보존.
  body text,
  -- #120: 실제 보낸 채널을 기록(상수 'push' 박기 금지 — dispatcher 계약).
  channel text not null check (channel in ('push', 'sms')),
  -- #119: 표 이름이 log인데 성공/실패가 없었다. 실패를 system_error_log로 보내면 대상을 담을 수 없다.
  delivery_status text not null default '발송중'
    check (delivery_status in ('발송중', '도달', '실패', '재시도중')),
  failure_code text,           -- #119: 업체 오류 코드(영구/일시 판정)
  retry_count int not null default 0,
  -- 3-A: 익명 수신자(patients 가짜 행/추측 매칭 없이 같은 알림 품질·멱등성).
  anonymous_session_id uuid,
  anonymous_contact_id uuid,
  -- notification_date는 업무 시간대(KST) 고정 — sent_at::date는 세션 시간대에 흔들려 인덱스에 못 쓴다(SDB-04).
  notification_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  sent_at timestamptz not null default now()
);

-- #121: dedup 자물쇠는 유지하되 delivery_status='실패' 줄은 제외한다(안 닿은 안내를 다시 보낼 수 있게).
--       appointment_id가 null인 광고·익명 발송은 dedup 대상이 아니다.
-- 하루 단위 반복(리마인더)은 같은 업무일에 한 번만.
create unique index idx_notification_log_dedup_daily
  on notification_log (appointment_id, notification_type, notification_date)
  where appointment_id is not null
    and delivery_status <> '실패'
    and notification_type in ('reminder_day_before', 'reminder_today');

-- 1회성 이벤트(예약확정 등)는 예약당 한 번만.
create unique index idx_notification_log_dedup_once
  on notification_log (appointment_id, notification_type)
  where appointment_id is not null
    and delivery_status <> '실패'
    and notification_type not in ('reminder_day_before', 'reminder_today');

-- 조회 인덱스: 환자별 발송 이력, 실패 재시도 큐.
create index idx_notification_log_patient on notification_log (patient_id, sent_at desc);
create index idx_notification_log_retry on notification_log (delivery_status)
  where delivery_status in ('실패', '재시도중');

alter table notification_log enable row level security;
grant select on table notification_log to authenticated;

-- 쓰기 정책은 없다: dispatcher가 서비스 역할 커넥션(RLS 우회)으로만 insert/update 한다.
-- 직원 발송 이력 화면(2단계)이 읽는다.
create policy "staff_can_read_notification_log" on notification_log
  for select
  using (private.is_active_staff());

-- 환자 앱 알림함이 본인 알림을 읽는 정책은 3단계(환자 인증 연동)에서 추가한다.
```

- [ ] **Step 4: Apply migration and run test to verify it passes**

Run: `supabase migration up && cd backend && pytest tests/test_notification_log_schema.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00011_notification_log.sql backend/tests/test_notification_log_schema.py
git commit -m "feat: notification_log 단일 발송 원장 신설(00011, 섹션4 ②)"
```

---

## Task 3: `notification_preferences` 종류별 on/off (섹션4 ③, 갭 #5/#14)

**Files:**
- Create: `supabase/migrations/00012_notification_preferences.sql`
- Test: `backend/tests/test_notification_preferences_schema.py`

**Interfaces:**
- Consumes: `patients`.
- Produces: `notification_preferences (id, patient_id FK, notification_type, enabled bool, sms_enabled bool, unique(patient_id, notification_type))`. dispatcher가 발송 직전 검사, 환자 앱 설정 화면(3단계)이 편집. **줄이 없으면** 코드 기본값(켜짐)으로 본다.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_notification_preferences_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


async def _seed_patient(conn):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )


@pytest.mark.asyncio
async def test_columns_and_defaults(db_conn):
    patient_id = await _seed_patient(db_conn)
    row = await db_conn.fetchrow(
        "insert into notification_preferences (patient_id, notification_type) "
        "values ($1, 'reminder_today') returning enabled, sms_enabled",
        patient_id,
    )
    assert row["enabled"] is True       # 기본 켜짐 — 전부 끌 수 있으나 기본은 수신
    assert row["sms_enabled"] is False  # 문자로도 여부는 기본 꺼짐


@pytest.mark.asyncio
async def test_unique_per_patient_and_type(db_conn):
    patient_id = await _seed_patient(db_conn)
    await db_conn.execute(
        "insert into notification_preferences (patient_id, notification_type) values ($1, 'confirmed')",
        patient_id,
    )
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into notification_preferences (patient_id, notification_type) values ($1, 'confirmed')",
            patient_id,
        )


@pytest.mark.asyncio
async def test_authenticated_staff_cannot_read_patient_preferences(db_conn):
    # 환자 선호는 서버(dispatcher)와 본인(3단계)만 접근한다. 일반 직원 조회 정책은 없다 → 기본 거부.
    patient_id = await _seed_patient(db_conn)
    await db_conn.execute(
        "insert into notification_preferences (patient_id, notification_type) values ($1, 'confirmed')",
        patient_id,
    )
    staff = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, staff["auth_user_id"])
    rows = await db_conn.fetch("select * from notification_preferences")
    assert len(rows) == 0   # RLS 기본 거부(정책 없음)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_notification_preferences_schema.py -v`
Expected: FAIL — `relation "notification_preferences" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/00012_notification_preferences.sql`:
```sql
-- 섹션4 ③ 발송 직전 종류별 검사 (ui-design-decisions:777~790, 3241~3247; screen-behaviors:3266~3299).
-- 환자별 (알림 종류 on/off, 문자 여부). FCM 토큰은 여기서 지우지 않는다(토큰은 device_tokens, 3단계).
-- 줄이 없으면 코드 기본값(켜짐)으로 본다 — dispatcher가 발송 함수 한 곳에서 검사한다.
create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  notification_type text not null,
  enabled boolean not null default true,      -- 종류 on/off (전부 끌 수 있음, 필수 잠금 없음)
  sms_enabled boolean not null default false, -- 문자로도 받을지
  unique (patient_id, notification_type)
);

alter table notification_preferences enable row level security;
grant select, insert, update on table notification_preferences to authenticated;

-- 정책 없음: dispatcher가 서비스 역할로 읽고, 환자 본인 읽기/수정 정책은 3단계(환자 인증)에서 추가한다.
-- (일반 직원은 환자 알림 선호를 보지 않는다.)
```

- [ ] **Step 4: Apply migration and run test to verify it passes**

Run: `supabase migration up && cd backend && pytest tests/test_notification_preferences_schema.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00012_notification_preferences.sql backend/tests/test_notification_preferences_schema.py
git commit -m "feat: notification_preferences 종류별 알림 on/off 신설(00012, 섹션4 ③)"
```

---

## Task 4: 알림 종류별 설정표 `notification_type_settings` (섹션4 ④, 갭 #125·#126)

**Files:**
- Create: `supabase/migrations/00013_notification_type_settings.sql`
- Test: `backend/tests/test_notification_type_settings_schema.py`

**Interfaces:**
- Consumes: (없음) `staff` RLS 헬퍼만.
- Produces: `notification_type_settings (notification_type text primary key, body text, also_sms boolean)`. 관리자 설정 화면(2단계)이 편집, dispatcher가 읽음. **초기 seed 없음**(줄이 없으면 코드 기본 문구를 쓴다).

- [ ] **Step 1: Write the failing test**

`backend/tests/test_notification_type_settings_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_type_is_primary_key_one_row_per_type(db_conn):
    await db_conn.execute(
        "insert into notification_type_settings (notification_type, body, also_sms) "
        "values ('confirmed', '예약이 확정되었습니다.', true)"
    )
    with pytest.raises(Exception):  # 종류가 키 → 같은 종류 두 줄 불가
        await db_conn.execute(
            "insert into notification_type_settings (notification_type, body) values ('confirmed', '중복')"
        )


@pytest.mark.asyncio
async def test_table_starts_empty(db_conn):
    # ④ 기본 문구는 DB에 넣지 않는다 → 초기 seed 없음.
    count = await db_conn.fetchval("select count(*) from notification_type_settings")
    assert count == 0


@pytest.mark.asyncio
async def test_staff_read_admin_write(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")

    # 관리자: 편집 가능
    await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute(
        "insert into notification_type_settings (notification_type, body) values ('confirmed', 'x')"
    )
    # 접수직원: 읽기 가능(dispatcher/화면 조회), 편집 불가
    await set_session_auth(db_conn, receptionist["auth_user_id"])
    rows = await db_conn.fetch("select * from notification_type_settings")
    assert len(rows) == 1
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into notification_type_settings (notification_type, body) values ('promo', 'y')"
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_notification_type_settings_schema.py -v`
Expected: FAIL — `relation "notification_type_settings" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/00013_notification_type_settings.sql`:
```sql
-- 섹션4 ④ 알림 종류별 문구·문자 여부 (ui-design-decisions:3525~3539; AD-067·068 :3185~3187).
-- hospital_settings는 한 행짜리 싱글턴이라 담을 수 없다 → 종류마다 한 줄인 표(11번째가 붙어도 줄 하나만 추가).
-- 기본 문구는 DB에 넣지 않는다: 코드의 기본 문구 표가 원본이고, 줄이 없으면 코드 값을 쓴다(되돌리기=그 줄 삭제).
-- 그래서 초기 seed insert가 없다.
-- 문구 토큰(이름·날짜·시각)은 발송 시 치환한다 — appointments.slot_id → appointment_slots에서 꺼낸다(계약, 서버 로직).
create table notification_type_settings (
  notification_type text primary key,
  body text,
  also_sms boolean not null default false
);

alter table notification_type_settings enable row level security;
grant select on table notification_type_settings to authenticated;
grant insert, update, delete on table notification_type_settings to authenticated;

-- dispatcher와 직원 화면이 읽는다.
create policy "staff_can_read_notification_type_settings" on notification_type_settings
  for select
  using (private.is_active_staff());

-- 관리자만 편집(hospital_settings와 같은 패턴).
create policy "admin_can_manage_notification_type_settings" on notification_type_settings
  for all
  using (private.is_admin())
  with check (private.is_admin());
```

- [ ] **Step 4: Apply migration and run test to verify it passes**

Run: `supabase migration up && cd backend && pytest tests/test_notification_type_settings_schema.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00013_notification_type_settings.sql backend/tests/test_notification_type_settings_schema.py
git commit -m "feat: 알림 종류별 설정표 notification_type_settings 신설(00013, 섹션4 ④)"
```

---

## Task 5: `patients` 문자 실패 표식 (섹션4 ⑤, 갭 #123)

**Files:**
- Create: `supabase/migrations/00014_patients_sms_dead.sql`
- Test: `backend/tests/test_patients_sms_dead_schema.py`

**Interfaces:**
- Consumes: 기존 `patients` 테이블(`00003`, RLS 정책 이미 존재).
- Produces: `patients.sms_dead (boolean not null default false)`, `patients.sms_dead_checked_at (timestamptz nullable)`. 직원 상세 화면이 ⚠ 표시로 읽음. 기존 patients RLS가 그대로 덮으므로 새 정책 없음.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_patients_sms_dead_schema.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_sms_dead_defaults_false(db_conn):
    row = await db_conn.fetchrow(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') "
        "returning sms_dead, sms_dead_checked_at"
    )
    assert row["sms_dead"] is False
    assert row["sms_dead_checked_at"] is None


@pytest.mark.asyncio
async def test_sms_dead_can_be_set(db_conn):
    pid = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('김철수', '1990-01-01', 'M', '01099998888') returning id"
    )
    await db_conn.execute(
        "update patients set sms_dead = true, sms_dead_checked_at = now() where id = $1", pid
    )
    row = await db_conn.fetchrow("select sms_dead, sms_dead_checked_at from patients where id = $1", pid)
    assert row["sms_dead"] is True
    assert row["sms_dead_checked_at"] is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_patients_sms_dead_schema.py -v`
Expected: FAIL — `column "sms_dead" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/00014_patients_sms_dead.sql`:
```sql
-- 섹션4 ⑤ 문자 실패 표식 (ui-design-decisions:3568~3572).
-- 발송 목록을 뒤져서는 판정할 수 없어 환자 쪽에 붙인다. 번호를 고치면 두 칸을 비운다(서버 로직).
-- ⛔ 수신 차단(환자의 선택)은 여기 넣지 않는다 — 번호가 죽은 것과 별개다.
alter table patients
  add column sms_dead boolean not null default false,
  add column sms_dead_checked_at timestamptz;
```

- [ ] **Step 4: Apply migration and run test to verify it passes**

Run: `supabase migration up && cd backend && pytest tests/test_patients_sms_dead_schema.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00014_patients_sms_dead.sql backend/tests/test_patients_sms_dead_schema.py
git commit -m "feat: patients 문자 실패 표식 컬럼(00014, 섹션4 ⑤)"
```

---

## Task 6: `access_audit_log` 번호 열람 기록 (섹션4 ⑥, 갭 #117)

**Files:**
- Create: `supabase/migrations/00015_access_audit_log_phone_reveal.sql`
- Test: `backend/tests/test_access_audit_log_phone_reveal_schema.py`

**Interfaces:**
- Consumes: 기존 `access_audit_log` 테이블(`00004`, 정책 `staff_can_insert_own_audit_log`·`admin_can_read_audit_log` 존재).
- Produces: `access_audit_log.resource_type` check 제약에 `'phone_reveal'` 추가(기존 `'patient_detail'`·`'medical_record'` 유지). 발송 이력에서 마스킹된 번호를 푸는 순간 전수 기록.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_access_audit_log_phone_reveal_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


async def _seed_staff_and_patient(conn):
    staff = await seed_staff(conn, role="receptionist")
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    return staff, patient_id


@pytest.mark.asyncio
async def test_phone_reveal_is_accepted(db_conn):
    staff, patient_id = await _seed_staff_and_patient(db_conn)
    await set_session_auth(db_conn, staff["auth_user_id"])
    row_id = await db_conn.fetchval(
        "insert into access_audit_log (staff_id, patient_id, resource_type) "
        "values ($1, $2, 'phone_reveal') returning id",
        staff["staff_id"], patient_id,
    )
    assert row_id is not None


@pytest.mark.asyncio
async def test_existing_resource_types_still_accepted(db_conn):
    staff, patient_id = await _seed_staff_and_patient(db_conn)
    await set_session_auth(db_conn, staff["auth_user_id"])
    row_id = await db_conn.fetchval(
        "insert into access_audit_log (staff_id, patient_id, resource_type) "
        "values ($1, $2, 'patient_detail') returning id",
        staff["staff_id"], patient_id,
    )
    assert row_id is not None


@pytest.mark.asyncio
async def test_unknown_resource_type_rejected(db_conn):
    staff, patient_id = await _seed_staff_and_patient(db_conn)
    await set_session_auth(db_conn, staff["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into access_audit_log (staff_id, patient_id, resource_type) "
            "values ($1, $2, 'phone_number') ",   # 오타/미허용 값
            staff["staff_id"], patient_id,
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_access_audit_log_phone_reveal_schema.py -v`
Expected: FAIL — `test_phone_reveal_is_accepted`가 check 위반으로 실패(아직 `'phone_reveal'` 미허용).

- [ ] **Step 3: Write the migration**

`supabase/migrations/00015_access_audit_log_phone_reveal.sql`:
```sql
-- 섹션4 ⑥ 번호 열람 기록 (ui-design-decisions:3582~3595).
-- 발송 이력에서 마스킹된 번호를 푸는 순간(reveal) 그 열람을 전수로 남긴다.
-- 00004의 inline check 제약(자동 이름 access_audit_log_resource_type_check)을 교체해 phone_reveal을 추가한다.
alter table access_audit_log drop constraint access_audit_log_resource_type_check;
alter table access_audit_log
  add constraint access_audit_log_resource_type_check
  check (resource_type in ('patient_detail', 'medical_record', 'phone_reveal'));
```

> ⚠️ **실행 시 확인**: 위 제약 이름은 PostgreSQL이 inline check에 자동으로 붙이는 관례명이다. 만약 로컬 DB에서 이름이 다르면 `\d access_audit_log`(psql) 또는 `select conname from pg_constraint where conrelid='access_audit_log'::regclass and contype='c';`로 실제 이름을 확인해 `drop constraint` 대상만 바꾼다(추가하는 제약 이름은 위 그대로 고정).

- [ ] **Step 4: Apply migration and run test to verify it passes**

Run: `supabase migration up && cd backend && pytest tests/test_access_audit_log_phone_reveal_schema.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00015_access_audit_log_phone_reveal.sql backend/tests/test_access_audit_log_phone_reveal_schema.py
git commit -m "feat: access_audit_log에 phone_reveal 열람 기록 추가(00015, 섹션4 ⑥)"
```

---

## Task 7: 예약 발송 큐 `scheduled_notifications` (섹션4 ⑦, 갭 #118)

**Files:**
- Create: `supabase/migrations/00016_scheduled_notifications.sql`
- Test: `backend/tests/test_scheduled_notifications_schema.py`

**Interfaces:**
- Consumes: `staff`.
- Produces: `scheduled_notifications (id, notification_type, kind, body, scheduled_at, status 'pending'|'sent'|'cancelled', created_by FK, created_at)` + 인덱스 `(status, scheduled_at)` partial(`status='pending'`). cron(10분)이 때가 된 `pending`을 읽어 발송, 직원 웹 "안내 보내기"의 예약 목록이 읽음.
- ⚠️ **범위 note**: 수신 대상 지정(전체/조건 필터)은 이 공용 표가 아니라 직원 웹 "안내 보내기" 스펙(2단계)이 소유한다 — 이 표는 **발송 정의(무엇을·언제)** 만 담고, 대상 해석은 발송 시점에 dispatcher가 한다.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_scheduled_notifications_schema.py`:
```python
import pytest
from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_defaults_and_status_check(db_conn):
    staff = await seed_staff(db_conn, role="admin")
    row = await db_conn.fetchrow(
        "insert into scheduled_notifications (notification_type, scheduled_at, created_by) "
        "values ('promo', now() + interval '1 day', $1) returning status, kind",
        staff["staff_id"],
    )
    assert row["status"] == "pending"
    assert row["kind"] == "transactional"


@pytest.mark.asyncio
async def test_status_rejects_unknown(db_conn):
    staff = await seed_staff(db_conn, role="admin")
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into scheduled_notifications (notification_type, scheduled_at, created_by, status) "
            "values ('promo', now(), $1, '보냄')",
            staff["staff_id"],
        )


@pytest.mark.asyncio
async def test_staff_can_read_receptionist_can_insert_doctor_cannot(db_conn):
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor")

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    await db_conn.execute(
        "insert into scheduled_notifications (notification_type, scheduled_at, created_by) "
        "values ('promo', now() + interval '1 hour', $1)",
        receptionist["staff_id"],
    )
    rows = await db_conn.fetch("select * from scheduled_notifications")
    assert len(rows) == 1

    await set_session_auth(db_conn, doctor["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into scheduled_notifications (notification_type, scheduled_at, created_by) "
            "values ('promo', now(), $1)",
            doctor["staff_id"],
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_scheduled_notifications_schema.py -v`
Expected: FAIL — `relation "scheduled_notifications" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/00016_scheduled_notifications.sql`:
```sql
-- 섹션4 ⑦ 예약해 둔 발송 (ui-design-decisions:3597~3601).
-- 지금 보내지 않고 예약해 둔 발송을 담는다. 전용 cron(10분)이 때가 된 pending을 발송한다(cron은 배포 플랜).
-- 직원 웹 "안내 보내기"의 예약 목록이 이 표를 읽는다.
-- 수신 대상 지정은 이 표가 아니라 발송 정의만 담고, 대상 해석은 발송 시점 dispatcher가 한다(2단계 소유).
create table scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  kind text not null default 'transactional' check (kind in ('transactional', 'marketing')),
  body text,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'cancelled')),
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

-- cron이 "때가 된 대기 발송"을 훑는 경로 — 종료된 줄을 제외하는 partial index.
create index idx_scheduled_notifications_due
  on scheduled_notifications (scheduled_at)
  where status = 'pending';

alter table scheduled_notifications enable row level security;
grant select, insert, update on table scheduled_notifications to authenticated;

-- 접수직원·관리자가 예약 발송을 만들고 관리한다(발송 권한과 같은 역할). 조회는 활성 직원.
create policy "staff_can_read_scheduled_notifications" on scheduled_notifications
  for select
  using (private.is_active_staff());

create policy "receptionist_admin_can_insert_scheduled_notifications" on scheduled_notifications
  for insert
  with check (private.current_staff_role() in ('receptionist', 'admin'));

create policy "receptionist_admin_can_update_scheduled_notifications" on scheduled_notifications
  for update
  using (private.current_staff_role() in ('receptionist', 'admin'))
  with check (private.current_staff_role() in ('receptionist', 'admin'));
```

- [ ] **Step 4: Apply migration and run test to verify it passes**

Run: `supabase migration up && cd backend && pytest tests/test_scheduled_notifications_schema.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00016_scheduled_notifications.sql backend/tests/test_scheduled_notifications_schema.py
git commit -m "feat: 예약 발송 큐 scheduled_notifications 신설(00016, 섹션4 ⑦)"
```

---

## 마무리: 전체 회귀 확인

- [ ] **모든 마이그레이션 적용 상태에서 전체 테스트 통과 확인**

Run: `supabase migration up && cd backend && pytest -v`
Expected: 기존 `00001~00009` 테스트 + 이번 7개 스키마 테스트가 모두 PASS. 기존 테스트가 깨지면 새 컬럼·제약이 기존 흐름을 침범한 것이므로 그 자리에서 조사.

- [ ] **⑧ Twilio 도달 되알림은 이 플랜 밖임을 기록** — 표가 아니라 dispatcher·배포 계약(공개 엔드포인트+서명 검증+`notification_log` 반영, 섹션4 ⑧)이라 배포 플랜/3단계 발송 함수에서 다룬다. HANDOFF에 "④ 마이그레이션(공용) 완료, ⑧은 배포/3단계 이월"로 남긴다.

---

## Self-Review (플랜 작성자 자체 점검)

**1. 스펙 커버리지** — 섹션4 각 항목 대조:
- ① appointments 컬럼 → Task 1 ✅ (희망 일시 미저장·일관성 제약 포함)
- ② notification_log → Task 2 ✅ (nullable appointment_id·sender/target_count·kind·body·delivery_status/failure_code/retry_count·channel·익명 컬럼·실패 제외 dedup 전부)
- ③ notification_preferences → Task 3 ✅ (전부 끌 수 있음·토큰 미삭제 note)
- ④ 알림 종류 설정표 → Task 4 ✅ (종류=PK·seed 없음·토큰 치환 note)
- ⑤ patients.sms_dead → Task 5 ✅ (수신 차단 제외 note)
- ⑥ access_audit_log check → Task 6 ✅ (제약 교체)
- ⑦ 예약 발송 큐 → Task 7 ✅ (partial index·대상 해석 note)
- ⑧ Twilio → 표 아님, 마무리에서 명시적으로 범위 밖 처리 ✅

**2. 플레이스홀더 스캔** — TBD·"적절한 처리"·"위와 유사"·미정의 함수 없음. 모든 스텝에 실제 SQL·테스트 코드 있음.

**3. 타입·이름 일관성** — RLS 헬퍼 4개 이름은 기존 마이그레이션과 동일(`private.is_active_staff()` 등). 컬럼명(`delivery_status`·`sms_dead`·`notification_type`)은 태스크 간 재사용 시 동일. `notification_type`은 여러 표(log·preferences·type_settings·scheduled)가 같은 의미의 text로 사용 — enum 강제는 코드 기본 문구 표가 원본이라 두지 않음(④ 결정과 일치).
