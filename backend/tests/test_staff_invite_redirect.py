"""초대 수락 링크가 되돌아올 origin을 요청 헤더에서 안전하게 뽑는지 검증한다.

비밀번호 재설정과 달리 초대는 admin 인증 + Bearer 토큰(쿠키 아님 → CSRF 불가)이라
브라우저가 보낸 실제 origin을 신뢰한다. 그래서 preview·main·실도메인 어디서 초대하든
설정 변경 없이 그 화면 주소로 링크가 간다. 서버 고정값(STAFF_WEB_ORIGIN)은 헤더가
없을 때의 폴백이다.
"""
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.routers.staff import _invite_accept_url, _invite_redirect_origin, _normalize_origin


def _request(headers: dict[str, str]):
    # _invite_redirect_origin은 request.headers.get()만 쓴다.
    return SimpleNamespace(headers=headers)


def test_uses_origin_header():
    origin = "https://gaonhospital-staff-git-merge-design-integration-iansoft.vercel.app"
    assert _invite_redirect_origin(_request({"origin": origin})) == origin


def test_strips_trailing_slash():
    assert _invite_redirect_origin(_request({"origin": "https://x.vercel.app/"})) == "https://x.vercel.app"


def test_falls_back_to_referer_when_no_origin():
    req = _request({"referer": "https://gaonhospital-staff.vercel.app/admin/staff"})
    assert _invite_redirect_origin(req) == "https://gaonhospital-staff.vercel.app"


def test_falls_back_to_configured_origin(monkeypatch):
    monkeypatch.setattr(settings, "staff_web_origin", "https://staff.hospital.example")
    assert _invite_redirect_origin(_request({})) == "https://staff.hospital.example"


def test_returns_none_when_nothing_available(monkeypatch):
    monkeypatch.setattr(settings, "staff_web_origin", None)
    assert _invite_redirect_origin(_request({})) is None


def test_accept_url_appends_set_password_path():
    origin = "https://gaonhospital-staff-git-merge-design-integration-iansoft.vercel.app"
    assert (
        _invite_accept_url(_request({"origin": origin}))
        == f"{origin}/reset-password/new"
    )


def test_accept_url_none_when_no_origin(monkeypatch):
    monkeypatch.setattr(settings, "staff_web_origin", None)
    assert _invite_accept_url(_request({})) is None


def test_accept_url_welcome_marks_reinvite_as_invite():
    """재초대(reset_password_for_email·type=recovery)도 최초 초대와 같은 '환영합니다' 문구를
    보이게 welcome=True면 ?welcome=1을 붙인다(사용자 결정 2026-09-07). 착지 화면이 이 표식으로
    초대 맥락을 안다(링크의 type=recovery로는 알 수 없다)."""
    origin = "https://gaonhospital-staff.vercel.app"
    assert (
        _invite_accept_url(_request({"origin": origin}), welcome=True)
        == f"{origin}/reset-password/new?welcome=1"
    )


@pytest.mark.parametrize(
    "bad",
    [
        "https://user:pass@evil.example",  # 자격증명 포함
        "https://x.vercel.app/some/path",  # 경로 포함(순수 origin 아님)
        "ftp://x.vercel.app",              # http(s) 아님
        "not-a-url",
        "",
    ],
)
def test_rejects_malformed_origins(bad):
    assert _normalize_origin(bad) is None
