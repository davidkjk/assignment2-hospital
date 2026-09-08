# 예약 중 진료과 추천(제한모드, 결정 E4). 예약 마법사 2단계 "어느 과인지 모르겠어요" 시트가 부른다.
#
# ⚠️ 일반 상담방(chat_flow_service)과 달리 **세션·스레드가 없다** — 매 호출에 대화 이력을 통째로 받아
#    진료과만 추천한다. 그래서 이 대화는 '지난 상담'에 남지 않고, 30분 만료·실시간 구독·직원 인계와 무관하다
#    (겹침 시트: 화면을 떠나지 않는 booking 도우미). 행동형(예약/취소/문진 카드)은 애초에 만들지 않는다.
#
# 흐름: ⓪응급(항상 최우선) → 직원요청은 '상담' 탭으로 부드럽게 안내 → 증상 있으면 바로 추천(없으면 1회 질문).
#   Q3(2026-09-08): 진단식 다단질문 폐지. 매 발화에 respond가 "불명확하면 1회 질문 / 증상 있으면 바로 추천"으로 답한다.
from app.services.chat import department_guide_chain, safety_watchdog

# 제한모드에선 직원 인계 티켓을 만들지 않는다(막다른 길 금지) — 상담 탭으로 안내하고 문진을 이어간다.
REDIRECT_TO_CONSULT_REPLY = (
    "직원 상담이 필요하시면 하단 ‘상담’ 탭에서 도와드릴 수 있어요. "
    "여기서는 증상에 맞는 진료과를 안내해 드릴게요. 어떤 점이 불편하세요?"
)


def _match_department(reply: str, departments: list[dict]) -> dict | None:
    """봇 답변 문장에 등장한 진료과명을 실제 목록과 매칭한다(DEPT-GUIDE-MATCH).
    긴 이름 우선(예: '정형외과'를 '외과'로 잘못 잡지 않도록)."""
    for d in sorted(departments, key=lambda x: len(x.get("name") or ""), reverse=True):
        name = d.get("name")
        if name and name in reply:
            return d
    return None


async def guide(*, message: str, history: list[str], departments: list[dict],
                relation: str = "본인", model=None) -> dict:
    """증상 발화 한 번에 답한다.

    - [message]  : 이번에 환자가 입력한 증상 문장.
    - [history]  : 이전 **환자 발화들**(문자열, 시간순). 봇 답변은 매 호출 새로 만들어 문맥에 안 싣는다(무상태).
    - [departments]: 실제 진료과 목록([{id,name}]) — 라우터가 DB에서 넘긴다(테스트는 직접 주입).

    반환: {reply, suggested_department: {id, name}|None, emergency: bool}
    """
    # ⓪ 응급 — 모드·단계와 무관하게 항상 최우선(정본 §0). 추천보다 먼저 끊는다.
    if safety_watchdog.check_emergency(message):
        return {"reply": safety_watchdog.EMERGENCY_REPLY,
                "suggested_department": None, "emergency": True}
    # 직원 연결 요청 — 제한모드에선 티켓 없이 '상담' 탭으로 안내(막다른 길 금지, 결정 E4).
    if safety_watchdog.check_staff_request(message):
        return {"reply": REDIRECT_TO_CONSULT_REPLY,
                "suggested_department": None, "emergency": False}

    history_text = "\n".join([*history, message])
    dept_names = [d["name"] for d in departments if d.get("name")]

    # Q3: 진단식 다단질문 없이 한 번에 답한다 — 증상이 불명확하면 딱 한 번 질문(진료과명 없음 → suggested None),
    #     증상을 들었으면 바로 목록 중 한 과(애매하면 최대 두 곳)를 이름 그대로 추천한다(문장에서 매칭).
    reply = await department_guide_chain.respond(history_text, dept_names, model=model)

    matched = _match_department(reply, departments)
    suggested = {"id": str(matched["id"]), "name": matched["name"]} if matched else None
    return {"reply": reply, "suggested_department": suggested, "emergency": False}
