from datetime import date
from uuid import UUID
from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as, get_pool

MAX_ACTIVE_FAMILY = 10  # [#59]
_UPCOMING_STATUSES = ("예약신청", "예약확정", "도착", "진료대기", "진료중")   # FAM-LIST-08 (T8 _LIVE와 같은 뜻)


def _identity_lock(row) -> tuple[bool, str | None]:
    """FAM-EDIT-01·03·05·07·08 — 「그 사람의 정보」를 앱에서 고칠 수 있나.

    ⭐ 세 경우가 이 한 곳에서 갈린다. 앱이 조합하지 않는다(화면마다 어긋나지 않게).
    """
    if row["has_visit_history"]:
        return False, "has_history"          # 본인·가족 공통 — 진료기록이 붙었다
    if not row["is_self"] and row["app_created_by"] is None:
        return False, "linked"               # ㉯로 온 가족 — 병원 기록이 원본(이력 0건이어도 잠근다)
    return True, None                        # ㉮ 새 가족 · 이력 없는 본인


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
            # [보안 F-01] 단, 재활성은 **환자 자가해제 건(감사 트리오가 전부 null)**만 허용한다.
            #   직원 철회(unlinked_by NOT NULL)는 환자가 앱에서 되살릴 수 없다 — 재위임은 새 검증
            #   이벤트(병원 확인/OTP)라야 하고, 철회 증적은 append-only로 보존한다. 매칭 비활성 링크
            #   중 직원 철회 건을 먼저 보도록 정렬해, 있으면 중립 문구로 거절(개인정보 열거 방지).
            existing = await conn.fetchrow(
                "select l.id link_id, l.family_patient_id, l.unlinked_by from patient_family_links l "
                "join patients p on p.id = l.family_patient_id "
                "where l.account_patient_id=$1 and not l.is_active "
                "and p.name=$2 and p.birth_date=$3 and p.gender=$4 "
                "order by (l.unlinked_by is not null) desc",
                patient.id, name, birth_date, gender)
            if existing is not None:
                if existing["unlinked_by"] is not None:
                    # 직원 철회 건 — 막다른 길을 만들지 않도록 갈 길을 함께 준다. 환자앱이 뒤에
                    # "더 필요하시면 병원에 문의해 주세요."를 덧붙이므로(family_new_screen 409 경로)
                    # 백엔드 문구는 상태만 중립으로 전한다(문구 중복 방지, 코디 승인 2026-09-04).
                    raise AppError("이 가족은 지금 연결할 수 없습니다.", status_code=409)
                # 자가해제 건만 재활성 — 감사 트리오는 어떤 경우에도 건드리지 않는다(append-only,
                # 자가해제는 트리오가 이미 null이라 00045 CHECK도 그대로 충족).
                # FAM-UNLINK-12·13 — 다시 이을 때 관계는 새로 준 값으로 갱신한다(옛 관계를 되살리지 않는다).
                await conn.execute(
                    "update patient_family_links set is_active=true, relation=$2 where id=$1",
                    existing["link_id"], relation)
                return existing["family_patient_id"]
            family_id = await conn.fetchval(
                "insert into patients (name, birth_date, gender, phone, app_created_by) "
                "values ($1,$2,$3,$4,$5) returning id",
                name, birth_date, gender, phone, patient.id)  # #3 phone nullable · FAM-EDIT-03 출처
            await conn.execute(
                "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1,$2,$3)",
                patient.id, family_id, relation)
    return family_id


async def list_family_members(patient) -> list[dict]:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        rows = await conn.fetch(
            "select p.id, p.name, p.birth_date, p.gender, p.app_created_by, "
            "       coalesce(l.relation, '본인') as relation, "               # FAM-LIST-09 본인 칩
            "       (p.id = $1) as is_self, "
            "       coalesce(p.phone, acct.phone) as phone, (p.phone is null) as phone_borrowed, "
            "       exists (select 1 from appointments v "
            "               where v.for_patient_id = p.id and v.status = '진료완료') as has_visit_history, "
            "       up.id as up_id, up.slot_date as up_date, up.start_time as up_time, "
            "       up.department_name as up_dept "
            "from patients p "
            "join patients acct on acct.id = $1 "
            "left join patient_family_links l "
            "       on l.family_patient_id = p.id and l.account_patient_id = $1 and l.is_active "
            "left join lateral ("                                             # FAM-LIST-06·07 가장 가까운 1건
            "   select a.id, s.slot_date, s.start_time, d.name as department_name "
            "   from appointments a "
            "   join appointment_slots s on s.id = a.slot_id "
            "   join departments d on d.id = a.department_id "
            "   where a.for_patient_id = p.id and a.status = any($2::text[]) "
            "     and s.slot_date >= current_date "
            "   order by s.slot_date, s.start_time limit 1"
            ") up on true "
            "where p.id = $1 or l.id is not null "                            # 본인 + 활성 연결 가족
            "order by (p.id = $1) desc, p.name",                              # FAM-LIST-01·02
            patient.id, list(_UPCOMING_STATUSES))

    out = []
    for r in rows:
        d = dict(r)
        can_edit, reason = _identity_lock(d)
        out.append({
            "id": d["id"], "name": d["name"], "birth_date": str(d["birth_date"]),
            "gender": d["gender"], "relation": d["relation"], "is_self": d["is_self"],
            "phone": d["phone"], "phone_borrowed": d["phone_borrowed"],
            "has_visit_history": d["has_visit_history"],                      # 갭 #63
            "can_edit_identity": can_edit, "identity_lock_reason": reason,    # FAM-EDIT-01~10
            "upcoming": None if d["up_id"] is None else {
                "appointment_id": d["up_id"], "slot_date": str(d["up_date"]),
                "start_time": str(d["up_time"]), "department_name": d["up_dept"]},
        })
    return out


