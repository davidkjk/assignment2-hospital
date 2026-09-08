"""직원 대상 메일 문구(초대·재초대·비밀번호 재설정) — 순수 함수.

발송 경로(Resend)와 분리해 문구·HTML을 여기서만 짓는다. 사용자 승인 문구(2026-09-07):
 · 초대·재초대 = "가온병원에 오신 것을 환영합니다 · 비밀번호 설정"(welcome)
 · 비밀번호 재설정(관리자 발급·셀프 공용) = "비밀번호 재설정"(reset)

두 메일 모두 **버튼(링크) + 버튼이 안 보일 때 붙여넣을 원문 링크**를 함께 실어 어느 메일
클라이언트에서도 막다른 길이 없게 한다.

⛔ 이메일 디자인 규율(2026-09-08 리스킨):
 · **인라인 스타일만** 쓴다 — `<style>`·외부 CSS는 많은 클라이언트가 지운다.
 · **레이아웃은 표(table role=presentation)** 로 짠다 — Outlook(워드 엔진)은 div/flex를 무시한다.
 · **버튼은 bulletproof(표 기반)** — `border-radius`를 못 그리는 클라이언트에서도 배경색 사각 버튼이 남는다.
 · **이미지 없음** — 로고는 텍스트 워드마크로. (이미지는 공개 URL·차단 대비가 필요해 지금은 안 쓴다.)
 · **재설정 메일에는 이름("님")을 넣지 않는다** — 셀프 요청 공용이라 개인정보 열거를 피한다.
"""
from typing import NamedTuple

# ── 브랜드 팔레트(딥틸) — 직원웹·목업과 같은 값(#0B6E70) ──────────────────────
_BRAND = "#0B6E70"          # 딥틸 — 워드마크·버튼·강조
_BRAND_DEEP = "#095557"     # 버튼 테두리(깊이감)
_INK = "#1f2937"            # 본문 글자
_MUTED = "#6b7280"          # 보조 글자
_OUTER = "#eef1f4"          # 바깥 배경(카드를 띄우는 은은한 회색)
_BORDER = "#e5e7eb"         # 카드·구분선 테두리
_WASH = "#eff6f5"           # 링크 안내 상자(옅은 딥틸)
_WASH_BORDER = "#d6e8e6"    # 그 상자의 테두리

# 한글이 예쁘게 나오도록 애플/윈도우 한글 글꼴을 앞세운 시스템 글꼴 스택.
_FONT = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI','Malgun Gothic',sans-serif"


class EmailContent(NamedTuple):
    subject: str
    html: str
    text: str


def _button_block(label: str, link: str) -> str:
    """bulletproof 버튼 — 표 셀에 배경색을 깔아 border-radius를 못 그리는 곳에서도 버튼이 남는다."""
    return (
        '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" '
        'style="margin:28px auto 0;">'
        '<tr><td align="center" '
        f'style="border-radius:8px;background:{_BRAND};box-shadow:0 1px 0 {_BRAND_DEEP};">'
        f'<a href="{link}" '
        'style="display:inline-block;padding:14px 34px;font-size:15px;font-weight:600;'
        f'color:#ffffff;text-decoration:none;border-radius:8px;">{label}</a>'
        '</td></tr></table>'
    )


def _link_fallback(link: str) -> str:
    """버튼이 안 보일 때 붙여넣을 원문 링크 — 옅은 딥틸 상자로 '복사할 것'임을 드러낸다."""
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        'style="margin:28px 0 0;">'
        '<tr><td '
        f'style="background:{_WASH};border:1px solid {_WASH_BORDER};border-radius:10px;padding:14px 16px;">'
        f'<p style="margin:0 0 6px;font-size:12px;color:{_MUTED};line-height:1.5;">'
        '버튼이 안 보이면 아래 주소를 복사해 브라우저에 붙여넣으세요</p>'
        f'<a href="{link}" style="font-size:13px;color:{_BRAND};word-break:break-all;'
        f'text-decoration:none;">{link}</a>'
        '</td></tr></table>'
    )


def _footer(disclaimer: str) -> str:
    """구분선 + 보조 문구 + 서명 — 메일 하단의 마무리."""
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        'style="margin:28px 0 0;">'
        f'<tr><td style="border-top:1px solid {_BORDER};padding:16px 0 0;">'
        f'<p style="margin:0;font-size:12px;color:{_MUTED};line-height:1.6;">'
        f'{disclaimer}<br>— 가온병원</p>'
        '</td></tr></table>'
    )


