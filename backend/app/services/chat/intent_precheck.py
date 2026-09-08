# 결정적 의도 프리체크 — 진료시간·의사명단은 KB(안내자료)가 아니라 DB 단일원본에서 읽는다(KBADM-EDITOR-17).
# RAG(벡터 검색)보다 앞서 결정적 키워드로만 판별해, 두루뭉술한 KB 답변/no_answer 대신 정확한 DB 값을 답한다.
# 오분류 위험을 낮추려 LLM 추가 호출 없이 키워드 매칭만 쓴다(사용자 결정 A, 2026-09-08).
# 못 잡으면(None) orchestrator가 기존 RAG로 폴백하므로 막다른 길이 아니다.
#
# 판별 철학: 확실한 복합어(예 "진료시간")는 단독으로 잡고, 모호한 시간어("몇 시"·"언제")는
# 주제어(진료·병원·의사 등)와 함께 나올 때만 잡는다. 예약 시각("예약 몇 시")은 예약 토큰이 있으면 제외.

HOURS_STANDALONE = (
    "진료시간", "진료 시간", "운영시간", "운영 시간", "영업시간", "영업 시간",
    "몇시에문", "몇시까지", "몇시부터", "언제문여", "언제열", "언제까지해", "점심시간", "점심 시간",
)
HOURS_TIME_TOKENS = ("몇시", "몇 시", "시간이어떻게", "언제", "여나", "닫", "열어", "여는")
HOURS_TOPIC_TOKENS = ("진료", "병원", "문열", "문 열", "문여", "문 여", "영업", "운영")
BOOKING_TOKENS = ("예약", "잡았", "잡은", "잡아")

DOCTOR_STANDALONE = (
    "의사가누구", "선생님이누구", "어떤의사", "어떤선생님", "무슨선생님", "무슨의사",
    "진료하는의사", "진료하는선생님", "의사명단", "의사목록", "선생님명단", "선생님목록",
)
DOCTOR_WHO_TOKENS = ("누구", "누가", "어떤", "무슨", "명단", "목록")
DOCTOR_TOPIC_TOKENS = ("의사", "선생님", "전문의", "원장")


def detect_intent(message: str) -> str | None:
    """진료시간(hospital_hours)·의사명단(doctor_list) 질문이면 그 라벨, 아니면 None."""
    t = (message or "").replace(" ", "")

    # 진료시간 — 예약 시각 질문("예약 몇 시")은 제외.
    if any(k.replace(" ", "") in t for k in HOURS_STANDALONE):
        return "hospital_hours"
    if not any(b in t for b in BOOKING_TOKENS):
        if any(w.replace(" ", "") in t for w in HOURS_TIME_TOKENS) and \
                any(k.replace(" ", "") in t for k in HOURS_TOPIC_TOKENS):
            return "hospital_hours"

    # 의사명단 — "누구/명단/목록"류 + 의사 주제어. 단일 의사 평가("김서준 잘 보나요")는 who 토큰이 없어 제외.
    if any(k in t for k in DOCTOR_STANDALONE):
        return "doctor_list"
    if any(w in t for w in DOCTOR_WHO_TOKENS) and any(k in t for k in DOCTOR_TOPIC_TOKENS):
        return "doctor_list"

    return None


_WEEKDAY_KO = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]


def _hhmm(v) -> str | None:
    """'09:00:00' 또는 time 객체 → '09:00'."""
    if v is None:
        return None
    s = v if isinstance(v, str) else v.isoformat()
    return s[:5]


def format_hours(rows: list[dict], channel: str = "app") -> str | None:
    """요일별 접수 창구 운영시간을 텍스트로. 데이터 없으면 None(→RAG 폴백).

    Q15 — 마지막 안내 문구를 채널별로 분기한다(misdirect 방지):
      · web(webchat)  = 대화 안에서 바로 예약 가능 → "여기서 바로 예약".
      · app(환자앱)   = 예약 마법사가 별도 화면 → "앱의 예약 화면".
    """
    if not rows:
        return None
    lines = ["병원 진료시간은 다음과 같습니다."]
    for r in sorted(rows, key=lambda x: x["weekday"]):
        if r.get("is_closed"):
            continue
        wd = _WEEKDAY_KO[r["weekday"]] if 0 <= r["weekday"] < 7 else str(r["weekday"])
        opn, cls = _hhmm(r.get("open_time")), _hhmm(r.get("close_time"))
        if not opn or not cls:
            continue
        line = f"· {wd} {opn}~{cls}"
        ls, le = _hhmm(r.get("lunch_start")), _hhmm(r.get("lunch_end"))
        if ls and le:
            line += f" (점심 {ls}~{le})"
        lines.append(line)
    if len(lines) == 1:
        return None
    if channel == "web":
        lines.append("정확한 예약 가능 시간은 지금 여기서 바로 예약하며 확인하실 수 있어요.")
    else:
        lines.append("정확한 예약 가능 시간은 앱의 예약 화면에서 확인하실 수 있어요.")
    return "\n".join(lines)


def format_doctors(rows: list[dict]) -> str | None:
    """과별 의사 명단을 텍스트로. 데이터 없으면 None(→RAG 폴백)."""
    if not rows:
        return None
    by_dept: dict[str, list[str]] = {}
    order: list[str] = []
    for r in rows:
        dept = (r.get("specialty") or "기타").strip() or "기타"
        name = (r.get("name") or "").strip()
        if not name:
            continue
        if dept not in by_dept:
            by_dept[dept] = []
            order.append(dept)
        if name not in by_dept[dept]:
            by_dept[dept].append(name)
    if not order:
        return None
    lines = ["진료하시는 선생님은 다음과 같습니다."]
    for dept in order:
        lines.append(f"· {dept}: {', '.join(by_dept[dept])}")
    lines.append("어느 과에 가야 할지 모르시면 증상을 말씀해 주세요.")
    return "\n".join(lines)
