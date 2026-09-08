"""직원 대상 메일 문구(초대·재초대·비밀번호 재설정) — 순수 함수.

발송 경로(Resend)와 분리해 문구·HTML을 여기서만 짓는다. 사용자 승인 문구(2026-09-07):
 · 초대·재초대 = "가온병원에 오신 것을 환영합니다 · 비밀번호 설정"(welcome)
 · 비밀번호 재설정(관리자 발급·셀프 공용) = "비밀번호 재설정"(reset)

두 메일 모두 **버튼(링크) + 버튼이 안 보일 때 붙여넣을 원문 링크**를 함께 실어 어느 메일
클라이언트에서도 막다른 길이 없게 한다. HTML은 이메일 호환을 위해 인라인 스타일만 쓴다.
"""
from typing import NamedTuple

# 병원 브랜드색(딥틸) — 직원웹·목업과 같은 값(#0B6E70).
_BRAND = "#0B6E70"
_INK = "#1f2937"
_MUTED = "#6b7280"


class EmailContent(NamedTuple):
    subject: str
    html: str
    text: str


def _button_block(label: str, link: str) -> str:
    return (
        f'<a href="{link}" '
        f'style="display:inline-block;background:{_BRAND};color:#ffffff;'
        f'text-decoration:none;font-weight:600;font-size:15px;'
        f'padding:12px 24px;border-radius:8px;">{label}</a>'
    )


def _wrap(title: str, body_html: str) -> str:
    """공용 바깥틀 — 카드 + 로고 워드마크 + 본문."""
    return (
        f'<div style="background:#f4f5f7;padding:32px 12px;'
        f'font-family:-apple-system,BlinkMacSystemFont,\'Malgun Gothic\',sans-serif;">'
        f'<div style="max-width:480px;margin:0 auto;background:#ffffff;'
        f'border:1px solid #e5e7eb;border-radius:12px;padding:32px;">'
        f'<p style="margin:0 0 20px;font-size:20px;font-weight:700;color:{_BRAND};">가온병원</p>'
        f'<h1 style="margin:0 0 16px;font-size:18px;color:{_INK};">{title}</h1>'
        f'{body_html}'
        f'</div></div>'
    )


def build_invite_email(*, name: str | None, link: str) -> EmailContent:
    """초대·재초대 메일(welcome) — 최초 비밀번호 설정 안내."""
    greeting = f"안녕하세요, {name}님." if name else "안녕하세요."
    subject = "[가온병원] 직원 계정 초대"
    body_html = (
        f'<p style="margin:0 0 16px;font-size:15px;color:{_INK};line-height:1.6;">{greeting}<br>'
        f'가온병원 직원 계정에 초대되셨습니다. 아래 버튼을 눌러 비밀번호를 설정하시면 '
        f'로그인하실 수 있습니다.</p>'
        f'<p style="margin:0 0 20px;">{_button_block("비밀번호 설정하기", link)}</p>'
        f'<p style="margin:0 0 8px;font-size:13px;color:{_MUTED};line-height:1.6;">'
        f'버튼이 안 보이면 아래 주소를 복사해 브라우저에 붙여넣으세요:</p>'
        f'<p style="margin:0 0 20px;font-size:13px;word-break:break-all;">'
        f'<a href="{link}" style="color:{_BRAND};">{link}</a></p>'
        f'<p style="margin:0;font-size:12px;color:{_MUTED};">'
        f'본인이 요청하지 않으셨다면 이 메일을 무시하셔도 됩니다. — 가온병원</p>'
    )
    text = (
        f"{greeting}\n\n"
        f"가온병원 직원 계정에 초대되셨습니다. 아래 주소에서 비밀번호를 설정하시면 "
        f"로그인하실 수 있습니다.\n\n{link}\n\n"
        f"본인이 요청하지 않으셨다면 이 메일을 무시하셔도 됩니다. — 가온병원"
    )
    return EmailContent(subject=subject, html=_wrap("직원 계정 초대", body_html), text=text)


def build_reset_email(*, link: str) -> EmailContent:
    """비밀번호 재설정 메일(관리자 발급·셀프 공용) — 새 비밀번호 설정 안내.

    셀프 요청에서도 쓰이므로 이름을 넣지 않는다(개인정보 열거 방지·범용 인사)."""
    subject = "[가온병원] 비밀번호 재설정"
    body_html = (
        f'<p style="margin:0 0 16px;font-size:15px;color:{_INK};line-height:1.6;">안녕하세요.<br>'
        f'비밀번호 재설정 요청이 접수되었습니다. 아래 버튼을 눌러 새 비밀번호를 설정하세요.</p>'
        f'<p style="margin:0 0 20px;">{_button_block("새 비밀번호 설정하기", link)}</p>'
        f'<p style="margin:0 0 8px;font-size:13px;color:{_MUTED};line-height:1.6;">'
        f'버튼이 안 보이면 아래 주소를 복사해 브라우저에 붙여넣으세요:</p>'
        f'<p style="margin:0 0 20px;font-size:13px;word-break:break-all;">'
        f'<a href="{link}" style="color:{_BRAND};">{link}</a></p>'
        f'<p style="margin:0;font-size:12px;color:{_MUTED};">'
        f'본인이 요청하지 않으셨다면 이 메일을 무시하세요. 비밀번호는 변경되지 않습니다. — 가온병원</p>'
    )
    text = (
        "안녕하세요.\n\n"
        "비밀번호 재설정 요청이 접수되었습니다. 아래 주소에서 새 비밀번호를 설정하세요.\n\n"
        f"{link}\n\n"
        "본인이 요청하지 않으셨다면 이 메일을 무시하세요. 비밀번호는 변경되지 않습니다. — 가온병원"
    )
    return EmailContent(subject=subject, html=_wrap("비밀번호 재설정", body_html), text=text)
