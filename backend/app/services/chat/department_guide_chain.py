# 진료과 추천형(문진 체인) — RAG/에이전트보다 강한 안전 규칙(요구사항 5.3).
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model, resp_text

SAFETY_RULES = """[절대 규칙 — 위반 금지]
- 병명을 진단하지 마세요. "OO병으로 보입니다"처럼 확정적으로 말하지 마세요.
- 약이나 치료법을 추천하지 마세요.
- 가능한 진료과를 안내하되 최종 선택은 환자가 확인한다고 안내하세요."""

STEP_INSTRUCTIONS = {
    0: "환자가 방금 불편한 증상을 말했습니다. 공감 한 문장 후, 증상이 언제부터 시작됐는지 물어보세요.",
    1: "시작 시점을 들었습니다. 공감 한 문장 후, 다른 동반 증상이 있는지 물어보세요.",
    2: "동반 증상까지 들었습니다. 지금까지 들은 내용을 한 문장으로 요약하고, 방문 목적을 물어보세요.",
}


async def ask_next_question(history_text: str, step: int, model=None) -> str:
    instruction = STEP_INSTRUCTIONS.get(step, STEP_INSTRUCTIONS[2])
    prompt = ChatPromptTemplate.from_messages([
        ("system", "당신은 병원의 AI 상담봇입니다. 진료과 선택을 돕는 문진 중입니다.\n" + SAFETY_RULES),
        ("human", "지금까지 대화:\n{history}\n\n이번 단계 지시: {step_instruction}"),
    ])
    # format_messages + ainvoke — 주입 가짜 모델 호환(safety_watchdog와 동일 이유).
    resp = await (model or get_chat_model()).ainvoke(
        prompt.format_messages(history=history_text, step_instruction=instruction))
    return resp_text(resp).strip()


def advance_flow(collected: dict, collected_update: dict) -> dict:
    # 문진 수집분 누적(세션 flow_collected 갱신용). 세션 커밋은 호출부(Task 9 파이프라인)가 한다.
    merged = dict(collected or {})
    merged.update(collected_update or {})
    return merged
