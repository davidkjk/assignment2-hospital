# 매 메시지 파이프라인: ⓪응급 → ①인계감시 → ②라우터 → 갈래 실행. 인계 조건은 어느 갈래든 우선한다.
from app.services.chat import safety_watchdog, chat_router, department_guide_chain

CHAT_CONTEXT_TURN_WINDOW = 12     # 최근 N턴은 원문, 그 앞은 요약(MR2-08 — 절단 아님)
CHAT_NUDGE_MESSAGE_COUNT = 40     # 이 이상이면 CHAT-LEN 소프트 넛지 신호(하드컷 아님)


def should_nudge_length(message_count: int) -> bool:
    return message_count >= CHAT_NUDGE_MESSAGE_COUNT


async def make_closing_summary(history_text: str, model=None) -> str:
    # 만료·이어가기 요약: 최근 창(CHAT_CONTEXT_TURN_WINDOW) 밖 맥락을 절단 대신 요약해 보존(MR2-08).
    from langchain_core.prompts import ChatPromptTemplate
    from app.integrations.langchain_client import get_chat_model, resp_text
    prompt = ChatPromptTemplate.from_messages([
        ("system", "다음 상담 대화를 이어가기 위한 짧은 요약을 3문장 이내로 작성하세요. "
                   "진단·처방은 하지 말고, 무엇을 물었고 무엇을 안내했는지만 요약하세요."),
        ("human", "{history}"),
    ])
    resp = await (model or get_chat_model()).ainvoke(prompt.format_messages(history=history_text))
    return resp_text(resp).strip()


async def orchestrate(session, message, *, history_texts=None, restricted=False,
                      unhelpful_flagged=False, rag_fn=None, agent_fn=None, model=None) -> dict:
    history_texts = history_texts or []
    # ⓪ 응급 — 모드·갈래와 무관하게 항상 최우선(정본 §0).
    if safety_watchdog.check_emergency(message):
        return {"route_taken": "emergency", "reply": safety_watchdog.EMERGENCY_REPLY, "escalated": False}
    # ① 인계 감시 — 조건 감지 시 무조건 인계(에이전트 도구 아님).
    reason = await safety_watchdog.check_escalation(
        message, history_texts, unhelpful_flagged=unhelpful_flagged,
        no_answer=False, model=model)
    if reason:
        return {"route_taken": "handoff", "handoff_reason": reason, "escalated": True}
    # ② 라우터 — 진행 중 문진은 유지.
    active_flow = getattr(session, "active_flow", None) if not restricted else None
    route = await chat_router.classify(message, active_flow=active_flow, model=model)
    # 제한모드(예약 중 상담): 정보성 안내·진료과 추천만. 행동형 금지, 유일 출구는 "○○과로 계속하기"(E4·정본 §0).
    if restricted and route == "agent":
        route = "rag"
    if route == "department_guide":
        reply = await department_guide_chain.ask_next_question(
            "\n".join(history_texts), getattr(session, "flow_step", 0), model=model)
        return {"route_taken": "department_guide", "reply": reply, "escalated": False}
    if route == "agent":
        # 행동형 도구·카드는 Task 6이 주입. no_answer면 인계로 되돌린다.
        if agent_fn is None:
            return {"route_taken": "agent", "reply": None, "escalated": False}
        return {"route_taken": "agent", **(await agent_fn(session, message))}
    # 안내형 RAG — 검색은 Task 7이 주입. 검색 실패는 no_answer 인계로.
    if rag_fn is None:
        return {"route_taken": "rag", "reply": None, "escalated": False}
    result = await rag_fn(session, message)
    if result.get("no_answer"):
        return {"route_taken": "handoff", "handoff_reason": "no_answer", "escalated": True}
    return {"route_taken": "rag", **result}