async def _member_row(conn, patient, target_id: UUID) -> dict:
    """판정에 필요한 최소 정보 한 줄. list_family_members와 같은 기준을 쓴다."""
    row = await conn.fetchrow(
        "select p.id, p.app_created_by, (p.id = $1) as is_self, "
        "       exists (select 1 from appointments v "
        "               where v.for_patient_id = p.id and v.status = '진료완료') as has_visit_history, "
        "       l.id as link_id "
        "from patients p "
        "left join patient_family_links l "
        "       on l.family_patient_id = p.id and l.account_patient_id = $1 and l.is_active "
        "where p.id = $2 and (p.id = $1 or l.id is not null)",
        patient.id, target_id)
    if row is None:
        raise AppError("본인 또는 연결된 가족만 수정할 수 있습니다.", status_code=403)
    return dict(row)


async def update_family_identity(patient, target_patient_id: UUID, name, birth_date, gender) -> None:
    """FAM-EDIT-02·03·05·07·08 — 「그 사람의 정보」(병원의 환자 기록)."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await _member_row(conn, patient, target_patient_id)
        can_edit, reason = _identity_lock(row)
        if not can_edit:
            # ⛔ 화면이 잠근 것을 서버도 잠근다(심층 방어). 문구는 화면이 reason으로 고른다.
            raise AppError(
                "병원에 문의하시면 수정해 드립니다." if reason == "linked"
                else "진료 기록이 있어 병원에서만 수정할 수 있습니다.", status_code=403)
        await conn.execute("select update_patient_basic_info($1,$2,$3,$4)",
                           target_patient_id, name, birth_date, gender)


async def update_family_relation(patient, family_patient_id: UUID, relation: str) -> None:
    """FAM-EDIT-01·12 — 「나와의 관계」(내 연결선). 누구에게나 항상 열려 있다."""
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await _member_row(conn, patient, family_patient_id)
        if row["link_id"] is None:                       # 본인에게는 연결선이 없다(FAM-LIST-09)
            raise AppError("본인에게는 관계를 설정할 수 없습니다.", status_code=400)
        await conn.execute("select update_family_link_relation_self($1,$2)", row["link_id"], relation)


async def unlink_family_member(patient, family_patient_id: UUID) -> None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await _member_row(conn, patient, family_patient_id)
        if row["link_id"] is None:
            raise AppError("본인은 연결을 해제할 수 없습니다.", status_code=400)   # FAM-UNLINK-02
        # FAM-UNLINK-03 — 유령 예약을 만들지 않는다. 화면이 안내할 예약을 함께 돌려준다.
        upcoming = await conn.fetchrow(
            "select a.id, s.slot_date, s.start_time, d.name as department_name "
            "from appointments a join appointment_slots s on s.id=a.slot_id "
            "join departments d on d.id=a.department_id "
            "where a.for_patient_id=$1 and a.status = any($2::text[]) and s.slot_date >= current_date "
            "order by s.slot_date, s.start_time limit 1",
            family_patient_id, list(_UPCOMING_STATUSES))
        if upcoming is not None:
            raise AppError("먼저 예약을 취소해 주세요.", status_code=409, detail={
                "appointment_id": upcoming["id"], "slot_date": str(upcoming["slot_date"]),
                "start_time": str(upcoming["start_time"]),
                "department_name": upcoming["department_name"]})
        await conn.execute("select unlink_family_link_self($1)", row["link_id"])   # [R5-02] 링크만 비활성


async def link_existing_patient_by_otp(patient, phone: str, otp: str):
    # [R5-01] ✅ 해소(환자앱 T26) — 본인확인 창구를 family_link_otp_service로 분리했다.
    #         옛 501 주석의 「4단계에서 푼다」는 낡았다(4단계=AI 상담봇, 본인확인과 무관).
    raise AppError(
        "가족 연결은 인증번호 요청(/family/link/request) 후 확인(/family/link/confirm)으로 진행합니다.",
        status_code=400)
