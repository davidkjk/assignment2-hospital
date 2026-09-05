"""상담봇 처리 현황(통계) 서버 집계 — Task 22 `BOTSTAT-DASH-*`·`QTOP-RANK-*`(⑦).

플랜이 501 스텁으로 남겨 둔 자리를 실제 집계로 채운다. 기간은 다른 상담봇 집계와 동일하게
Asia/Seoul date 경계로 자른다. 유효한 0건과 계약 부재를 구분해야 하므로, 이 서비스가 응답하면
그 지표는 '계약 있음'(kind=value)이다 — 화면이 '현재 집계할 수 없음'을 붙이는 건 라우터가 없거나
꺼져 501을 줄 때뿐.

⚠️ 가정(플랜 '확인 필요' — 합리적 기본, 후속 조정 대상):
- 문의 수  = 기간에 시작된 AI 상담 세션 수(ai_chat_sessions.started_at, Asia/Seoul).
- 직원 연결 = 그중 staff_handoff로 끝난 세션. 자체 안내 = 문의 수 − 직원 연결.
- 유입원   = appointments.source(app/staff/chatbot)를 created_at 기준으로 센다(챗봇을 앱/직원에 안 섞음).
- 많이 들어온 질문 = 기간의 전체 환자 텍스트 질문을 집계 시점에 임베딩해 코사인 묶음(unresolved_service.cluster_questions 재사용).
                     미해결만 모은 화면과 섞지 않는다(QTOP-RANK-02).
- TOP N = 상위 10(동률은 대표 질문 텍스트 오름차순 — cluster_questions 기본 정렬).
- 드릴 마스킹 = 이름 첫 글자 + ○(익명 웹은 '웹 상담객'). 원본은 클라이언트로 내보내지 않는다.
- CSV k=5 = 환자 기준 셀이 5건 미만이면 CSV에서만 가린다(화면 수치엔 억제 없음).
- 감사 저장(BOTSTAT-DASH-15): 드릴다운·CSV는 비개인정보(지표·기간·건수·억제)만 access_audit_log에
  남긴다(00091, audit_service.log_stats_*) — 검색어·환자명·전화는 절대 payload로 적재하지 않는다.
"""
import csv
import io
from dataclasses import dataclass

from app.core.errors import AppError
from app.db.pool import get_pool
from app.integrations.embedding_client import get_embedding_client
from app.services.chat.unresolved_service import cluster_questions

TOP_N = 10
K_ANON = 5
SUPPRESSED_LABEL = "5건 미만(가림)"


def get_embedder_dep():
    """라우터 주입점 — 자동 테스트가 app.dependency_overrides로 가짜 임베더를 끼운다."""
    return get_embedding_client()


# 기간 술어: $1=from, $2=to (둘 다 Asia/Seoul date 경계, null/'' 이면 무제한).
def _range(col: str) -> str:
    return (f"($1::text is null or $1='' or ({col} at time zone 'Asia/Seoul')::date >= $1::date) "
            f"and ($2::text is null or $2='' or ({col} at time zone 'Asia/Seoul')::date <= $2::date)")


def _mask_name(name: str | None) -> str:
    if not name:
        return "웹 상담객"
    return name[0] + "○" * max(len(name) - 1, 1)


async def get_metrics(date_from: str | None, date_to: str | None) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        inflow = await conn.fetchrow(
            "select count(*) filter (where source='app') as app, "
            "count(*) filter (where source='staff') as staff, "
            "count(*) filter (where source='chatbot') as chatbot "
            f"from appointments where {_range('created_at')}",
            date_from, date_to)
        m = await conn.fetchrow(
            "select count(*) as inquiries, "
            "count(*) filter (where end_reason='staff_handoff') as handed "
            f"from ai_chat_sessions where {_range('started_at')}",
            date_from, date_to)
    inquiries, handed = m["inquiries"], m["handed"]
    return {
        "inflow": {"kind": "value", "app": inflow["app"], "staff": inflow["staff"], "chatbot": inflow["chatbot"]},
        "inquiries": {"kind": "value", "count": inquiries, "drillable": True},
        "self_served": {"kind": "value", "count": inquiries - handed, "drillable": True},
        "handed_off": {"kind": "value", "count": handed, "drillable": True},
    }


_QUESTIONS_SQL = (
    "select id, content, created_at from chat_messages "
    "where sender_type='patient' and message_type='text' "
    f"and {_range('created_at')} order by created_at asc, id asc"
)


