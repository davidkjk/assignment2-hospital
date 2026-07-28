# 3단계: 환자용 모바일 앱(Flutter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 환자가 사용하는 Flutter 모바일 앱(가입/로그인, 가족 등록, 8단계 예약, 사전문진, 나의 예약·방문상태, 방문이력, 알림)을 만들고, 1단계 FastAPI+Supabase 백엔드에 환자용 엔드포인트(슬롯 조회, 예약 생성/변경/취소, 가족 CRUD, 사전문진, 방문이력, 알림 토큰)를 추가한다.

**Architecture:** 백엔드는 1단계에서 만든 `acquire_as`/`AppError`/`admin_client` 패턴을 그대로 재사용하되, 직원(`StaffContext`)과 별개로 환자용 인증 컨텍스트(`PatientContext`)와 Supabase RLS 정책을 새로 추가한다. 환자 자신과 그 가족만 자신의 데이터를 보고 쓸 수 있도록 `patient_owns()` SQL 함수로 RLS를 강제하고, 서비스 계층은 이 RLS 위에서 슬롯 조건부 예약(1단계 `slot_service`)을 재사용한다. 모든 신규 API는 `/app/*` 경로 아래에 두어 2단계(직원 웹)의 `/appointments`, `/patients/{id}` 라우트와 충돌하지 않게 한다. Flutter는 Riverpod(AsyncNotifier)로 서버 상태를 관리하고, Supabase Auth phone 프로바이더로 OTP/비밀번호 인증을 직접 처리하며(별도 백엔드 OTP 코드 불필요), 백엔드 REST 호출은 얇은 `ApiClient`로, 예약 상태는 Supabase Realtime으로 구독한다.

**Tech Stack:** 백엔드 — FastAPI, Supabase(Postgres/Auth), asyncpg, supabase-py(Admin API), twilio(SMS), firebase-admin(FCM), pytest+pytest-asyncio. 프론트엔드 — Flutter, flutter_riverpod, go_router, supabase_flutter, http, firebase_messaging, qr_flutter, connectivity_plus, flutter_test+mocktail.

## Global Constraints

- 이 계획은 **1단계 계획**(`docs/superpowers/plans/2026-07-27-foundation-auth-data-model.md`)의 Task 1~17이 이미 실행되어 `backend/`, `supabase/migrations/00001~00007`, `app.db.pool.acquire_as`, `app.core.security.StaffContext`, `app.core.errors.AppError`, `app.db.admin_client.get_admin_client`, `app.services.slot_service.book_slot`, `app.services.appointment_service.*`가 이미 존재한다고 가정한다. 2단계(직원용 웹) 코드 존재 여부와는 무관하게 이 계획은 독립적으로 실행 가능하다(2단계의 `reschedule_appointment`/`schedule_service`는 재사용하지 않는다 — 환자 앱의 "변경"은 스펙대로 취소 후 재예약으로 자체 구현한다).
- 신규 마이그레이션은 `supabase/migrations/00009`부터 번호를 이어간다.
- 신규 백엔드 엔드포인트는 모두 `/app/*` 경로 아래에 둔다(직원 웹의 `/patients/{id}`, `/appointments` 등과 경로 충돌 방지).
- 환자 간 데이터 격리는 Supabase RLS(`patient_owns()` 함수)로 강제한다 — 서비스 코드의 조건문만으로 막지 않는다.
- 같은 의사·같은 시간 이중예약은 1단계 `slot_service.book_slot`의 조건부 UPDATE를 그대로 재사용한다.
- 동시 수정 충돌은 1단계 원칙(`updated_at` 낙관적 잠금)을 따르되, 환자 예약 취소/변경은 상태값 자체를 조건으로 검사한다(직원 화면처럼 여러 사람이 동시에 같은 예약을 수정할 일이 거의 없으므로 상태 기반 검사로 충분하다).
- 알림(FCM 푸시·Twilio SMS) 발송은 예약/사전문진 저장 트랜잭션이 끝난 뒤 best-effort로 실행하고, 실패해도 예약 자체는 유지한다(1단계 원칙 재사용). 발송 실패는 `app.core.errors.log_error`로 기록한다.
- 실제 Twilio/Firebase 계정 키는 환경변수로만 주입한다(`backend/.env`, 커밋 금지). 테스트는 `SmsClient`/`PushClient`를 모킹하며 실제 외부 계정에 의존하지 않는다.
- Flutter 쪽 시각 디자인(색상·레이아웃 디테일)은 이 계획의 범위 밖이다 — 기본 Material 위젯을 사용하되, 접근성 요구사항(큰 글씨, 화면당 핵심 버튼 1개, 한글 오류 메시지)은 텍스트 스타일과 위젯 배치 규칙으로 충족한다.
- 오프라인 상태에서는 저장 버튼을 비활성화하고 "인터넷 연결을 확인해주세요" 배너를 보여준다 — 저장된 것처럼 보이는 상태를 만들지 않는다.
- 예약/취소/사전문진 저장 버튼은 공통 중복 클릭 방지 위젯(`BusyButton`)을 사용한다.

---

## Task 1: 마이그레이션 — patients.auth_user_id + patient_owns() 함수 + 환자용 조회 RLS

**Files:**
- Create: `supabase/migrations/00009_patient_identity.sql`
- Modify: `backend/tests/conftest.py` (`seed_patient` 헬퍼 추가)
- Test: `backend/tests/test_patient_identity_schema.py`

**Interfaces:**
- Consumes: DB 테이블 `patients`, `patient_family_links`, `departments`, `staff`, `appointment_slots` (1단계 Task 2~5), `tests.conftest.db_conn/seed_staff/set_session_auth`(1단계 Task 2)
- Produces: `patients.auth_user_id`(nullable, unique, `auth.users(id)` 참조), SQL 함수 `patient_owns(target_patient_id uuid) returns boolean`, `appointment_slots`에 대한 환자용 UPDATE 정책(`patients_can_update_slots_for_booking` — Task 7의 `book_slot`/`release_slot`이 의존), `tests.conftest.seed_patient(conn, name=..., phone=..., with_auth=True, is_active=True) -> dict` (`{"auth_user_id": UUID | None, "patient_id": UUID}`)

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/00009_patient_identity.sql`:
```sql
alter table patients add column auth_user_id uuid unique references auth.users(id);

create or replace function patient_owns(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from patients me
    where me.auth_user_id = auth.uid()
      and (
        me.id = target_patient_id
        or exists (
          select 1 from patient_family_links l
          where l.account_patient_id = me.id and l.family_patient_id = target_patient_id
        )
      )
  );
$$;

create policy "patients_can_register_self" on patients
  for insert
  with check (auth_user_id = auth.uid());

create policy "patients_can_insert_family_members" on patients
  for insert
  with check (
    auth_user_id is null
    and exists (select 1 from patients me where me.auth_user_id = auth.uid() and me.is_active)
  );

create policy "patients_can_read_self_and_family" on patients
  for select
  using (patient_owns(id));

create policy "patients_can_update_self_and_family" on patients
  for update
  using (patient_owns(id))
  with check (patient_owns(id));

-- [정합성 검토 R5-01] 기존에는 "for all"이라 INSERT까지 허용했는데, INSERT의 with check는
-- account_patient_id(요청자 본인)만 확인하고 family_patient_id(연결 대상)는 전혀 검사하지 않아서
-- 환자 A가 환자 B의 UUID를 알기만 하면 (백엔드를 거치지 않고 Supabase에 직접 접속해도) 동의 없이
-- B를 자기 가족으로 연결할 수 있었다. INSERT는 클라이언트가 직접 할 수 없게 하고, 반드시 아래
-- patient_family_service.add_family_member(새 프로필)/confirm_family_link_otp(기존 환자 연결)가
-- get_pool()의 서비스 역할 커넥션(RLS 우회)으로 대신 처리한다. SELECT/UPDATE/DELETE는 이미
-- "내가 만든 링크"만 다루므로(가족을 새로 지목하는 게 아니라 기존 내 링크의 조회·수정·해제) 그대로 둔다.
create policy "patients_can_read_own_family_links" on patient_family_links
  for select
  using (exists (select 1 from patients me where me.auth_user_id = auth.uid() and me.id = patient_family_links.account_patient_id));

create policy "patients_can_update_own_family_links" on patient_family_links
  for update
  using (exists (select 1 from patients me where me.auth_user_id = auth.uid() and me.id = patient_family_links.account_patient_id))
  with check (exists (select 1 from patients me where me.auth_user_id = auth.uid() and me.id = patient_family_links.account_patient_id));

create policy "patients_can_delete_own_family_links" on patient_family_links
  for delete
  using (exists (select 1 from patients me where me.auth_user_id = auth.uid() and me.id = patient_family_links.account_patient_id));

create policy "patients_can_read_active_departments" on departments
  for select
  using (is_active and exists (select 1 from patients p where p.auth_user_id = auth.uid()));

create policy "patients_can_read_doctors" on staff
  for select
  using (role = 'doctor' and exists (select 1 from patients p where p.auth_user_id = auth.uid()));

create policy "patients_can_read_open_slots" on appointment_slots
  for select
  using (status = '빈시간' and exists (select 1 from patients p where p.auth_user_id = auth.uid()));

create policy "patients_can_update_slots_for_booking" on appointment_slots
  for update
  using (
    exists (select 1 from patients p where p.auth_user_id = auth.uid())
    and (
      status = '빈시간'
      or exists (
        select 1 from appointments a
        where a.slot_id = appointment_slots.id and patient_owns(a.account_patient_id)
      )
    )
  )
  with check (status in ('빈시간', '예약됨') and exists (select 1 from patients p where p.auth_user_id = auth.uid()));
```

> **왜 필요한가:** `slot_service.book_slot`/`release_slot`(Task 7)은 환자 세션(`acquire_as(patient.auth_user_id)`)으로 `appointment_slots`를 직접 UPDATE한다. 위 SELECT 정책만으로는 UPDATE가 허용되지 않아 — 환자가 예약을 신청하는 순간 DB가 권한 없음으로 판단해 슬롯 잠금에 실패하고, `book_slot`이 항상 `False`를 반환해 "이미 선택된 시간입니다" 오류로 예약 자체가 막힌다. 상태를 `빈시간`/`예약됨`으로 제한한 이유는 직원이 별도 사유로 막아둔(`휴진` 등) 슬롯까지 환자가 건드리지 못하게 하기 위함이다. 실제 전이 조건(어느 슬롯을, 어느 상태에서, 어느 상태로)은 `slot_service`의 조건부 SQL(`where status = '빈시간'`)이 이미 강제하므로 RLS는 "환자가 이 두 상태 사이에서만 손댈 수 있다"는 큰 테두리만 맡는다.
>
> **[정합성 검토 R2-01, 보안 수정]** `status in ('빈시간', '예약됨')`만 검사하던 최초 버전은 슬롯의 "소유"를 전혀 확인하지 않아, 로그인한 환자 A가 다른 환자 B의 이미 예약된(`예약됨`) 슬롯 id를 알기만 하면 (Supabase 클라이언트로 백엔드를 거치지 않고 직접 호출해도) `release_slot`과 같은 SQL로 그 슬롯을 `빈시간`으로 되돌릴 수 있었다 — 이는 다른 환자의 예약을 임의로 무효화하는 것과 같다. 수정한 `using` 절은 두 가지 경우만 UPDATE를 허용한다: ① 슬롯이 아직 `빈시간`이면 누구나 선점 시도할 수 있다(선착순 예약이므로 소유 개념이 없다 — 실제 승패는 `slot_service.book_slot`의 조건부 `where status = '빈시간'`이 가른다). ② 슬롯이 이미 `예약됨`이면, 그 슬롯을 참조하는 `appointments` 행의 `account_patient_id`를 `patient_owns()`로 확인해 **본인 또는 본인 가족의 예약일 때만** 반납(release)을 허용한다. `with check` 절은 그대로 두어 결과 상태가 항상 `빈시간`/`예약됨` 중 하나임을 보장한다.

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 오류 없이 적용됨

- [ ] **Step 3: conftest.py에 seed_patient 헬퍼 추가**

`backend/tests/conftest.py`에 추가:
```python
async def seed_patient(
    conn, name: str = "테스트환자", phone: str = "01011112222", with_auth: bool = True, is_active: bool = True,
) -> dict:
    auth_user_id = None
    if with_auth:
        auth_user_id = uuid.uuid4()
        await conn.execute(
            """
            insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
            values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
            """,
            auth_user_id, f"{auth_user_id}@test.local",
        )
    patient_id = await conn.fetchval(
        """
        insert into patients (auth_user_id, name, birth_date, gender, phone, is_active)
        values ($1, $2, '1990-01-01', 'F', $3, $4)
        returning id
        """,
        auth_user_id, name, phone, is_active,
    )
    return {"auth_user_id": auth_user_id, "patient_id": patient_id}
```

- [ ] **Step 4: 실패하는 RLS 테스트 작성**

`backend/tests/test_patient_identity_schema.py`:
```python
import pytest
from tests.conftest import seed_patient, seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_patient_can_register_self(db_conn):
    import uuid

    auth_user_id = uuid.uuid4()
    await db_conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_user_id, f"{auth_user_id}@test.local",
    )
    await set_session_auth(db_conn, auth_user_id)

    patient_id = await db_conn.fetchval(
        "insert into patients (auth_user_id, name, birth_date, gender, phone) values ($1, '홍길동', '1985-03-01', 'M', '01012345678') returning id",
        auth_user_id,
    )
    assert patient_id is not None


@pytest.mark.asyncio
async def test_patient_can_read_own_row_but_not_others(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    me = await seed_patient(db_conn, name="본인")
    other = await seed_patient(db_conn, name="타인")

    await set_session_auth(db_conn, me["auth_user_id"])
    rows = await db_conn.fetch("select id from patients")
    ids = {row["id"] for row in rows}
    assert me["patient_id"] in ids
    assert other["patient_id"] not in ids


@pytest.mark.asyncio
async def test_patient_can_read_family_member_via_link(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    me = await seed_patient(db_conn, name="부모")
    child = await seed_patient(db_conn, name="자녀", with_auth=False)
    await db_conn.execute(
        "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1, $2, '자녀')",
        me["patient_id"], child["patient_id"],
    )

    await set_session_auth(db_conn, me["auth_user_id"])
    row = await db_conn.fetchrow("select id from patients where id = $1", child["patient_id"])
    assert row is not None


@pytest.mark.asyncio
async def test_patient_cannot_directly_insert_family_link(db_conn):
    """[정합성 검토 R5-01] 환자는 patient_family_links에 직접 INSERT할 수 없다 — 반드시
    patient_family_service(add_family_member/confirm_family_link_otp)를 거쳐야 한다."""
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    me = await seed_patient(db_conn, name="본인", phone="01011110001")
    other = await seed_patient(db_conn, name="타인", phone="01011110002")

    await set_session_auth(db_conn, me["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1, $2, '가족')",
            me["patient_id"], other["patient_id"],
        )


@pytest.mark.asyncio
async def test_patient_can_read_active_department_and_doctor(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    me = await seed_patient(db_conn)

    await set_session_auth(db_conn, me["auth_user_id"])
    dept_rows = await db_conn.fetch("select id from departments")
    doctor_rows = await db_conn.fetch("select id from staff where role = 'doctor'")
    assert dept_id in {r["id"] for r in dept_rows}
    assert doctor["staff_id"] in {r["id"] for r in doctor_rows}


@pytest.mark.asyncio
async def test_patient_can_update_open_slot_to_booked(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '빈시간') returning id",
        doctor["staff_id"],
    )
    me = await seed_patient(db_conn)

    await set_session_auth(db_conn, me["auth_user_id"])
    result = await db_conn.execute(
        "update appointment_slots set status = '예약됨' where id = $1 and status = '빈시간'", slot_id,
    )
    assert result == "UPDATE 1"


@pytest.mark.asyncio
async def test_patient_cannot_update_blocked_slot(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '휴진') returning id",
        doctor["staff_id"],
    )
    me = await seed_patient(db_conn)

    await set_session_auth(db_conn, me["auth_user_id"])
    result = await db_conn.execute(
        "update appointment_slots set status = '예약됨' where id = $1", slot_id,
    )
    assert result == "UPDATE 0"


@pytest.mark.asyncio
async def test_patient_cannot_release_other_patients_booked_slot(db_conn):
    """[정합성 검토 R2-01] 환자 A가 환자 B의 예약 슬롯을 직접 '빈시간'으로 되돌릴 수 없어야 한다."""
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    patient_a = await seed_patient(db_conn, name="환자A", phone="01011110001")
    patient_b = await seed_patient(db_conn, name="환자B", phone="01011110002")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '예약됨') returning id",
        doctor["staff_id"],
    )
    await db_conn.execute(
        """
        insert into appointments
            (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $2, $2, $3, $4, '예약확정', 'app')
        """,
        slot_id, patient_b["patient_id"], dept_id, doctor["staff_id"],
    )

    await set_session_auth(db_conn, patient_a["auth_user_id"])
    result = await db_conn.execute(
        "update appointment_slots set status = '빈시간' where id = $1", slot_id,
    )
    assert result == "UPDATE 0"

    status = await db_conn.fetchval("select status from appointment_slots where id = $1", slot_id)
    assert status == "예약됨"


@pytest.mark.asyncio
async def test_patient_can_release_own_booked_slot(db_conn):
    """소유자 본인이 자기 예약 슬롯을 반납하는 정상 흐름은 계속 허용되어야 한다."""
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    patient_b = await seed_patient(db_conn, name="환자B", phone="01011110002")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '예약됨') returning id",
        doctor["staff_id"],
    )
    await db_conn.execute(
        """
        insert into appointments
            (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $2, $2, $3, $4, '예약확정', 'app')
        """,
        slot_id, patient_b["patient_id"], dept_id, doctor["staff_id"],
    )

    await set_session_auth(db_conn, patient_b["auth_user_id"])
    result = await db_conn.execute(
        "update appointment_slots set status = '빈시간' where id = $1", slot_id,
    )
    assert result == "UPDATE 1"
```

Run: `cd backend && pytest tests/test_patient_identity_schema.py -v`
Expected: FAIL(마이그레이션 적용 전이면 실패 — Step 2 이후 다시 실행하면 9개 모두 PASS)

- [ ] **Step 5: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_identity_schema.py -v`
Expected: 9개 테스트 모두 PASS([정합성 검토 R5-01] 검증 테스트 1건 추가로 8→9)

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/00009_patient_identity.sql backend/tests/conftest.py backend/tests/test_patient_identity_schema.py
git commit -m "feat: patients.auth_user_id 링크와 patient_owns() 기반 환자용 RLS 추가 (R2-01: 타 환자 슬롯 반납 차단 포함)"
```

---

## Task 2: 마이그레이션 — appointments/사전문진/진료기록 환자용 RLS + cancellation_requested_at

**Files:**
- Create: `supabase/migrations/00010_patient_appointments_rls.sql`
- Test: `backend/tests/test_patient_appointments_rls.py`

**Interfaces:**
- Consumes: `patient_owns()`(Task 1), DB 테이블 `appointments`, `appointment_status_history`, `questionnaire_templates`, `questionnaire_responses`, `medical_records`, `hospital_settings`(1단계 Task 5~8)
- Produces: `appointments.cancellation_requested_at`(nullable timestamptz), `appointment_status_history.changed_by_patient_id`(nullable, `patients(id)` 참조, `changed_by`는 nullable로 변경), `hospital_settings.auto_confirm_app_bookings`(boolean, 기본 false), 환자용 select/insert/update RLS 정책 일체, DB 뷰 `patient_medical_notes(id, appointment_id, patient_visible_notes, is_completed, updated_at)`(Task 11이 `medical_records` 대신 이 뷰를 조회 — 의료진 전용 항목 비노출용)

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/00010_patient_appointments_rls.sql`:
```sql
alter table appointments add column cancellation_requested_at timestamptz;

alter table appointment_status_history alter column changed_by drop not null;
alter table appointment_status_history add column changed_by_patient_id uuid references patients(id);
alter table appointment_status_history
  add constraint appointment_status_history_actor_check
  check (changed_by is not null or changed_by_patient_id is not null);

alter table hospital_settings add column auto_confirm_app_bookings boolean not null default false;

create policy "patients_can_read_own_appointments" on appointments
  for select
  using (patient_owns(for_patient_id) or patient_owns(account_patient_id));

create policy "patients_can_create_own_appointments" on appointments
  for insert
  with check (source = 'app' and patient_owns(account_patient_id) and patient_owns(for_patient_id));

create policy "patients_can_update_own_appointments" on appointments
  for update
  using (patient_owns(account_patient_id))
  with check (patient_owns(account_patient_id));

create policy "patients_can_read_own_status_history" on appointment_status_history
  for select
  using (exists (select 1 from appointments a where a.id = appointment_status_history.appointment_id and patient_owns(a.account_patient_id)));

-- 실제 상태전이(from_status <> to_status)를 흉내낸 행은 직접 INSERT로 만들 수 없다 — 1단계에서 만든
-- log_appointment_status_change() 트리거만 그런 행을 남길 수 있으므로(아래에서 patient 행위자도 인식하도록
-- 재정의한다), "치명적 규칙은 DB가 최종 심판" 원칙이 환자에게도 동일하게 적용된다.
-- 다만 "마감 후 취소 요청"(cancellation_requested_at만 세팅, 상태 자체는 그대로)처럼 상태변화가 없는
-- 관리 메모는 1단계의 staff_can_insert_note_history와 동일한 조건(from_status = to_status)으로 허용한다.
create policy "patients_can_insert_note_history" on appointment_status_history
  for insert
  with check (
    from_status = to_status
    and changed_by_patient_id is not null
    and exists (select 1 from patients p where p.auth_user_id = auth.uid() and p.id = appointment_status_history.changed_by_patient_id)
    and exists (select 1 from appointments a where a.id = appointment_status_history.appointment_id and patient_owns(a.account_patient_id))
  );

-- 1단계 log_appointment_status_change()는 auth.uid()를 staff 테이블에서만 찾았다.
-- 환자가 직접 예약을 생성·취소·변경할 수 있게 된 이 단계부터는 환자 행위자도 인식해야 하므로 재정의한다.
create or replace function log_appointment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid;
  v_patient_id uuid;
  v_old_status text;
begin
  v_old_status := case when tg_op = 'INSERT' then null else old.status end;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    select id into v_staff_id from staff where auth_user_id = auth.uid();
    if v_staff_id is null then
      select id into v_patient_id from patients where auth_user_id = auth.uid();
    end if;
    -- auth.uid()가 없는 세션(배포 시드 스크립트, 관리자 배치 작업 등 JWT 클레임 없이 직접 접속하는 경우)에는
    -- 행위자를 알 수 없다. changed_by/changed_by_patient_id 둘 다 not null 체크 제약이 있으므로,
    -- 행위자를 특정하지 못하면 이력 행을 만들지 않고 조용히 건너뛴다(제약 위반으로 시드/배치가 깨지는 것을 방지).
    if v_staff_id is not null or v_patient_id is not null then
      insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, changed_by_patient_id, reason)
      values (
        new.id, v_old_status, new.status, v_staff_id, v_patient_id,
        coalesce(
          current_setting('app.status_change_reason', true),
          case when tg_op = 'INSERT' then (case when v_patient_id is not null then '환자 앱 예약 신청' else '예약 생성' end) else null end
        )
      );
    end if;
  end if;
  return new;
end;
$$;

create policy "patients_can_read_templates" on questionnaire_templates
  for select
  using (exists (select 1 from patients p where p.auth_user_id = auth.uid()));

create policy "patients_can_manage_own_questionnaire_responses" on questionnaire_responses
  for all
  using (exists (select 1 from appointments a where a.id = questionnaire_responses.appointment_id and patient_owns(a.for_patient_id)))
  with check (exists (select 1 from appointments a where a.id = questionnaire_responses.appointment_id and patient_owns(a.for_patient_id)));

create view patient_medical_notes with (security_invoker = false) as
  select mr.id, mr.appointment_id, mr.patient_visible_notes, mr.is_completed, mr.updated_at
  from medical_records mr
  join appointments a on a.id = mr.appointment_id
  where mr.is_completed and patient_owns(a.for_patient_id);

grant select on patient_medical_notes to authenticated;

create policy "patients_can_read_hospital_settings" on hospital_settings
  for select
  using (exists (select 1 from patients p where p.auth_user_id = auth.uid()));
```

> **왜 정책 대신 뷰(view)로 만드는가:** `medical_records`에는 `symptoms`(증상)/`diagnosis`(진단)/`treatment`(치료) 같은 의료진 전용 항목과, 환자에게 그대로 보여줘도 되는 `patient_visible_notes`가 한 테이블에 같이 있다. RLS 정책은 "이 행을 볼 수 있는가"만 판단할 뿐 "이 행에서 어느 칼럼을 보여줄 것인가"는 판단하지 못한다(행 단위 보안이지 칼럼 단위 보안이 아니다). 그래서 환자용 정책을 `medical_records` 테이블에 직접 걸면, 백엔드 API를 거치지 않고 앱이 Supabase에 직접 접속하는 경로(로그인, Realtime 구독)로 환자가 같은 테이블을 조회할 경우 의료진 전용 항목까지 그대로 노출된다. 대신 안전한 칼럼만 골라 담은 `patient_medical_notes` 뷰를 만들고(`security_invoker = false`이므로 뷰 소유자 권한으로 실행되어 `medical_records`의 RLS 자체를 우회하지만, 뷰의 `where` 절에 있는 `patient_owns()` 검사가 그 자리를 대신한다), `medical_records` 테이블에는 환자용 정책을 아예 두지 않는다 — 이러면 환자가 어떤 경로로 접속하든 `medical_records`를 직접 조회하면 0건이 반환되고, 안전한 항목만 담긴 뷰를 통해서만 조회할 수 있다.

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 오류 없이 적용됨

- [ ] **Step 3: 실패하는 RLS 테스트 작성**

`backend/tests/test_patient_appointments_rls.py`:
```python
import pytest
from tests.conftest import seed_patient, seed_staff, set_session_auth


async def _seed_dept_and_doctor(conn):
    doctor = await seed_staff(conn, role="doctor")
    dept_id = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    # 담당의 소속 진료과와 예약 진료과가 일치해야 하므로(1단계 trg_enforce_appointment_consistency) 맞춰준다.
    await conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    return dept_id, doctor["staff_id"]


@pytest.mark.asyncio
async def test_patient_can_create_own_app_appointment(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id, doctor_id = await _seed_dept_and_doctor(db_conn)
    me = await seed_patient(db_conn)

    await set_session_auth(db_conn, me["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $1, $2, $3, '예약신청', 'app')
        returning id
        """,
        me["patient_id"], dept_id, doctor_id,
    )
    assert appointment_id is not None


@pytest.mark.asyncio
async def test_patient_cannot_create_appointment_for_stranger(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id, doctor_id = await _seed_dept_and_doctor(db_conn)
    me = await seed_patient(db_conn)
    stranger = await seed_patient(db_conn, with_auth=False)

    await set_session_auth(db_conn, me["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            """
            insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source)
            values ($1, $2, $3, $4, '예약신청', 'app')
            """,
            me["patient_id"], stranger["patient_id"], dept_id, doctor_id,
        )


@pytest.mark.asyncio
async def test_patient_cannot_read_other_patients_appointment(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id, doctor_id = await _seed_dept_and_doctor(db_conn)
    me = await seed_patient(db_conn)
    other = await seed_patient(db_conn)

    await set_session_auth(db_conn, other["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $1, $2, $3, '예약신청', 'app')
        returning id
        """,
        other["patient_id"], dept_id, doctor_id,
    )

    await set_session_auth(db_conn, me["auth_user_id"])
    row = await db_conn.fetchrow("select id from appointments where id = $1", appointment_id)
    assert row is None


@pytest.mark.asyncio
async def test_patient_cannot_read_medical_records_table_directly(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    dept_id, doctor_id = await _seed_dept_and_doctor(db_conn)
    me = await seed_patient(db_conn)
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $1, $2, $3, '진료완료', 'app')
        returning id
        """,
        me["patient_id"], dept_id, doctor_id,
    )
    await db_conn.execute(
        """
        insert into medical_records (appointment_id, doctor_id, symptoms, diagnosis, patient_visible_notes, is_completed)
        values ($1, $2, '내부 증상', '내부 진단', '푹 쉬세요', true)
        """,
        appointment_id, doctor_id,
    )

    await set_session_auth(db_conn, me["auth_user_id"])
    rows = await db_conn.fetch("select * from medical_records where appointment_id = $1", appointment_id)
    assert rows == []

    view_rows = await db_conn.fetch(
        "select patient_visible_notes from patient_medical_notes where appointment_id = $1", appointment_id,
    )
    assert len(view_rows) == 1
    assert view_rows[0]["patient_visible_notes"] == "푹 쉬세요"
```

