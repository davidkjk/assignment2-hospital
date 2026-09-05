"""Task 22 서버 집계 — 상담봇 처리 현황(통계) `BOTSTAT-DASH-*`·`QTOP-RANK-*`(⑦).

플랜의 501 스텁을 실제 집계로 대체한다. 확인 필요 항목(TOP N·시간대 경계·개인정보 범위·임베딩 누락)은
합리적 기본으로 구현하고 서비스 docstring에 가정을 밝혔다. 유효한 0건과 계약 부재를 구분해야 하므로
이 서비스가 응답하면 지표는 '계약 있음'이다(BOTSTAT-DASH-04↔05).
"""
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.errors import AppError
from app.core.security import StaffContext, get_current_staff
from app.main import app
from app.services.chat import bot_stats_service
from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread
from tests.task13_fixtures import seed_appointment, seed_department, seed_doctor


# 공용 DB의 기존 데이터(첫 테스트는 정리 전)와 섞이지 않도록 고유 날짜 창으로 격리하고, 그 창만 조회한다.
WIN = "2099-06-01"
WIN_TS = datetime(2099, 6, 1, 10, 0, tzinfo=timezone(timedelta(hours=9)))


class StubEmbedder:
    """텍스트를 정해진 one-hot 벡터로 보낸다(코사인 1.0=같음·0.0=다름). None은 영벡터(임베딩 누락)."""

    def __init__(self, mapping: dict[str, int | None], dim: int = 8):
        self._mapping, self._dim = mapping, dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for t in texts:
            v = [0.0] * self._dim
            idx = self._mapping.get(t)
            if idx is not None:
                v[idx] = 1.0
            out.append(v)
        return out


async def _seed_anon(conn) -> UUID:
    return await conn.fetchval(
        "insert into anonymous_chat_sessions (token_hash) values ($1) returning id", uuid4().hex)


async def _seed_appt(conn, patient_id: UUID, source: str) -> None:
    dept = await seed_department(conn)
    doc = await seed_doctor(conn, dept)
    appt = await seed_appointment(conn, doctor_id=doc["staff_id"], department_id=dept,
                                  patient_id=patient_id, source=source)
    await conn.execute("update appointments set created_at=$2::timestamptz where id=$1", appt, WIN_TS)


async def _seed_ai_session(conn, patient_id: UUID | None, *, handed_off: bool) -> UUID:
    thread = await seed_chat_thread(conn, patient_id=patient_id) if patient_id else \
        await seed_chat_thread(conn, anonymous_session_id=await _seed_anon(conn))
    if handed_off:
        return await conn.fetchval(
            "insert into ai_chat_sessions (thread_id, status, end_reason, ended_at, started_at, expires_at) "
            "values ($1,'ended','staff_handoff', now(), $2::timestamptz, now()) returning id", thread, WIN_TS)
    return await conn.fetchval(
        "insert into ai_chat_sessions (thread_id, status, end_reason, started_at, expires_at) "
        "values ($1,'expired','inactivity_timeout', $2::timestamptz, now()) returning id", thread, WIN_TS)


async def _seed_question(conn, patient_id: UUID, text: str, seq: int = 0) -> UUID:
    # seq로 시각을 조금씩 벌려 삽입 순서(대표 질문 선정)를 결정적으로 만든다 — 창(WIN) 안은 유지.
    thread = await seed_chat_thread(conn, patient_id=patient_id)
    session = await conn.fetchval(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()) returning id", thread)
    return await conn.fetchval(
        "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, sender_patient_id, "
        "message_type, content, created_at) values ($1,$2,'patient',$3,'text',$4,$5::timestamptz) returning id",
        thread, session, patient_id, text, WIN_TS + timedelta(seconds=seq))


@pytest.mark.asyncio
async def test_inflow_counts_reservations_by_source_separately(committed_conn):
    # BOTSTAT-DASH-02: 예약 유입원 app·staff·chatbot을 별도 비율로, 챗봇을 앱/직원에 섞지 않는다.
    p = await seed_patient(committed_conn)
    await _seed_appt(committed_conn, p["patient_id"], "app")
    await _seed_appt(committed_conn, p["patient_id"], "chatbot")
    await _seed_appt(committed_conn, p["patient_id"], "chatbot")
    await _seed_appt(committed_conn, p["patient_id"], "staff")

    m = await bot_stats_service.get_metrics(WIN, WIN)
    assert m["inflow"] == {"kind": "value", "app": 1, "staff": 1, "chatbot": 2}


@pytest.mark.asyncio
async def test_metrics_split_inquiries_into_self_served_and_handed_off(committed_conn):
    # BOTSTAT-DASH-03: 문의 수·자체 안내·직원 연결을 분리 집계. 자체 안내 = 문의 − 직원 연결.
    p = await seed_patient(committed_conn)
    await _seed_ai_session(committed_conn, p["patient_id"], handed_off=False)
    await _seed_ai_session(committed_conn, p["patient_id"], handed_off=False)
    await _seed_ai_session(committed_conn, p["patient_id"], handed_off=True)

    m = await bot_stats_service.get_metrics(WIN, WIN)
    assert m["inquiries"] == {"kind": "value", "count": 3, "drillable": True}
    assert m["handed_off"] == {"kind": "value", "count": 1, "drillable": True}
    assert m["self_served"] == {"kind": "value", "count": 2, "drillable": True}


