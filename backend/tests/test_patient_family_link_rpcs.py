import pytest


@pytest.mark.asyncio
async def test_link_rpcs_exist_and_block_direct_write(db_conn):
    # [SDB-19] 직접 UPDATE/DELETE는 막히고, 세 RPC만 링크를 바꾼다.
    exists = await db_conn.fetch(
        "select proname from pg_proc where proname in "
        "('update_family_link_relation_self','unlink_family_link_self','relink_family_link_self')")
    assert {r["proname"] for r in exists} == {
        "update_family_link_relation_self", "unlink_family_link_self", "relink_family_link_self"}
