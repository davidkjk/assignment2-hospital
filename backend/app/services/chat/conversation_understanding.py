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
