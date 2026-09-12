"""[ALOG-LIST-08][B-19] 열람 감사 안정 정렬 인덱스 — 00040.

⭐ 200건 이어보기(ALOG-FILTER-06·07)는 `(accessed_at desc, id desc)`로 정렬한다. 이 인덱스가
   없으면 ①매 요청이 full scan이 되어 월 1회 점검(결정 4회차)이 느려지고 ②동점 시각(같은 초에
   여러 열람)에서 순서가 흔들려 다음 페이지가 겹치거나 빠진다(SEARCH-ORDER-05가 경고한 사고).
"""


async def test_안정정렬_인덱스가_있다(db_conn):
    """[ALOG-LIST-08][B-19] (accessed_at desc, id desc) 인덱스가 그 순서 그대로 있어야 한다."""
    indexdef = await db_conn.fetchval(
        """
        select indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'access_audit_log'
          and indexname = 'access_audit_log_accessed_at_id_idx'
        """
    )
    assert indexdef is not None
    assert "accessed_at DESC" in indexdef
    assert "id DESC" in indexdef


async def test_정렬_조회가_인덱스로_풀리고_따로_정렬하지_않는다(db_conn):
    """[ALOG-LIST-08][B-19] `order by accessed_at desc, id desc limit 200`이 인덱스로 풀려야
    Sort 노드가 생기지 않는다 — Sort가 생기면 동점 순서가 매 조회 흔들릴 수 있고 full scan이다."""
    await db_conn.execute("set local enable_seqscan = off")
    plan_rows = await db_conn.fetch(
        "explain select * from access_audit_log order by accessed_at desc, id desc limit 200"
    )
    plan = "\n".join(r[0] for r in plan_rows)
    assert "access_audit_log_accessed_at_id_idx" in plan
    assert "Sort" not in plan