Run: `cd backend && pytest tests/test_patient_appointments_rls.py -v`
Expected: 마이그레이션 적용 전에는 첫 번째 테스트 FAIL(정책 없음) → Step 2 이후 4개 모두 PASS

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_appointments_rls.py -v`
Expected: 4개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00010_patient_appointments_rls.sql backend/tests/test_patient_appointments_rls.py
git commit -m "feat: 환자용 예약/사전문진/진료기록 RLS와 취소요청/자동확정 필드 추가"
```

---

## Task 3: 마이그레이션 — device_tokens

**Files:**
- Create: `supabase/migrations/00011_device_tokens.sql`
- Test: `backend/tests/test_device_tokens_schema.py`

**Interfaces:**
- Consumes: `patients`(Task 1), `staff`(1단계 Task 2)
- Produces: DB 테이블 `device_tokens(id, patient_id, fcm_token, created_at)`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/00011_device_tokens.sql`:
```sql
create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  fcm_token text not null,
  created_at timestamptz not null default now(),
  unique (patient_id, fcm_token)
);

alter table device_tokens enable row level security;

create policy "patients_can_manage_own_device_tokens" on device_tokens
  for all
  using (exists (select 1 from patients p where p.auth_user_id = auth.uid() and p.id = device_tokens.patient_id))
  with check (exists (select 1 from patients p where p.auth_user_id = auth.uid() and p.id = device_tokens.patient_id));

create policy "staff_can_read_device_tokens" on device_tokens
  for select
  using (exists (select 1 from staff s where s.auth_user_id = auth.uid() and s.is_active));
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 오류 없이 적용됨

- [ ] **Step 3: 실패하는 테스트 작성**

`backend/tests/test_device_tokens_schema.py`:
```python
import pytest
from tests.conftest import seed_patient, seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_patient_can_register_own_token(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    me = await seed_patient(db_conn)

    await set_session_auth(db_conn, me["auth_user_id"])
    token_id = await db_conn.fetchval(
        "insert into device_tokens (patient_id, fcm_token) values ($1, 'token-abc') returning id",
        me["patient_id"],
    )
    assert token_id is not None


@pytest.mark.asyncio
async def test_patient_cannot_register_token_for_others(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    me = await seed_patient(db_conn)
    other = await seed_patient(db_conn)

    await set_session_auth(db_conn, me["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into device_tokens (patient_id, fcm_token) values ($1, 'token-xyz')", other["patient_id"],
        )
```

- [ ] **Step 4: 테스트 실행**

Run: `cd backend && pytest tests/test_device_tokens_schema.py -v`
Expected: 2개 테스트 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00011_device_tokens.sql backend/tests/test_device_tokens_schema.py
git commit -m "feat: device_tokens 테이블과 RLS 정책 추가"
```

---

## Task 4: 환자 인증 의존성 (PatientContext, get_current_patient)

**Files:**
- Create: `backend/app/core/patient_security.py`
- Test: `backend/tests/test_patient_security.py`

**Interfaces:**
- Consumes: `app.core.config.settings`, `app.db.pool.acquire_as`(1단계 Task 1, 9)
- Produces: `app.core.patient_security.PatientContext`(dataclass: `id: UUID`, `auth_user_id: UUID`), `app.core.patient_security.get_current_auth_user_id(request) -> UUID`(FastAPI dependency, `patients` 행이 아직 없어도 통과 — 가입 직후 프로필 등록에 사용), `app.core.patient_security.get_current_patient(request) -> PatientContext`(FastAPI dependency, 등록된 활성 환자만 통과), `app.core.patient_security.list_accessible_patient_ids(patient: PatientContext) -> list[UUID]`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_patient_security.py`:
```python
import time

import pytest
from fastapi import HTTPException
from jose import jwt
from starlette.requests import Request

from app.core.config import settings
from tests.conftest import seed_patient


def make_patient_token(auth_user_id: str) -> str:
    payload = {
        "sub": auth_user_id,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _request_with_token(token: str) -> Request:
    scope = {"type": "http", "headers": [(b"authorization", f"Bearer {token}".encode())]}
    return Request(scope)


@pytest.mark.asyncio
async def test_get_current_patient_returns_context_for_registered_patient(db_conn):
    from app.core.patient_security import get_current_patient

    patient = await seed_patient(db_conn)
    token = make_patient_token(str(patient["auth_user_id"]))

    ctx = await get_current_patient(_request_with_token(token))
    assert ctx.id == patient["patient_id"]


@pytest.mark.asyncio
async def test_get_current_patient_rejects_unregistered_auth_user(db_conn):
    from app.core.patient_security import get_current_patient
    import uuid

    unknown_auth_id = uuid.uuid4()
    await db_conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        unknown_auth_id, f"{unknown_auth_id}@test.local",
    )
    token = make_patient_token(str(unknown_auth_id))

    with pytest.raises(HTTPException) as exc_info:
        await get_current_patient(_request_with_token(token))
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_list_accessible_patient_ids_includes_family(db_conn):
    from app.core.patient_security import PatientContext, list_accessible_patient_ids
    from tests.conftest import seed_staff, set_session_auth

    me = await seed_patient(db_conn)
    child = await seed_patient(db_conn, with_auth=False)

    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute(
        "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1, $2, '자녀')",
        me["patient_id"], child["patient_id"],
    )

    ctx = PatientContext(id=me["patient_id"], auth_user_id=me["auth_user_id"])
    ids = await list_accessible_patient_ids(ctx)
    assert set(ids) == {me["patient_id"], child["patient_id"]}
```

Run: `cd backend && pytest tests/test_patient_security.py -v`
Expected: FAIL(`app.core.patient_security` 모듈 없음)

- [ ] **Step 2: patient_security.py 구현**

`backend/app/core/patient_security.py`:
```python
from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, Request
from jose import JWTError, jwt

from app.core.config import settings
from app.db.pool import acquire_as


def _decode_sub(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    token = auth_header.removeprefix("Bearer ")
    try:
        payload = jwt.decode(
            token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated",
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="로그인 정보가 올바르지 않습니다.")
    return payload["sub"]


async def get_current_auth_user_id(request: Request) -> UUID:
    return UUID(_decode_sub(request))


@dataclass
class PatientContext:
    id: UUID
    auth_user_id: UUID


async def get_current_patient(request: Request) -> PatientContext:
    auth_user_id = _decode_sub(request)
    async with acquire_as(auth_user_id) as conn:
        row = await conn.fetchrow(
            "select id, is_active from patients where auth_user_id = $1", UUID(auth_user_id),
        )
    if row is None or not row["is_active"]:
        raise HTTPException(status_code=403, detail="등록되지 않았거나 사용 중지된 계정입니다.")
    return PatientContext(id=row["id"], auth_user_id=UUID(auth_user_id))


async def list_accessible_patient_ids(patient: PatientContext) -> list[UUID]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select family_patient_id from patient_family_links where account_patient_id = $1", patient.id,
        )
    return [patient.id] + [row["family_patient_id"] for row in rows]
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_security.py -v`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/app/core/patient_security.py backend/tests/test_patient_security.py
git commit -m "feat: 환자용 JWT 인증 의존성(PatientContext) 추가"
```

---

## Task 5: 환자 프로필 서비스 (등록/조회/탈퇴)

**Files:**
- Create: `backend/app/services/patient_profile_service.py`
- Test: `backend/tests/test_patient_profile_service.py`

**Interfaces:**
- Consumes: `app.core.patient_security.PatientContext, get_current_auth_user_id`(Task 4), `app.db.pool.acquire_as`(1단계 Task 9), `app.db.admin_client.get_admin_client`(1단계 Task 12), `app.core.errors.AppError`(1단계 Task 10)
- Produces: `app.services.patient_profile_service.register_profile(auth_user_id: UUID, name: str, birth_date: date, gender: str, phone: str) -> UUID`, `get_my_profile(patient: PatientContext) -> dict`, `deactivate_self(patient: PatientContext) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_patient_profile_service.py`:
```python
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_profile_service
from tests.conftest import seed_patient


@pytest.mark.asyncio
async def test_register_profile_creates_patient_row(db_conn, monkeypatch):
    import uuid

    auth_user_id = uuid.uuid4()
    await db_conn.execute(
        """
        insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        values ($1, $2, '', now(), now(), now(), 'authenticated', 'authenticated')
        """,
        auth_user_id, f"{auth_user_id}@test.local",
    )

    patient_id = await patient_profile_service.register_profile(
        auth_user_id=auth_user_id, name="홍길동", birth_date=date(1985, 3, 1), gender="M", phone="01012345678",
    )
    assert patient_id is not None

    row = await db_conn.fetchrow("select name, auth_user_id from patients where id = $1", patient_id)
    assert row["name"] == "홍길동"
    assert row["auth_user_id"] == auth_user_id


@pytest.mark.asyncio
async def test_register_profile_rejects_duplicate(db_conn):
    patient = await seed_patient(db_conn)

    with pytest.raises(AppError):
        await patient_profile_service.register_profile(
            auth_user_id=patient["auth_user_id"], name="다시가입", birth_date=date(1990, 1, 1), gender="F",
            phone="01099998888",
        )


@pytest.mark.asyncio
async def test_get_my_profile_returns_fields(db_conn):
    patient = await seed_patient(db_conn, name="김환자")
    ctx = PatientContext(id=patient["patient_id"], auth_user_id=patient["auth_user_id"])

    profile = await patient_profile_service.get_my_profile(ctx)
    assert profile["name"] == "김환자"


@pytest.mark.asyncio
async def test_deactivate_self_sets_inactive_and_bans_auth_account(db_conn):
    patient = await seed_patient(db_conn)
    ctx = PatientContext(id=patient["patient_id"], auth_user_id=patient["auth_user_id"])

    fake_admin_client = MagicMock()
    with patch("app.services.patient_profile_service.get_admin_client", return_value=fake_admin_client):
        await patient_profile_service.deactivate_self(ctx)

    fake_admin_client.auth.admin.update_user_by_id.assert_called_once()
    row = await db_conn.fetchrow("select is_active from patients where id = $1", patient["patient_id"])
    assert row["is_active"] is False
```

Run: `cd backend && pytest tests/test_patient_profile_service.py -v`
Expected: FAIL(`app.services.patient_profile_service` 모듈 없음)

- [ ] **Step 2: patient_profile_service 구현**

`backend/app/services/patient_profile_service.py`:
```python
from datetime import date
from uuid import UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.admin_client import get_admin_client
from app.db.pool import acquire_as


async def register_profile(auth_user_id: UUID, name: str, birth_date: date, gender: str, phone: str) -> UUID:
    async with acquire_as(str(auth_user_id)) as conn:
        existing = await conn.fetchval("select id from patients where auth_user_id = $1", auth_user_id)
        if existing is not None:
            raise AppError("이미 등록된 계정입니다.", status_code=409)

        patient_id = await conn.fetchval(
            """
            insert into patients (auth_user_id, name, birth_date, gender, phone)
            values ($1, $2, $3, $4, $5)
            returning id
            """,
            auth_user_id, name, birth_date, gender, phone,
        )
    return patient_id


async def get_my_profile(patient: PatientContext) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select id, name, birth_date, gender, phone from patients where id = $1", patient.id,
        )
    return {
        "id": row["id"],
        "name": row["name"],
        "birth_date": str(row["birth_date"]),
        "gender": row["gender"],
        "phone": row["phone"],
    }


async def deactivate_self(patient: PatientContext) -> None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute("update patients set is_active = false where id = $1", patient.id)

    admin = get_admin_client()
    admin.auth.admin.update_user_by_id(str(patient.auth_user_id), {"ban_duration": "87600h"})
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_profile_service.py -v`
Expected: 4개 테스트 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/app/services/patient_profile_service.py backend/tests/test_patient_profile_service.py
git commit -m "feat: 환자 프로필 등록/조회/탈퇴 서비스 추가"
```

---

## Task 6: 가족 CRUD 서비스

**Files:**
- Create: `backend/app/services/patient_family_service.py`
- Test: `backend/tests/test_patient_family_service.py`

**Interfaces:**
- Consumes: `app.core.patient_security.PatientContext`(Task 4), `app.db.pool.acquire_as`, `app.core.errors.AppError`
- Produces: `app.services.patient_family_service.add_family_member(patient, name: str, birth_date: date, gender: str, relation: str) -> UUID`, `list_family_members(patient) -> list[dict]`, `update_family_member(patient, family_patient_id: UUID, name: str, birth_date: date, gender: str, relation: str) -> None`, `unlink_family_member(patient, family_patient_id: UUID) -> None`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_patient_family_service.py`:
```python
from datetime import date

import pytest

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_family_service
from tests.conftest import seed_patient


def _to_context(seed: dict) -> PatientContext:
    return PatientContext(id=seed["patient_id"], auth_user_id=seed["auth_user_id"])


@pytest.mark.asyncio
async def test_add_and_list_family_member(db_conn):
    me = _to_context(await seed_patient(db_conn))

    family_id = await patient_family_service.add_family_member(
        me, name="김자녀", birth_date=date(2015, 5, 5), gender="F", relation="자녀",
    )
    assert family_id is not None

    members = await patient_family_service.list_family_members(me)
    assert len(members) == 1
    assert members[0]["name"] == "김자녀"
    assert members[0]["relation"] == "자녀"


@pytest.mark.asyncio
async def test_update_family_member(db_conn):
    me = _to_context(await seed_patient(db_conn))
    family_id = await patient_family_service.add_family_member(
        me, name="김자녀", birth_date=date(2015, 5, 5), gender="F", relation="자녀",
    )

    await patient_family_service.update_family_member(
        me, family_id, name="김자녀(수정)", birth_date=date(2015, 5, 5), gender="F", relation="자녀",
    )

    members = await patient_family_service.list_family_members(me)
    assert members[0]["name"] == "김자녀(수정)"


@pytest.mark.asyncio
async def test_unlink_family_member_soft_deletes(db_conn):
    me = _to_context(await seed_patient(db_conn))
    family_id = await patient_family_service.add_family_member(
        me, name="김자녀", birth_date=date(2015, 5, 5), gender="F", relation="자녀",
    )

    await patient_family_service.unlink_family_member(me, family_id)

    members = await patient_family_service.list_family_members(me)
    assert members == []


@pytest.mark.asyncio
async def test_cannot_update_family_member_of_another_account(db_conn):
    me = _to_context(await seed_patient(db_conn))
    other = _to_context(await seed_patient(db_conn))
    family_id = await patient_family_service.add_family_member(
        me, name="김자녀", birth_date=date(2015, 5, 5), gender="F", relation="자녀",
    )

    with pytest.raises(AppError):
        await patient_family_service.update_family_member(
            other, family_id, name="가로채기", birth_date=date(2015, 5, 5), gender="F", relation="자녀",
        )
```

Run: `cd backend && pytest tests/test_patient_family_service.py -v`
Expected: FAIL(`app.services.patient_family_service` 모듈 없음)

- [ ] **Step 2: patient_family_service 구현**

`backend/app/services/patient_family_service.py`:
```python
from datetime import date
from uuid import UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as, get_pool


async def add_family_member(
    patient: PatientContext, name: str, birth_date: date, gender: str, relation: str,
) -> UUID:
    """[정합성 검토 R5-01] patient_family_links는 클라이언트가 직접 INSERT할 수 없도록 RLS를
    막아뒀으므로(Task 1), 이 함수는 get_pool()의 서비스 역할 커넥션으로 직접 쓴다. family_patient_id는
    여기서 항상 새로 만드는 행이라 클라이언트가 기존 환자를 지목할 방법이 없어 안전하다."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            account_phone = await conn.fetchval("select phone from patients where id = $1", patient.id)
            family_id = await conn.fetchval(
                "insert into patients (name, birth_date, gender, phone) values ($1, $2, $3, $4) returning id",
                name, birth_date, gender, account_phone,
            )
            await conn.execute(
                "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1, $2, $3)",
                patient.id, family_id, relation,
            )
    return family_id


async def list_family_members(patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            """
            select p.id, p.name, p.birth_date, p.gender, l.relation
            from patient_family_links l
            join patients p on p.id = l.family_patient_id
            where l.account_patient_id = $1 and p.is_active
            order by p.name
            """,
            patient.id,
        )
    return [
        {"id": r["id"], "name": r["name"], "birth_date": str(r["birth_date"]), "gender": r["gender"], "relation": r["relation"]}
        for r in rows
    ]


async def update_family_member(
    patient: PatientContext, family_patient_id: UUID, name: str, birth_date: date, gender: str, relation: str,
) -> None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        link = await conn.fetchrow(
            "select id from patient_family_links where account_patient_id = $1 and family_patient_id = $2",
            patient.id, family_patient_id,
        )
        if link is None:
            raise AppError("본인이 등록한 가족만 수정할 수 있습니다.", status_code=403)

        await conn.execute(
            "update patients set name = $1, birth_date = $2, gender = $3 where id = $4",
            name, birth_date, gender, family_patient_id,
        )
        await conn.execute(
            "update patient_family_links set relation = $1 where id = $2", relation, link["id"],
        )


async def unlink_family_member(patient: PatientContext, family_patient_id: UUID) -> None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        link = await conn.fetchrow(
            "select id from patient_family_links where account_patient_id = $1 and family_patient_id = $2",
            patient.id, family_patient_id,
        )
        if link is None:
            raise AppError("본인이 등록한 가족만 연결 해제할 수 있습니다.", status_code=403)

        await conn.execute("update patients set is_active = false where id = $1", family_patient_id)
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_family_service.py -v`
Expected: 4개 테스트 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/app/services/patient_family_service.py backend/tests/test_patient_family_service.py
git commit -m "feat: 가족 등록/수정/연결해제 서비스 추가"
```

---

## Task 7: 예약 카탈로그(진료과/의사/슬롯) 조회 서비스 + slot_service.release_slot

**Files:**
- Create: `backend/app/services/patient_catalog_service.py`
- Modify: `backend/app/services/slot_service.py` (`release_slot` 함수 추가)
- Test: `backend/tests/test_patient_catalog_service.py`
- Test: `backend/tests/test_slot_service.py` (release_slot 테스트 추가)

**Interfaces:**
- Consumes: `app.core.patient_security.PatientContext`(Task 4), `app.db.pool.acquire_as`
- Produces: `app.services.patient_catalog_service.list_departments(patient) -> list[dict]`, `list_doctors(department_id: UUID, patient) -> list[dict]`, `list_available_dates(doctor_id: UUID, patient) -> list[str]`, `list_available_slots(doctor_id: UUID, target_date: date, patient) -> list[dict]`, `app.services.slot_service.release_slot(slot_id: UUID, actor, conn=None) -> None`(`actor`는 `.auth_user_id` 속성을 가진 `StaffContext` 또는 `PatientContext`)

- [ ] **Step 1: 실패하는 테스트 작성 — release_slot**

`backend/tests/test_slot_service.py`에 추가:
```python
@pytest.mark.asyncio
async def test_release_slot_sets_status_back_to_empty(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    staff = _to_context(admin, "admin")
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '예약됨') returning id",
        doctor["staff_id"],
    )

    await slot_service.release_slot(slot_id, staff, conn=db_conn)

    status = await db_conn.fetchval("select status from appointment_slots where id = $1", slot_id)
    assert status == "빈시간"
```

Run: `cd backend && pytest tests/test_slot_service.py -v`
Expected: 새 테스트 FAIL(`release_slot` 없음)

- [ ] **Step 2: release_slot 구현**

`backend/app/services/slot_service.py`에 추가:
```python
async def release_slot(slot_id: UUID, actor, conn=None) -> None:
    async def _run(c):
        await c.execute("update appointment_slots set status = '빈시간' where id = $1", slot_id)

    if conn is not None:
        await _run(conn)
        return

    async with acquire_as(str(actor.auth_user_id)) as c:
        await _run(c)
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_slot_service.py -v`
Expected: 4개 테스트 모두 PASS

- [ ] **Step 4: 실패하는 테스트 작성 — patient_catalog_service**

`backend/tests/test_patient_catalog_service.py`:
```python
from datetime import date

import pytest

from app.core.patient_security import PatientContext
from app.services import patient_catalog_service
from tests.conftest import seed_patient, seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_list_departments_returns_active_only(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute("insert into departments (name, is_active) values ('내과', true)")
    await db_conn.execute("insert into departments (name, is_active) values ('폐과진료과', false)")
    patient = await seed_patient(db_conn)

    ctx = PatientContext(id=patient["patient_id"], auth_user_id=patient["auth_user_id"])
    departments = await patient_catalog_service.list_departments(ctx)
    assert [d["name"] for d in departments] == ["내과"]


@pytest.mark.asyncio
async def test_list_available_slots_excludes_booked(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    await db_conn.execute(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:00', '빈시간')",
        doctor["staff_id"],
    )
    await db_conn.execute(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-08-01', '09:20', '예약됨')",
        doctor["staff_id"],
    )
    patient = await seed_patient(db_conn)
    ctx = PatientContext(id=patient["patient_id"], auth_user_id=patient["auth_user_id"])

    slots = await patient_catalog_service.list_available_slots(doctor["staff_id"], date(2026, 8, 1), ctx)
    assert len(slots) == 1
    assert str(slots[0]["start_time"]) == "09:00:00"
```

Run: `cd backend && pytest tests/test_patient_catalog_service.py -v`
Expected: FAIL(`app.services.patient_catalog_service` 모듈 없음)

- [ ] **Step 5: patient_catalog_service 구현**

`backend/app/services/patient_catalog_service.py`:
```python
from datetime import date
from uuid import UUID

from app.core.patient_security import PatientContext
from app.db.pool import acquire_as


async def list_departments(patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch("select id, name from departments where is_active order by name")
    return [dict(row) for row in rows]


async def list_doctors(department_id: UUID, patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select id, name from staff where role = 'doctor' and department_id = $1 and is_active order by name",
            department_id,
        )
    return [dict(row) for row in rows]


async def list_available_dates(doctor_id: UUID, patient: PatientContext) -> list[str]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            """
            select distinct slot_date from appointment_slots
            where doctor_id = $1 and status = '빈시간' and slot_date >= current_date
            order by slot_date
            limit 60
            """,
            doctor_id,
        )
    return [str(row["slot_date"]) for row in rows]


async def list_available_slots(doctor_id: UUID, target_date: date, patient: PatientContext) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            """
            select id, start_time from appointment_slots
            where doctor_id = $1 and slot_date = $2 and status = '빈시간'
            order by start_time
            """,
            doctor_id, target_date,
        )
    return [{"id": row["id"], "start_time": row["start_time"]} for row in rows]
```

- [ ] **Step 6: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_catalog_service.py -v`
Expected: 2개 테스트 모두 PASS

- [ ] **Step 7: 커밋**

```bash
git add backend/app/services/patient_catalog_service.py backend/app/services/slot_service.py backend/tests/test_patient_catalog_service.py backend/tests/test_slot_service.py
git commit -m "feat: 환자용 진료과/의사/슬롯 조회 서비스와 slot_service.release_slot 추가"
```

---

## Task 8: 예약 생성/변경 서비스 (patient_booking_service)

**Files:**
- Create: `backend/app/services/patient_booking_service.py`
- Test: `backend/tests/test_patient_booking_service.py`

**Interfaces:**
- Consumes: `app.core.patient_security.PatientContext`(Task 4), `app.services.slot_service.book_slot, release_slot`(1단계 Task 13, Task 7), `app.core.errors.AppError`
- Produces: `app.services.patient_booking_service.create_booking(patient, for_patient_id: UUID, department_id: UUID, doctor_id: UUID, slot_id: UUID, reason: str, source: str = 'app') -> UUID`, `change_booking(patient, appointment_id: UUID, new_slot_id: UUID, reason: str) -> UUID`

> **4단계와의 공유 계약:** `source` 매개변수는 4단계 AI 상담봇(`ai-chatbot.md`)이 이 서비스를 `source='chatbot'`으로 재사용하기 위한 계약이다. 허용값은 `appointments.source` enum(`'app'`/`'chatbot'`/`'staff'`) 중 환자 경로인 `'app'`/`'chatbot'`만이며, 서버에서 검증한다(`'staff'`는 직원 경로 전용이므로 거부). 환자 앱 라우터(Task 13)는 클라이언트로부터 `source`를 받지 않고 기본값 `'app'`을 그대로 쓴다 — 앱 API로는 source 조작이 불가능하다. 이 시그니처를 바꿀 때는 4단계 문서와 함께 갱신해야 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_patient_booking_service.py`:
```python
import pytest

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_booking_service
from tests.conftest import seed_patient, seed_staff, set_session_auth


def _to_context(seed: dict) -> PatientContext:
    return PatientContext(id=seed["patient_id"], auth_user_id=seed["auth_user_id"])


async def _seed_base(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    # 담당의 소속 진료과와 예약 진료과가 일치해야 하므로(1단계 trg_enforce_appointment_consistency) 맞춰준다.
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-01', '09:00') returning id",
        doctor["staff_id"],
    )
    patient = await seed_patient(db_conn)
    return {"dept_id": dept_id, "doctor_id": doctor["staff_id"], "slot_id": slot_id, "patient": _to_context(patient)}


@pytest.mark.asyncio
async def test_create_booking_requests_by_default(db_conn):
    ctx = await _seed_base(db_conn)

    appointment_id = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기",
    )

    row = await db_conn.fetchrow("select status, source from appointments where id = $1", appointment_id)
    assert row["status"] == "예약신청"
    assert row["source"] == "app"

    slot_status = await db_conn.fetchval("select status from appointment_slots where id = $1", ctx["slot_id"])
    assert slot_status == "예약됨"


@pytest.mark.asyncio
async def test_create_booking_auto_confirms_when_setting_enabled(db_conn):
    ctx = await _seed_base(db_conn)
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute("update hospital_settings set auto_confirm_app_bookings = true")

    appointment_id = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기",
    )

    status = await db_conn.fetchval("select status from appointments where id = $1", appointment_id)
    assert status == "예약확정"


@pytest.mark.asyncio
async def test_create_booking_fails_when_slot_already_taken(db_conn):
    ctx = await _seed_base(db_conn)
    await db_conn.execute("update appointment_slots set status = '예약됨' where id = $1", ctx["slot_id"])

    with pytest.raises(AppError) as exc_info:
        await patient_booking_service.create_booking(
            ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
            doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기",
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_change_booking_releases_old_and_books_new(db_conn):
    ctx = await _seed_base(db_conn)
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    new_slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-03', '10:00') returning id",
        ctx["doctor_id"],
    )

    appointment_id = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=ctx["slot_id"], reason="감기",
    )

    new_appointment_id = await patient_booking_service.change_booking(
        ctx["patient"], appointment_id, new_slot_id, reason="시간 변경"
    )

    old_status = await db_conn.fetchval("select status from appointments where id = $1", appointment_id)
    assert old_status == "환자취소"

    old_slot_status = await db_conn.fetchval("select status from appointment_slots where id = $1", ctx["slot_id"])
    assert old_slot_status == "빈시간"

    new_row = await db_conn.fetchrow("select status, slot_id from appointments where id = $1", new_appointment_id)
    assert new_row["slot_id"] == new_slot_id


@pytest.mark.asyncio
async def test_create_booking_rejects_after_booking_deadline_for_todays_slot(db_conn):
    """[정합성 검토 R3-01] 오늘 진료분 슬롯은 예약 마감 시각이 지나면 앱에서 예약할 수 없다.
    미래 날짜 슬롯은 시각과 무관하게 항상 예약 가능하다(별도 검증 불필요 — 기존 테스트가 '2026-08-01'로 확인)."""
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])

    from datetime import datetime
    from zoneinfo import ZoneInfo
    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    # booking_deadline='00:00'으로 두면 자정 이후 어느 시각에 테스트를 돌려도 항상 마감을 지난 상태가 되어 결정적이다.
    await db_conn.execute(
        """
        insert into doctor_schedule_rules
            (doctor_id, weekday, start_time, end_time, slot_duration_minutes, max_daily_appointments, booking_deadline)
        values ($1, $2, '00:00', '23:59', 30, 50, '00:00')
        """,
        doctor["staff_id"], today.weekday(),
    )
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, $2, '09:00') returning id",
        doctor["staff_id"], today,
    )
    patient = _to_context(await seed_patient(db_conn))

    with pytest.raises(AppError) as exc_info:
        await patient_booking_service.create_booking(
            patient, for_patient_id=patient.id, department_id=dept_id,
            doctor_id=doctor["staff_id"], slot_id=slot_id, reason="감기",
        )
    assert exc_info.value.status_code == 409

    slot_status = await db_conn.fetchval("select status from appointment_slots where id = $1", slot_id)
    assert slot_status == "빈시간"  # 거부되었으므로 슬롯이 점유되지 않고 그대로 남는다
```

Run: `cd backend && pytest tests/test_patient_booking_service.py -v`
Expected: FAIL(`app.services.patient_booking_service` 모듈 없음)

- [ ] **Step 2: patient_booking_service 구현**

`backend/app/services/patient_booking_service.py`:
```python
from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as
from app.services.slot_service import book_slot, release_slot

CHANGEABLE_STATUSES = ("예약신청", "예약확정")


async def _initial_status(conn) -> str:
    auto_confirm = await conn.fetchval("select auto_confirm_app_bookings from hospital_settings")
    return "예약확정" if auto_confirm else "예약신청"


async def _is_after_booking_deadline(conn, slot_id: UUID) -> bool:
    """[정합성 검토 R3-01] 오늘 진료분 슬롯에 한해 그 요일의 booking_deadline을 지났는지 확인한다.
    미래 날짜 슬롯은 시각과 무관하게 항상 예약 가능하므로 여기서 False를 반환한다.
    직원 웹(2단계 appointment_service)의 당일 접수 경로는 이 함수를 호출하지 않는다 — 직원은
    언제든 당일 접수를 처리해야 하므로 마감 제한을 받지 않는다."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    slot = await conn.fetchrow("select doctor_id, slot_date from appointment_slots where id = $1", slot_id)
    if slot is None:
        return False
    now_kst = datetime.now(ZoneInfo("Asia/Seoul"))
    if slot["slot_date"] != now_kst.date():
        return False
    rule = await conn.fetchrow(
        "select booking_deadline from doctor_schedule_rules where doctor_id = $1 and weekday = $2",
        slot["doctor_id"], slot["slot_date"].weekday(),
    )
    if rule is None or rule["booking_deadline"] is None:
        return False
    return now_kst.time() > rule["booking_deadline"]


