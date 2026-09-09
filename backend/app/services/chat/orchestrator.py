# 매 메시지 파이프라인: ⓪응급 → ①인계감시 → ②라우터 → 갈래 실행. 인계 조건은 어느 갈래든 우선한다.
import json

from app.services.chat import (safety_watchdog, chat_router, intent_precheck,
                               conversation_understanding)

def session_value(session, key, default=None):
    # session은 서비스가 넘긴 dict/asyncpg Record일 수도, 테스트가 넘긴 객체(SimpleNamespace)일 수도 있다.
    #   ⚠️ getattr만 쓰면 dict/Record엔 속성이 없어 항상 default가 됐다(리포트 §2.3 — active_flow가 늘 None).
    #   속성 접근과 첨자 접근을 모두 시도해 실제 저장값을 읽는다.
    if hasattr(session, key):
        return getattr(session, key)
    try:
        return session[key]
    except (KeyError, TypeError, IndexError):
        return default


CHAT_CONTEXT_TURN_WINDOW = 12     # 최근 N턴은 원문, 그 앞은 요약(MR2-08 — 절단 아님)
CHAT_NUDGE_MESSAGE_COUNT = 40     # 이 이상이면 CHAT-LEN 소프트 넛지 신호(하드컷 아님)

# WEBCHAT-NOANS: 봇이 근거를 못 찾았을 때(RAG no_answer) 자동 인계·자동 티켓을 만들지 않는다(폐기).
# 대신 봇 말풍선 + FAQ 칩(텍스트 전송) + [직원에게 연결] 콜백 칩을 내고 세션은 유지한다.
# 인계는 사용자가 칩을 눌러야 시작(익명 인계 폼 WEBANON-HANDOFF). 미해결 질문은 티켓 없이도 기록(record_unresolved).
NO_ANSWER_REPLY = "그 질문은 제가 바로 답을 찾지 못했어요. 이런 걸 도와드릴 수 있어요:"
NO_ANSWER_QUICK_REPLIES = ["진료시간이 어떻게 되나요", "예약하려면 어떻게 하나요", "오시는 길이 궁금해요"]

# #6(2026-09-08 사용자 요청 "직원인계는 항상 물어보게"): 자유 입력으로 사람 연결을 말하면 바로 인계하지 않고
#   한 번 확인한다 — "직원에게 연결하면 뭘 해주나요" 같은 **질문**이 인계로 오작동하던 것을 막는다.
#   실제 인계는 이 확인 칩(정확히 이 문구)을 눌러야 시작(ⓠ-a). 칩 탭은 명시적 선택이라 재확인 없이 바로 인계한다.
#   no_answer의 연결 칩도 같은 문구를 보내 한 번에 인계된다(칩 자체가 이미 사용자 선택).
#   ⚠️ 예외: 안전 감시(check_escalation — 진단·불만·반복 등)는 보호 목적이라 확인을 끼우지 않고 그대로 자동 인계한다.
HANDOFF_CONFIRM_CHIP = "직원에게 연결하기"
HANDOFF_CONFIRM_REPLY = "직원(사람)에게 연결해 드릴까요? 남기신 내용을 직원이 순서대로 확인해요."
NO_ANSWER_HANDOFF_CHIP = HANDOFF_CONFIRM_CHIP


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


# Q28 인계 요약 3항목 — 직원 티켓 상세(TICKET-DETAIL-SUM-01)의
#   「상담봇이 확인한 정보(bot_confirmed)·이미 안내한 내용(already_guided)·직원이 확인할 사항(staff_should_check)」.
#   나머지 2항목(환자가 궁금해한 내용·해결되지 않은 이유)은 대화·인계사유에서 결정적으로 파생하므로 여기서 안 만든다.
_HANDOFF_SUMMARY_KEYS = ("bot_confirmed", "already_guided", "staff_should_check")