@pytest.mark.asyncio
async def test_ranking_clusters_all_patient_questions_not_only_unresolved(committed_conn):
    # QTOP-RANK-02·03: 답변 성공·실패 무관 전체 환자 질문을 임베딩 묶음해 건수 내림차순으로.
    p = await seed_patient(committed_conn)
    await _seed_question(committed_conn, p["patient_id"], "주차 되나요", 0)
    await _seed_question(committed_conn, p["patient_id"], "주차 어디에", 1)
    await _seed_question(committed_conn, p["patient_id"], "주말 진료 하나요", 2)
    emb = StubEmbedder({"주차 되나요": 0, "주차 어디에": 0, "주말 진료 하나요": 1})

    res = await bot_stats_service.get_ranking(WIN, WIN, emb)
    assert res["kind"] == "clusters" and res["embedding_gap"] is False
    assert [c["count"] for c in res["clusters"]] == [2, 1]
    assert res["clusters"][0]["representative"] == "주차 되나요"
    assert {"id", "representative", "count"} == set(res["clusters"][0])


@pytest.mark.asyncio
async def test_ranking_empty_when_no_questions_in_range(committed_conn):
    # QTOP-RANK-07: 집계 성공·질문 0건은 계약 부재(no_contract)가 아니라 empty.
    p = await seed_patient(committed_conn)
    await _seed_question(committed_conn, p["patient_id"], "주차 되나요")   # 창(2099-06) 안
    res = await bot_stats_service.get_ranking("2098-01-01", "2098-12-31", StubEmbedder({}))  # 다른 창
    assert res == {"kind": "empty"}


@pytest.mark.asyncio
async def test_ranking_flags_embedding_gap_and_cluster_detail_and_404(committed_conn):
    # QTOP-RANK-11: 임베딩 불가 질문이 있으면 embedding_gap. QTOP-RANK-05: 묶음 상세는 원 질문들.
    p = await seed_patient(committed_conn)
    await _seed_question(committed_conn, p["patient_id"], "주차 되나요", 0)
    await _seed_question(committed_conn, p["patient_id"], "주차 어디에", 1)
    await _seed_question(committed_conn, p["patient_id"], "임베딩 안 됨", 2)
    emb = StubEmbedder({"주차 되나요": 0, "주차 어디에": 0, "임베딩 안 됨": None})

    res = await bot_stats_service.get_ranking(WIN, WIN, emb)
    assert res["embedding_gap"] is True
    top = res["clusters"][0]
    detail = await bot_stats_service.get_ranking_cluster(top["id"], WIN, WIN, emb)
    assert detail["representative"] == "주차 되나요"
    assert detail["questions"] == ["주차 되나요", "주차 어디에"]
    with pytest.raises(AppError) as e:
        await bot_stats_service.get_ranking_cluster(str(uuid4()), WIN, WIN, emb)
    assert e.value.status_code == 404


@pytest.mark.asyncio
async def test_drill_uses_server_masked_names_only(committed_conn):
    # BOTSTAT-DASH-11: 드릴다운 명단은 서버가 마스킹한 표시값만. 익명 웹은 이름이 없다.
    p = await seed_patient(committed_conn, name="홍길동")
    await _seed_ai_session(committed_conn, p["patient_id"], handed_off=True)
    await _seed_ai_session(committed_conn, None, handed_off=True)  # 익명 웹

    rows = await bot_stats_service.get_drill("handedOff", WIN, WIN)
    masked = {r["patient_masked"] for r in rows}
    assert masked == {"홍○○", "웹 상담객"}
    assert all(r["at"] for r in rows)


@pytest.mark.asyncio
async def test_csv_suppresses_cells_below_five_and_carries_period(committed_conn):
    # BOTSTAT-DASH-13: CSV에서만 5건 미만 셀을 가리고 이유를 표시(화면 수치엔 억제 없음). -01/-12: 기간 표시.
    p = await seed_patient(committed_conn)
    for _ in range(6):
        await _seed_ai_session(committed_conn, p["patient_id"], handed_off=False)
    for _ in range(2):
        await _seed_ai_session(committed_conn, p["patient_id"], handed_off=True)

    export = await bot_stats_service.export_csv(WIN, WIN)
    assert WIN in export.body                               # 기간
    assert bot_stats_service.SUPPRESSED_LABEL in export.body  # 직원 연결=2건(<5) 가림
    assert "자체 안내,6" in export.body                      # 6건(≥5)은 그대로 노출
    # 화면 집계는 억제하지 않는다 — 서비스 get_metrics는 참값
    m = await bot_stats_service.get_metrics(WIN, WIN)
    assert m["handed_off"]["count"] == 2