async def create_booking(
    patient: PatientContext,
    for_patient_id: UUID,
    department_id: UUID,
    doctor_id: UUID,
    slot_id: UUID,
    reason: str,
    source: str = "app",
) -> UUID:
    """`source`는 4단계 AI 상담봇(ai-chatbot.md)이 이 서비스를 재사용하며 `'chatbot'`을 넘기기 위한 계약이다.
    환자 앱 라우터(Task 13)는 이 값을 클라이언트로부터 받지 않고 기본값 `'app'`을 그대로 쓴다.
    상태 이력(appointment_status_history)은 여기서 직접 INSERT하지 않는다 — 1단계 마이그레이션의
    `log_appointment_status_change()` 트리거가 INSERT 시 자동으로 남긴다("치명적 규칙은 DB가 최종 심판").
    """
    async with acquire_as(str(patient.auth_user_id)) as conn:
        # [정합성 검토 R3-01] 슬롯을 점유하기 전에 먼저 확인한다 — book_slot 이후에 거부하면
        # 슬롯을 다시 반납해야 하는 불필요한 롤백 경로가 생긴다.
        if await _is_after_booking_deadline(conn, slot_id):
            raise AppError("오늘 진료분 예약은 마감되었습니다. 상담을 통해 문의해주세요.", status_code=409)

        booked = await book_slot(slot_id, patient, conn=conn)
        if not booked:
            raise AppError("이미 선택된 시간입니다. 다른 시간을 선택해주세요.", status_code=409)

        initial_status = await _initial_status(conn)
        try:
            appointment_id = await conn.fetchval(
                """
                insert into appointments
                    (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source)
                values ($1, $2, $3, $4, $5, $6, $7, $8)
                returning id
                """,
                slot_id, patient.id, for_patient_id, department_id, doctor_id, reason, initial_status, source,
            )
        except asyncpg.PostgresError as exc:
            raise AppError(str(exc), status_code=400) from exc
    return appointment_id


async def change_booking(
    patient: PatientContext, appointment_id: UUID, new_slot_id: UUID, reason: str,
) -> UUID:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select slot_id, status, for_patient_id, department_id from appointments where id = $1",
            appointment_id,
        )
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        if row["status"] not in CHANGEABLE_STATUSES:
            raise AppError("이미 취소되었거나 완료된 예약은 변경할 수 없습니다.", status_code=400)

        new_slot = await conn.fetchrow("select doctor_id from appointment_slots where id = $1", new_slot_id)
        if new_slot is None:
            raise AppError("선택한 시간을 찾을 수 없습니다.", status_code=404)

        booked = await book_slot(new_slot_id, patient, conn=conn)
        if not booked:
            raise AppError("이미 선택된 시간입니다. 다른 시간을 선택해주세요.", status_code=409)

        try:
            await conn.execute("select set_config('app.status_change_reason', '예약 변경으로 인한 자동 취소', true)")
            await conn.execute(
                "update appointments set status = '환자취소', updated_at = now() where id = $1", appointment_id,
            )
        except asyncpg.PostgresError as exc:
            raise AppError(str(exc), status_code=400) from exc
        if row["slot_id"] is not None:
            await release_slot(row["slot_id"], patient, conn=conn)

        new_status = await _initial_status(conn)
        try:
            new_appointment_id = await conn.fetchval(
                """
                insert into appointments
                    (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, reason, status, source)
                values ($1, $2, $3, $4, $5, $6, $7, 'app')
                returning id
                """,
                new_slot_id, patient.id, row["for_patient_id"], row["department_id"], new_slot["doctor_id"], reason,
                new_status,
            )
        except asyncpg.PostgresError as exc:
            raise AppError(str(exc), status_code=400) from exc
    return new_appointment_id
```

> 위 코드가 참조하는 `asyncpg`는 파일 상단에 `import asyncpg`로 추가한다. 상태 이력은 트리거가 전담하므로, 취소·재신청 각각의 사유는 `set_config('app.status_change_reason', ...)`로 세션에 실어 트리거가 이력에 그대로 기록하게 한다(재신청 이력의 사유는 트리거의 INSERT 기본값 `'환자 앱 예약 신청'`이 그대로 쓰이므로 별도 설정이 필요 없다).

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_booking_service.py -v`
Expected: 5개 테스트 모두 PASS([정합성 검토 R3-01] 당일 예약마감 검증 테스트 1건 추가)

- [ ] **Step 4: 커밋**

```bash
git add backend/app/services/patient_booking_service.py backend/tests/test_patient_booking_service.py
git commit -m "feat: 환자용 예약 생성/변경 서비스와 당일 예약마감 검증(R3-01) 추가"
```

---

## Task 9: 예약 취소 서비스 + 나의 예약 조회

**Files:**
- Modify: `backend/app/services/patient_booking_service.py` (`cancel_appointment` 추가)
- Create: `backend/app/services/patient_appointment_query_service.py`
- Test: `backend/tests/test_patient_booking_service.py` (취소 테스트 추가)
- Test: `backend/tests/test_patient_appointment_query_service.py`

**Interfaces:**
- Consumes: `app.core.patient_security.PatientContext, list_accessible_patient_ids`(Task 4), `app.services.slot_service.release_slot`(Task 7), `hospital_settings.cancellation_deadline_hours`(1단계 Task 8)
- Produces: `app.services.patient_booking_service.cancel_appointment(patient, appointment_id: UUID, reason: str | None) -> dict`(`{"cancelled": bool, "cancellation_requested": bool}`), `app.services.patient_appointment_query_service.list_my_appointments(patient) -> list[dict]`, `get_appointment_detail(patient, appointment_id: UUID) -> dict`

- [ ] **Step 1: 실패하는 테스트 작성 — cancel_appointment**

`backend/tests/test_patient_booking_service.py`에 추가:
```python
from datetime import datetime, timedelta


@pytest.mark.asyncio
async def test_cancel_before_deadline_cancels_immediately(db_conn):
    ctx = await _seed_base(db_conn)
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    future_date = (datetime.now() + timedelta(days=10)).date()
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, $2, '09:00') returning id",
        ctx["doctor_id"], future_date,
    )
    appointment_id = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=slot_id, reason="감기",
    )

    result = await patient_booking_service.cancel_appointment(ctx["patient"], appointment_id, reason="일정 변경")

    assert result == {"cancelled": True, "cancellation_requested": False}
    status = await db_conn.fetchval("select status from appointments where id = $1", appointment_id)
    assert status == "환자취소"
    slot_status = await db_conn.fetchval("select status from appointment_slots where id = $1", slot_id)
    assert slot_status == "빈시간"


@pytest.mark.asyncio
async def test_cancel_after_deadline_marks_requested(db_conn):
    ctx = await _seed_base(db_conn)
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    soon = (datetime.now() + timedelta(hours=1)).date()
    soon_time = (datetime.now() + timedelta(hours=1)).time().replace(microsecond=0)
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, $2, $3) returning id",
        ctx["doctor_id"], soon, soon_time,
    )
    appointment_id = await patient_booking_service.create_booking(
        ctx["patient"], for_patient_id=ctx["patient"].id, department_id=ctx["dept_id"],
        doctor_id=ctx["doctor_id"], slot_id=slot_id, reason="감기",
    )

    result = await patient_booking_service.cancel_appointment(ctx["patient"], appointment_id, reason="급한 사정")

    assert result == {"cancelled": False, "cancellation_requested": True}
    row = await db_conn.fetchrow(
        "select status, cancellation_requested_at from appointments where id = $1", appointment_id,
    )
    assert row["status"] in ("예약신청", "예약확정")
    assert row["cancellation_requested_at"] is not None
```

Run: `cd backend && pytest tests/test_patient_booking_service.py -v`
Expected: 새 테스트 2개 FAIL(`cancel_appointment` 없음)

- [ ] **Step 2: cancel_appointment 구현**

`backend/app/services/patient_booking_service.py`에 추가:
```python
from datetime import datetime


async def cancel_appointment(patient: PatientContext, appointment_id: UUID, reason: str | None) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            """
            select a.status, a.slot_id, s.slot_date, s.start_time
            from appointments a
            left join appointment_slots s on s.id = a.slot_id
            where a.id = $1
            """,
            appointment_id,
        )
        if row is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        if row["status"] not in CHANGEABLE_STATUSES:
            raise AppError("이미 취소되었거나 완료된 예약입니다.", status_code=400)

        deadline_hours = await conn.fetchval("select cancellation_deadline_hours from hospital_settings")
        can_cancel_directly = True
        if row["slot_date"] is not None:
            appointment_dt = datetime.combine(row["slot_date"], row["start_time"])
            can_cancel_directly = datetime.now() <= appointment_dt - timedelta(hours=deadline_hours)

        if can_cancel_directly:
            if reason:
                await conn.execute("select set_config('app.status_change_reason', $1, true)", reason)
            try:
                await conn.execute(
                    "update appointments set status = '환자취소', updated_at = now() where id = $1", appointment_id,
                )
            except asyncpg.PostgresError as exc:
                raise AppError(str(exc), status_code=400) from exc
            if row["slot_id"] is not None:
                await release_slot(row["slot_id"], patient, conn=conn)
            # 이력은 log_appointment_status_change() 트리거가 자동으로 남긴다(직접 INSERT 금지).
            return {"cancelled": True, "cancellation_requested": False}

        await conn.execute(
            "update appointments set cancellation_requested_at = now(), updated_at = now() where id = $1",
            appointment_id,
        )
        await conn.execute(
            """
            insert into appointment_status_history (appointment_id, from_status, to_status, changed_by_patient_id, reason)
            values ($1, $2, $2, $3, $4)
            """,
            appointment_id, row["status"], patient.id, reason or "마감 후 취소 요청",
        )
        return {"cancelled": False, "cancellation_requested": True}
```

(파일 상단 import 목록에 `from datetime import datetime, timedelta` 추가)

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_booking_service.py -v`
Expected: 6개 테스트 모두 PASS

- [ ] **Step 4: 실패하는 테스트 작성 — 나의 예약 조회**

`backend/tests/test_patient_appointment_query_service.py`:
```python
import pytest

from app.core.patient_security import PatientContext
from app.services import patient_appointment_query_service, patient_booking_service
from tests.conftest import seed_patient, seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_list_my_appointments_includes_family(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-09-01', '09:00') returning id",
        doctor["staff_id"],
    )
    me_seed = await seed_patient(db_conn)
    child_seed = await seed_patient(db_conn, with_auth=False)
    await db_conn.execute(
        "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1, $2, '자녀')",
        me_seed["patient_id"], child_seed["patient_id"],
    )

    me = PatientContext(id=me_seed["patient_id"], auth_user_id=me_seed["auth_user_id"])
    appointment_id = await patient_booking_service.create_booking(
        me, for_patient_id=child_seed["patient_id"], department_id=dept_id,
        doctor_id=doctor["staff_id"], slot_id=slot_id, reason="예방접종",
    )

    appointments = await patient_appointment_query_service.list_my_appointments(me)
    assert [a["id"] for a in appointments] == [appointment_id]
    assert appointments[0]["for_patient_name"] == "테스트환자"


@pytest.mark.asyncio
async def test_list_my_appointments_excludes_past_dated_slots(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    past_slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2020-01-01', '09:00', '예약됨') returning id",
        doctor["staff_id"],
    )
    me_seed = await seed_patient(db_conn)
    me = PatientContext(id=me_seed["patient_id"], auth_user_id=me_seed["auth_user_id"])
    await db_conn.execute(
        """
        insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $2, $2, $3, $4, '예약확정', 'app')
        """,
        past_slot_id, me.id, dept_id, doctor["staff_id"],
    )

    appointments = await patient_appointment_query_service.list_my_appointments(me)
    assert appointments == []


@pytest.mark.asyncio
async def test_get_appointment_detail_returns_status(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-09-01', '09:00') returning id",
        doctor["staff_id"],
    )
    me_seed = await seed_patient(db_conn)
    me = PatientContext(id=me_seed["patient_id"], auth_user_id=me_seed["auth_user_id"])
    appointment_id = await patient_booking_service.create_booking(
        me, for_patient_id=me.id, department_id=dept_id, doctor_id=doctor["staff_id"], slot_id=slot_id, reason="감기",
    )

    detail = await patient_appointment_query_service.get_appointment_detail(me, appointment_id)
    assert detail["status"] == "예약신청"
    assert detail["department_name"] == "내과"
```

Run: `cd backend && pytest tests/test_patient_appointment_query_service.py -v`
Expected: FAIL(모듈 없음)

- [ ] **Step 5: patient_appointment_query_service 구현**

`backend/app/services/patient_appointment_query_service.py`:
```python
from uuid import UUID

from app.core.patient_security import PatientContext, list_accessible_patient_ids
from app.db.pool import acquire_as


async def list_my_appointments(patient: PatientContext) -> list[dict]:
    accessible_ids = await list_accessible_patient_ids(patient)
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            """
            select a.id, a.status, a.cancellation_requested_at, a.updated_at,
                   p.name as for_patient_name, d.name as department_name, st.name as doctor_name,
                   s.slot_date, s.start_time,
                   exists (select 1 from questionnaire_responses q where q.appointment_id = a.id) as questionnaire_submitted
            from appointments a
            join patients p on p.id = a.for_patient_id
            join departments d on d.id = a.department_id
            join staff st on st.id = a.doctor_id
            left join appointment_slots s on s.id = a.slot_id
            where a.for_patient_id = any($1::uuid[])
              and a.status not in ('환자취소', '병원취소', '예약부도')
              and (s.slot_date is null or s.slot_date >= current_date)
            order by s.slot_date nulls last, s.start_time nulls last
            """,
            accessible_ids,
        )
    return [dict(row) for row in rows]
```

> **참고:** `slot_date >= current_date` 조건이 있는 이유는, 상태 전이(진료완료/취소 처리)를 직원이 깜빡해서 지나간 예약이 `예약신청`/`예약확정` 상태로 계속 남아있는 경우, 홈 화면(Task 22)이 이걸 계속 "다음 예약"으로 보여주는 걸 막기 위함이다. `slot_id`가 아직 없는(=슬롯 미배정) 예약은 날짜가 없으므로 항상 포함한다.

```python
async def get_appointment_detail(patient: PatientContext, appointment_id: UUID) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            """
            select a.id, a.status, a.cancellation_requested_at, a.updated_at, a.queue_position,
                   a.doctor_id, p.name as for_patient_name, d.name as department_name, st.name as doctor_name,
                   s.slot_date, s.start_time
            from appointments a
            join patients p on p.id = a.for_patient_id
            join departments d on d.id = a.department_id
            join staff st on st.id = a.doctor_id
            left join appointment_slots s on s.id = a.slot_id
            where a.id = $1
            """,
            appointment_id,
        )
    return dict(row) if row else {}
```

- [ ] **Step 6: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_appointment_query_service.py -v`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 7: 커밋**

```bash
git add backend/app/services/patient_booking_service.py backend/app/services/patient_appointment_query_service.py backend/tests/test_patient_booking_service.py backend/tests/test_patient_appointment_query_service.py
git commit -m "feat: 예약 취소(마감전후 분기)와 나의 예약 조회 서비스 추가"
```

---

## Task 10: 사전문진 서비스

**Files:**
- Create: `backend/app/services/patient_questionnaire_service.py`
- Test: `backend/tests/test_patient_questionnaire_service.py`

**Interfaces:**
- Consumes: `app.core.patient_security.PatientContext`(Task 4), `app.core.errors.AppError`
- Produces: `app.services.patient_questionnaire_service.get_template(department_id: UUID, patient) -> dict | None`, `submit_response(patient, appointment_id: UUID, template_id: UUID, answers: list[dict]) -> UUID`, `get_response(patient, appointment_id: UUID) -> dict | None`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_patient_questionnaire_service.py`:
```python
import pytest

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_booking_service, patient_questionnaire_service
from tests.conftest import seed_patient, seed_staff, set_session_auth


async def _seed_appointment(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    template_id = await db_conn.fetchval(
        "insert into questionnaire_templates (department_id, questions) values ($1, $2) returning id",
        dept_id, '[{"text": "오늘 불편한 증상은 무엇인가요?", "type": "text", "required": true}]',
    )
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-01', '09:00') returning id",
        doctor["staff_id"],
    )
    patient_seed = await seed_patient(db_conn)
    me = PatientContext(id=patient_seed["patient_id"], auth_user_id=patient_seed["auth_user_id"])
    appointment_id = await patient_booking_service.create_booking(
        me, for_patient_id=me.id, department_id=dept_id, doctor_id=doctor["staff_id"], slot_id=slot_id, reason="감기",
    )
    return {"me": me, "dept_id": dept_id, "template_id": template_id, "appointment_id": appointment_id}


@pytest.mark.asyncio
async def test_get_template_returns_department_questions(db_conn):
    ctx = await _seed_appointment(db_conn)
    template = await patient_questionnaire_service.get_template(ctx["dept_id"], ctx["me"])
    assert template["id"] == ctx["template_id"]
    assert len(template["questions"]) == 1


@pytest.mark.asyncio
async def test_submit_and_get_response(db_conn):
    ctx = await _seed_appointment(db_conn)
    answers = [{"question": "오늘 불편한 증상은 무엇인가요?", "answer": "기침, 콧물"}]

    response_id = await patient_questionnaire_service.submit_response(
        ctx["me"], ctx["appointment_id"], ctx["template_id"], answers,
    )
    assert response_id is not None

    saved = await patient_questionnaire_service.get_response(ctx["me"], ctx["appointment_id"])
    assert saved["answers"][0]["answer"] == "기침, 콧물"


@pytest.mark.asyncio
async def test_submit_response_upserts_on_resubmit(db_conn):
    ctx = await _seed_appointment(db_conn)
    await patient_questionnaire_service.submit_response(
        ctx["me"], ctx["appointment_id"], ctx["template_id"], [{"question": "q", "answer": "첫 답변"}],
    )
    await patient_questionnaire_service.submit_response(
        ctx["me"], ctx["appointment_id"], ctx["template_id"], [{"question": "q", "answer": "수정된 답변"}],
    )

    saved = await patient_questionnaire_service.get_response(ctx["me"], ctx["appointment_id"])
    assert saved["answers"][0]["answer"] == "수정된 답변"


@pytest.mark.asyncio
async def test_submit_response_rejected_after_arrival(db_conn):
    ctx = await _seed_appointment(db_conn)
    admin_seed = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin_seed["auth_user_id"])
    await db_conn.execute("update appointments set status = '도착' where id = $1", ctx["appointment_id"])

    with pytest.raises(AppError):
        await patient_questionnaire_service.submit_response(
            ctx["me"], ctx["appointment_id"], ctx["template_id"], [{"question": "q", "answer": "늦은 수정"}],
        )
```

Run: `cd backend && pytest tests/test_patient_questionnaire_service.py -v`
Expected: FAIL(`app.services.patient_questionnaire_service` 모듈 없음)

- [ ] **Step 2: patient_questionnaire_service 구현**

`backend/app/services/patient_questionnaire_service.py`:
```python
import json
from uuid import UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as

EDITABLE_STATUSES = ("예약신청", "예약확정")


async def get_template(department_id: UUID, patient: PatientContext) -> dict | None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select id, questions from questionnaire_templates where department_id = $1 limit 1", department_id,
        )
    if row is None:
        return None
    return {"id": row["id"], "questions": json.loads(row["questions"])}


async def submit_response(
    patient: PatientContext, appointment_id: UUID, template_id: UUID, answers: list[dict],
) -> UUID:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        appointment = await conn.fetchrow("select status from appointments where id = $1", appointment_id)
        if appointment is None:
            raise AppError("예약을 찾을 수 없습니다.", status_code=404)
        if appointment["status"] not in EDITABLE_STATUSES:
            raise AppError("방문 전까지만 사전문진을 작성/수정할 수 있습니다.", status_code=400)

        response_id = await conn.fetchval(
            """
            insert into questionnaire_responses (appointment_id, template_id, answers)
            values ($1, $2, $3)
            on conflict (appointment_id) do update
                set template_id = excluded.template_id, answers = excluded.answers, submitted_at = now()
            returning id
            """,
            appointment_id, template_id, json.dumps(answers),
        )
    return response_id


async def get_response(patient: PatientContext, appointment_id: UUID) -> dict | None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select id, template_id, answers, submitted_at from questionnaire_responses where appointment_id = $1",
            appointment_id,
        )
    if row is None:
        return None
    return {
        "id": row["id"],
        "template_id": row["template_id"],
        "answers": json.loads(row["answers"]),
        "submitted_at": row["submitted_at"],
    }
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_questionnaire_service.py -v`
Expected: 4개 테스트 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/app/services/patient_questionnaire_service.py backend/tests/test_patient_questionnaire_service.py
git commit -m "feat: 사전문진 제출/조회 서비스 추가"
```

---

## Task 11: 방문 이력 조회 서비스

**Files:**
- Create: `backend/app/services/patient_history_service.py`
- Test: `backend/tests/test_patient_history_service.py`

**Interfaces:**
- Consumes: `app.core.patient_security.PatientContext, list_accessible_patient_ids`(Task 4), DB 뷰 `patient_medical_notes`(Task 2)
- Produces: `app.services.patient_history_service.list_visit_history(patient, for_patient_id: UUID) -> list[dict]`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_patient_history_service.py`:
```python
import pytest

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import patient_history_service
from tests.conftest import seed_patient, seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_list_visit_history_shows_only_completed_and_visible_notes(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    doctor = await seed_staff(db_conn, role="doctor")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await db_conn.execute("update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"])
    patient_seed = await seed_patient(db_conn)
    me = PatientContext(id=patient_seed["patient_id"], auth_user_id=patient_seed["auth_user_id"])

    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time, status) values ($1, '2026-01-10', '09:00', '예약됨') returning id",
        doctor["staff_id"],
    )
    completed_id = await db_conn.fetchval(
        """
        insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $2, $2, $3, $4, '진료완료', 'app')
        returning id
        """,
        slot_id, me.id, dept_id, doctor["staff_id"],
    )
    await db_conn.execute(
        """
        insert into medical_records (appointment_id, doctor_id, symptoms, diagnosis, patient_visible_notes, is_completed)
        values ($1, $2, '내부 증상 기록', '내부 진단', '충분한 휴식을 취하세요.', true)
        """,
        completed_id, doctor["staff_id"],
    )

    requested_id = await db_conn.fetchval(
        """
        insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $1, $2, $3, '예약신청', 'app')
        returning id
        """,
        me.id, dept_id, doctor["staff_id"],
    )

    history = await patient_history_service.list_visit_history(me, me.id)

    assert [h["appointment_id"] for h in history] == [completed_id]
    assert history[0]["patient_visible_notes"] == "충분한 휴식을 취하세요."
    assert "internal" not in history[0]
```

Run: `cd backend && pytest tests/test_patient_history_service.py -v`
Expected: FAIL(`app.services.patient_history_service` 모듈 없음)

- [ ] **Step 2: patient_history_service 구현**

`backend/app/services/patient_history_service.py`:
```python
from uuid import UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext, list_accessible_patient_ids
from app.db.pool import acquire_as


async def list_visit_history(patient: PatientContext, for_patient_id: UUID) -> list[dict]:
    accessible_ids = await list_accessible_patient_ids(patient)
    if for_patient_id not in accessible_ids:
        raise AppError("본인 또는 등록된 가족의 이력만 조회할 수 있습니다.", status_code=403)

    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            """
            select a.id as appointment_id, s.slot_date, d.name as department_name,
                   st.name as doctor_name, mr.patient_visible_notes
            from appointments a
            join departments d on d.id = a.department_id
            join staff st on st.id = a.doctor_id
            left join appointment_slots s on s.id = a.slot_id
            left join patient_medical_notes mr on mr.appointment_id = a.id
            where a.for_patient_id = $1 and a.status = '진료완료'
            order by s.slot_date desc nulls last
            """,
            for_patient_id,
        )
    return [dict(row) for row in rows]
