from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.core.patient_security import PatientContext, get_current_patient   # 3단계 환자 인증
from app.integrations.embedding_client import get_embedding_client
from app.integrations.langchain_client import get_chat_model
from app.services.chat import anonymous_service, chat_flow_service, ai_session_service, webchat_service

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


class ReadRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    thread_id: Annotated[UUID, Field(alias="threadId")]


class HandoffRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    thread_id: Annotated[UUID, Field(alias="threadId")]
    name: str
    phone: str | None = None
    summary: list[str] = Field(default_factory=list)


@router.post("/messages")
async def send_message(body: SendMessageRequest, request: Request,
                       model=Depends(get_model_dep), embedder=Depends(get_embedder_dep)):
    # 로그인 헤더가 있으면 환자 경로(RLS 소유권 검증), 없으면 익명 웹 위젯 경로(thread UUID 능력토큰).
    if request.headers.get("authorization", "").startswith("Bearer "):
        patient = await get_current_patient(request)
        session = await ai_session_service.load_owned_session(patient, body.ai_chat_session_id, body.thread_id)
        return await chat_flow_service.handle_patient_message(
            session, body.content, thread_id=body.thread_id,
            client_message_id=body.client_message_id, embedder=embedder, model=model)
    session = await webchat_service.load_anonymous_session(body.ai_chat_session_id, body.thread_id)
    return await chat_flow_service.handle_anonymous_message(
        session, body.content, thread_id=body.thread_id,
        client_message_id=body.client_message_id, embedder=embedder, model=model)


# ── 웹 위젯(익명) 채널 — ⑦ 배선 ─────────────────────────────────────────────
# 로그인이 아니라 X-Anon-Token(브라우저 토큰)으로 소유권을 잇는다. 라우터는 얇게, 알맹이는 webchat_service.

@router.post("/sessions")
async def start_session(
    body: StartSessionRequest,
    x_anon_token: str | None = Header(default=None),
):
    # 토큰이 있으면 복원, 없으면 서버가 발급해 anonToken으로 돌려준다.
    return await webchat_service.start_or_restore_session(x_anon_token)


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
