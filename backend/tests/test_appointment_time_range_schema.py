"""[CAL-GAP-08·09][CAL-TIME-09][R3-03] 00039 — 예약의 실제 시각 범위·겹침 제약·Realtime.

⚠️ 브리핑 전제(「start_at·end_at은 00038이 이미 만들었다」)는 원문과 달랐다 — 00038
   (`00038_walkin_visit_time.sql:13~15`)은 워크인 방문 시각(walkin_visit_time)만 열었고,
   예약 전체의 실제 시작·종료(start_at/end_at)는 00039가 처음 만든다(갭 #85의 다른 갈래).

여기서 보는 것은 DB 스키마뿐이다: 시각 범위 칸·allow_overlap 사실 기록 칸·GiST 배제
제약·같은 시각 시작 unique·세 테이블의 Realtime publication 등록.
"""


async def _columns(conn, table: str) -> dict:
    rows = await conn.fetch(
        """
        select column_name, data_type, is_nullable, column_default
        from information_schema.columns
        where table_schema = 'public' and table_name = $1
        """,
        table,
    )
    return {r["column_name"]: r for r in rows}


async def test_appointments에_시작종료_시각_칸이_있다(db_conn):
    """[CAL-GAP-09] 겹침을 시간 범위로 재려면 실제 시작·종료가 있어야 한다(갭 #85)."""
    cols = await _columns(db_conn, "appointments")
    assert cols["start_at"]["data_type"] == "timestamp with time zone"
    assert cols["end_at"]["data_type"] == "timestamp with time zone"


async def test_allow_overlap는_기본이_거짓인_사실기록_칸이다(db_conn):
    """[CAL-GAP-06][CAL-GAP-07] allow_overlap은 제약을 끄는 스위치가 아니라 「직원이
    경고를 읽고 그대로 잡았다」는 사실이다. 기본 false — 화면을 거치지 않으면 겹칠 수 없다."""
    cols = await _columns(db_conn, "appointments")
    assert cols["allow_overlap"]["data_type"] == "boolean"
    assert cols["allow_overlap"]["is_nullable"] == "NO"
    assert cols["allow_overlap"]["column_default"] == "false"


async def test_btree_gist_확장이_설치돼_있다(db_conn):
    """GiST 배제 제약이 doctor_id(=) 같은 스칼라 동등 비교를 범위 겹침과 함께 걸려면 필요하다."""
    ext = await db_conn.fetchval("select extname from pg_extension where extname = 'btree_gist'")
    assert ext == "btree_gist"


async def test_겹침_배제_제약이_있다(db_conn):
    """[CAL-GAP-09] 같은 의사·시간 범위가 겹치는 두 예약을 DB가 최종 심판한다.
    contype='x' = EXCLUDE. 화면만 막으면 API 직접 호출로 조용히 겹친다."""
    contype = await db_conn.fetchval(
        """
        select contype from pg_constraint
        where conrelid = 'public.appointments'::regclass
          and conname = 'appointments_no_overlap'
        """
    )
    assert contype == b"x"  # "char" 타입은 asyncpg에서 bytes로 온다


async def test_같은_시각_시작은_unique로_막힌다(db_conn):
    """[CAL-GAP-08] :112(모르고 같은 자리에 두 명)는 범위 배제와 별개로 「같은 시각 시작」
    자체를 막는다 — allow_overlap으로도 못 뚫는다."""
    idx = await db_conn.fetchval(
        """
        select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'appointments'
          and indexname = 'appointments_doctor_start_unique'
        """
    )
    assert idx == "appointments_doctor_start_unique"


async def test_세_테이블이_realtime_publication에_있다(db_conn):
    """[R3-03] appointments·appointment_slots·appointment_status_history가
    supabase_realtime publication에 없으면 코드가 구독해도 실제 환경에서는 아무것도
    오지 않는다 — 로컬 mock 테스트만 통과하고 창구에서 조용히 실패한다."""
    published = await db_conn.fetch(
        "select tablename from pg_publication_tables where pubname = 'supabase_realtime'"
    )
    names = {r["tablename"] for r in published}
    assert {"appointments", "appointment_slots", "appointment_status_history"} <= names
