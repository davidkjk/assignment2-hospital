"""[PTDET-VISIT-07][DOCTOR-HISTORY-02][R5-02][PTDET-FAMILY-04·05][R5-06][PTDET-NOTE-01·04]
환자 하위 이력 — 방문·진료기록·가족·자격 재판정·내부 메모.

⭐ 이력 목록은 전부 공용 커서(core.pagination)와 마스킹 경계(core.dto)를 쓴다 — 계약을
   두 벌 만들면 한쪽만 고쳐지고 아무도 모른다(SEARCH-ORDER-05).
"""
from dataclasses import dataclass
from uuid import UUID

from app.core.dto import patient_row_dto
from app.core.pagination import Page, paginate
from app.core.security import StaffContext
from app.db.pool import acquire_as

# 방문/기록의 발생 시각: 슬롯이 있으면 슬롯 일시(KST), 없으면 생성 시각.
_OCCURRED = "coalesce((s.slot_date + s.start_time) at time zone 'Asia/Seoul', {fallback})"


@dataclass
class EligibilityResult:
    allowed: bool
    message: str


async def _dispatch(staff: StaffContext, conn, fn):
    if conn is not None:
        return await fn(conn)
    async with acquire_as(str(staff.auth_user_id)) as c:
        return await fn(c)


def _visit_row(r) -> dict:
    return patient_row_dto(
        patient_id=r["for_patient_id"], name=r["name"], phone=r["phone"], birth_date=r["birth_date"],
        id=r["id"], occurred_at=r["occurred_at"], status=r["status"],
    )


async def get_visits(patient_id: UUID, staff: StaffContext, *, cursor=None, conn=None) -> Page:
    """[PTDET-VISIT-07][R5-06] 방문 이력 — 공용 이어받기 + 마스킹된 값만."""
    async def _run(c):
        return await c.fetch(
            f"""
            select a.id, a.for_patient_id, a.status, p.name, p.phone, p.birth_date,
                   {_OCCURRED.format(fallback='a.created_at')} as occurred_at
            from appointments a
            join patients p on p.id = a.for_patient_id
            left join appointment_slots s on s.id = a.slot_id
            where a.for_patient_id = $1
            """,
            patient_id,
        )

    fetched = await _dispatch(staff, conn, _run)
    return paginate([_visit_row(r) for r in fetched], cursor=cursor, order="occurred_at desc")


async def get_medical_records(patient_id: UUID, staff: StaffContext, *, cursor=None, conn=None) -> Page:
    """[DOCTOR-HISTORY-02] 진료기록 이력 — 방문과 같은 공용 부품·같은 정렬 계약."""
    async def _run(c):
        return await c.fetch(
            f"""
            select mr.id, a.for_patient_id, p.name, p.phone, p.birth_date,
                   mr.diagnosis, mr.is_completed,
                   {_OCCURRED.format(fallback='mr.created_at')} as occurred_at
            from medical_records mr
            join appointments a on a.id = mr.appointment_id
            join patients p on p.id = a.for_patient_id
            left join appointment_slots s on s.id = a.slot_id
            where a.for_patient_id = $1
            """,
            patient_id,
        )

    fetched = await _dispatch(staff, conn, _run)
    rows = [
        patient_row_dto(
            patient_id=r["for_patient_id"], name=r["name"], phone=r["phone"], birth_date=r["birth_date"],
            id=r["id"], occurred_at=r["occurred_at"], diagnosis=r["diagnosis"], is_completed=r["is_completed"],
        )
        for r in fetched
    ]
    return paginate(rows, cursor=cursor, order="occurred_at desc")


