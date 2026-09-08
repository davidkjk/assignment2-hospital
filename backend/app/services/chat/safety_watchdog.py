# ⓪ 응급 검사 + ① 인계 감시. 응급은 규칙 기반(결정적) — AI 확률 판단에 안전을 맡기지 않는다(옛 플랜 :30, 정본 §0).
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model, resp_text

# 병원과 함께 다듬는 큐레이션 목록(확장 가능). 오탐보다 미탐이 위험하므로 넓게 잡는다.
EMERGENCY_KEYWORDS = [
    "119", "응급실", "의식이 없", "숨을 못", "숨이 안", "호흡곤란",
    # "가슴이 아"는 "가슴이 너무 아파요"처럼 사이에 부사가 끼면 못 잡는다 → "가슴"으로 넓힌다
    # (큐레이션 철학: 오탐보다 미탐이 위험. 흉부 언급은 넓게 잡아 안전 안내로 보낸다).
    "가슴", "피를 많이", "출혈이 멈", "쓰러졌", "경련", "발작", "자살", "죽고 싶", "심장이", "마비",
]
EMERGENCY_REPLY = (
    "지금 위급한 상황일 수 있어요. 즉시 119에 전화하거나 가까운 응급실로 가 주세요. "
    "이 상담은 응급 진료를 대신할 수 없습니다."
)

# 6가지 인계 조건 = support_tickets 생성 사유(late_cancellation은 도구가 별도 생성).
LLM_ESCALATION_LABELS = {"medical_judgment", "data_mismatch", "complaint"}

# 명시적 직원 연결 요청 — 결정적(응급처럼 AI 확률판단에 안 맡김). 사용자가 직접 사람을 찾으면 바로 인계한다.
# "연결/바꿔/문의/물어" 같은 연결 의도어를 반드시 함께 담아 "직원분 친절해요?" 같은 단순 언급은 안 걸리게 큐레이션.
EXPLICIT_STAFF_KEYWORDS = [
    "직원 연결", "직원에게 연결", "직원한테 연결", "직원과 연결", "직원이랑 연결", "직원분 연결",
    "직원 바꿔", "직원한테 바꿔", "직원에게 문의", "직원에게 물어", "직원한테 물어", "직원 좀 연결",
    "상담원 연결", "상담원에게 연결", "상담원한테", "상담원과 연결", "상담원 바꿔", "상담사 연결",
    "사람과 연결", "사람이랑 연결", "사람한테 연결", "실제 직원", "진짜 사람", "담당자 연결", "담당자에게 연결",
]


def check_emergency(text: str) -> bool:
    t = text.replace(" ", "")
    return any(k.replace(" ", "") in t for k in EMERGENCY_KEYWORDS)


def check_staff_request(text: str) -> bool:
    """사용자가 명시적으로 직원(사람) 연결을 요청했는지 — 결정적 판단(정본 §1 인계조건 신설)."""
    t = text.replace(" ", "")
    return any(k.replace(" ", "") in t for k in EXPLICIT_STAFF_KEYWORDS)


# 진료과 문의 — "어느 과에 가야 하나"류. 요구사항 L49(진료과 선택 도움)·L57이 상담봇의 임무로 지정.
# 진단·치료 요구("무슨 병"·"무슨 약")는 여기에 넣지 않아 medical_judgment 인계(L51)가 유지된다.
# 큐레이션 목록(확장 가능) — LLM이 "어느 과" 문의를 medical_judgment로 오분류해 진료과 안내를 못 하던 것을 결정적으로 구제한다.
DEPARTMENT_INQUIRY_KEYWORDS = [
    "어느 과", "무슨 과", "어떤 과", "몇 과", "어디 과",
    "어느 진료과", "무슨 진료과", "어떤 진료과", "진료과 추천", "진료과 안내",
]


def check_department_inquiry(text: str) -> bool:
    """"어느 과에 가야 하나"류 진료과 문의인지 — 진단 요구와 구분하는 결정적 판단(요구사항 L49·L57)."""
    t = text.replace(" ", "")
    return any(k.replace(" ", "") in t for k in DEPARTMENT_INQUIRY_KEYWORDS)


def check_repeated(history_texts: list[str], current: str, threshold: int = 3) -> bool:
    same = sum(1 for h in history_texts if h.strip() == current.strip()) + 1
    return same >= threshold


async def check_escalation(text, history_texts, *, unhelpful_flagged=False,
                           no_answer=False, model=None) -> str | None:
    # 결정적 조건 먼저(AI 불필요).
    if unhelpful_flagged:
        return "unhelpful"
    if no_answer:
        return "no_answer"
    if check_repeated(history_texts, text):
        return "repeated"
    # AI 판단 조건: 의료판단 필요 / 정보 불일치 주장 / 불만. 아니면 None.
    # ⚠️ prompt | model 파이프 대신 format_messages + ainvoke — 주입 모델(테스트 가짜)이
    #    langchain Runnable이 아니어도 물리게 한다. 실제 ChatAnthropic도 ainvoke를 그대로 받는다.
    llm = model or get_chat_model()
    prompt = ChatPromptTemplate.from_messages([
        ("system", "환자 메시지를 다음 중 하나로만 분류하세요: "
                   "medical_judgment(진단·치료 판단 요구), data_mismatch(안내가 틀렸다는 주장), "
                   "complaint(불만·항의), none(해당 없음). 한 단어만 답하세요."),
        ("human", "{text}"),
    ])
    resp = await llm.ainvoke(prompt.format_messages(text=text))
    label = resp_text(resp).strip()
    if label not in LLM_ESCALATION_LABELS:
        return None
    # "어느 과 가야하나"류 진료과 문의가 medical_judgment로 잡혀도 인계하지 않고 진료과 안내(department_guide)로 넘긴다.
    # 진단어("무슨 병")가 없으면 안내가 맞다(요구사항 L49·L57 vs L51). 상위 orchestrator가 이어서 classify로 department_guide 판정.
    if label == "medical_judgment" and check_department_inquiry(text):
        return None
    # ⚠️ 정책성 질문 과오탐(2026-09-07 원격 e2e 발견): "마스크 꼭 써야 하나요?"류 의무형이
    # medical_judgment로 일관 오분류돼(재현 5/5) RAG 도달 전 인계된다(KB엔 "권장" 답이 있고
    # "마스크 착용 규정?"·"감염 예방 수칙"은 rag로 정답). **사용자 결정 2026-09-07: 현행 유지** —
    # 안전측 인계 우선(설계 철학 "오탐<미탐"), 예시 1건으로 카브아웃을 신설하면 진짜 의료판단 인계를
    # 억누를 위험이 더 크다. 정책성 질문 인계가 운영 중 반복되면 위 check_department_inquiry 선례처럼
    # 결정적 카브아웃을 신설한다(그때 screen-behaviors+결정문서 정본화). 기각: 지금 카브아웃 신설.
    return label
