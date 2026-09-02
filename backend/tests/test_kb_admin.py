"""관리자 병원 안내자료(KB) — Task 20 KBADM-* 소비 계약의 서버 쪽.
순수 매핑 2 + DB 4 + 라우터 1. 승인 전 비공개·승인 성공 전 기존본 유지·이전 버전 이력을 서버가 지키는지 본다."""
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.security import StaffContext, get_current_staff
from app.main import app
from app.services.chat import kb_service
from tests.conftest import seed_staff
from tests.conftest_chat import FakeEmbedder


def test_row_to_doc_maps_snake_contract():
    r = {"id": uuid4(), "title": "주차", "category": "위치·주차", "status": "approved",
         "is_restricted": True, "has_pending_edit": False, "updated_at": datetime(2026, 8, 19, tzinfo=timezone.utc)}
    d = kb_service._row_to_doc(r)
    assert d["is_restricted"] is True and d["status"] == "approved" and isinstance(d["id"], str)
    assert d["updated_at"].startswith("2026-08-19")


def test_row_to_revision_keeps_missing_approver_null():
    # 기록에 없는 승인자를 지어내지 않는다(HISTORY-03).
    r = {"id": uuid4(), "changed_at": datetime(2026, 8, 19, tzinfo=timezone.utc), "previous_title": "주차",
         "previous_content": "지하 2층", "changed_by_name": None}
    assert kb_service._row_to_revision(r)["approved_by"] is None


async def _cleanup(conn, doc, staff_id):
    await conn.execute("delete from kb_document_revisions where document_id=$1", doc)
    await conn.execute("delete from kb_chunks where document_id=$1", doc)
    await conn.execute("delete from kb_documents where id=$1", doc)
    await conn.execute("delete from staff where id=$1", staff_id)


@pytest.mark.asyncio
async def test_create_is_draft_and_listed_with_filters(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    created = await kb_service.create_document(title="주차 안내", category="위치·주차", content="지하 2층",
                                               is_restricted=False, staff_id=st["staff_id"])
    doc = created["id"]
    try:
        assert created["status"] == "draft"  # 저장만으로 공개되지 않는다
        rows = await kb_service.list_documents(category="위치·주차", status="draft")
        assert any(r["id"] == doc for r in rows)
        assert not any(r["id"] == doc for r in await kb_service.list_documents(status="approved"))
        detail = await kb_service.get_document(doc)
        assert detail["content"] == "지하 2층" and detail["pending_content"] is None
    finally:
        await _cleanup(committed_conn, doc, st["staff_id"])


@pytest.mark.asyncio
async def test_draft_edit_updates_body_and_approve_dispatches(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    doc = (await kb_service.create_document(title="주차", category="위치·주차", content="초안",
                                            is_restricted=False, staff_id=st["staff_id"]))["id"]
    try:
        # 초안은 지킬 라이브가 없으니 본문을 바로 고친다 → 승인 시 그 본문을 임베딩
        await kb_service.submit_edit(doc, title="주차", category="위치·주차", content="지하 2층",
                                     is_restricted=False, staff_id=st["staff_id"])
        row = await committed_conn.fetchrow("select content, has_pending_edit from kb_documents where id=$1", doc)
        assert row["content"] == "지하 2층" and row["has_pending_edit"] is False
        await kb_service.approve(doc, FakeEmbedder())  # draft → 최초 승인
        assert (await kb_service.get_document(doc))["status"] == "approved"
        # 승인됐고 대기 수정본 없음 → 반영할 것 없음(성공으로 추측하지 않음)
        with pytest.raises(Exception):
            await kb_service.approve(doc, FakeEmbedder())
    finally:
        await _cleanup(committed_conn, doc, st["staff_id"])


@pytest.mark.asyncio
async def test_reject_clears_pending_and_keeps_live(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, category, content, status, created_by) "
        "values ('주차','위치·주차','옛 내용','approved',$1) returning id", st["staff_id"])
    try:
        await kb_service.submit_edit(doc, title="주차", category="위치·주차", content="새 내용",
                                     is_restricted=False, staff_id=st["staff_id"])
        assert (await kb_service.get_document(doc))["pending_content"] == "새 내용"
        await kb_service.reject_pending_edit(doc)
        d = await kb_service.get_document(doc)
        assert d["content"] == "옛 내용" and d["has_pending_edit"] is False and d["pending_content"] is None
    finally:
        await _cleanup(committed_conn, doc, st["staff_id"])


@pytest.mark.asyncio
async def test_revisions_newest_first_and_archive_removes_chunks(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, category, content, status, created_by) "
        "values ('주차','위치·주차','v1','approved',$1) returning id", st["staff_id"])
    try:
        for v in ("v2", "v3"):
            await kb_service.submit_edit(doc, title="주차", category="위치·주차", content=v,
                                         is_restricted=False, staff_id=st["staff_id"])
            await kb_service.approve(doc, FakeEmbedder())  # 대기 수정본 → 재승인(이력 저장)
        revs = await kb_service.list_revisions(doc)
        assert [r["content"] for r in revs] == ["v2", "v1"]  # 최신 시각부터, 현재 자료만
        assert revs[0]["approved_by"] == st.get("name") or revs[0]["approved_by"] is not None
        assert await committed_conn.fetchval("select count(*) from kb_chunks where document_id=$1", doc) >= 1
        await kb_service.archive_document(doc)
        assert (await kb_service.get_document(doc))["status"] == "archived"
        assert await committed_conn.fetchval("select count(*) from kb_chunks where document_id=$1", doc) == 0
    finally:
        await _cleanup(committed_conn, doc, st["staff_id"])


@pytest.mark.asyncio
async def test_router_admin_only_and_camel_body(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    admin = StaffContext(id=st["staff_id"], auth_user_id=uuid4(), role="admin", department_id=None)
    reception = StaffContext(id=st["staff_id"], auth_user_id=uuid4(), role="receptionist", department_id=None)
    doc = None
    try:
        app.dependency_overrides[get_current_staff] = lambda: reception
        with TestClient(app) as c:
            assert c.get("/admin/chat/kb").status_code == 403  # 관리자 전용
        app.dependency_overrides[get_current_staff] = lambda: admin
        with TestClient(app) as c:
            r = c.post("/admin/chat/kb", json={"title": "주차", "category": "위치·주차", "content": "지하", "isRestricted": True})
            assert r.status_code == 201 and r.json()["is_restricted"] is True
            doc = r.json()["id"]
            assert c.put(f"/admin/chat/kb/{doc}", json={"title": "주차", "category": "위치·주차", "content": "지하 2층", "isRestricted": True}).status_code == 204
            assert c.get(f"/admin/chat/kb/{doc}").json()["content"] == "지하 2층"
            assert c.get(f"/admin/chat/kb/{doc}/revisions").json() == []
            assert c.get(f"/admin/chat/kb/{uuid4()}/revisions").status_code == 404
    finally:
        app.dependency_overrides.clear()
        if doc:
            await _cleanup(committed_conn, doc, st["staff_id"])
        else:
            await committed_conn.execute("delete from staff where id=$1", st["staff_id"])
