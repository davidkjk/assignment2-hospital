"""[ALOG-*][MASK-SRV-01][SEARCH-LOG-*] /admin/access-logs 조회 서비스.

읽기 전용 감사 화면의 백엔드 — 「누가 어떤 환자 정보를 언제 열었나」를 관리자만, 마스킹된
채로, 안정 정렬(accessed_at desc, id desc)로 최신 200건 + cursor/기간 이어보기로 준다.
"""
import json
from datetime import date, datetime, timezone

import pytest

from app.core.errors import AppError
from app.core.masking import mask_birth_date, mask_phone
from app.core.security import StaffContext
from app.services import audit_query_service, patient_service
from tests.conftest import seed_staff


def _ctx(seed: dict, role: str) -> StaffContext:
    return StaffContext(id=seed["staff_id"], auth_user_id=seed["auth_user_id"], role=role, department_id=None)


async def _seed_patient(conn, name="홍길동", phone="01011115678", birth=date(1958, 4, 12)) -> str:
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ($1, $2, 'M', $3) returning id",
        name, birth, phone,
    )


async def _seed_audit(conn, *, staff_id, resource_type="patient_detail", patient_id=None,
                      accessed_at=None, search_term=None, result_count=None, fragment_count=None) -> None:
    await conn.execute(
        "insert into access_audit_log "
        "(staff_id, patient_id, resource_type, accessed_at, search_term, result_count, fragment_count) "
        "values ($1, $2, $3, coalesce($4, now()), $5, $6, $7)",
        staff_id, patient_id, resource_type, accessed_at, search_term, result_count, fragment_count,
    )


async def test_조회는_관리자만_할_수_있다(db_conn):
    """[ALOG-SHELL-01] 메뉴 노출로 권한을 대신하지 않는다 — 서버가 거절한다."""
    for role in ("receptionist", "doctor"):
        staff = _ctx(await seed_staff(db_conn, role=role), role)
        with pytest.raises(AppError) as exc:
            await audit_query_service.list_access_logs(staff, conn=db_conn)
        assert exc.value.status_code == 403

    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    result = await audit_query_service.list_access_logs(admin, conn=db_conn)
    assert result is not None and "rows" in result


async def test_행은_마스킹된_채로_나간다(db_conn):
    """[ALOG-LIST-04][MASK-SRV-01] 환자 식별은 서버가 마스킹해 보낸 값이고 응답에 원본이 없다."""
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    pid = await _seed_patient(db_conn)
    await _seed_audit(db_conn, staff_id=admin.id, resource_type="patient_detail", patient_id=pid)

    result = await audit_query_service.list_access_logs(admin, conn=db_conn)
    patient = result["rows"][0]["patient"]

    assert patient["masked_phone"] == mask_phone("01011115678")
    assert patient["masked_birth_date"] == mask_birth_date(date(1958, 4, 12))
    assert "홍길동" not in json.dumps(result["rows"], default=str)
    assert "01011115678" not in json.dumps(result["rows"], default=str)


async def test_환자_없는_사건은_patient가_없다(db_conn):
    """[ALOG-LIST-13][SEARCH-LOG-02] 검색·통계처럼 환자 1명이 아닌 사건은 patient=None이다."""
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    await _seed_audit(db_conn, staff_id=admin.id, resource_type="search", search_term="김 1234")

    result = await audit_query_service.list_access_logs(admin, conn=db_conn)

    assert result["rows"][0]["patient"] is None
    assert result["rows"][0]["search_term"] == "김 1234"


async def test_환자_필터는_그_환자_행만_준다(db_conn):
    """[ALOG-FILTER-02] patient_id 필터는 그 환자를 겨냥한 행만 남긴다."""
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    p1 = await _seed_patient(db_conn, name="홍길동", phone="01011110001")
    p2 = await _seed_patient(db_conn, name="김철수", phone="01011110002")
    await _seed_audit(db_conn, staff_id=admin.id, patient_id=p1)
    await _seed_audit(db_conn, staff_id=admin.id, patient_id=p2)

    result = await audit_query_service.list_access_logs(admin, patient_id=p1, conn=db_conn)

    assert len(result["rows"]) == 1
    assert result["rows"][0]["patient"]["patient_id"] == p1


async def test_기간은_from_포함_to_제외다(db_conn):
    """[ALOG-FILTER-07] 경계가 겹치면 월별 점검에서 같은 행이 두 달에 잡힌다."""
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    aug = datetime(2026, 8, 1, 0, 0, tzinfo=timezone.utc)   # 경계 시작 — 포함
    sep = datetime(2026, 9, 1, 0, 0, tzinfo=timezone.utc)   # 경계 끝 — 제외
    await _seed_audit(db_conn, staff_id=admin.id, resource_type="search",
                      accessed_at=aug, search_term="8월")
    await _seed_audit(db_conn, staff_id=admin.id, resource_type="search",
                      accessed_at=sep, search_term="9월")

    result = await audit_query_service.list_access_logs(
        admin, date_from=aug, date_to=sep, conn=db_conn)

    assert [r["search_term"] for r in result["rows"]] == ["8월"]


async def test_최신순_안정정렬로_나온다(db_conn):
    """[ALOG-LIST-08] accessed_at desc — 가장 최근 열람이 맨 위다."""
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    older = datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc)
    newer = datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc)
    await _seed_audit(db_conn, staff_id=admin.id, resource_type="search",
                      accessed_at=older, search_term="old")
    await _seed_audit(db_conn, staff_id=admin.id, resource_type="search",
                      accessed_at=newer, search_term="new")

    result = await audit_query_service.list_access_logs(admin, conn=db_conn)

    assert [r["search_term"] for r in result["rows"]] == ["new", "old"]