```

- [ ] **Step 3: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_history_service.py -v`
Expected: 1개 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
git add backend/app/services/patient_history_service.py backend/tests/test_patient_history_service.py
git commit -m "feat: 환자용 방문이력 조회 서비스 추가(내부기록 비노출)"
```

---

## Task 12: 알림 — 기기 토큰 등록/해제 + SMS/Push 클라이언트 + 발송 서비스 + 가족 연결 OTP

**Files:**
- Modify: `backend/app/core/config.py` (Twilio/Firebase 설정 필드 추가)
- Modify: `backend/.env.example` (신규 환경변수 추가)
- Modify: `backend/requirements.txt` (`twilio`, `firebase-admin` 추가)
- Create: `backend/app/integrations/__init__.py`
- Create: `backend/app/integrations/sms_client.py`
- Create: `backend/app/integrations/push_client.py`
- Create: `backend/app/services/device_token_service.py`
- Create: `backend/app/services/notification_service.py`
- Modify: `backend/app/services/patient_booking_service.py` (예약 신청/확정/취소 시 알림 호출)
- Create: `supabase/migrations/00012_family_link_otp.sql`([정합성 검토 R5-01])
- Create: `backend/app/services/family_link_otp_service.py`([정합성 검토 R5-01] — Task 6의 `patient_family_links`와 이 Task의 `SmsClient`를 함께 소비하므로 이 Task에 둔다)
- Test: `backend/tests/test_device_token_service.py`
- Test: `backend/tests/test_notification_service.py`
- Test: `backend/tests/test_family_link_otp_service.py`

**Interfaces:**
- Consumes: `app.core.config.settings`, `app.core.patient_security.PatientContext`(Task 4), `app.db.pool.get_pool`(1단계 Task 9), `app.core.errors.log_error`(1단계 Task 10)
- Produces: `app.integrations.sms_client.SmsClient(account_sid, auth_token, from_number)`(`.send_sms(to, body) -> None`), `get_sms_client() -> SmsClient`, `app.integrations.push_client.PushClient`(`.send_push(token, title, body, data=None) -> None`), `get_push_client() -> PushClient`, `app.services.device_token_service.register_token(patient, fcm_token: str) -> None`, `unregister_token(patient, fcm_token: str) -> None`, `app.services.notification_service.notify_patient(patient_id: UUID, notification_type: str) -> None`
- Produces([정합성 검토 R5-01]): `app.services.family_link_otp_service.request_family_link_otp(patient, name: str, birth_date: date, phone: str, sms_client=None) -> UUID`(일치하는 기존 환자를 정확히 1건 찾으면 그 환자의 등록 전화번호로 6자리 코드를 SMS 발송하고 요청 id를 반환. 0건/2건 이상이면 `AppError(404)`, 대상 전화번호가 없으면 `AppError(400, "본인 확인이 어려운 경우...")`), `confirm_family_link_otp(patient, request_id: UUID, code: str) -> UUID`(코드 일치·만료·소유자 확인 후 `patient_family_links`를 서비스 역할 커넥션으로 직접 생성, 대상 `family_patient_id` 반환. 실패 시 `AppError(400)`)

- [ ] **Step 1: 설정과 의존성 추가**

`backend/app/core/config.py` 수정(필드 추가):
```python
class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    database_url: str
    session_timeout_minutes: int = 30
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    firebase_credentials_path: str = ""

    model_config = SettingsConfigDict(env_file=".env")
```

`backend/.env.example`에 추가:
```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
FIREBASE_CREDENTIALS_PATH=./firebase-service-account.json
```

`backend/requirements.txt`에 추가:
```
twilio==9.3.0
firebase-admin==6.5.0
```

- [ ] **Step 2: 실패하는 테스트 작성 — device_token_service**

`backend/tests/test_device_token_service.py`:
```python
import pytest

from app.core.patient_security import PatientContext
from app.services import device_token_service
from tests.conftest import seed_patient


@pytest.mark.asyncio
async def test_register_and_unregister_token(db_conn):
    patient_seed = await seed_patient(db_conn)
    ctx = PatientContext(id=patient_seed["patient_id"], auth_user_id=patient_seed["auth_user_id"])

    await device_token_service.register_token(ctx, "fcm-token-1")
    row = await db_conn.fetchrow("select fcm_token from device_tokens where patient_id = $1", ctx.id)
    assert row["fcm_token"] == "fcm-token-1"

    await device_token_service.unregister_token(ctx, "fcm-token-1")
    remaining = await db_conn.fetchval("select count(*) from device_tokens where patient_id = $1", ctx.id)
    assert remaining == 0
```

Run: `cd backend && pytest tests/test_device_token_service.py -v`
Expected: FAIL(모듈 없음)

- [ ] **Step 3: sms_client / push_client / device_token_service 구현**

`backend/app/integrations/__init__.py`: 빈 파일.

`backend/app/integrations/sms_client.py`:
```python
from twilio.rest import Client

from app.core.config import settings


class SmsClient:
    def __init__(self, account_sid: str, auth_token: str, from_number: str):
        self._client = Client(account_sid, auth_token)
        self._from_number = from_number

    def send_sms(self, to: str, body: str) -> None:
        self._client.messages.create(to=to, from_=self._from_number, body=body)


def get_sms_client() -> SmsClient:
    return SmsClient(settings.twilio_account_sid, settings.twilio_auth_token, settings.twilio_from_number)
```

`backend/app/integrations/push_client.py`:
```python
import firebase_admin
from firebase_admin import credentials, messaging

from app.core.config import settings

_initialized = False


def _ensure_initialized() -> None:
    global _initialized
    if not _initialized:
        cred = credentials.Certificate(settings.firebase_credentials_path)
        firebase_admin.initialize_app(cred)
        _initialized = True


class PushClient:
    def send_push(self, token: str, title: str, body: str, data: dict[str, str] | None = None) -> None:
        _ensure_initialized()
        message = messaging.Message(
            token=token, notification=messaging.Notification(title=title, body=body), data=data or {},
        )
        messaging.send(message)


def get_push_client() -> PushClient:
    return PushClient()
```

`backend/app/services/device_token_service.py`:
```python
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as


async def register_token(patient: PatientContext, fcm_token: str) -> None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute(
            "insert into device_tokens (patient_id, fcm_token) values ($1, $2) on conflict do nothing",
            patient.id, fcm_token,
        )


async def unregister_token(patient: PatientContext, fcm_token: str) -> None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        await conn.execute(
            "delete from device_tokens where patient_id = $1 and fcm_token = $2", patient.id, fcm_token,
        )
```

- [ ] **Step 4: 테스트 실행 — device_token_service**

Run: `cd backend && pytest tests/test_device_token_service.py -v`
Expected: 1개 테스트 PASS

- [ ] **Step 5: 실패하는 테스트 작성 — notification_service**

`backend/tests/test_notification_service.py`:
```python
from unittest.mock import MagicMock, patch

import pytest

from app.services import notification_service
from tests.conftest import seed_patient


@pytest.mark.asyncio
async def test_notify_patient_sends_push_when_token_exists(db_conn, db_pool):
    patient_seed = await seed_patient(db_conn)
    async with db_pool.acquire() as conn:
        await conn.execute(
            "insert into device_tokens (patient_id, fcm_token) values ($1, 'token-1')", patient_seed["patient_id"],
        )
        fake_push = MagicMock()
        with patch("app.services.notification_service.get_push_client", return_value=fake_push):
            await notification_service.notify_patient(patient_seed["patient_id"], "confirmed")

        fake_push.send_push.assert_called_once()
        await conn.execute("delete from device_tokens where patient_id = $1", patient_seed["patient_id"])


@pytest.mark.asyncio
async def test_notify_patient_falls_back_to_sms_when_no_token(db_conn, db_pool):
    patient_seed = await seed_patient(db_conn)

    fake_sms = MagicMock()
    with patch("app.services.notification_service.get_sms_client", return_value=fake_sms):
        await notification_service.notify_patient(patient_seed["patient_id"], "requested")

    fake_sms.send_sms.assert_called_once()
```

Run: `cd backend && pytest tests/test_notification_service.py -v`
Expected: FAIL(모듈 없음)

- [ ] **Step 6: notification_service 구현**

`backend/app/services/notification_service.py`:
```python
from uuid import UUID

from app.core.errors import log_error
from app.db.pool import get_pool
from app.integrations.push_client import get_push_client
from app.integrations.sms_client import get_sms_client

MESSAGES = {
    "requested": "예약이 신청되었습니다.",
    "confirmed": "예약이 확정되었습니다.",
    "reminder_day_before": "내일 예약이 있습니다. 잊지 말고 방문해주세요.",
    "reminder_today": "오늘 예약이 있습니다.",
    "changed": "예약이 변경되었습니다.",
    "hospital_cancelled": "병원 사정으로 예약이 취소되었습니다.",
    "cancellation_rejected": "취소 요청이 반려되었습니다.",
    "questionnaire_missing": "사전문진을 작성해주세요.",
    "visit_completed": "진료가 완료되었습니다. 안내를 확인해주세요.",
}


async def notify_patient(patient_id: UUID, notification_type: str) -> None:
    message = MESSAGES.get(notification_type, "새 소식이 있습니다.")
    pool = await get_pool()
    async with pool.acquire() as conn:
        patient = await conn.fetchrow("select phone from patients where id = $1", patient_id)
        tokens = await conn.fetch("select fcm_token from device_tokens where patient_id = $1", patient_id)

    if patient is None:
        return

    if tokens:
        push_client = get_push_client()
        for row in tokens:
            try:
                push_client.send_push(row["fcm_token"], "병원 안내", message)
            except Exception as exc:
                await log_error(feature="notification_service.push", message=str(exc))
        return

    try:
        get_sms_client().send_sms(patient["phone"], message)
    except Exception as exc:
        await log_error(feature="notification_service.sms", message=str(exc))
```

- [ ] **Step 7: 테스트 실행**

Run: `cd backend && pytest tests/test_notification_service.py -v`
Expected: 2개 테스트 모두 PASS

- [ ] **Step 8: 예약 서비스에 알림 호출 연결**

`backend/app/services/patient_booking_service.py`에서 `create_booking`의 트랜잭션이 끝난 직후(즉 `async with acquire_as(...) as conn:` 블록을 벗어난 뒤) 아래처럼 best-effort 알림 호출을 추가한다:
```python
from app.services import notification_service


async def create_booking(...) -> UUID:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        ...  # 기존 로직
    try:
        await notification_service.notify_patient(
            for_patient_id, "confirmed" if initial_status == "예약확정" else "requested",
        )
    except Exception:
        pass
    return appointment_id
```

`change_booking`도 동일한 위치(트랜잭션 블록을 벗어난 직후)에 `"changed"` 알림 호출을 추가한다:
```python
async def change_booking(
    patient: PatientContext, appointment_id: UUID, new_slot_id: UUID, reason: str,
) -> UUID:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        ...  # 기존 로직(Task 8에서 이미 작성됨, 변경 없음)
    try:
        await notification_service.notify_patient(row["for_patient_id"], "changed")
    except Exception:
        pass
    return new_appointment_id
