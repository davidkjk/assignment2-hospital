import logging
import re

import asyncpg
from fastapi import Request
from fastapi.responses import JSONResponse

from app.db.pool import get_pool

# 진짜 원문(개발자용 기술 상세)은 서버 로그에만 남긴다(결정 #20). DB message는 redaction본이다.
logger = logging.getLogger("system_error")


class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400, detail: dict | None = None):
        # detail: 화면이 「갈 길」을 그리는 데 필요한 구조화 정보(예: 진료과 중지를 막을 때
        # 옮겨야 할 활성 의사 이름 목록). message는 사람이 읽는 한 줄, detail은 화면용 데이터다.
        self.message = message
        self.status_code = status_code
        self.detail = detail


# 결정 #20 — 저장 시점 redaction. 대상은 비밀키(6.5)·환자 개인정보뿐, 기술적 원인(오류 종류)은 남긴다.
# ⚠️ 「실제 키=값」·「Bearer 값」·전화·주민·JWT·결제키만 지운다. 단어 경계+구분자를 요구해
#    「idx_internal_secret」 같은 식별자·제약명을 안 건드린다(test_error_masking의 원문 보존 계약).
_REDACTIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}"), "[토큰]"),   # JWT
    (re.compile(r"(?i)\b(password|passwd|pwd|pw|secret|token|api[_-]?key)\b\s*[=:]\s*\S+"),
     r"\1=[비밀]"),                                                                            # 키=값
    (re.compile(r"(?i)\bbearer\s+\S+"), "Bearer [비밀]"),                                      # Bearer 토큰
    (re.compile(r"\b\d{6}-?[1-4]\d{6}\b"), "[주민번호]"),                                      # 주민등록번호
    (re.compile(r"\b01[016789]-?\d{3,4}-?\d{4}\b"), "[전화]"),                                # 휴대폰
    (re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{6,}\b"), "[비밀]"),                          # 결제·업체 키
]
_DEFAULT_SUMMARY = "요청을 처리하는 중 시스템 오류가 발생했습니다."

# 보존 기간 (2026-08-29, 사용자 결정) — 시스템 오류 기록은 1년만 보관하고 지난 것은 자동 청소한다.
# 방식 = prune-on-write: 오류를 적재할 때 같은 커넥션에서 기간 지난 행을 함께 지운다. 별도 스케줄러
# (pg_cron 등)가 없어도 배포에서 확실히 돌고(마이그레이션≠적용 함정 회피) 검증도 쉽다. 오류가 한동안
# 없으면 지난 행이 잠깐 더 남지만, 이 표는 환자정보 없는 안전 요약이라 정확한 시각 강제는 불필요하다.
# (정확한 시각 강제가 필요해지면 pg_cron 일일 작업을 후속으로 얹을 수 있다.) 화면 삭제 문(ERRADM-HEAD-02
# 읽기 전용)과 무관 — 이건 사람이 지우는 게 아니라 나이 든 기록이 정책대로 물러나는 것이다.
_RETENTION_DAYS = 365


def redact(text: str) -> str:
    for pattern, repl in _REDACTIONS:
        text = pattern.sub(repl, text)
    return text


async def log_error(feature: str, message: str | None = None, *,
                    safe_summary: str | None = None, exc: Exception | None = None) -> None:
    """시스템 오류를 남긴다. 하위호환: Task 5·6의 `log_error(feature, str(exc))`가 그대로 동작한다.

    결정 #20 — ①진짜 원문은 `logger.error`로 서버 로그에만(뒷단) ②DB `message`엔 redaction한
    기술 상세 ③DB `safe_summary`엔 화면에 보이는 안전 요약(없으면 일반 안내).
    """
    raw = message if message is not None else (str(exc) if exc is not None else "")
    logger.error("[%s] %s", feature, raw)                    # 진짜 원문은 서버 로그에만(뒷단)
    pool = await get_pool()                                   # 서비스 롤 — RLS 우회 적재
    async with pool.acquire() as conn:
        await conn.execute(
            "insert into system_error_log (feature, message, safe_summary) values ($1, $2, $3)",
            feature, redact(raw), safe_summary or _DEFAULT_SUMMARY,
        )
        # 보존 기간(1년) 지난 기록을 함께 청소한다 — prune-on-write(위 _RETENTION_DAYS 주석).
        await conn.execute(
            "delete from system_error_log where occurred_at < now() - make_interval(days => $1)",
            _RETENTION_DAYS,
        )


async def pg_error_to_app_error(exc: asyncpg.PostgresError, feature: str) -> AppError:
    """DB 예외를 사용자 안내(AppError)로 변환한다.

    트리거·RPC가 `raise exception … using errcode='P0…'`으로 던진 메시지는 이미
    한글 도메인 안내문이므로(SQLSTATE PL/pgSQL 클래스 `P0`) 그대로 노출한다.
    P0003(낙관적 잠금 충돌)만 409로 맞춘다. 그 밖의 드라이버 오류(무결성·연결 등)는
    원문을 사용자 응답에 넣지 않고 `system_error_log`에만 남긴 뒤, 고정 한글 문구로
    바꾼다 — 「사용자에게는 한글 안내 메시지만 노출」 규칙(스펙 섹션 3).
    """
    sqlstate = getattr(exc, "sqlstate", None) or ""
    if sqlstate.startswith("P0"):
        status_code = 409 if sqlstate == "P0003" else 400
        return AppError(str(exc), status_code=status_code)
    await log_error(feature, str(exc))
    return AppError("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", status_code=400)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    # ERRADM-SCOPE-02 — 사용자 입력·검증 오류(AppError)는 시스템 오류로 적재하지 않는다.
    content: dict = {"detail": exc.message}
    if exc.detail is not None:
        # 화면이 「갈 길」을 그리는 데 쓰는 구조화 데이터(예: 옮겨야 할 활성 의사 이름).
        content["context"] = exc.detail
    return JSONResponse(status_code=exc.status_code, content=content)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    await log_error(feature=request.url.path, message=str(exc))       # 미처리 예외만 쌓인다
    return JSONResponse(
        status_code=500,
        content={"detail": "잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의하세요."},
    )
