import pytest

from app.core.errors import AppError
from app.services.chat import restricted_mode as rm


def test_restricted_blocks_all_action_cards():
    for ct in ["time_select", "booking_confirm", "booking_done", "cancel_confirm", "questionnaire"]:
        with pytest.raises(AppError):
            rm.assert_card_allowed(ct, restricted=True)


def test_unrestricted_allows_cards():
    rm.assert_card_allowed("booking_confirm", restricted=False)   # 예외 없음


def test_continue_label():
    assert rm.continue_to_department_label("내과") == "내과로 계속하기"
