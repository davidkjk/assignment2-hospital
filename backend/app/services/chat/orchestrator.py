# 매 메시지 파이프라인: ⓪응급 → ①인계감시 → ②라우터 → 갈래 실행. 인계 조건은 어느 갈래든 우선한다.
from app.services.chat import safety_watchdog, chat_router, department_guide_chain

CHAT_CONTEXT_TURN_WINDOW = 12     # 최근 N턴은 원문, 그 앞은 요약(MR2-08 — 절단 아님)
CHAT_NUDGE_MESSAGE_COUNT = 40     # 이 이상이면 CHAT-LEN 소프트 넛지 신호(하드컷 아님)

# WEBCHAT-NOANS: 봇이 근거를 못 찾았을 때(RAG no_answer) 자동 인계·자동 티켓을 만들지 않는다(폐기).
# 대신 봇 말풍선 + FAQ 칩(텍스트 전송) + [직원에게 연결] 콜백 칩을 내고 세션은 유지한다.
# 인계는 사용자가 칩을 눌러야 시작(익명 인계 폼 WEBANON-HANDOFF). 미해결 질문은 티켓 없이도 기록(record_unresolved).
NO_ANSWER_REPLY = "그 질문은 제가 바로 답을 찾지 못했어요. 이런 걸 도와드릴 수 있어요:"
NO_ANSWER_QUICK_REPLIES = ["진료시간이 어떻게 되나요", "예약하려면 어떻게 하나요", "오시는 길이 궁금해요"]
NO_ANSWER_HANDOFF_CHIP = "직원에게 연결"


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
    # ⓪-b 명시적 직원 연결 요청 — 결정적. 사용자가 사람을 직접 찾으면 갈래·모드와 무관하게 바로 인계(정본 §1 신설).
    if safety_watchdog.check_staff_request(message):
        return {"route_taken": "handoff", "handoff_reason": "staff_request", "escalated": True}
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
        # WEBCHAT-NOANS: 자동 인계 폐기 → 봇 말풍선 + FAQ 칩 + [직원에게 연결] 콜백 칩(세션 유지).
        return {"route_taken": "no_answer", "reply": NO_ANSWER_REPLY,
                "quick_replies": NO_ANSWER_QUICK_REPLIES, "handoff_chip": NO_ANSWER_HANDOFF_CHIP,
                "escalated": False}
    return {"route_taken": "rag", **result}
