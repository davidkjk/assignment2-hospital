import pytest


@pytest.mark.asyncio
async def test_generate_booking_code_is_always_six_chars(db_conn):
    """[갭 #127] (random()*32)::int는 반올림이라 33번째 글자를 찾고, 그 자리가 통째로 빠졌다.
    실측 2만 건에서 8.7%가 6자리 미만이었다 — CHKIN-CODE-04가 그 코드를 거절한다."""
    lengths = await db_conn.fetch(
        "select length(public.generate_booking_code()) as n from generate_series(1, 20000)"
    )
    assert {r["n"] for r in lengths} == {6}


@pytest.mark.asyncio
async def test_generate_booking_code_uses_every_letter_evenly(db_conn):
    """[갭 #127] 덤 — 반올림은 첫 글자 '2'의 당첨 구간을 절반으로 만들었다.
    32글자가 모두 나오고, 어느 하나도 다른 것의 70% 아래로 떨어지지 않는다."""
    rows = await db_conn.fetch(
        "select c, count(*) n from ("
        "  select regexp_split_to_table(public.generate_booking_code(), '') c"
        "  from generate_series(1, 20000)) s group by c"
    )
    counts = {r["c"]: r["n"] for r in rows}
    assert len(counts) == 32
    assert min(counts.values()) > max(counts.values()) * 0.7
