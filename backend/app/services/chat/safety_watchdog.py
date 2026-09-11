# ⓪ 응급 검사 + ① 인계 감시. 응급은 규칙 기반(결정적) — AI 확률 판단에 안전을 맡기지 않는다(옛 플랜 :30, 정본 §0).
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model, resp_text

# 병원과 함께 다듬는 큐레이션 목록(확장 가능). 오탐보다 미탐이 위험하므로 넓게 잡는다.
# 응급을 두 갈래로 나눈다(① 결정 2026-09-09, 문안 사용자 승인):
#   · 마음 위기(정신건강) — 자살·자해 등 → 자살예방·정신건강 상담번호를 먼저 안내(119도 함께).
#   · 신체 응급 — 그 밖의 신체 위급 → 119/응급실.
# 함께 언급되면 마음 위기가 우선한다(emergency_kind에서 mental을 먼저 검사).
MENTAL_CRISIS_KEYWORDS = ["자살", "죽고 싶", "자해", "극단적 선택"]
PHYSICAL_EMERGENCY_KEYWORDS = [
    "119", "응급실", "의식이 없", "숨을 못", "숨이 안", "호흡곤란",
    "피를 많이", "출혈이 멈", "쓰러졌", "경련", "발작", "심장이", "마비",
]
# 흉부 응급은 "가슴" 단독으로 잡으면 "가슴사진(흉부·유방촬영)"·"가슴사진 비싸요?"까지 119로 오판한다(#8).
#   → "가슴" 언급 + 흉부 증상어가 함께 나올 때만 신체 응급으로 본다. 부사가 껴도("가슴이 너무 아파요")
#   공기(共起)로 잡으므로 옛 인접 매칭의 한계는 없다. 오탐<미탐 원칙은 증상어를 넓게 잡아 지킨다.
CHEST_DISTRESS_TERMS = [
    "아파", "아프", "아팠", "통증", "답답", "조여", "조이", "조인", "쥐어",
    "짓눌", "짓누", "뻐근", "먹먹", "터질", "터져", "두근", "벌렁",
]
# 하위호환: check_emergency는 두 갈래를 합쳐 본다(orchestrator ⓪ 게이트·기존 호출부 유지).
EMERGENCY_KEYWORDS = PHYSICAL_EMERGENCY_KEYWORDS + MENTAL_CRISIS_KEYWORDS

EMERGENCY_REPLY = (
    "지금 위급한 상황일 수 있어요. 즉시 119에 전화하거나 가까운 응급실로 가 주세요. "
    "이 상담은 응급 진료를 대신할 수 없습니다."
)
# 마음 위기(정신건강) 안내 — 자살예방 통합상담 109, 정신건강 상담전화 1577-0199(문안 승인 2026-09-09).
EMERGENCY_REPLY_MENTAL = (
    "많이 힘드셨을 것 같아요. 지금 마음이 많이 어렵다면 혼자 견디지 마시고 전문 상담사와 이야기 나눠 보세요. "
    "24시간 상담할 수 있어요 — 자살예방 상담전화 ☎109, 정신건강 상담전화 ☎1577-0199. "
    "지금 당장 위험하다고 느껴지면 즉시 119에 전화하거나 가까운 응급실로 가 주세요. "
    "이 상담은 전문 심리상담이나 응급 진료를 대신할 수 없어요."
)

# 인계 사유 = support_tickets 생성 사유(late_cancellation은 도구가 별도 생성). medical_judgment는
# §9.10 P0(2026-09-10) 이후 결정적 denylist(check_diagnosis_request)가 판정하고, LLM은 판정하지 않는다.
# LLM이 판정하는 사유는 data_mismatch(안내가 틀렸다는 주장)·complaint(불만)뿐이다(P1에서 구조화 예정).
LLM_ESCALATION_LABELS = {"data_mismatch", "complaint"}

# 명시적 직원 연결 요청 — 결정적(응급처럼 AI 확률판단에 안 맡김). 사용자가 직접 사람을 찾으면 바로 인계한다.
# "연결/바꿔/문의/물어" 같은 연결 의도어를 반드시 함께 담아 "직원분 친절해요?" 같은 단순 언급은 안 걸리게 큐레이션.
EXPLICIT_STAFF_KEYWORDS = [
    "직원 연결", "직원에게 연결", "직원한테 연결", "직원과 연결", "직원이랑 연결", "직원분 연결",
    "직원 바꿔", "직원한테 바꿔", "직원에게 문의", "직원에게 물어", "직원한테 물어", "직원 좀 연결",
    "상담원 연결", "상담원에게 연결", "상담원한테", "상담원과 연결", "상담원 바꿔", "상담사 연결",
    "사람과 연결", "사람이랑 연결", "사람한테 연결", "실제 직원", "진짜 사람", "담당자 연결", "담당자에게 연결",
]