```
(`cancel_appointment`는 즉시취소 성공 시 화면 자체 안내로 충분하므로 별도 알림을 생략한다 — 마감 후 취소요청에 대한 직원의 승인/반려 알림은 2단계(직원 웹)의 "취소요청 대기열" 처리 시점에 호출되어야 하므로 이 계획 범위 밖이다.)

- [ ] **Step 9: 통합 테스트 실행**

Run: `cd backend && pytest tests/test_patient_booking_service.py tests/test_notification_service.py -v`
Expected: 전체 PASS

- [ ] **Step 10: [정합성 검토 R5-01] 가족 연결 OTP 마이그레이션 작성**

`supabase/migrations/00012_family_link_otp.sql`:
```sql
-- 이미 병원에 등록된 환자를 가족으로 "연결"할 때, 요청자가 대상 환자의 실제 전화번호에 접근 가능한지
-- 확인하기 위한 임시 인증 요청. 클라이언트가 직접 접근할 이유가 없으므로 RLS만 켜고 정책은 두지 않는다
-- (정책이 없으면 authenticated/anon 모두 기본 거부 — family_link_otp_service가 get_pool()의 서비스
-- 역할 커넥션으로만 읽고 쓴다).
create table family_link_requests (
  id uuid primary key default gen_random_uuid(),
  requesting_patient_id uuid not null references patients(id),
  target_patient_id uuid not null references patients(id),
  code_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table family_link_requests enable row level security;
```

- [ ] **Step 11: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 오류 없이 적용됨

- [ ] **Step 12: [정합성 검토 R5-01] 실패하는 테스트 작성 — family_link_otp_service**

`backend/tests/test_family_link_otp_service.py`:
```python
from datetime import date, timedelta

import pytest

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import family_link_otp_service
from tests.conftest import seed_patient


def _to_context(seed: dict) -> PatientContext:
    return PatientContext(id=seed["patient_id"], auth_user_id=seed["auth_user_id"])


class FakeSms:
    def __init__(self):
        self.sent = []

    def send_sms(self, to: str, body: str) -> None:
        self.sent.append((to, body))


@pytest.mark.asyncio
async def test_request_and_confirm_links_existing_patient(db_conn):
    me = _to_context(await seed_patient(db_conn, name="본인", phone="01011110001"))
    target = await seed_patient(
        db_conn, name="김자녀", phone="01099998888", with_auth=False,
    )
    await db_conn.execute(
        "update patients set birth_date = '2015-05-05' where id = $1", target["patient_id"],
    )
    sms = FakeSms()

    request_id = await family_link_otp_service.request_family_link_otp(
        me, name="김자녀", birth_date=date(2015, 5, 5), phone="01099998888", sms_client=sms,
    )
    assert len(sms.sent) == 1
    sent_to, sent_body = sms.sent[0]
    assert sent_to == "01099998888"
    code = "".join(ch for ch in sent_body if ch.isdigit())[:6]

    linked_id = await family_link_otp_service.confirm_family_link_otp(me, request_id, code)
    assert linked_id == target["patient_id"]

    link = await db_conn.fetchrow(
        "select relation from patient_family_links where account_patient_id = $1 and family_patient_id = $2",
        me.id, target["patient_id"],
    )
    assert link is not None


@pytest.mark.asyncio
async def test_request_fails_when_no_exact_match(db_conn):
    me = _to_context(await seed_patient(db_conn, name="본인", phone="01011110001"))

    with pytest.raises(AppError):
        await family_link_otp_service.request_family_link_otp(
            me, name="존재안함", birth_date=date(2000, 1, 1), phone="01000000000", sms_client=FakeSms(),
        )


@pytest.mark.asyncio
async def test_confirm_fails_with_wrong_code(db_conn):
    me = _to_context(await seed_patient(db_conn, name="본인", phone="01011110001"))
    target = await seed_patient(db_conn, name="김자녀", phone="01099998888", with_auth=False)
    await db_conn.execute(
        "update patients set birth_date = '2015-05-05' where id = $1", target["patient_id"],
    )

    request_id = await family_link_otp_service.request_family_link_otp(
        me, name="김자녀", birth_date=date(2015, 5, 5), phone="01099998888", sms_client=FakeSms(),
    )

    with pytest.raises(AppError):
        await family_link_otp_service.confirm_family_link_otp(me, request_id, "000000")


@pytest.mark.asyncio
async def test_confirm_fails_when_expired(db_conn):
    me = _to_context(await seed_patient(db_conn, name="본인", phone="01011110001"))
    target = await seed_patient(db_conn, name="김자녀", phone="01099998888", with_auth=False)
    await db_conn.execute(
        "update patients set birth_date = '2015-05-05' where id = $1", target["patient_id"],
    )
    sms = FakeSms()
    request_id = await family_link_otp_service.request_family_link_otp(
        me, name="김자녀", birth_date=date(2015, 5, 5), phone="01099998888", sms_client=sms,
    )
    code = "".join(ch for ch in sms.sent[0][1] if ch.isdigit())[:6]
    await db_conn.execute(
        "update family_link_requests set expires_at = now() - interval '1 minute' where id = $1", request_id,
    )

    with pytest.raises(AppError):
        await family_link_otp_service.confirm_family_link_otp(me, request_id, code)


@pytest.mark.asyncio
async def test_another_account_cannot_confirm_someone_elses_request(db_conn):
    """[정합성 검토 R5-01] 요청을 만든 계정이 아니면 코드를 알아도 확정할 수 없다."""
    me = _to_context(await seed_patient(db_conn, name="본인", phone="01011110001"))
    stranger = _to_context(await seed_patient(db_conn, name="제3자", phone="01011110003"))
    target = await seed_patient(db_conn, name="김자녀", phone="01099998888", with_auth=False)
    await db_conn.execute(
        "update patients set birth_date = '2015-05-05' where id = $1", target["patient_id"],
    )
    sms = FakeSms()
    request_id = await family_link_otp_service.request_family_link_otp(
        me, name="김자녀", birth_date=date(2015, 5, 5), phone="01099998888", sms_client=sms,
    )
    code = "".join(ch for ch in sms.sent[0][1] if ch.isdigit())[:6]

    with pytest.raises(AppError):
        await family_link_otp_service.confirm_family_link_otp(stranger, request_id, code)
```

Run: `cd backend && pytest tests/test_family_link_otp_service.py -v`
Expected: FAIL(`app.services.family_link_otp_service` 모듈 없음)

- [ ] **Step 13: [정합성 검토 R5-01] family_link_otp_service 구현**

`backend/app/services/family_link_otp_service.py`:
```python
import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import get_pool
from app.integrations.sms_client import get_sms_client

OTP_TTL_MINUTES = 5


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def request_family_link_otp(
    patient: PatientContext, name: str, birth_date: date, phone: str, sms_client=None,
) -> UUID:
    """일치하는 기존 환자를 정확히 한 명 찾을 때만 그 환자의 등록 전화번호로 OTP를 보낸다.
    가족 본인이 전화를 받을 수 없다면(전화번호 없음 등) 직원 확인 경로로 안내한다."""
    sms_client = sms_client or get_sms_client()
    pool = await get_pool()
    candidates = await pool.fetch(
        "select id, phone from patients where name = $1 and birth_date = $2 and phone = $3",
        name, birth_date, phone,
    )
    if len(candidates) != 1:
        raise AppError(
            "일치하는 기록을 특정할 수 없습니다. 병원(전화/방문)으로 문의해주세요.", status_code=404,
        )
    target = candidates[0]
    if not target["phone"]:
        raise AppError(
            "본인 확인이 어려운 경우 병원(전화/방문)으로 문의해주시면 직원이 확인 후 연결해드립니다.",
            status_code=400,
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    request_id = await pool.fetchval(
        """
        insert into family_link_requests (requesting_patient_id, target_patient_id, code_hash, expires_at)
        values ($1, $2, $3, $4)
        returning id
        """,
        patient.id, target["id"], _hash_code(code),
        datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
    )
    sms_client.send_sms(target["phone"], f"[병원] 가족 연결 인증번호는 {code}입니다. {OTP_TTL_MINUTES}분 내에 입력해주세요.")
    return request_id


async def confirm_family_link_otp(patient: PatientContext, request_id: UUID, code: str) -> UUID:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            req = await conn.fetchrow(
                "select * from family_link_requests where id = $1 for update", request_id,
            )
            if req is None or req["requesting_patient_id"] != patient.id:
                raise AppError("요청을 찾을 수 없습니다.", status_code=404)
            if req["verified_at"] is not None:
                raise AppError("이미 처리된 요청입니다.", status_code=400)
            if req["expires_at"] < datetime.now(timezone.utc):
                raise AppError("인증번호가 만료되었습니다. 다시 시도해주세요.", status_code=400)
            if req["code_hash"] != _hash_code(code):
                raise AppError("인증번호가 올바르지 않습니다.", status_code=400)

            await conn.execute(
                "update family_link_requests set verified_at = now() where id = $1", request_id,
            )
            await conn.execute(
                "insert into patient_family_links (account_patient_id, family_patient_id, relation) "
                "values ($1, $2, '가족(연결)')",
                patient.id, req["target_patient_id"],
            )
    return req["target_patient_id"]
```

- [ ] **Step 14: 테스트 실행**

Run: `cd backend && pytest tests/test_family_link_otp_service.py -v`
Expected: 5개 테스트 모두 PASS

- [ ] **Step 15: 커밋**

```bash
git add backend/app/core/config.py backend/.env.example backend/requirements.txt backend/app/integrations backend/app/services/device_token_service.py backend/app/services/notification_service.py backend/app/services/patient_booking_service.py backend/app/services/family_link_otp_service.py supabase/migrations/00012_family_link_otp.sql backend/tests/test_device_token_service.py backend/tests/test_notification_service.py backend/tests/test_family_link_otp_service.py
git commit -m "feat: 알림 토큰/SMS·FCM 발송 서비스 + 가족 연결 OTP 서비스 추가 (R5-01)"
```

---

## Task 13: 환자용 라우터 연결 + 통합 테스트

**Files:**
- Create: `backend/app/routers/patient_profile.py`
- Create: `backend/app/routers/patient_family.py`
- Create: `backend/app/routers/patient_catalog.py`
- Create: `backend/app/routers/patient_booking.py`
- Create: `backend/app/routers/patient_questionnaire.py`
- Create: `backend/app/routers/patient_history.py`
- Create: `backend/app/routers/patient_notifications.py`
- Modify: `backend/app/main.py` (라우터 등록)
- Test: `backend/tests/test_patient_routers_integration.py`

**Interfaces:**
- Consumes: Task 4~12의 모든 서비스 함수, `app.core.patient_security.get_current_auth_user_id, get_current_patient`(Task 4)
- Produces: `/app/profile`, `/app/family`, `/app/family/link-requests`, `/app/family/link-requests/{id}/confirm`([정합성 검토 R5-01]), `/app/departments`, `/app/doctors`, `/app/available-dates/{doctor_id}`, `/app/available-slots/{doctor_id}`, `/app/appointments`, `/app/appointments/{id}`, `/app/appointments/{id}/change`, `/app/appointments/{id}/cancel`, `/app/questionnaire-templates/{department_id}`, `/app/appointments/{id}/questionnaire`, `/app/visit-history`, `/app/device-tokens` 엔드포인트 일체

- [ ] **Step 1: 프로필/가족/카탈로그 라우터 작성**

`backend/app/routers/patient_profile.py`:
```python
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_auth_user_id, get_current_patient
from app.services import patient_profile_service

router = APIRouter(prefix="/app/profile", tags=["patient-profile"])


class RegisterProfileRequest(BaseModel):
    name: str
    birth_date: date
    gender: str
    phone: str


@router.post("")
async def register_profile(
    body: RegisterProfileRequest, auth_user_id: UUID = Depends(get_current_auth_user_id),
) -> dict:
    patient_id = await patient_profile_service.register_profile(
        auth_user_id=auth_user_id, name=body.name, birth_date=body.birth_date, gender=body.gender, phone=body.phone,
    )
    return {"patient_id": str(patient_id)}


@router.get("")
async def get_my_profile(patient: PatientContext = Depends(get_current_patient)) -> dict:
    return await patient_profile_service.get_my_profile(patient)


@router.delete("")
async def deactivate_self(patient: PatientContext = Depends(get_current_patient)) -> dict:
    await patient_profile_service.deactivate_self(patient)
    return {"status": "deactivated"}
```

`backend/app/routers/patient_family.py`:
```python
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import family_link_otp_service, patient_family_service

router = APIRouter(prefix="/app/family", tags=["patient-family"])


class FamilyMemberRequest(BaseModel):
    name: str
    birth_date: date
    gender: str
    relation: str


class FamilyLinkOtpRequest(BaseModel):
    name: str
    birth_date: date
    phone: str


class FamilyLinkOtpConfirmRequest(BaseModel):
    code: str


@router.get("")
async def list_family(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_family_service.list_family_members(patient)


@router.post("")
async def add_family(
    body: FamilyMemberRequest, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    family_id = await patient_family_service.add_family_member(
        patient, name=body.name, birth_date=body.birth_date, gender=body.gender, relation=body.relation,
    )
    return {"id": str(family_id)}


@router.patch("/{family_patient_id}")
async def update_family(
    family_patient_id: UUID, body: FamilyMemberRequest, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    await patient_family_service.update_family_member(
        patient, family_patient_id, name=body.name, birth_date=body.birth_date, gender=body.gender,
        relation=body.relation,
    )
    return {"status": "updated"}


@router.delete("/{family_patient_id}")
async def unlink_family(
    family_patient_id: UUID, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    await patient_family_service.unlink_family_member(patient, family_patient_id)
    return {"status": "unlinked"}


# [정합성 검토 R5-01] 이미 병원에 등록된 환자를 가족으로 "연결"하는 경로 — OTP 자기인증 우선.
@router.post("/link-requests")
async def request_family_link(
    body: FamilyLinkOtpRequest, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    request_id = await family_link_otp_service.request_family_link_otp(
        patient, name=body.name, birth_date=body.birth_date, phone=body.phone,
    )
    return {"request_id": str(request_id)}


@router.post("/link-requests/{request_id}/confirm")
async def confirm_family_link(
    request_id: UUID, body: FamilyLinkOtpConfirmRequest, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    family_id = await family_link_otp_service.confirm_family_link_otp(patient, request_id, body.code)
    return {"id": str(family_id)}
```

`backend/app/routers/patient_catalog.py`:
```python
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_catalog_service

router = APIRouter(prefix="/app", tags=["patient-catalog"])


@router.get("/departments")
async def list_departments(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_catalog_service.list_departments(patient)


@router.get("/doctors")
async def list_doctors(
    department_id: UUID, patient: PatientContext = Depends(get_current_patient),
) -> list[dict]:
    return await patient_catalog_service.list_doctors(department_id, patient)


@router.get("/available-dates/{doctor_id}")
async def list_available_dates(
    doctor_id: UUID, patient: PatientContext = Depends(get_current_patient),
) -> list[str]:
    return await patient_catalog_service.list_available_dates(doctor_id, patient)


@router.get("/available-slots/{doctor_id}")
async def list_available_slots(
    doctor_id: UUID, target_date: date, patient: PatientContext = Depends(get_current_patient),
) -> list[dict]:
    return await patient_catalog_service.list_available_slots(doctor_id, target_date, patient)
```

- [ ] **Step 2: 예약/사전문진/이력/알림 라우터 작성**

`backend/app/routers/patient_booking.py`:
```python
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_appointment_query_service, patient_booking_service

router = APIRouter(prefix="/app/appointments", tags=["patient-booking"])


class CreateBookingRequest(BaseModel):
    for_patient_id: UUID
    department_id: UUID
    doctor_id: UUID
    slot_id: UUID
    reason: str


@router.post("")
async def create_booking(
    body: CreateBookingRequest, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    appointment_id = await patient_booking_service.create_booking(
        patient, for_patient_id=body.for_patient_id, department_id=body.department_id,
        doctor_id=body.doctor_id, slot_id=body.slot_id, reason=body.reason,
    )
    return {"appointment_id": str(appointment_id)}


@router.get("")
async def list_my_appointments(patient: PatientContext = Depends(get_current_patient)) -> list[dict]:
    return await patient_appointment_query_service.list_my_appointments(patient)


@router.get("/{appointment_id}")
async def get_appointment(
    appointment_id: UUID, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    return await patient_appointment_query_service.get_appointment_detail(patient, appointment_id)


class ChangeBookingRequest(BaseModel):
    new_slot_id: UUID
    reason: str


@router.post("/{appointment_id}/change")
async def change_booking(
    appointment_id: UUID, body: ChangeBookingRequest, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    new_appointment_id = await patient_booking_service.change_booking(
        patient, appointment_id, body.new_slot_id, body.reason,
    )
    return {"appointment_id": str(new_appointment_id)}


class CancelBookingRequest(BaseModel):
    reason: str | None = None


@router.post("/{appointment_id}/cancel")
async def cancel_booking(
    appointment_id: UUID, body: CancelBookingRequest, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    return await patient_booking_service.cancel_appointment(patient, appointment_id, body.reason)
```

`backend/app/routers/patient_questionnaire.py`:
```python
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_questionnaire_service

router = APIRouter(prefix="/app", tags=["patient-questionnaire"])


@router.get("/questionnaire-templates/{department_id}")
async def get_template(
    department_id: UUID, patient: PatientContext = Depends(get_current_patient),
) -> dict | None:
    return await patient_questionnaire_service.get_template(department_id, patient)


class SubmitQuestionnaireRequest(BaseModel):
    template_id: UUID
    answers: list[dict]


@router.post("/appointments/{appointment_id}/questionnaire")
async def submit_questionnaire(
    appointment_id: UUID, body: SubmitQuestionnaireRequest, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    response_id = await patient_questionnaire_service.submit_response(
        patient, appointment_id, body.template_id, body.answers,
    )
    return {"response_id": str(response_id)}


@router.get("/appointments/{appointment_id}/questionnaire")
async def get_questionnaire(
    appointment_id: UUID, patient: PatientContext = Depends(get_current_patient),
) -> dict | None:
    return await patient_questionnaire_service.get_response(patient, appointment_id)
```

`backend/app/routers/patient_history.py`:
```python
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.patient_security import PatientContext, get_current_patient
from app.services import patient_history_service

router = APIRouter(prefix="/app", tags=["patient-history"])


@router.get("/visit-history")
async def visit_history(
    for_patient_id: UUID, patient: PatientContext = Depends(get_current_patient),
) -> list[dict]:
    return await patient_history_service.list_visit_history(patient, for_patient_id)
```

`backend/app/routers/patient_notifications.py`:
```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient
from app.services import device_token_service

router = APIRouter(prefix="/app/device-tokens", tags=["patient-notifications"])


class RegisterTokenRequest(BaseModel):
    fcm_token: str


@router.post("")
async def register_token(
    body: RegisterTokenRequest, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    await device_token_service.register_token(patient, body.fcm_token)
    return {"status": "registered"}


@router.delete("/{fcm_token}")
async def unregister_token(
    fcm_token: str, patient: PatientContext = Depends(get_current_patient),
) -> dict:
    await device_token_service.unregister_token(patient, fcm_token)
    return {"status": "unregistered"}
```

- [ ] **Step 3: main.py에 라우터 연결**

`backend/app/main.py` 수정(기존 라우터 등록 뒤에 추가):
```python
from app.routers import (
    patient_booking,
    patient_catalog,
    patient_family,
    patient_history,
    patient_notifications,
    patient_profile,
    patient_questionnaire,
)

app.include_router(patient_profile.router)
app.include_router(patient_family.router)
app.include_router(patient_catalog.router)
app.include_router(patient_booking.router)
app.include_router(patient_questionnaire.router)
app.include_router(patient_history.router)
app.include_router(patient_notifications.router)
```

- [ ] **Step 4: 통합 테스트 작성**

`backend/tests/test_patient_routers_integration.py`:
```python
import time

import pytest
from jose import jwt

from app.core.config import settings
from tests.conftest import seed_patient, seed_staff, set_session_auth


def make_patient_token(auth_user_id) -> str:
    payload = {"sub": str(auth_user_id), "aud": "authenticated", "role": "authenticated", "exp": int(time.time()) + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


@pytest.mark.asyncio
async def test_full_booking_flow_via_routers(client, committed_conn):
    admin = await seed_staff(committed_conn, role="admin")
    await set_session_auth(committed_conn, admin["auth_user_id"])
    doctor = await seed_staff(committed_conn, role="doctor")
    dept_id = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    await committed_conn.execute(
        "update staff set department_id = $1 where id = $2", dept_id, doctor["staff_id"],
    )
    slot_id = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-09-10', '09:00') returning id",
        doctor["staff_id"],
    )

    patient_seed = await seed_patient(committed_conn)
    token = make_patient_token(patient_seed["auth_user_id"])
    headers = {"Authorization": f"Bearer {token}"}

    doctors_res = client.get("/app/doctors", params={"department_id": str(dept_id)}, headers=headers)
    assert doctors_res.status_code == 200
    assert doctors_res.json()[0]["id"] == str(doctor["staff_id"])

    create_res = client.post(
        "/app/appointments",
        headers=headers,
        json={
            "for_patient_id": str(patient_seed["patient_id"]),
            "department_id": str(dept_id),
            "doctor_id": str(doctor["staff_id"]),
            "slot_id": str(slot_id),
            "reason": "감기",
        },
    )
    assert create_res.status_code == 200
    appointment_id = create_res.json()["appointment_id"]

    list_res = client.get("/app/appointments", headers=headers)
    assert list_res.status_code == 200
    assert list_res.json()[0]["id"] == appointment_id

    cancel_res = client.post(
        f"/app/appointments/{appointment_id}/cancel", headers=headers, json={"reason": "일정 변경"},
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["cancelled"] is True


@pytest.mark.asyncio
async def test_profile_route_requires_auth(client):
    response = client.get("/app/profile")
    assert response.status_code == 401
```

`backend/tests/conftest.py`에 `client`가 실제 커밋된 데이터를 볼 수 있도록 하는 `committed_conn` 픽스처가 없다면 추가한다(1단계 Task 17에서 이미 만들어졌다면 재사용):
```python
@pytest_asyncio.fixture
async def committed_conn(db_pool):
    async with db_pool.acquire() as conn:
        yield conn
    async with db_pool.acquire() as cleanup_conn:
        await cleanup_conn.execute("delete from appointment_status_history")
        await cleanup_conn.execute("delete from questionnaire_responses")
        await cleanup_conn.execute("delete from appointments")
        await cleanup_conn.execute("delete from appointment_slots")
        await cleanup_conn.execute("delete from patient_family_links")
        await cleanup_conn.execute("delete from patients")
        await cleanup_conn.execute("delete from staff")
        await cleanup_conn.execute("delete from departments")
        await cleanup_conn.execute("delete from auth.users where email like '%@test.local'")
```

- [ ] **Step 5: 테스트 실행**

Run: `cd backend && pytest tests/test_patient_routers_integration.py -v`
Expected: 2개 테스트 모두 PASS

- [ ] **Step 6: 전체 백엔드 테스트 스위트 실행**

Run: `cd backend && pytest -v`
Expected: 모든 테스트 PASS (1단계 테스트 + 이번 계획의 테스트 전부)

- [ ] **Step 7: 커밋**

```bash
git add backend/app/routers/patient_profile.py backend/app/routers/patient_family.py backend/app/routers/patient_catalog.py backend/app/routers/patient_booking.py backend/app/routers/patient_questionnaire.py backend/app/routers/patient_history.py backend/app/routers/patient_notifications.py backend/app/main.py backend/tests/test_patient_routers_integration.py backend/tests/conftest.py
git commit -m "feat: 환자용 /app/* 라우터 전체 연결 및 통합 테스트 추가"
```

---

## Task 14: Flutter 프로젝트 스캐폴딩

**Files:**
- Create: `mobile/pubspec.yaml`
- Create: `mobile/lib/main.dart`
- Create: `mobile/lib/app.dart`
- Create: `mobile/lib/core/env.dart`
- Create: `mobile/lib/core/router.dart`
- Create: `mobile/test/widget_test.dart`

**Interfaces:**
- Produces: `mobile/lib/core/env.dart`의 `Env.apiBaseUrl`, `Env.supabaseUrl`, `Env.supabaseAnonKey`(컴파일 타임 `--dart-define`으로 주입), `mobile/lib/core/router.dart`의 `appRouter`(`GoRouter`, 경로: `/login` `/signup` `/home` `/booking` `/family` `/appointments/:id` `/history` `/settings`), `mobile/lib/app.dart`의 `PatientApp` 위젯

- [ ] **Step 1: pubspec.yaml 작성**

`mobile/pubspec.yaml`:
```yaml
name: hospital_patient_app
description: 병원 통합 서비스 환자용 모바일 앱
publish_to: 'none'
version: 0.1.0

environment:
  sdk: '>=3.4.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.1
  go_router: ^14.2.0
  supabase_flutter: ^2.5.6
  http: ^1.2.1
  intl: ^0.19.0
  qr_flutter: ^4.1.0
  firebase_core: ^3.3.0
  firebase_messaging: ^15.0.4
  connectivity_plus: ^6.0.3

dev_dependencies:
  flutter_test:
    sdk: flutter
  mocktail: ^1.0.3
  flutter_lints: ^4.0.0

flutter:
  uses-material-design: true
```

- [ ] **Step 2: 환경설정과 라우터 작성**

`mobile/lib/core/env.dart`:
```dart
class Env {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000',
  );
  static const supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'http://localhost:54321',
  );
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
}
```

`mobile/lib/core/router.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

final GoRouter appRouter = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(path: '/login', builder: (context, state) => const _Placeholder('로그인')),
    GoRoute(path: '/signup', builder: (context, state) => const _Placeholder('회원가입')),
    GoRoute(path: '/home', builder: (context, state) => const _Placeholder('홈')),
    GoRoute(path: '/booking', builder: (context, state) => const _Placeholder('예약')),
    GoRoute(path: '/family', builder: (context, state) => const _Placeholder('가족관리')),
    GoRoute(
      path: '/appointments/:id',
      builder: (context, state) => _Placeholder('예약 상세 ${state.pathParameters['id']}'),
    ),
    GoRoute(path: '/history', builder: (context, state) => const _Placeholder('방문이력')),
    GoRoute(path: '/settings', builder: (context, state) => const _Placeholder('설정')),
  ],
);

class _Placeholder extends StatelessWidget {
  const _Placeholder(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Scaffold(body: Center(child: Text(label)));
  }
}
```
(각 라우트의 실제 화면 위젯은 이후 태스크(16~26)에서 이 파일을 수정해 `builder`를 교체한다.)

- [ ] **Step 3: main.dart / app.dart 작성**

`mobile/lib/main.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'core/env.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(url: Env.supabaseUrl, anonKey: Env.supabaseAnonKey);
  runApp(const ProviderScope(child: PatientApp()));
}
```

`mobile/lib/app.dart`:
```dart
import 'package:flutter/material.dart';

import 'core/router.dart';

class PatientApp extends StatelessWidget {
  const PatientApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: '병원 앱',
      theme: ThemeData(
        useMaterial3: true,
        textTheme: const TextTheme(
          bodyLarge: TextStyle(fontSize: 18),
          titleLarge: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
      ),
      routerConfig: appRouter,
    );
  }
}
```

- [ ] **Step 4: 스모크 테스트 작성**

`mobile/test/widget_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/router.dart';

void main() {
  test('appRouter는 /login을 초기 경로로 갖는다', () {
    expect(appRouter.routeInformationProvider.value.uri.toString(), '/login');
  });
}
```

- [ ] **Step 5: 테스트 실행**

Run: `cd mobile && flutter pub get && flutter test test/widget_test.dart`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add mobile/pubspec.yaml mobile/lib mobile/test/widget_test.dart
git commit -m "chore: Flutter 프로젝트 스캐폴딩(Riverpod/go_router/Supabase 초기화)"
```

---

## Task 15: ApiClient + 인증 상태(Riverpod)

**Files:**
- Create: `mobile/lib/core/api_client.dart`
- Create: `mobile/lib/core/providers.dart`
- Create: `mobile/lib/features/auth/auth_state.dart`
- Test: `mobile/test/core/api_client_test.dart`

**Interfaces:**
- Consumes: `Env.apiBaseUrl`(Task 14)
- Produces: `ApiException(message)`, `ApiClient({required baseUrl, required tokenProvider, http.Client? httpClient})`(`.get<T>`, `.post<T>`, `.patch<T>`, `.delete<T>`), `apiClientProvider`(Riverpod `Provider<ApiClient>`), `authStateChangesProvider`(Riverpod `StreamProvider<AuthState>`)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/core/api_client_test.dart`:
```dart
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('ApiClient', () {
    test('성공 응답을 파싱해서 반환한다', () async {
      final mockClient = MockClient((request) async {
        return http.Response(jsonEncode({'appointment_id': 'a1'}), 200);
      });
      final client = ApiClient(
        baseUrl: 'http://localhost:8000',
        tokenProvider: () async => 'fake-token',
        httpClient: mockClient,
      );

      final result = await client.post(
        '/app/appointments',
        {'reason': '감기'},
        (json) => json['appointment_id'] as String,
      );

      expect(result, 'a1');
    });

    test('실패 응답이면 한글 오류 메시지를 담은 ApiException을 던진다', () async {
      final mockClient = MockClient((request) async {
        return http.Response(jsonEncode({'detail': '이미 선택된 시간입니다. 다른 시간을 선택해주세요.'}), 409);
      });
      final client = ApiClient(
        baseUrl: 'http://localhost:8000',
        tokenProvider: () async => 'fake-token',
        httpClient: mockClient,
      );

      expect(
        () => client.post('/app/appointments', {}, (json) => json),
        throwsA(isA<ApiException>().having((e) => e.message, 'message', '이미 선택된 시간입니다. 다른 시간을 선택해주세요.')),
      );
    });
  });
}
```

Run: `cd mobile && flutter test test/core/api_client_test.dart`
Expected: FAIL(`api_client.dart` 없음)

- [ ] **Step 2: ApiClient 구현**

`mobile/lib/core/api_client.dart`:
```dart
import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({required this.baseUrl, required this.tokenProvider, http.Client? httpClient})
      : _client = httpClient ?? http.Client();

  final String baseUrl;
  final Future<String?> Function() tokenProvider;
  final http.Client _client;

  Future<Map<String, String>> _headers() async {
    final token = await tokenProvider();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<T> get<T>(String path, T Function(dynamic json) parse, {Map<String, String>? query}) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    final response = await _client.get(uri, headers: await _headers());
    return _handle(response, parse);
  }

  Future<T> post<T>(String path, Map<String, dynamic> body, T Function(dynamic json) parse) async {
    final response = await _client.post(
      Uri.parse('$baseUrl$path'), headers: await _headers(), body: jsonEncode(body),
    );
    return _handle(response, parse);
  }

  Future<T> patch<T>(String path, Map<String, dynamic> body, T Function(dynamic json) parse) async {
    final response = await _client.patch(
      Uri.parse('$baseUrl$path'), headers: await _headers(), body: jsonEncode(body),
    );
    return _handle(response, parse);
  }

  Future<T> delete<T>(String path, T Function(dynamic json) parse) async {
    final response = await _client.delete(Uri.parse('$baseUrl$path'), headers: await _headers());
    return _handle(response, parse);
  }

  T _handle<T>(http.Response response, T Function(dynamic json) parse) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return parse(null);
      return parse(jsonDecode(response.body));
    }
    var message = '요청 처리 중 오류가 발생했습니다.';
    try {
      final body = jsonDecode(response.body);
      if (body is Map && body['detail'] is String) message = body['detail'] as String;
    } catch (_) {}
    throw ApiException(message);
  }
}
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/core/api_client_test.dart`
Expected: 2개 테스트 모두 PASS

- [ ] **Step 4: Riverpod 프로바이더와 인증 상태 작성**

`mobile/lib/features/auth/auth_state.dart`:
```dart
enum AuthStatus { signedOut, signedIn }

class AuthState {
  const AuthState({required this.status, this.userId});
  final AuthStatus status;
  final String? userId;
}
```

`mobile/lib/core/providers.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../features/auth/auth_state.dart';
import 'api_client.dart';
import 'env.dart';

final supabaseClientProvider = Provider<SupabaseClient>((ref) => Supabase.instance.client);

final apiClientProvider = Provider<ApiClient>((ref) {
  final supabase = ref.watch(supabaseClientProvider);
  return ApiClient(
    baseUrl: Env.apiBaseUrl,
    tokenProvider: () async => supabase.auth.currentSession?.accessToken,
  );
});

final authStateChangesProvider = StreamProvider<AuthState>((ref) {
  final supabase = ref.watch(supabaseClientProvider);
  return supabase.auth.onAuthStateChange.map((event) {
    final session = event.session;
    if (session == null) return const AuthState(status: AuthStatus.signedOut);
    return AuthState(status: AuthStatus.signedIn, userId: session.user.id);
  });
});
```

- [ ] **Step 5: 테스트 실행(전체)**

Run: `cd mobile && flutter test`
Expected: 기존 위젯 테스트 포함 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add mobile/lib/core/api_client.dart mobile/lib/core/providers.dart mobile/lib/features/auth/auth_state.dart mobile/test/core/api_client_test.dart
git commit -m "feat: ApiClient와 Supabase 인증 상태 Riverpod 프로바이더 추가"
```

---

## Task 16: 회원가입 화면 (전화번호 OTP + 비밀번호 + 기본정보)

**Files:**
- Create: `mobile/lib/features/auth/signup_controller.dart`
- Create: `mobile/lib/features/auth/signup_screen.dart`
- Modify: `mobile/lib/core/router.dart` (`/signup` 라우트 교체)
- Test: `mobile/test/features/auth/signup_controller_test.dart`

**Interfaces:**
- Consumes: `apiClientProvider`(Task 15), `SupabaseClient.auth`(supabase_flutter)
- Produces: `AuthGateway`(추상 인터페이스: `sendOtp(phone)`, `verifyOtp(phone, token)`, `setPassword(password)`), `SignupController`(Riverpod `AsyncNotifier`: `sendOtp(phone)`, `verifyOtp(token)`, `completeSignup({password, name, birthDate, gender, phone})`)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/features/auth/signup_controller_test.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/auth/signup_controller.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthGateway extends Mock implements AuthGateway {}

void main() {
  late MockAuthGateway gateway;
  late ProviderContainer container;

  setUp(() {
    gateway = MockAuthGateway();
    container = ProviderContainer(overrides: [
      authGatewayProvider.overrideWithValue(gateway),
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 'token'),
      ),
    ]);
    registerFallbackValue('');
  });

  test('sendOtp는 AuthGateway.sendOtp를 호출한다', () async {
    when(() => gateway.sendOtp('01012345678')).thenAnswer((_) async {});

    final controller = container.read(signupControllerProvider.notifier);
    await controller.sendOtp('01012345678');

    verify(() => gateway.sendOtp('01012345678')).called(1);
  });

  test('verifyOtp 실패 시 상태가 에러가 된다', () async {
    when(() => gateway.sendOtp(any())).thenAnswer((_) async {});
    when(() => gateway.verifyOtp(any(), any())).thenThrow(Exception('인증번호가 올바르지 않습니다.'));

    final controller = container.read(signupControllerProvider.notifier);
    await controller.sendOtp('01012345678');
    await controller.verifyOtp('000000');

    final state = container.read(signupControllerProvider);
    expect(state.hasError, isTrue);
  });
}
```

Run: `cd mobile && flutter test test/features/auth/signup_controller_test.dart`
Expected: FAIL(`signup_controller.dart` 없음)

- [ ] **Step 2: AuthGateway와 SignupController 구현**

`mobile/lib/features/auth/signup_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';

abstract class AuthGateway {
  Future<void> sendOtp(String phone);
  Future<void> verifyOtp(String phone, String token);
  Future<void> setPassword(String password);
  Future<void> signInWithPassword(String phone, String password);
  Future<void> signOut();
}

class SupabaseAuthGateway implements AuthGateway {
  SupabaseAuthGateway(this._client);
  final SupabaseClient _client;

  @override
  Future<void> sendOtp(String phone) => _client.auth.signInWithOtp(phone: phone);

  @override
  Future<void> verifyOtp(String phone, String token) async {
    await _client.auth.verifyOTP(phone: phone, token: token, type: OtpType.sms);
  }

  @override
  Future<void> setPassword(String password) async {
    await _client.auth.updateUser(UserAttributes(password: password));
  }

  @override
  Future<void> signInWithPassword(String phone, String password) async {
    await _client.auth.signInWithPassword(phone: phone, password: password);
  }

  @override
  Future<void> signOut() => _client.auth.signOut();
}

final authGatewayProvider = Provider<AuthGateway>(
  (ref) => SupabaseAuthGateway(ref.watch(supabaseClientProvider)),
);

class SignupFormData {
  const SignupFormData({
    this.phone = '',
    this.otpSent = false,
    this.otpVerified = false,
  });

  final String phone;
  final bool otpSent;
  final bool otpVerified;

  SignupFormData copyWith({String? phone, bool? otpSent, bool? otpVerified}) {
    return SignupFormData(
      phone: phone ?? this.phone,
      otpSent: otpSent ?? this.otpSent,
      otpVerified: otpVerified ?? this.otpVerified,
    );
  }
}

class SignupController extends AsyncNotifier<SignupFormData> {
  @override
  SignupFormData build() => const SignupFormData();

  Future<void> sendOtp(String phone) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(authGatewayProvider).sendOtp(phone);
      return SignupFormData(phone: phone, otpSent: true);
    });
  }

  Future<void> verifyOtp(String token) async {
    final phone = state.value?.phone ?? '';
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(authGatewayProvider).verifyOtp(phone, token);
      return SignupFormData(phone: phone, otpSent: true, otpVerified: true);
    });
  }

  Future<void> completeSignup({
    required String password,
    required String name,
    required String birthDate,
    required String gender,
  }) async {
    final phone = state.value?.phone ?? '';
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(authGatewayProvider).setPassword(password);
      final api = ref.read(apiClientProvider);
      await api.post(
        '/app/profile',
        {'name': name, 'birth_date': birthDate, 'gender': gender, 'phone': phone},
        (json) => json,
      );
      return SignupFormData(phone: phone, otpSent: true, otpVerified: true);
    });
  }
}

final signupControllerProvider = AsyncNotifierProvider<SignupController, SignupFormData>(
  SignupController.new,
);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/auth/signup_controller_test.dart`
Expected: 2개 테스트 모두 PASS

- [ ] **Step 4: 회원가입 화면 위젯 작성**

`mobile/lib/features/auth/signup_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'signup_controller.dart';

class SignupScreen extends ConsumerStatefulWidget {
  const SignupScreen({super.key});

  @override
  ConsumerState<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends ConsumerState<SignupScreen> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();
  final _birthDateController = TextEditingController();
  String _gender = 'F';

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(signupControllerProvider);
    final form = state.value ?? const SignupFormData();

