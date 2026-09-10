import asyncio
import uuid
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.core.patient_security import PatientContext, get_current_patient   # 3단계 환자 인증
from app.db.pool import get_pool
from app.integrations.embedding_client import get_embedding_client
from app.integrations.langchain_client import get_chat_model
from app.services import department_service
from app.services.chat import (
    anonymous_service, chat_flow_service, ai_session_service, dept_guide_service,
    patient_ai_session, webchat_service)

router = APIRouter(prefix="/chat", tags=["chat"])


async def require_anonymous_session(x_anon_token: str | None = Header(default=None)) -> dict:
    # 카드 액션·인계처럼 민감한 익명 동작은 X-Anon-Token으로 세션 소유를 확인한다(토큰 없으면 401).
    if not x_anon_token:
        raise HTTPException(status_code=401, detail="상담 세션을 찾을 수 없습니다.")
    return await anonymous_service.upsert_session(x_anon_token)


# LLM·임베더를 의존성으로 주입한다 — 자동 테스트가 app.dependency_overrides로 가짜를 끼운다
# (get_chat_model()은 생성만 하고 실제 호출은 ainvoke 때 네트워크를 타므로 오프라인 테스트는 주입 필수).
def get_model_dep():
    return get_chat_model()


def get_embedder_dep():
    return get_embedding_client()


class SendMessageRequest(BaseModel):
    # 웹 위젯은 camelCase로, 환자앱/서비스는 snake_case로 보낼 수 있어 둘 다 받는다(populate_by_name).
    model_config = ConfigDict(populate_by_name=True)
    thread_id: Annotated[UUID, Field(alias="threadId")]
    ai_chat_session_id: Annotated[UUID, Field(alias="aiSessionId")]
    content: str
    client_message_id: Annotated[UUID | None, Field(alias="clientMessageId")] = None


class StartSessionRequest(BaseModel):
    channel: str = "web"
    # 로그인 환자 경로에서만 쓴다: thread_id=지난 상담 이어보기, resume_from=이어서 AI 질문(새 방).
    thread_id: UUID | None = None
    resume_from: UUID | None = None
    # fresh=[새 대화]: 활성 세션이 있어도 무시하고 과거 문맥 없는 새 상담방을 연다(CHAT-ROOM-NEW-01).
    fresh: bool = False


class DeptGuideRequest(BaseModel):
    # 예약 중 진료과 추천(제한모드, E4). 세션 없이 대화 이력을 통째로 실어 보낸다 — history=이전 환자 발화들.
    model_config = ConfigDict(populate_by_name=True)
    message: str
    history: list[str] = Field(default_factory=list)
    relation: str = "본인"   # 예약 대상 관계(본인/가족) — 안내 문구 톤에만 쓴다


class ReadRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    thread_id: Annotated[UUID, Field(alias="threadId")]


class HandoffRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    thread_id: Annotated[UUID, Field(alias="threadId")]
    name: str
    phone: str | None = None
    summary: list[str] = Field(default_factory=list)


class AttributeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    # 서버는 인증된 환자를 진실로 삼는다 — patientId가 오면 일치 확인용으로만 쓴다(위조 방지).
    patient_id: Annotated[UUID | None, Field(alias="patientId")] = None


class RevalidateRequest(BaseModel):
    action: dict   # {kind: 'book'|'cancel'|'view_my_appointments', payload: {...}}


class ExecuteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    card_type: Annotated[str, Field(alias="cardType")]
    payload: dict
    client_message_id: Annotated[UUID, Field(alias="clientMessageId")]


# create_task 참조 유지(GC 방지) — 요청이 끝나도 생성 태스크가 살아 완주하게 잡아 둔다.
_bg_tasks: set = set()


