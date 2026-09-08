# 진료과 추천형 — RAG/에이전트보다 강한 안전 규칙(요구사항 5.3).
# Q3(2026-09-08): 진단식 다단질문(언제부터·동반증상·방문목적을 순서대로 캐물음)을 폐지하고,
#   "증상이 불명확하면 딱 한 번만 질문 → 증상을 들으면 바로 적합 진료과 추천(애매하면 최대 두 곳)"으로 통합한다.
#   봇은 병명 진단을 하지 않으며(SAFETY_RULES), 추천 문장에는 실제 진료과 이름을 그대로 넣어
#   호출부가 문장에서 진료과를 매칭해 "○○과로 예약하기" 재료를 뽑는다(DEPT-GUIDE-MATCH).
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model, resp_text

SAFETY_RULES = """[절대 규칙 — 위반 금지]
- 병명을 진단하지 마세요. "OO병으로 보입니다"처럼 확정적으로 말하지 마세요.
- 약이나 치료법을 추천하지 마세요.
- 가능한 진료과를 안내하되 최종 선택은 환자가 확인한다고 안내하세요."""

GUIDE_SYSTEM_PROMPT = (
    "당신은 병원의 AI 상담봇입니다. 환자의 불편한 증상을 듣고 알맞은 진료과를 안내합니다.\n"
    + SAFETY_RULES
    + "\n[진행 규칙 — 진단식 문진 금지]\n"
      "- 환자가 아직 어떤 불편인지 말하지 않았으면, '어떤 불편이 있으세요?'처럼 딱 한 번만 부드럽게 여쭤보세요. "
      "증상을 이미 들었는데도 다시 되묻거나, 아픈 부위·통증 종류·발열 여부 등을 순서대로 캐묻지 마세요.\n"
      "- 환자가 증상을 한 번이라도 말했으면 되묻지 말고, 바로 아래 진료과 목록에서 가장 적합한 한 곳을 "
      "그 이름 그대로 골라 추천하세요. 한 곳으로 좁히기 애매하면 목록 안에서 최대 두 곳까지 함께 안내해도 됩니다: {depts}\n"
      "- 목록에 없는 진료과나 병명은 만들지 마세요.\n"
      "- 추천할 때는 공감 한 문장 + '○○과를 추천드려요'(목록의 이름 그대로) + 최종 선택은 직접 확인하라는 안내로 답하세요."
)


async def respond(history_text: str, dept_names: list[str], model=None) -> str:
    """증상 대화에 한 번 응답한다 — 불명확하면 한 번만 질문, 증상이 있으면 바로 진료과를 추천한다.

    - history_text : 지금까지의 대화(마지막 줄이 이번 환자 발화).
    - dept_names   : 실제 진료과 이름 목록 — 이 안에서만 추천하도록 강제한다.
    반환: 봇 답변 문장(추천이면 진료과명이 포함돼 호출부가 매칭한다).
    """
    names = ", ".join(dept_names)
    prompt = ChatPromptTemplate.from_messages([
        ("system", GUIDE_SYSTEM_PROMPT),
        ("human", "지금까지 대화:\n{history}\n\n위 규칙대로 답하세요."),
    ])
    # format_messages + ainvoke — 주입 가짜 모델 호환(safety_watchdog와 동일 이유).
    resp = await (model or get_chat_model()).ainvoke(
        prompt.format_messages(history=history_text, depts=names))
    return resp_text(resp).strip()


def advance_flow(collected: dict, collected_update: dict) -> dict:
    # 문진 수집분 누적(세션 flow_collected 갱신용). 세션 커밋은 호출부(Task 9 파이프라인)가 한다.
    merged = dict(collected or {})
    merged.update(collected_update or {})
    return merged