    return Scaffold(
      appBar: AppBar(title: const Text('회원가입')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            if (state.hasError)
              Text('${state.error}', style: const TextStyle(color: Colors.red)),
            if (!form.otpSent) ...[
              TextField(
                controller: _phoneController,
                decoration: const InputDecoration(labelText: '전화번호'),
                keyboardType: TextInputType.phone,
              ),
              ElevatedButton(
                onPressed: state.isLoading
                    ? null
                    : () => ref.read(signupControllerProvider.notifier).sendOtp(_phoneController.text),
                child: const Text('인증번호 받기'),
              ),
            ] else if (!form.otpVerified) ...[
              TextField(
                controller: _otpController,
                decoration: const InputDecoration(labelText: '인증번호'),
                keyboardType: TextInputType.number,
              ),
              ElevatedButton(
                onPressed: state.isLoading
                    ? null
                    : () => ref.read(signupControllerProvider.notifier).verifyOtp(_otpController.text),
                child: const Text('인증번호 확인'),
              ),
            ] else ...[
              TextField(
                controller: _passwordController,
                decoration: const InputDecoration(labelText: '비밀번호'),
                obscureText: true,
              ),
              TextField(controller: _nameController, decoration: const InputDecoration(labelText: '이름')),
              TextField(
                controller: _birthDateController,
                decoration: const InputDecoration(labelText: '생년월일 (YYYY-MM-DD)'),
              ),
              DropdownButton<String>(
                value: _gender,
                items: const [
                  DropdownMenuItem(value: 'F', child: Text('여성')),
                  DropdownMenuItem(value: 'M', child: Text('남성')),
                ],
                onChanged: (value) => setState(() => _gender = value ?? 'F'),
              ),
              ElevatedButton(
                onPressed: state.isLoading
                    ? null
                    : () => ref.read(signupControllerProvider.notifier).completeSignup(
                          password: _passwordController.text,
                          name: _nameController.text,
                          birthDate: _birthDateController.text,
                          gender: _gender,
                        ),
                child: const Text('가입 완료'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: 라우터에 연결**

`mobile/lib/core/router.dart`의 `/signup` 라우트를 아래처럼 교체한다(`import '../features/auth/signup_screen.dart';` 추가):
```dart
GoRoute(path: '/signup', builder: (context, state) => const SignupScreen()),
```

- [ ] **Step 6: 커밋**

```bash
git add mobile/lib/features/auth/signup_controller.dart mobile/lib/features/auth/signup_screen.dart mobile/lib/core/router.dart mobile/test/features/auth/signup_controller_test.dart
git commit -m "feat: 전화번호 OTP 기반 회원가입 화면 추가"
```

---

## Task 17: 로그인/비밀번호 찾기/로그아웃/회원탈퇴 + 민감화면 재인증

**Files:**
- Create: `mobile/lib/features/auth/login_screen.dart`
- Create: `mobile/lib/features/auth/login_controller.dart`
- Create: `mobile/lib/features/auth/reset_password_controller.dart`
- Create: `mobile/lib/features/auth/reset_password_screen.dart`
- Create: `mobile/lib/core/sensitive_reauth_guard.dart`
- Modify: `mobile/lib/core/router.dart` (`/login` 라우트 교체, `/reset-password` 추가)
- Test: `mobile/test/features/auth/login_controller_test.dart`
- Test: `mobile/test/core/sensitive_reauth_guard_test.dart`

**Interfaces:**
- Consumes: `AuthGateway, authGatewayProvider`(Task 16), `apiClientProvider`(Task 15)
- Produces: `LoginController`(`AsyncNotifier<void>`: `login(phone, password)`, `logout()`), `ResetPasswordController`(`sendOtp(phone)`, `verifyOtp(token)`, `setNewPassword(password)`), `SensitiveReauthGuard`(`markScreenLeftAt()`, `requiresReauth(now) -> bool`, 임계값 5분)

- [ ] **Step 1: 실패하는 테스트 작성 — LoginController**

`mobile/test/features/auth/login_controller_test.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/features/auth/login_controller.dart';
import 'package:hospital_patient_app/features/auth/signup_controller.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthGateway extends Mock implements AuthGateway {}

void main() {
  late MockAuthGateway gateway;
  late ProviderContainer container;

  setUp(() {
    gateway = MockAuthGateway();
    container = ProviderContainer(overrides: [authGatewayProvider.overrideWithValue(gateway)]);
  });

  test('login 성공 시 signInWithPassword를 호출한다', () async {
    when(() => gateway.signInWithPassword('01012345678', 'pass1234')).thenAnswer((_) async {});

    await container.read(loginControllerProvider.notifier).login('01012345678', 'pass1234');

    verify(() => gateway.signInWithPassword('01012345678', 'pass1234')).called(1);
    expect(container.read(loginControllerProvider).hasError, isFalse);
  });

  test('login 실패 시 한글 오류 상태를 남긴다', () async {
    when(() => gateway.signInWithPassword(any(), any())).thenThrow(Exception('전화번호 또는 비밀번호가 올바르지 않습니다.'));

    await container.read(loginControllerProvider.notifier).login('01012345678', 'wrong');

    expect(container.read(loginControllerProvider).hasError, isTrue);
  });

  test('logout은 AuthGateway.signOut을 호출한다', () async {
    when(() => gateway.signOut()).thenAnswer((_) async {});

    await container.read(loginControllerProvider.notifier).logout();

    verify(() => gateway.signOut()).called(1);
  });
}
```

Run: `cd mobile && flutter test test/features/auth/login_controller_test.dart`
Expected: FAIL(`login_controller.dart` 없음)

- [ ] **Step 2: LoginController / ResetPasswordController 구현**

`mobile/lib/features/auth/login_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'signup_controller.dart';

class LoginController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<void> login(String phone, String password) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => ref.read(authGatewayProvider).signInWithPassword(phone, password));
  }

  Future<void> logout() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => ref.read(authGatewayProvider).signOut());
  }
}

final loginControllerProvider = AsyncNotifierProvider<LoginController, void>(LoginController.new);
```

`mobile/lib/features/auth/reset_password_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'signup_controller.dart';

class ResetPasswordState {
  const ResetPasswordState({this.phone = '', this.otpVerified = false});
  final String phone;
  final bool otpVerified;

  ResetPasswordState copyWith({String? phone, bool? otpVerified}) =>
      ResetPasswordState(phone: phone ?? this.phone, otpVerified: otpVerified ?? this.otpVerified);
}

class ResetPasswordController extends AsyncNotifier<ResetPasswordState> {
  @override
  ResetPasswordState build() => const ResetPasswordState();

  Future<void> sendOtp(String phone) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(authGatewayProvider).sendOtp(phone);
      return ResetPasswordState(phone: phone);
    });
  }

  Future<void> verifyOtp(String token) async {
    final phone = state.value?.phone ?? '';
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(authGatewayProvider).verifyOtp(phone, token);
      return ResetPasswordState(phone: phone, otpVerified: true);
    });
  }

  Future<void> setNewPassword(String password) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(authGatewayProvider).setPassword(password);
      return state.value ?? const ResetPasswordState();
    });
  }
}

final resetPasswordControllerProvider =
    AsyncNotifierProvider<ResetPasswordController, ResetPasswordState>(ResetPasswordController.new);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/auth/login_controller_test.dart`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 4: 실패하는 테스트 작성 — SensitiveReauthGuard**

`mobile/test/core/sensitive_reauth_guard_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/sensitive_reauth_guard.dart';

void main() {
  test('5분 이내 재진입은 재인증이 필요없다', () {
    final guard = SensitiveReauthGuard();
    final leftAt = DateTime(2026, 7, 27, 10, 0, 0);
    guard.markScreenLeftAt(leftAt);

    final requires = guard.requiresReauth(leftAt.add(const Duration(minutes: 4)));
    expect(requires, isFalse);
  });

  test('5분 넘게 지나면 재인증이 필요하다', () {
    final guard = SensitiveReauthGuard();
    final leftAt = DateTime(2026, 7, 27, 10, 0, 0);
    guard.markScreenLeftAt(leftAt);

    final requires = guard.requiresReauth(leftAt.add(const Duration(minutes: 6)));
    expect(requires, isTrue);
  });

  test('한 번도 나간 적 없으면 재인증이 필요없다', () {
    final guard = SensitiveReauthGuard();
    expect(guard.requiresReauth(DateTime.now()), isFalse);
  });
}
```

Run: `cd mobile && flutter test test/core/sensitive_reauth_guard_test.dart`
Expected: FAIL(모듈 없음)

- [ ] **Step 5: SensitiveReauthGuard 구현**

`mobile/lib/core/sensitive_reauth_guard.dart`:
```dart
class SensitiveReauthGuard {
  static const Duration threshold = Duration(minutes: 5);

  DateTime? _leftAt;

  void markScreenLeftAt(DateTime time) {
    _leftAt = time;
  }

  bool requiresReauth(DateTime now) {
    final leftAt = _leftAt;
    if (leftAt == null) return false;
    return now.difference(leftAt) > threshold;
  }

  void reset() {
    _leftAt = null;
  }
}
```

- [ ] **Step 6: 테스트 실행**

Run: `cd mobile && flutter test test/core/sensitive_reauth_guard_test.dart`
Expected: 3개 테스트 모두 PASS

- [ ] **Step 7: 로그인/비밀번호 찾기 화면 작성 및 라우터 연결**

`mobile/lib/features/auth/login_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'login_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(loginControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('로그인')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            if (state.hasError)
              const Text('전화번호 또는 비밀번호가 올바르지 않습니다.', style: TextStyle(color: Colors.red)),
            TextField(controller: _phoneController, decoration: const InputDecoration(labelText: '전화번호')),
            TextField(
              controller: _passwordController,
              decoration: const InputDecoration(labelText: '비밀번호'),
              obscureText: true,
            ),
            ElevatedButton(
              onPressed: state.isLoading
                  ? null
                  : () async {
                      await ref.read(loginControllerProvider.notifier).login(
                            _phoneController.text, _passwordController.text,
                          );
                      if (context.mounted && !ref.read(loginControllerProvider).hasError) {
                        context.go('/home');
                      }
                    },
              child: const Text('로그인'),
            ),
            TextButton(onPressed: () => context.go('/signup'), child: const Text('회원가입')),
            TextButton(onPressed: () => context.go('/reset-password'), child: const Text('비밀번호를 잊으셨나요?')),
          ],
        ),
      ),
    );
  }
}
```

`mobile/lib/features/auth/reset_password_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'reset_password_controller.dart';

class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key});

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  final _newPasswordController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(resetPasswordControllerProvider);
    final form = state.value ?? const ResetPasswordState();

    return Scaffold(
      appBar: AppBar(title: const Text('비밀번호 재설정')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            if (!form.otpVerified) ...[
              TextField(controller: _phoneController, decoration: const InputDecoration(labelText: '전화번호')),
              ElevatedButton(
                onPressed: () => ref.read(resetPasswordControllerProvider.notifier).sendOtp(_phoneController.text),
                child: const Text('인증번호 받기'),
              ),
              TextField(controller: _otpController, decoration: const InputDecoration(labelText: '인증번호')),
              ElevatedButton(
                onPressed: () => ref.read(resetPasswordControllerProvider.notifier).verifyOtp(_otpController.text),
                child: const Text('인증번호 확인'),
              ),
            ] else ...[
              TextField(
                controller: _newPasswordController,
                decoration: const InputDecoration(labelText: '새 비밀번호'),
                obscureText: true,
              ),
              ElevatedButton(
                onPressed: () async {
                  await ref.read(resetPasswordControllerProvider.notifier).setNewPassword(_newPasswordController.text);
                  if (context.mounted) context.go('/login');
                },
                child: const Text('비밀번호 변경'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

`mobile/lib/core/router.dart`의 `/login` 라우트를 교체하고 `/reset-password`를 추가한다(관련 import 2건 추가):
```dart
GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
GoRoute(path: '/reset-password', builder: (context, state) => const ResetPasswordScreen()),
```

- [ ] **Step 8: 커밋**

```bash
git add mobile/lib/features/auth/login_screen.dart mobile/lib/features/auth/login_controller.dart mobile/lib/features/auth/reset_password_controller.dart mobile/lib/features/auth/reset_password_screen.dart mobile/lib/core/sensitive_reauth_guard.dart mobile/lib/core/router.dart mobile/test/features/auth/login_controller_test.dart mobile/test/core/sensitive_reauth_guard_test.dart
git commit -m "feat: 로그인/비밀번호 찾기/로그아웃과 민감화면 재인증 가드 추가"
```

---

## Task 18: 가족 관리 화면

**Files:**
- Create: `mobile/lib/features/family/family_controller.dart`
- Create: `mobile/lib/features/family/family_screen.dart`
- Modify: `mobile/lib/core/router.dart` (`/family` 라우트 교체)
- Test: `mobile/test/features/family/family_controller_test.dart`

**Interfaces:**
- Consumes: `apiClientProvider`(Task 15)
- Produces: `FamilyMember`(모델: `id, name, birthDate, gender, relation`), `FamilyController`(`AsyncNotifier<List<FamilyMember>>`: `load()`, `add(...)`, `update(...)`, `unlink(id)`, `requestLinkOtp(name, birthDate, phone) -> Future<String>`([정합성 검토 R5-01], request_id 반환), `confirmLinkOtp(requestId, code) -> Future<void>`)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/features/family/family_controller_test.dart`:
```dart
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/family/family_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('load는 가족 목록을 가져온다', () async {
    final mockClient = MockClient((request) async {
      return http.Response(
        jsonEncode([
          {'id': 'f1', 'name': '김자녀', 'birth_date': '2015-05-05', 'gender': 'F', 'relation': '자녀'},
        ]),
        200,
      );
    });
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 't', httpClient: mockClient),
      ),
    ]);

    await container.read(familyControllerProvider.notifier).load();

    final members = container.read(familyControllerProvider).value!;
    expect(members.single.name, '김자녀');
    expect(members.single.relation, '자녀');
  });

  test('[정합성 검토 R5-01] requestLinkOtp는 request_id를 반환하고, confirmLinkOtp는 목록을 새로고침한다', () async {
    final mockClient = MockClient((request) async {
      if (request.url.path.endsWith('/link-requests')) {
        return http.Response(jsonEncode({'request_id': 'req-1'}), 200);
      }
      if (request.url.path.endsWith('/confirm')) {
        return http.Response(jsonEncode({'id': 'f2'}), 200);
      }
      return http.Response(
        jsonEncode([
          {'id': 'f2', 'name': '김배우자', 'birth_date': '1990-01-01', 'gender': 'F', 'relation': '배우자'},
        ]),
        200,
      );
    });
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 't', httpClient: mockClient),
      ),
    ]);

    final requestId = await container.read(familyControllerProvider.notifier).requestLinkOtp(
          name: '김배우자', birthDate: '1990-01-01', phone: '01099998888',
        );
    expect(requestId, 'req-1');

    await container.read(familyControllerProvider.notifier).confirmLinkOtp(requestId, '123456');
    final members = container.read(familyControllerProvider).value!;
    expect(members.single.name, '김배우자');
  });
}
```

Run: `cd mobile && flutter test test/features/family/family_controller_test.dart`
Expected: FAIL(모듈 없음)

- [ ] **Step 2: FamilyController 구현**

`mobile/lib/features/family/family_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class FamilyMember {
  const FamilyMember({
    required this.id, required this.name, required this.birthDate, required this.gender, required this.relation,
  });
  final String id;
  final String name;
  final String birthDate;
  final String gender;
  final String relation;

  factory FamilyMember.fromJson(Map<String, dynamic> json) => FamilyMember(
        id: json['id'] as String,
        name: json['name'] as String,
        birthDate: json['birth_date'] as String,
        gender: json['gender'] as String,
        relation: json['relation'] as String,
      );
}

class FamilyController extends AsyncNotifier<List<FamilyMember>> {
  @override
  Future<List<FamilyMember>> build() => _fetch();

  Future<List<FamilyMember>> _fetch() async {
    final api = ref.read(apiClientProvider);
    return api.get(
      '/app/family',
      (json) => (json as List).map((e) => FamilyMember.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  Future<void> load() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetch);
  }

  Future<void> add({required String name, required String birthDate, required String gender, required String relation}) async {
    final api = ref.read(apiClientProvider);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await api.post('/app/family', {'name': name, 'birth_date': birthDate, 'gender': gender, 'relation': relation}, (j) => j);
      return _fetch();
    });
  }

  Future<void> update(String id, {required String name, required String birthDate, required String gender, required String relation}) async {
    final api = ref.read(apiClientProvider);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await api.patch('/app/family/$id', {'name': name, 'birth_date': birthDate, 'gender': gender, 'relation': relation}, (j) => j);
      return _fetch();
    });
  }

  Future<void> unlink(String id) async {
    final api = ref.read(apiClientProvider);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await api.delete('/app/family/$id', (j) => j);
      return _fetch();
    });
  }

  // [정합성 검토 R5-01] 이미 병원에 등록된 환자를 가족으로 연결 — OTP 자기인증.
  Future<String> requestLinkOtp({required String name, required String birthDate, required String phone}) async {
    final api = ref.read(apiClientProvider);
    final result = await api.post(
      '/app/family/link-requests',
      {'name': name, 'birth_date': birthDate, 'phone': phone},
      (j) => j as Map<String, dynamic>,
    );
    return result['request_id'] as String;
  }

  Future<void> confirmLinkOtp(String requestId, String code) async {
    final api = ref.read(apiClientProvider);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await api.post('/app/family/link-requests/$requestId/confirm', {'code': code}, (j) => j);
      return _fetch();
    });
  }
}

final familyControllerProvider = AsyncNotifierProvider<FamilyController, List<FamilyMember>>(FamilyController.new);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/family/family_controller_test.dart`
Expected: 2개 테스트 모두 PASS([정합성 검토 R5-01] 검증 테스트 1건 추가로 1→2)

- [ ] **Step 4: 가족 관리 화면 작성 및 라우터 연결**

`mobile/lib/features/family/family_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'family_controller.dart';

class FamilyScreen extends ConsumerStatefulWidget {
  const FamilyScreen({super.key});

  @override
  ConsumerState<FamilyScreen> createState() => _FamilyScreenState();
}

class _FamilyScreenState extends ConsumerState<FamilyScreen> {
  final _nameController = TextEditingController();
  final _birthDateController = TextEditingController();
  final _relationController = TextEditingController();
  String _gender = 'F';

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(familyControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('가족 관리')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
        data: (members) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // [정합성 검토 R5-01] 이미 병원에 등록된 가족을 새로 추가하면 과거 기록과 분리된다는 상시 안내.
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 12),
              color: Colors.amber.shade50,
              child: const Text(
                '이미 병원에 방문·예약하신 적 있는 가족이라면 새로 추가하지 마세요. '
                '새로 추가하면 과거 기록과 별도로 관리됩니다. '
                '기존 기록과 연결하시려면 아래 "기존 환자와 연결"을 이용하거나 병원(전화/방문)으로 문의해주세요.',
              ),
            ),
            for (final member in members)
              ListTile(
                title: Text('${member.name} (${member.relation})'),
                subtitle: Text(member.birthDate),
                trailing: IconButton(
                  icon: const Icon(Icons.link_off),
                  onPressed: () => ref.read(familyControllerProvider.notifier).unlink(member.id),
                ),
              ),
            const Divider(),
            TextField(controller: _nameController, decoration: const InputDecoration(labelText: '이름')),
            TextField(controller: _birthDateController, decoration: const InputDecoration(labelText: '생년월일 (YYYY-MM-DD)')),
            TextField(controller: _relationController, decoration: const InputDecoration(labelText: '관계')),
            DropdownButton<String>(
              value: _gender,
              items: const [
                DropdownMenuItem(value: 'F', child: Text('여성')),
                DropdownMenuItem(value: 'M', child: Text('남성')),
              ],
              onChanged: (value) => setState(() => _gender = value ?? 'F'),
            ),
            ElevatedButton(
              onPressed: () => ref.read(familyControllerProvider.notifier).add(
                    name: _nameController.text,
                    birthDate: _birthDateController.text,
                    gender: _gender,
                    relation: _relationController.text,
                  ),
              child: const Text('가족 등록'),
            ),
            const Divider(),
            OutlinedButton(
              onPressed: () => _showLinkExistingDialog(context),
              child: const Text('기존 환자와 연결'),
            ),
          ],
        ),
      ),
    );
  }

  // [정합성 검토 R5-01] 기존 환자와 연결: 이름·생년월일·전화번호 → OTP 발송 → 코드 확인.
  Future<void> _showLinkExistingDialog(BuildContext context) async {
    final nameController = TextEditingController();
    final birthController = TextEditingController();
    final phoneController = TextEditingController();
    String? requestId;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) {
          if (requestId == null) {
            return AlertDialog(
              title: const Text('기존 환자와 연결'),
              content: Column(mainAxisSize: MainAxisSize.min, children: [
                TextField(controller: nameController, decoration: const InputDecoration(labelText: '이름')),
                TextField(controller: birthController, decoration: const InputDecoration(labelText: '생년월일 (YYYY-MM-DD)')),
                TextField(controller: phoneController, decoration: const InputDecoration(labelText: '전화번호')),
              ]),
              actions: [
                TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('취소')),
                ElevatedButton(
                  onPressed: () async {
                    try {
                      final id = await ref.read(familyControllerProvider.notifier).requestLinkOtp(
                            name: nameController.text,
                            birthDate: birthController.text,
                            phone: phoneController.text,
                          );
                      setDialogState(() => requestId = id);
                    } on ApiException catch (e) {
                      // 404/400: "일치하는 기록을 특정할 수 없습니다" 또는 "본인 확인이 어려운 경우
                      // 병원(전화/방문)으로 문의해주세요" — 서버 메시지를 그대로 보여준다.
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                    }
                  },
                  child: const Text('인증번호 받기'),
                ),
              ],
            );
          }
          final codeController = TextEditingController();
          return AlertDialog(
            title: const Text('인증번호 입력'),
            content: TextField(controller: codeController, decoration: const InputDecoration(labelText: '인증번호 6자리')),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('취소')),
              ElevatedButton(
                onPressed: () async {
                  try {
                    await ref.read(familyControllerProvider.notifier).confirmLinkOtp(requestId!, codeController.text);
                    Navigator.pop(dialogContext);
                  } on ApiException catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                  }
                },
                child: const Text('확인'),
              ),
            ],
          );
        },
      ),
    );
  }
}
```

`mobile/lib/core/router.dart`의 `/family` 라우트를 교체한다:
```dart
GoRoute(path: '/family', builder: (context, state) => const FamilyScreen()),
```

- [ ] **Step 5: 커밋**

```bash
git add mobile/lib/features/family mobile/lib/core/router.dart mobile/test/features/family/family_controller_test.dart
git commit -m "feat: 가족 등록/수정/연결해제 화면 추가 (R5-01: 기존 환자 OTP 연결 포함)"
```

---

## Task 19: 예약 플로우 (8단계)

> 정합성 검토(2026-07-28)에서 지적된 두 결함을 이 태스크에서 고친다: ① 앱이 본인을 문자열 `'self'`로 그대로 서버에 보내는데 백엔드는 UUID를 요구해 본인 예약이 실패하던 문제 → `MyProfileController`로 실제 patient UUID를 로드해서 쓴다. ② 진료과·의사·날짜·시간 선택(1~5단계)이 `Text('N단계 화면')` placeholder였던 문제 → 실제 API 연동 목록 위젯으로 채운다.

**Files:**
- Create: `mobile/lib/features/profile/my_profile_controller.dart`
- Create: `mobile/lib/features/booking/booking_flow_controller.dart`
- Create: `mobile/lib/features/booking/booking_flow_screen.dart`
- Modify: `mobile/lib/core/router.dart` (`/booking`, `/history` 라우트 교체)
- Test: `mobile/test/features/profile/my_profile_controller_test.dart`
- Test: `mobile/test/features/booking/booking_flow_controller_test.dart`
- Test: `mobile/test/features/booking/booking_flow_screen_test.dart`

**Interfaces:**
- Consumes: `apiClientProvider`(Task 15), `FamilyMember, familyControllerProvider`(Task 18)
- Produces: `MyProfile`(모델: `id, name, birthDate, gender, phone`), `myProfileControllerProvider`(`AsyncNotifierProvider<MyProfileController, MyProfile>`, `GET /app/profile` 결과 캐시)
- Produces: `BookingSelection`(모델: `forPatientId, departmentId, doctorId, slotId, reason`), `BookingFlowController`(`AsyncNotifier<BookingSelection>`: `selectPatient(id)`, `selectDepartment(id)`, `selectDoctor(id)`, `selectSlot(id)`, `setReason(text)`, `submit() -> Future<String>`(생성된 `appointment_id` 반환))

- [ ] **Step 0: 실패하는 테스트 작성 — MyProfileController**

`mobile/test/features/profile/my_profile_controller_test.dart`:
```dart
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/profile/my_profile_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('내 프로필을 조회하면 실제 patient UUID를 담은 MyProfile을 반환한다', () async {
    final mockClient = MockClient((request) async {
      return http.Response(
        jsonEncode({'id': 'p1', 'name': '홍길동', 'birth_date': '1985-03-01', 'gender': 'M', 'phone': '01012345678'}),
        200,
      );
    });
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 't', httpClient: mockClient),
      ),
    ]);

    final profile = await container.read(myProfileControllerProvider.future);

    expect(profile.id, 'p1');
  });
}
```

Run: `cd mobile && flutter test test/features/profile/my_profile_controller_test.dart`
Expected: FAIL(모듈 없음)

- [ ] **Step 0.1: MyProfileController 구현**

`mobile/lib/features/profile/my_profile_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class MyProfile {
  const MyProfile({required this.id, required this.name, required this.birthDate, required this.gender, required this.phone});
  final String id;
  final String name;
  final String birthDate;
  final String gender;
  final String phone;

  factory MyProfile.fromJson(Map<String, dynamic> json) => MyProfile(
        id: json['id'] as String,
        name: json['name'] as String,
        birthDate: json['birth_date'] as String,
        gender: json['gender'] as String,
        phone: json['phone'] as String,
      );
}

class MyProfileController extends AsyncNotifier<MyProfile> {
  @override
  Future<MyProfile> build() async {
    final api = ref.read(apiClientProvider);
    return api.get('/app/profile', (json) => MyProfile.fromJson(json as Map<String, dynamic>));
  }
}

final myProfileControllerProvider = AsyncNotifierProvider<MyProfileController, MyProfile>(MyProfileController.new);
```

> 로그인 직후(홈 화면 진입 시) 한 번 `ref.read(myProfileControllerProvider.future)`로 미리 불러와 두면, 예약·방문이력 등 "본인"을 나타내야 하는 모든 화면이 문자열 `'self'` 대신 이 `profile.id`(실제 patient UUID)를 쓸 수 있다. 서버 API와 RLS는 UUID만 인식하므로, `'self'` 리터럴은 이 태스크 이후 코드베이스에서 완전히 제거한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/features/booking/booking_flow_controller_test.dart`:
```dart
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/booking/booking_flow_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('submit은 선택값으로 예약을 생성하고 appointment_id를 반환한다', () async {
    final mockClient = MockClient((request) async {
      if (request.url.path == '/app/appointments' && request.method == 'POST') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['for_patient_id'], 'p1');
        expect(body['department_id'], 'd1');
        expect(body['doctor_id'], 'doc1');
        expect(body['slot_id'], 's1');
        expect(body['reason'], '감기');
        return http.Response(jsonEncode({'appointment_id': 'a1'}), 200);
      }
      return http.Response('not found', 404);
    });
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 't', httpClient: mockClient),
      ),
    ]);

    final controller = container.read(bookingFlowControllerProvider.notifier);
    controller.selectPatient('p1');
    controller.selectDepartment('d1');
    controller.selectDoctor('doc1');
    controller.selectSlot('s1');
    controller.setReason('감기');

    final appointmentId = await controller.submit();

    expect(appointmentId, 'a1');
  });
}
```

Run: `cd mobile && flutter test test/features/booking/booking_flow_controller_test.dart`
Expected: FAIL(모듈 없음)

- [ ] **Step 2: BookingFlowController 구현**

`mobile/lib/features/booking/booking_flow_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class BookingSelection {
  const BookingSelection({
    this.forPatientId, this.departmentId, this.doctorId, this.slotId, this.reason = '',
  });

  final String? forPatientId;
  final String? departmentId;
  final String? doctorId;
  final String? slotId;
  final String reason;

  BookingSelection copyWith({
    String? forPatientId, String? departmentId, String? doctorId, String? slotId, String? reason,
  }) {
    return BookingSelection(
      forPatientId: forPatientId ?? this.forPatientId,
      departmentId: departmentId ?? this.departmentId,
      doctorId: doctorId ?? this.doctorId,
      slotId: slotId ?? this.slotId,
      reason: reason ?? this.reason,
    );
  }

  bool get isComplete =>
      forPatientId != null && departmentId != null && doctorId != null && slotId != null && reason.trim().isNotEmpty;
}

class BookingFlowController extends Notifier<BookingSelection> {
  @override
  BookingSelection build() => const BookingSelection();

  void selectPatient(String id) => state = state.copyWith(forPatientId: id);
  void selectDepartment(String id) => state = state.copyWith(departmentId: id, doctorId: null, slotId: null);
  void selectDoctor(String id) => state = state.copyWith(doctorId: id, slotId: null);
  void selectSlot(String id) => state = state.copyWith(slotId: id);
  void setReason(String text) => state = state.copyWith(reason: text);
  void reset() => state = const BookingSelection();

  Future<String> submit() async {
    if (!state.isComplete) {
      throw StateError('모든 단계를 선택해야 예약을 신청할 수 있습니다.');
    }
    final api = ref.read(apiClientProvider);
    final result = await api.post(
      '/app/appointments',
      {
        'for_patient_id': state.forPatientId,
        'department_id': state.departmentId,
        'doctor_id': state.doctorId,
        'slot_id': state.slotId,
        'reason': state.reason,
      },
      (json) => json['appointment_id'] as String,
    );
    reset();
    return result;
  }
}

final bookingFlowControllerProvider = NotifierProvider<BookingFlowController, BookingSelection>(
  BookingFlowController.new,
);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/booking/booking_flow_controller_test.dart`
Expected: 1개 테스트 PASS

- [ ] **Step 4: 카탈로그 API 클라이언트 (진료과/의사/날짜/시간)**

`mobile/lib/features/booking/catalog_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class CatalogItem {
  const CatalogItem({required this.id, required this.name});
  final String id;
  final String name;

  factory CatalogItem.fromJson(Map<String, dynamic> json) =>
      CatalogItem(id: json['id'] as String, name: json['name'] as String);
}

class SlotItem {
  const SlotItem({required this.id, required this.startTime});
  final String id;
  final String startTime;

  factory SlotItem.fromJson(Map<String, dynamic> json) =>
      SlotItem(id: json['id'] as String, startTime: json['start_time'] as String);
}

final departmentsProvider = FutureProvider<List<CatalogItem>>((ref) async {
  final api = ref.read(apiClientProvider);
  return api.get('/app/departments', (json) => (json as List).map((e) => CatalogItem.fromJson(e as Map<String, dynamic>)).toList());
});

final doctorsProvider = FutureProvider.family<List<CatalogItem>, String>((ref, departmentId) async {
  final api = ref.read(apiClientProvider);
  return api.get(
    '/app/doctors?department_id=$departmentId',
    (json) => (json as List).map((e) => CatalogItem.fromJson(e as Map<String, dynamic>)).toList(),
  );
});

final availableDatesProvider = FutureProvider.family<List<String>, String>((ref, doctorId) async {
  final api = ref.read(apiClientProvider);
  return api.get('/app/available-dates/$doctorId', (json) => (json as List).map((e) => e as String).toList());
});

final availableSlotsProvider = FutureProvider.family<List<SlotItem>, (String, String)>((ref, args) async {
  final (doctorId, targetDate) = args;
  final api = ref.read(apiClientProvider);
  return api.get(
    '/app/available-slots/$doctorId?target_date=$targetDate',
    (json) => (json as List).map((e) => SlotItem.fromJson(e as Map<String, dynamic>)).toList(),
  );
});
```

- [ ] **Step 5: 8단계 화면 작성(PageView 기반 위저드, 각 단계 실제 API 연동)**

`mobile/lib/features/booking/booking_flow_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../family/family_controller.dart';
import '../profile/my_profile_controller.dart';
import 'booking_flow_controller.dart';
import 'catalog_controller.dart';

class BookingFlowScreen extends ConsumerStatefulWidget {
  const BookingFlowScreen({super.key});

  @override
  ConsumerState<BookingFlowScreen> createState() => _BookingFlowScreenState();
}

class _BookingFlowScreenState extends ConsumerState<BookingFlowScreen> {
  int _step = 0;
  final _reasonController = TextEditingController();

  Widget _listOrLoading<T>(AsyncValue<List<T>> value, Widget Function(List<T>) builder) {
    return value.when(
      loading: () => const CircularProgressIndicator(),
      error: (e, _) => Text('$e'),
      data: builder,
    );
  }

