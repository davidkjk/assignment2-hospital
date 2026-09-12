# 빠른답변: 누르면 그 문장이 "환자가 보낸 말풍선"으로 저장된다(제어 신호 아님). 자유 입력은 항상 열림.
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model, resp_text

# 시작 묶음은 AI를 부르지 않는다 — 앱이 다가오는 예약 유무로 고정 4개를 고른다(결정로그 L820-825).
START_WITH_UPCOMING = ["내 예약 확인해줘", "예약을 바꾸고 싶어요", "진료 전에 준비할 게 있나요", "주차할 수 있나요"]
START_NO_UPCOMING = ["진료시간이 어떻게 되나요", "어느 과에 가야 할지 모르겠어요", "예약하려면 어떻게 하나요", "주차할 수 있나요"]


def build_start_quick_replies(has_upcoming: bool) -> list[str]:
    return START_WITH_UPCOMING if has_upcoming else START_NO_UPCOMING


async def generate_conversational(last_question: str, model=None) -> list[str]:
    # 대화 중 묶음: AI가 3~4개 생성. 진단·처방 유도 금지. 실패·로딩 표시 없음 — 성공 때만 반환.
    prompt = ChatPromptTemplate.from_messages([
        ("system", "환자가 이어서 물어볼 만한 짧은 질문 3~4개를 줄바꿈으로만 제안하세요. "
                   "진단·처방을 유도하거나 환자가 병명을 단정한 듯한 문장은 만들지 마세요."),
        ("human", "직전 봇 답변: {q}"),
    ])
    try:
        # format_messages + ainvoke — 주입 가짜모델(langchain Runnable 아님) 호환(Task 5와 동일).
        resp = await (model or get_chat_model()).ainvoke(prompt.format_messages(q=last_question))
    except Exception:
        return []                            # 실패는 상담 전체 오류로 확대하지 않는다(자유 입력 유지)
    lines = [l.strip() for l in resp_text(resp).splitlines() if l.strip()]
    return lines[:4]
