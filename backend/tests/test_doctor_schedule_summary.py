from datetime import time
import pytest
from app.services.doctor_schedule_summary import summarize_schedule


def _r(weekday, start, end):
    return {"weekday": weekday, "start_time": start, "end_time": end}


def test_summary_groups_same_period_nonconsecutive_days():
    # [BOOK-DOC-03] 월(0)·수(2)·금(4) 오전 → "월·수·금 오전" (같은 시간대 요일을 · 로 묶는다)
    rules = [_r(0, time(9, 0), time(12, 0)), _r(2, time(9, 0), time(12, 0)), _r(4, time(9, 0), time(12, 0))]
    assert summarize_schedule(rules) == "월·수·금 오전"


def test_summary_compresses_three_or_more_consecutive_days():
    # [BOOK-DOC-03] 월~금(0~4) 오전이 연속 3일 이상이면 "월~금 오전"으로 축약
    rules = [_r(w, time(9, 0), time(12, 0)) for w in range(5)]
    assert summarize_schedule(rules) == "월~금 오전"


def test_summary_period_boundaries():
    # [BOOK-DOC-09] 오전/오후/종일 판정 — end<=12 오전, start>=12 오후, 걸치면 종일
    assert summarize_schedule([_r(0, time(9, 0), time(12, 0))]) == "월 오전"
    assert summarize_schedule([_r(1, time(13, 0), time(17, 0))]) == "화 오후"
    assert summarize_schedule([_r(2, time(9, 0), time(17, 0))]) == "수 종일"


def test_summary_multiple_periods_ordered():
    # [BOOK-DOC-03] 시간대가 섞이면 오전 → 오후 순으로 이어붙인다
    rules = [_r(0, time(9, 0), time(12, 0)), _r(1, time(13, 0), time(17, 0))]
    assert summarize_schedule(rules) == "월 오전, 화 오후"


def test_summary_empty_is_placeholder():
    # [BOOK-DOC-09] 규칙이 하나도 없으면 빈 문자열이 아니라 안내 문구(카드가 휑하지 않게)
    assert summarize_schedule([]) == "진료시간 문의"


@pytest.mark.parametrize("mask", range(1, 128))  # 요일 0~6의 모든 부분집합(비지 않는)
def test_summary_never_crashes_and_covers_all_days(mask):
    # 🎲 [BOOK-DOC-03] 임의 요일 집합에서 크래시 없고, 고른 요일 이름이 결과에 모두 포함된다(값-형식 코드 = 갭 #127 종류 방지)
    wd = [w for w in range(7) if mask & (1 << w)]
    rules = [_r(w, time(9, 0), time(12, 0)) for w in wd]
    out = summarize_schedule(rules)
    names = ["월", "화", "수", "목", "금", "토", "일"]
    # "월~금" 축약이면 양끝만, 아니면 각 이름이 들어간다 — 최소한 첫·끝 요일 이름은 항상 보인다
    assert names[wd[0]] in out and names[wd[-1]] in out
