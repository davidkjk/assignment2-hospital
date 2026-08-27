"""[Task 22a][QADM-*] 관리자 문진표 관리 — 결정 12(불변 버전) · AD-065·AD-066(삭제·숨김·이름 없음).

⛔ 이 모듈에 **답변을 읽는 함수를 만들지 않는다**(결정 #14 / AD-050). DB RLS(00035)가 막지만,
   여기 함수가 생기는 순간 다음 사람이 화면에 붙인다. 관리자는 「양식」만 관리하고 「답변」은 못 본다.

검증은 전부 서버에서 다시 한다 — 화면 검증은 안내이지 방어가 아니다. 저장은 upsert가 아니라
save_questionnaire_version(00046)이 새 불변 버전을 만들어 즉시 활성화한다(옛 버전은 읽기 전용 보존).
"""
import json
from contextlib import asynccontextmanager
from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.core.security import StaffContext
from app.db.pool import acquire_as

# ⭐ 3단계 환자 앱이 같은 값을 읽는다(QNR-TYPE-*·QNR-SHOW-*). 어기면 저장은 됐는데
#    환자 화면이 못 그리는 문항이 생긴다.
QUESTION_TYPES = ("short_text", "long_text", "yes_no")
SHOW_TO = ("all", "female", "male")
MAX_QUESTIONS = 30


def next_question_id(used_ids) -> str:
    """한 번도 쓴 적 없는 문항 ID를 만든다 (QNR-ID-07: 재사용 금지).

    번호를 세는 방식이 아니라 **쓴 적 있는 것 전부**를 피한다 — 지운 문항의 ID도 영원히
    피해야 하므로, 「현재 문항 수 + 1」로 만들면 반드시 충돌한다.
    """
    used = set(used_ids)
    n = len(used) + 1
    while f"Q-{n:04d}" in used:
        n += 1
    return f"Q-{n:04d}"


def _require_admin(staff: StaffContext) -> None:
    if staff.role != "admin":
        # QADM-SHELL-02: 메뉴를 숨기는 것은 안내이지 방어가 아니다.
        raise AppError("이 화면을 볼 권한이 없습니다.", status_code=403)


@asynccontextmanager
async def _conn_ctx(staff: StaffContext, conn):
    """주입 conn(테스트/호출자 트랜잭션)이 있으면 그대로, 없으면 인증 사용자 경로로 연다."""
    if conn is not None:
        yield conn
    else:
        async with acquire_as(str(staff.auth_user_id)) as c:
            yield c


def _validate(questions: list[dict], used_ids_before: set[str], current_ids: set[str]) -> None:
    if len(questions) > MAX_QUESTIONS:
        raise AppError(f"최대 {MAX_QUESTIONS}문항까지입니다.", status_code=400)

    seen: set[str] = set()
    for q in questions:
        qid = q.get("id")
        if not qid:
            raise AppError("문항 ID가 없습니다.", status_code=400)
        if qid in seen:
            raise AppError("문항 ID가 겹칩니다.", status_code=400)
        seen.add(qid)
        if q.get("type") not in QUESTION_TYPES:
            raise AppError("질문 종류가 올바르지 않습니다.", status_code=400)
        if q.get("show_to") not in SHOW_TO:
            raise AppError("보일 대상이 올바르지 않습니다.", status_code=400)
        if not str(q.get("text", "")).strip():
            raise AppError("질문 문구가 비어 있습니다.", status_code=400)
        # QNR-ID-07: 예전에 쓰였다가 지금 양식엔 없는 ID를 다시 데려오는 것을 막는다.
        if qid in used_ids_before and qid not in current_ids:
            raise AppError("지운 문항의 ID는 다시 쓸 수 없습니다.", status_code=400)


def _ids_from_rows(rows) -> set[str]:
    return {q["id"] for row in rows for q in json.loads(row["questions"]) if q.get("id")}


async def list_departments_with_status(staff: StaffContext, conn=None) -> list[dict]:
    """[QADM-DEPT-01·04] 진료과 목록 — 이름 asc, id asc 고정. 양식 없는 진료과도 뺀 없이 보인다.

    active_version은 현재 활성 버전 번호(없으면 None), question_count는 그 버전의 문항 수(없으면 0).
    """
    _require_admin(staff)
    async with _conn_ctx(staff, conn) as c:
        rows = await c.fetch(
            """
            select d.id, d.name, t.version_no as active_version,
                   coalesce(jsonb_array_length(t.questions), 0) as question_count
              from departments d
              left join questionnaire_templates t
                on t.department_id = d.id and t.is_active
             order by d.name asc, d.id asc
            """
        )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "active_version": r["active_version"],
            "question_count": r["question_count"],
        }
        for r in rows
    ]