def emergency_kind(text: str) -> str | None:
    """응급 갈래를 결정적으로 판정한다 — "mental"(마음 위기) | "physical"(신체 응급) | None.

    마음 위기 신호가 있으면 신체 신호가 함께 있어도 mental이 우선한다(자살예방 상담을 먼저 준다).
    """
    t = text.replace(" ", "")
    if any(k.replace(" ", "") in t for k in MENTAL_CRISIS_KEYWORDS):
        return "mental"
    if any(k.replace(" ", "") in t for k in PHYSICAL_EMERGENCY_KEYWORDS):
        return "physical"
    # 흉부: "가슴" + 증상어 공기일 때만(가슴사진 등 영상검사 문의는 통과).
    if "가슴" in t and any(d in t for d in CHEST_DISTRESS_TERMS):
        return "physical"
    return None


def emergency_reply(kind: str) -> str:
    """응급 갈래별 안내 문구. mental=자살예방·정신건강 상담(+119), 그 외=신체 응급(119)."""
    return EMERGENCY_REPLY_MENTAL if kind == "mental" else EMERGENCY_REPLY


def check_emergency(text: str) -> bool:
    # 하위호환 게이트: 신체·마음 어느 쪽이든 응급이면 True(orchestrator ⓪·dept_guide 등 기존 호출부 유지).
    return emergency_kind(text) is not None


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


# 진단·처방·검사결과 해석 요구 — 요구사항 1.5("봇은 의사처럼 진단·약 추천 금지, 의료 판단 필요 질문은 인계").
# §9.10 P0(2026-09-10 사용자 승인): LLM "medical_judgment" 선판정을 제거하고, 여기에 걸릴 때만 결정적으로 인계한다.
# 그 외 증상 서술("배가 아파")·정책 질문("마스크 꼭…")·진료과 문의·검사 준비(rag)는 봇이 답하거나 진료과를 추천한다.
# 큐레이션 목록(병원과 함께 확장 가능). check_department_inquiry(allowlist)의 대응 — 이쪽은 인계 denylist.
# ⚠️ 검사 준비 KB 질문("검사 결과 언제 나오나요"·"검사 전 먹어도 되나요")을 오탐하지 않도록 표현을 좁힌다.
DIAGNOSIS_REQUEST_KEYWORDS = [
    # 진단 요구(병명 판정)
    "무슨 병", "무슨 병이", "병명", "암인가", "암일까", "진단해", "진단 좀", "진단받",
    # 약·처방 요구(어떤 약·복용량·처방)
    "무슨 약", "어떤 약", "약 추천", "약을 추천", "약 먹어야", "약을 먹어야",
    "약 먹어도", "약을 먹어도", "얼마나 먹어야", "며칠 먹어야", "복용", "처방",
    # 검사 결과 해석 요구(수치·결과의 정상/비정상 판정) — "언제 나오나요"류 안내와 구분
    "결과 해석", "이 수치", "수치가 정상", "검사 결과 어때", "검사 결과 괜찮",
]


def check_diagnosis_request(text: str) -> bool:
    """진단·처방·검사결과 해석 요구인지 — 결정적 판단(요구사항 1.5, 정본 §9.10 P0).

    걸리면 봇이 답을 시도하지 않고 인계(medical_judgment)한다. 증상 서술·정책 질문·검사 준비는 걸리지 않는다.
    """
    t = text.replace(" ", "")
    return any(k.replace(" ", "") in t for k in DIAGNOSIS_REQUEST_KEYWORDS)


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
    # §9.10 P0(2026-09-10 사용자 승인): 진단·처방·결과해석 요구만 결정적으로 medical_judgment 인계한다.
    #   옛 방식은 답 시도 전 LLM 한 단어로 medical_judgment를 선판정해, 증상 서술("배가 아파")·정책 의무형
    #   ("마스크 꼭 써야 하나요?", 재현 5/5)까지 인계로 쓸려 대화가 통째로 "직원 연결"로 끝났다(§9.10 A).
    #   이제 진단요구(denylist)만 인계하고, 그 외 증상·정책 질문은 None을 돌려 정상 갈래(dept_guide/rag)로 흐른다.
    #   진료과 문의는 애초에 denylist에 없어 통과한다(요구사항 L49·L57 vs 1.5).
    if check_diagnosis_request(text):
        return "medical_judgment"
    # 남은 LLM 판단 조건: 정보 불일치 주장(data_mismatch) / 불만(complaint). 아니면 None.
    # ⚠️ prompt | model 파이프 대신 format_messages + ainvoke — 주입 모델(테스트 가짜)이
    #    langchain Runnable이 아니어도 물리게 한다. 실제 ChatAnthropic도 ainvoke를 그대로 받는다.
    llm = model or get_chat_model()
    prompt = ChatPromptTemplate.from_messages([
        ("system", "환자 메시지를 다음 중 하나로만 분류하세요: "
                   "data_mismatch(안내가 틀렸다는 주장), complaint(불만·항의), "
                   "none(해당 없음). 한 단어만 답하세요."),
        ("human", "{text}"),
    ])
    resp = await llm.ainvoke(prompt.format_messages(text=text))
    label = resp_text(resp).strip()
    if label not in LLM_ESCALATION_LABELS:
        return None
    return label
