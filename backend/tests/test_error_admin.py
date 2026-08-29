"""[ERRADM-*] /admin/errors 시스템 오류 기록 — 저장 시점 redaction · 안전 요약 · 읽기 API.

⚠️ main.py는 손대지 않는다(라우터 등록은 코디가 배선). test_dashboard_router처럼 최소
   FastAPI 앱에 error_logs 라우터만 얹은 로컬 TestClient로 검증한다.
⚠️ system_error_log는 conftest의 _cleanup_committed_data가 안 지운다(감사성 표). 이 모듈은
   행 개수를 세는 경계 테스트(NOTI-01 res==[]·FILTER-01 200건)를 위해 매 테스트 앞뒤로 비운다.
"""
import time
import uuid

import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.core.errors import (
    AppError,
    app_error_handler,
    log_error,
    redact,
    unhandled_exception_handler,
)
from app.db import pool as app_pool
from app.routers import error_logs
from tests.conftest import seed_staff


def _make_token(auth_user_id: str) -> str:
    payload = {"sub": auth_user_id, "aud": "authenticated", "role": "authenticated",
               "exp": int(time.time()) + 3600}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _auth(seed) -> dict:
    return {"Authorization": f"Bearer {_make_token(str(seed['auth_user_id']))}"}


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(error_logs.router)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    return app


