"""[SCHED-EXC-16][SCHED-EXC-17][SCHED-HOURS-03] 갭 #96 — 운영시간·병원 휴무 두 표.

- hospital_hours: 접수 창구가 열린 시간(상담봇 is_open 판정이 읽는다). 의사 진료시간과 다른 자.
- hospital_closures: 병원 전체 종일 휴무. Task 2 list_affected_appointments가 closure_date를 읽는다.
- 옛 hospital_hour_exceptions는 폐기한다(경고 장치를 한 곳에만 두기 위해).
"""


async def _columns(conn, table: str) -> dict:
    rows = await conn.fetch(
        """
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public' and table_name = $1
        """,
        table,
    )
    return {r["column_name"]: r for r in rows}


async def test_hospital_hours_표에_요일_운영시간_칸이_있다(db_conn):
    """[SCHED-HOURS-03] 접수 창구 시간 — 요일 하나당 여는·닫는·점심."""
    cols = await _columns(db_conn, "hospital_hours")
    assert cols["weekday"]["data_type"] == "smallint"
    assert cols["open_time"]["data_type"] == "time without time zone"
    assert cols["close_time"]["data_type"] == "time without time zone"
    assert "lunch_start" in cols
    assert "lunch_end" in cols


async def test_hospital_hours의_요일이_기본키다(db_conn):
    """[R3-01] 요일당 한 줄 — 같은 요일 두 줄이면 어느 게 창구시간인지 모른다."""
    pk = await db_conn.fetchval(
        """
        select a.attname
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = 'public.hospital_hours'::regclass and i.indisprimary
        """
    )
    assert pk == "weekday"


async def test_hospital_closures_표에_날짜_기본키와_메모가_있다(db_conn):
    """[SCHED-EXC-16] 종일 휴무 한 줄 = 날짜 하나. closure_date를 Task 2가 읽는다."""
    cols = await _columns(db_conn, "hospital_closures")
    assert cols["closure_date"]["data_type"] == "date"
    assert "memo" in cols
    assert "created_by" in cols


async def test_closure_date가_기본키다(db_conn):
    """[SCHED-EXC-16] 같은 날 휴무 두 번 = 없어야 한다."""
    pk = await db_conn.fetchval(
        """
        select a.attname
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = 'public.hospital_closures'::regclass and i.indisprimary
        """
    )
    assert pk == "closure_date"


async def test_옛_hospital_hour_exceptions_표는_없다(db_conn):
    """[SCHED-EXC-17] 갭 #96 — 휴무를 두 곳에 두면 경고가 싫은 관리자가
    경고 없는 문으로 돌아간다. 한 표(hospital_closures)만 남긴다."""
    exists = await db_conn.fetchval(
        "select to_regclass('public.hospital_hour_exceptions')"
    )
    assert exists is None
