import datetime
import json
import uuid
import pytest
import pytest_asyncio
import asyncpg
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.db import pool as app_pool


@pytest_asyncio.fixture(autouse=True)
async def _reset_app_db_pool():
    # app.db.pool은 asyncpg 풀을 모듈 전역으로 캐시하는데, pytest-asyncio는 테스트마다
    # 새 이벤트 루프를 만든다(asyncio_mode=auto, function-scope). 이전 테스트에서 만든
    # 풀이 다음 테스트의 새 루프로 넘어가면 asyncpg가 "another operation is in progress"
    # InterfaceError를 던지므로, 테스트마다 전역 풀을 닫아 다음 테스트가 자기 루프에서
    # 새로 만들도록 한다.
    yield
    try:
        await app_pool.close_pool()
    except RuntimeError:
        # 동기 TestClient 요청이 만든 임시 이벤트 루프에서 풀이 생성된 경우,
        # 그 루프가 이미 닫혀 close()가 실패할 수 있다. 다음 테스트가 새 풀을
        # 만들 수 있도록 참조만 정리한다(get_pool은 close_pool 실패 시에도
        # 전역 _pool을 None으로 되돌리지 않으므로 여기서 직접 정리한다).
        app_pool._pool = None


@pytest.fixture
def client():
    return TestClient(app)


@pytest_asyncio.fixture
async def db_pool():
    # ⚠️ 크기를 반드시 지정한다 — asyncpg 기본값은 min=max=**10**이라, 테스트마다 새로 여는
    #    이 풀과 앱 전역 풀이 각각 10개씩 잡는다. 600여 개를 연달아 돌리면 닫히는 속도가
    #    여는 속도를 못 따라가 `TooManyConnectionsError`(max_connections=100)가 나고,
    #    **매 실행마다 다른 테스트가 무작위로 깨진다**(2026-08-28에 이걸 데이터 오염으로 오인했다).
    #
    # ⭐ **timezone=Asia/Seoul을 반드시 준다** — 프로덕션 풀(app/db/pool.py:29)이 이 설정을 걸어
    #    `current_date`/`select current_date`가 병원 날짜가 되게 한다. 여기서 빠뜨리면 이 풀만
    #    서버 OS(UTC)로 돌아, KST 00~09시(UTC로 아직 어제)엔 `current_date`(UTC)와
    #    `now() at time zone 'Asia/Seoul'`가 하루 어긋나 `_TODAY_SCOPE`·미접수 판정이 깨진다
    #    (2026-08-29 새벽에 워크인·노쇼 테스트가 이걸로 빨간불이 났다). 프로덕션엔 없는 결함이다.
    pool = await asyncpg.create_pool(
        settings.database_url, min_size=1, max_size=5,
        server_settings={"timezone": "Asia/Seoul"})
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


async def seed_patient(conn, *, name="환자", phone="010-0000-0000", gender="F",
                       birth_date=datetime.date(1990, 1, 1), with_auth=True, is_active=True):
    """환자 행(+선택적으로 auth.users)을 만들고 {auth_user_id, patient_id}를 돌려준다.
    gender·birth_date는 patients에서 not null(00003, default 없음)이라 필수다 — gender 값은 'M'/'F'(Task 1·2가 쓰는 형식)."""
    auth_user_id = None
    if with_auth:
        # 이메일은 호출마다 유니크해야 한다 — id(conn)은 커넥션을 재사용하면 값이 같아
        # 한 테스트에서 seed_patient을 여러 번 부르면 users_email_partial_key에 걸린다
        # (Task 8 대기열·이력 테스트가 환자를 여럿 만든다). seed_staff와 같이 uuid로.
        auth_user_id = await conn.fetchval(
            "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
            f"{name}-{uuid.uuid4().hex}@test.local")
    patient_id = await conn.fetchval(
        "insert into patients (name, phone, gender, birth_date, auth_user_id, is_active) "
        "values ($1,$2,$3,$4,$5,$6) returning id",
        name, phone, gender, birth_date, auth_user_id, is_active)
    return {"auth_user_id": auth_user_id, "patient_id": patient_id}


async def set_session_auth(conn, auth_user_id) -> None:
    await conn.execute(
        "select set_config('request.jwt.claims', $1, true)",
        json.dumps({"sub": str(auth_user_id), "role": "authenticated"}),
    )
    await conn.execute("set local role authenticated")


# 뒷정리 순서 — **자식 → 부모**. 외래키가 NO ACTION이라 순서가 틀리면 그 자리에서 멈추고,
# 멈춘 뒤에 남은 행이 **다음 테스트로 새어 들어간다**(먼저 만든 환자가 다음 테스트의 조회에
# 먼저 잡히는 식). 2026-08-28에 실제로 이 사고가 났다 — `notification_log`가 빠져 있어
# `appointments` 삭제가 막혔고, 그 잔여물로 관계없는 테스트 3건이 깨졌다.
#
# ⚠️ **새 테이블이 patients·appointments·staff·departments를 참조하면 여기에 추가한다.**
#    빠뜨리면 조용히 넘어가지 않고 ForeignKeyViolationError로 시끄럽게 멈춘다(그게 의도다).
_CLEANUP_TABLES = (
    "access_audit_log",
    "settings_audit_log",
    "schedule_change_acks",
    "scheduled_notification_recipients",
    "scheduled_notifications",
    "notification_log",
    "notification_preferences",
    "device_tokens",
    "medical_record_revisions",
    "medical_records",
    "questionnaire_responses",
    "questionnaire_templates",  # ⚠️ 삭제금지 트리거가 걸려 있다 — 아래에서 잠시 끈다
    "appointment_status_history",
    "appointments",
    "appointment_slots",
    "patient_internal_notes",
    "family_link_requests",
    "patient_family_links",
    "patient_merges",
    "patients",
    "doctor_quick_phrases",
    "doctor_schedule_exceptions",
    "doctor_schedule_rules",
    "hospital_closures",
    "hospital_hours",
    "staff",
    "departments",
)


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_committed_data(db_pool):
    yield
    async with db_pool.acquire() as conn:
        # 문진표는 「불변 버전」이라 운영에서 지울 수 없다(결정 12, trg_forbid_..._delete).
        # 테스트 뒷정리는 그 규칙의 예외라 이 연결에서만 트리거를 끈다 — 외래키 검사는
        # 켜 둔 채다(테이블이 빠지면 조용히 넘어가지 않고 멈추게).
        await conn.execute("alter table questionnaire_templates disable trigger user")
        try:
            for table in _CLEANUP_TABLES:
                await conn.execute(f"delete from {table}")
            await conn.execute("delete from auth.users where email like '%@test.local'")
        finally:
            await conn.execute("alter table questionnaire_templates enable trigger user")


@pytest_asyncio.fixture
async def committed_conn(db_pool):
    async with db_pool.acquire() as conn:
        yield conn