def _wrap(title: str, preheader: str, body_html: str) -> str:
    """공용 바깥틀 — 배경 위에 카드를 가운데 띄우고, 워드마크·강조선·제목·본문을 얹는다.

    preheader: 받은편지함 목록에서 제목 옆에 보이는 미리보기 한 줄(화면엔 숨김)."""
    return (
        f'<div style="background:{_OUTER};margin:0;padding:0;">'
        # 받은편지함 미리보기용 숨김 텍스트 — 본문에는 안 보인다.
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;'
        f'mso-hide:all;">{preheader}</div>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="background:{_OUTER};">'
        f'<tr><td align="center" style="padding:36px 12px;font-family:{_FONT};">'
        # 카드
        '<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" '
        f'style="width:480px;max-width:100%;background:#ffffff;border:1px solid {_BORDER};'
        'border-radius:16px;overflow:hidden;">'
        # 머리말: 워드마크 + 짧은 강조선
        '<tr><td style="padding:32px 40px 0;">'
        f'<span style="font-size:19px;font-weight:700;color:{_BRAND};'
        'letter-spacing:0.5px;">가온병원</span>'
        f'<div style="height:3px;width:36px;background:{_BRAND};'
        'border-radius:2px;margin:12px 0 0;font-size:0;line-height:0;">&nbsp;</div>'
        '</td></tr>'
        # 제목 + 본문
        '<tr><td style="padding:22px 40px 40px;">'
        f'<h1 style="margin:0 0 16px;font-size:19px;font-weight:700;color:{_INK};'
        f'line-height:1.4;">{title}</h1>'
        f'{body_html}'
        '</td></tr>'
        '</table>'
        '</td></tr></table>'
        '</div>'
    )


def build_invite_email(*, name: str | None, link: str) -> EmailContent:
    """초대·재초대 메일(welcome) — 최초 비밀번호 설정 안내."""
    greeting = f"안녕하세요, {name}님." if name else "안녕하세요."
    subject = "[가온병원] 직원 계정 초대"
    preheader = "가온병원 직원 계정에 초대되었습니다. 비밀번호를 설정하세요."
    body_html = (
        f'<p style="margin:0;font-size:15px;color:{_INK};line-height:1.7;">{greeting}<br>'
        '가온병원 직원 계정에 초대되셨습니다. 아래 버튼을 눌러 비밀번호를 설정하시면 '
        '로그인하실 수 있습니다.</p>'
        f'{_button_block("비밀번호 설정하기", link)}'
        f'{_link_fallback(link)}'
        f'{_footer("본인이 요청하지 않으셨다면 이 메일을 무시하셔도 됩니다.")}'
    )
    text = (
        f"{greeting}\n\n"
        f"가온병원 직원 계정에 초대되셨습니다. 아래 주소에서 비밀번호를 설정하시면 "
        f"로그인하실 수 있습니다.\n\n{link}\n\n"
        f"본인이 요청하지 않으셨다면 이 메일을 무시하셔도 됩니다. — 가온병원"
    )
    return EmailContent(subject=subject, html=_wrap("직원 계정 초대", preheader, body_html), text=text)


def build_reset_email(*, link: str) -> EmailContent:
    """비밀번호 재설정 메일(관리자 발급·셀프 공용) — 새 비밀번호 설정 안내.

    셀프 요청에서도 쓰이므로 이름을 넣지 않는다(개인정보 열거 방지·범용 인사)."""
    subject = "[가온병원] 비밀번호 재설정"
    preheader = "가온병원 계정의 새 비밀번호를 설정하세요."
    body_html = (
        f'<p style="margin:0;font-size:15px;color:{_INK};line-height:1.7;">안녕하세요.<br>'
        '비밀번호 재설정 요청이 접수되었습니다. 아래 버튼을 눌러 새 비밀번호를 설정하세요.</p>'
        f'{_button_block("새 비밀번호 설정하기", link)}'
        f'{_link_fallback(link)}'
        f'{_footer("본인이 요청하지 않으셨다면 이 메일을 무시하세요. 비밀번호는 변경되지 않습니다.")}'
    )
    text = (
        "안녕하세요.\n\n"
        "비밀번호 재설정 요청이 접수되었습니다. 아래 주소에서 새 비밀번호를 설정하세요.\n\n"
        f"{link}\n\n"
        "본인이 요청하지 않으셨다면 이 메일을 무시하세요. 비밀번호는 변경되지 않습니다. — 가온병원"
    )
    return EmailContent(subject=subject, html=_wrap("비밀번호 재설정", preheader, body_html), text=text)