@router.post("/messages")
async def send_message(body: SendMessageRequest, request: Request,
                       model=Depends(get_model_dep), embedder=Depends(get_embedder_dep)):
    # 스트리밍(끊김 해결): 사용자 메시지만 저장하고 즉시 ack(~1초)를 반환한다. 답 생성은 요청과 분리된
    #   백그라운드 태스크가 수행하며, 조각·완료를 실시간 채널(chat-typing:<threadId>)로 민다(요청이 끊겨도 완주).
    # 로그인 헤더가 있으면 환자 경로(RLS 소유권 검증), 없으면 익명 웹 위젯 경로(thread UUID 능력토큰).
    if request.headers.get("authorization", "").startswith("Bearer "):
        patient = await get_current_patient(request)
        session = await ai_session_service.load_owned_session(patient, body.ai_chat_session_id, body.thread_id)
        sender_kind = "patient"
    else:
        session = await webchat_service.load_anonymous_session(body.ai_chat_session_id, body.thread_id)
        sender_kind = "anonymous_web"
    prep = await chat_flow_service.prepare_turn(
        session, body.content, thread_id=body.thread_id,
        client_message_id=body.client_message_id, sender_kind=sender_kind)
    gen = str(uuid.uuid4())
    # 인계 모드(staff)나 중복 전송(is_new=False)이면 생성하지 않는다(연타/재시도로 답이 2번 나지 않게).
    if prep["route_taken"] is None and prep["is_new"]:
        t = asyncio.create_task(chat_flow_service.run_generation(
            session, body.content, thread_id=body.thread_id, gen=gen,
            embedder=embedder, model=model, sender_kind=sender_kind))
        _bg_tasks.add(t)
        t.add_done_callback(_bg_tasks.discard)
    return {"accepted": True, "threadId": str(body.thread_id),
            "userMessageId": str(prep["user_message_id"]) if prep["user_message_id"] else None,
            "gen": gen, "routeTaken": prep["route_taken"]}


# ── 웹 위젯(익명) 채널 — ⑦ 배선 ─────────────────────────────────────────────
# 로그인이 아니라 X-Anon-Token(브라우저 토큰)으로 소유권을 잇는다. 라우터는 얇게, 알맹이는 webchat_service.

@router.post("/sessions")
async def start_session(
    body: StartSessionRequest,
    request: Request,
    x_anon_token: str | None = Header(default=None),
):
    # 로그인 헤더가 있으면 환자 경로(RLS 소유), 없으면 익명 웹 위젯 경로 — /messages와 같은 분기.
    if request.headers.get("authorization", "").startswith("Bearer "):
        patient = await get_current_patient(request)
        return await patient_ai_session.start(
            patient, thread_id=body.thread_id, resume_from=body.resume_from, fresh=body.fresh)
    # 익명: 토큰이 있으면 복원, 없으면 서버가 발급해 anonToken으로 돌려준다.
    return await webchat_service.start_or_restore_session(x_anon_token)


@router.post("/dept-guide")
async def dept_guide(body: DeptGuideRequest, request: Request, model=Depends(get_model_dep)):
    # BOOK-DEPT-02 예약 마법사 2단계 "어느 과인지 모르겠어요" 시트 전용(제한모드, E4).
    # 로그인 환자만(예약 흐름). 세션·스레드를 만들지 않고 진료과만 추천한다 — '지난 상담'에 안 남는다.
    await get_current_patient(request)   # 인증 확인(소유 리소스는 없지만 로그인 강제)
    pool = await get_pool()
    async with pool.acquire() as conn:
        departments = await department_service.list_departments(conn)   # 활성 진료과만
    return await dept_guide_service.guide(
        message=body.message, history=body.history, departments=departments,
        relation=body.relation, model=model)


