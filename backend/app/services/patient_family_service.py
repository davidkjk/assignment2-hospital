from datetime import date
from uuid import UUID
from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as, get_pool

MAX_ACTIVE_FAMILY = 10  # [#59]


async def add_family_member(patient, name: str, birth_date: date, gender: str, relation: str, phone: str | None = None) -> UUID:
    # [R5-01] family_patient_id는 항상 새로 만드는 행(또는 기존 soft-delete 링크 재활성화)이라
    #         클라이언트가 남의 환자를 지목할 수 없다. get_pool() 서비스 역할로 쓴다(RLS는 select만 연다).
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            active = await conn.fetchval(
                "select count(*) from patient_family_links where account_patient_id=$1 and is_active", patient.id)
            if active >= MAX_ACTIVE_FAMILY:
                raise AppError(f"가족은 최대 {MAX_ACTIVE_FAMILY}명까지 등록할 수 있습니다.", status_code=409)
            # 같은 사람(이름·생년월일·성별 동일)에 soft-delete된 링크가 있으면 재활성화(새 행 안 만듦).
            existing = await conn.fetchrow(
                "select l.id link_id, l.family_patient_id from patient_family_links l "
                "join patients p on p.id = l.family_patient_id "
                "where l.account_patient_id=$1 and not l.is_active "
                "and p.name=$2 and p.birth_date=$3 and p.gender=$4",
                patient.id, name, birth_date, gender)
            if existing is not None:
                # 00045 CHECK: 재활성화 시 unlinked_* 트리오를 통째로 비운다(직원 해제였을 수도 있으므로).
                await conn.execute(
                    "update patient_family_links "
                    "set is_active=true, unlinked_at=null, unlinked_by=null, unlink_reason=null where id=$1",
                    existing["link_id"])
                return existing["family_patient_id"]
            family_id = await conn.fetchval(
                "insert into patients (name, birth_date, gender, phone) values ($1,$2,$3,$4) returning id",
                name, birth_date, gender, phone)  # #3 phone nullable
            await conn.execute(
                "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1,$2,$3)",
                patient.id, family_id, relation)
    return family_id


async def list_family_members(patient) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select p.id, p.name, p.birth_date, p.gender, l.relation, "
            "       coalesce(p.phone, acct.phone) as phone, (p.phone is null) as phone_borrowed "
            "from patient_family_links l "
            "join patients p on p.id = l.family_patient_id "
            "join patients acct on acct.id = l.account_patient_id "
            "where l.account_patient_id=$1 and l.is_active order by p.name", patient.id)  # [R5-02]
    return [{"id": r["id"], "name": r["name"], "birth_date": str(r["birth_date"]), "gender": r["gender"],
             "relation": r["relation"], "phone": r["phone"], "phone_borrowed": r["phone_borrowed"]} for r in rows]


async def update_family_member(patient, family_patient_id: UUID, name, birth_date, gender, relation) -> None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        link = await conn.fetchrow(
            "select id from patient_family_links where account_patient_id=$1 and family_patient_id=$2",
            patient.id, family_patient_id)
        if link is None:
            raise AppError("본인이 등록한 가족만 수정할 수 있습니다.", status_code=403)
        await conn.execute("select update_patient_basic_info($1,$2,$3,$4)", family_patient_id, name, birth_date, gender)
        await conn.execute("select update_family_link_relation_self($1,$2)", link["id"], relation)  # [SDB-19]


async def unlink_family_member(patient, family_patient_id: UUID) -> None:
    # [R5-02] 링크만 비활성 — patients.is_active는 그대로(과거 이력 표시 유지).
    async with acquire_as(str(patient.auth_user_id)) as conn:
        link = await conn.fetchrow(
            "select id from patient_family_links where account_patient_id=$1 and family_patient_id=$2 and is_active",
            patient.id, family_patient_id)
        if link is None:
            raise AppError("본인이 등록한 가족만 연결 해제할 수 있습니다.", status_code=403)
        await conn.execute("select unlink_family_link_self($1)", link["id"])  # [SDB-19]


async def link_existing_patient_by_otp(patient, phone: str, otp: str):
    # [R5-01] 본인확인 창구(4단계) 전까지 막는다 — 통과시키면 본인확인 없이 연결된다.
    raise AppError("기존 환자 연결은 준비 중입니다. 병원 접수처에서 도와드립니다.", status_code=501)
