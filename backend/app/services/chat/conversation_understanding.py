"""멀티턴 후속 질문 재작성(리포트 §4.2 · §9.4 · §9.6 Sprint 2).

후속 메시지의 상당수가 미해결 지시어(대명사·생략)를 가져("그럼 물은?"), 원문 그대로 검색하면
핵심어(CT·조영제·준비)가 사라진다. 이 모듈은 **후속 신호가 있을 때만** 단일 LLM 호출로 지시어를
푼 독립형 검색 질의를 만든다.

경계(안전·비용):
- **검색에만** 쓴다 — 재작성 질의는 임베딩·하이브리드 검색에만 들어가고, 화면·로그·LLM 질문에는
  원문을 쓴다(호출부 rag_service가 분리 적용). 재작성어가 환자에게 보이면 안 된다.
- **안전·라우팅은 이 앞에서 이미 결정적으로 끝난다** — 응급·직원요청은 orchestrator가 재작성보다
  앞서 키워드로 판정한다(플레이북 §4: 안전을 LLM 이해기에 종속시키지 않는다). 이 재작성은 route가
  안내형(rag)일 때 검색 질의만 다듬을 뿐, 갈래를 바꾸지 않는다.
- **첫 질문·자기완결 질문엔 태우지 않는다**(has_followup_signal 게이트) — 지연·비용·풀 절약.
- best-effort: 실패·빈결과·원문 그대로면 None → 호출부가 원문으로 검색(재작성은 검색 보조일 뿐).
"""
import json
from dataclasses import dataclass

from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model, resp_text

# 지시어·생략(coreference) 마커. 이게 있고 이전 대화가 있을 때만 재작성 LLM을 태운다.
#   바 "그" 하나는 너무 넓어(다른 단어에 substring) 넣지 않는다 — 강한 지시 표현만 큐레이션.
_FOLLOWUP_MARKERS = [
    "그거", "그건", "그게", "그럼", "그러면", "그래서", "그때", "그곳", "그것",
    "이거", "이건", "이게", "저거", "저건", "거기", "아까", "방금", "위에서", "앞에서",
]

# 이보다 짧은 질의는 지시어를 생략한 후속 표현일 가능성이 높다("물은?", "언제요?").
_SHORT_QUERY_LEN = 8


def has_followup_signal(message: str, history_texts) -> bool:
    """재작성 LLM을 태울 후속 질문 신호가 있는지 — 결정적 판단(LLM·DB 없음)."""
    if not history_texts:
        return False                 # 첫 발화는 풀 맥락이 없다 → 재작성 안 함
    t = (message or "").strip()
    if not t:
        return False
    if len(t) <= _SHORT_QUERY_LEN:   # 아주 짧은 생략형 질의
        return True
    return any(m in t for m in _FOLLOWUP_MARKERS)


async def rewrite_standalone(message: str, history_texts, *, model=None) -> str | None:
    """최근 대화와 현재 발화를 주고 지시어·생략을 푼 독립형 검색 질의 한 줄을 받는다.

    best-effort: 호출 실패·빈결과·원문 echo면 None. 의미를 바꾸거나 새 정보를 지어내지 않도록 지시한다.
    """
    recent = "\n".join((history_texts or [])[-6:])   # 너무 긴 과거는 옛 주제 오염 → 최근 6턴만(§4.2)
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "다음은 병원 상담 대화입니다. 마지막 사용자 질문을, 앞 맥락의 지시어(그거·그럼 등)와 생략을 풀어 "
         "그 자체로 검색 가능한 한 문장의 독립형 질문으로 바꿔 주세요. "
         "질문의 의미를 바꾸거나 대화에 없는 새 정보를 지어내지 마세요. 재작성한 질문 한 줄만 출력하세요."),
        ("human", "대화:\n{recent}\n\n마지막 질문: {message}"),
    ])
    try:
        resp = await (model or get_chat_model()).ainvoke(
            prompt.format_messages(recent=recent, message=message))
        raw = resp_text(resp).strip()
    except Exception:
        return None
    rewritten = raw.splitlines()[0].strip() if raw else ""
    if not rewritten or rewritten == (message or "").strip():
        return None                  # 재작성 가치 없음 → 원문으로 검색
    return rewritten


def build_search_query(message: str, standalone: str | None) -> str:
    """검색용 질의: 재작성 독립질의 + 원문 concat(§9.4 정련 — 단독보다 일관되게 낫다).

    재작성은 지시어·생략을 풀고, 원문은 사용자가 실제 쓴 표면 표현을 보존한다.
    """
    if not standalone:
        return message
    return f"{standalone} {message}".strip()