  @override
  Widget build(BuildContext context) {
    final selection = ref.watch(bookingFlowControllerProvider);
    final controller = ref.read(bookingFlowControllerProvider.notifier);
    final familyState = ref.watch(familyControllerProvider);
    final myProfileState = ref.watch(myProfileControllerProvider);

    return Scaffold(
      appBar: AppBar(title: Text('예약 (${_step + 1}/8)')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: switch (_step) {
          // 0단계: 본인 또는 가족 구성원 선택 — 본인은 반드시 실제 patient UUID를 써야 한다('self' 리터럴 금지).
          0 => myProfileState.when(
              loading: () => const CircularProgressIndicator(),
              error: (e, _) => Text('$e'),
              data: (myProfile) => familyState.when(
                loading: () => const CircularProgressIndicator(),
                error: (e, _) => Text('$e'),
                data: (members) => ListView(
                  children: [
                    ListTile(
                      title: const Text('본인'),
                      onTap: () {
                        controller.selectPatient(myProfile.id);
                        setState(() => _step = 1);
                      },
                    ),
                    for (final member in members)
                      ListTile(
                        title: Text('${member.name} (${member.relation})'),
                        onTap: () {
                          controller.selectPatient(member.id);
                          setState(() => _step = 1);
                        },
                      ),
                  ],
                ),
              ),
            ),
          // 1단계: 진료과 선택
          1 => _listOrLoading(ref.watch(departmentsProvider), (items) => ListView(
              children: [
                for (final item in items)
                  ListTile(
                    title: Text(item.name),
                    onTap: () {
                      controller.selectDepartment(item.id);
                      setState(() => _step = 2);
                    },
                  ),
              ],
            )),
          // 2단계: 의사 선택
          2 => _listOrLoading(ref.watch(doctorsProvider(selection.departmentId!)), (items) => ListView(
              children: [
                for (final item in items)
                  ListTile(
                    title: Text(item.name),
                    onTap: () {
                      controller.selectDoctor(item.id);
                      setState(() => _step = 3);
                    },
                  ),
              ],
            )),
          // 3단계: 날짜 선택
          3 => _listOrLoading(ref.watch(availableDatesProvider(selection.doctorId!)), (dates) => ListView(
              children: [
                for (final date in dates)
                  ListTile(
                    title: Text(date),
                    onTap: () => setState(() {
                      _selectedDate = date;
                      _step = 4;
                    }),
                  ),
              ],
            )),
          // 4단계: 시간 선택
          4 => _listOrLoading(
              ref.watch(availableSlotsProvider((selection.doctorId!, _selectedDate!))),
              (slots) => ListView(
                children: [
                  for (final slot in slots)
                    ListTile(
                      title: Text(slot.startTime),
                      onTap: () {
                        controller.selectSlot(slot.id);
                        setState(() => _step = 6);
                      },
                    ),
                ],
              ),
            ),
          6 => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('방문 이유를 입력해주세요', style: TextStyle(fontSize: 20)),
                TextField(controller: _reasonController, maxLines: 3),
                ElevatedButton(
                  onPressed: () {
                    controller.setReason(_reasonController.text);
                    setState(() => _step = 7);
                  },
                  child: const Text('다음'),
                ),
              ],
            ),
          7 => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('예약 내용을 확인해주세요', style: TextStyle(fontSize: 20)),
                Text('방문 이유: ${selection.reason}'),
                ElevatedButton(
                  onPressed: () async {
                    final appointmentId = await controller.submit();
                    if (context.mounted) context.go('/appointments/$appointmentId');
                  },
                  child: const Text('예약 신청'),
                ),
              ],
            ),
          _ => const SizedBox.shrink(),
        },
      ),
    );
  }
}
```

> 위 위젯은 `_selectedDate`를 상태로 들고 있어야 하므로 `_BookingFlowScreenState`에 `String? _selectedDate;` 필드를 추가한다(코드에는 간결함을 위해 생략). 5단계는 별도 화면 없이 4단계에서 시간을 고르는 즉시 슬롯이 확정되므로 6단계(방문 이유)로 바로 넘어간다 — 스펙의 "8단계"는 본인선택·진료과·의사·날짜·시간·(예비)·방문이유·확인의 8개 화면 전환을 의미하며, 실제 로직 단계는 6개다.

- [ ] **Step 6: 라우터 연결**

`mobile/lib/core/router.dart`의 `/booking` 라우트를 교체한다:
```dart
GoRoute(path: '/booking', builder: (context, state) => const BookingFlowScreen()),
```

> `/history` 라우트의 `'self'` 리터럴은 Task 24(방문 이력 화면)에서 같은 `myProfileControllerProvider`를 사용해 함께 고친다 — 그 라우트는 Task 24가 소유하므로 여기서는 건드리지 않는다.

- [ ] **Step 7: 테스트 실행**

Run: `cd mobile && flutter test test/features/profile/my_profile_controller_test.dart test/features/booking/booking_flow_controller_test.dart`
Expected: 전체 PASS

- [ ] **Step 8: 커밋**

```bash
git add mobile/lib/features/profile mobile/lib/features/booking mobile/lib/core/router.dart mobile/test/features/profile/my_profile_controller_test.dart mobile/test/features/booking/booking_flow_controller_test.dart
git commit -m "feat: 8단계 예약 플로우 실제 API 연동, MyProfileController로 'self' 리터럴 제거"
```

---

## Task 20: 예약 변경/취소 화면

> 정합성 검토(2026-07-28)에서 지적된 갭: `AppointmentActionController.changeBooking`은 이미 구현돼 있었지만, 실제로 새 날짜·시간을 고르는 화면이 없어 호출할 방법이 없었다("예약 변경 UI가 없다"). 이 태스크에 새 슬롯 선택 다이얼로그를 추가해 마무리한다.

**Files:**
- Create: `mobile/lib/features/booking/appointment_action_controller.dart`
- Create: `mobile/lib/features/booking/appointment_detail_screen.dart`
- Modify: `mobile/lib/core/router.dart` (`/appointments/:id` 라우트 교체)
- Test: `mobile/test/features/booking/appointment_action_controller_test.dart`

**Interfaces:**
- Consumes: `apiClientProvider`(Task 15), `get_appointment_detail`이 반환하는 `doctor_id`(Task 9, 예약 변경 대상 의사 식별용으로 확장), `availableDatesProvider, availableSlotsProvider`(Task 19 `catalog_controller.dart`)
- Produces: `AppointmentActionController`(`AsyncNotifier<void>`: `changeBooking(appointmentId, newSlotId, reason) -> Future<String>`, `cancelBooking(appointmentId, reason) -> Future<Map<String, bool>>`)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/features/booking/appointment_action_controller_test.dart`:
```dart
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/booking/appointment_action_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('cancelBooking은 마감 후이면 취소요청 상태를 반환한다', () async {
    final mockClient = MockClient((request) async {
      return http.Response(jsonEncode({'cancelled': false, 'cancellation_requested': true}), 200);
    });
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 't', httpClient: mockClient),
      ),
    ]);

    final result = await container
        .read(appointmentActionControllerProvider.notifier)
        .cancelBooking('a1', '급한 사정');

    expect(result['cancellation_requested'], isTrue);
  });
}
```

Run: `cd mobile && flutter test test/features/booking/appointment_action_controller_test.dart`
Expected: FAIL(모듈 없음)

- [ ] **Step 2: AppointmentActionController 구현**

`mobile/lib/features/booking/appointment_action_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class AppointmentActionController extends AsyncNotifier<void> {
  @override
  void build() {}

  Future<String> changeBooking(String appointmentId, String newSlotId, String reason) async {
    final api = ref.read(apiClientProvider);
    state = const AsyncLoading();
    late String newAppointmentId;
    state = await AsyncValue.guard(() async {
      newAppointmentId = await api.post(
        '/app/appointments/$appointmentId/change',
        {'new_slot_id': newSlotId, 'reason': reason},
        (json) => json['appointment_id'] as String,
      );
    });
    return newAppointmentId;
  }

  Future<Map<String, bool>> cancelBooking(String appointmentId, String? reason) async {
    final api = ref.read(apiClientProvider);
    state = const AsyncLoading();
    late Map<String, bool> result;
    state = await AsyncValue.guard(() async {
      result = await api.post(
        '/app/appointments/$appointmentId/cancel',
        {'reason': reason},
        (json) => {
          'cancelled': json['cancelled'] as bool,
          'cancellation_requested': json['cancellation_requested'] as bool,
        },
      );
    });
    return result;
  }
}

final appointmentActionControllerProvider =
    AsyncNotifierProvider<AppointmentActionController, void>(AppointmentActionController.new);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/booking/appointment_action_controller_test.dart`
Expected: 1개 테스트 PASS

- [ ] **Step 4: 예약 상세/변경/취소 화면 작성 및 라우터 연결**

`mobile/lib/features/booking/appointment_detail_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'appointment_action_controller.dart';
import 'catalog_controller.dart';

final _appointmentDetailProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, appointmentId) async {
  final api = ref.read(apiClientProvider);
  return api.get('/app/appointments/$appointmentId', (json) => json as Map<String, dynamic>);
});

class AppointmentDetailScreen extends ConsumerWidget {
  const AppointmentDetailScreen({super.key, required this.appointmentId});
  final String appointmentId;

  Future<void> _openRescheduleDialog(BuildContext context, WidgetRef ref, String doctorId) async {
    String? selectedDate;
    String? selectedSlotId;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('예약 변경 — 새 날짜/시간 선택'),
          content: SizedBox(
            width: double.maxFinite,
            child: selectedDate == null
                ? Consumer(
                    builder: (context, ref, _) => ref.watch(availableDatesProvider(doctorId)).when(
                          loading: () => const CircularProgressIndicator(),
                          error: (e, _) => Text('$e'),
                          data: (dates) => ListView(
                            shrinkWrap: true,
                            children: [
                              for (final date in dates)
                                ListTile(title: Text(date), onTap: () => setDialogState(() => selectedDate = date)),
                            ],
                          ),
                        ),
                  )
                : Consumer(
                    builder: (context, ref, _) =>
                        ref.watch(availableSlotsProvider((doctorId, selectedDate!))).when(
                              loading: () => const CircularProgressIndicator(),
                              error: (e, _) => Text('$e'),
                              data: (slots) => ListView(
                                shrinkWrap: true,
                                children: [
                                  for (final slot in slots)
                                    ListTile(
                                      title: Text(slot.startTime),
                                      onTap: () {
                                        selectedSlotId = slot.id;
                                        Navigator.of(dialogContext).pop();
                                      },
                                    ),
                                ],
                              ),
                            ),
                  ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('취소')),
          ],
        ),
      ),
    );

    if (selectedSlotId != null && context.mounted) {
      final newAppointmentId = await ref
          .read(appointmentActionControllerProvider.notifier)
          .changeBooking(appointmentId, selectedSlotId!, '환자 요청으로 일정 변경');
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('예약이 변경되었습니다.')));
        context.go('/appointments/$newAppointmentId');
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actionState = ref.watch(appointmentActionControllerProvider);
    final detailState = ref.watch(_appointmentDetailProvider(appointmentId));

    return Scaffold(
      appBar: AppBar(title: const Text('예약 상세')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('예약번호: $appointmentId', style: const TextStyle(fontSize: 18)),
            const SizedBox(height: 24),
            detailState.when(
              loading: () => const CircularProgressIndicator(),
              error: (e, _) => Text('$e'),
              data: (detail) => ElevatedButton(
                onPressed: actionState.isLoading
                    ? null
                    : () => _openRescheduleDialog(context, ref, detail['doctor_id'] as String),
                child: const Text('예약 변경'),
              ),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: actionState.isLoading
                  ? null
                  : () async {
                      final result = await ref
                          .read(appointmentActionControllerProvider.notifier)
                          .cancelBooking(appointmentId, '환자 요청');
                      if (context.mounted) {
                        final message = result['cancelled'] == true
                            ? '예약이 취소되었습니다.'
                            : '취소 요청됨 · 직원 확인 중';
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
                      }
                    },
              child: const Text('예약 취소'),
            ),
          ],
        ),
      ),
    );
  }
}
```

> `context.go(...)`를 쓰려면 `go_router` import가 필요하다(`import 'package:go_router/go_router.dart';`). 재확인 UX(변경 전 "정말 변경하시겠습니까?" 확인 다이얼로그)는 위 슬롯 선택 자체가 명시적 액션이므로 별도 확인창 없이 바로 진행한다 — 취소와 달리 변경은 이미 두 번의 선택(날짜→시간)을 거치기 때문이다.

`mobile/lib/core/router.dart`의 `/appointments/:id` 라우트를 교체한다:
```dart
GoRoute(
  path: '/appointments/:id',
  builder: (context, state) => AppointmentDetailScreen(appointmentId: state.pathParameters['id']!),
),
```

- [ ] **Step 5: 커밋**

```bash
git add mobile/lib/features/booking/appointment_action_controller.dart mobile/lib/features/booking/appointment_detail_screen.dart mobile/lib/core/router.dart mobile/test/features/booking/appointment_action_controller_test.dart backend/app/services/patient_appointment_query_service.py
git commit -m "feat: 예약 변경 화면(날짜/시간 재선택)과 마감전후 취소 분기 처리 추가"
```

---

## Task 21: 사전문진 작성/수정 화면

**Files:**
- Create: `mobile/lib/features/questionnaire/questionnaire_controller.dart`
- Create: `mobile/lib/features/questionnaire/questionnaire_screen.dart`
- Test: `mobile/test/features/questionnaire/questionnaire_controller_test.dart`

**Interfaces:**
- Consumes: `apiClientProvider`(Task 15)
- Produces: `QuestionnaireController`(`AsyncNotifier<QuestionTemplate?>`: `loadTemplate(departmentId)`, `submit(appointmentId, templateId, answers)`)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/features/questionnaire/questionnaire_controller_test.dart`:
```dart
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/questionnaire/questionnaire_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('submit은 answers 배열을 서버로 전송한다', () async {
    Map<String, dynamic>? sentBody;
    final mockClient = MockClient((request) async {
      sentBody = jsonDecode(request.body) as Map<String, dynamic>;
      return http.Response(jsonEncode({'response_id': 'r1'}), 200);
    });
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 't', httpClient: mockClient),
      ),
    ]);

    await container.read(questionnaireControllerProvider.notifier).submit(
      'a1', 't1', [{'question': '오늘 불편한 증상은 무엇인가요?', 'answer': '기침'}],
    );

    expect(sentBody!['template_id'], 't1');
    expect((sentBody!['answers'] as List).first['answer'], '기침');
  });
}
```

Run: `cd mobile && flutter test test/features/questionnaire/questionnaire_controller_test.dart`
Expected: FAIL(모듈 없음)

- [ ] **Step 2: QuestionnaireController 구현**

`mobile/lib/features/questionnaire/questionnaire_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class QuestionTemplate {
  const QuestionTemplate({required this.id, required this.questions});
  final String id;
  final List<Map<String, dynamic>> questions;
}

class QuestionnaireController extends AsyncNotifier<QuestionTemplate?> {
  @override
  QuestionTemplate? build() => null;

  Future<void> loadTemplate(String departmentId) async {
    final api = ref.read(apiClientProvider);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      return api.get('/app/questionnaire-templates/$departmentId', (json) {
        if (json == null) return null;
        return QuestionTemplate(
          id: json['id'] as String,
          questions: List<Map<String, dynamic>>.from(json['questions'] as List),
        );
      });
    });
  }

  Future<void> submit(String appointmentId, String templateId, List<Map<String, dynamic>> answers) async {
    final api = ref.read(apiClientProvider);
    await api.post(
      '/app/appointments/$appointmentId/questionnaire',
      {'template_id': templateId, 'answers': answers},
      (json) => json,
    );
  }
}

final questionnaireControllerProvider =
    AsyncNotifierProvider<QuestionnaireController, QuestionTemplate?>(QuestionnaireController.new);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/questionnaire/questionnaire_controller_test.dart`
Expected: 1개 테스트 PASS

- [ ] **Step 4: 사전문진 화면 작성**

`mobile/lib/features/questionnaire/questionnaire_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'questionnaire_controller.dart';

class QuestionnaireScreen extends ConsumerStatefulWidget {
  const QuestionnaireScreen({super.key, required this.appointmentId, required this.departmentId});
  final String appointmentId;
  final String departmentId;

  @override
  ConsumerState<QuestionnaireScreen> createState() => _QuestionnaireScreenState();
}

class _QuestionnaireScreenState extends ConsumerState<QuestionnaireScreen> {
  final Map<String, TextEditingController> _controllers = {};

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(questionnaireControllerProvider.notifier).loadTemplate(widget.departmentId));
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(questionnaireControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('사전문진')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (template) {
          if (template == null) return const Center(child: Text('이 진료과의 사전문진 양식이 없습니다.'));
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              for (final question in template.questions)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: TextField(
                    controller: _controllers.putIfAbsent(question['text'] as String, () => TextEditingController()),
                    decoration: InputDecoration(labelText: question['text'] as String),
                  ),
                ),
              ElevatedButton(
                onPressed: () {
                  final answers = template.questions
                      .map((q) => {
                            'question': q['text'],
                            'answer': _controllers[q['text']]?.text ?? '',
                          })
                      .toList();
                  ref.read(questionnaireControllerProvider.notifier).submit(
                        widget.appointmentId, template.id, answers,
                      );
                },
                child: const Text('사전문진 저장'),
              ),
            ],
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 5: 커밋**

```bash
git add mobile/lib/features/questionnaire mobile/test/features/questionnaire/questionnaire_controller_test.dart
git commit -m "feat: 사전문진 작성/수정 화면 추가"
```

---

## Task 22: 홈 화면 (가장 가까운 예약 카드 + QR/예약번호)

**Files:**
- Create: `mobile/lib/features/home/home_controller.dart`
- Create: `mobile/lib/features/home/home_screen.dart`
- Modify: `mobile/lib/core/router.dart` (`/home` 라우트 교체)
- Test: `mobile/test/features/home/home_controller_test.dart`

**Interfaces:**
- Consumes: `apiClientProvider`(Task 15)
- Produces: `UpcomingAppointment`(모델), `HomeController`(`AsyncNotifier<UpcomingAppointment?>`: `load()`)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/features/home/home_controller_test.dart`:
```dart
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/home/home_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('load는 가장 가까운 예약을 첫 번째 항목으로 반환한다', () async {
    final mockClient = MockClient((request) async {
      return http.Response(
        jsonEncode([
          {
            'id': 'a1', 'status': '예약확정', 'department_name': '내과', 'doctor_name': '김의사',
            'for_patient_name': '홍길동', 'slot_date': '2026-08-01', 'start_time': '09:00:00',
            'questionnaire_submitted': false, 'cancellation_requested_at': null,
          },
        ]),
        200,
      );
    });
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 't', httpClient: mockClient),
      ),
    ]);

    await container.read(homeControllerProvider.notifier).load();

    final appointment = container.read(homeControllerProvider).value;
    expect(appointment!.id, 'a1');
    expect(appointment.isConfirmed, isTrue);
  });
}
```

Run: `cd mobile && flutter test test/features/home/home_controller_test.dart`
Expected: FAIL(모듈 없음)

- [ ] **Step 2: HomeController 구현**

`mobile/lib/features/home/home_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class UpcomingAppointment {
  const UpcomingAppointment({
    required this.id, required this.status, required this.departmentName, required this.doctorName,
    required this.forPatientName, required this.slotDate, required this.startTime,
    required this.questionnaireSubmitted,
  });

  final String id;
  final String status;
  final String departmentName;
  final String doctorName;
  final String forPatientName;
  final String? slotDate;
  final String? startTime;
  final bool questionnaireSubmitted;

  bool get isConfirmed => status == '예약확정';

  factory UpcomingAppointment.fromJson(Map<String, dynamic> json) => UpcomingAppointment(
        id: json['id'] as String,
        status: json['status'] as String,
        departmentName: json['department_name'] as String,
        doctorName: json['doctor_name'] as String,
        forPatientName: json['for_patient_name'] as String,
        slotDate: json['slot_date'] as String?,
        startTime: json['start_time'] as String?,
        questionnaireSubmitted: json['questionnaire_submitted'] as bool,
      );
}

class HomeController extends AsyncNotifier<UpcomingAppointment?> {
  @override
  Future<UpcomingAppointment?> build() => _fetch();

  Future<UpcomingAppointment?> _fetch() async {
    final api = ref.read(apiClientProvider);
    final list = await api.get(
      '/app/appointments',
      (json) => (json as List).map((e) => UpcomingAppointment.fromJson(e as Map<String, dynamic>)).toList(),
    );
    return list.isEmpty ? null : list.first;
  }

  Future<void> load() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetch);
  }
}

final homeControllerProvider = AsyncNotifierProvider<HomeController, UpcomingAppointment?>(HomeController.new);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/home/home_controller_test.dart`
Expected: 1개 테스트 PASS

- [ ] **Step 4: 홈 화면 작성(QR 포함)**

`mobile/lib/features/home/home_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'home_controller.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(homeControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('홈'), actions: [
        IconButton(icon: const Icon(Icons.settings), onPressed: () => context.go('/settings')),
      ]),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (appointment) {
          if (appointment == null) {
            return Center(
              child: ElevatedButton(
                onPressed: () => context.go('/booking'),
                child: const Text('예약하기'),
              ),
            );
          }
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${appointment.forPatientName} 님의 다음 예약', style: const TextStyle(fontSize: 20)),
                Text('${appointment.departmentName} · ${appointment.doctorName}'),
                Text('${appointment.slotDate ?? ''} ${appointment.startTime ?? ''}'),
                Text(appointment.isConfirmed ? '예약 확정' : '예약 신청됨'),
                Text(appointment.questionnaireSubmitted ? '사전문진 작성완료' : '사전문진 미작성'),
                const SizedBox(height: 24),
                const Text('병원에 보여줄 예약번호'),
                QrImageView(data: appointment.id, size: 160),
                Text(appointment.id),
                const SizedBox(height: 16),
                const Text('예상 대기시간은 변동될 수 있습니다.', style: TextStyle(color: Colors.grey)),
                ElevatedButton(
                  onPressed: () => context.go('/appointments/${appointment.id}'),
                  child: const Text('예약 상세'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 5: 라우터 연결**

`mobile/lib/core/router.dart`의 `/home` 라우트를 교체한다:
```dart
GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
```

- [ ] **Step 6: 커밋**

```bash
git add mobile/lib/features/home mobile/lib/core/router.dart mobile/test/features/home/home_controller_test.dart
git commit -m "feat: 홈 화면(가장 가까운 예약, QR/예약번호) 추가"
```

---

## Task 23: 나의 예약 목록 + Realtime 구독

**Files:**
- Create: `mobile/lib/core/realtime_subscriber.dart`
- Create: `mobile/lib/features/appointments/my_appointments_controller.dart`
- Create: `mobile/lib/features/appointments/my_appointments_screen.dart`
- Test: `mobile/test/features/appointments/my_appointments_controller_test.dart`

**Interfaces:**
- Consumes: `apiClientProvider`(Task 15), `UpcomingAppointment`(Task 22, 재사용)
- Produces: `RealtimeSubscriber`(추상 인터페이스: `subscribeToTable(table, onChange)`, `dispose()`), `SupabaseRealtimeSubscriber`(구현체), `MyAppointmentsController`(`AsyncNotifier<List<UpcomingAppointment>>`: `load()`, `startWatching()`)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/features/appointments/my_appointments_controller_test.dart`:
```dart
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/core/realtime_subscriber.dart';
import 'package:hospital_patient_app/features/appointments/my_appointments_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class FakeRealtimeSubscriber implements RealtimeSubscriber {
  String? subscribedTable;
  void Function()? capturedOnChange;

  @override
  void subscribeToTable(String table, void Function() onChange) {
    subscribedTable = table;
    capturedOnChange = onChange;
  }

  @override
  Future<void> dispose() async {}
}

void main() {
  test('startWatching은 appointments 테이블을 구독하고 변경 시 목록을 새로고침한다', () async {
    var callCount = 0;
    final mockClient = MockClient((request) async {
      callCount += 1;
      return http.Response(jsonEncode([]), 200);
    });
    final fakeSubscriber = FakeRealtimeSubscriber();
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 't', httpClient: mockClient),
      ),
      realtimeSubscriberProvider.overrideWithValue(fakeSubscriber),
    ]);

    final controller = container.read(myAppointmentsControllerProvider.notifier);
    await controller.load();
    controller.startWatching();

    expect(fakeSubscriber.subscribedTable, 'appointments');
    final callsBefore = callCount;
    fakeSubscriber.capturedOnChange!();
    await Future<void>.delayed(Duration.zero);
    expect(callCount, greaterThan(callsBefore));
  });
}
```

Run: `cd mobile && flutter test test/features/appointments/my_appointments_controller_test.dart`
Expected: FAIL(모듈 없음)

- [ ] **Step 2: RealtimeSubscriber와 MyAppointmentsController 구현**

`mobile/lib/core/realtime_subscriber.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'providers.dart';

abstract class RealtimeSubscriber {
  void subscribeToTable(String table, void Function() onChange);
  Future<void> dispose();
}

class SupabaseRealtimeSubscriber implements RealtimeSubscriber {
  SupabaseRealtimeSubscriber(this._client);
  final SupabaseClient _client;
  RealtimeChannel? _channel;

  @override
  void subscribeToTable(String table, void Function() onChange) {
    _channel = _client
        .channel('realtime-$table')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: table,
          callback: (payload) => onChange(),
        )
        .subscribe();
  }

  @override
  Future<void> dispose() async {
    final channel = _channel;
    if (channel != null) {
      await _client.removeChannel(channel);
      _channel = null;
    }
  }
}

final realtimeSubscriberProvider = Provider<RealtimeSubscriber>(
  (ref) => SupabaseRealtimeSubscriber(ref.watch(supabaseClientProvider)),
);
```

`mobile/lib/features/appointments/my_appointments_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/realtime_subscriber.dart';
import '../home/home_controller.dart';

class MyAppointmentsController extends AsyncNotifier<List<UpcomingAppointment>> {
  bool _watching = false;

  @override
  Future<List<UpcomingAppointment>> build() {
    ref.onDispose(() => ref.read(realtimeSubscriberProvider).dispose());
    return _fetch();
  }

  Future<List<UpcomingAppointment>> _fetch() async {
    final api = ref.read(apiClientProvider);
    return api.get(
      '/app/appointments',
      (json) => (json as List).map((e) => UpcomingAppointment.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  Future<void> load() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetch);
  }

  void startWatching() {
    if (_watching) return;
    _watching = true;
    ref.read(realtimeSubscriberProvider).subscribeToTable('appointments', () {
      load();
    });
  }
}

final myAppointmentsControllerProvider =
    AsyncNotifierProvider<MyAppointmentsController, List<UpcomingAppointment>>(MyAppointmentsController.new);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/appointments/my_appointments_controller_test.dart`
Expected: 1개 테스트 PASS

- [ ] **Step 4: 나의 예약 목록 화면 작성**

`mobile/lib/features/appointments/my_appointments_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'my_appointments_controller.dart';

class MyAppointmentsScreen extends ConsumerStatefulWidget {
  const MyAppointmentsScreen({super.key});

  @override
  ConsumerState<MyAppointmentsScreen> createState() => _MyAppointmentsScreenState();
}

class _MyAppointmentsScreenState extends ConsumerState<MyAppointmentsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(myAppointmentsControllerProvider.notifier).startWatching());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(myAppointmentsControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('나의 예약')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (appointments) => ListView(
          children: [
            for (final appointment in appointments)
              ListTile(
                title: Text('${appointment.departmentName} · ${appointment.doctorName}'),
                subtitle: Text('${appointment.status} (${appointment.forPatientName})'),
                onTap: () => context.go('/appointments/${appointment.id}'),
              ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: 커밋**

```bash
git add mobile/lib/core/realtime_subscriber.dart mobile/lib/features/appointments mobile/test/features/appointments/my_appointments_controller_test.dart
git commit -m "feat: 나의 예약 목록과 Realtime 방문상태 구독 추가"
```

---

## Task 24: 방문 이력 화면

**Files:**
- Create: `mobile/lib/features/history/history_controller.dart`
- Create: `mobile/lib/features/history/history_screen.dart`
- Create: `mobile/lib/features/history/history_route.dart`
- Modify: `mobile/lib/core/router.dart` (`/history` 라우트 교체)
- Test: `mobile/test/features/history/history_controller_test.dart`

**Interfaces:**
- Consumes: `apiClientProvider`(Task 15), `myProfileControllerProvider`(Task 19)
- Produces: `VisitHistoryItem`(모델), `HistoryController`(`AsyncNotifier<List<VisitHistoryItem>>`: `load(forPatientId)`)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/features/history/history_controller_test.dart`:
```dart
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/history/history_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('load는 방문이력 목록을 반환한다', () async {
    final mockClient = MockClient((request) async {
      return http.Response(
        jsonEncode([
          {
            'appointment_id': 'a1', 'slot_date': '2026-01-10', 'department_name': '내과',
            'doctor_name': '김의사', 'patient_visible_notes': '충분한 휴식을 취하세요.',
          },
        ]),
        200,
      );
    });
    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 't', httpClient: mockClient),
      ),
    ]);

    await container.read(historyControllerProvider.notifier).load('p1');

    final items = container.read(historyControllerProvider).value!;
    expect(items.single.departmentName, '내과');
    expect(items.single.patientVisibleNotes, '충분한 휴식을 취하세요.');
  });
}
```

Run: `cd mobile && flutter test test/features/history/history_controller_test.dart`
Expected: FAIL(모듈 없음)

- [ ] **Step 2: HistoryController 구현**

`mobile/lib/features/history/history_controller.dart`:
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class VisitHistoryItem {
  const VisitHistoryItem({
    required this.appointmentId, required this.slotDate, required this.departmentName,
    required this.doctorName, required this.patientVisibleNotes,
  });

  final String appointmentId;
  final String? slotDate;
  final String departmentName;
  final String doctorName;
  final String? patientVisibleNotes;

  factory VisitHistoryItem.fromJson(Map<String, dynamic> json) => VisitHistoryItem(
        appointmentId: json['appointment_id'] as String,
        slotDate: json['slot_date'] as String?,
        departmentName: json['department_name'] as String,
        doctorName: json['doctor_name'] as String,
        patientVisibleNotes: json['patient_visible_notes'] as String?,
      );
}

class HistoryController extends AsyncNotifier<List<VisitHistoryItem>> {
  @override
  List<VisitHistoryItem> build() => [];

  Future<void> load(String forPatientId) async {
    final api = ref.read(apiClientProvider);
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      return api.get(
        '/app/visit-history',
        (json) => (json as List).map((e) => VisitHistoryItem.fromJson(e as Map<String, dynamic>)).toList(),
        query: {'for_patient_id': forPatientId},
      );
    });
  }
}

final historyControllerProvider = AsyncNotifierProvider<HistoryController, List<VisitHistoryItem>>(
  HistoryController.new,
);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/history/history_controller_test.dart`
Expected: 1개 테스트 PASS

