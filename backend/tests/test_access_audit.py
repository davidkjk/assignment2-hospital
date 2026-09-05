"""[SEARCH-LOG-01·03·04·05] 검색·번호펼치기 기록 — log_access 확장.

가리기만 하고 기록을 안 남기면 절반만 한 것이다(요구사항 3.1 :81·:82).
검색은 환자 1명이 아니라 「무엇으로 찾았나」이고(patient_id 없음 + search_term),
번호 펼치기는 그 반대(patient_id 있음)다. 00034가 patient_id를 nullable로 풀고
search_term 칸을 만들었기에 한 함수가 둘 다 남길 수 있다.
"""
from datetime import date

from app.core.security import StaffContext
from app.services import audit_service
from tests.conftest import seed_staff


def _ctx(seed: dict, role: str = "receptionist") -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


async def _seed_patient(conn) -> str:
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('김환자', $1, 'F', '01012345678') returning id",
        date(1958, 3, 12),
    )


async def test_검색은_환자_없이_검색어와_함께_남는다(committed_conn):
    """[SEARCH-LOG-01][SEARCH-LOG-03] 검색은 환자 1명이 아니다 — patient_id 없이 검색어만.

    가려진 자리(전화 중간·생년월일 월)로도 검색할 수 있게 열어 뒀으므로, 막는 대신
    이 기록이 그 대가를 받는다.
    """
    staff = _ctx(await seed_staff(committed_conn, role="receptionist"))

    await audit_service.log_access(None, "search", staff, search_term="김 1234")

    row = await committed_conn.fetchrow(
        "select patient_id, search_term, resource_type from access_audit_log "
        "where resource_type = 'search' and staff_id = $1",
        staff.id,
    )
    assert row["patient_id"] is None
    assert row["search_term"] == "김 1234"


async def test_이어_친_검색은_한_줄로_묶인다(committed_conn):
    """[SEARCH-LOG-04][SEARCH-LOG-05] 같은 직원이 30초 안에 이어 친 검색은 마지막 것만 남긴다.

    관리자가 보려는 것은 「이 직원이 무엇을 찾으려 했나」이지 타자 과정이 아니다.
    """
    staff = _ctx(await seed_staff(committed_conn, role="receptionist"))

    for q in ["김", "김 1", "김 1234"]:
        await audit_service.log_access(None, "search", staff, search_term=q)

    rows = await committed_conn.fetch(
        "select search_term from access_audit_log where resource_type = 'search' and staff_id = $1",
        staff.id,
    )
    assert len(rows) == 1
    assert rows[0]["search_term"] == "김 1234"


async def test_다른_직원의_검색은_따로_남는다(committed_conn):
    """[SEARCH-LOG-04] 30초 묶기는 직원 단위다 — 남의 검색을 덮으면 「누가 찾았나」가 사라진다."""
    a = _ctx(await seed_staff(committed_conn, role="receptionist"))
    b = _ctx(await seed_staff(committed_conn, role="admin"))

    await audit_service.log_access(None, "search", a, search_term="김")
    await audit_service.log_access(None, "search", b, search_term="이")

    rows = await committed_conn.fetch("select staff_id from access_audit_log where resource_type = 'search'")
    assert {r["staff_id"] for r in rows} == {a.id, b.id}


async def test_번호_펼치기는_환자와_함께_남고_검색어는_비운다(committed_conn):
    """[MASK-VIEW-02] 열람은 검색의 반대다 — patient_id가 있고 search_term은 없다."""
    staff = _ctx(await seed_staff(committed_conn, role="receptionist"))
    pid = await _seed_patient(committed_conn)

    await audit_service.log_access(pid, "phone_reveal", staff)

    row = await committed_conn.fetchrow(
        "select patient_id, search_term, resource_type from access_audit_log where resource_type = 'phone_reveal'",
    )
    assert row["patient_id"] == pid
    assert row["search_term"] is None