async def make_handoff_summary(history_text: str, model=None) -> dict:
    """인계 시점 대화를 요약해 직원 인계 요약 3항목을 만든다.

    반환: {"bot_confirmed": str|None, "already_guided": str|None, "staff_should_check": str|None}
      · 봇이 실제 **확인/안내한 사실**만 요약한다(진단·처방·의료판단 금지 — 정본 §0).
      · 해당 없음/빈값은 None으로 둔다(SUM-02: 없는 내용을 지어내지 않는다 → 화면 '없음').
      · 파싱·호출 실패는 세 항목 전부 None(best-effort). 인계 자체는 절대 이 요약 때문에 막지 않는다.
    """
    from langchain_core.prompts import ChatPromptTemplate
    from app.integrations.langchain_client import get_chat_model, resp_text
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "다음은 병원 상담봇과 환자의 대화입니다. 직원에게 인계하기 위한 요약을 JSON 객체로만 답하세요.\n"
         "키는 정확히 bot_confirmed, already_guided, staff_should_check 세 개입니다.\n"
         "- bot_confirmed: 상담봇이 대화에서 사실로 확인해 준 정보(예: 진료시간·예약 가능 여부). 없으면 빈 문자열.\n"
         "- already_guided: 봇이 환자에게 이미 안내한 내용. 없으면 빈 문자열.\n"
         "- staff_should_check: 직원이 이어서 확인/처리해야 할 사항. 없으면 빈 문자열.\n"
         "진단·처방·의료적 판단은 절대 넣지 마세요. 대화에 없는 내용을 지어내지 마세요. "
         "각 값은 한 문장 이내로 짧게. JSON 외 다른 텍스트는 쓰지 마세요."),
        ("human", "{history}"),
    ])
    try:
        resp = await (model or get_chat_model()).ainvoke(prompt.format_messages(history=history_text))
        raw = resp_text(resp)
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end == -1 or end < start:
            raise ValueError("no json object")
        parsed = json.loads(raw[start:end + 1])
    except Exception:
        parsed = {}
    out = {}
    for key in _HANDOFF_SUMMARY_KEYS:
        value = parsed.get(key)
        value = value.strip() if isinstance(value, str) else None
        out[key] = value or None
    return out


