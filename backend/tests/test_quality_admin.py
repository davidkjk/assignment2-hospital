"""Task 21 서버 쪽 — 오답 신고(직원)·처리함·품질 리포트·참고 예시·미해결 묶음.
순수 2 + DB 3 + 라우터 1. 출처 구분(B3)·즉시 미반영·409 동시 처리·임베딩 누락 gap을 서버가 지키는지 본다."""
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.errors import AppError
from app.core.security import StaffContext, get_current_staff
from app.main import app
from app.services.chat import answer_feedback_service, quality_service, unresolved_service
from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread


def _vec(i: int | None) -> list[float]:
    v = [0.0] * 8
    if i is not None:
        v[i] = 1.0
    return v


def test_cluster_questions_groups_by_similarity_sorts_desc_and_flags_gap():
    rows = [
        {"id": "a", "question_text": "주말 진료?", "embedding": _vec(1)},
        {"id": "b", "question_text": "주차 어디", "embedding": _vec(0)},
        {"id": "c", "question_text": "주차장 위치", "embedding": _vec(0)},
        {"id": "d", "question_text": "임베딩 없음", "embedding": _vec(None)},
    ]
    clusters, gap = unresolved_service.cluster_questions(rows)
    assert [c["count"] for c in clusters] == [2, 1]          # 건수 내림차순
    assert clusters[0]["id"] == "b" and clusters[0]["questions"] == ["주차 어디", "주차장 위치"]
    assert gap is True                                        # 영벡터는 묶지 않고 알린다(UNRES-CLUSTER-11)


def test_cluster_questions_no_gap_when_all_embedded():
    _, gap = unresolved_service.cluster_questions([{"id": "a", "question_text": "q", "embedding": _vec(0)}])
    assert gap is False


def _vec_text(i: int | None) -> str:
    return "[" + ",".join("1" if j == i else "0" for j in range(1536)) + "]"


async def _seed_session(conn, patient_id: UUID, *, with_source: bool):
    thread = await seed_chat_thread(conn, patient_id=patient_id)
    session = await conn.fetchval("insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()) returning id", thread)
    pm = await conn.fetchval(
        "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, sender_patient_id, content, created_at) "
        "values ($1,$2,'patient',$3,'주차 되나요', now() - interval '2 minutes') returning id", thread, session, patient_id)
    bm = await conn.fetchval(
        "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, content, created_at) "
        "values ($1,$2,'bot','안 됩니다', now() - interval '1 minute') returning id", thread, session)
    if with_source:
        await conn.execute(
            "insert into chat_message_sources (message_id, rank, title_snapshot, body_snapshot) values ($1,1,'주차 안내','지하 2층')", bm)
    return thread, session, pm, bm


@pytest.mark.asyncio
async def test_report_requires_bot_and_inbox_derives_question_and_sources(committed_conn):
    p = await seed_patient(committed_conn)
    st = await seed_staff(committed_conn, role="admin")
    _, session, pm, bm = await _seed_session(committed_conn, p["patient_id"], with_source=True)

    assert (await answer_feedback_service.get_target_message(bm))["role"] == "bot"
    assert (await answer_feedback_service.get_target_message(pm))["role"] == "user"
    with pytest.raises(AppError) as e:
        await answer_feedback_service.report(pm, st["staff_id"], correction_text="x")
    assert e.value.status_code == 400                        # 봇 답변만 신고(TARGET-02)

    fb = await answer_feedback_service.report(bm, st["staff_id"], correction_text="지하 2층", add_to_example_bank=True)
    rows = await answer_feedback_service.list_feedback("pending")
    mine = next(r for r in rows if r["id"] == str(fb["id"]))
    assert mine["source"] == "realtime_report" and mine["question"] == "주차 되나요" and mine["bot_answer"] == "안 됩니다"
    assert mine["has_sources"] is True

    # 품질 목록: 신고됨·근거 있음·미검토
    sess = next(s for s in await quality_service.list_sessions(None, None) if s["id"] == str(session))
    assert sess["reported"] is True and sess["has_kb_source"] is True and sess["review_status"] == "unreviewed"
    assert sess["channel"] == "app" and sess["question_summary"] == "주차 되나요"

    # 반려 → 두 번째는 409(동시 처리 — 성공으로 덮지 않는다)
    await answer_feedback_service.reject(fb["id"], st["staff_id"])
    with pytest.raises(AppError) as e2:
        await answer_feedback_service.reject(fb["id"], st["staff_id"])
    assert e2.value.status_code == 409


@pytest.mark.asyncio
async def test_apply_stores_patient_question_in_example_bank(committed_conn):
    # 회귀: 예시은행의 「질문」은 신고 대상 봇 답변('안 됩니다')이 아니라 그 답을 부른 환자 질문('주차 되나요')이어야
    # 이후 유사 질문 검색이 맞다. (버그였음 — 봇 답변 본문을 질문으로 저장·임베딩하던 것.)
    from tests.conftest_chat import FakeEmbedder
    p = await seed_patient(committed_conn)
    st = await seed_staff(committed_conn, role="admin")
    _, _session, _pm, bm = await _seed_session(committed_conn, p["patient_id"], with_source=False)
    fb = await answer_feedback_service.report(bm, st["staff_id"], correction_text="지하 2층입니다", add_to_example_bank=True)
    await answer_feedback_service.apply(fb["id"], st["staff_id"], FakeEmbedder())
    mine = next(e for e in await answer_feedback_service.list_examples(True) if e["answer"] == "지하 2층입니다")
    assert mine["question"] == "주차 되나요"


