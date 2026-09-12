import pytest

from app.core.security import StaffContext
from app.services import audit_service
from tests.conftest import seed_staff, set_session_auth


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


@pytest.mark.asyncio
async def test_log_access_records_entry(db_conn):
    receptionist = _to_context(await seed_staff(db_conn, role="receptionist"), "receptionist")
    patient_id = await db_conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    await set_session_auth(db_conn, receptionist.auth_user_id)

    await audit_service.log_access(patient_id, "patient_detail", receptionist, conn=db_conn)

    await db_conn.execute("reset role")
    row = await db_conn.fetchrow(
        "select staff_id, patient_id, resource_type from access_audit_log where patient_id = $1", patient_id,
    )
    assert row["staff_id"] == receptionist.id
    assert row["resource_type"] == "patient_detail"


@pytest.mark.asyncio
async def test_log_stats_drilldown_records_payload(db_conn):
    """[STAT-AUDIT-02] 통계 드릴다운 감사는 지표·기간·대상 건수를 남긴다(환자 없이)."""
    admin = _to_context(await seed_staff(db_conn, role="admin"), "admin")
    await set_session_auth(db_conn, admin.auth_user_id)

    await audit_service.log_stats_drilldown(
        admin, metric="inquiries", period_from="2026-09-01", period_to="2026-09-30",
        target_count=12, conn=db_conn,
    )

    await db_conn.execute("reset role")
    row = await db_conn.fetchrow(
        "select * from access_audit_log where resource_type = 'stats_drilldown'"
    )
    assert row["staff_id"] == admin.id
    assert row["patient_id"] is None
    assert row["stats_metric"] == "inquiries"
    assert row["stats_target_count"] == 12
    assert str(row["stats_period_from"]) == "2026-09-01"
    assert str(row["stats_period_to"]) == "2026-09-30"


@pytest.mark.asyncio
async def test_log_stats_export_records_rows_and_suppression(db_conn):
    """[ALOG-LIST-13] CSV 내보내기 감사는 행 수·k=5 억제 여부까지 남긴다."""
    admin = _to_context(await seed_staff(db_conn, role="admin"), "admin")
    await set_session_auth(db_conn, admin.auth_user_id)

    await audit_service.log_stats_export(
        admin, metric="all", period_from="2026-09-01", period_to=None,
        target_count=6, rows=6, suppressed=True, conn=db_conn,
    )

    await db_conn.execute("reset role")
    row = await db_conn.fetchrow(
        "select * from access_audit_log where resource_type = 'stats_export'"
    )
    assert row["stats_metric"] == "all"
    assert row["stats_csv_rows"] == 6
    assert row["stats_suppressed"] is True
    assert row["stats_period_to"] is None


@pytest.mark.asyncio
async def test_log_stats_export_empty_period_string_is_null(db_conn):
    """[STAT-AUDIT-02] from/to 쿼리는 ''(무제한)로 올 수 있다 → date 칸에 null로 넣는다."""
    admin = _to_context(await seed_staff(db_conn, role="admin"), "admin")
    await set_session_auth(db_conn, admin.auth_user_id)

    await audit_service.log_stats_export(
        admin, metric="all", period_from="", period_to="", rows=6, suppressed=False, conn=db_conn,
    )

    await db_conn.execute("reset role")
    row = await db_conn.fetchrow(
        "select * from access_audit_log where resource_type = 'stats_export'"
    )
    assert row["stats_period_from"] is None and row["stats_period_to"] is None
