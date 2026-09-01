from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.patient_security import PatientContext, get_current_patient   # 3단계 환자 인증
from app.integrations.embedding_client import get_embedding_client
from app.integrations.langchain_client import get_chat_model
from app.services.chat import chat_flow_service, ai_session_service

router = APIRouter(prefix="/chat", tags=["chat"])


class SendMessageRequest(BaseModel):
    thread_id: UUID
    ai_chat_session_id: UUID
    content: str
    client_message_id: UUID | None = None


@router.post("/messages")
async def send_message(body: SendMessageRequest, patient: PatientContext = Depends(get_current_patient)):
    # session 로드는 서비스가 소유권과 함께 검증한다(RLS). 여기선 얇게 위임.
    session = await ai_session_service.load_owned_session(patient, body.ai_chat_session_id, body.thread_id)
    return await chat_flow_service.handle_patient_message(
        session, body.content, thread_id=body.thread_id, client_message_id=body.client_message_id,
        embedder=get_embedding_client(), model=get_chat_model())
