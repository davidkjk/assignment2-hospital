"""예약 agent — orchestrate의 agent_fn 구현체. 자연어 예약 의도를 결정적 카드 흐름의 시작으로 바꾼다.

지금까지 agent_fn이 비어 있어(orchestrator.py:59) 예약이 action_unavailable 인계로 빠지던 막다른 길의 해소.
증상 대화(department_guide)는 orchestrator가 별도 route로 처리하므로 여기 없다(Task 9가 칩·결론으로 연결).

조회는 주입 가능(테스트는 DB 없이). 기본값은 실제 풀(진료과 목록은 로그인 무관, conn 기반).
"""
from app.services.chat import card_builder

BOOKING_REPLY = "어느 진료과로 예약하시겠어요? 아래에서 골라 주세요."
BOOKING_REPLY_NAMED = "{name}로 예약을 도와드릴게요. 담당의를 골라 주세요."
# 앱 AI 상담(patient/app): 대화 안에서 예약하지 않고 예약 마법사로 인계한다(사용자 결정 B).
WIZARD_REPLY = "예약은 예약 마법사에서 도와드릴게요. 지금 이동하시겠어요?"
WIZARD_REPLY_NAMED = "{name} 예약을 도와드릴게요. 예약 마법사로 이동하시겠어요?"

# [WEBCHAT-CANCEL-GUIDE] 요구사항 L49: 상담봇은 예약 변경·취소를 '안내'만 한다(실행 아님).
# 봇이 직접 취소를 실행하지 않는다(되돌릴 수 없는 동작은 봇 자동실행 최소화, 사용자 결정 2026-09-07).
# → 취소 의도는 "앱에서 직접 취소 / 직원 상담 연결" 안내 + [직원에게 연결] 칩으로 돌린다.
# TODO(앱 다운로드 링크 확보 시): 안내에 앱 설치 버튼/링크 추가(현재 링크 없음).
CANCEL_GUIDANCE_REPLY = "예약 취소는 앱의 예약 내역에서 직접 하시거나, 직원 상담으로 도와드릴 수 있어요."
CANCEL_HANDOFF_CHIP = "직원에게 연결"


def _is_cancel_intent(message: str) -> bool:
    # 라우터가 예약·취소를 함께 agent로 보내므로(chat_router 프롬프트) agent 안에서 취소를 가른다.
    return "취소" in message


async def _default_list_departments() -> list[dict]:
    from app.db.pool import get_pool
    from app.services import department_service
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await department_service.list_departments(conn)


async def _default_list_doctors(department_id) -> list[dict]:
    from uuid import UUID
    from app.db.pool import get_pool
    from app.services.chat.webchat_service import _list_doctors_public
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await _list_doctors_public(conn, UUID(str(department_id)))


def _match_department(message: str, departments: list[dict]) -> dict | None:
    # 진료과명이 메시지에 그대로 있으면 그 과로 지름길(위변조 아님 — 이름 문자열 매칭, 이후 서버가 재검증).
    for d in departments:
        if d.get("name") and d["name"] in message:
            return d
    return None


async def booking_agent(session, message: str, *, list_departments_fn=None, list_doctors_fn=None) -> dict:
    """[WEBBOOK-01] 예약 의도 → 진료과 선택 카드. 진료과명이 메시지에 있으면 의사 카드로 지름길(①-하이브리드 자연어 갈래).
    반환 {reply, card} — orchestrate가 {route_taken:'agent', **result}로 병합한다. reply는 항상 비어 있지 않다."""
    if _is_cancel_intent(message):
        # [WEBCHAT-CANCEL-GUIDE] 취소는 봇이 실행하지 않고 앱/직원상담으로 안내한다(요구사항 L49 '안내').
        return {"reply": CANCEL_GUIDANCE_REPLY,
                "card": card_builder.build_quick_replies_card(replies=[], handoff_chip=CANCEL_HANDOFF_CHIP)}
    departments = await (list_departments_fn or _default_list_departments)()
    named = _match_department(message, departments)
    if named is not None:
        doctors = await (list_doctors_fn or _default_list_doctors)(named["id"])
        return {"reply": BOOKING_REPLY_NAMED.format(name=named["name"]),
                "card": card_builder.build_doctor_select_card(
                    department_id=str(named["id"]), department_name=named["name"], doctors=doctors)}
    return {"reply": BOOKING_REPLY,
            "card": card_builder.build_department_select_card(departments=departments)}


async def booking_wizard_handoff(session, message: str, *, list_departments_fn=None) -> dict:
    """[BOOK-BOT-WIZARD] 앱 AI 상담(patient/app)의 예약 의도 → 대화 내 예약 대신 예약 마법사로 인계(결정 B).
    진료과명이 메시지에 있으면 프리필해 앱 마법사 2단계를 미리 선택한다. 반환 {reply, card}(reply 항상 non-empty)."""
    departments = await (list_departments_fn or _default_list_departments)()
    named = _match_department(message, departments)
    if named is not None:
        return {"reply": WIZARD_REPLY_NAMED.format(name=named["name"]),
                "card": card_builder.build_open_booking_wizard_card(
                    department_id=named["id"], department_name=named["name"])}
    return {"reply": WIZARD_REPLY, "card": card_builder.build_open_booking_wizard_card()}
