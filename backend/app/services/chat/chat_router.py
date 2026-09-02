# ② 라우터. active_flow가 있으면 재분류하지 않고 그 갈래를 유지한다(중간 답변 누수 방지, 옛 플랜 :146).
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model

ROUTES = {"rag", "department_guide", "agent"}


async def classify(text: str, *, active_flow: str | None = None, model=None) -> str:
    if active_flow == "department_guide":
        return "department_guide"      # 진행 중 문진은 재분류 금지
    prompt = ChatPromptTemplate.from_messages([
        ("system", "환자 메시지를 다음 중 하나로만 분류하세요: "
                   "rag(병원 정보 안내), department_guide(어느 과에 가야 하는지 증상 상담), "
                   "agent(예약·취소·문진 등 행동). 한 단어만 답하세요."),
        ("human", "{text}"),
    ])
    # format_messages + ainvoke — 주입 가짜 모델 호환.
    resp = await (model or get_chat_model()).ainvoke(prompt.format_messages(text=text))
    label = getattr(resp, "content", str(resp)).strip()
    return label if label in ROUTES else "rag"    # 불명확하면 안전한 안내형
