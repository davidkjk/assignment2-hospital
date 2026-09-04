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


def check_emergency(text: str) -> bool:
    t = text.replace(" ", "")
    return any(k.replace(" ", "") in t for k in EMERGENCY_KEYWORDS)


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
    return label if label in LLM_ESCALATION_LABELS else None
