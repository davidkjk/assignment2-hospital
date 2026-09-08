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


async def recommend_department(history_text: str, dept_names: list[str], model=None) -> str:
    """문진이 충분히 진행되면 **실제 진료과 목록 중 하나**를 골라 추천 문장을 만든다.
    ⚠️ ask_next_question은 질문만 하고 결론을 안 낸다 — 추천이 대화에 안 나오면 앱이 "○○과로 계속하기"를
       띄울 수 없다. 그래서 마무리 단계에선 반드시 목록 안의 한 과를 이름 그대로 언급하게 강제한다
       (앱은 답변 문장에 등장한 진료과명을 실제 목록과 매칭해 추천을 뽑는다 — DEPT-GUIDE-MATCH)."""
    names = ", ".join(dept_names)
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "당신은 병원의 AI 상담봇입니다. 지금까지 들은 증상에 맞는 진료과를 안내하는 마무리 단계입니다.\n"
         + SAFETY_RULES
         + "\n[추천 규칙]\n"
           "- 반드시 다음 진료과 목록 중에서 **정확히 한 개**를 그 이름 그대로 골라 추천하세요: {depts}\n"
           "- 목록에 없는 과나 병명은 만들지 마세요. 애매하면 목록 중 가장 가까운 한 곳을 고르세요.\n"
           "- 형식: 공감 한 문장 + \"○○과를 추천드려요\"(목록의 이름 그대로) + 최종 선택은 직접 확인하라는 안내."),
        ("human", "지금까지 대화:\n{history}\n\n위 규칙대로 진료과 한 곳을 추천하세요."),
    ])
    resp = await (model or get_chat_model()).ainvoke(
        prompt.format_messages(history=history_text, depts=names))
    return resp_text(resp).strip()


def advance_flow(collected: dict, collected_update: dict) -> dict:
    # 문진 수집분 누적(세션 flow_collected 갱신용). 세션 커밋은 호출부(Task 9 파이프라인)가 한다.
    merged = dict(collected or {})
    merged.update(collected_update or {})
    return merged
