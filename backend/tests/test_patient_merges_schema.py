"""[Task 21a][MERGE-*] 00044 병합 원장·계보·감사 스키마.

⭐ 결정 #15(원본 보존 + 계보) — 원본을 물리적으로 옮기지 않고, 이 표 하나가 「병합 원장」이자
   「계보」다. 되돌림은 undone_at 하나로 계보에서 저절로 빠진다(지우지 않는다 — 감사가 남아야 한다).

⚠️ 실제 스키마 주의(플랜 SQL과 다름):
- access_audit_log에는 result/reason 칸이 없다 — 병합/거절은 resource_id 유무로 구분한다.
- patients.auth_user_id(계정 연결)는 3단계 미구현이라 없었다 → 00044가 병합의 첫 소비자로 신설한다(이월).
"""
import uuid
from datetime import date

import asyncpg
import pytest

from tests.conftest import seed_staff


async def _seed_patient(conn, name="김민서", birth=date(1990, 5, 14),
                        gender="F", phone="01043218765"):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ($1, $2, $3, $4) returning id",
        name, birth, gender, phone,
    )


async def _insert_merge(conn, performed_by, primary, merged):
    return await conn.fetchval(
        "insert into patient_merges "
        "(primary_patient_id, merged_patient_id, performed_by, counts_snapshot) "
        "values ($1, $2, $3, $4) returning id",
        primary, merged, performed_by, "{}",
    )


async def test_감사표가_어느_병합인지_가리킬_수_있다(db_conn):
    """[MERGE-AUDIT-01][ALOG-LIST-12] resource_id가 없으면 merge 행이 「떠 있는」 사건이 된다.

    00034가 사건 종류에 patient_merge를 넣어 뒀지만 가리킬 대상이 없었다 — 00044가 연다.
    """
    cols = await db_conn.fetch(
        "select column_name from information_schema.columns "
        "where table_name = 'access_audit_log'")
    assert "resource_id" in {c["column_name"] for c in cols}


async def test_병합_원장은_같은_두_환자를_두_번_기록하지_않는다(db_conn):
    """[MERGE-RACE-01] 되돌리지 않은 병합이 있는 환자를 또 병합하면 계보가 갈라진다."""
    admin = await seed_staff(db_conn, role="admin")
    a = await _seed_patient(db_conn, phone="01011112222")
    b = await _seed_patient(db_conn, phone="01011112222")
    await _insert_merge(db_conn, admin["staff_id"], a, b)
    with pytest.raises(asyncpg.UniqueViolationError):
        await _insert_merge(db_conn, admin["staff_id"], a, b)


async def test_합쳐진_환자는_다른_병합의_대표가_될_수_없다(db_conn):
    """[MERGE-RACE-01] merged 쪽이 또 다른 병합의 primary가 되면 계보가 나무가 아니라 그물이 된다."""
    admin = await seed_staff(db_conn, role="admin")
    a = await _seed_patient(db_conn, phone="01011112222")
    b = await _seed_patient(db_conn, phone="01011112222")
    c = await _seed_patient(db_conn, phone="01011112222")
    await _insert_merge(db_conn, admin["staff_id"], a, b)
    await _insert_merge(db_conn, admin["staff_id"], a, c)   # a가 둘의 대표인 것은 허용
    with pytest.raises(asyncpg.UniqueViolationError):
        await _insert_merge(db_conn, admin["staff_id"], c, b)  # 이미 merged된 b를 또 merged


async def test_자기_자신과는_병합할_수_없다(db_conn):
    """[MERGE-STATE-04 방어] primary=merged면 계보가 자기를 무한 참조한다."""
    admin = await seed_staff(db_conn, role="admin")
    a = await _seed_patient(db_conn)
    with pytest.raises(asyncpg.CheckViolationError):
        await _insert_merge(db_conn, admin["staff_id"], a, a)


async def test_되돌린_병합은_같은_쌍을_다시_병합할_수_있다(db_conn):
    """[MERGE-UNDO-01] 되돌림이 「없던 일」이 되지 않으면 오병합 정정 뒤 재병합이 막힌다."""
    admin = await seed_staff(db_conn, role="admin")
    a = await _seed_patient(db_conn, phone="01011112222")
    b = await _seed_patient(db_conn, phone="01011112222")
    merge_id = await _insert_merge(db_conn, admin["staff_id"], a, b)
    await db_conn.execute(
        "update patient_merges set undone_at = now(), undone_by = $2, undo_reason = '오병합' "
        "where id = $1", merge_id, admin["staff_id"])
    await _insert_merge(db_conn, admin["staff_id"], a, b)   # 예외 없이 통과해야 한다


async def test_되돌림_세_칸은_함께_채워지거나_함께_비어야_한다(db_conn):
    """[MERGE-UNDO-01] 사유 없는 되돌림·실행자 없는 되돌림을 막는다(결정 #16)."""
    admin = await seed_staff(db_conn, role="admin")
    a = await _seed_patient(db_conn, phone="01011112222")
    b = await _seed_patient(db_conn, phone="01011112222")
    merge_id = await _insert_merge(db_conn, admin["staff_id"], a, b)
    with pytest.raises(asyncpg.CheckViolationError):
        await db_conn.execute(
            "update patient_merges set undone_at = now() where id = $1", merge_id)


async def test_계보는_대표에서_합쳐진_ID를_전부_돌려준다(db_conn):
    """[MERGE-DATA-01~03] 원본을 안 옮기기로 했으므로(결정 #15) 조회가 계보를 따라야 한다.

    ⚠️ 병합이 이어질 수 있다 — B를 A에 합치고 C를 A에 합치면 A는 셋을 읽어야 한다.
    """
    admin = await seed_staff(db_conn, role="admin")
    a = await _seed_patient(db_conn, phone="01011112222")
    b = await _seed_patient(db_conn, phone="01011112222")
    c = await _seed_patient(db_conn, phone="01011112222")
    await _insert_merge(db_conn, admin["staff_id"], a, b)
    await _insert_merge(db_conn, admin["staff_id"], a, c)
    ids = await db_conn.fetchval("select public.patient_lineage($1)", a)
    assert set(ids) == {a, b, c}


async def test_되돌린_병합은_계보에서_빠진다(db_conn):
    """[MERGE-UNDO-01] undone_at 하나로 계보가 되돌려진다 — 지우지 않는다(감사가 남아야 한다)."""
    admin = await seed_staff(db_conn, role="admin")
    a = await _seed_patient(db_conn, phone="01011112222")
    b = await _seed_patient(db_conn, phone="01011112222")
    merge_id = await _insert_merge(db_conn, admin["staff_id"], a, b)
    await db_conn.execute(
        "update patient_merges set undone_at = now(), undone_by = $2, undo_reason = '오병합' "
        "where id = $1", merge_id, admin["staff_id"])
    ids = await db_conn.fetchval("select public.patient_lineage($1)", a)
    assert set(ids) == {a}


async def test_patients에_계정_연결_칸이_생긴다(db_conn):
    """[MERGE-COMPARE-04][MERGE-STATE-04] 계정 연결 여부를 알 칸이 있어야 한다.

    patients.auth_user_id는 3단계(환자 앱)가 정식화하지만, 병합이 첫 소비자라 00044가 신설한다.
    """
    cols = await db_conn.fetch(
        "select column_name from information_schema.columns where table_name = 'patients'")
    assert "auth_user_id" in {c["column_name"] for c in cols}