async def get_family(patient_id: UUID, staff: StaffContext, *, conn=None) -> list[dict]:
    """[R5-02] 활성 링크만 — 해제한 연결이 계속 보이면 '연결을 끊었다'가 거짓이 된다."""
    async def _run(c):
        return await c.fetch(
            """
            select l.id, l.relation, l.family_patient_id, p.name, p.phone, p.birth_date
            from patient_family_links l
            join patients p on p.id = l.family_patient_id
            where l.account_patient_id = $1 and l.is_active
            order by p.name
            """,
            patient_id,
        )

    fetched = await _dispatch(staff, conn, _run)
    return [
        patient_row_dto(
            patient_id=r["family_patient_id"], name=r["name"], phone=r["phone"], birth_date=r["birth_date"],
            id=r["id"], relation=r["relation"],
        )
        for r in fetched
    ]


async def verify_family_eligibility(
    account_patient_id: UUID, member_patient_id: UUID, staff: StaffContext, *, conn=None
) -> EligibilityResult:
    """[PTDET-FAMILY-04·05] 예외 입구를 서버가 다시 판정한다.

    판정 조건은 오직 **B(member)의 등록 전화번호 유무**다. 번호가 있으면 예외 경로(대면·
    가족관계증명서)로 전환할 수 없고 OTP 본인확인에 머문다. 클라이언트가 예외를 선택했다는
    사실만으로 열지 않는다 — 판정을 화면에 두면 요청을 직접 만들어 우회한다.
    """
    async def _run(c):
        return await c.fetchval(
            "select phone from patients where id = $1 and is_active", member_patient_id
        )

    phone = await _dispatch(staff, conn, _run)
    has_registered_number = phone is not None and phone.strip() != ""
    if has_registered_number:
        return EligibilityResult(
            allowed=False, message="등록된 번호가 있어 다른 확인 방법으로 전환할 수 없습니다"
        )
    return EligibilityResult(allowed=True, message="")


# ── 내부 메모 (PTDET-NOTE-01·04) ─────────────────────────────────────────
# ⛔ update_note·delete_note를 만들지 않는다 — PTDET-NOTE-04가 BLOCKED다(변경이력·삭제
#    복구 계약 없음). 00004의 grant도 select, insert만 열려 있다.

async def get_notes(patient_id: UUID, staff: StaffContext, *, conn=None) -> list[dict]:
    """[PTDET-NOTE-01] 내용·작성 직원·시각을 최신순. 직원이 쓴 글이라 마스킹을 거치지 않는다."""
    async def _run(c):
        return await c.fetch(
            """
            select n.id, n.content, n.created_at, s.name as staff_name
            from patient_internal_notes n
            join staff s on s.id = n.staff_id
            where n.patient_id = $1
            order by n.created_at desc, n.id desc
            """,
            patient_id,
        )

    fetched = await _dispatch(staff, conn, _run)
    return [
        {"id": r["id"], "content": r["content"], "created_at": r["created_at"], "staff_name": r["staff_name"]}
        for r in fetched
    ]


async def get_questionnaire(appointment_id: UUID, staff: StaffContext, *, conn=None) -> dict | None:
    """[R2-02] 예약별 사전 문진. RLS(assigned_doctor_can_read_responses)가 담당의·관리자만
    열도록 판정한다 — 서버가 또 거르지 않는다. 없으면 None(화면이 '문진 없음')."""
    async def _run(c):
        return await c.fetchrow(
            "select appointment_id, template_id, answers, submitted_at "
            "from questionnaire_responses where appointment_id = $1",
            appointment_id,
        )

    row = await _dispatch(staff, conn, _run)
    if row is None:
        return None
    return {
        "appointment_id": row["appointment_id"],
        "template_id": row["template_id"],
        "answers": row["answers"],
        "submitted_at": row["submitted_at"],
    }


async def add_note(patient_id: UUID, content: str, staff: StaffContext, *, conn=None) -> UUID:
    """[PTDET-NOTE-01] 내부 메모 작성(POST). 작성자는 세션 직원으로 고정한다."""
    async def _run(c):
        return await c.fetchval(
            "insert into patient_internal_notes (patient_id, staff_id, content) "
            "values ($1, $2, $3) returning id",
            patient_id, staff.id, content,
        )

    return await _dispatch(staff, conn, _run)
