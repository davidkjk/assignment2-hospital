from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import resp_text
from app.services.chat.rag_service import (_ANSWER_SYSTEM_PROMPT, _NEEDS_CLARIFY_SENTINEL,
                                           _NO_ANSWER_SENTINEL)

# 순수 판정/생성 노드 — 모델을 인자로 받아 주입 가짜모델로 단위 테스트 가능하게 한다.
# 판정(grade·rewrite·decompose·verify)은 judge_model(Haiku), 생성(generate)은 answer_model(Sonnet)이
#   service.py에서 주입된다. format_messages+ainvoke만 쓴다(가짜모델 호환, rag_service와 동일 계약).


def _join_docs(chunks: list[dict]) -> str:
    return "\n\n".join(c.get("content", "") for c in chunks) or "(자료 없음)"


# ── grade: 검색 자료가 질문에 관련·충분한가 ──
_GRADE_SYSTEM = (
    "당신은 병원 상담 검색 채점기입니다. 아래 <자료>가 <질문>에 답하기에 관련 있고 충분한지 판정하세요. "
    "관련·충분하면 정확히 'RELEVANT', 아니면 정확히 'NO'만 출력합니다. 다른 말은 쓰지 마세요.\n"
    "<질문>\n{q}\n</질문>\n<자료>\n{docs}\n</자료>"
)


async def grade_documents(message: str, chunks: list[dict], *, model) -> bool:
    prompt = ChatPromptTemplate.from_messages([("system", _GRADE_SYSTEM), ("human", "{q}")])
    resp = await model.ainvoke(prompt.format_messages(q=message, docs=_join_docs(chunks)))
    return "RELEVANT" in resp_text(resp).upper()


# ── rewrite: 검색 실패 시 교정 질의 재작성(검색 전용, 화면·LLM엔 원문 유지) ──
_REWRITE_SYSTEM = (
    "환자의 <질문>으로 검색했지만 병원 자료를 못 찾았습니다. 검색이 더 잘 되도록 질의를 한 줄로 다시 쓰세요. "
    "동의어·정확한 용어·구체적 표현을 쓰되(예: '씨티'→'CT 조영제 검사'), 새 정보를 지어내지 마세요. "
    "검색 질의 한 줄만 출력하고 다른 말은 쓰지 마세요.\n<질문>\n{q}\n</질문>"
)


async def rewrite_query(message: str, chunks: list[dict], *, model) -> str:
    prompt = ChatPromptTemplate.from_messages([("system", _REWRITE_SYSTEM), ("human", "{q}")])
    resp = await model.ainvoke(prompt.format_messages(q=message))
    rewritten = resp_text(resp).strip()
    return rewritten or message


# ── decompose: 복합 질문을 하위 질의로 분해(단일/실패는 원문) ──
_DECOMPOSE_SYSTEM = (
    "환자의 <질문>에 서로 다른 사실 질문이 둘 이상 들어 있으면, 각 질문을 검색용 한 줄로 나눠 줄바꿈으로 출력하세요. "
    "질문이 하나뿐이면 원문 한 줄만 출력하세요. 새 질문을 지어내지 말고, 설명·번호·기호 없이 질의 줄만 출력합니다.\n"
    "<질문>\n{q}\n</질문>"
)


async def decompose_question(message: str, *, model) -> list[str]:
    prompt = ChatPromptTemplate.from_messages([("system", _DECOMPOSE_SYSTEM), ("human", "{q}")])
    resp = await model.ainvoke(prompt.format_messages(q=message))
    lines = [ln.strip() for ln in resp_text(resp).splitlines() if ln.strip()]
    return lines or [message]


# ── verify: 답 초안이 자료로 뒷받침되나(Self-RAG) ──
_VERIFY_SYSTEM = (
    "당신은 병원 상담 답변 검증기입니다. <답변초안>의 사실 주장이 모두 <자료>로 뒷받침되는지 판정하세요. "
    "자료에 없는 사실을 지어냈으면 'NO', 모두 자료에 근거하면 'GROUNDED'만 정확히 출력합니다. 다른 말은 쓰지 마세요.\n"
    "<답변초안>\n{draft}\n</답변초안>\n<자료>\n{docs}\n</자료>"
)


async def verify_grounding(draft: str, chunks: list[dict], *, model) -> bool:
    prompt = ChatPromptTemplate.from_messages([("system", _VERIFY_SYSTEM), ("human", "검증")])
    resp = await model.ainvoke(prompt.format_messages(draft=draft, docs=_join_docs(chunks)))
    return "GROUNDED" in resp_text(resp).upper()


# ── generate: 버퍼 생성 + 센티넬 판정(방출은 finalize에서 검증 후) ──
async def generate_answer(message: str, chunks: list[dict], examples: list[dict], *, model) -> dict:
    # 제한자료가 아닌 일반 청크만 근거(제한자료 1위는 그래프가 앞서 finalize로 뺌 — 여기 안 옴).
    normal = [c for c in chunks if not c.get("is_restricted")]
    context = "\n\n".join(c.get("content", "") for c in normal)
    messages = [("system", _ANSWER_SYSTEM_PROMPT)]
    fmt = {"context": context, "q": message}
    if examples:
        few_shot = "\n\n".join(f"질문: {e['question']}\n답변: {e['answer']}" for e in examples)
        messages.append(("system",
                         "아래는 비슷한 질문에 직원이 검토·교정한 모범 답변입니다. 어투와 정확도의 참고로만 쓰고, "
                         "실제 답은 위 병원 자료를 근거로 하세요.\n{examples}"))
        fmt["examples"] = few_shot
    messages.append(("human", "{q}"))
    prompt = ChatPromptTemplate.from_messages(messages)
    resp = await model.ainvoke(prompt.format_messages(**fmt))
    reply = resp_text(resp).strip()
    if _NO_ANSWER_SENTINEL in reply:                         # 근거 부재가 되묻기보다 우선(안전)
        return {"draft": "", "sentinel": "no_answer", "clarify_question": None}
    if _NEEDS_CLARIFY_SENTINEL in reply:
        q = reply.split(_NEEDS_CLARIFY_SENTINEL, 1)[1].lstrip(":：").strip()
        if not q:
            return {"draft": "", "sentinel": "no_answer", "clarify_question": None}
        return {"draft": "", "sentinel": "needs_clarify", "clarify_question": q}
    return {"draft": reply, "sentinel": None, "clarify_question": None}
