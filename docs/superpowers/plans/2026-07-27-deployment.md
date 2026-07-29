# 5단계: 통합 테스트 & 배포 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1~4단계로 구현된 병원 통합 서비스를 실제 클라우드(Railway + Vercel + Supabase)에 배포하고, 10개 완료 시나리오 검수·데모 데이터·크론(알림/백업)·납품 문서까지 완료한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-27-deployment-design.md` 참조. 1구간(로컬: 시나리오 테스트·시드·오류화면·빌드설정·CI) → ★사용자 승인 관문(원격 DB 적용) → 2구간(클라우드 구성) → 3구간(검수·문서) 순서.

**Tech Stack:** FastAPI(backend/), React+Vite(frontend/), Flutter(mobile/), Supabase CLI, Railway, Vercel, GitHub Actions, pg_dump, gitleaks

## Global Constraints

- **[정합성 검토 P1/P2 추적]** `docs/supabase-postgres-review-2026-07-28.md`의 SDB-25(연결 풀/역할 분리), SDB-34(pg_stat_statements·실행계획 기준선)는 이 단계(운영 배포) 작업 시 함께 반영하기로 결정됨(2026-07-28).
- **전제**: 1~4단계 구현 완료 후 실행한다. (1~4단계 모두 스펙·구현 계획 문서가 존재하며, 구현 실행이 선행돼야 한다)
- 디렉토리: 백엔드 `backend/`, 직원 웹 `frontend/`([정합성 검토 R5-07] 2/4단계 계획이 이미 쓰는 `frontend/`로 통일 — 이전에는 이 문서만 `web/`을 썼다), 환자 앱 `mobile/`, 마이그레이션 `supabase/migrations/`
- 사용자 노출 메시지는 전부 한글, 개발자용 오류 문장 노출 금지 (요구사항 6.4)
- 비밀키는 저장소에 절대 커밋하지 않는다. 실제 값은 플랫폼 환경변수에만 저장, 저장소에는 `.env.example`(키 이름만)
- 시간 기준: 크론 스케줄은 KST 기준 (알림 08:00 KST = `0 23 * * *` UTC, 백업 03:00 KST = `0 18 * * *` UTC)
- 실제 환자정보 사용 금지 — 모든 데모 데이터는 가상 (요구사항 6.5)
- **Task 12(승인 관문) 이전에는 원격 Supabase에 어떤 변경도 가하지 않는다**
- 기존 테스트 픽스처 재사용: `tests.conftest.seed_staff(conn, role, department_id=None) -> {"auth_user_id", "staff_id"}`, `tests.conftest.seed_patient(conn, name=..., phone=..., with_auth=True) -> {"auth_user_id", "patient_id"}`, `db_pool`
- 예약 상태값: `예약신청, 예약확정, 도착, 진료대기, 진료중, 진료완료, 환자취소, 병원취소, 예약부도` / 슬롯 상태값: `빈시간, 예약됨, 휴진` / 직원 role: `admin, receptionist, doctor`
- 라우터 인터페이스가 이 계획의 코드와 실제 구현 사이에 어긋나면(1~4단계 구현 중 변경 가능) **실제 구현 쪽을 기준**으로 테스트 코드를 맞춘다 — 시나리오의 검증 의도는 유지

---

## 1구간 — 로컬 작업 (원격 적용 불필요)

### Task 1: 시나리오 테스트 공통 픽스처

**Files:**
- Create: `backend/tests/scenarios/__init__.py` (빈 파일)
- Create: `backend/tests/scenarios/conftest.py`

**Interfaces:**
- Consumes: `tests.conftest.seed_staff`, `tests.conftest.seed_patient`, `tests.conftest.client`(TestClient), `db_pool`, `app.core.config.settings`
- Produces: `tests.scenarios.conftest.hospital` fixture — dict: `{"admin", "receptionist", "doctor"}`(각 `{"auth_user_id", "staff_id"}`), `"dept_id": UUID`, `"patient": {"auth_user_id", "patient_id"}`, `"slots": [UUID, UUID, UUID]`(내일 09:00/09:30/10:00)
- Produces: `tests.scenarios.conftest.bearer(auth_user_id) -> dict` (Authorization 헤더)

- [ ] **Step 1: 픽스처 작성**

`backend/tests/scenarios/conftest.py`:
```python
import time

import pytest_asyncio
from jose import jwt

from app.core.config import settings
from tests.conftest import seed_patient, seed_staff


def bearer(auth_user_id) -> dict:
    payload = {
        "sub": str(auth_user_id),
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    token = jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def hospital(db_pool):
    """커밋 기반 병원 기본 세트. TestClient 요청이 별도 커넥션을 쓰므로 트랜잭션 롤백 픽스처(db_conn)는 사용 불가."""
    async with db_pool.acquire() as conn:
        admin = await seed_staff(conn, role="admin")
        receptionist = await seed_staff(conn, role="receptionist")
        dept_id = await conn.fetchval("insert into departments (name) values ('시나리오내과') returning id")
        doctor = await seed_staff(conn, role="doctor", department_id=dept_id)
        patient = await seed_patient(conn, name="시나리오환자", phone="01099998888")
        slot_ids = [
            await conn.fetchval(
                "insert into appointment_slots (doctor_id, slot_date, start_time) "
                "values ($1, current_date + 1, $2) returning id",
                doctor["staff_id"], t,
            )
            for t in ("09:00", "09:30", "10:00")
        ]
    yield {
        "admin": admin, "receptionist": receptionist, "doctor": doctor,
        "dept_id": dept_id, "patient": patient, "slots": slot_ids,
    }
    async with db_pool.acquire() as conn:
        for table in (
            "medical_record_revisions", "medical_records", "questionnaire_responses",
            "appointment_status_history", "appointments", "appointment_slots",
            "device_tokens", "patient_family_links", "patients",
            "doctor_schedule_exceptions", "doctor_schedule_rules",
            "access_audit_log", "system_error_log", "staff", "departments",
        ):
            await conn.execute(f"delete from {table}")
        await conn.execute("delete from auth.users where email like '%@test.local' or phone like '0109999%'")
```

- [ ] **Step 2: 픽스처가 로드되는지 확인 (빈 테스트로 검증)**

임시 파일 `backend/tests/scenarios/test_fixture_smoke.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_hospital_fixture_provides_all_keys(hospital):
    assert set(hospital) == {"admin", "receptionist", "doctor", "dept_id", "patient", "slots"}
    assert len(hospital["slots"]) == 3
```

Run: `cd backend && pytest tests/scenarios/test_fixture_smoke.py -v`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add backend/tests/scenarios/
git commit -m "test: 시나리오 통합 테스트 공통 픽스처 추가"
```

---

### Task 2: 시나리오 1(앱 예약) + 시나리오 8(중복 방지) 자동 테스트

**Files:**
- Create: `backend/tests/scenarios/test_scenario_01_app_booking.py`
- Create: `backend/tests/scenarios/test_scenario_08_duplicates.py`

**Interfaces:**
- Consumes: `hospital` 픽스처, `bearer()`, 환자 라우터 `POST /app/appointments`(body: `for_patient_id, department_id, doctor_id, slot_id, reason`), `GET /app/appointments/{id}`, 직원 라우터 `PATCH /appointments/{id}/status`(body: `new_status, reason, expected_updated_at`)
- Produces: 없음 (검증 전용)

- [ ] **Step 1: 시나리오 1 테스트 작성 — 환자 예약 신청 → 접수직원 확정 → 환자 확인**

`backend/tests/scenarios/test_scenario_01_app_booking.py`:
```python
import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_01_patient_books_staff_confirms_patient_sees_it(client, hospital, db_pool):
    patient_h = bearer(hospital["patient"]["auth_user_id"])
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])

    # 1) 환자가 앱에서 예약 신청
    res = client.post("/app/appointments", headers=patient_h, json={
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "slot_id": str(hospital["slots"][0]),
        "reason": "감기 기운",
    })
    assert res.status_code == 200
    appointment_id = res.json()["appointment_id"]

    # 2) 신청 직후 상태는 예약신청
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("select status, updated_at from appointments where id = $1::uuid", appointment_id)
    assert row["status"] == "예약신청"

    # 3) 접수직원이 확정
    res = client.patch(f"/appointments/{appointment_id}/status", headers=reception_h, json={
        "new_status": "예약확정", "reason": "전화 확인 완료",
        "expected_updated_at": row["updated_at"].isoformat(),
    })
    assert res.status_code == 200

    # 4) 환자 앱에서 확정 상태 확인
    res = client.get(f"/app/appointments/{appointment_id}", headers=patient_h)
    assert res.status_code == 200
    assert res.json()["status"] == "예약확정"

    # 5) 상태 이력이 남았는지 확인
    async with db_pool.acquire() as conn:
        history = await conn.fetch(
            "select to_status from appointment_status_history where appointment_id = $1::uuid order by changed_at",
            appointment_id,
        )
    assert [h["to_status"] for h in history][-1] == "예약확정"
```

- [ ] **Step 2: 실행해 통과 확인**

Run: `cd backend && pytest tests/scenarios/test_scenario_01_app_booking.py -v`
Expected: PASS (1~4단계 구현이 완료돼 있으므로. 실패하면 실제 라우터 스키마와 대조해 테스트를 수정 — Global Constraints 마지막 항목)

- [ ] **Step 3: 시나리오 8 테스트 작성 — 같은 슬롯 이중 예약 차단**

`backend/tests/scenarios/test_scenario_08_duplicates.py`:
```python
import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_08_second_booking_on_same_slot_fails(client, hospital, db_pool):
    patient_h = bearer(hospital["patient"]["auth_user_id"])
    body = {
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "slot_id": str(hospital["slots"][1]),
        "reason": "정기 검진",
    }

    first = client.post("/app/appointments", headers=patient_h, json=body)
    assert first.status_code == 200

    # 같은 슬롯에 두 번째 예약 시도(중복 클릭/동시 접수 재연) → 실패해야 함
    second = client.post("/app/appointments", headers=patient_h, json=body)
    assert second.status_code >= 400
    # 사용자에게는 한글 안내가 전달돼야 함
    assert "detail" in second.json()

    # 슬롯은 예약됨 1건만 존재
    async with db_pool.acquire() as conn:
        count = await conn.fetchval(
            "select count(*) from appointments where slot_id = $1 and status not in ('환자취소','병원취소')",
            hospital["slots"][1],
        )
    assert count == 1
```

- [ ] **Step 4: 실행해 통과 확인**

Run: `cd backend && pytest tests/scenarios/test_scenario_08_duplicates.py -v`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/tests/scenarios/test_scenario_01_app_booking.py backend/tests/scenarios/test_scenario_08_duplicates.py
git commit -m "test: 시나리오 1(앱 예약)·8(중복 방지) 통합 테스트"
```

---

### Task 3: 시나리오 3(전화 예약·당일 접수) + 시나리오 4(도착→진료 완료) 자동 테스트

**Files:**
- Create: `backend/tests/scenarios/test_scenario_03_walkin.py`
- Create: `backend/tests/scenarios/test_scenario_04_visit_flow.py`

**Interfaces:**
- Consumes: `hospital`, `bearer()`, 직원 라우터 `POST /appointments`(body: `account_patient_id, for_patient_id, department_id, doctor_id, reason, source, initial_status, slot_id?`), `PATCH /appointments/{id}/status`, `POST /medical-records/draft`(body: `appointment_id, symptoms, diagnosis, treatment, patient_visible_notes`), `PATCH /medical-records/{record_id}/complete`
- Produces: 없음

- [ ] **Step 1: 시나리오 3 테스트 작성 — 전화 예약(슬롯) + 워크인(슬롯 없음)**