async def test_이어보기_커서로_다음_200건을_준다(db_conn):
    """[ALOG-FILTER-06] 첫 페이지가 200건이면 cursor로 이어보고, 겹치지도 빠지지도 않는다."""
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    base = datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc)
    for i in range(250):
        await _seed_audit(db_conn, staff_id=admin.id, resource_type="search",
                          accessed_at=base.replace(minute=i % 60, second=i // 60),
                          search_term=str(i))

    first = await audit_query_service.list_access_logs(admin, conn=db_conn)
    assert len(first["rows"]) == 200
    assert first["next_cursor"] is not None

    second = await audit_query_service.list_access_logs(
        admin, cursor=first["next_cursor"], conn=db_conn)
    ids = [r["id"] for r in first["rows"]] + [r["id"] for r in second["rows"]]
    assert len(ids) == len(set(ids)) == 250


async def test_search_patients가_검색을_감사에_남긴다(committed_conn):
    """[SEARCH-LOG-01][SEARCH-LOG-04] patient_service.search_patients 호출부가 검색을 남긴다.

    호출부는 이미 배선돼 있다(중복 구현 금지) — 이 화면의 유입 경로가 살아 있음을 못박는다.
    검색은 서비스역할로 커밋되므로 committed_conn으로 확인한다.
    """
    staff = _ctx(await seed_staff(committed_conn, role="receptionist"), "receptionist")

    await patient_service.search_patients("김 1234", staff)

    row = await committed_conn.fetchrow(
        "select patient_id, search_term from access_audit_log "
        "where resource_type = 'search' and staff_id = $1",
        staff.id,
    )
    assert row["patient_id"] is None and row["search_term"] == "김 1234"


async def test_search_log_06_검색은_결과_건수와_조각_수를_남긴다(committed_conn):
    """[SEARCH-LOG-06] 검색 감사에 결과 건수·조각 수를 남긴다 — 넓은 검색 판정의 데이터."""
    staff = _ctx(await seed_staff(committed_conn, role="receptionist"), "receptionist")

    await patient_service.search_patients("김 1234", staff)

    row = await committed_conn.fetchrow(
        "select result_count, fragment_count from access_audit_log "
        "where resource_type = 'search' and staff_id = $1",
        staff.id,
    )
    assert row["fragment_count"] == 2  # '김' '1234' 두 조각
    assert row["result_count"] is not None


async def test_search_log_06_조각하나로_기준이상은_넓은검색이다(db_conn):
    """[SEARCH-LOG-06] 조각 하나(fragment_count=1)로 기준(기본 20) 이상 조회하면 is_wide_search=True."""
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    await _seed_audit(db_conn, staff_id=admin.id, resource_type="search", search_term="1955",
                      result_count=41, fragment_count=1)

    result = await audit_query_service.list_access_logs(admin, conn=db_conn)

    assert result["rows"][0]["is_wide_search"] is True


async def test_search_log_06_이어친_검색은_넓은검색이_아니다(db_conn):
    """[SEARCH-LOG-06] 조각이 둘 이상이면(이어 친 검색=좁히는 중) 넓은 검색이 아니다 — 결과가 많아도."""
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    await _seed_audit(db_conn, staff_id=admin.id, resource_type="search", search_term="김 1234",
                      result_count=50, fragment_count=2)

    result = await audit_query_service.list_access_logs(admin, conn=db_conn)

    assert result["rows"][0]["is_wide_search"] is False


async def test_search_log_06_기준_미만은_넓은검색이_아니다(db_conn):
    """[SEARCH-LOG-06] 조각 하나여도 결과가 기준 미만이면 넓은 검색이 아니다."""
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    await _seed_audit(db_conn, staff_id=admin.id, resource_type="search", search_term="박강",
                      result_count=5, fragment_count=1)

    result = await audit_query_service.list_access_logs(admin, conn=db_conn)

    assert result["rows"][0]["is_wide_search"] is False


async def test_search_log_06_검색_아닌_사건은_넓은검색_아니다(db_conn):
    """[SEARCH-LOG-06] 열람·통계처럼 건수·조각이 없는 사건은 is_wide_search=False."""
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    pid = await _seed_patient(db_conn)
    await _seed_audit(db_conn, staff_id=admin.id, resource_type="patient_detail", patient_id=pid)

    result = await audit_query_service.list_access_logs(admin, conn=db_conn)

    assert result["rows"][0]["is_wide_search"] is False


async def test_통계_감사행은_비개인정보_payload를_노출한다(db_conn):
    """[ALOG-LIST-13][STAT-AUDIT-02] 통계 상세 열람·CSV 내보내기 행은 환자 없이
    지표·기간·대상 건수·억제 여부를 그대로 실어 보낸다(표시 라벨은 프론트).
    """
    admin = _ctx(await seed_staff(db_conn, role="admin"), "admin")
    await db_conn.execute(
        """insert into access_audit_log
             (staff_id, resource_type, patient_id, stats_metric,
              stats_period_from, stats_period_to, stats_target_count,
              stats_csv_rows, stats_suppressed)
           values ($1, 'stats_export', null, 'all', '2026-09-01', '2026-09-30', 6, 6, true)""",
        admin.id,
    )

    result = await audit_query_service.list_access_logs(admin, conn=db_conn)
    row = next(r for r in result["rows"] if r["resource_type"] == "stats_export")

    assert row["patient"] is None
    assert row["stats_metric"] == "all"
    assert row["stats_target_count"] == 6
    assert row["stats_csv_rows"] == 6
    assert row["stats_suppressed"] is True
    assert str(row["stats_period_from"]) == "2026-09-01"