@pytest.mark.asyncio
async def test_export_csv_returns_audit_meta(committed_conn):
    # [STAT-AUDIT-02][ALOG-LIST-13] export는 감사에 남길 행 수·억제 여부를 함께 돌려준다.
    p = await seed_patient(committed_conn)
    for _ in range(6):
        await _seed_ai_session(committed_conn, p["patient_id"], handed_off=False)
    for _ in range(2):
        await _seed_ai_session(committed_conn, p["patient_id"], handed_off=True)

    export = await bot_stats_service.export_csv(WIN, WIN)
    assert export.rows == 6           # 지표 3 + 유입원 3 = 데이터 값 6줄
    assert export.suppressed is True  # 직원 연결 2건(<5) 셀을 가렸다


@pytest.mark.asyncio
async def test_export_csv_no_suppression_when_all_cells_safe(committed_conn):
    # 5건 미만 셀이 없으면 억제 없음(suppressed=False).
    p = await seed_patient(committed_conn)
    for _ in range(6):
        await _seed_ai_session(committed_conn, p["patient_id"], handed_off=False)
    for _ in range(6):
        await _seed_ai_session(committed_conn, p["patient_id"], handed_off=True)

    export = await bot_stats_service.export_csv(WIN, WIN)
    assert export.suppressed is False


@pytest.mark.asyncio
async def test_router_stats_endpoints_require_admin_and_return_aggregates(committed_conn):
    # 라우터 배선 — 501 스텁이 아니라 200 집계. 관리자 게이트·기간 쿼리.
    p = await seed_patient(committed_conn)
    await _seed_appt(committed_conn, p["patient_id"], "app")
    await _seed_question(committed_conn, p["patient_id"], "주차 되나요")
    st = await seed_staff(committed_conn, role="admin")
    # auth_user_id는 실제 seed 값 — export 감사(STAT-AUDIT-02)가 RLS 아래 자기 staff로 INSERT한다.
    admin = StaffContext(id=st["staff_id"], auth_user_id=st["auth_user_id"], role="admin", department_id=None)
    try:
        app.dependency_overrides[get_current_staff] = lambda: admin
        app.dependency_overrides[bot_stats_service.get_embedder_dep] = \
            lambda: StubEmbedder({"주차 되나요": 0})
        with TestClient(app) as c:
            metrics = c.get("/admin/chat/stats?from=&to=")
            assert metrics.status_code == 200
            assert metrics.json()["inflow"]["app"] == 1
            ranking = c.get("/admin/chat/stats/ranking?from=&to=")
            assert ranking.status_code == 200 and ranking.json()["kind"] == "clusters"
            csv = c.get("/admin/chat/stats/export.csv?from=&to=")
            assert csv.status_code == 200 and "text/csv" in csv.headers["content-type"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_router_drilldown_and_export_write_audit_but_aggregate_does_not(committed_conn):
    # [STAT-AUDIT-01/02] 집계·필터는 감사 안 하고 드릴다운·CSV만 남긴다(결정 #22).
    p = await seed_patient(committed_conn)
    for _ in range(6):
        await _seed_ai_session(committed_conn, p["patient_id"], handed_off=False)
    st = await seed_staff(committed_conn, role="admin")
    admin = StaffContext(id=st["staff_id"], auth_user_id=st["auth_user_id"], role="admin", department_id=None)
    try:
        app.dependency_overrides[get_current_staff] = lambda: admin
        app.dependency_overrides[bot_stats_service.get_embedder_dep] = lambda: StubEmbedder({})
        with TestClient(app) as c:
            # 집계 — 감사 행 없음
            assert c.get("/admin/chat/stats?from=&to=").status_code == 200
            n_agg = await committed_conn.fetchval(
                "select count(*) from access_audit_log where staff_id=$1 "
                "and resource_type in ('stats_drilldown','stats_export')", st["staff_id"])
            assert n_agg == 0
            # 드릴다운 — stats_drilldown 행 + 지표·대상 건수
            assert c.get("/admin/chat/stats/inquiries/detail?from=&to=").status_code == 200
            drill = await committed_conn.fetchrow(
                "select * from access_audit_log where staff_id=$1 and resource_type='stats_drilldown'",
                st["staff_id"])
            assert drill is not None and drill["stats_metric"] == "inquiries"
            assert drill["stats_target_count"] == 6 and drill["patient_id"] is None
            # CSV — stats_export 행 + 행 수
            assert c.get("/admin/chat/stats/export.csv?from=&to=").status_code == 200
            exp = await committed_conn.fetchrow(
                "select * from access_audit_log where staff_id=$1 and resource_type='stats_export'",
                st["staff_id"])
            assert exp is not None and exp["stats_csv_rows"] == 6
    finally:
        app.dependency_overrides.clear()