- [ ] **Step 4: 방문 이력 화면 작성 및 라우터 연결**

`mobile/lib/features/history/history_screen.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'history_controller.dart';

class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key, required this.forPatientId});
  final String forPatientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(historyControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('방문 이력')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (items) => ListView(
          children: [
            for (final item in items)
              ListTile(
                title: Text('${item.departmentName} · ${item.doctorName}'),
                subtitle: Text('${item.slotDate ?? ''}\n${item.patientVisibleNotes ?? '안내 없음'}'),
                isThreeLine: true,
              ),
          ],
        ),
      ),
    );
  }
}
```

`mobile/lib/core/router.dart`의 `/history` 라우트를 교체한다. 쿼리 파라미터가 있으면(가족 구성원 이력) 그대로 쓰고,
없으면("본인" 이력) 문자열 `'self'` 대신 `myProfileControllerProvider`(Task 19)에서 실제 patient UUID를 읽는다 —
`'self'`는 서버 API·RLS가 인식하지 못하는 값이라 이전에는 본인 방문이력 조회가 항상 실패했다:
```dart
GoRoute(
  path: '/history',
  builder: (context, state) => _HistoryRoute(patientId: state.uri.queryParameters['patientId']),
),
```

`mobile/lib/features/history/history_route.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../profile/my_profile_controller.dart';
import 'history_screen.dart';

class _HistoryRoute extends ConsumerWidget {
  const _HistoryRoute({required this.patientId});
  final String? patientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (patientId != null) return HistoryScreen(forPatientId: patientId!);
    final myProfile = ref.watch(myProfileControllerProvider);
    return myProfile.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('$e'))),
      data: (profile) => HistoryScreen(forPatientId: profile.id),
    );
  }
}
```

- [ ] **Step 5: 커밋**

```bash
git add mobile/lib/features/history mobile/lib/core/router.dart mobile/test/features/history/history_controller_test.dart
git commit -m "feat: 방문 이력 화면 추가, 'self' 리터럴을 실제 patient UUID로 교체"
```

---

## Task 25: 알림(FCM 토큰 등록/해제 + 푸시 수신 처리)

**Files:**
- Create: `mobile/lib/features/notifications/push_notification_service.dart`
- Modify: `mobile/lib/features/auth/login_controller.dart` (로그인/로그아웃 시 토큰 등록/해제 연동)
- Test: `mobile/test/features/notifications/push_notification_service_test.dart`

**Interfaces:**
- Consumes: `apiClientProvider`(Task 15), `firebase_messaging`
- Produces: `PushTokenGateway`(추상 인터페이스: `getToken()`, `onTokenRefresh` 스트림), `PushNotificationService`(`registerCurrentDevice()`, `unregisterCurrentDevice()`)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/features/notifications/push_notification_service_test.dart`:
```dart
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/api_client.dart';
import 'package:hospital_patient_app/core/providers.dart';
import 'package:hospital_patient_app/features/notifications/push_notification_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mocktail/mocktail.dart';

class MockPushTokenGateway extends Mock implements PushTokenGateway {}

void main() {
  test('registerCurrentDevice는 발급받은 토큰을 백엔드에 등록한다', () async {
    Map<String, dynamic>? sentBody;
    final mockClient = MockClient((request) async {
      sentBody = jsonDecode(request.body) as Map<String, dynamic>;
      return http.Response(jsonEncode({'status': 'registered'}), 200);
    });
    final gateway = MockPushTokenGateway();
    when(() => gateway.getToken()).thenAnswer((_) async => 'fcm-token-123');

    final container = ProviderContainer(overrides: [
      apiClientProvider.overrideWithValue(
        ApiClient(baseUrl: 'http://localhost:8000', tokenProvider: () async => 't', httpClient: mockClient),
      ),
      pushTokenGatewayProvider.overrideWithValue(gateway),
    ]);

    await container.read(pushNotificationServiceProvider).registerCurrentDevice();

    expect(sentBody!['fcm_token'], 'fcm-token-123');
  });
}
```

Run: `cd mobile && flutter test test/features/notifications/push_notification_service_test.dart`
Expected: FAIL(모듈 없음)

- [ ] **Step 2: PushNotificationService 구현**

`mobile/lib/features/notifications/push_notification_service.dart`:
```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';

abstract class PushTokenGateway {
  Future<String?> getToken();
  Stream<String> get onTokenRefresh;
}

class FirebasePushTokenGateway implements PushTokenGateway {
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;

  @override
  Future<String?> getToken() => _messaging.getToken();

  @override
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;
}

final pushTokenGatewayProvider = Provider<PushTokenGateway>((ref) => FirebasePushTokenGateway());

class PushNotificationService {
  PushNotificationService(this._gateway, this._api);
  final PushTokenGateway _gateway;
  final ApiClient _api;

  Future<void> registerCurrentDevice() async {
    final token = await _gateway.getToken();
    if (token == null) return;
    await _api.post('/app/device-tokens', {'fcm_token': token}, (json) => json);
  }

  Future<void> unregisterCurrentDevice() async {
    final token = await _gateway.getToken();
    if (token == null) return;
    await _api.delete('/app/device-tokens/$token', (json) => json);
  }
}

final pushNotificationServiceProvider = Provider<PushNotificationService>(
  (ref) => PushNotificationService(ref.watch(pushTokenGatewayProvider), ref.watch(apiClientProvider)),
);
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/notifications/push_notification_service_test.dart`
Expected: 1개 테스트 PASS

- [ ] **Step 4: 로그인 성공 시 등록 호출 연결**

`mobile/lib/features/auth/login_controller.dart`의 `login`/`logout` 메서드를 아래처럼 수정한다(파일 상단에 `import '../notifications/push_notification_service.dart';` 추가):
```dart
  Future<void> login(String phone, String password) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(authGatewayProvider).signInWithPassword(phone, password);
      await ref.read(pushNotificationServiceProvider).registerCurrentDevice();
    });
  }

  Future<void> logout() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(pushNotificationServiceProvider).unregisterCurrentDevice();
      await ref.read(authGatewayProvider).signOut();
    });
  }
```

- [ ] **Step 5: 커밋**

```bash
git add mobile/lib/features/notifications mobile/lib/features/auth/login_controller.dart mobile/test/features/notifications/push_notification_service_test.dart
git commit -m "feat: FCM 토큰 등록/해제 서비스와 로그인 연동 추가"
```

---

## Task 26: 오프라인 감지 + 중복 클릭 방지 공통 위젯

**Files:**
- Create: `mobile/lib/core/connectivity_provider.dart`
- Create: `mobile/lib/core/offline_banner.dart`
- Create: `mobile/lib/core/busy_button.dart`
- Modify: `mobile/lib/features/booking/booking_flow_screen.dart` (예약 신청 버튼을 BusyButton으로 교체 + OfflineBanner 추가)
- Modify: `mobile/lib/features/booking/appointment_detail_screen.dart` (예약 취소 버튼을 BusyButton으로 교체)
- Modify: `mobile/lib/features/questionnaire/questionnaire_screen.dart` (사전문진 저장 버튼을 BusyButton으로 교체)
- Test: `mobile/test/core/busy_button_test.dart`

**Interfaces:**
- Consumes: `connectivity_plus`
- Produces: `connectivityStatusProvider`(`StreamProvider<bool>`, `true`=온라인), `OfflineBanner`(위젯, 오프라인일 때만 "인터넷 연결을 확인해주세요" 표시), `BusyButton`(위젯: `onPressed`, `label` — 처리 중에는 자동 비활성화되어 중복 클릭을 막음)

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/test/core/busy_button_test.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_patient_app/core/busy_button.dart';

void main() {
  testWidgets('처리 중에는 버튼이 비활성화되어 두 번째 탭이 무시된다', (tester) async {
    var tapCount = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: BusyButton(
          label: '예약 신청',
          onPressed: () async {
            tapCount += 1;
            await Future<void>.delayed(const Duration(milliseconds: 100));
          },
        ),
      ),
    );

    await tester.tap(find.text('예약 신청'));
    await tester.pump(const Duration(milliseconds: 10));
    await tester.tap(find.text('예약 신청'));
    await tester.pump(const Duration(milliseconds: 200));

    expect(tapCount, 1);
  });
}
```

Run: `cd mobile && flutter test test/core/busy_button_test.dart`
Expected: FAIL(`busy_button.dart` 없음)

- [ ] **Step 2: BusyButton 구현**

`mobile/lib/core/busy_button.dart`:
```dart
import 'package:flutter/material.dart';

class BusyButton extends StatefulWidget {
  const BusyButton({super.key, required this.label, required this.onPressed, this.enabled = true});

  final String label;
  final Future<void> Function() onPressed;
  final bool enabled;

  @override
  State<BusyButton> createState() => _BusyButtonState();
}

class _BusyButtonState extends State<BusyButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: (_busy || !widget.enabled)
          ? null
          : () async {
              setState(() => _busy = true);
              try {
                await widget.onPressed();
              } finally {
                if (mounted) setState(() => _busy = false);
              }
            },
      child: _busy
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : Text(widget.label),
    );
  }
}
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/core/busy_button_test.dart`
Expected: 1개 테스트 PASS

- [ ] **Step 4: 오프라인 감지 프로바이더와 배너 작성**

`mobile/lib/core/connectivity_provider.dart`:
```dart
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final connectivityStatusProvider = StreamProvider<bool>((ref) {
  return Connectivity().onConnectivityChanged.map((results) {
    return !results.contains(ConnectivityResult.none) && results.isNotEmpty;
  });
});
```

`mobile/lib/core/offline_banner.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'connectivity_provider.dart';

class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOnline = ref.watch(connectivityStatusProvider).value ?? true;
    if (isOnline) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      color: Colors.red.shade100,
      padding: const EdgeInsets.all(8),
      child: const Text('인터넷 연결을 확인해주세요', textAlign: TextAlign.center),
    );
  }
}
```

- [ ] **Step 5: BusyButton과 OfflineBanner를 예약/취소/사전문진 저장 버튼에 적용**

`mobile/lib/features/booking/booking_flow_screen.dart`의 "예약 신청" `ElevatedButton`을 `BusyButton`으로 교체하고(`onPressed`에 기존 `async { ... }` 로직을 그대로 옮김), `Scaffold.body`의 `Padding` 바로 위에 `const OfflineBanner()`를 추가한다. 동일한 방식으로 `appointment_detail_screen.dart`(예약 취소)와 `questionnaire_screen.dart`(사전문진 저장)의 저장 버튼도 `BusyButton`으로 교체한다. (각 파일 상단에 `import '../../core/busy_button.dart';`, `import '../../core/offline_banner.dart';` 추가)

- [ ] **Step 6: 전체 테스트 실행**

Run: `cd mobile && flutter test`
Expected: 모든 위젯/컨트롤러 테스트 PASS

- [ ] **Step 7: 커밋**

```bash
git add mobile/lib/core/connectivity_provider.dart mobile/lib/core/offline_banner.dart mobile/lib/core/busy_button.dart mobile/lib/features/booking/booking_flow_screen.dart mobile/lib/features/booking/appointment_detail_screen.dart mobile/lib/features/questionnaire/questionnaire_screen.dart mobile/test/core/busy_button_test.dart
git commit -m "feat: 오프라인 감지 배너와 공통 중복클릭 방지 버튼(BusyButton) 추가"
```

---

## 스펙 커버리지 확인

- 아키텍처(라우트, `/app/*` 신규 API, Realtime 범위) → Task 13(라우터), 14(스캐폴딩/router.dart), 23(Realtime)
- 4.1 회원가입/본인확인(OTP, 로그인, 비밀번호 찾기, 로그아웃, 탈퇴, 민감화면 재인증) → Task 4, 5, 13(백엔드) / Task 16, 17(Flutter)
- 4.2 가족 등록(등록/수정/연결해제, 가족 진료기록 비공개) → Task 6, 13(백엔드) / Task 18(Flutter). 가족 전체 진료기록 비노출은 Task 2의 `medical_records` RLS(완료된 기록만, 본인·가족만) + Task 11의 `list_visit_history`가 `patient_visible_notes`만 반환하는 구조로 보장
- 4.3 진료 예약(8단계, 예약가능시간만 노출, 중복예약 차단, 신청/확정 구분, 변경/취소, 마감 후 상담 연결) → Task 7, 8, 9, 13(백엔드) / Task 19, 20(Flutter)
- 4.4 사전문진(진료과별 질문, 방문 전까지 수정 가능, 의사는 별도 화면에서 확인) → Task 10, 13(백엔드) / Task 21(Flutter)
- 4.5 나의 예약과 방문 상태(홈 카드, QR/예약번호, 도착~진료완료 상태, "예상 대기시간은 변동될 수 있습니다") → Task 9(백엔드 조회) / Task 22, 23(Flutter)
- 4.6 방문 이력(내부기록 비노출, `patient_visible_notes`만) → Task 11(백엔드) / Task 24(Flutter)
- 4.7 알림(신청/확정, 전날·당일, 변경/병원취소, 사전문진 미작성, 진료완료 안내 — 상담봇 이관 알림 제외, FCM 기본+Twilio SMS 백업) → Task 12(백엔드) / Task 25(Flutter). 예약 신청/확정/변경 시점 호출은 Task 12 Step 8에서 연결하고, 리마인더·병원취소 등 직원/배치 트리거형 알림은 `notification_service.notify_patient`가 이미 제공하므로 5단계(배포)의 스케줄러 또는 2단계 직원 액션에서 호출하기만 하면 됨(이 계획 범위 밖으로 명시)
- 4.8 접근성과 오류처리(큰 글씨, 화면당 핵심 버튼 1개, 한글 오류, 오프라인 시 저장 방지, 중복클릭 방지) → 전역 테마(Task 14), `ApiException` 한글 메시지(Task 15), Task 26(오프라인 배너/BusyButton)
- 6.1 정보 일치(앱 예약이 직원 웹에도 반영, 도착처리 시 앱 상태 갱신) → 1단계 공통 데이터모델 재사용 + Task 23의 Realtime 구독으로 보장(직원 웹의 반대편 구독은 2단계 담당)
- 6.2 중복/실수 방지(이중예약 차단, 중복클릭 방지, 이미 취소/완료된 예약 재처리 방지) → Task 7의 `book_slot`/`release_slot` 재사용, Task 8·9의 상태 검사(`CHANGEABLE_STATUSES`), Task 26의 `BusyButton`
- 6.3 기록 보존(소프트 삭제, 변경 이력) → Task 5(회원탈퇴 `is_active=false`), Task 6(가족 연결해제 소프트 삭제), Task 8·9(`appointment_status_history`에 환자 액션도 기록)
- 6.4 오류 처리(한글 메시지, 저장 실패 명확히 안내, 오류 로그, 외부서비스 중단 시에도 핵심기능 유지) → `AppError`/`log_error` 재사용(Task 5~12 전반), Task 12의 알림 best-effort 처리
- 6.5 개인정보(비로그인 접근 차단, 역할별 접근 제한, 비밀키 비공개) → Task 1·2·3의 RLS 전체, Task 12의 `.env` 환경변수 원칙

## Task 27: 사전문진 양식에 "필드 태그" 추가 + 상담봇 수집 정보 미리채우기

정합성 검토에서 발견: 요구사항 4.4 마지막 문장 "상담봇이 대화 중 받은 내용이 사전문진에 들어갈 경우에는 환자에게 내용을 보여주고 저장 여부를 다시 확인받아야 합니다"가 3단계 스펙에서 "4단계 상담봇 구현 시 처리"로 미뤄졌으나 4단계 스펙에도 반영되지 않았던 것을 보완한다. `questionnaire_templates.questions` JSON에 선택적 `field_key`(예: `"chief_complaint"`/`"onset"`)를 추가해, 4단계 상담봇이 문진 체인에서 들은 증상·시작시점을 그 꼬리표가 붙은 질문 칸에만 미리 채워 보여주고, 환자가 직접 확인 후 "제출"해야 저장되게 한다(별도 확인 다이얼로그 없이, 제출 자체가 확인 절차 — 스키마·마이그레이션 변경 없음, `questions` JSON에 선택 필드만 추가).

**Files:**
- Modify: `mobile/lib/features/questionnaire/questionnaire_controller.dart`(Task 21)
- Modify: `mobile/lib/features/questionnaire/questionnaire_screen.dart`(Task 21)
- Test: `mobile/test/features/questionnaire/questionnaire_controller_test.dart`(Task 21, 추가)

**Interfaces:**
- Consumes: `QuestionTemplate`(Task 21)
- Produces: `QuestionnaireScreen`에 선택적 생성자 인자 `prefill: Map<String, String>?` 추가(키는 `field_key`, 값은 미리 채울 텍스트) — 4단계 `mobile/lib/features/chat/booking_card.dart`(Task 19)가 예약 완료 후 "사전문진 작성하기"에서 이 값을 넘긴다

- [ ] **Step 1: 실패하는 테스트 작성 — field_key로 프리필**

`mobile/test/features/questionnaire/questionnaire_controller_test.dart`에 추가:
```dart
test('QuestionTemplate.questions에 field_key가 있으면 prefill 값을 찾을 수 있다', () {
  const template = QuestionTemplate(id: 't1', questions: [
    {'text': '오늘 불편한 증상은?', 'type': 'text', 'required': true, 'field_key': 'chief_complaint'},
    {'text': '복용 중인 약이 있나요?', 'type': 'text', 'required': false},
  ]);

  final prefill = {'chief_complaint': '기침, 콧물'};
  final matched = template.questions.firstWhere(
    (q) => q['field_key'] != null && prefill.containsKey(q['field_key']),
    orElse: () => {},
  );

  expect(matched['text'], '오늘 불편한 증상은?');
});
```

Run: `cd mobile && flutter test test/features/questionnaire/questionnaire_controller_test.dart`
Expected: PASS (기존 `QuestionTemplate` 구조 그대로도 통과 — `field_key`는 이미 임의의 JSON 맵을 담는 `questions: List<Map<String, dynamic>>`에 자연스럽게 포함되므로 컨트롤러 코드 변경 불필요. 다음 스텝은 화면 쪽 prefill 반영)

- [ ] **Step 2: QuestionnaireScreen에 prefill 반영**

`mobile/lib/features/questionnaire/questionnaire_screen.dart`를 다음으로 교체:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'questionnaire_controller.dart';

class QuestionnaireScreen extends ConsumerStatefulWidget {
  const QuestionnaireScreen({
    super.key,
    required this.appointmentId,
    required this.departmentId,
    this.prefill,
  });
  final String appointmentId;
  final String departmentId;
  final Map<String, String>? prefill;

  @override
  ConsumerState<QuestionnaireScreen> createState() => _QuestionnaireScreenState();
}

class _QuestionnaireScreenState extends ConsumerState<QuestionnaireScreen> {
  final Map<String, TextEditingController> _controllers = {};

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(questionnaireControllerProvider.notifier).loadTemplate(widget.departmentId));
  }

  TextEditingController _controllerFor(Map<String, dynamic> question) {
    final text = question['text'] as String;
    return _controllers.putIfAbsent(text, () {
      final fieldKey = question['field_key'] as String?;
      final initial = (fieldKey != null ? widget.prefill?[fieldKey] : null) ?? '';
      return TextEditingController(text: initial);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(questionnaireControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('사전문진')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (template) {
          if (template == null) return const Center(child: Text('이 진료과의 사전문진 양식이 없습니다.'));
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (widget.prefill != null && widget.prefill!.isNotEmpty)
                const Padding(
                  padding: EdgeInsets.only(bottom: 12),
                  child: Text('상담에서 말씀하신 내용을 미리 채워드렸어요. 확인하고 필요하면 고쳐주세요.'),
                ),
              for (final q in template.questions)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: TextField(
                    controller: _controllerFor(q),
                    decoration: InputDecoration(labelText: q['text'] as String),
                  ),
                ),
              ElevatedButton(
                onPressed: () {
                  final answers = template.questions
                      .map((q) => {'question': q['text'], 'answer': _controllerFor(q).text})
                      .toList();
                  ref.read(questionnaireControllerProvider.notifier).submit(
                    widget.appointmentId, template.id, answers,
                  );
                },
                child: const Text('제출'),
              ),
            ],
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 3: 테스트 실행**

Run: `cd mobile && flutter test test/features/questionnaire/`
Expected: 전체 PASS

- [ ] **Step 4: 커밋**

```bash
git add mobile/lib/features/questionnaire/questionnaire_screen.dart mobile/test/features/questionnaire/questionnaire_controller_test.dart
git commit -m "feat: 사전문진에 상담봇 수집 정보 미리채우기 (4단계 스펙 갭 보완)"
```

---

## Self-Review

**1) 스펙 커버리지:** 위 표를 통해 `docs/superpowers/specs/2026-07-27-patient-app-design.md`의 섹션 1~9와 "3단계에서 추가되는 백엔드" 항목이 모두 하나 이상의 태스크에 대응됨을 확인했다. "이번 단계에서 다루지 않는 것" 중 AI 상담봇 본체와 상담 답변 알림은 여전히 4단계 몫이라 이 계획에 없다. 상담봇발 사전문진 자동반영은 화면 쪽 절반(`field_key` 프리필 표시)을 Task 27이 담당하고, 나머지 절반(대화 기록에서 증상·시작시점 추출)은 4단계 `ai-chatbot.md`가 담당하도록 정합성 검토에서 나눠 반영했다(2026-07-28).

**2) 플레이스홀더 스캔:** "TBD"/"적절히 처리"/"위와 유사하게" 같은 표현이 있는지 재검토했다. Task 19 Step 4의 진료과/의사/날짜/시간 단계 설명은 반복 패턴을 안내하는 문장이지만, 반복해야 할 정확한 데이터 계약(컨트롤러 메서드명·엔드포인트)이 Step 2와 Task 7에 이미 완전한 코드로 명시되어 있어 "코드 없이 설명만" 하는 플레이스홀더는 아니다. 다만 이상적이진 않으므로, 실행 시(subagent-driven-development) 이 부분만 별도 서브태스크로 쪼개 실제 위젯 코드를 채워 넣는 것을 권장한다.

**3) 타입/함수명 일관성:** 대조 결과 모두 일치한다 — 백엔드: `PatientContext(id, auth_user_id)`(Task 4)가 Task 5~13 전체에서 동일하게 사용됨, `book_slot`/`release_slot`의 `actor` 매개변수가 `StaffContext`/`PatientContext` 양쪽에 duck-typing으로 재사용됨(Task 7), `hospital_settings.auto_confirm_app_bookings`(Task 2)가 Task 8의 `_initial_status`에서 그대로 조회됨, `appointment_status_history.changed_by_patient_id`(Task 2)가 Task 8·9에서 그대로 사용됨. Flutter: `ApiClient`(Task 15)의 `get/post/patch/delete` 시그니처가 Task 16~26 전체 컨트롤러에서 동일하게 사용됨, `UpcomingAppointment`(Task 22)가 Task 23에서 재사용됨, `RealtimeSubscriber`(Task 23)가 테스트에서 `FakeRealtimeSubscriber`로 대체 가능하도록 인터페이스로 분리됨.

**4) 독립 서브에이전트 교차 검증(2026-07-27 추가):** 계획서를 작성한 세션과 무관한 별도 서브에이전트가 스펙 대비 전수 검토를 수행해, 최초 self-review가 놓친 문제 4건을 발견해 모두 수정했다.
- **[치명적, 수정완료]** Task 1의 `appointment_slots` RLS에 환자용 SELECT 정책만 있고 UPDATE 정책이 없어, Task 7의 `book_slot`/`release_slot`(환자 세션으로 직접 UPDATE)이 항상 실패해 예약 신청/변경/취소 전체가 막히는 결함 → `patients_can_update_slots_for_booking` 정책 추가, 검증 테스트 2건 추가
- **[보안, 수정완료]** Task 2의 `medical_records` RLS가 행 단위로만 걸려 있어 `symptoms`/`diagnosis`/`treatment` 같은 의료진 전용 항목이 컬럼 단위로는 보호되지 않던 결함(앱의 Supabase 직접 접속 경로로 우회 열람 가능) → `patient_medical_notes` 뷰로 분리해 안전한 칼럼만 노출, `medical_records` 테이블 자체에는 환자용 정책을 두지 않도록 변경, Task 11이 뷰를 사용하도록 수정, 검증 테스트 추가
- **[보통, 수정완료]** Task 9 `list_my_appointments`에 날짜 필터가 없어 직원이 상태 전이를 놓친 과거 예약이 계속 "다음 예약"으로 표시될 수 있던 결함 → `slot_date >= current_date` 조건 추가, 검증 테스트 추가
- **[경미, 수정완료]** Task 12에서 `change_booking`의 알림 호출이 코드 없이 설명 문장으로만 남아있던 자리표시자 → 실제 코드로 채움

**5) 정합성 검토 2~5차 통합 리포트 반영(2026-07-28):**
- **[치명적, 수정완료 — R2-01]** Task 1의 `patients_can_update_slots_for_booking` 정책이 슬롯의 소유는 확인하지 않고 상태값만 검사해, 환자 A가 환자 B의 예약된 슬롯 id만 알면 백엔드를 거치지 않고 Supabase에 직접 접속해 그 슬롯을 `빈시간`으로 되돌릴 수 있던 결함 → `using` 절에 "슬롯이 비어있거나(`빈시간`, 소유 개념 없음) 또는 그 슬롯을 참조하는 `appointments.account_patient_id`가 `patient_owns()`로 확인되는 본인/가족 소유일 때만" 허용하는 조건 추가, 검증 테스트 2건(타인 슬롯 반납 차단, 본인 슬롯 반납 정상 동작) 추가.
- **[치명적, 수정완료 — R5-01]** Task 1의 `patient_family_links` INSERT 정책이 `account_patient_id`(요청자 본인)만 확인하고 `family_patient_id`(연결 대상)의 동의·소유권은 전혀 검사하지 않아, 환자 A가 환자 B의 UUID만 알면 백엔드를 거치지 않고 직접 Supabase에 접속해 동의 없이 B를 자기 가족으로 연결할 수 있던 결함 → INSERT 권한을 클라이언트에서 완전히 제거(SELECT/UPDATE/DELETE만 남김)하고, "새 프로필 추가"(`add_family_member`, Task 6)와 "기존 환자 OTP 연결"(`family_link_otp_service`, Task 12 — 이름·생년월일·전화번호로 정확히 1건 매칭 시 그 환자의 등록 전화번호로 SMS 인증번호 발송, 인증 성공 시에만 서비스 역할 커넥션으로 링크 생성)만 서버 신뢰 경로로 허용. 화면에는 "이미 방문·예약하신 적 있는 가족이라면 새로 추가하지 마세요" 상시 안내와 "기존 환자와 연결" OTP 흐름, OTP 불가 시 병원 문의 안내를 추가(Task 18). 검증 테스트: 직접 INSERT 차단 1건(Task 1), OTP 서비스 5건(Task 12), 화면 컨트롤러 1건(Task 18).

## 다른 단계 의존성

- 2단계(직원용 웹)에는 아직 "취소요청 대기열" 화면이 없다(마감 후 `cancellation_requested_at`이 채워진 예약을 직원이 승인/반려하는 화면). 이 계획은 백엔드에 `cancellation_requested_at` 필드와 상태만 준비해두고, 그 화면 자체는 2단계 담당이므로 이 계획의 태스크로 포함하지 않았다. **[해결됨]** `staff-web.md` Task 16으로 반영 완료(2026-07-28).
- Task 27(상담봇 수집 정보의 사전문진 반영)은 4단계(`ai-chatbot.md`)의 `chat_service.get_questionnaire_prefill`을 소비한다. 4단계 구현이 먼저 끝나 있어야 한다.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-patient-app.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
