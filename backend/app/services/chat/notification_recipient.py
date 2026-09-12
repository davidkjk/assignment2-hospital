from uuid import UUID

from app.db.pool import get_pool

# NotificationRecipient 계약(§5): 목적지 확인 adapter만 두 종류, 이후 파이프라인은 하나.
# 실제 발송·복호화·재시도는 공통 dispatcher(직원웹 T30 dispatch_service)가 이 반환값으로 수행한다.


async def resolve_recipient(batch_id: UUID) -> dict:
    """배치 하나를 발송 대상 계약으로 푼다. 등록 환자면 patient_id(기존 notify_patient 대상),
    익명이면 검증된 연락처 참조(ciphertext는 dispatcher가 복호화). patients 가짜 행·추측 매칭 금지(§5)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        b = await conn.fetchrow("select * from chat_notification_batches where id=$1", batch_id)
        if b["recipient_type"] == "patient":
            return {"recipient_type": "patient", "patient_id": b["recipient_patient_id"],
                    "channel_policy": "patient_channel", "message_class": "transactional"}
        c = await conn.fetchrow(
            "select id, contact_value_ciphertext from anonymous_chat_contacts where id=$1",
            b["recipient_anonymous_contact_id"])
        return {"recipient_type": "anonymous_chat_contact",
                "anonymous_session_id": b["recipient_anonymous_session_id"],
                "anonymous_contact_id": c["id"], "contact_ciphertext": c["contact_value_ciphertext"],
                "channel": "sms", "message_class": "transactional"}  # 익명 직원답변은 항상 sms·transactional(§5)
