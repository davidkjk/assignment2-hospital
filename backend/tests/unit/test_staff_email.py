"""직원 대상 메일 문구(초대·재초대·비번재설정) — 순수 함수.

발송 성패를 좌우하는 건 링크가 본문에 정확히 들어가는지와 문구 종류(welcome vs reset)다.
"""
from app.services.staff_email import build_invite_email, build_reset_email

_LINK = "https://staff.example.com/reset-password/new#access_token=abc"


def test_invite_email_is_welcome_and_carries_link_and_name():
    """[MAIL-INVITE] 초대 메일 = '환영/초대' 제목 + 이름 인사 + 버튼링크 + 원문링크(둘 다)."""
    c = build_invite_email(name="김간호", link=_LINK)
    assert c.subject == "[가온병원] 직원 계정 초대"
    assert "김간호님" in c.html and "김간호님" in c.text
    assert "비밀번호 설정하기" in c.html          # 버튼 라벨(welcome 어휘)
    assert c.html.count(_LINK) >= 2               # 버튼 href + 붙여넣기용 원문 링크
    assert _LINK in c.text


def test_invite_email_without_name_uses_generic_greeting():
    """[MAIL-INVITE] 이름이 없으면 범용 인사(이름 칸 비어도 깨지지 않음)."""
    c = build_invite_email(name=None, link=_LINK)
    assert "안녕하세요." in c.text
    assert "None" not in c.html and "None" not in c.text


def test_reset_email_is_reset_and_has_no_name():
    """[MAIL-RESET] 재설정 메일 = '재설정' 제목 + 이름 없음(셀프 요청 공용·열거 방지) + 링크."""
    c = build_reset_email(link=_LINK)
    assert c.subject == "[가온병원] 비밀번호 재설정"
    assert "새 비밀번호 설정하기" in c.html       # 버튼 라벨(reset 어휘)
    assert "님" not in c.html                      # 이름을 넣지 않는다
    assert c.html.count(_LINK) >= 2
    assert _LINK in c.text