async def _clusters(date_from: str | None, date_to: str | None, embedder) -> tuple[list[dict], bool]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_QUESTIONS_SQL, date_from, date_to)
    if not rows:
        return [], False
    vecs = await embedder.embed([r["content"] for r in rows])
    payload = [{"id": str(r["id"]), "question_text": r["content"], "embedding": v}
               for r, v in zip(rows, vecs)]
    return cluster_questions(payload)


async def get_ranking(date_from: str | None, date_to: str | None, embedder) -> dict:
    clusters, gap = await _clusters(date_from, date_to, embedder)
    if not clusters and not gap:
        return {"kind": "empty"}
    top = [{"id": c["id"], "representative": c["representative"], "count": c["count"]}
           for c in clusters[:TOP_N]]
    return {"kind": "clusters", "clusters": top, "embedding_gap": gap}


async def get_ranking_cluster(cluster_id: str, date_from: str | None, date_to: str | None, embedder) -> dict:
    clusters, _ = await _clusters(date_from, date_to, embedder)
    for c in clusters:
        if c["id"] == cluster_id:
            return {"representative": c["representative"], "questions": c["questions"]}
    raise AppError("없는 묶음입니다(기간이 달라졌을 수 있습니다).", 404)


_METRIC_FILTER = {
    "inquiries": "",
    "selfserved": "and s.end_reason is distinct from 'staff_handoff'",
    "handedoff": "and s.end_reason = 'staff_handoff'",
}


def _metric_key(metric: str) -> str:
    key = metric.replace("_", "").replace("-", "").lower()
    if key not in _METRIC_FILTER:
        raise AppError("알 수 없는 지표입니다.", 404)
    return key


async def get_drill(metric: str, date_from: str | None, date_to: str | None) -> list[dict]:
    where = _METRIC_FILTER[_metric_key(metric)]
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select s.started_at, p.name from ai_chat_sessions s "
            "join chat_threads t on t.id = s.thread_id "
            "left join patients p on p.id = t.patient_id "
            f"where {_range('s.started_at')} {where} order by s.started_at desc, s.id desc",
            date_from, date_to)
    return [{"patient_masked": _mask_name(r["name"]), "at": r["started_at"].isoformat()} for r in rows]


def _cell(count: int) -> str:
    """k=5 익명성: 환자 기준 셀이 5건 미만이면 가린다(BOTSTAT-DASH-13)."""
    return SUPPRESSED_LABEL if 0 < count < K_ANON else str(count)


@dataclass
class CsvExport:
    """[STAT-AUDIT-02][ALOG-LIST-13] CSV 본문 + 감사에 남길 비개인정보 메타."""

    body: str
    rows: int          # CSV로 쓴 데이터 값 행 수(지표 3 + 유입원 3)
    suppressed: bool   # k=5 억제가 한 셀이라도 일어났나
    target_count: int  # 내보낸 지표 셀 수(억제 전 원값)


async def export_csv(date_from: str | None, date_to: str | None) -> CsvExport:
    m = await get_metrics(date_from, date_to)
    buf = io.StringIO()
    w = csv.writer(buf)
    state = {"rows": 0, "suppressed": False}

    def cell(count: int) -> str:
        state["rows"] += 1
        rendered = _cell(count)
        if rendered == SUPPRESSED_LABEL:
            state["suppressed"] = True
        return rendered

    w.writerow(["기간", date_from or "전체", date_to or "전체"])
    w.writerow([])
    w.writerow(["지표", "값"])
    w.writerow(["문의 수", cell(m["inquiries"]["count"])])
    w.writerow(["자체 안내", cell(m["self_served"]["count"])])
    w.writerow(["직원 연결", cell(m["handed_off"]["count"])])
    w.writerow([])
    w.writerow(["예약 유입원", "값"])
    w.writerow(["앱", cell(m["inflow"]["app"])])
    w.writerow(["직원", cell(m["inflow"]["staff"])])
    w.writerow(["챗봇", cell(m["inflow"]["chatbot"])])
    w.writerow([])
    w.writerow([f"* {SUPPRESSED_LABEL}: 개인정보 보호를 위해 5건 미만 셀은 CSV에서만 가립니다(화면 수치는 그대로)."])
    return CsvExport(
        body=buf.getvalue(), rows=state["rows"],
        suppressed=state["suppressed"], target_count=state["rows"],
    )
