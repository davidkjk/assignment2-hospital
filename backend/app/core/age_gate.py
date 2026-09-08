"""[AGE-GATE-05] 가입 연령 서버 검증 — 만 14세 미만 앱 가입 차단(개인정보보호법 22조의2).

클라이언트의 '만 14세 이상' 선택(AgeGateScreen)만 신뢰하지 않는다. 가입 요청의 생년월일로
서버가 만 나이를 다시 계산해, 만 14세 미만이면 환자 행·계정을 만들기 전에 거절한다(우회 가입 차단).
순수 함수 모듈 — DB·세션에 의존하지 않아 단독 단위 테스트가 가능하다.
"""
from datetime import date

from app.core.errors import AppError

# 개인정보보호법 22조의2: 만 14세 미만은 법정대리인 동의가 있어야 개인정보를 수집할 수 있다.
# 이 앱은 법정대리인 동의 흐름을 앱에 두지 않고(사용자 결정 2026-09-08 Option A) 병원 안내로 돌린다.
MIN_SIGNUP_AGE = 14


def korean_age(birth_date: date, today: date | None = None) -> int:
    """만 나이 — 생일이 지났으면 (올해-출생연), 아직이면 하루라도 덜 됐으므로 한 살 뺀다."""
    today = today or date.today()
    years = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1
    return years


def assert_signup_age_eligible(birth_date: date, today: date | None = None) -> None:
    """만 14세 미만이면 거절(403). 생년월일이 곧 만 14세가 되는 날이면 통과(경계=생일 당일부터 만 나이 +1)."""
    if korean_age(birth_date, today) < MIN_SIGNUP_AGE:
        raise AppError(
            "만 14세 미만은 보호자(법정대리인) 동의가 필요해 앱에서 가입할 수 없습니다. "
            "보호자와 함께 병원으로 등록해 주세요.",
            status_code=403,
        )