def _version_summary(row) -> dict:
    """[QADM-VERSION-03] 버전 기록 한 줄 — 번호·시각·직원·문항 수만. 답변 수·원문은 안 끌어온다."""
    return {
        "id": row["id"],
        "version_no": row["version_no"],
        "is_active": row["is_active"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        # QADM-SAVE-06: 직원이 지워졌어도 행을 숨기지 않고 「직원 정보 없음」으로 남긴다.
        "created_by_name": row["created_by_name"] or "직원 정보 없음",
        "question_count": len(json.loads(row["questions"])),
    }


async def get_department_form(department_id: UUID, staff: StaffContext, conn=None) -> dict:
    """[QADM-DEPT-02] 한 진료과의 현재 활성 버전·편집 문항·버전 기록을 함께 돌려준다."""
    _require_admin(staff)
    async with _conn_ctx(staff, conn) as c:
        dept = await c.fetchrow("select id, name from departments where id = $1", department_id)
        if dept is None:
            raise AppError("진료과를 찾을 수 없습니다.", status_code=404)
        rows = await c.fetch(
            """
            select t.id, t.version_no, t.is_active, t.created_at, t.questions,
                   s.name as created_by_name
              from questionnaire_templates t
              left join staff s on s.id = t.created_by
             where t.department_id = $1
             order by t.version_no desc
            """,
            department_id,
        )

    versions = [_version_summary(r) for r in rows]
    active = next((r for r in rows if r["is_active"]), None)
    return {
        "department_id": dept["id"],
        "department_name": dept["name"],
        "active_version": {
            "id": active["id"],
            "version_no": active["version_no"],
            "questions": json.loads(active["questions"]),
        } if active is not None else None,
        "versions": versions,
    }


async def get_version(version_id: UUID, staff: StaffContext, conn=None) -> dict:
    """[QADM-VERSION-04] 한 버전의 전체 내용(문항 포함) — 읽기 전용 미리보기·저장 응답에 쓴다."""
    _require_admin(staff)
    async with _conn_ctx(staff, conn) as c:
        row = await c.fetchrow(
            """
            select t.id, t.department_id, t.version_no, t.is_active, t.created_at, t.questions,
                   s.name as created_by_name
              from questionnaire_templates t
              left join staff s on s.id = t.created_by
             where t.id = $1
            """,
            version_id,
        )
    if row is None:
        raise AppError("문진표 버전을 찾을 수 없습니다.", status_code=404)
    return {
        "id": row["id"],
        "department_id": row["department_id"],
        "version_no": row["version_no"],
        "is_active": row["is_active"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "created_by_name": row["created_by_name"] or "직원 정보 없음",
        "questions": json.loads(row["questions"]),
    }


async def save_version(department_id: UUID, questions: list[dict], base_version_id,
                       staff: StaffContext, conn=None) -> dict:
    """[QADM-VERSION-01][QADM-SAVE-05] 새 불변 버전을 만들어 즉시 활성화한다(옛 버전 보존).

    덮어쓰지 않는다 — save_questionnaire_version(00046)이 「옛 버전 내리기 + 새 버전 올리기」를
    한 트랜잭션에 넣고, base_version_id로 낙관적 잠금(P-07)도 함께 본다.
    """
    _require_admin(staff)
    async with _conn_ctx(staff, conn) as c:
        # 재사용 금지(QNR-ID-07) 판정용으로 이 진료과가 지금까지 쓴 모든 ID / 현재 활성 ID를 모은다.
        all_rows = await c.fetch(
            "select questions from questionnaire_templates where department_id = $1", department_id)
        active_rows = await c.fetch(
            "select questions from questionnaire_templates where department_id = $1 and is_active",
            department_id)
        _validate(questions, _ids_from_rows(all_rows), _ids_from_rows(active_rows))

        try:
            version_id = await c.fetchval(
                "select save_questionnaire_version($1, $2::jsonb, $3, $4)",
                department_id, json.dumps(questions), base_version_id, staff.id,
            )
        except asyncpg.SerializationError:
            # QADM-SAVE-05 / P-07 — 화면이 「최신을 불러오기」를 그릴 수 있어야 한다.
            raise AppError("다른 관리자가 먼저 저장했습니다. 최신 문진표를 불러오세요.", status_code=409)

        return await get_version(version_id, staff, conn=c)