# ── 전면 통합(전역 플래그 chat_understanding_mode='llm') — 질문 이해 1콜 ───────────────
# 흩어져 있던 질문 이해(② 라우터 classify + 후속질문 rewrite)를 LLM 한 번으로 통합한다.
#   ⚠️ 안전은 이 앞에서 이미 결정적으로 끝난다 — 응급·직원요청·check_escalation(진단·불만·반복)은
#      orchestrator가 이해기보다 앞서 판정한다(플레이북 §4: 안전을 LLM 이해기에 종속시키지 않는다).
#      그래서 이해기의 route에는 handoff/emergency가 없다(rag·department_guide·agent만).
#   되돌리기: 실패·형식 위반이면 None → 호출부가 레거시(classify+rewrite)로 자동 폴백한다.
_UNDERSTAND_ROUTES = {"rag", "department_guide", "agent"}

_UNDERSTAND_SYSTEM = (
    "당신은 병원 상담 대화의 '질문 이해기'입니다. 마지막 사용자 발화를 이해해 JSON 객체로만 답하세요.\n"
    "키는 정확히 다음 여섯 개입니다.\n"
    "- route: rag(병원 정보 안내) | department_guide(어느 과에 가야 하는지 증상 상담) | agent(예약·취소·문진 등 행동). 셋 중 하나.\n"
    "- standalone_query: 후속 질문이면 앞 맥락의 지시어(그거·그럼 등)와 생략을 풀어 그 자체로 검색 가능한 한 문장으로."
    " 첫 질문이거나 이미 자기완결이면 빈 문자열. 의미를 바꾸거나 없는 정보를 지어내지 마세요.\n"
    "- needs_clarification: 무엇을 묻는지 애매해 확인 질문이 필요하면 true, 아니면 false.\n"
    "- clarification_question: needs_clarification가 true일 때 되물을 한 문장(증상을 캐묻지는 않습니다). 아니면 빈 문자열.\n"
    "- topic_shift: 앞 대화와 주제가 바뀌었으면 true, 이어지면 false.\n"
    "- confidence: 이해 확신도 0.0~1.0 실수.\n"
    "진단·처방·응급 판단은 하지 마세요(그 판단은 앞단이 이미 처리했습니다). JSON 외 다른 텍스트는 쓰지 마세요."
)


@dataclass
class Understanding:
    route: str
    standalone_query: str | None
    needs_clarification: bool
    clarification_question: str | None
    topic_shift: bool
    confidence: float


async def understand(message: str, history_texts, *, active_flow: str | None = None,
                     model=None) -> Understanding | None:
    """질문 이해(라우터+재작성)를 LLM 1회로. 실패·형식 위반이면 None(레거시 폴백).

    - 진행 중 문진(active_flow='department_guide')은 재분류하지 않는다 → LLM 호출 없이 그 갈래 유지.
    - route는 허용 3종만, 그 밖은 안전한 안내형(rag)으로 강등.
    - standalone_query가 원문과 같거나 비면 None(재작성 가치 없음 → 원문으로 검색).
    - needs_clarification True인데 질문 본문이 비면 빈 되묻기(막다른 길)라 되묻기 해제(검색으로 진행).
    - confidence는 [0,1]로 클램프. ⚠️ confidence로 안전 게이트를 여닫지 않는다(안전은 앞단 결정적).
    """
    if active_flow == "department_guide":
        return Understanding(route="department_guide", standalone_query=None,
                             needs_clarification=False, clarification_question=None,
                             topic_shift=False, confidence=1.0)
    recent = "\n".join((history_texts or [])[-6:])
    prompt = ChatPromptTemplate.from_messages([
        ("system", _UNDERSTAND_SYSTEM),
        ("human", "대화:\n{recent}\n\n마지막 발화: {message}"),
    ])
    try:
        resp = await (model or get_chat_model()).ainvoke(
            prompt.format_messages(recent=recent, message=message))
        raw = resp_text(resp)
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end == -1 or end < start:
            return None
        parsed = json.loads(raw[start:end + 1])
    except Exception:
        return None

    route = parsed.get("route")
    if route not in _UNDERSTAND_ROUTES:
        route = "rag"                       # 허용 밖·누락 → 안전한 안내형

    standalone = parsed.get("standalone_query")
    standalone = standalone.strip() if isinstance(standalone, str) else ""
    if not standalone or standalone == (message or "").strip():
        standalone = None

    clarify_q = parsed.get("clarification_question")
    clarify_q = clarify_q.strip() if isinstance(clarify_q, str) else ""
    needs_clarify = bool(parsed.get("needs_clarification")) and bool(clarify_q)

    try:
        confidence = float(parsed.get("confidence"))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    return Understanding(
        route=route,
        standalone_query=standalone,
        needs_clarification=needs_clarify,
        clarification_question=clarify_q if needs_clarify else None,
        topic_shift=bool(parsed.get("topic_shift")),
        confidence=confidence,
    )
