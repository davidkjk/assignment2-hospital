import re
from uuid import UUID

from app.core.errors import AppError
from app.db.pool import get_pool


# 문장 끝(마침표·물음표·느낌표) 뒤 공백에서 자른다. 한국어 '…다.' 문장에 맞는다.
_SENT_SPLIT = re.compile(r"(?<=[.!?。])\s+")


def _tail_sentences(text: str, n: int) -> str:
    # text의 마지막 n개 문장을 돌려준다(조각 사이 겹침용). 문단 경계(개행)는 공백으로 눕힌다.
    if n <= 0:
        return ""
    flat = re.sub(r"\s+", " ", text).strip()
    sents = [s for s in _SENT_SPLIT.split(flat) if s.strip()]
    return " ".join(sents[-n:]) if sents else ""


def chunk_text(content: str, *, max_len: int = 500, overlap_sentences: int = 1) -> list[str]:
    # 청킹(검색 단위): 빈 줄 문단 우선, 이어붙여 max_len을 넘으면 자른다.
    # ⭐ 조각 사이 문장 겹침(overlap) — 두 번째 조각부터는 직전 조각의 마지막 overlap_sentences 문장으로
    #    시작해, 문단 경계에서 맥락이 끊겨 답이 반 토막 나는 것을 막는다(overlap_sentences=0이면 겹침 없음).
    parts: list[str] = []
    buf = ""
    for para in content.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        if len(buf) + len(para) + 2 > max_len and buf:
            parts.append(buf)
            overlap = _tail_sentences(buf, overlap_sentences)
            buf = f"{overlap}\n\n{para}" if overlap else para
        else:
            buf = f"{buf}\n\n{para}" if buf else para
    if buf:
        parts.append(buf)
    return parts or [content.strip()]


async def _reembed(conn, doc_id: UUID, content: str, embedder) -> None:
    # 옛 조각 삭제 + 새 조각 삽입을 같은 트랜잭션에서. 실패하면 옛 조각·옛 답 유지(A2).
    # ⭐ 임베딩 텍스트에는 제목을 함께 넣는다(저장 content는 본문만) — 짧은 외래어 질의('주차','와이파이')가
    #   제목과 정렬돼 유사도가 오른다(2026-09-04 실측 +0.02~0.12). 검색·표시는 본문 그대로.
    # 빈 내용은 OpenAI 임베딩이 "input cannot be an empty string"(400)으로 거부해 승인이 502로 실패한다.
    # 애초에 근거로 쓸 내용이 없으므로, 호출 전에 명확한 안내로 막는다(트랜잭션째 롤백 → 승인 안 됨).
    if not content.strip():
        raise AppError("안내 내용이 비어 있어요. 내용을 입력한 뒤 다시 시도해 주세요.", 400)
    title = await conn.fetchval("select title from kb_documents where id=$1", doc_id)
    chunks = chunk_text(content)
    embed_texts = [f"{title}\n{c}" if title else c for c in chunks]
    vectors = await embedder.embed(embed_texts)
    await conn.execute("delete from kb_chunks where document_id=$1", doc_id)
    for i, (c, v) in enumerate(zip(chunks, vectors)):
        await conn.execute(
            "insert into kb_chunks (document_id, chunk_index, content, embedding) values ($1,$2,$3,$4::vector)",
            doc_id, i, c, "[" + ",".join(map(str, v)) + "]")


# ── 관리자 화면(Task 20 KBADM-*) 소비 계약 — 프론트가 보는 모양(snake_case). 매핑은 순수 함수라 단위 테스트 가능. ──

_DOC_COLS = "id, title, category, status, is_restricted, has_pending_edit, updated_at"
_DETAIL_COLS = _DOC_COLS + ", content, pending_title, pending_category, pending_content, pending_is_restricted"


def _row_to_doc(r) -> dict:
    return {
        "id": str(r["id"]), "title": r["title"], "category": r["category"], "status": r["status"],
        "is_restricted": r["is_restricted"], "has_pending_edit": r["has_pending_edit"],
        "updated_at": r["updated_at"].isoformat(),
    }


