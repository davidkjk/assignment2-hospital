"""[ERR-MSG-01][ERR-MSG-02] 갭 #14 — 파이썬/DB 예외 원문이 사용자 화면에 새지 않게 한다.

⚠️ 이력: 플랜(2026-08-15 staff-web)은 "4곳이 `AppError(str(exc))`"라 적었지만 실제로는 6곳이었고,
   그 6곳은 이미 기반 태스크(커밋 e40a67f)에서 `pg_error_to_app_error()`를 거치도록 고쳐졌다.
   이 파일은 그 수정을 **되돌리지 못하게** 지키는 회귀 가드다:
     · appointment_service.py: create(2) · transition(1)
     · medical_record_service.py: create_draft(1) · update_draft(1) · revise(1)

ERR-MSG-01은 「서버가 준 문장을 그대로 쓴다」이므로, 서버가 한글로 말하지 않으면 직원 화면에
asyncpg의 영어 제약 조건 이름(`duplicate key value violates unique constraint "idx_..."`)이 뜬다.
"""

import re
from pathlib import Path

import asyncpg.exceptions as pg
import pytest

from app.core.errors import AppError, pg_error_to_app_error

SERVICE_FILES = [
    Path(__file__).resolve().parents[1] / "app" / "services" / "appointment_service.py",
    Path(__file__).resolve().parents[1] / "app" / "services" / "medical_record_service.py",
]

# 갭 #14의 여섯 자리 — 각 서비스 호출이 DB 예외를 사용자 안내로 갈아입히는 지점.
GAP14_FEATURES = [
    "appointment.create",     # create_appointment: booking_code 외 유니크 위반
    "appointment.create",     # create_appointment: 그 밖의 PostgresError
    "appointment.transition", # transition_status
    "medical_record.create_draft",
    "medical_record.update_draft",
    "medical_record.revise",
]

# asyncpg가 던지는 드라이버 오류(트리거가 아닌 23505) — 영어 + 제약 조건 이름이 그대로 들어 있다.
LEAKY_MESSAGE = 'duplicate key value violates unique constraint "idx_internal_secret"'


@pytest.mark.parametrize("feature", GAP14_FEATURES)
async def test_파이썬_예외_원문이_사용자에게_가지_않는다(feature, db_pool):
    """[ERR-MSG-01][ERR-MSG-02] 여섯 자리 모두, 드라이버 오류 원문 대신 한글 안내만 내보낸다."""
    err = await pg_error_to_app_error(pg.UniqueViolationError(LEAKY_MESSAGE), feature=feature)

    assert isinstance(err, AppError)
    detail = err.message
    # 영어 단어·제약 조건 이름·드라이버 관용구가 새지 않는다.
    assert re.search(r"[a-z_]{6,}|constraint|violates|null value", detail) is None
    # 사용자에게 가는 문장은 한글이다.
    assert re.search(r"[가-힣]", detail)

    # 이 변환은 원문을 system_error_log에 남긴다 — 공용 DB에 검사용 행을 두지 않는다.
    async with db_pool.acquire() as conn:
        await conn.execute("delete from system_error_log where feature = $1", feature)


async def test_트리거의_한글_안내는_그대로_노출한다():
    """[ERR-MSG-01] 트리거·RPC가 raise exception(P0…)으로 던진 한글 안내는 덮지 않는다.

    여섯 자리가 의존하는 계약 — 이게 깨지면 「왜 막혔는지」 설명이 일반 문구로 사라진다.
    """
    korean = "'진료중' 상태에서 '예약확정'(으)로 변경할 수 없습니다."
    err = await pg_error_to_app_error(pg.RaiseError(korean), feature="appointment.transition")
    assert err.message == korean


async def test_원문은_버리지_않고_기록한다(db_pool):
    """[ERR-MSG-01] 사용자에게 안 보이는 것과 없애는 것은 다르다.

    관리자가 원인을 봐야 하므로(요구사항 6.4) system_error_log에는 원문을 남긴다 —
    이 기록이 Task 27 `/admin/errors`의 재료가 된다.
    """
    feature = "medical_record.revise"
    err = await pg_error_to_app_error(pg.UniqueViolationError(LEAKY_MESSAGE), feature=feature)

    conn = await db_pool.acquire()
    try:
        row = await conn.fetchrow(
            "select message from system_error_log where feature = $1 order by id desc limit 1",
            feature,
        )
        assert row is not None
        assert row["message"] == LEAKY_MESSAGE      # 원문은 그대로 남는다
        assert row["message"] != err.message         # 사용자에게는 안 나간다
    finally:
        await conn.execute("delete from system_error_log where feature = $1", feature)
        await db_pool.release(conn)


def test_서비스_여섯_곳_어디서도_예외_원문을_그대로_던지지_않는다():
    """[ERR-MSG-02] 갭 #14 회귀 가드 — `AppError(str(exc))`가 다시 생기면 여기서 걸린다.

    핵심 불변식: 두 서비스 파일 어디에도 파이썬 예외 원문을 그대로 AppError에 담는 코드가 없어야 한다.
    그리고 DB 예외를 사용자 안내로 갈아입히는 창구(`pg_error_to_app_error(exc`)가 최소 6곳(갭 #14
    당시의 6곳)은 남아 있어야 한다. ⚠️ 이 수는 **새 DB 연산이 추가될수록 는다**(예: Task 7 `undo_status`가
    같은 패턴으로 마스킹해 7곳) — 정확한 개수가 아니라 「원문 노출이 다시 생기지 않았나 + 마스킹이 사라지지
    않았나」가 가드의 목적이다.
    """
    sites = 0
    for path in SERVICE_FILES:
        source = path.read_text(encoding="utf-8")
        assert "AppError(str(exc)" not in source
        assert "AppError(str(" not in source
        sites += len(re.findall(r"pg_error_to_app_error\(exc", source))
    assert sites >= 6
