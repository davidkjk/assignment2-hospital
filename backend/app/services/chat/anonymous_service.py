import hashlib
from uuid import UUID

from app.db.pool import get_pool


def hash_token(raw_token: str) -> str:
    # 원문 토큰은 저장하지 않는다(§4.5). 백엔드만 원문을 받아 해시로 바꿔 넘긴다.
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def upsert_session(raw_token: str) -> dict:
    # 익명 위젯은 로그인 세션이 아니므로 서비스 역할 커넥션으로 처리한다(RLS 우회 함수).
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("select * from upsert_anonymous_session($1)", hash_token(raw_token))
        return dict(row)


async def record_verified_contact(session_id: UUID, ciphertext: str, phone_hash: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select * from record_verified_anonymous_contact($1, $2, $3)", session_id, ciphertext, phone_hash)
        return dict(row)
