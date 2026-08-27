"""[Task 21a][MERGE-*] 중복 환자 병합 — 후보 조회·병합 실행(원장·계보·감사).

⭐⭐ 결정 #15(원본 보존 + 계보). 병합은 원본을 물리적으로 옮기거나 덮어쓰지 않는다.
    예약·문진·진료기록·열람기록을 원래 환자 ID에 그대로 두고, 대표를 조회할 때 계보
    (patient_lineage)를 따라 함께 읽는다. 병합이 바꾸는 것은 딱 세 가지다:
      ① 합쳐진 행 is_active = false
      ② 계정 연결(대표가 비어 있을 때만) 이동
      ③ 원장(patient_merges) 한 줄 + 감사 한 줄 — 같은 트랜잭션에서 함께.

⛔ 되돌리기(undo)는 여기서 만들지 않는다 — Task 26(병합 이력 화면)이 소유한다.
   여기는 undone_at 소프트 되돌림 「스키마」까지만 만들어 뒀다(00044).
"""
import json
from uuid import UUID

from pydantic import BaseModel

from app.core.errors import AppError
from app.core.masking import mask_birth_date, mask_phone
from app.core.security import StaffContext
from app.db.pool import acquire_as

# 병합 후보 판정 기준(MERGE-LIST-01): 이름·생년월일·전화가 모두 같은 활성 행.
_COUNT_TABLES = ("appointments", "questionnaires", "medical_records", "access_logs")


class CandidateRow(BaseModel):
    patient_id: UUID
    name: str
    masked_birth_date: str
    masked_phone: str
    account_linked: bool
    is_primary: bool | None = None      # 미리 확정하지 않는다(MERGE-LIST-01)
    counts: dict[str, int]
    last_visit_at: str | None = None


class CandidateGroup(BaseModel):
    key: str
    rows: list[CandidateRow]


class MergeResult(BaseModel):
    merge_id: UUID
    account_link_moved: bool


class _Rejected(Exception):
    """병합 재검사 실패 — 감사 남길 위치(주입 conn / 별도 연결)를 호출부가 정한다."""

    def __init__(self, message: str):
        self.message = message


# ── 건수 스냅샷 ────────────────────────────────────────────────────────────────
# 후보 조회·비교·낙관잠금(MERGE-RACE-01)이 모두 「그 행 자기 데이터의 건수」를 쓴다.
# 병합 전에는 계보가 없으므로 for_patient_id / patient_id 로 그 행만 센다.

async def _counts_for(conn, patient_id: UUID) -> dict[str, int]:
    row = await conn.fetchrow(
        """
        select
          (select count(*) from appointments a where a.for_patient_id = $1) as appointments,
          (select count(*) from questionnaire_responses q
             join appointments a on a.id = q.appointment_id
            where a.for_patient_id = $1) as questionnaires,
          (select count(*) from medical_records m
             join appointments a on a.id = m.appointment_id
            where a.for_patient_id = $1) as medical_records,
          (select count(*) from access_audit_log l where l.patient_id = $1) as access_logs
        """,
        patient_id,
    )
    return {k: int(row[k]) for k in _COUNT_TABLES}


async def _last_visit_at(conn, patient_id: UUID):
    return await conn.fetchval(
        "select max(created_at) from appointments "
        "where for_patient_id = $1 and status = '진료완료'",
        patient_id,
    )


async def snapshot_counts(conn, primary_id: UUID, duplicate_id: UUID) -> dict:
    """MERGE-AUDIT-01 건수 스냅샷 + MERGE-RACE-01 낙관잠금 기준값 — 양쪽 건수를 한 번에."""
    return {
        "primary": await _counts_for(conn, primary_id),
        "merged": await _counts_for(conn, duplicate_id),
    }


# ── 후보 목록 (MERGE-LIST-*) ─────────────────────────────────────────────────

async def list_merge_candidates(staff: StaffContext, conn=None) -> list[CandidateGroup]:
    """[MERGE-LIST-01~03] 이름·생일·전화가 같은 활성 행을 그룹으로 묶어 마스킹해 돌려준다.

    ⭐ 자동으로 대표를 고르지 않는다(is_primary=None). 원본 전화·생일·UUID는 응답에 넣지
       않는다 — 마스킹된 값만(MASK-SRV-01). 가족이 번호를 공유하면 실제로 다른 사람일 수 있다.
    """
    if conn is not None:
        return await _list_on_conn(conn)
    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _list_on_conn(c)


async def _list_on_conn(conn) -> list[CandidateGroup]:
    dup_rows = await conn.fetch(
        """
        select p.id, p.name, p.birth_date, p.phone, p.created_at,
               p.auth_user_id is not null as account_linked
          from patients p
          join (
            select name, birth_date, phone
              from patients
             where is_active
             group by name, birth_date, phone
            having count(*) > 1
          ) dup on dup.name = p.name and dup.birth_date = p.birth_date and dup.phone = p.phone
         where p.is_active
        """
    )

    groups: dict[tuple, list] = {}
    for r in dup_rows:
        counts = await _counts_for(conn, r["id"])
        last_visit = await _last_visit_at(conn, r["id"])
        groups.setdefault((r["name"], r["birth_date"], r["phone"]), []).append(
            {
                "row": CandidateRow(
                    patient_id=r["id"],
                    name=r["name"],
                    masked_birth_date=mask_birth_date(r["birth_date"]),
                    masked_phone=mask_phone(r["phone"]),
                    account_linked=r["account_linked"],
                    counts=counts,
                    last_visit_at=last_visit.isoformat() if last_visit else None,
                ),
                "created_at": r["created_at"],
                "record_count": sum(counts.values()),
            }
        )

    out: list[CandidateGroup] = []
    for key in sorted(groups, key=lambda k: (k[0], str(k[1]), k[2])):
        members = groups[key]
        # [MERGE-LIST-02] 기록 수 desc → created_at asc → id asc. 마지막 키가 순서를 고정한다.
        members.sort(key=lambda m: (-m["record_count"], m["created_at"], str(m["row"].patient_id)))
        out.append(CandidateGroup(
            key=f"{key[0]}·{mask_birth_date(key[1])}·{mask_phone(key[2])}",
            rows=[m["row"] for m in members],
        ))
    return out