`backend/tests/scenarios/test_scenario_03_walkin.py`:
```python
import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_03_phone_booking_and_same_day_walkin(client, hospital, db_pool):
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])
    base = {
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "source": "staff",
    }

    # 1) 전화 예약: 접수직원이 슬롯을 잡아 바로 예약확정
    res = client.post("/appointments", headers=reception_h, json={
        **base, "reason": "전화 예약", "initial_status": "예약확정",
        "slot_id": str(hospital["slots"][2]),
    })
    assert res.status_code == 200

    # 2) 당일 방문(워크인): 슬롯 없이 도착 상태로 생성
    res = client.post("/appointments", headers=reception_h, json={
        **base, "reason": "당일 방문", "initial_status": "도착",
    })
    assert res.status_code == 200
    walkin_id = res.json()["appointment_id"]

    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "select status, slot_id, queue_position from appointments where id = $1::uuid", walkin_id,
        )
    assert row["status"] == "도착"
    assert row["slot_id"] is None
    assert row["queue_position"] is not None  # 대기 순서가 부여됨
```

- [ ] **Step 2: 실행해 통과 확인**

Run: `cd backend && pytest tests/scenarios/test_scenario_03_walkin.py -v`
Expected: PASS

- [ ] **Step 3: 시나리오 4 테스트 작성 — 도착→진료대기→진료중→진료완료 + 진료기록 완료**

`backend/tests/scenarios/test_scenario_04_visit_flow.py`:
```python
import pytest

from tests.scenarios.conftest import bearer


async def _fetch_updated_at(db_pool, appointment_id):
    async with db_pool.acquire() as conn:
        return await conn.fetchval("select updated_at from appointments where id = $1::uuid", appointment_id)


@pytest.mark.asyncio
async def test_scenario_04_arrival_to_completed_record(client, hospital, db_pool):
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])
    doctor_h = bearer(hospital["doctor"]["auth_user_id"])

    res = client.post("/appointments", headers=reception_h, json={
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "reason": "복통", "source": "staff", "initial_status": "도착",
    })
    appointment_id = res.json()["appointment_id"]

    # 접수직원: 도착 → 진료대기, 의사: 진료대기 → 진료중
    for actor_h, new_status in ((reception_h, "진료대기"), (doctor_h, "진료중")):
        updated_at = await _fetch_updated_at(db_pool, appointment_id)
        res = client.patch(f"/appointments/{appointment_id}/status", headers=actor_h, json={
            "new_status": new_status, "reason": None,
            "expected_updated_at": updated_at.isoformat(),
        })
        assert res.status_code == 200, f"{new_status} 전이 실패: {res.text}"

    # 의사: 진료기록 작성 → 완료
    res = client.post("/medical-records/draft", headers=doctor_h, json={
        "appointment_id": appointment_id,
        "symptoms": "복통 2일", "diagnosis": "급성 위염", "treatment": "약 처방 3일",
        "patient_visible_notes": "자극적인 음식을 피하고 푹 쉬세요.",
    })
    assert res.status_code == 200
    record_id = res.json()["record_id"]

    res = client.patch(f"/medical-records/{record_id}/complete", headers=doctor_h)
    assert res.status_code == 200

    # 진료완료 상태 전이
    updated_at = await _fetch_updated_at(db_pool, appointment_id)
    res = client.patch(f"/appointments/{appointment_id}/status", headers=doctor_h, json={
        "new_status": "진료완료", "reason": None,
        "expected_updated_at": updated_at.isoformat(),
    })
    assert res.status_code == 200

    # 이력 전체가 순서대로 남았는지
    async with db_pool.acquire() as conn:
        history = await conn.fetch(
            "select to_status from appointment_status_history where appointment_id = $1::uuid order by changed_at",
            appointment_id,
        )
    assert [h["to_status"] for h in history] == ["진료대기", "진료중", "진료완료"]
```

- [ ] **Step 4: 실행해 통과 확인**

Run: `cd backend && pytest tests/scenarios/test_scenario_04_visit_flow.py -v`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/tests/scenarios/test_scenario_03_walkin.py backend/tests/scenarios/test_scenario_04_visit_flow.py
git commit -m "test: 시나리오 3(당일 접수)·4(도착→진료완료) 통합 테스트"
```

---

### Task 4: 시나리오 5(기록 수정) + 시나리오 6(의사 일정 변경) 자동 테스트

**Files:**
- Create: `backend/tests/scenarios/test_scenario_05_record_revision.py`
- Create: `backend/tests/scenarios/test_scenario_06_schedule_change.py`

**Interfaces:**
- Consumes: `hospital`, `bearer()`, `PATCH /medical-records/{record_id}/revise`(body: `new_content: dict, reason: str, expected_updated_at`), `GET /appointments/affected?doctor_id=`, `POST /appointments/{id}/reschedule`(body: `new_slot_id, reason`), 테이블 `medical_record_revisions`, `doctor_schedule_exceptions`
- Produces: 없음

- [ ] **Step 1: 시나리오 5 테스트 작성 — 완료된 기록 수정은 사유 필수 + 이전 내용 보존**

`backend/tests/scenarios/test_scenario_05_record_revision.py`:
```python
import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_05_revising_completed_record_requires_reason_and_keeps_history(client, hospital, db_pool):
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])
    doctor_h = bearer(hospital["doctor"]["auth_user_id"])

    # 완료된 진료기록 준비
    res = client.post("/appointments", headers=reception_h, json={
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "reason": "두통", "source": "staff", "initial_status": "도착",
    })
    appointment_id = res.json()["appointment_id"]
    res = client.post("/medical-records/draft", headers=doctor_h, json={
        "appointment_id": appointment_id,
        "symptoms": "두통", "diagnosis": "긴장성 두통", "treatment": "진통제",
        "patient_visible_notes": "수분을 충분히 섭취하세요.",
    })
    record_id = res.json()["record_id"]
    client.patch(f"/medical-records/{record_id}/complete", headers=doctor_h)

    async with db_pool.acquire() as conn:
        updated_at = await conn.fetchval("select updated_at from medical_records where id = $1::uuid", record_id)

    # 1) 사유 없이 수정 시도 → 실패
    res = client.patch(f"/medical-records/{record_id}/revise", headers=doctor_h, json={
        "new_content": {"diagnosis": "편두통"}, "reason": "",
        "expected_updated_at": updated_at.isoformat(),
    })
    assert res.status_code >= 400

    # 2) 사유와 함께 수정 → 성공, 이전 내용이 revisions에 보존
    res = client.patch(f"/medical-records/{record_id}/revise", headers=doctor_h, json={
        "new_content": {"diagnosis": "편두통"}, "reason": "추가 문진 결과 반영",
        "expected_updated_at": updated_at.isoformat(),
    })
    assert res.status_code == 200

    async with db_pool.acquire() as conn:
        revision = await conn.fetchrow(
            "select previous_content, reason from medical_record_revisions where record_id = $1::uuid", record_id,
        )
        current = await conn.fetchval("select diagnosis from medical_records where id = $1::uuid", record_id)
    assert revision is not None
    assert revision["reason"] == "추가 문진 결과 반영"
    assert "긴장성 두통" in str(revision["previous_content"])
    assert current == "편두통"
```

- [ ] **Step 2: 실행해 통과 확인**

Run: `cd backend && pytest tests/scenarios/test_scenario_05_record_revision.py -v`
Expected: PASS

- [ ] **Step 3: 시나리오 6 테스트 작성 — 휴진 등록 → 영향 예약 조회 → 재조정**

`backend/tests/scenarios/test_scenario_06_schedule_change.py`:
```python
import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_06_closure_lists_affected_and_reschedules(client, hospital, db_pool):
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])
    doctor_id = hospital["doctor"]["staff_id"]

    # 내일 09:00 슬롯에 확정 예약 생성
    res = client.post("/appointments", headers=reception_h, json={
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(doctor_id),
        "reason": "재진", "source": "staff", "initial_status": "예약확정",
        "slot_id": str(hospital["slots"][0]),
    })
    appointment_id = res.json()["appointment_id"]

    # 내일 휴진 등록 (관리자/일정 관리 경로 — 구현된 라우터가 있으면 API로, 없으면 DB 직접)
    async with db_pool.acquire() as conn:
        await conn.execute(
            "insert into doctor_schedule_exceptions (doctor_id, exception_date, is_closed) "
            "values ($1, current_date + 1, true)",
            doctor_id,
        )
        # 재조정 대상 슬롯: 모레 09:00
        new_slot_id = await conn.fetchval(
            "insert into appointment_slots (doctor_id, slot_date, start_time) "
            "values ($1, current_date + 2, '09:00') returning id",
            doctor_id,
        )

    # 영향받는 예약 조회
    res = client.get(f"/appointments/affected?doctor_id={doctor_id}", headers=reception_h)
    assert res.status_code == 200
    affected_ids = [a["id"] for a in res.json()]
    assert appointment_id in affected_ids

    # 재조정
    res = client.post(f"/appointments/{appointment_id}/reschedule", headers=reception_h, json={
        "new_slot_id": str(new_slot_id), "reason": "의사 휴진으로 일정 변경",
    })
    assert res.status_code == 200

    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("select slot_id, status from appointments where id = $1::uuid", appointment_id)
        old_slot_status = await conn.fetchval(
            "select status from appointment_slots where id = $1", hospital["slots"][0],
        )
    assert str(row["slot_id"]) == str(new_slot_id)
    assert row["status"] == "예약확정"
    assert old_slot_status in ("빈시간", "휴진")  # 휴진일의 기존 슬롯은 재사용 불가 처리
```

- [ ] **Step 4: 실행해 통과 확인**

Run: `cd backend && pytest tests/scenarios/test_scenario_06_schedule_change.py -v`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/tests/scenarios/test_scenario_05_record_revision.py backend/tests/scenarios/test_scenario_06_schedule_change.py
git commit -m "test: 시나리오 5(기록 수정)·6(일정 변경) 통합 테스트"
```

---

### Task 5: 시나리오 9(권한 확인)·10(운영 통계 API) 자동 테스트 + RLS 이중 확인

**Files:**
- Create: `backend/tests/scenarios/test_scenario_09_permissions.py`
- Create: `backend/tests/scenarios/test_scenario_10_stats.py`

**Interfaces:**
- Consumes: `hospital`, `bearer()`, `tests.conftest.set_session_auth`, 라우터 전반, 뷰 `patient_medical_notes`, `GET /stats?from_=&to=`(2단계 Task 참조 — admin 전용, 응답 `{reserved, cancelled, no_show, visited, average_wait_minutes, app_booking_ratio}`)
- Produces: 없음

> 시나리오 10(운영 통계)은 "화면에 보이는가"와 "숫자가 맞는가"가 분리된다. 후자는 API 응답만으로 검증 가능하므로 여기서 자동화하고, 화면 렌더링·CSV 다운로드 버튼 클릭은 Task 20/21의 수동 체크리스트로 남긴다.

- [ ] **Step 1: 권한 테스트 작성 — API 레벨 + RLS 직접 조회 레벨**