@pytest.fixture
def client():
    # ⚠️ context manager로 열어 한 테스트의 모든 요청이 하나의 포털 이벤트 루프·앱 풀을 공유하게
    #    한다(NOTI-03·SHELL은 요청을 여러 번 한다). with 없이 매 요청마다 새 루프가 생기면 둘째
    #    요청이 첫 요청의 죽은 루프에 묶인 풀을 재사용해 「another operation in progress」가 난다.
    #    with를 픽스처 teardown에서 닫으므로 그 풀의 커넥션은 다음 테스트 전에 정리된다(고갈 방지).
    with TestClient(_build_app(), raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(autouse=True)
def _small_app_pool(monkeypatch):
    # 앱 풀(get_pool)은 테스트마다 새로 만들어지는데 교차 루프(TestClient 포털↔테스트 루프)라
    # conftest의 close가 실패해 커넥션이 안 닫힌다. 기본 min_size=10이면 14개 테스트가 140커넥션을
    # 쌓아 「too many clients already」로 고갈된다. 테스트 한정으로 풀을 작게 만든다(운영 코드 불변).
    import asyncpg as _asyncpg
    orig = _asyncpg.create_pool
    monkeypatch.setattr(
        app_pool.asyncpg, "create_pool",
        lambda *a, **k: orig(*a, **{"min_size": 1, "max_size": 2, **k}))


@pytest_asyncio.fixture(autouse=True)
async def _clean_error_log(db_pool):
    async with db_pool.acquire() as conn:
        await conn.execute("delete from system_error_log")
    yield
    async with db_pool.acquire() as conn:
        await conn.execute("delete from system_error_log")


async def _seed_patient(conn) -> str:
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('가', '1990-01-01', 'female', '01011112222') returning id")


async def _seed_error(conn, *, feature: str, summary: str, message: str = "x",
                      occurred_at: str | None = None) -> None:
    """앱 풀(get_pool)을 테스트 루프에서 건드리지 않고 system_error_log 행을 심는다.

    ⚠️ `await log_error(...)`는 앱 풀을 테스트 루프에서 쓰는데, 이어지는 sync `client.get`은
       TestClient의 별도 루프에서 같은 앱 풀을 재사용해 「another operation in progress」가 난다.
       그래서 seeding은 db_pool(committed_conn) raw INSERT로 하고, log_error 자체 검증은
       저장-redaction 테스트 한 곳에서만(그 뒤 앱 풀을 닫아 교차 루프를 끊는다)."""
    if occurred_at is None:
        await conn.execute(
            "insert into system_error_log (feature, message, safe_summary) values ($1, $2, $3)",
            feature, message, summary)
    else:
        await conn.execute(
            "insert into system_error_log (occurred_at, feature, message, safe_summary) "
            "values ($1, $2, $3, $4)", occurred_at, feature, message, summary)


def test_LIST_04_redact는_비밀키_전화_주민_토큰만_지우고_오류종류는_남긴다():
    """[ERRADM-LIST-04][결정20] redaction 대상은 비밀키(6.5)·환자 PII뿐. 기술적 원인은 유지."""
    out = redact("UniqueViolation slot 010-9876-5432 pw=hunter2 900101-2345678 "
                 "token=eyJhbGci.eyJzdWIi.SflKxwRJ authorization: Bearer sk_live_51Habc")
    assert "010-9876-5432" not in out
    assert "900101-2345678" not in out
    assert "hunter2" not in out
    assert "sk_live_51Habc" not in out
    assert "eyJhbGci.eyJzdWIi.SflKxwRJ" not in out
    assert "UniqueViolation" in out                                       # 오류 종류는 남는다


def test_LIST_04_redact는_제약조건명_secret부분문자열은_안_건드린다():
    """[ERRADM-LIST-04][회귀] 저장 시점 redaction이 「idx_internal_secret」 같은 제약명을 깨면
    기존 test_error_masking(원문 message 보존)이 무너진다. 실제 키=값만 지운다."""
    leaked = 'duplicate key value violates unique constraint "idx_internal_secret"'
    assert redact(leaked) == leaked


@pytest.mark.asyncio
async def test_LIST_04_저장시점에_지우고_화면은_safe_summary만_받는다(client, committed_conn):
    """[ERRADM-LIST-04][결정20] DB message는 redaction본, 화면 API는 safe_summary만·원문 message 없음."""
    admin = await seed_staff(committed_conn, role="admin")
    # 이 테스트만 log_error를 직접 검증한다(저장 시점 redaction). 앱 풀을 테스트 루프에서 쓴 뒤
    # 닫아, 이어지는 sync client.get이 TestClient 루프에서 새 풀을 만들게 한다(교차 루프 방지).
    await log_error(feature="예약 조회",
                    message="psycopg error 홍길동 010-1234-5678 주민 900101-1234567",
                    safe_summary="예약을 불러오는 중 시스템 오류가 발생했습니다.")
    db = await committed_conn.fetchrow(
        "select message, safe_summary from system_error_log order by occurred_at desc limit 1")
    assert "010-1234-5678" not in db["message"]
    assert "900101-1234567" not in db["message"]
    await app_pool.close_pool()
    res = client.get("/error-logs", headers=_auth(admin)).json()["rows"]["rows"]
    assert res[0]["summary"] == "예약을 불러오는 중 시스템 오류가 발생했습니다."
    assert "message" not in res[0]                       # 기술 상세는 화면 계약에 없다(뒷단에서만)
    assert "010-1234-5678" not in str(res[0])


@pytest.mark.asyncio
async def test_RETENTION_1년_지난_기록은_적재할때_함께_청소된다(committed_conn):
    """[보존 2026-08-29] 시스템 오류 기록은 1년만 보관 — log_error가 적재하며 기간 지난 행을 지운다.

    prune-on-write: 별도 스케줄러 없이 오류가 쌓일 때 함께 청소한다(errors._RETENTION_DAYS=365)."""
    # 400일 전(만료 대상) + 지금(유지 대상)을 심어 둔다.
    await committed_conn.execute(
        "insert into system_error_log (occurred_at, feature, message, safe_summary) "
        "values (now() - interval '400 days', '__old__', 'x', '만료 대상')")
    await committed_conn.execute(
        "insert into system_error_log (occurred_at, feature, message, safe_summary) "
        "values (now(), '__new__', 'x', '유지 대상')")
    # 오류를 하나 적재하면 그 김에 만료 행이 청소된다.
    await log_error(feature="보존검증", message="x", safe_summary="s")
    await app_pool.close_pool()                          # 교차 루프 방지(위 LIST_04 주석과 같은 이유)
    old = await committed_conn.fetchval("select count(*) from system_error_log where feature='__old__'")
    new = await committed_conn.fetchval("select count(*) from system_error_log where feature='__new__'")
    kept = await committed_conn.fetchval("select count(*) from system_error_log where feature='보존검증'")
    assert old == 0                                      # 400일 전 기록은 정책대로 청소됨
    assert new == 1 and kept == 1                        # 1년 안 기록·방금 적재한 기록은 유지


@pytest.mark.asyncio
async def test_SCOPE_01_표는_system_error_log_행만_id_시각_기능_요약으로_준다(client, committed_conn):
    """[ERRADM-SCOPE-01] 서버가 반환한 행만. 오류를 추측해 새 행을 만들지 않는다."""
    admin = await seed_staff(committed_conn, role="admin")
    await _seed_error(committed_conn, feature="통계 조회", summary="통계를 불러오지 못했습니다.")
    res = client.get("/error-logs", headers=_auth(admin)).json()["rows"]
    assert {"id", "occurred_at", "feature", "summary"} <= set(res[0])
    assert res[0]["feature"] == "통계 조회"


@pytest.mark.asyncio
async def test_SCOPE_02_사용자오류_AppError는_시스템오류로_적재하지_않는다(committed_conn):
    """[ERRADM-SCOPE-02] AppError(입력·검증 오류)는 새 행으로 안 만든다 — 미처리 예외만 쌓인다."""
    class _Req:
        url = type("U", (), {"path": "/x"})()
    before = await committed_conn.fetchval("select count(*) from system_error_log")
    await app_error_handler(_Req(), AppError("이미 찬 시간입니다.", status_code=409))
    after = await committed_conn.fetchval("select count(*) from system_error_log")
    assert after == before                              # AppError는 표로 새지 않는다


@pytest.mark.asyncio
async def test_NOTI_01_수신자별_발송실패는_이_표로_새지_않는다(client, committed_conn):
    """[ERRADM-NOTI-01][결정19] 수신자별 실패는 notification_log에만. 이 화면은 그걸 안 읽는다."""
    admin = await seed_staff(committed_conn, role="admin")
    p = await _seed_patient(committed_conn)
    await committed_conn.execute(
        "insert into notification_log (patient_id, notification_type, channel, delivery_status) "
        "values ($1, 'reminder', 'sms', '실패')", p)
    try:
        res = client.get("/error-logs", headers=_auth(admin)).json()["rows"]
        assert res == []                                # 발송 실패가 있어도 시스템 오류 표는 비어 있다
    finally:
        # notification_log는 conftest 공용 cleanup이 안 지운다 → patient FK가 걸려 teardown이 깨진다.
        await committed_conn.execute("delete from notification_log where patient_id = $1", p)


@pytest.mark.asyncio
async def test_NOTI_02_서비스_전체장애만_한줄로_들어오고_기술상세는_요약에_안샌다(client, committed_conn):
    """[ERRADM-NOTI-02][결정19] Task 28의 발송 코드가 남긴 서비스 전체 장애 한 줄만 소비."""
    admin = await seed_staff(committed_conn, role="admin")
    # Task 28의 발송 코드가 redaction 후 남긴 「서비스 전체 장애」한 줄을 재현(message는 이미 redaction본).
    await _seed_error(committed_conn, feature="문자 서비스 장애", message="provider [비밀] gateway down",
                      summary="문자 서비스에 일시적인 장애가 있었습니다. 잠시 후 다시 시도됩니다.")
    rows = [l for l in client.get("/error-logs", headers=_auth(admin)).json()["rows"]
            if l["feature"] == "문자 서비스 장애"]
    assert len(rows) == 1
    assert rows[0]["summary"] == "문자 서비스에 일시적인 장애가 있었습니다. 잠시 후 다시 시도됩니다."
    assert "503" not in rows[0]["summary"] and "sk_live_9" not in str(rows[0])


@pytest.mark.asyncio
async def test_NOTI_03_읽기전용이라_재시도가_별도_행을_만들지_않는다(client, committed_conn):
    """[ERRADM-NOTI-03] 조회가 행을 늘리지 않는다(읽기 전용)."""
    admin = await seed_staff(committed_conn, role="admin")
    await _seed_error(committed_conn, feature="문자 서비스 장애", summary="문자 서비스 장애")
    first = client.get("/error-logs", headers=_auth(admin)).json()["rows"]
    second = client.get("/error-logs", headers=_auth(admin)).json()["rows"]
    assert len(first) == len(second) == 1


@pytest.mark.asyncio
async def test_LIST_05_정렬은_발생시각_내림차_동점은_id_내림차다(client, committed_conn):
    """[ERRADM-LIST-05] occurred_at desc, id desc — 같은 시각 오류가 여럿이어도 순서가 안 흔들린다."""
    admin = await seed_staff(committed_conn, role="admin")
    for _ in range(3):
        await committed_conn.execute(
            "insert into system_error_log (occurred_at, feature, message, safe_summary) "
            "values ('2026-08-17T10:00:00+09:00', '예약', 'x', '오류')")
    res = client.get("/error-logs", headers=_auth(admin)).json()["rows"]
    same = [l for l in res if l["occurred_at"].startswith("2026-08-17T10:00:00")]
    assert [l["id"] for l in same] == sorted((l["id"] for l in same), reverse=True)


@pytest.mark.asyncio
async def test_FILTER_01_LIST_06_상한은_200건이고_커서로_나머지를_이어받는다(client, committed_conn):
    """[ERRADM-FILTER-01][ERRADM-LIST-06] 첫 페이지 200건 + next_cursor 이어보기(겹침·빠짐 없음)."""
    admin = await seed_staff(committed_conn, role="admin")
    await committed_conn.executemany(
        "insert into system_error_log (feature, message, safe_summary) values ('f', 'm', 's')",
        [()] * 205)
    page1 = client.get("/error-logs", headers=_auth(admin)).json()
    assert len(page1["rows"]) == 200
    assert page1["total_hint"] == 205                    # 전체 건수 힌트(200건 밖 부재를 주장하지 않는다)
    assert page1["next_cursor"] is not None
    # 커서로 나머지 5건을 이어받는다 — 첫 페이지와 겹치지도 빠지지도 않는다.
    page2 = client.get(f"/error-logs?cursor={page1['next_cursor']}", headers=_auth(admin)).json()
    assert len(page2["rows"]) == 5
    assert page2["next_cursor"] is None                  # 마지막 페이지
    ids1 = {r["id"] for r in page1["rows"]}
    ids2 = {r["id"] for r in page2["rows"]}
    assert ids1 & ids2 == set()                          # 겹침 없음
    assert len(ids1 | ids2) == 205                       # 빠짐 없음


@pytest.mark.asyncio
async def test_FILTER_02_기간은_시작일포함_종료일_그날끝까지다(client, committed_conn):
    """[ERRADM-FILTER-02] occurred_at >= from, < to + 1 day. 종료일 당일 밤도 포함된다."""
    admin = await seed_staff(committed_conn, role="admin")
    await committed_conn.execute(
        "insert into system_error_log (occurred_at, feature, message, safe_summary) "
        "values ('2026-07-31T23:30:00+09:00', '범위밖', 'x', 's')")
    await committed_conn.execute(
        "insert into system_error_log (occurred_at, feature, message, safe_summary) "
        "values ('2026-08-17T23:30:00+09:00', '당일끝', 'x', 's')")
    res = client.get("/error-logs?from=2026-08-01&to=2026-08-17", headers=_auth(admin)).json()["rows"]
    features = [l["feature"] for l in res]
    assert "당일끝" in features and "범위밖" not in features


@pytest.mark.asyncio
async def test_SHELL_01_02_STATE_05_관리자만_조회하고_다른역할은_행없이_403이다(client, committed_conn):
    """[ERRADM-SHELL-01][ERRADM-SHELL-02][ERRADM-STATE-05] 메뉴 숨김만이 아니라 API·RLS가 관리자만.
    거절 시 오류 문장·행을 한 줄도 안 내려보낸다."""
    admin = await seed_staff(committed_conn, role="admin")
    await _seed_error(committed_conn, feature="예약", summary="secret-summary-토큰")
    assert client.get("/error-logs", headers=_auth(admin)).status_code == 200
    for role in ("receptionist", "doctor"):
        staff = await seed_staff(committed_conn, role=role)
        r = client.get("/error-logs", headers=_auth(staff))
        assert r.status_code == 403
        assert "secret-summary-토큰" not in r.text and "occurred_at" not in r.text