# ── 병합 실행 (MERGE-DATA-*·STATE-04·RACE-01·AUDIT-01) ────────────────────────

async def merge_patients(primary_id: UUID, duplicate_id: UUID,
                         staff: StaffContext, expected: dict, conn=None) -> MergeResult:
    """[결정 #15] 원본을 옮기지 않는다. 합쳐진 행 비활성 + 계정 연결(대표가 비었을 때만) +
    원장/감사 한 줄을 같은 트랜잭션에 넣는다. 재검사(MERGE-RACE-01)·이중 계정(MERGE-STATE-04)은
    두 행을 for update로 잠근 뒤 다시 읽어서 판정한다."""
    if conn is not None:
        # 주입 conn(테스트/호출자 트랜잭션): 거절 감사도 이 conn에 남겨 같은 트랜잭션에서 보이게 한다.
        try:
            return await _merge_core(conn, primary_id, duplicate_id, staff, expected)
        except _Rejected as r:
            await _log_merge(conn, staff, primary_id, None)
            raise AppError(r.message, status_code=409)

    async with acquire_as(str(staff.auth_user_id)) as c:
        try:
            async with c.transaction():
                return await _merge_core(c, primary_id, duplicate_id, staff, expected)
        except _Rejected as r:
            # 위 트랜잭션은 롤백됐다(합쳐진 것 없음). 거절 감사는 별도 연결로 커밋해 남긴다 —
            # 실패만 기록이 사라지면 「누가 무엇을 시도했나」가 없어진다(요구사항 :437).
            await _log_merge(None, staff, primary_id, None)
            raise AppError(r.message, status_code=409)


async def _merge_core(conn, primary_id: UUID, duplicate_id: UUID,
                      staff: StaffContext, expected: dict) -> MergeResult:
    rows = await conn.fetch(
        "select id, is_active, auth_user_id from patients where id = any($1::uuid[]) for update",
        [primary_id, duplicate_id],
    )
    by_id = {r["id"]: r for r in rows}

    # [MERGE-RACE-01] 두 행이 살아 있고, 관리자가 본 건수와 지금이 같아야 실행한다.
    if (primary_id not in by_id or duplicate_id not in by_id
            or not by_id[primary_id]["is_active"] or not by_id[duplicate_id]["is_active"]
            or await snapshot_counts(conn, primary_id, duplicate_id) != expected):
        raise _Rejected("후보 상태가 바뀌었습니다. 목록과 기록 건수를 다시 확인하세요.")

    # [MERGE-STATE-04] 두 행 모두 계정이면 하나를 버리는 셈이라 사람이 정해야 한다.
    if by_id[primary_id]["auth_user_id"] and by_id[duplicate_id]["auth_user_id"]:
        raise _Rejected("두 기록 모두 계정이 연결되어 있어 자동 병합할 수 없습니다.")

    moved = False
    if not by_id[primary_id]["auth_user_id"] and by_id[duplicate_id]["auth_user_id"]:
        # [MERGE-COMPARE-04] 대표가 비었을 때만 계정을 옮긴다. unique(auth_user_id)를 어기지
        # 않도록 합쳐진 쪽을 먼저 비우고 대표에 채운다.
        dup_auth = by_id[duplicate_id]["auth_user_id"]
        await conn.execute("update patients set auth_user_id = null where id = $1", duplicate_id)
        await conn.execute("update patients set auth_user_id = $2 where id = $1",
                           primary_id, dup_auth)
        moved = True

    await conn.execute("update patients set is_active = false where id = $1", duplicate_id)

    merge_id = await conn.fetchval(
        """insert into patient_merges
             (primary_patient_id, merged_patient_id, performed_by, counts_snapshot,
              account_link_moved)
           values ($1, $2, $3, $4, $5) returning id""",
        primary_id, duplicate_id, staff.id, json.dumps(expected), moved,
    )
    await _log_merge(conn, staff, primary_id, merge_id)
    return MergeResult(merge_id=merge_id, account_link_moved=moved)


async def _log_merge(conn, staff: StaffContext, patient_id: UUID, merge_id: UUID | None) -> None:
    """[MERGE-AUDIT-01] 병합 사건을 남긴다 — 대표를 patient_id로, 어느 병합인지를 resource_id로.
    성공은 resource_id = merge.id, 거절은 resource_id = null. conn=None이면 별도 연결로 커밋한다.
    """
    sql = ("insert into access_audit_log (staff_id, patient_id, resource_type, resource_id) "
           "values ($1, $2, 'patient_merge', $3)")
    if conn is not None:
        await conn.execute(sql, staff.id, patient_id, merge_id)
        return
    async with acquire_as(str(staff.auth_user_id)) as c:
        await c.execute(sql, staff.id, patient_id, merge_id)
