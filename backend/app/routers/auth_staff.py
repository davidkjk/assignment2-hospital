import re
import time
from collections import defaultdict, deque
from threading import Lock
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from supabase import Client, create_client

from app.core.config import settings
from app.core.security import StaffContext, get_current_staff
from app.db.admin_client import get_admin_client

router = APIRouter(tags=["staff-auth"])

RESET_MESSAGE = (
    "입력한 주소가 직원 계정과 연결되어 있다면 재설정 이메일을 보냈습니다."
)


class PasswordResetRequest(BaseModel):
    email: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ResetRateLimiter:
    """프로세스 단위의 작은 방어선. 다중 인스턴스 운영에서는 외부 rate limit으로 보강한다."""

    def __init__(self, limit: int = 5, window_seconds: int = 15 * 60):
        self.limit = limit
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, now: float | None = None) -> None:
        current = time.monotonic() if now is None else now
        with self._lock:
            attempts = self._attempts[key]
            while attempts and current - attempts[0] >= self.window_seconds:
                attempts.popleft()
            if len(attempts) >= self.limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="재설정 요청이 너무 많습니다. 잠시 뒤 다시 시도하거나 병원에 알려 주세요.",
                )
            attempts.append(current)


_reset_limiter = ResetRateLimiter()


def get_reset_limiter() -> ResetRateLimiter:
    return _reset_limiter


def get_auth_client() -> Client:
    """현재 비밀번호 검증용 익명 클라이언트. service-role 세션을 덮어쓰지 않는다."""
    return create_client(settings.supabase_url, settings.supabase_anon_key)


def _password_recovery_redirect(request: Request) -> str:
    """브라우저가 연 직원 웹 origin으로만 복구 화면을 돌려보낸다."""
    origin = request.headers.get("origin", "").strip().rstrip("/")
    try:
        parsed = urlsplit(origin)
        is_serialized_origin = origin == f"{parsed.scheme}://{parsed.netloc}"
        if (
            parsed.scheme in {"http", "https"}
            and parsed.hostname is not None
            and parsed.username is None
            and parsed.password is None
            and is_serialized_origin
        ):
            return f"{origin}/reset-password/new"
    except ValueError:
        pass
    return f"{str(request.base_url).rstrip('/')}/reset-password/new"


@router.post(
    "/auth/staff/password-reset",
    status_code=status.HTTP_202_ACCEPTED,
)
def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
    admin: Client = Depends(get_admin_client),
    limiter: ResetRateLimiter = Depends(get_reset_limiter),
) -> dict[str, str]:
    # 이메일별 제한은 존재 여부 대조 신호가 될 수 있어 요청 IP만 사용한다.
    limiter.check(request.client.host if request.client else "unknown")
    email = payload.email.strip().lower()
    if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        try:
            admin.auth.reset_password_for_email(
                email,
                {"redirect_to": _password_recovery_redirect(request)},
            )
        except Exception:
            # STAFF-LOGIN-10: 없는 이메일과 제공자 오류의 세부를 브라우저에 드러내지 않는다.
            pass
    return {"message": RESET_MESSAGE}


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_my_password(
    payload: ChangePasswordRequest,
    request: Request,
    staff: StaffContext = Depends(get_current_staff),
    admin: Client = Depends(get_admin_client),
    auth_client: Client = Depends(get_auth_client),
) -> Response:
    if (
        len(payload.new_password) < 8
        or not re.search(r"[A-Za-z]", payload.new_password)
        or not re.search(r"\d", payload.new_password)
    ):
        raise HTTPException(status_code=400, detail="새 비밀번호 조건을 확인해 주세요.")

    user = admin.auth.admin.get_user_by_id(str(staff.auth_user_id)).user
    email = getattr(user, "email", None)
    if not email:
        raise HTTPException(status_code=400, detail="현재 비밀번호를 확인해 주세요.")
    try:
        auth_client.auth.sign_in_with_password(
            {"email": email, "password": payload.current_password}
        )
    except Exception:
        raise HTTPException(status_code=400, detail="현재 비밀번호를 확인해 주세요.")

    admin.auth.admin.update_user_by_id(
        str(staff.auth_user_id), {"password": payload.new_password}
    )
    # SHELL-PW-04: 현재 브라우저 세션은 유지하고 다른 기기만 종료한다.
    authorization = request.headers.get("authorization", "")
    current_token = authorization.removeprefix("Bearer ")
    if not current_token:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    admin.auth.admin.sign_out(current_token, scope="others")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
