"""[STAT-AUDIT-02][ALOG-LIST-13][BOTSTAT-DASH-15] 통계 감사 payload 칸 스키마.

결정 #22: 통계 드릴다운·CSV 내보내기는 「실행자·시각·지표·기간·대상 건수·CSV 행 수·억제 여부」만
남긴다. 00034가 patient_id nullable + stats_drilldown/stats_export 종류까지는 열었으나, 지표·기간·
건수·억제를 담을 칸이 없어 감사 함수가 그 값을 버리던 것(BLOCKED)을 이 마이그가 푼다.
"""
from tests.conftest import seed_staff


async def test_통계_감사_payload_칸이_있다(db_conn):
    """[STAT-AUDIT-02] 지표·기간·대상 건수·CSV 행 수·억제 여부를 담을 전용 칸이 존재한다."""
    cols = {
        r["column_name"]
        for r in await db_conn.fetch(
            "select column_name from information_schema.columns "
            "where table_name = 'access_audit_log'"
        )
    }
    assert {
        "stats_metric",
        "stats_period_from",
        "stats_period_to",
        "stats_target_count",
        "stats_csv_rows",
        "stats_suppressed",
    } <= cols


async def test_통계_드릴다운_행에_payload를_저장한다(db_conn):
    """[STAT-AUDIT-02] stats_drilldown 행은 환자 없이 지표·기간·건수를 남긴다."""
    staff = await seed_staff(db_conn, role="admin")
    await db_conn.execute(
        """insert into access_audit_log
             (staff_id, resource_type, patient_id, stats_metric,
              stats_period_from, stats_period_to, stats_target_count)
           values ($1, 'stats_drilldown', null, 'inquiries', '2026-09-01', '2026-09-30', 12)""",
        staff["staff_id"],
    )
    row = await db_conn.fetchrow(
        "select * from access_audit_log where resource_type = 'stats_drilldown'"
    )
    assert row["patient_id"] is None
    assert row["stats_metric"] == "inquiries"
    assert row["stats_target_count"] == 12
    assert str(row["stats_period_from"]) == "2026-09-01"


async def test_통계_내보내기_행에_억제여부와_행수를_저장한다(db_conn):
    """[ALOG-LIST-13] stats_export 행은 CSV 행 수·k=5 억제 여부까지 남긴다."""
    staff = await seed_staff(db_conn, role="admin")
    await db_conn.execute(
        """insert into access_audit_log
             (staff_id, resource_type, patient_id, stats_metric,
              stats_csv_rows, stats_suppressed)
           values ($1, 'stats_export', null, 'all', 6, true)""",
        staff["staff_id"],
    )
    row = await db_conn.fetchrow(
        "select * from access_audit_log where resource_type = 'stats_export'"
    )
    assert row["stats_csv_rows"] == 6
    assert row["stats_suppressed"] is True