`backend/tests/scenarios/test_scenario_09_permissions.py`:
```python
import pytest

from tests.conftest import seed_patient, set_session_auth
from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_09_role_boundaries_at_api_level(client, hospital):
    doctor_h = bearer(hospital["doctor"]["auth_user_id"])
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])
    patient_h = bearer(hospital["patient"]["auth_user_id"])

    # 의사는 직원 초대 불가
    res = client.post("/staff", headers=doctor_h,
                      json={"email": "x@test.local", "name": "테스트", "role": "receptionist"})
    assert res.status_code == 403

    # 접수직원은 진료기록 작성 불가
    res = client.post("/medical-records/draft", headers=reception_h, json={
        "appointment_id": "00000000-0000-0000-0000-000000000000",
        "symptoms": "-", "diagnosis": "-", "treatment": "-", "patient_visible_notes": "-",
    })
    assert res.status_code == 403

    # 환자 토큰으로 직원 API 접근 불가
    res = client.get("/today-summary", headers=patient_h)
    assert res.status_code in (401, 403)

    # 미인증 접근 불가
    res = client.get("/today-summary")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_scenario_09_patient_cannot_read_other_patients_data(client, hospital, db_pool):
    async with db_pool.acquire() as conn:
        other = await seed_patient(conn, name="타인환자", phone="01099997777")
    other_h = bearer(other["auth_user_id"])
    patient_h = bearer(hospital["patient"]["auth_user_id"])

    # 내 예약 생성
    res = client.post("/app/appointments", headers=patient_h, json={
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "slot_id": str(hospital["slots"][0]),
        "reason": "본인 예약",
    })
    appointment_id = res.json()["appointment_id"]

    # 타인이 내 예약 조회 시도 → 차단
    res = client.get(f"/app/appointments/{appointment_id}", headers=other_h)
    assert res.status_code in (403, 404)


@pytest.mark.asyncio
async def test_scenario_09_rls_blocks_direct_table_access(db_conn, hospital):
    """API를 우회해 DB에 직접 접속해도 RLS가 막는지 이중 확인."""
    # 환자 세션으로 medical_records 직접 조회 → 0건 (뷰로만 접근 가능해야 함)
    await set_session_auth(db_conn, hospital["patient"]["auth_user_id"])
    rows = await db_conn.fetch("select * from medical_records")
    assert rows == []

    # 환자 세션으로 다른 환자 정보 조회 → 본인 것만
    rows = await db_conn.fetch("select * from patients")
    assert all(str(r["id"]) == str(hospital["patient"]["patient_id"]) for r in rows)
```

- [ ] **Step 2: 실행해 통과 확인**

Run: `cd backend && pytest tests/scenarios/test_scenario_09_permissions.py -v`
Expected: PASS

- [ ] **Step 3: 시나리오 10 테스트 작성 — 통계 API 수치가 실제 생성한 예약과 일치**

`backend/tests/scenarios/test_scenario_10_stats.py`:
```python
from datetime import date

import pytest

from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_scenario_10_stats_reflect_created_appointments(client, hospital, db_pool):
    admin_h = bearer(hospital["admin"]["auth_user_id"])
    reception_h = bearer(hospital["receptionist"]["auth_user_id"])

    # 1) 확정 예약 1건
    res = client.post("/appointments", headers=reception_h, json={
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "reason": "정기검진", "source": "staff", "initial_status": "예약확정",
        "slot_id": str(hospital["slots"][0]),
    })
    assert res.status_code == 200

    # 2) 예약 후 취소 1건 (취소 건수에 반영돼야 함)
    res = client.post("/appointments", headers=reception_h, json={
        "account_patient_id": str(hospital["patient"]["patient_id"]),
        "for_patient_id": str(hospital["patient"]["patient_id"]),
        "department_id": str(hospital["dept_id"]),
        "doctor_id": str(hospital["doctor"]["staff_id"]),
        "reason": "취소예정", "source": "staff", "initial_status": "예약확정",
        "slot_id": str(hospital["slots"][1]),
    })
    cancel_id = res.json()["appointment_id"]
    async with db_pool.acquire() as conn:
        updated_at = await conn.fetchval(
            "select updated_at from appointments where id = $1::uuid", cancel_id,
        )
    client.patch(f"/appointments/{cancel_id}/status", headers=reception_h, json={
        "new_status": "환자취소", "reason": "환자 요청",
        "expected_updated_at": updated_at.isoformat(),
    })

    today = date.today().isoformat()

    # 3) 관리자는 통계 조회 가능, 숫자가 실제 생성 건수를 반영
    res = client.get(f"/stats?from_={today}&to={today}", headers=admin_h)
    assert res.status_code == 200
    body = res.json()
    assert body["reserved"] >= 1
    assert body["cancelled"] >= 1
    assert {"average_wait_minutes", "app_booking_ratio"} <= set(body)

    # 4) 접수직원은 통계 조회 불가 (관리자 전용 — 요구사항 3.10)
    res = client.get(f"/stats?from_={today}&to={today}", headers=reception_h)
    assert res.status_code == 403
```

- [ ] **Step 4: 실행해 통과 확인**

Run: `cd backend && pytest tests/scenarios/test_scenario_10_stats.py -v`
Expected: PASS (라우터의 실제 쿼리 파라미터 이름이 `from_`이 아니라 `from`(alias 처리)이면 Global Constraints 마지막 항목에 따라 이 테스트의 쿼리 문자열을 실제 구현에 맞춰 수정)

- [ ] **Step 5: 시나리오 전체 일괄 실행**

Run: `cd backend && pytest tests/scenarios/ -v`
Expected: 전부 PASS

- [ ] **Step 6: 임시 스모크 테스트 제거 후 커밋**

```bash
rm backend/tests/scenarios/test_fixture_smoke.py
git add -A backend/tests/scenarios/
git commit -m "test: 시나리오 9(권한+RLS 이중 확인)·10(통계 API) 통합 테스트"
```

---

### Task 6: 리마인더 발송 잡 (크론이 실행할 명령)

**Files:**
- Create: `backend/app/jobs/__init__.py` (빈 파일)
- Create: `backend/app/jobs/reminders.py`
- Modify: `backend/app/services/notification_service.py` (`MESSAGES` dict에 3개 키 추가)
- Test: `backend/tests/test_reminder_job.py`

**Interfaces:**
- Consumes: `app.db.pool.get_pool`, `app.services.notification_service.notify_patient(patient_id, notification_type)`
- Produces: `app.jobs.reminders.send_reminders(today: date | None = None) -> dict` (`{"reminder_today": int, "reminder_tomorrow": int, "questionnaire_missing": int}`), CLI 실행 `python -m app.jobs.reminders`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/tests/test_reminder_job.py`:
```python
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from tests.conftest import seed_patient, seed_staff


