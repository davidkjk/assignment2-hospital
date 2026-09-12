from uuid import UUID
from app.core.errors import AppError
from app.db.pool import get_pool
from app.services.chat import kb_service


# ── 직원 오답 신고(BADRPT-FORM) ──

_ROLE = {"bot": "bot", "patient": "user", "staff": "staff", "system": "system"}


async def get_target_message(message_id: UUID) -> dict:
    # 신고 대상 조회 — 역할을 그대로 알려 화면이 「봇 답변만 신고」(TARGET-02)를 판단한다. 없으면 404.
    pool = await get_pool()
    async with pool.acquire() as conn:
        r = await conn.fetchrow("select id, sender_type, content from chat_messages where id=$1", message_id)
    if r is None:
        raise AppError("없는 메시지입니다.", 404)
    return {"id": str(r["id"]), "role": _ROLE.get(r["sender_type"], r["sender_type"]), "content": r["content"]}


async def report(message_id: UUID, staff_id: UUID, *, correction_text=None,
                 source: str = "realtime_report", add_to_example_bank: bool = False) -> dict:  # C3-3 정본(2026-08-20): 화면 명세와 통일
    pool = await get_pool()
    async with pool.acquire() as conn:
        sender = await conn.fetchval("select sender_type from chat_messages where id=$1", message_id)
        if sender is None:
            raise AppError("없는 메시지입니다.", 404)
        if sender != "bot":
            raise AppError("봇 답변만 신고할 수 있습니다.", 400)  # TARGET-02 서버 쪽 방어
        row = await conn.fetchrow(
            "insert into answer_feedback (message_id, reported_by, source, correction_text, add_to_example_bank) "
            "values ($1,$2,$3,$4,$5) returning *", message_id, staff_id, source, correction_text, add_to_example_bank)
        return dict(row)


# ── 오답 처리함(BADINBOX-REVIEW) — 실시간 신고 + 품질 리뷰 교정을 한 처리함에, 출처 구분(B3) ──

_FEEDBACK_SQL = """
select f.id, f.source, f.status, f.correction_text, f.created_at,
       bm.content as bot_answer,
       (select pm.content from chat_messages pm
          where pm.thread_id = bm.thread_id and pm.sender_type = 'patient' and pm.created_at <= bm.created_at
          order by pm.created_at desc, pm.id desc limit 1) as question,
       exists(select 1 from chat_message_sources s where s.message_id = f.message_id) as has_sources
from answer_feedback f
join chat_messages bm on bm.id = f.message_id
"""


def _row_to_feedback(r) -> dict:
    # 없는 근거·질문을 지어내지 않는다(02) — null은 null로.
    return {
        "id": str(r["id"]), "source": r["source"], "status": r["status"], "correction": r["correction_text"],
        "created_at": r["created_at"].isoformat(), "bot_answer": r["bot_answer"], "question": r["question"],
        "has_sources": bool(r["has_sources"]),
    }


async def list_feedback(status: str = "pending", limit: int = 100) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_FEEDBACK_SQL + " where f.status = $1 order by f.created_at desc, f.id desc limit $2", status, limit)
    return [_row_to_feedback(r) for r in rows]


async def count_feedback_by_status() -> dict[str, int]:
    # 오답 처리함 탭 배지 — status(pending/applied/rejected)별 건수를 한 번에(목록 3회 호출 대신).
    # 계약에 없는 status 값은 버리고, 없는 탭은 0으로 채운다(빈 탭도 0건임을 명시).
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("select status, count(*)::int as n from answer_feedback group by status")
    counts = {"pending": 0, "applied": 0, "rejected": 0}
    for r in rows:
        if r["status"] in counts:
            counts[r["status"]] = r["n"]
    return counts


async def get_feedback(feedback_id: UUID) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        r = await conn.fetchrow(_FEEDBACK_SQL + " where f.id = $1", feedback_id)
    if r is None:
        raise AppError("없는 신고입니다.", 404)
    return _row_to_feedback(r)


async def list_bad_inbox(limit: int = 20) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select * from answer_feedback where status='pending' order by created_at desc limit $1", limit)
        return [dict(r) for r in rows]


