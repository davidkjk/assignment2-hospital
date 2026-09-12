import uuid

import asyncpg.exceptions as pg
import pytest

from app.core.errors import AppError, pg_error_to_app_error


@pytest.mark.asyncio
async def test_트리거의_한글_안내는_그대로_노출한다():
    """[치명적 규칙은 DB가 최종 심판] 트리거·RPC가 raise exception으로 던지는
    메시지(SQLSTATE P0 클래스)는 이미 한글 안내문이므로 사용자에게 그대로 보여준다.
    이 안내를 일반 문구로 덮으면 「왜 안 되는지」를 알 수 없어진다.
    """
    exc = pg.RaiseError("'진료중' 상태에서 '예약확정'(으)로 변경할 수 없습니다.")
    err = await pg_error_to_app_error(exc, feature="appointment.transition")
    assert isinstance(err, AppError)
    assert err.message == "'진료중' 상태에서 '예약확정'(으)로 변경할 수 없습니다."
    assert err.status_code == 400


@pytest.mark.asyncio
async def test_낙관적_잠금_충돌은_409로_노출한다():
    """P0003(다른 사람이 먼저 수정)은 409로 맞춰, 클라이언트가 상태 코드만으로
    재조회를 유도할 수 있게 한다(기존 revise_medical_record 계약 보존)."""
    exc = pg.TooManyRowsError("다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.")
    err = await pg_error_to_app_error(exc, feature="medical_record.revise")
    assert err.status_code == 409
    assert err.message == "다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요."


@pytest.mark.asyncio
async def test_예기치_못한_DB오류는_원문을_숨기고_로그에만_남긴다(db_pool):
    """[사용자에게는 한글 안내 메시지만 노출] 트리거가 던진 게 아닌 드라이버 오류
    (무결성·연결 등)의 원문은 사용자 응답에 넣지 않고 system_error_log에만 남긴다.
    """
    feature = f"test.masking.{uuid.uuid4()}"
    leaked = 'duplicate key value violates unique constraint "idx_internal_secret"'
    exc = pg.UniqueViolationError(leaked)  # SQLSTATE 23505 — 트리거가 아닌 드라이버 오류

    err = await pg_error_to_app_error(exc, feature=feature)

    assert leaked not in err.message
    assert "constraint" not in err.message
    assert err.message == "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."

    # 원문은 system_error_log에 그대로 보존된다(log_error는 별도 커넥션으로 커밋).
    conn = await db_pool.acquire()
    try:
        row = await conn.fetchrow(
            "select message from system_error_log where feature = $1", feature
        )
        assert row is not None
        assert row["message"] == leaked
    finally:
        await conn.execute("delete from system_error_log where feature = $1", feature)
        await db_pool.release(conn)