async def _seed_confirmed_appointment(conn, slot_date_offset: int):
    dept_id = await conn.fetchval("insert into departments (name) values ('리마인더과') returning id")
    doctor = await seed_staff(conn, role="doctor", department_id=dept_id)
    receptionist = await seed_staff(conn, role="receptionist")
    patient = await seed_patient(conn, name="리마인더환자", phone="01088887777")
    slot_id = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) "
        "values ($1, current_date + $2, '10:00') returning id",
        doctor["staff_id"], slot_date_offset,
    )
    await conn.execute("update appointment_slots set status = '예약됨' where id = $1", slot_id)
    await conn.execute(
        "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, "
        "doctor_id, reason, status, source, created_by) "
        "values ($1, $2, $2, $3, $4, '검진', '예약확정', 'staff', $5)",
        slot_id, patient["patient_id"], dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    return patient["patient_id"]


@pytest.mark.asyncio
async def test_send_reminders_notifies_today_and_tomorrow(committed_conn):
    today_patient = await _seed_confirmed_appointment(committed_conn, 0)
    tomorrow_patient = await _seed_confirmed_appointment(committed_conn, 1)

    with patch("app.jobs.reminders.notification_service") as mock_ns:
        mock_ns.notify_patient = AsyncMock()
        from app.jobs.reminders import send_reminders
        counts = await send_reminders()

    called = [(str(c.args[0]), c.args[1]) for c in mock_ns.notify_patient.await_args_list]
    assert (str(today_patient), "reminder_today") in called
    assert (str(tomorrow_patient), "reminder_tomorrow") in called
    assert counts["reminder_today"] >= 1 and counts["reminder_tomorrow"] >= 1
    # 내일 예약인데 사전문진 미작성 → questionnaire_missing 알림도 발생
    assert (str(tomorrow_patient), "questionnaire_missing") in called
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `cd backend && pytest tests/test_reminder_job.py -v`
Expected: FAIL (`app.jobs.reminders` 모듈 없음)

- [ ] **Step 3: 구현**

`backend/app/services/notification_service.py`의 `MESSAGES` dict에 추가:
```python
    "reminder_tomorrow": "내일 진료 예약이 있습니다. 예약 시간을 확인해주세요.",
    "reminder_today": "오늘 진료 예약이 있습니다. 늦지 않게 방문해주세요.",
    "questionnaire_missing": "내일 진료 전 사전문진을 아직 작성하지 않으셨습니다. 앱에서 작성해주세요.",
```

`backend/app/jobs/reminders.py`:
```python
"""매일 아침 크론이 실행하는 리마인더 발송 잡. 실행: python -m app.jobs.reminders"""
import asyncio
from datetime import date, timedelta

from app.db.pool import get_pool
from app.services import notification_service


async def send_reminders(today: date | None = None) -> dict:
    today = today or date.today()
    tomorrow = today + timedelta(days=1)
    counts = {"reminder_today": 0, "reminder_tomorrow": 0, "questionnaire_missing": 0}
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            select a.id, a.for_patient_id, s.slot_date,
                   exists (select 1 from questionnaire_responses q where q.appointment_id = a.id) as has_questionnaire
            from appointments a
            join appointment_slots s on s.id = a.slot_id
            where a.status = '예약확정' and s.slot_date in ($1, $2)
            """,
            today, tomorrow,
        )
    for row in rows:
        ntype = "reminder_today" if row["slot_date"] == today else "reminder_tomorrow"
        await notification_service.notify_patient(row["for_patient_id"], ntype)
        counts[ntype] += 1
        if row["slot_date"] == tomorrow and not row["has_questionnaire"]:
            await notification_service.notify_patient(row["for_patient_id"], "questionnaire_missing")
            counts["questionnaire_missing"] += 1
    print(f"[reminders] {counts}")
    return counts


if __name__ == "__main__":
    asyncio.run(send_reminders())
```

- [ ] **Step 4: 실행해 통과 확인**

Run: `cd backend && pytest tests/test_reminder_job.py -v`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/app/jobs/ backend/app/services/notification_service.py backend/tests/test_reminder_job.py
git commit -m "feat: 전날·당일·사전문진 리마인더 발송 잡 추가"
```

---

### Task 7: 백업 잡 (pg_dump → Supabase Storage, 14일 보관)

**Files:**
- Create: `backend/app/jobs/backup.py`
- Test: `backend/tests/test_backup_job.py`
- Modify: `backend/app/core/config.py` (`backup_bucket: str = "backups"` 설정 추가)

**Interfaces:**
- Consumes: `app.core.config.settings.database_url`, `app.db.admin_client.get_admin_client`
- Produces: `app.jobs.backup.run_backup(today: date | None = None) -> str`(업로드된 파일명 반환), `app.jobs.backup.select_expired(names: list[str], today: date, keep_days: int = 14) -> list[str]`, CLI 실행 `python -m app.jobs.backup`

- [ ] **Step 1: 실패하는 테스트 작성 (보관기간 판정 로직 — 외부 의존 없는 순수 함수)**

`backend/tests/test_backup_job.py`:
```python
from datetime import date

from app.jobs.backup import select_expired


def test_select_expired_keeps_recent_14_days():
    names = [
        "backup-2026-07-01.sql.gz",   # 26일 전 → 삭제 대상
        "backup-2026-07-14.sql.gz",   # 13일 전 → 보관
        "backup-2026-07-27.sql.gz",   # 오늘 → 보관
        "not-a-backup.txt",           # 형식 불일치 → 건드리지 않음
    ]
    expired = select_expired(names, today=date(2026, 7, 27), keep_days=14)
    assert expired == ["backup-2026-07-01.sql.gz"]
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `cd backend && pytest tests/test_backup_job.py -v`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`backend/app/jobs/backup.py`:
```python
"""매일 새벽 크론이 실행하는 DB 백업 잡. 실행: python -m app.jobs.backup"""
import gzip
import re
import subprocess
import tempfile
from datetime import date, timedelta
from pathlib import Path

from app.core.config import settings
from app.db.admin_client import get_admin_client

BACKUP_NAME_RE = re.compile(r"^backup-(\d{4}-\d{2}-\d{2})\.sql\.gz$")


def select_expired(names: list[str], today: date, keep_days: int = 14) -> list[str]:
    cutoff = today - timedelta(days=keep_days)
    expired = []
    for name in names:
        m = BACKUP_NAME_RE.match(name)
        if m and date.fromisoformat(m.group(1)) < cutoff:
            expired.append(name)
    return expired


def run_backup(today: date | None = None) -> str:
    today = today or date.today()
    filename = f"backup-{today.isoformat()}.sql.gz"
    with tempfile.TemporaryDirectory() as tmp:
        dump_path = Path(tmp) / "dump.sql"
        subprocess.run(
            ["pg_dump", "--no-owner", "--no-privileges", "-f", str(dump_path), settings.database_url],
            check=True,
        )
        gz_path = Path(tmp) / filename
        with open(dump_path, "rb") as src, gzip.open(gz_path, "wb") as dst:
            dst.writelines(src)

        storage = get_admin_client().storage.from_(settings.backup_bucket)
        with open(gz_path, "rb") as f:
            storage.upload(filename, f.read(), {"content-type": "application/gzip", "upsert": "true"})

        existing = [obj["name"] for obj in storage.list()]
        for name in select_expired(existing, today):
            storage.remove([name])
    print(f"[backup] uploaded {filename}, pruned expired")
    return filename


if __name__ == "__main__":
    run_backup()
```

`backend/app/core/config.py`의 Settings에 추가:
```python
    backup_bucket: str = "backups"
```

- [ ] **Step 4: 실행해 통과 확인**

Run: `cd backend && pytest tests/test_backup_job.py -v`
Expected: PASS

- [ ] **Step 5: 로컬 DB 대상 실동작 1회 확인 (업로드 제외 dry-run)**

Run: `cd backend && python -c "
import subprocess, tempfile
from pathlib import Path
from app.core.config import settings
with tempfile.TemporaryDirectory() as tmp:
    p = Path(tmp)/'d.sql'
    subprocess.run(['pg_dump','--no-owner','--no-privileges','-f',str(p),settings.database_url],check=True)
    print('dump ok, bytes:', p.stat().st_size)
"`
Expected: `dump ok, bytes: <0보다 큰 수>` (pg_dump가 로컬 Supabase DB를 정상 추출)

- [ ] **Step 6: 커밋**

```bash
git add backend/app/jobs/backup.py backend/tests/test_backup_job.py backend/app/core/config.py
git commit -m "feat: pg_dump 일일 백업 잡 추가 (14일 보관, Supabase Storage 업로드)"
```

---

### Task 8: 관리자용 오류 로그 화면 (백엔드 API + React 페이지)

**Files:**
- Create: `backend/app/routers/error_logs.py`
- Modify: `backend/app/main.py` (라우터 등록 1줄)
- Create: `frontend/src/pages/ErrorLogPage.tsx`
- Modify: `frontend/src/App.tsx` (관리자 라우트에 `/admin/errors` 추가 — 기존 관리자 메뉴 패턴을 따름)
- Test: `backend/tests/test_error_logs_router.py`, `frontend/src/pages/ErrorLogPage.test.tsx`

**Interfaces:**
- Consumes: `app.core.security.require_role`, `app.db.pool.acquire_as`, 테이블 `system_error_log(id, occurred_at, feature, message)`, 직원 웹의 기존 API 클라이언트(`frontend/src/api/` — 2단계 Task 5 패턴)
- Produces: `GET /error-logs?from=&to=` (admin 전용, 최신순 최대 200건, 각 항목 `{id, occurred_at, feature, message}`), `ErrorLogPage` 컴포넌트(`/admin/errors` 라우트)

- [ ] **Step 1: 실패하는 백엔드 테스트 작성**

`backend/tests/test_error_logs_router.py`:
```python
import pytest

from tests.conftest import seed_staff
from tests.scenarios.conftest import bearer


@pytest.mark.asyncio
async def test_admin_can_list_error_logs_receptionist_cannot(client, committed_conn):
    admin = await seed_staff(committed_conn, role="admin")
    receptionist = await seed_staff(committed_conn, role="receptionist")
    await committed_conn.execute(
        "insert into system_error_log (feature, message) values ('예약 생성', '테스트 오류')"
    )

    res = client.get("/error-logs", headers=bearer(admin["auth_user_id"]))
    assert res.status_code == 200
    logs = res.json()
    assert any(l["feature"] == "예약 생성" and l["message"] == "테스트 오류" for l in logs)
    assert all({"id", "occurred_at", "feature", "message"} <= set(l) for l in logs)

    res = client.get("/error-logs", headers=bearer(receptionist["auth_user_id"]))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_error_logs_date_filter(client, committed_conn):
    admin = await seed_staff(committed_conn, role="admin")
    await committed_conn.execute(
        "insert into system_error_log (occurred_at, feature, message) "
        "values ('2026-01-01T09:00:00+09:00', '통계 조회', '과거 오류')"
    )
    res = client.get("/error-logs?from=2026-07-01&to=2026-12-31", headers=bearer(admin["auth_user_id"]))
    assert res.status_code == 200
    assert not any(l["feature"] == "통계 조회" for l in res.json())
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `cd backend && pytest tests/test_error_logs_router.py -v`
Expected: FAIL (404 — 라우터 없음)

- [ ] **Step 3: 백엔드 라우터 구현**

`backend/app/routers/error_logs.py`:
```python
from datetime import date

from fastapi import APIRouter, Depends

from app.core.security import StaffContext, require_role
from app.db.pool import acquire_as

router = APIRouter(prefix="/error-logs", tags=["error-logs"])


@router.get("")
async def list_error_logs(
    from_: date | None = None,
    to: date | None = None,
    staff: StaffContext = Depends(require_role("admin")),
) -> list[dict]:
    query = "select id, occurred_at, feature, message from system_error_log"
    conditions, params = [], []
    if from_ is not None:
        params.append(from_)
        conditions.append(f"occurred_at >= ${len(params)}")
    if to is not None:
        params.append(to)
        conditions.append(f"occurred_at < ${len(params)}::date + interval '1 day'")
    if conditions:
        query += " where " + " and ".join(conditions)
    query += " order by occurred_at desc limit 200"
    async with acquire_as(str(staff.auth_user_id)) as conn:
        rows = await conn.fetch(query, *params)
    return [
        {"id": str(r["id"]), "occurred_at": r["occurred_at"].isoformat(),
         "feature": r["feature"], "message": r["message"]}
        for r in rows
    ]
```

주: FastAPI에서 쿼리 파라미터 이름 `from`은 예약어이므로 `from_`에 `Query(None, alias="from")`을 붙인다:
```python
from fastapi import Query
# 시그니처를 다음으로 교체
    from_: date | None = Query(None, alias="from"),
```

`backend/app/main.py`에 등록:
```python
from app.routers import error_logs
app.include_router(error_logs.router)
```

- [ ] **Step 4: 백엔드 테스트 통과 확인**

Run: `cd backend && pytest tests/test_error_logs_router.py -v`
Expected: PASS

- [ ] **Step 5: React 페이지 작성 (실패하는 테스트 먼저)**

`frontend/src/pages/ErrorLogPage.test.tsx` — 2단계의 기존 페이지 테스트 패턴(msw 또는 API 모킹)을 따른다:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorLogPage from "./ErrorLogPage";

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      { id: "1", occurred_at: "2026-07-27T10:00:00+09:00", feature: "예약 생성", message: "슬롯 충돌" },
    ]),
  },
}));

describe("ErrorLogPage", () => {
  it("오류 목록을 표로 표시한다", async () => {
    render(<ErrorLogPage />);
    await waitFor(() => {
      expect(screen.getByText("예약 생성")).toBeInTheDocument();
      expect(screen.getByText("슬롯 충돌")).toBeInTheDocument();
    });
  });
});
```

`frontend/src/pages/ErrorLogPage.tsx`:
```tsx
import { useEffect, useState } from "react";
import { api } from "../api/client";

interface ErrorLog {
  id: string;
  occurred_at: string;
  feature: string;
  message: string;
}

export default function ErrorLogPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const data = await api.get(`/error-logs?${params}`);
      setLogs(data);
      setError("");
    } catch {
      setError("오류 목록을 불러오지 못했습니다. 다시 시도해주세요.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section>
      <h1>시스템 오류</h1>
      <div>
        <label>시작일 <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>종료일 <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button onClick={load}>조회</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr><th>발생 시각</th><th>기능</th><th>메시지</th></tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td>{new Date(l.occurred_at).toLocaleString("ko-KR")}</td>
              <td>{l.feature}</td>
              <td>{l.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {logs.length === 0 && !error && <p>기록된 오류가 없습니다.</p>}
    </section>
  );
}
```

`frontend/src/App.tsx`: 기존 관리자 전용 라우트 블록(2단계 Task 4의 역할 기반 라우팅)에 `/admin/errors` → `<ErrorLogPage />` 추가, 관리자 메뉴에 "시스템 오류" 링크 추가. (기존 `SchedulePage`/`StatsPage` 등록 방식과 동일하게)

- [ ] **Step 6: 웹 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/pages/ErrorLogPage.test.tsx`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add backend/app/routers/error_logs.py backend/app/main.py backend/tests/test_error_logs_router.py frontend/src/pages/ErrorLogPage.tsx frontend/src/pages/ErrorLogPage.test.tsx frontend/src/App.tsx
git commit -m "feat: 관리자용 시스템 오류 로그 조회 API·화면 추가"
```

---

### Task 9: 데모 데이터 시드 스크립트

**Files:**
- Create: `backend/scripts/__init__.py` (빈 파일)
- Create: `backend/scripts/seed_demo.py`
- Create: `backend/scripts/demo_accounts.md` (테스트 계정 목록 — 납품물)

**Interfaces:**
- Consumes: `app.db.admin_client.get_admin_client`(auth 사용자 생성), `app.db.pool.get_pool`, 전체 테이블
- Produces: CLI `python -m scripts.seed_demo [--reset]` — 멱등 실행(--reset 시 데모 데이터 삭제 후 재생성), 종료 시 생성 수량 요약 출력

- [ ] **Step 1: 스크립트 골격과 계정 생성 작성**

`backend/scripts/seed_demo.py`:
```python
"""데모 데이터 시드. 실행: python -m scripts.seed_demo [--reset]
전부 가상 인물/데이터. 실제 환자정보 사용 금지 (요구사항 6.5).
random.seed 고정으로 매 실행 동일한 데이터를 생성한다."""
import asyncio
import random
import sys
from datetime import date, timedelta

from app.db.admin_client import get_admin_client
from app.db.pool import get_pool

random.seed(42)

DEMO_TAG = "demo-hospital"  # 데모 데이터 식별용 (auth user metadata)

STAFF = [
    {"email": "admin@demo-hospital.kr", "password": "Demo!2026admin", "name": "김관리", "role": "admin", "dept": None},
    {"email": "reception1@demo-hospital.kr", "password": "Demo!2026rc1", "name": "이접수", "role": "receptionist", "dept": None},
    {"email": "reception2@demo-hospital.kr", "password": "Demo!2026rc2", "name": "박접수", "role": "receptionist", "dept": None},
    {"email": "doctor.kim@demo-hospital.kr", "password": "Demo!2026dr1", "name": "김내과", "role": "doctor", "dept": "내과"},
    {"email": "doctor.lee@demo-hospital.kr", "password": "Demo!2026dr2", "name": "이소아", "role": "doctor", "dept": "소아과"},
    {"email": "doctor.park@demo-hospital.kr", "password": "Demo!2026dr3", "name": "박피부", "role": "doctor", "dept": "피부과"},
]

PATIENTS = [
    {"phone": "01011110001", "password": "Demo!2026pt1", "name": "홍길동", "birth": "1985-03-01", "gender": "M"},
    {"phone": "01011110002", "password": "Demo!2026pt2", "name": "김영희", "birth": "1990-07-15", "gender": "F"},
    {"phone": "01011110003", "password": "Demo!2026pt3", "name": "이철수", "birth": "1958-11-20", "gender": "M"},
    {"phone": "01011110004", "password": "Demo!2026pt4", "name": "박민지", "birth": "2001-02-05", "gender": "F"},
    {"phone": "01011110005", "password": "Demo!2026pt5", "name": "최가족", "birth": "1980-09-09", "gender": "F"},
]
# 최가족에게는 자녀 1명을 가족으로 등록
FAMILY = {"account": "01011110005", "member": {"name": "최아이", "birth": "2019-05-05", "gender": "M", "relation": "자녀"}}

DEPARTMENTS = ["내과", "소아과", "피부과"]

KB_DOCUMENTS = [
    ("진료 시간 안내", "평일 09:00~18:00, 점심시간 12:30~14:00, 토요일 09:00~13:00, 일요일·공휴일 휴진입니다."),
    ("주차 안내", "건물 지하 1~2층 주차장을 이용하실 수 있으며, 진료 확인 시 2시간 무료입니다."),
    ("위치와 오시는 길", "지하철 2호선 데모역 3번 출구에서 도보 5분, 데모타워 3층입니다."),
    ("예약 방법", "앱, 전화(02-000-0000), 방문 접수로 예약하실 수 있습니다."),
    ("예약 취소 규정", "예약 시간 기준 마감 시간 이전까지 앱 또는 전화로 취소하실 수 있습니다."),
    ("사전문진 안내", "예약 후 앱에서 사전문진을 작성하시면 진료가 더 빨라집니다."),
    ("내과 진료 안내", "감기, 소화기 질환, 만성질환(고혈압·당뇨) 관리를 진료합니다."),
    ("소아과 진료 안내", "영유아 검진, 예방접종, 소아 질환을 진료합니다."),
    ("피부과 진료 안내", "피부 질환, 알레르기, 두드러기 등을 진료합니다."),
    ("건강검진 안내", "기본 건강검진은 내과에서 예약 후 받으실 수 있습니다. 검진 전 8시간 금식이 필요합니다."),
    ("증명서 발급", "진단서·소견서는 진료 후 접수창구에서 발급받으실 수 있습니다."),
    ("보험 청구 서류", "진료비 세부내역서와 영수증은 접수창구에서 발급됩니다."),
    ("독감 예방접종", "매년 10월부터 독감 예방접종을 시행합니다. 예약 없이 방문 가능합니다."),
    ("처방전 재발급", "처방전 재발급은 진료했던 의사의 확인 후 가능합니다. 전화로 문의해주세요."),
    ("휠체어·유모차 안내", "병원 입구와 원내에서 휠체어를 무료로 대여하실 수 있습니다."),
]


async def reset(pool, admin):
    """데모 데이터만 삭제 (demo-hospital.kr 계정과 01011110* 환자 기준)."""
    async with pool.acquire() as conn:
        for table in (
            "answer_feedback", "chat_messages", "chat_conversations", "support_tickets",
            "kb_chunks", "kb_documents",
            "medical_record_revisions", "medical_records", "questionnaire_responses",
            "appointment_status_history", "appointments", "appointment_slots",
            "device_tokens", "patient_family_links", "patients",
            "doctor_schedule_exceptions", "doctor_schedule_rules",
            "questionnaire_templates", "patient_internal_notes",
            "access_audit_log", "system_error_log", "staff", "departments",
        ):
            await conn.execute(f"delete from {table}")
    users = admin.auth.admin.list_users()
    for u in users:
        if (u.email or "").endswith("@demo-hospital.kr") or (u.phone or "").startswith("821011110"):
            admin.auth.admin.delete_user(u.id)


async def main(do_reset: bool):
    pool = await get_pool()
    admin = get_admin_client()
    if do_reset:
        await reset(pool, admin)

    async with pool.acquire() as conn:
        # 1) 진료과
        dept_ids = {}
        for name in DEPARTMENTS:
            dept_ids[name] = await conn.fetchval(
                "insert into departments (name) values ($1) returning id", name)

        # 2) 직원 (auth 사용자 + staff 행)
        staff_ids = {}
        for s in STAFF:
            user = admin.auth.admin.create_user({
                "email": s["email"], "password": s["password"], "email_confirm": True,
                "user_metadata": {"seed": DEMO_TAG},
            })
            staff_ids[s["email"]] = await conn.fetchval(
                "insert into staff (auth_user_id, name, role, department_id) "
                "values ($1, $2, $3, $4) returning id",
                user.user.id, s["name"], s["role"],
                dept_ids.get(s["dept"]) if s["dept"] else None,
            )

        # 3) 환자 (전화 auth + patients 행)
        patient_ids = {}
        for p in PATIENTS:
            user = admin.auth.admin.create_user({
                "phone": "82" + p["phone"][1:], "password": p["password"], "phone_confirm": True,
                "user_metadata": {"seed": DEMO_TAG},
            })
            patient_ids[p["phone"]] = await conn.fetchval(
                "insert into patients (auth_user_id, name, birth_date, gender, phone) "
                "values ($1, $2, $3, $4, $5) returning id",
                user.user.id, p["name"], date.fromisoformat(p["birth"]), p["gender"], p["phone"],
            )

        # 4) 가족 등록 (계정 없는 가족 구성원)
        child_id = await conn.fetchval(
            "insert into patients (name, birth_date, gender, phone) values ($1, $2, $3, $4) returning id",
            FAMILY["member"]["name"], date.fromisoformat(FAMILY["member"]["birth"]),
            FAMILY["member"]["gender"], "01011110005",
        )
        await conn.execute(
            "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1, $2, $3)",
            patient_ids[FAMILY["account"]], child_id, FAMILY["member"]["relation"],
        )

        # 5) 의사 일정 규칙 (평일 09-12, 14-17 / 30분 슬롯) + 3주 전~2주 후 슬롯 생성
        doctors = [(staff_ids[s["email"]], dept_ids[s["dept"]]) for s in STAFF if s["role"] == "doctor"]
        for doctor_id, _ in doctors:
            for weekday in range(5):
                await conn.execute(
                    "insert into doctor_schedule_rules (doctor_id, weekday, start_time, end_time, "
                    "slot_duration_minutes, lunch_start, lunch_end, max_daily_appointments, booking_deadline) "
                    "values ($1, $2, '09:00', '17:00', 30, '12:00', '14:00', 12, '1 hour')",
                    doctor_id, weekday,
                )
        today = date.today()
        slot_times = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
                      "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"]
        all_slots = []  # (slot_id, doctor_id, dept_id, slot_date)
        for offset in range(-21, 15):
            d = today + timedelta(days=offset)
            if d.weekday() >= 5:
                continue
            for doctor_id, dept_id in doctors:
                for t in slot_times:
                    slot_id = await conn.fetchval(
                        "insert into appointment_slots (doctor_id, slot_date, start_time) "
                        "values ($1, $2, $3) returning id",
                        doctor_id, d, t,
                    )
                    all_slots.append((slot_id, doctor_id, dept_id, d))

        # 6) 예약·진료기록: 과거 슬롯 60%는 진료완료(+기록), 5%는 예약부도, 미래 슬롯 30%는 예약확정
        reception_id = staff_ids["reception1@demo-hospital.kr"]
        all_patient_ids = list(patient_ids.values()) + [child_id]
        symptoms_pool = ["기침과 미열", "복통", "두통", "피부 발진", "콧물과 재채기", "허리 통증"]
        diagnosis_pool = ["감기", "급성 위염", "긴장성 두통", "접촉성 피부염", "알레르기 비염", "요추 염좌"]
        counts = {"past_completed": 0, "no_show": 0, "future_confirmed": 0}
        for slot_id, doctor_id, dept_id, d in all_slots:
            roll = random.random()
            if d < today and roll < 0.60:
                status_final, key = "진료완료", "past_completed"
            elif d < today and roll < 0.65:
                status_final, key = "예약부도", "no_show"
            elif d >= today and roll < 0.30:
                status_final, key = "예약확정", "future_confirmed"
            else:
                continue
            pid = random.choice(all_patient_ids)
            await conn.execute("update appointment_slots set status = '예약됨' where id = $1", slot_id)
            appointment_id = await conn.fetchval(
                "insert into appointments (slot_id, account_patient_id, for_patient_id, department_id, "
                "doctor_id, reason, status, source, created_by) "
                "values ($1, $2, $2, $3, $4, $5, $6, $7, $8) returning id",
                slot_id, pid, dept_id, doctor_id,
                random.choice(symptoms_pool), status_final,
                random.choice(["app", "staff", "chatbot"]), reception_id,
            )
            counts[key] += 1
            if status_final == "진료완료":
                i = random.randrange(len(symptoms_pool))
                await conn.execute(
                    "insert into medical_records (appointment_id, doctor_id, symptoms, diagnosis, "
                    "treatment, patient_visible_notes, is_completed) "
                    "values ($1, $2, $3, $4, '약 처방 3일', '무리하지 말고 푹 쉬세요.', true)",
                    appointment_id, doctor_id, symptoms_pool[i], diagnosis_pool[i],
                )

        # 7) 상담봇 지식 문서 (승인 상태 — 4단계 kb_documents 스키마의 status check 제약: draft/approved/archived)
        admin_id = staff_ids["admin@demo-hospital.kr"]
        for title, content in KB_DOCUMENTS:
            await conn.execute(
                "insert into kb_documents (title, content, status, approved_by, approved_at) "
                "values ($1, $2, 'approved', $3, now())",
                title, content, admin_id,
            )

    print(f"[seed_demo] 직원 {len(STAFF)}, 환자 {len(PATIENTS)}+가족 1, "
          f"진료과 {len(DEPARTMENTS)}, 슬롯 {len(all_slots)}, 예약 {counts}, 지식문서 {len(KB_DOCUMENTS)}")


if __name__ == "__main__":
    asyncio.run(main(do_reset="--reset" in sys.argv))
```

주: `kb_documents`의 실제 칼럼/상태값은 4단계 구현을 따른다. 임베딩(kb_chunks)은 4단계의 재임베딩 로직을 시드 후 1회 호출한다 — 4단계 구현에서 제공하는 함수명으로 이 스크립트 마지막에 추가할 것.

- [ ] **Step 2: 로컬 실행으로 검증**

Run: `cd backend && python -m scripts.seed_demo --reset`
Expected: 요약 출력 (직원 6, 환자 5+1, 슬롯 수백, 예약 counts 3종 모두 0보다 큼, 지식문서 15)

- [ ] **Step 3: 정합성 쿼리로 확인**

Run: `cd backend && python -c "
import asyncio
from app.db.pool import get_pool
async def check():
    pool = await get_pool()
    async with pool.acquire() as conn:
        dup = await conn.fetchval('''select count(*) from (
            select slot_id from appointments where slot_id is not null
            and status not in ('환자취소','병원취소') group by slot_id having count(*) > 1) x''')
        orphan = await conn.fetchval('''select count(*) from medical_records mr
            left join appointments a on a.id = mr.appointment_id where a.id is null''')
        print('중복 슬롯 예약:', dup, '/ 고아 진료기록:', orphan)
asyncio.run(check())
"`
Expected: `중복 슬롯 예약: 0 / 고아 진료기록: 0`

- [ ] **Step 4: 재실행 멱등성 확인**

Run: `cd backend && python -m scripts.seed_demo --reset && python -m scripts.seed_demo --reset`
Expected: 두 번째 실행도 같은 요약으로 정상 종료 (오류 없음)

- [ ] **Step 5: 테스트 계정 문서 작성**

`backend/scripts/demo_accounts.md`: 위 STAFF/PATIENTS의 이메일·전화번호·비밀번호·역할을 표로 정리하고, 최상단에 "전원 가상 인물이며 데모 전용" 명시. (이 파일은 데모용 저장소에만 두는 것이므로 커밋 허용 — 실서비스 전환 시 삭제 대상이라고 명시)

- [ ] **Step 6: 전체 테스트 회귀 확인 후 커밋**

Run: `cd backend && pytest -x -q`
Expected: 전부 PASS (시드가 테스트 DB를 오염시켰다면 시드는 별도 DB 또는 `--reset`로 정리 후 실행)

```bash
git add backend/scripts/
git commit -m "feat: 데모 데이터 시드 스크립트와 테스트 계정 문서 추가"
```

---

### Task 10: 앱 릴리즈 빌드 설정 (서명 준비 + 환경 분리)

**Files:**
- Create: `mobile/android/key.properties.example`
- Modify: `mobile/android/app/build.gradle` (signingConfigs)
- Modify: `mobile/android/.gitignore` (`key.properties`, `*.keystore` 추가)
- Modify: `mobile/ios/Runner/Info.plist` (권한 문구)
- Create: `mobile/scripts/build_release.sh`
- Modify: `mobile/pubspec.yaml` (`flutter_launcher_icons` dev dependency + 설정)

**Interfaces:**
- Consumes: `mobile/lib/core/env.dart`의 `Env.apiBaseUrl` 등(3단계 Task 14 — `--dart-define` 주입)
- Produces: `./mobile/scripts/build_release.sh apk|appbundle` (프로덕션 서버 주소로 서명된 빌드 생성)

- [ ] **Step 1: 안드로이드 서명 키 생성 (로컬 1회, 커밋 금지)**

Run:
```bash
keytool -genkey -v -keystore ~/keys/hospital-demo-release.keystore \
  -alias hospital-demo -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass '<사용자가 정한 암호>' -dname "CN=Hospital Demo, O=VCU Assignment, C=KR"
```
Expected: keystore 파일 생성. **암호는 사용자에게 안전한 곳(비밀번호 관리자)에 보관하도록 안내.**

- [ ] **Step 2: key.properties 예시 파일과 .gitignore**

`mobile/android/key.properties.example`:
```properties
storeFile=/Users/<username>/keys/hospital-demo-release.keystore
storePassword=<keystore 암호>
keyAlias=hospital-demo
keyPassword=<keystore 암호>
```
실제 `mobile/android/key.properties`는 이 예시를 복사해 실값을 채운다(커밋 금지). `mobile/android/.gitignore`에 추가:
```
key.properties
*.keystore
```

- [ ] **Step 3: build.gradle 서명 설정**

`mobile/android/app/build.gradle`의 `android {` 블록 위에:
```groovy
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```
`android {` 블록 안에:
```groovy
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
```
`applicationId`를 `com.vcuhospital.patient`로 변경. `versionName "1.0.0"`, `versionCode 1` 확인.

- [ ] **Step 4: iOS 심사 준비 설정**

`mobile/ios/Runner/Info.plist`:
- `CFBundleDisplayName` → `데모병원`
- Bundle Identifier(Xcode 프로젝트 설정) → `com.vcuhospital.patient`
- 푸시 알림은 capability로 처리(문구 불필요). 앱이 카메라·사진·위치를 쓰지 않으므로 해당 Usage Description은 추가하지 않는다 — 심사에서 미사용 권한 문구는 오히려 리젝 사유.

- [ ] **Step 5: 앱 아이콘 설정**

`mobile/pubspec.yaml`에:
```yaml
dev_dependencies:
  flutter_launcher_icons: ^0.14.1

flutter_launcher_icons:
  android: true
  ios: true
  image_path: "assets/icon/app_icon.png"
```
`mobile/assets/icon/app_icon.png`: 1024×1024 단색 배경+십자 모양의 간단한 데모 아이콘을 준비(디자인 도구 없이 파이썬 Pillow로 생성해도 됨).
Run: `cd mobile && dart run flutter_launcher_icons`
Expected: android/ios 아이콘 리소스 생성

- [ ] **Step 6: 릴리즈 빌드 스크립트**

`mobile/scripts/build_release.sh`:
```bash
#!/usr/bin/env bash
# 사용법: ./scripts/build_release.sh apk|appbundle
# PROD_API_URL 등은 환경변수로 주입: PROD_API_URL=https://xxx.up.railway.app ./scripts/build_release.sh apk
set -euo pipefail
TARGET="${1:-apk}"
: "${PROD_API_URL:?PROD_API_URL 환경변수를 설정하세요}"
: "${PROD_SUPABASE_URL:?PROD_SUPABASE_URL 환경변수를 설정하세요}"
: "${PROD_SUPABASE_ANON_KEY:?PROD_SUPABASE_ANON_KEY 환경변수를 설정하세요}"

flutter build "$TARGET" --release \
  --dart-define=API_BASE_URL="$PROD_API_URL" \
  --dart-define=SUPABASE_URL="$PROD_SUPABASE_URL" \
  --dart-define=SUPABASE_ANON_KEY="$PROD_SUPABASE_ANON_KEY"
```
Run: `chmod +x mobile/scripts/build_release.sh`

- [ ] **Step 7: 로컬 검증 빌드 (서버 주소는 임시값)**

Run: `cd mobile && PROD_API_URL=http://localhost:8000 PROD_SUPABASE_URL=http://localhost:54321 PROD_SUPABASE_ANON_KEY=dummy ./scripts/build_release.sh apk`
Expected: `✓ Built build/app/outputs/flutter-apk/app-release.apk` (서명된 릴리즈 빌드 성공)

- [ ] **Step 8: 커밋**

```bash
git add mobile/android/key.properties.example mobile/android/.gitignore mobile/android/app/build.gradle mobile/ios/Runner/Info.plist mobile/pubspec.yaml mobile/assets/icon/ mobile/scripts/build_release.sh
git commit -m "feat: 앱 릴리즈 서명 설정·아이콘·빌드 스크립트 추가"
```

---

### Task 11: GitHub Actions CI (테스트 게이트)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `backend/` pytest 스위트, `frontend/` vitest+build, `mobile/` flutter analyze/test
- Produces: push/PR 시 3개 job(backend, frontend, mobile)이 실행되는 `CI` 워크플로 — Task 17의 배포 게이트가 이 체크 이름을 참조

- [ ] **Step 1: 워크플로 작성**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - uses: supabase/setup-cli@v1
      - name: Start local Supabase
        run: supabase start
      - name: Install deps
        run: pip install -r backend/requirements.txt
      - name: Run tests
        working-directory: backend
        run: pytest -q
        env:
          # supabase start가 출력하는 로컬 기본값 (secrets 아님 — 로컬 전용 공개 키)
          DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
          SUPABASE_URL: http://127.0.0.1:54321
          SUPABASE_JWT_SECRET: super-secret-jwt-token-with-at-least-32-characters-long
          SUPABASE_ANON_KEY: ${{ env.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ env.SUPABASE_SERVICE_ROLE_KEY }}

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
        working-directory: frontend
      - run: npx vitest run
        working-directory: frontend
      - run: npm run build
        working-directory: frontend

  mobile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
      - run: flutter pub get
        working-directory: mobile
      - run: flutter analyze
        working-directory: mobile
      - run: flutter test
        working-directory: mobile
```

주: backend job의 anon/service role 키는 `supabase start` 출력에서 파싱해 `$GITHUB_ENV`로 넘기는 스텝을 추가한다:
```yaml
      - name: Export local Supabase keys
        run: |
          supabase status -o env | grep -E 'ANON_KEY|SERVICE_ROLE_KEY' >> "$GITHUB_ENV"
```
(이 스텝을 `Start local Supabase` 직후에 배치. `supabase status -o env`의 실제 키 이름이 다르면 출력을 확인해 맞춘다.)

- [ ] **Step 2: 푸시해서 CI 통과 확인**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: backend/frontend/mobile 테스트 게이트 워크플로 추가"
git push origin main
```
Run: `gh run watch`
Expected: 3개 job 전부 성공. 실패하면 로그를 보고 수정(특히 supabase 키 파싱 스텝) 후 재푸시.

---

## ★ 사용자 승인 관문

### Task 12: 마이그레이션 검토 요청 (사용자 승인 전 원격 작업 금지)

**Files:** 없음 (보고 전용)

- [ ] **Step 1: 마이그레이션 요약 생성**

Run: `ls supabase/migrations/ && for f in supabase/migrations/*.sql; do echo "== $f"; grep -E "^create table|^alter table|^create policy|^create or replace function|^create view" "$f" | head -20; done`

- [ ] **Step 2: 사용자에게 보고하고 승인 대기**

다음을 정리해 사용자에게 제시한다: ① 적용될 마이그레이션 파일 목록과 각각이 만드는 테이블/정책 요약, ② 원격 Supabase 프로젝트에 적용된다는 것의 의미(새 프로젝트라 기존 데이터 없음), ③ 적용 명령(`supabase db push`). **사용자가 "적용 OK"라고 명시적으로 답하기 전까지 Task 13 이후를 진행하지 않는다.** `PushNotification`으로 결정 대기 상태를 알린다.

---

## 2구간 — 클라우드 구성 (승인 후)

> 외부 플랫폼 설정 전 `~/.claude/external-platform-setup-playbook.md`를 먼저 읽는다 (Railway/Vercel/Supabase 실전 함정 정리본). 플랫폼 화면·기능은 바뀔 수 있으므로 문서와 다르면 실제 대시보드 기준으로 진행한다.

### Task 13: Supabase 원격 프로젝트 구성

**Files:**
- Create: `backend/.env.example` (필요한 환경변수 이름 전체 목록 — 값 없음)

**Interfaces:**
- Produces: 원격 Supabase 프로젝트(마이그레이션 적용·시드 완료), Storage 비공개 버킷 `backups`, `.env.example`

- [ ] **Step 1: 프로젝트 생성·연결**

Supabase 대시보드에서 새 프로젝트 생성(리전: Northeast Asia (Seoul), DB 암호는 사용자가 생성·보관). 이후:
```bash
supabase link --project-ref <프로젝트 ref>
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db push`
Expected: 1~4단계의 모든 마이그레이션이 순서대로 적용됨.
검증(파일 작성 ≠ 실제 적용이므로 반드시 테이블 존재를 직접 확인):
```bash
supabase db remote exec "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || psql "$REMOTE_DATABASE_URL" -c "\dt public.*"
```
Expected: `appointments`, `medical_records`, `kb_documents` 등 전체 테이블 존재

- [ ] **Step 3: Auth 설정 (대시보드)**

- Email 로그인 활성화 (직원용)
- Phone 로그인 활성화 + SMS 제공자로 Twilio 연결 (환자 OTP용 — 3단계 회원가입 흐름). Twilio 계정 SID/토큰은 대시보드에만 입력
- 실제 OTP 발송 1회 테스트: 대시보드 또는 curl로 test OTP 발송 확인

- [ ] **Step 4: Storage 백업 버킷 생성**

대시보드 → Storage → New bucket: 이름 `backups`, **Private** (public 체크 해제). 접근 정책 추가 없음(service role만 사용).

- [ ] **Step 5: 데모 시드 실행 (원격 대상)**

Run: `cd backend && DATABASE_URL=<원격 DB URL> SUPABASE_URL=<원격 URL> SUPABASE_SERVICE_ROLE_KEY=<원격 키> python -m scripts.seed_demo`
Expected: 로컬과 동일한 요약 출력. Supabase 대시보드 Table Editor에서 `appointments` 행 수백 건 확인.

- [ ] **Step 6: .env.example 작성·커밋**

`backend/.env.example`:
```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
DATABASE_URL=
# 알림
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
FCM_SERVICE_ACCOUNT_JSON=
# AI 상담봇 (4단계)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
# 백업
BACKUP_BUCKET=backups
```
```bash
git add backend/.env.example
git commit -m "docs: 백엔드 환경변수 목록(.env.example) 추가"
```

---

### Task 14: Railway 백엔드 배포

**Files:**
- Create: `backend/railway.json`
- Create: `backend/Procfile` (또는 railway.json의 startCommand — 하나만)

**Interfaces:**
- Produces: 인터넷에서 접속 가능한 백엔드 주소 `https://<서비스>.up.railway.app` (이후 Task 15/16/18/19가 사용)

- [ ] **Step 1: 시작 명령 정의**

`backend/railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 2: Railway 프로젝트 생성 + GitHub 연결**

Railway 대시보드 → New Project → Deploy from GitHub repo → 이 저장소 선택, Root Directory를 `backend/`로 설정.

- [ ] **Step 3: 환경변수 입력**

Task 13의 `.env.example` 목록 전체를 Railway Variables 화면에 실값으로 입력 (원격 Supabase 값, Twilio, FCM, Anthropic, OpenAI).

- [ ] **Step 4: 배포 확인**

Run: `curl https://<서비스>.up.railway.app/health`
Expected: `{"status":"ok"}`

Run: `curl https://<서비스>.up.railway.app/app/departments`
Expected: 401 (인증 요구 — 라우터가 살아있고 보호도 동작)

- [ ] **Step 5: 커밋**

```bash
git add backend/railway.json
git commit -m "deploy: Railway 배포 설정 추가"
git push origin main
```

---

### Task 15: Vercel 배포 — 직원 웹 + 상담봇 webchat 앱 + 위젯 데모 페이지

**Files:**
- Create: `frontend/.env.example` (`VITE_API_BASE_URL=`, `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`)
- Create: `widget-demo/index.html`

**Interfaces:**
- Consumes: 4단계 상담봇 산출물 — **확정 계약**(4단계 문서와 합의됨): ① 독립 `webchat/` Vite 웹앱(상담 화면 자체), ② 그것을 iframe으로 띄우는 얇은 로더 `webchat/dist/widget.js`, 전역 초기화 `HospitalChatWidget.init({ webchatUrl })`(우하단 플로팅 버튼 삽입, 클릭 시 webchatUrl을 iframe으로 로드)
- Produces: 직원 웹 주소 `https://<프로젝트>.vercel.app`, webchat 앱 주소 `https://<webchat>.vercel.app`, 위젯 데모 주소 `https://<위젯데모>.vercel.app`

> 위 계약은 확정됐지만, 실행 시점에 `webchat/dist/` 실제 산출물 파일명과 초기화 옵션을 한 번 가볍게 대조한 뒤 진행한다(어긋나면 실제 구현 쪽 기준 — Global Constraints 마지막 항목과 동일 원칙).

- [ ] **Step 1: 직원 웹 Vercel 프로젝트 생성**

Vercel 대시보드 → Add New Project → 저장소 선택, Root Directory `frontend/`, Framework Preset: Vite. 환경변수 3개 입력(`VITE_API_BASE_URL`=Railway 주소, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

- [ ] **Step 2: SPA 라우팅 설정 확인**

React Router 새로고침 404 방지: `frontend/vercel.json`이 없다면 생성:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

- [ ] **Step 3: 직원 웹 접속 검증**

브라우저에서 `https://<프로젝트>.vercel.app` 접속 → 로그인 화면 표시 → 데모 관리자 계정(`admin@demo-hospital.kr`)으로 로그인 → 오늘의 현황 화면 로드 확인.

- [ ] **Step 4: webchat 앱 Vercel 프로젝트 생성·검증**

Vercel → Add New Project → 같은 저장소, Root Directory `webchat/`, Framework Preset: Vite. 환경변수 입력(4단계 `webchat/.env.example` 기준 — API 주소=Railway 주소, Supabase URL·anon key).
배포 후 `https://<webchat>.vercel.app`에 직접 접속 → 상담 화면이 뜨고 질문·답변이 동작하는지 확인.
**백엔드 CORS 확인**: 백엔드의 허용 오리진(allowed origins) 목록에 이 webchat 배포 주소가 포함돼야 브라우저에서 API 호출이 된다. 누락 시 Railway 환경변수(또는 백엔드 CORS 설정 — 실제 구현 기준)에 추가 후 재배포.

- [ ] **Step 5: 위젯 데모 페이지 작성**

`widget-demo/index.html`:
```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>데모병원 상담봇 체험 페이지</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; }
  </style>
</head>
<body>
  <h1>데모병원 홈페이지 (상담봇 체험용)</h1>
  <p>이 페이지는 병원 홈페이지에 상담봇 위젯이 올라간 모습을 시연하기 위한 데모입니다.
     오른쪽 아래 말풍선 버튼을 눌러 상담을 시작하세요.</p>
  <script src="./widget.js"></script>
  <script>
    /* 로더가 우하단 플로팅 버튼을 만들고, 클릭 시 webchatUrl을 iframe으로 띄운다 */
    HospitalChatWidget.init({ webchatUrl: "%WEBCHAT_URL%" });
  </script>
</body>
</html>
```
빌드된 로더를 복사: `cp webchat/dist/widget.js widget-demo/widget.js`. `%WEBCHAT_URL%`은 Step 4의 실제 webchat 배포 주소(`https://<webchat>.vercel.app`)로 치환.

- [ ] **Step 6: 위젯 데모 Vercel 프로젝트 생성·검증**

Vercel → Add New Project → Root Directory `widget-demo/`, Framework: Other(정적). 배포 후 접속해 우하단 말풍선 버튼 클릭 → iframe으로 webchat이 열림 → "진료 시간 알려주세요" 질문 → 지식 문서 기반 답변 확인.

- [ ] **Step 7: 커밋**

```bash
git add frontend/.env.example frontend/vercel.json widget-demo/
git commit -m "deploy: Vercel 직원 웹·webchat 앱 설정과 상담봇 위젯 데모 페이지 추가"
git push origin main
```

---

### Task 16: Railway cron 2종 등록 + 백업 복구 리허설

**Files:** 없음 (플랫폼 설정 + 리허설)

**Interfaces:**
- Consumes: `python -m app.jobs.reminders`(Task 6), `python -m app.jobs.backup`(Task 7)
- Produces: 매일 자동 실행되는 크론 2개, 복구 절차 검증 완료

- [ ] **Step 1: 알림 크론 서비스 생성**

Railway 프로젝트 → New Service → 같은 저장소, Root Directory `backend/`. Settings → Cron Schedule: `0 23 * * *` (= 08:00 KST). Start Command: `python -m app.jobs.reminders`. 환경변수는 백엔드 서비스와 동일하게 입력(Railway의 Shared Variables 기능이 있으면 사용).

- [ ] **Step 2: 백업 크론 서비스 생성**

같은 방식으로 Cron Schedule `0 18 * * *` (= 03:00 KST), Start Command `python -m app.jobs.backup`.
주: Nixpacks 환경에 `pg_dump`가 없으면 `backend/nixpacks.toml`을 추가해 postgresql 클라이언트를 설치한다:
```toml
[phases.setup]
nixPkgs = ["...", "postgresql_16"]
```

- [ ] **Step 3: 수동 트리거로 즉시 검증**

Railway에서 각 크론 서비스 "Run now"(수동 실행) → 로그 확인:
- 알림: `[reminders] {'reminder_today': N, ...}` 출력 + 데모 환자 기기 또는 SMS 수신 확인(내일자 예약확정 데이터가 시드에 존재)
- 백업: `[backup] uploaded backup-....sql.gz` 출력 + Supabase Storage `backups` 버킷에 파일 존재 확인

- [ ] **Step 4: 백업 복구 리허설 (필수 — 복원 안 되는 백업은 백업이 아님)**

```bash
# 1) 최신 백업 다운로드 (Supabase 대시보드 또는 CLI)
# 2) 로컬 임시 DB에 복원
createdb restore_rehearsal
gunzip -c backup-<날짜>.sql.gz | psql restore_rehearsal
# 3) 검증
psql restore_rehearsal -c "select count(*) from appointments; select count(*) from medical_records;"
# 4) 정리
dropdb restore_rehearsal
```
Expected: 복원된 행 수가 원격 DB와 일치. 이 절차·결과를 Task 20의 `install-backup.md`에 그대로 기록한다.

---

### Task 17: 자동 배포에 CI 게이트 연결

**Files:** 없음 (플랫폼 설정)

- [ ] **Step 1: Railway — CI 통과 대기 설정**

Railway 서비스 Settings → "Wait for CI" (GitHub check 통과 후 배포) 활성화. 항목이 없거나 이름이 다르면 실제 대시보드에서 유사 설정을 찾는다(플랫폼 UI 변경 가능).

- [ ] **Step 2: Vercel — CI 게이트**

Vercel은 기본적으로 push마다 즉시 빌드한다. Project Settings → Git에서 "Only build production if checks pass" 유형 설정이 있으면 활성화. 없으면 대안으로 Ignored Build Step에 `git log -1 --pretty=%B | grep -qv '\[skip-deploy\]'` 같은 규칙 대신 **GitHub Actions에서 CI 성공 후 Vercel CLI로 배포하는 방식으로 전환**한다 — 이 경우 `.github/workflows/ci.yml`에 deploy job을 추가:
```yaml
  deploy-frontend:
    needs: [backend, frontend, mobile]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }} --cwd frontend
```
(Vercel 프로젝트의 Git 자동 배포는 끄고, `VERCEL_TOKEN`은 GitHub 저장소 Secrets에 등록)

- [ ] **Step 3: 동작 검증**

사소한 커밋(README 오타 수정 등)을 push → CI 3개 job 성공 → 그 후에만 Railway/Vercel 배포가 시작되는지 타임라인으로 확인. 일부러 실패하는 테스트를 담은 브랜치를 push해 PR을 만들어 CI가 빨간불일 때 배포가 안 되는 것도 확인 후 브랜치 삭제.

---

### Task 18: 앱 릴리즈 빌드 산출 + GitHub Release

**Files:** 없음 (빌드 산출물은 GitHub Release에만 업로드 — 저장소에 바이너리 커밋 금지)

**Interfaces:**
- Consumes: `mobile/scripts/build_release.sh`(Task 10), Railway 주소(Task 14), 원격 Supabase 값(Task 13)
- Produces: GitHub Release `v1.0.0-demo` (app-release.apk, app-release.aab 첨부)

- [ ] **Step 1: 프로덕션 값으로 서명 빌드**

```bash
cd mobile
PROD_API_URL=https://<railway 주소> \
PROD_SUPABASE_URL=https://<ref>.supabase.co \
PROD_SUPABASE_ANON_KEY=<anon key> \
./scripts/build_release.sh appbundle
PROD_API_URL=... PROD_SUPABASE_URL=... PROD_SUPABASE_ANON_KEY=... ./scripts/build_release.sh apk
```
Expected: `build/app/outputs/bundle/release/app-release.aab`, `build/app/outputs/flutter-apk/app-release.apk`

- [ ] **Step 2: 실기기/에뮬레이터 스모크**

안드로이드 에뮬레이터(또는 사용자 실기기)에 `adb install app-release.apk` → 데모 환자 계정 로그인 → 홈 화면·예약 목록이 **클라우드 데이터**로 로드되는지 확인.

- [ ] **Step 3: iOS 시뮬레이터 확인**

```bash
cd mobile && flutter build ios --simulator \
  --dart-define=API_BASE_URL=https://<railway 주소> \
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon key>
flutter run -d "iPhone 15" --release <같은 dart-define 3개>
```
Expected: 시뮬레이터에서 로그인·예약 조회 정상. README에 이 실행 명령을 기록해 향후 재현 가능하게 한다.

- [ ] **Step 4: GitHub Release 생성**

```bash
gh release create v1.0.0-demo \
  mobile/build/app/outputs/flutter-apk/app-release.apk \
  mobile/build/app/outputs/bundle/release/app-release.aab \
  --title "데모 납품 빌드 v1.0.0" \
  --notes "안드로이드 설치: app-release.apk 다운로드 후 설치. 스토어 제출용: app-release.aab. iOS는 README의 시뮬레이터 실행법 참조. 테스트 계정: backend/scripts/demo_accounts.md"
```
Expected: Release 페이지에 파일 2개 첨부 확인

---

## 3구간 — 검수·마무리

### Task 19: 클라우드 스모크 테스트 + 보안 점검

**Files:**
- Create: `backend/scripts/smoke.py`

**Interfaces:**
- Consumes: Railway 주소, 원격 Supabase(토큰 발급), 데모 계정(Task 9)
- Produces: `python -m scripts.smoke` — 배포 환경 대상 핵심 흐름 검증 스크립트(재배포 때마다 재실행 가능)

- [ ] **Step 1: 스모크 스크립트 작성**

`backend/scripts/smoke.py`:
```python
"""배포된 클라우드 환경 스모크 테스트.
실행: SMOKE_API=https://<railway> SMOKE_SUPABASE_URL=https://<ref>.supabase.co \
     SMOKE_ANON_KEY=<anon> python -m scripts.smoke"""
import os
import sys

import httpx

API = os.environ["SMOKE_API"]
SUPABASE = os.environ["SMOKE_SUPABASE_URL"]
ANON = os.environ["SMOKE_ANON_KEY"]

ADMIN = {"email": "admin@demo-hospital.kr", "password": "Demo!2026admin"}
PATIENT = {"phone": "+821011110001", "password": "Demo!2026pt1"}


def login(payload: dict) -> str:
    res = httpx.post(
        f"{SUPABASE}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON},
        json=payload,
        timeout=15,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def check(name: str, ok: bool, detail: str = ""):
    print(f"{'✅' if ok else '❌'} {name} {detail}")
    if not ok:
        sys.exit(1)


def main():
    res = httpx.get(f"{API}/health", timeout=15)
    check("health", res.status_code == 200)

    staff_token = login(ADMIN)
    res = httpx.get(f"{API}/me", headers={"Authorization": f"Bearer {staff_token}"}, timeout=15)
    check("직원 로그인 + /me", res.status_code == 200)

    res = httpx.get(f"{API}/today-summary", headers={"Authorization": f"Bearer {staff_token}"}, timeout=15)
    check("오늘의 현황", res.status_code == 200)

    patient_token = login(PATIENT)
    ph = {"Authorization": f"Bearer {patient_token}"}
    res = httpx.get(f"{API}/app/departments", headers=ph, timeout=15)
    check("환자 진료과 조회", res.status_code == 200 and len(res.json()) >= 3)

    res = httpx.get(f"{API}/app/appointments", headers=ph, timeout=15)
    check("환자 예약 목록", res.status_code == 200)

    # 권한 경계: 환자 토큰으로 직원 API
    res = httpx.get(f"{API}/today-summary", headers=ph, timeout=15)
    check("환자→직원 API 차단", res.status_code in (401, 403))

    # 미인증
    res = httpx.get(f"{API}/error-logs", timeout=15)
    check("미인증 차단", res.status_code == 401)

    print("스모크 테스트 전체 통과")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행해 전체 통과 확인**

Run: `cd backend && SMOKE_API=... SMOKE_SUPABASE_URL=... SMOKE_ANON_KEY=... python -m scripts.smoke`
Expected: 모든 항목 ✅, `스모크 테스트 전체 통과`

- [ ] **Step 3: 외부 서비스 차단 실험 (요구사항 6.4 실검증)**

1. Railway Variables에서 `TWILIO_AUTH_TOKEN`과 `ANTHROPIC_API_KEY`를 일부러 잘못된 값으로 변경 → 재배포
2. 직원 웹에서 예약 생성 + 의사 진료기록 저장 → **정상 동작해야 함** (알림·상담봇 실패는 로그에만)
3. 오류 로그 화면(`/admin/errors`)에 알림 발송 실패가 기록됐는지 확인
4. 키를 원래 값으로 복원 → 재배포 → 스모크 재실행

- [ ] **Step 4: 비밀키 유출 스캔 (요구사항 6.5)**

```bash
brew install gitleaks
gitleaks detect --source . -v
```
Expected: `no leaks found`. 검출되면 해당 값을 즉시 회전(rotate)하고 히스토리에서 제거한 뒤 재스캔.

추가: 배포된 직원 웹의 브라우저 개발자도구 → Sources에서 번들 검색 — `service_role`, `sk-ant-`, `TWILIO` 문자열이 없는지 확인 (프론트에 서버 키가 섞이지 않았는지).

- [ ] **Step 5: 커밋**

```bash
git add backend/scripts/smoke.py
git commit -m "test: 클라우드 스모크 테스트 스크립트 추가"
```

---

### Task 20: 납품 문서 7종 작성

**Files:**
- Create: `docs/manual/staff-guide.md`, `docs/manual/admin-guide.md`, `docs/manual/knowledge-guide.md`, `docs/manual/install-backup.md`, `docs/manual/error-check.md`, `docs/manual/scenario-checklist.md`
- Modify: `README.md`

각 문서는 **배포된 실제 화면 캡처**를 포함한다(로컬 화면 아님). 캡처는 `docs/manual/images/`에 저장. 문서별 필수 목차:

- [ ] **Step 1: `staff-guide.md`** (독자: 접수직원·의사, 비개발자 눈높이)
  1. 로그인과 비밀번호 변경 2. 오늘의 병원 현황 보는 법 3. 예약 캘린더(신규 예약·변경) 4. 환자 도착 접수와 대기 순서 관리 5. 환자 정보·과거 기록 조회 6. (의사) 진료 화면 — 대기 목록, 기록 작성·완료, 자주 쓰는 문구 7. 완료된 기록 수정과 사유 입력

- [ ] **Step 2: `admin-guide.md`** (독자: 관리자)
  1. 직원 계정 초대·사용 중지 2. 진료과·의사 일정 관리(휴진 등록과 영향 예약 재조정) 3. 운영 통계 보는 법·파일 다운로드 4. 상담 문의 관리(이관된 상담 응대) 5. 시스템 오류 화면 보는 법 6. 취소 마감 시간 등 병원 설정

- [ ] **Step 3: `knowledge-guide.md`** (독자: 관리자)
  1. 병원 안내·상담봇 지식이 답변에 쓰이는 원리(짧게) 2. 자료 추가·수정하는 화면 사용법 3. 승인 절차(수정→승인→반영) 4. 이전 내용·수정 이력 확인 5. 상담봇 답변이 이상할 때 점검 순서

- [ ] **Step 4: `install-backup.md`** (독자: 개발자·운영자)
  1. 시스템 구성도(스펙의 아키텍처 그림 재사용) 2. 처음부터 설치: Supabase 프로젝트 생성→마이그레이션→Auth 설정→Storage 버킷, Railway 서비스 3개(웹서비스+크론2), Vercel 프로젝트 2개, 환경변수 전체 목록(.env.example 기준, 각 값을 어디서 얻는지) 3. 데모 데이터 시드 실행법 4. 백업 구조(매일 03:00, 14일 보관)와 **복구 절차**(Task 16 리허설 그대로) 5. 스테이징 환경이 필요해질 때 전환 가이드 6. 앱 빌드·서명(키 관리 주의사항, iOS 계정 연결 시 절차)

- [ ] **Step 5: `error-check.md`** (독자: 관리자·운영자)
  1. 관리자 화면 "시스템 오류"에서 확인 2. Railway 로그 보는 법(백엔드·크론) 3. Vercel 로그 4. Supabase 로그 5. 증상별 1차 점검표(웹이 안 열려요/앱이 로그인이 안 돼요/알림이 안 와요/상담봇이 답을 안 해요 → 각각 어디를 먼저 보는지)

- [ ] **Step 6: `scenario-checklist.md`** (검수 대본)
  요구사항 8장의 10개 시나리오 각각을 "단계 | 수행자 | 화면/조작 | 통과 기준 | ✅" 표로 작성. 자동 테스트로 검증되는 단계는 비고에 테스트 파일명 병기. 시나리오 10은 통계 수치 자체는 `test_scenario_10_stats.py`(Task 5)로 이미 자동 검증되므로, 체크리스트에는 "화면에 같은 숫자가 보이는지"와 "CSV 다운로드 버튼이 실제로 파일을 내려받는지"만 수동 항목으로 남긴다. 시나리오 2·7(상담봇)과 푸시알림 실제 수신은 전체를 수동 확인 절차로 상세히 작성.

- [ ] **Step 7: `README.md` 갱신**
  접속 주소(직원 웹·위젯 데모·백엔드), 테스트 계정 표(demo_accounts.md 링크), 안드로이드 .apk 설치법(GitHub Release 링크), iOS 시뮬레이터 실행 명령, 로컬 개발 실행법, 문서 목차(docs/manual/), 저장소 구조.

- [ ] **Step 8: 커밋**

```bash
git add docs/manual/ README.md
git commit -m "docs: 납품 문서 7종 작성 (사용설명서·설치백업·오류확인·검수체크리스트)"
git push origin main
```

---

### Task 21: 최종 검수 — 사용자와 10개 시나리오 수행

**Files:**
- Modify: `docs/manual/scenario-checklist.md` (검수 결과 체크 기록)

- [ ] **Step 1: 검수 준비**

시드 재실행으로 데모 데이터를 깨끗한 상태로 리셋(`python -m scripts.seed_demo --reset`, 원격 대상). 스모크 테스트 통과 확인. 사용자에게 검수 시작을 `PushNotification`으로 알린다.

- [ ] **Step 2: 시나리오 1~10 순차 수행**

`scenario-checklist.md`의 대본대로 사용자와 함께 하나씩 수행하고 ✅ 기록. 실패 항목은 즉시 중단하지 말고 전체를 끝까지 돌린 뒤, 실패 목록을 모아 superpowers:systematic-debugging으로 수정 → 해당 시나리오만 재검수.

- [ ] **Step 3: 검수 결과 커밋 + 마무리**

```bash
git add docs/manual/scenario-checklist.md
git commit -m "docs: 10개 완료 시나리오 최종 검수 결과 기록"
git push origin main
```

요구사항 10장의 납품 목록 10개 항목이 전부 충족됐는지 최종 대조표를 사용자에게 보고하고 5단계를 종료한다.

---

## 스펙 커버리지 확인

- 실제 클라우드 배포(Railway/Vercel/Supabase) → Task 13, 14, 15
- 자동 통합 테스트(시나리오 1,3,4,5,6,8,9,10 통계API 수치) + 수동 체크리스트(2,7, 10 화면·CSV 다운로드, 알림) → Task 1~5, 20(Step 6), 21
- 알림 스케줄러(전날·당일·사전문진, 08:00 KST) → Task 6, 16
- 백업(pg_dump, 14일, 복구 리허설) → Task 7, 16
- 오류 로그 화면(1~4단계 공백 메움) + 플랫폼 로그 문서화 → Task 8, 20(Step 5)
- 데모 데이터(계정, 3주 과거+미래, 지식문서 15) → Task 9
- 앱 제출 준비 빌드(서명 .aab/.apk, iOS 준비, 스토어 미제출) → Task 10, 18
- CI 게이트 + 자동 배포 → Task 11, 17
- 사용자 승인 관문(원격 DB 적용) → Task 12
- 외부 서비스 차단에도 핵심 기능 유지(6.4) 실검증 → Task 19(Step 3)
- 비밀키 관리·유출 스캔(6.5) → Task 13(Step 6), 14(Step 3), 19(Step 4)
- 납품 문서 7종·테스트 계정·설치백업·오류확인 방법(요구사항 10) → Task 9(Step 5), 20
- 10개 시나리오 최종 검수(요구사항 8·10) → Task 21
- 스테이징 미구축 + 전환 가이드 문서화 → Task 20(Step 4)



