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

from app.core.dto import patient_row_dto
from app.core.errors import AppError
from app.core.masking import mask_birth_date, mask_phone
from app.core.pagination import Page, paginate
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
          -- 결정 #14로 관리자는 문진 답변을 못 읽어 RLS가 이 카운트를 0으로 만든다(00035).
          -- 보존 스냅샷은 '건수'만 필요하므로 count(*)만 돌려주는 정의자 함수로 실제 건수를 센다(00052).
          count_questionnaire_responses_for($1) as questionnaires,
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


# ── 병합 이력·되돌림 (Task 26 · MHIST-*) ─────────────────────────────────────────
# ⭐ 되돌리기 API는 이 자리가 소유한다(결정 #16). Task 21은 스키마(undone_at)까지만 뒀다.
#    되돌림은 「지우기」가 아니다(결정 #15) — undone_at 하나를 채우면 patient_lineage가
#    where undone_at is null이라 계보에서 저절로 빠진다. 원본 행은 하나도 안 지운다.
#
# ⚠️ 계약 정정(플랜↔코드 드리프트): 타임스탬프 칸은 performed_at이다(플랜 스니펫의 merged_at은
#    틀림) — 락 판정·정렬 SQL은 performed_at을 쓰되, 출력 DTO 필드명과 paginate order 라벨은
#    merged_at으로 맞춘다(Task 15·화면 계약). medical_records엔 patient_id 칸이 없어(00006)
#    락 판정은 appointments.for_patient_id 조인으로 센다(플랜 스니펫의 where patient_id=$1은 틀림).


class MergeUndoLocked(AppError):
    """[MHIST-LOCK-01] 병합 뒤 대표에 새 진료기록이 생겨 되돌릴 수 없는 상태(409)."""

    def __init__(self, reason: str):
        super().__init__(reason, status_code=409)
        self.lock_reason = reason


def _undo_status(row, has_new_primary_records: bool) -> str:
    if row["undone_at"] is not None:
        return "undone"
    if has_new_primary_records:
        return "locked"
    return "undoable"


async def _new_primary_records_since(conn, primary_id: UUID, performed_at) -> str | None:
    """[MHIST-LOCK-01] 병합 뒤 대표 환자에 생긴 새 진료기록이 있으면 잠금 사유 문구를 돌려준다.

    ⚠️ medical_records엔 patient_id 칸이 없다(00006) — appointment의 for_patient_id로 그 환자
       것을 세고, created_at > performed_at(병합 시각)으로 「병합 뒤」를 가른다.
    """
    n = await conn.fetchval(
        """
        select count(*) from medical_records m
          join appointments a on a.id = m.appointment_id
         where a.for_patient_id = $1 and m.created_at > $2
        """,
        primary_id, performed_at,
    )
    return f"병합 뒤 대표 환자에 새 진료기록 {n}건이 생겨 되돌릴 수 없습니다" if n else None


async def _party_dto(conn, patient_id) -> dict:
    """[MHIST-DETAIL-01] 상세도 목록과 같은 마스킹 DTO로 대표·대상을 싣는다(patient_id + 표시명).

    ⚠️ 목록(_history_row)은 이 DTO를 담는데 상세(get_merge_event)는 빠뜨려 화면이 ev.primary.name을
       못 읽고 깨졌다(테스트가 목킹해 잠복). 목록과 같은 형태로 맞춘다.
    """
    p = await conn.fetchrow(
        "select id, name, phone, birth_date from patients where id = $1", patient_id)
    return patient_row_dto(patient_id=p["id"], name=p["name"],
                           phone=p["phone"], birth_date=p["birth_date"])


async def _history_row(conn, r) -> dict:
    """[MHIST-LIST-01] 한 이력 행 — 대표/대상은 마스킹 DTO로, 상태만 준다(즉시 되돌림 버튼 없음).

    id는 paginate 앵커·정렬 키로, merge_event_id는 화면 이동용으로 같은 값을 둘 다 담는다.
    merged_at은 실제 performed_at 값을 담아 정렬 라벨(merged_at desc)과 이름을 맞춘다.
    """
    lock = await _new_primary_records_since(conn, r["primary_patient_id"], r["performed_at"])
    return {
        "id": r["id"],
        "merge_event_id": r["id"],
        "merged_at": r["performed_at"],
        "executed_by": r["executed_by"],
        "status": _undo_status(r, lock is not None),
        "primary": patient_row_dto(patient_id=r["primary_patient_id"], name=r["primary_name"],
                                   phone=r["primary_phone"], birth_date=r["primary_birth"]),
        "merged": patient_row_dto(patient_id=r["merged_patient_id"], name=r["merged_name"],
                                  phone=r["merged_phone"], birth_date=r["merged_birth"]),
    }


_HISTORY_SQL = """
    select m.id, m.performed_at, m.undone_at,
           m.primary_patient_id, m.merged_patient_id,
           s.name as executed_by,
           pp.name as primary_name, pp.phone as primary_phone, pp.birth_date as primary_birth,
           mp.name as merged_name, mp.phone as merged_phone, mp.birth_date as merged_birth
      from patient_merges m
      left join staff s on s.id = m.performed_by
      left join patients pp on pp.id = m.primary_patient_id
      left join patients mp on mp.id = m.merged_patient_id
     order by m.performed_at desc, m.id desc
"""
# MHIST-LIST-02·03: 정렬 라벨은 merged_at desc, id desc 하나로 못 박는다(paginate가 이 라벨로
# 커서를 만들고 재검증한다). 실제 SQL은 performed_at으로 정렬하되 라벨은 merged_at으로 맞춘다.
_HISTORY_ORDER = ("merged_at desc", "id desc")


