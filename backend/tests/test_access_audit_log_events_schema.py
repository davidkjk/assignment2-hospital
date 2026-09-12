import pytest
from tests.conftest import seed_staff, set_session_auth


async def test_검색_기록은_환자_없이_남는다(db_conn):
    """[SEARCH-LOG-03] 검색은 환자 1명이 아니다 — patient_id not null이 갭 #80의 뿌리였다.

    규칙 원문: "지금 구조로는 못 남긴다" — patient_id not null · resource_type 2종 ·
    검색어 칸 없음. 셋 다 풀려야 SEARCH-LOG-01이 성립한다.
    """
    staff = await seed_staff(db_conn, role="receptionist")
    await db_conn.execute(
        """insert into access_audit_log (staff_id, resource_type, patient_id, search_term)
           values ($1, 'search', null, '김 1234')""",
        staff["staff_id"],
    )
    row = await db_conn.fetchrow("select * from access_audit_log where resource_type='search'")
    assert row["patient_id"] is None and row["search_term"] == "김 1234"


@pytest.mark.parametrize(
    "resource_type",
    ["patient_detail", "medical_record", "phone_reveal",   # 기존(00015까지)
     "search", "bulk_view", "patient_merge", "patient_merge_undo", "stats_drilldown", "stats_export"],
)
async def test_감사_사건_종류가_전부_허용된다(db_conn, resource_type):
    """[ALOG-AUDIT-01][SEARCH-LOG-02][STAT-*] 「개인을 겨냥한 순간부터 남긴다」.

    통계의 aggregate·filter는 감사하지 않고 drilldown·export만 남긴다(결정 #22) —
    그래서 stats_drilldown·stats_export가 별도 종류로 필요하다.
    """
    staff = await seed_staff(db_conn, role="admin")
    patient_id = None
    if resource_type not in {"search", "stats_drilldown", "stats_export"}:
        patient_id = await db_conn.fetchval(
            "insert into patients (name, birth_date, gender, phone) "
            "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
        )
    await db_conn.execute(
        "insert into access_audit_log (staff_id, resource_type, patient_id) values ($1, $2, $3)",
        staff["staff_id"], resource_type, patient_id,
    )


async def test_알_수_없는_사건_종류는_거부한다(db_conn):
    """[ALOG-LIST-01] 종류를 자유 문자열로 두면 목록·필터가 무의미해진다."""
    staff = await seed_staff(db_conn, role="admin")
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into access_audit_log (staff_id, resource_type) values ($1, 'whatever')",
            staff["staff_id"],
        )


async def test_환자_대상_사건은_여전히_환자를_요구한다(db_conn):
    """[MASK-VIEW-02] patient_id를 nullable로 푼 것이 「아무 때나 비워도 된다」는 아니다.

    번호를 펼친 기록에 환자가 없으면 그 줄은 아무것도 증명하지 못한다.
    """
    staff = await seed_staff(db_conn, role="receptionist")
    with pytest.raises(Exception):
        await db_conn.execute(
            """insert into access_audit_log (staff_id, resource_type, patient_id)
               values ($1, 'phone_reveal', null)""",
            staff["staff_id"],
        )