async def orchestrate(session, message, *, history_texts=None, restricted=False,
                      unhelpful_flagged=False, rag_fn=None, agent_fn=None, intent_fn=None,
                      dept_guide_fn=None, model=None, understanding_mode=None) -> dict:
    history_texts = history_texts or []
    if understanding_mode is None:
        from app.core.config import settings
        understanding_mode = settings.chat_understanding_mode
    # ⓪ 응급 — 모드·갈래와 무관하게 항상 최우선(정본 §0). 마음 위기/신체 응급으로 안내를 나눈다(① 결정).
    kind = safety_watchdog.emergency_kind(message)
    if kind:
        return {"route_taken": "emergency", "reply": safety_watchdog.emergency_reply(kind),
                "escalated": False}
    # ⓠ-a 확인 칩(정확히 이 문구)을 눌렀다 → 명시적 선택이므로 바로 인계(#6). check_staff_request보다 먼저 본다
    #   (확인 문구도 "직원에게 연결"을 포함해 아래 키워드에 걸리므로 순서가 중요).
    if message.strip() == HANDOFF_CONFIRM_CHIP:
        return {"route_taken": "handoff", "handoff_reason": "staff_request", "escalated": True}
    # ⓠ-b 자유 입력으로 사람 연결을 요청 → 바로 인계하지 않고 확인 프롬프트(#6, "항상 물어보게").
    #   no_answer와 같은 카드 경로로 렌더하되 미해결 기록은 남기지 않는다(confirm_handoff 플래그). 세션은 유지.
    if safety_watchdog.check_staff_request(message):
        return {"route_taken": "no_answer", "reply": HANDOFF_CONFIRM_REPLY,
                "quick_replies": [], "handoff_chip": HANDOFF_CONFIRM_CHIP,
                "confirm_handoff": True, "escalated": False}
    # ① 인계 감시 — 조건 감지 시 무조건 인계(에이전트 도구 아님).
    reason = await safety_watchdog.check_escalation(
        message, history_texts, unhelpful_flagged=unhelpful_flagged,
        no_answer=False, model=model)
    if reason:
        return {"route_taken": "handoff", "handoff_reason": reason, "escalated": True}
    # ② 라우터 — 진행 중 문진은 유지.
    active_flow = None if restricted else session_value(session, "active_flow")
    # ①-b 의도 프리체크(B1·B2) — 진료시간·의사명단은 KB가 아니라 DB 단일원본에서 답한다(KBADM-EDITOR-17).
    # RAG(벡터 검색)보다 앞서 결정적 키워드로만 판별해 두루뭉술 답/no_answer를 막는다(사용자 결정 A).
    # 진행 중 문진(active_flow) 중엔 흐름을 지키려 건너뛴다. DB가 비어 답을 못 만들면(None) RAG로 폴백.
    intent = None if active_flow else intent_precheck.detect_intent(message)
    if intent and intent_fn is not None:
        ans = await intent_fn(session, message, intent)
        if ans and ans.get("reply"):
            return {"route_taken": "rag", "reply": ans["reply"], "escalated": False, "intent": intent}
    # ② 라우팅 — 전면 통합(chat_understanding_mode):
    #   legacy = 라우터 classify(②) + 후속질문 rewrite(rag_fn 내부). llm = 이해기 1콜로 통합.
    #   ⚠️ 안전(⓪ⓠ①)·프리체크(①-b)는 위에서 이미 끝났다 — 이해기는 갈래·검색질의만 다룬다(안전 게이트 아님).
    retrieval_query = None                 # llm 모드에서 이해기가 준 독립형 검색 질의(rag_fn에 전달)
    understood = False                      # 이해기가 실제로 갈래를 냈나 — 실패 폴백이면 레거시 rag 경로를 탄다
    if understanding_mode == "llm":
        u = await conversation_understanding.understand(
            message, history_texts, active_flow=active_flow, model=model)
        if u is None:
            # 이해기 실패·형식 위반 → 레거시로 자동 폴백(장애/자동인계로 안 번짐). rag_fn도 2-arg(자체 재작성).
            route = await chat_router.classify(message, active_flow=active_flow, model=model)
        else:
            understood = True
            # 검색-전 되묻기: 애매하면 검색 없이 되묻는다(route_taken=rag 유지 = 실패 아님, 미해결 집계 X).
            #   검색-후 되묻기(rag_service NEEDS_CLARIFY)는 병행 유지 — 두 겹으로 막다른 길 방지(위험 #2).
            if u.needs_clarification and u.route == "rag":
                # (a) 되묻기 계기판: 일반 답변과 구분해 저장(집계 가능). 프론트는 reply를 렌더(무영향).
                return {"route_taken": "needs_clarification", "needs_clarification": True,
                        "reply": u.clarification_question, "escalated": False}
            route = u.route
            if u.standalone_query:
                retrieval_query = conversation_understanding.build_search_query(
                    message, u.standalone_query)
    else:
        route = await chat_router.classify(message, active_flow=active_flow, model=model)
    # 제한모드(예약 중 상담): 정보성 안내·진료과 추천만. 행동형 금지, 유일 출구는 "○○과로 계속하기"(E4·정본 §0).
    if restricted and route == "agent":
        route = "rag"
    if route == "department_guide":
        # Q3: 증상 대화는 진단식 다단질문 없이 dept_guide_fn이 한 번에 답한다
        #     (불명확하면 1회 질문, 증상 있으면 바로 진료과 추천 + suggested_department).
        #     dept_guide_fn은 chat_flow_service가 진료과 목록과 함께 주입한다. 미주입이면 막다른 길 대신 빈 응답.
        if dept_guide_fn is None:
            return {"route_taken": "department_guide", "reply": None, "escalated": False}
        return {"route_taken": "department_guide", "escalated": False,
                **(await dept_guide_fn(session, message))}
    if route == "agent":
        # 행동형 도구·카드는 Task 6이 주입. no_answer면 인계로 되돌린다.
        if agent_fn is None:
            return {"route_taken": "agent", "reply": None, "escalated": False}
        return {"route_taken": "agent", **(await agent_fn(session, message))}
    # 안내형 RAG — 검색은 Task 7이 주입. 검색 실패는 no_answer 인계로.
    if rag_fn is None:
        return {"route_taken": "rag", "reply": None, "escalated": False}
    # llm 모드에서 이해기가 재작성 검색질의를 냈으면 rag_fn에 넘긴다(재작성은 검색에만, 화면·LLM엔 원문).
    #   legacy 모드는 2-arg 그대로 부른다(rag_fn 내부가 스스로 후속질문 재작성 — 계약 무변경).
    if understanding_mode == "llm" and understood:
        result = await rag_fn(session, message, retrieval_query=retrieval_query)
    else:
        result = await rag_fn(session, message)
    if result.get("no_answer"):
        # WEBCHAT-NOANS: 자동 인계 폐기 → 봇 말풍선 + FAQ 칩 + [직원에게 연결] 콜백 칩(세션 유지).
        return {"route_taken": "no_answer", "reply": NO_ANSWER_REPLY,
                "quick_replies": NO_ANSWER_QUICK_REPLIES, "handoff_chip": NO_ANSWER_HANDOFF_CHIP,
                "escalated": False}
    # (a) 검색-후 되묻기(rag_service NEEDS_CLARIFY)도 계기판용으로 구분 저장.
    if result.get("needs_clarification"):
        return {"route_taken": "needs_clarification", **result}
    return {"route_taken": "rag", **result}
