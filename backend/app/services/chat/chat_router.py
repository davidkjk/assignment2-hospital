# ② 라우터. active_flow가 있으면 재분류하지 않고 그 갈래를 유지한다(중간 답변 누수 방지, 옛 플랜 :146).
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model, resp_text
# [브랜치 A · 스위치] 보수적 라우팅 원칙 — llm 이해기와 단일 출처 공유(정보 질문→agent 오라우팅 억제).
from app.services.chat.conversation_understanding import _CONSERVATIVE_ROUTING_PRINCIPLE

ROUTES = {"rag", "department_guide", "agent"}

_CLASSIFY_SYSTEM = ("환자 메시지를 다음 중 하나로만 분류하세요: "
                    "rag(병원 정보 안내), department_guide(어느 과에 가야 하는지 증상 상담), "
                    "agent(예약·취소·문진 등 행동). 한 단어만 답하세요.")


async def classify(text: str, *, active_flow: str | None = None, model=None,
                   conservative_routing: bool | None = None) -> str:
    if active_flow == "department_guide":
        return "department_guide"      # 진행 중 문진은 재분류 금지
    if conservative_routing is None:
        from app.core.config import settings
        conservative_routing = settings.chat_conservative_routing
    system = _CLASSIFY_SYSTEM + ("\n" + _CONSERVATIVE_ROUTING_PRINCIPLE if conservative_routing else "")
    prompt = ChatPromptTemplate.from_messages([
        ("system", system),
        ("human", "{text}"),
    ])
    # format_messages + ainvoke — 주입 가짜 모델 호환.
    resp = await (model or get_chat_model()).ainvoke(prompt.format_messages(text=text))
    label = resp_text(resp).strip()
    return label if label in ROUTES else "rag"    # 불명확하면 안전한 안내형
