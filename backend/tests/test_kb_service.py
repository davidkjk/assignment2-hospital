import pytest

from app.services.chat import kb_service
from tests.conftest import seed_staff
from tests.conftest_chat import FakeEmbedder


@pytest.mark.asyncio
async def test_list_categories_shows_used_categories_distinct(committed_conn):
    # 편집기 콤보박스는 「실제로 쓰이는」 분류를 보여준다 — 관리자가 만든 새 분류가 뜨고, 중복은 한 번,
    # 빈 값은 빠진다(EDITOR-02 자유 입력 콤보박스, 고정 상수가 아님).
    st = await seed_staff(committed_conn, role="admin")
    for cat in ["위치·주차", "예방접종 안내", "예방접종 안내", ""]:
        await committed_conn.execute(
            "insert into kb_documents (title, category, content, status, created_by) "
            "values ('t',$1,'c','draft',$2)", cat, st["staff_id"])
    cats = await kb_service.list_categories()
    assert "예방접종 안내" in cats          # 새로 만든 분류가 목록에 뜬다(핵심)
    assert "위치·주차" in cats
    assert cats.count("예방접종 안내") == 1  # distinct — 중복 제거
    assert "" not in cats                    # 빈 값 제외
    await committed_conn.execute("delete from kb_documents where created_by=$1", st["staff_id"])
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_approve_chunks_and_embeds(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, created_by) "
        "values ('주차','지하 1층 30분 무료입니다.','draft',$1) returning id", st["staff_id"])
    await kb_service.approve_document(doc, FakeEmbedder())
    status = await committed_conn.fetchval("select status from kb_documents where id=$1", doc)
    n = await committed_conn.fetchval("select count(*) from kb_chunks where document_id=$1", doc)
    assert status == "approved" and n >= 1
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_edit_stays_pending_until_approved(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, created_by) "
        "values ('주차','옛 내용','approved',$1) returning id", st["staff_id"])
    await kb_service.submit_edit(doc, title="주차", category="기타", content="새 내용",
                                 is_restricted=False, staff_id=st["staff_id"])
    live = await committed_conn.fetchrow("select content, has_pending_edit, pending_content from kb_documents where id=$1", doc)
    assert live["content"] == "옛 내용" and live["has_pending_edit"] and live["pending_content"] == "새 내용"
    await kb_service.approve_pending_edit(doc, FakeEmbedder())
    after = await committed_conn.fetchrow("select content, has_pending_edit from kb_documents where id=$1", doc)
    assert after["content"] == "새 내용" and after["has_pending_edit"] is False
    rev = await committed_conn.fetchval(
        "select previous_content from kb_document_revisions where document_id=$1", doc)
    assert rev == "옛 내용"   # 라이브 교체 전 이력 저장(G-06)
    await committed_conn.execute("delete from kb_document_revisions where document_id=$1", doc)
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])