async def apply(feedback_id: UUID, staff_id: UUID, embedder, *, kb_document_id=None,
                kb_fields: dict | None = None) -> None:
    # 적용: 예시은행 축적 + (교정이 KB 대상이면) KB submit_edit로 보낸다. 즉시 라이브 아님 — KB 승인 경유(B3).
    pool = await get_pool()
    async with pool.acquire() as conn:
        fb = await conn.fetchrow("select * from answer_feedback where id=$1 and status='pending'", feedback_id)
        if fb is None:
            raise AppError("이미 처리된 신고입니다.", 409)  # 동시 처리 — 성공으로 덮지 않는다(09)
        if fb["add_to_example_bank"] and fb["correction_text"]:
            # 예시은행의 「질문」은 신고 대상 봇 답변이 아니라 그 답을 부른 환자 질문이어야 한다
            # (list_feedback와 같은 파생). 그래야 이후 유사 질문 검색(임베딩 매칭)이 맞다.
            q = await conn.fetchval(
                "select pm.content from public.chat_messages bm "
                "join public.chat_messages pm on pm.thread_id = bm.thread_id "
                "  and pm.sender_type = 'patient' and pm.created_at <= bm.created_at "
                "where bm.id = $1 order by pm.created_at desc, pm.id desc limit 1", fb["message_id"])
            vec = (await embedder.embed([q or ""]))[0]
            await conn.execute(
                "insert into qa_example_bank (question, answer, embedding, source_feedback_id) "
                "values ($1,$2,$3::vector,$4)", q or "", fb["correction_text"],
                "[" + ",".join(map(str, vec)) + "]", feedback_id)
        await conn.execute(
            "update answer_feedback set status='applied', resolved_by=$2, resolved_at=now() where id=$1",
            feedback_id, staff_id)
    if kb_document_id and kb_fields:
        await kb_service.submit_edit(kb_document_id, staff_id=staff_id, **kb_fields)   # 승인은 별도(Task 7)


async def reject(feedback_id: UUID, staff_id: UUID) -> None:
    # 반려 — 승인 자료·참고 예시는 바꾸지 않는다(05). 이미 처리됐으면 409(09).
    pool = await get_pool()
    async with pool.acquire() as conn:
        n = await conn.execute(
            "update answer_feedback set status='rejected', resolved_by=$2, resolved_at=now() "
            "where id=$1 and status='pending'", feedback_id, staff_id)
    if n == "UPDATE 0":
        raise AppError("이미 처리된 신고입니다.", 409)


async def update_correction(feedback_id: UUID, correction_text: str | None) -> None:
    # 오답 처리함 검토자가 「올바른 안내」를 직접 수정 — pending일 때만. 빈 문자열은 교정 없음(null)으로 저장한다.
    # 이미 반영/반려됐으면 409(09) — 처리된 신고의 교정문은 바꾸지 않는다. 반영은 별도([반영]가 이 값을 소비).
    text = correction_text.strip() if correction_text else None
    pool = await get_pool()
    async with pool.acquire() as conn:
        n = await conn.execute(
            "update answer_feedback set correction_text=$2 where id=$1 and status='pending'",
            feedback_id, text or None)
    if n == "UPDATE 0":
        raise AppError("이미 처리된 신고입니다.", 409)


# ── 참고 예시(QAEX-LIST) — 비활성화는 삭제가 아니다(03·06) ──

async def list_examples(active: bool = True) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select id, question, answer, is_active from qa_example_bank where is_active=$1 order by created_at desc, id desc", active)
    return [{"id": str(r["id"]), "question": r["question"], "answer": r["answer"], "is_active": r["is_active"]} for r in rows]


async def deactivate_example(example_id: UUID) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        n = await conn.execute("update qa_example_bank set is_active=false where id=$1 and is_active", example_id)
        if n == "UPDATE 0":
            exists = await conn.fetchval("select 1 from qa_example_bank where id=$1", example_id)
            raise AppError("이미 비활성 상태입니다." if exists else "없는 예시입니다.", 409 if exists else 404)
