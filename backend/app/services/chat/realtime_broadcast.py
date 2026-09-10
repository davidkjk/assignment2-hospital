from uuid import UUID

import httpx

from app.core.config import settings


async def broadcast(thread_id: UUID, event: str, payload: dict) -> None:
    """`chat-typing:<thread_id>` 채널로 이벤트 1건을 민다(Supabase Broadcast REST).

    best-effort: 발행 실패가 DB 저장·응답을 막지 않는다(전달 실패 시 클라는 DB 재조회로 복구).
    """
    url = f"{settings.supabase_url.rstrip('/')}/realtime/v1/api/broadcast"
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    body = {
        "messages": [
            {
                "topic": f"chat-typing:{thread_id}",
                "event": event,
                "payload": payload,
            }
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.post(url, json=body, headers=headers)
            resp.raise_for_status()
    except Exception:
        # best-effort. 발행 실패로 절대 터지지 않게 삼킨다(최종본은 DB가 정본).
        pass
