# backend/app/services/doctor_schedule_summary.py
# 갭 #9 — 의사별 진료요일을 사람이 읽는 한 줄로. 앱·챗봇·직원웹이 같은 문장을 쓰도록 서버 한 곳에 둔다.
from datetime import time

_WD = ["월", "화", "수", "목", "금", "토", "일"]  # doctor_schedule_rules.weekday: 0=월 ~ 6=일(00002 check)
_NOON = time(12, 0)
_PERIOD_ORDER = {"오전": 0, "오후": 1, "종일": 2}


def _period(start: time, end: time) -> str:
    if end <= _NOON:
        return "오전"
    if start >= _NOON:
        return "오후"
    return "종일"


def _compress_days(weekdays: list[int]) -> str:
    # 연속 구간이 3일 이상이면 "월~금", 아니면 "·"로 나열. 혼재하면 구간별로.
    runs: list[list[int]] = []
    for w in sorted(set(weekdays)):
        if runs and w == runs[-1][-1] + 1:
            runs[-1].append(w)
        else:
            runs.append([w])
    labels: list[str] = []
    for run in runs:
        if len(run) >= 3:
            labels.append(f"{_WD[run[0]]}~{_WD[run[-1]]}")
        else:
            labels.extend(_WD[w] for w in run)
    return "·".join(labels)


def summarize_schedule(rules: list[dict]) -> str:
    """rules: [{weekday:int, start_time:time, end_time:time}]. 진료요일 한 줄 요약."""
    if not rules:
        return "진료시간 문의"
    by_period: dict[str, list[int]] = {}
    for r in rules:
        by_period.setdefault(_period(r["start_time"], r["end_time"]), []).append(r["weekday"])
    parts = [
        f"{_compress_days(days)} {period}"
        for period, days in sorted(by_period.items(), key=lambda kv: _PERIOD_ORDER.get(kv[0], 9))
    ]
    return ", ".join(parts)