@router.get("/threads")
async def patient_threads(request: Request):
    # 지난 상담 목록(CHAT-HISTORY-LIST-01) — 로그인 환자 소유만. 앱은 바로 배열을 받는다.
    patient = await get_current_patient(request)
    return await patient_ai_session.list_threads(patient)


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: UUID, request: Request):
    # 지난 상담 진짜 삭제(CHAT-HISTORY-DELETE-01) — 로그인 환자 소유만. 되돌릴 수 없음(프론트 확인창 필수).
    # 없거나 남의 상담방이면 같은 404(개인정보 열거 방지).
    patient = await get_current_patient(request)
    if not await patient_ai_session.delete_thread(patient, thread_id):
        raise HTTPException(status_code=404, detail="상담을 찾을 수 없습니다.")
    return {"ok": True}


@router.get("/threads/{thread_id}/messages")
async def thread_messages(thread_id: UUID):
    # thread UUID가 능력토큰(추측 불가) — 익명 토큰 없이 이력을 준다.
    return {"messages": await webchat_service.list_thread_messages(thread_id)}


@router.post("/read")
async def acknowledge_read(body: ReadRequest):
    # 상담방을 보는 중이면 열린 알림 배치를 닫는다(수신자는 thread 소유자에서 도출).
    await webchat_service.acknowledge_read(body.thread_id)
    return {"ok": True}


@router.get("/threads/{thread_id}/handoff")
async def handoff_status(thread_id: UUID):
    # 최신 인계 티켓 상태 + 운영시간 → 프론트 HandoffStatus.
    return await webchat_service.get_handoff_status(thread_id)


@router.post("/handoff")
async def create_handoff(body: HandoffRequest, session: dict = Depends(require_anonymous_session)):
    # 익명 인계 폼 제출: 티켓 확보(find-or-attach) + (선택)연락처 검증 저장 + 이름·요약 기록.
    ticket_id = await webchat_service.create_anonymous_handoff(
        session_id=session["id"], thread_id=body.thread_id,
        name=body.name, phone=body.phone, summary=body.summary)
    return {"ticketId": str(ticket_id)}


@router.post("/attribute")
async def attribute_session(body: AttributeRequest, request: Request,
                            session: dict = Depends(require_anonymous_session)):
    # WEBMOD-AUTH-09: 명시 인증(Bearer)에 성공한 환자에게만 앞선 익명 상담 이력을 귀속한다.
    # X-Anon-Token으로 익명 세션을 찾고, Bearer로 귀속 대상 환자를 확정한다(유사성 추측 귀속 금지).
    patient = await get_current_patient(request)
    if body.patient_id is not None and body.patient_id != patient.id:
        raise HTTPException(status_code=403, detail="다른 계정으로 귀속할 수 없습니다.")
    await webchat_service.attribute_session_to_patient(
        session_id=session["id"], patient_id=patient.id)
    return {"ok": True}


@router.post("/cards/revalidate")
async def revalidate_card(body: RevalidateRequest, request: Request,
                          x_anon_token: str | None = Header(default=None)):
    # 늦은 관문(④): 진료과·의사·날짜 탐색은 로그인 전(익명 nav)이라 Bearer가 없다 → X-Anon-Token으로 소유 확인.
    kind = (body.action or {}).get("kind")
    if kind in webchat_service.ANON_NAV_KINDS:
        await require_anonymous_session(x_anon_token)     # 없으면 401
        card = await webchat_service.navigate_booking(body.action)
        return {"card": card}
    # WEBCARD-BOOKCONF-03: 그 외(book·cancel·view_my_appointments·pick_target)는 인증(Bearer)한 환자로 재검증.
    patient = await get_current_patient(request)
    card = await webchat_service.revalidate_action(patient, body.action)
    return {"card": card}


@router.post("/cards/execute")
async def execute_card(body: ExecuteRequest, request: Request):
    # WEBCARD-BOOKCONF-01·CANCELCONF-01: 인증(Bearer)한 환자로 카드 주 행동을 서버가 재검증·실행한다.
    patient = await get_current_patient(request)
    result = await webchat_service.execute_card(
        patient, body.card_type, body.payload, body.client_message_id)
    return {"result": result}