def _row_to_detail(r) -> dict:
    d = _row_to_doc(r)
    d.update({"content": r["content"], "pending_title": r["pending_title"], "pending_content": r["pending_content"]})
    return d


def _row_to_revision(r) -> dict:
    # 기록에 없는 승인자는 지어내지 않는다(HISTORY-03) — changed_by가 없으면 null.
    return {
        "id": str(r["id"]), "at": r["changed_at"].isoformat(), "title": r["previous_title"],
        "content": r["previous_content"], "approved_by": r["changed_by_name"],
    }


async def list_documents(*, category: str | None = None, status: str | None = None) -> list[dict]:
    # 최근 수정순. 필터 없으면 전체(보관 포함 — 화면이 상태 필터로 거른다).
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"select {_DOC_COLS} from kb_documents "
            "where ($1::text is null or category=$1) and ($2::text is null or status=$2) "
            "order by updated_at desc, id", category, status)
    return [_row_to_doc(r) for r in rows]


async def list_categories() -> list[str]:
    # 편집기 분류 콤보박스(datalist)가 보여줄 「실제로 쓰이고 있는」 분류 목록(EDITOR-02).
    # ⭐ 고정 상수가 아니라 DB에 실재하는 distinct category라야, 관리자가 새로 만든 분류가 다른
    #    자료를 편집할 때도 추천에 뜬다(고정 선택지가 아니라 자유 입력 — 사용자 결정 2026-09-02).
    #    빈 문자열·null은 뺀다. 정렬은 가나다순(표시 순서는 프론트가 표준 분류와 병합해 정한다).
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select distinct category from kb_documents "
            "where category is not null and category <> '' order by category")
    return [r["category"] for r in rows]


async def get_document(doc_id: UUID) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        r = await conn.fetchrow(f"select {_DETAIL_COLS} from kb_documents where id=$1", doc_id)
    if r is None:
        raise AppError("없는 자료입니다.", 404)
    return _row_to_detail(r)


async def create_document(*, title, category, content, is_restricted, staff_id) -> dict:
    # 새 자료는 draft — 저장만으로 공개되지 않는다(요구사항 3.8). 승인(approve)해야 근거가 된다.
    pool = await get_pool()
    async with pool.acquire() as conn:
        r = await conn.fetchrow(
            "insert into kb_documents (title, category, content, is_restricted, status, created_by) "
            f"values ($1,$2,$3,$4,'draft',$5) returning {_DOC_COLS}",
            title, category, content, is_restricted, staff_id)
    return _row_to_doc(r)


async def submit_edit(doc_id: UUID, *, title, category, content, is_restricted, staff_id) -> None:
    # 승인된 문서 수정 → pending_*에 담고 라이브는 그대로. 챗봇은 계속 라이브로 답한다(A2·R4-01).
    # 아직 승인 전(draft)이면 지킬 라이브 답변이 없으므로 초안 본문을 바로 고친다(승인 시 이 본문을 임베딩).
    pool = await get_pool()
    async with pool.acquire() as conn:
        status = await conn.fetchval("select status from kb_documents where id=$1", doc_id)
        if status is None:
            raise AppError("없는 자료입니다.", 404)
        if status == "draft":
            await conn.execute(
                "update kb_documents set title=$2, category=$3, content=$4, is_restricted=$5, updated_at=now() where id=$1",
                doc_id, title, category, content, is_restricted)
            return
        await conn.execute(
            "update kb_documents set has_pending_edit=true, pending_title=$2, pending_category=$3, "
            "pending_content=$4, pending_is_restricted=$5, pending_updated_by=$6, pending_updated_at=now(), "
            "updated_at=now() where id=$1", doc_id, title, category, content, is_restricted, staff_id)


async def approve_document(doc_id: UUID, embedder) -> None:
    # draft → approved(최초 승인): 청킹+임베딩 후 승인. 재임베딩 실패 시 승인도 롤백.
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            doc = await conn.fetchrow("select content, status from kb_documents where id=$1", doc_id)
            if doc is None:
                raise AppError("없는 자료입니다.", 404)
            await _reembed(conn, doc_id, doc["content"], embedder)
            await conn.execute(
                "update kb_documents set status='approved', approved_at=now(), updated_at=now() where id=$1", doc_id)