async def get_merge_history(staff: StaffContext, cursor: str | None = None, conn=None) -> Page:
    """[MHIST-LIST-01·02][MHIST-EXC-01] 관리자만 — 병합 이력을 최신순으로, 상태만 붙여 돌려준다."""
    if staff.role != "admin":
        # MHIST-EXC-01: 메뉴 노출이 아니라 서버가 거절한다(형제 audit_query_service와 같은 관례).
        raise AppError("이 기능에 대한 권한이 없습니다.", status_code=403)

    async def _run(c):
        fetched = await c.fetch(_HISTORY_SQL)
        return [await _history_row(c, r) for r in fetched]

    if conn is not None:
        rows = await _run(conn)
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            rows = await _run(c)
    return paginate(rows, cursor=cursor, order=_HISTORY_ORDER)


async def get_merge_event(merge_event_id: UUID, staff: StaffContext, conn=None) -> dict:
    """[MHIST-DETAIL-02][MHIST-LOCK-01] 한 병합 + 보존 스냅샷(원본 건수·계보) + 되돌림 가능 판정."""
    if staff.role != "admin":
        raise AppError("이 기능에 대한 권한이 없습니다.", status_code=403)

    async def _run(c):
        row = await c.fetchrow("select * from patient_merges where id = $1", merge_event_id)
        if row is None:
            raise AppError("병합 이력을 찾을 수 없습니다.", status_code=404)
        lineage = await c.fetchval("select patient_lineage($1)", row["primary_patient_id"]) or []
        lock = await _new_primary_records_since(c, row["primary_patient_id"], row["performed_at"])
        return {
            "merge_event_id": row["id"],
            "merged_at": row["performed_at"],
            "executed_by": await c.fetchval(
                "select name from staff where id = $1", row["performed_by"]),
            "undo_status": _undo_status(row, lock is not None),
            "lock_reason": lock,
            "preservation": {
                # 결정 #15: 원본은 삭제되지 않는다 — 각 행 자기 데이터 건수를 읽기 전용으로 보여준다.
                "primary": await _counts_for(c, row["primary_patient_id"]),
                "merged": await _counts_for(c, row["merged_patient_id"]),
                "lineage_active": row["merged_patient_id"] in lineage,
            },
            # MHIST-DETAIL-01: 화면이 대표→대상 이름·patient_id를 읽는다(목록과 같은 마스킹 DTO).
            "primary": await _party_dto(c, row["primary_patient_id"]),
            "merged": await _party_dto(c, row["merged_patient_id"]),
        }

    if conn is not None:
        return await _run(conn)
    async with acquire_as(str(staff.auth_user_id)) as c:
        return await _run(c)


async def undo_merge(merge_event_id: UUID, reason: str, staff: StaffContext,
                     expected_status: str, conn=None) -> dict:
    """[MHIST-DONE-01][MERGE-RACE-01][결정 #15~17] undone_at 하나로 계보를 정정하고 되돌림 감사를
    같은 트랜잭션에 남긴다. 원본은 하나도 안 지운다.

    expected_status는 화면이 본 상태지만 신뢰하지 않는다 — 확정 때 행을 for update로 잠그고
    최신 상태를 다시 검사한다(MERGE-RACE-01). conn 주입 시엔 호출자 트랜잭션이 원자성을 보장한다
    (merge_patients와 같은 패턴).
    """
    if staff.role != "admin":
        raise AppError("관리자만 병합을 되돌릴 수 있습니다.", status_code=403)
    if not (1 <= len(reason.strip()) <= 200):
        # 코드베이스에 ValidationError가 없어 AppError(400)로 검증 실패를 표현한다.
        raise AppError("되돌림 사유는 1~200자로 입력해 주세요.", status_code=400)

    if conn is not None:
        return await _undo_core(conn, merge_event_id, reason, staff)
    async with acquire_as(str(staff.auth_user_id)) as c:
        async with c.transaction():
            return await _undo_core(c, merge_event_id, reason, staff)


async def _undo_core(conn, merge_event_id: UUID, reason: str, staff: StaffContext) -> dict:
    # MERGE-RACE-01: 확인창을 연 사이 다른 관리자가 먼저 처리했을 수 있어 행을 잠그고 다시 읽는다.
    row = await conn.fetchrow(
        "select * from patient_merges where id = $1 for update", merge_event_id)
    if row is None:
        raise AppError("병합 이력을 찾을 수 없습니다.", status_code=404)
    if row["undone_at"] is not None:
        # MHIST-EXC-05: 이미 되돌린 것은 409. 사유를 중복 감사로 남기지 않는다(여기서 바로 끝낸다).
        raise AppError("이미 되돌림 처리된 병합입니다.", status_code=409)
    lock = await _new_primary_records_since(conn, row["primary_patient_id"], row["performed_at"])
    if lock:
        raise MergeUndoLocked(lock)                                              # MHIST-LOCK-01

    reason = reason.strip()
    await conn.execute(
        """update patient_merges set undone_at = now(), undone_by = $2, undo_reason = $3
           where id = $1""", merge_event_id, staff.id, reason)
    # 결정 #17: 별도 되돌림 감사. 긴 형 patient_merge_undo(짧은 형은 Task 15 화면이 못 찾는다).
    # ⚠️ log_access는 resource_id 인자가 없어 못 쓴다 — _log_merge 방식으로 직접 insert하고,
    #    되돌림과 같은 트랜잭션에 넣어 「되돌림은 됐는데 감사만 실패」하는 창을 없앤다(요구사항 :437).
    await conn.execute(
        """insert into access_audit_log (staff_id, patient_id, resource_type, resource_id, search_term)
           values ($1, $2, 'patient_merge_undo', $3, $4)""",
        staff.id, row["primary_patient_id"], merge_event_id, reason)
    return {"status": "undone", "merge_event_id": merge_event_id}
