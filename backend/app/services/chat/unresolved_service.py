"""미해결 질문 유사도 묶음(UNRES-CLUSTER) — Task 8이 적재만(record_unresolved) 하고 집계 함수가 없던 자리(⑦).

봇이 답 못 해 인계된 질문(unresolved_questions)을 기간으로 잘라 임베딩 코사인 유사도로 탐욕(greedy) 묶음한다.
⭐ 자동 묶음은 확정 분류가 아니다 — 화면이 한계 안내를 항상 붙인다(UNRES-CLUSTER-04). 임베딩이 비어(영벡터) 있으면
그 질문은 묶지 않고 embedding_gap=true로 알린다(UNRES-CLUSTER-11) — 전체를 집계했다고 단정하지 않는다.
묶음 id = 대표(첫) 질문의 unresolved_questions.id — 같은 기간이면 같은 id가 나온다(상세 조회에 기간을 함께 받는 이유)."""
from math import sqrt

from app.core.errors import AppError
from app.db.pool import get_pool

SIMILARITY_THRESHOLD = 0.85


def _parse_vec(text: str | None) -> list[float]:
    if not text:
        return []
    return [float(x) for x in text.strip("[]").split(",") if x.strip()]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na, nb = sqrt(sum(x * x for x in a)), sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def cluster_questions(rows: list[dict], threshold: float = SIMILARITY_THRESHOLD) -> tuple[list[dict], bool]:
    """순수 함수 — rows: {id, question_text, embedding(list[float])} 시간순. 반환 (묶음 목록, 임베딩 누락 여부).
    묶음: {id(대표 질문 id), representative, count, questions[list[str]]}, 건수 내림차순."""
    clusters: list[dict] = []
    gap = False
    for r in rows:
        vec = r["embedding"]
        if not vec or not any(vec):
            gap = True  # 영벡터/빈 임베딩 — 묶지 않고 알린다(11)
            continue
        for c in clusters:
            if _cosine(c["_vec"], vec) >= threshold:
                c["count"] += 1
                c["questions"].append(r["question_text"])
                c["last_at"] = r.get("created_at") or c["last_at"]
                break
        else:
            clusters.append({"id": str(r["id"]), "representative": r["question_text"], "count": 1,
                             "questions": [r["question_text"]], "last_at": r.get("created_at"), "_vec": vec})
    for c in clusters:
        c.pop("_vec")
    clusters.sort(key=lambda c: (-c["count"], c["representative"]))
    return clusters, gap


_ROWS_SQL = """
select id, question_text, question_embedding::text as emb, created_at
from unresolved_questions
where ($1::text is null or $1 = '' or (created_at at time zone 'Asia/Seoul')::date >= $1::date)
  and ($2::text is null or $2 = '' or (created_at at time zone 'Asia/Seoul')::date <= $2::date)
order by created_at asc, id asc
"""


async def _load(date_from: str | None, date_to: str | None) -> tuple[list[dict], bool]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_ROWS_SQL, date_from, date_to)
    return cluster_questions([{"id": r["id"], "question_text": r["question_text"], "embedding": _parse_vec(r["emb"]),
                               "created_at": r["created_at"]} for r in rows])


async def list_clusters(date_from: str | None, date_to: str | None) -> dict:
    clusters, gap = await _load(date_from, date_to)
    return {"clusters": [{"id": c["id"], "representative": c["representative"], "count": c["count"],
                          "last_at": c["last_at"].isoformat() if c["last_at"] else None} for c in clusters],
            "embedding_gap": gap}


async def get_cluster(cluster_id: str, date_from: str | None, date_to: str | None) -> dict:
    clusters, _ = await _load(date_from, date_to)
    for c in clusters:
        if c["id"] == cluster_id:
            return {"representative": c["representative"], "questions": c["questions"]}
    raise AppError("없는 묶음입니다(기간이 달라졌을 수 있습니다).", 404)