@pytest.mark.asyncio
async def test_update_correction_edits_while_pending_then_409_after_resolved(committed_conn):
    # 오답 처리함 검토자가 「올바른 안내」를 직접 수정 — pending일 때만. 반려/반영 후엔 409(09).
    p = await seed_patient(committed_conn)
    st = await seed_staff(committed_conn, role="admin")
    _, _session, _pm, bm = await _seed_session(committed_conn, p["patient_id"], with_source=False)
    fb = await answer_feedback_service.report(bm, st["staff_id"], correction_text="지하 2층")

    await answer_feedback_service.update_correction(fb["id"], "지하 2·3층 주차 가능")
    assert (await answer_feedback_service.get_feedback(fb["id"]))["correction"] == "지하 2·3층 주차 가능"

    # 빈 값은 교정 없음(null)으로 저장한다
    await answer_feedback_service.update_correction(fb["id"], "   ")
    assert (await answer_feedback_service.get_feedback(fb["id"]))["correction"] is None

    # 반려된 뒤엔 더 못 고친다(409)
    await answer_feedback_service.reject(fb["id"], st["staff_id"])
    with pytest.raises(AppError) as e:
        await answer_feedback_service.update_correction(fb["id"], "다시 고치기")
    assert e.value.status_code == 409


@pytest.mark.asyncio
async def test_quality_correct_registers_quality_review_and_marks_corrected(committed_conn):
    p = await seed_patient(committed_conn)
    st = await seed_staff(committed_conn, role="admin")
    _, session, _, bm = await _seed_session(committed_conn, p["patient_id"], with_source=True)

    detail = await quality_service.get_session(session)
    assert detail["kb_source"] == "주차 안내" and detail["bot_message_id"] == str(bm)

    out = await quality_service.correct(session, st["staff_id"], "지하 2층입니다")
    fb = await answer_feedback_service.get_feedback(UUID(out["feedback_id"]))
    assert fb["source"] == "quality_review" and fb["status"] == "pending"   # 처리함 등록, 즉시 반영 아님(B3)
    sess = next(s for s in await quality_service.list_sessions(None, None) if s["id"] == str(session))
    assert sess["review_status"] == "corrected"
    # 승인 자료(kb_documents)는 건드리지 않았다
    assert await committed_conn.fetchval("select count(*) from kb_documents where has_pending_edit") == 0


@pytest.mark.asyncio
async def test_unresolved_clusters_by_range_and_example_deactivate_conflict(committed_conn):
    p = await seed_patient(committed_conn)
    st = await seed_staff(committed_conn, role="admin")
    thread, session, _, bm = await _seed_session(committed_conn, p["patient_id"], with_source=False)
    ticket = await committed_conn.fetchval(
        "insert into support_tickets (thread_id, source_ai_session_id, status) values ($1,$2,'pending') returning id", thread, session)
    for text, vec in (("주차 어디", 0), ("주차장 위치", 0), ("주말 진료", 1), ("임베딩 없음", None)):
        await committed_conn.execute(
            "insert into unresolved_questions (ticket_id, question_text, question_embedding) values ($1,$2,$3::vector)",
            ticket, text, _vec_text(vec))
    res = await unresolved_service.list_clusters(None, None)
    top = res["clusters"][0]
    assert top["count"] == 2 and top["representative"] == "주차 어디" and res["embedding_gap"] is True
    assert (await unresolved_service.get_cluster(top["id"], None, None))["questions"] == ["주차 어디", "주차장 위치"]
    with pytest.raises(AppError):
        await unresolved_service.get_cluster(str(uuid4()), None, None)
    assert (await unresolved_service.list_clusters("2099-01-01", None))["clusters"] == []   # 기간 밖은 0건

    # 참고 예시: 비활성화는 삭제 아님, 두 번째는 409
    fb = await answer_feedback_service.report(bm, st["staff_id"], correction_text="지하 2층", add_to_example_bank=True)
    ex = await committed_conn.fetchval(
        "insert into qa_example_bank (question, answer, embedding, source_feedback_id) values ('q','a',$1::vector,$2) returning id",
        _vec_text(0), fb["id"])
    assert any(e["id"] == str(ex) for e in await answer_feedback_service.list_examples(True))
    await answer_feedback_service.deactivate_example(ex)
    assert not any(e["id"] == str(ex) for e in await answer_feedback_service.list_examples(True))
    assert await committed_conn.fetchval("select count(*) from qa_example_bank where id=$1", ex) == 1   # 행은 남는다
    with pytest.raises(AppError) as e:
        await answer_feedback_service.deactivate_example(ex)
    assert e.value.status_code == 409


@pytest.mark.asyncio
async def test_router_staff_report_and_admin_unresolved(committed_conn):
    p = await seed_patient(committed_conn)
    st = await seed_staff(committed_conn, role="admin")
    _, _, pm, bm = await _seed_session(committed_conn, p["patient_id"], with_source=False)
    admin = StaffContext(id=st["staff_id"], auth_user_id=uuid4(), role="admin", department_id=None)
    try:
        app.dependency_overrides[get_current_staff] = lambda: admin
        with TestClient(app) as c:
            assert c.get(f"/staff/chat/messages/{bm}").json()["role"] == "bot"
            assert c.post("/staff/chat/feedback", json={"message_id": str(pm), "correction_text": "x"}).status_code == 400
            r = c.post("/staff/chat/feedback", json={"message_id": str(bm), "correction_text": "지하 2층", "add_to_example_bank": True})
            assert r.status_code == 201 and r.json()["id"]
            inbox = c.get("/admin/chat/feedback?status=pending").json()
            assert any(x["id"] == r.json()["id"] and x["source"] == "realtime_report" for x in inbox)
            assert c.get("/admin/chat/unresolved").json() == {"clusters": [], "embedding_gap": False}
            assert c.get("/admin/chat/examples?active=true").status_code == 200
    finally:
        app.dependency_overrides.clear()