async def approve_pending_edit(doc_id: UUID, embedder) -> None:
    # 라이브를 이력에 저장 → pending을 라이브로 → 재청킹·재임베딩. 전부 한 트랜잭션(G-06·A2).
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            d = await conn.fetchrow("select * from kb_documents where id=$1 and has_pending_edit", doc_id)
            if d is None:
                raise AppError("반영할 수정 내용이 없습니다.", 409)
            await conn.execute(
                "insert into kb_document_revisions (document_id, previous_title, previous_category, "
                "previous_content, previous_is_restricted, changed_by) values ($1,$2,$3,$4,$5,$6)",
                doc_id, d["title"], d["category"], d["content"], d["is_restricted"], d["pending_updated_by"])
            await conn.execute(
                "update kb_documents set title=pending_title, category=pending_category, content=pending_content, "
                "is_restricted=pending_is_restricted, has_pending_edit=false, pending_title=null, "
                "pending_category=null, pending_content=null, pending_is_restricted=null, "
                "approved_at=now(), updated_at=now() where id=$1", doc_id)
            new_content = d["pending_content"]
            await _reembed(conn, doc_id, new_content, embedder)


async def approve(doc_id: UUID, embedder) -> None:
    # 화면의 [승인] 하나가 상태에 맞는 승인으로 간다: 대기 수정본이 있으면 재승인, 초안이면 최초 승인.
    # 이미 승인됐고 대기 수정본도 없으면 반영할 것이 없다(409) — 성공으로 추측하지 않는다(EDITOR-12).
    pool = await get_pool()
    async with pool.acquire() as conn:
        d = await conn.fetchrow("select status, has_pending_edit from kb_documents where id=$1", doc_id)
    if d is None:
        raise AppError("없는 자료입니다.", 404)
    if d["has_pending_edit"]:
        await approve_pending_edit(doc_id, embedder)
    elif d["status"] == "draft":
        await approve_document(doc_id, embedder)
    else:
        raise AppError("반영할 수정 내용이 없습니다.", 409)


async def reject_pending_edit(doc_id: UUID) -> None:
    # 대기 수정본만 버린다. 라이브(승인본)는 그대로.
    pool = await get_pool()
    async with pool.acquire() as conn:
        n = await conn.execute(
            "update kb_documents set has_pending_edit=false, pending_title=null, pending_category=null, "
            "pending_content=null, pending_is_restricted=null, pending_updated_by=null, pending_updated_at=null, "
            "updated_at=now() where id=$1 and has_pending_edit", doc_id)
    if n == "UPDATE 0":
        raise AppError("반려할 수정 내용이 없습니다.", 409)


async def archive_document(doc_id: UUID) -> None:
    # 보관 = 답변 근거에서 뺀다(조각 삭제). 삭제 정책(HISTORY-09)은 확인 필요라 행은 남긴다.
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            n = await conn.execute(
                "update kb_documents set status='archived', updated_at=now() where id=$1", doc_id)
            if n == "UPDATE 0":
                raise AppError("없는 자료입니다.", 404)
            await conn.execute("delete from kb_chunks where document_id=$1", doc_id)


async def list_revisions(doc_id: UUID) -> list[dict]:
    # 현재 자료 한 건의 이력만, 최신 시각부터(HISTORY-01·02). 없는 자료면 404(HISTORY-09).
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval("select 1 from kb_documents where id=$1", doc_id)
        if exists is None:
            raise AppError("없는 자료입니다.", 404)
        rows = await conn.fetch(
            "select r.id, r.changed_at, r.previous_title, r.previous_content, s.name as changed_by_name "
            "from kb_document_revisions r left join staff s on s.id = r.changed_by "
            "where r.document_id=$1 order by r.changed_at desc, r.id", doc_id)
    return [_row_to_revision(r) for r in rows]
