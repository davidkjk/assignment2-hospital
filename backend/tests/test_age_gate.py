"""[AGE-GATE-05] 가입 연령 서버 검증 — 순수 함수(DB 불필요).

클라이언트 연령 게이트는 우회될 수 있으므로 서버가 생년월일로 만 나이를 다시 계산해 거절한다.
"""
from datetime import date

import pytest

from app.core.errors import AppError
from app.core import age_gate


def test_korean_age_생일_지났으면_올해에서_출생연을_뺀다():
    assert age_gate.korean_age(date(2000, 1, 1), today=date(2026, 9, 8)) == 26


def test_korean_age_생일_아직이면_한_살_뺀다():
    # 12월생을 9월에 세면 아직 생일 전이라 한 살 덜 먹었다.
    assert age_gate.korean_age(date(2000, 12, 25), today=date(2026, 9, 8)) == 25


def test_만_14세_생일_당일이면_통과한다():
    # 경계: 정확히 14년 전 오늘 태어났으면 만 14세가 된 날 → 가입 가능.
    age_gate.assert_signup_age_eligible(date(2012, 9, 8), today=date(2026, 9, 8))


def test_만_14세_생일_하루_전이면_거절한다():
    # 하루라도 덜 됐으면 만 13세 → 403 거절.
    with pytest.raises(AppError) as e:
        age_gate.assert_signup_age_eligible(date(2012, 9, 9), today=date(2026, 9, 8))
    assert e.value.status_code == 403


def test_명백한_아동은_거절한다():
    with pytest.raises(AppError) as e:
        age_gate.assert_signup_age_eligible(date(2020, 1, 1), today=date(2026, 9, 8))
    assert e.value.status_code == 403


def test_성인은_통과한다():
    age_gate.assert_signup_age_eligible(date(1985, 3, 1), today=date(2026, 9, 8))
