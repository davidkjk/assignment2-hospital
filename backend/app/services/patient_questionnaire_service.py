import json
from uuid import UUID

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as

EDITABLE_STATUSES = ("예약신청", "예약확정", "도착", "진료대기")  # #21: 진료중부터 읽기 전용
# 정본 계약: 문항 JSON은 show_to ∈ {all,female,male}(admin questionnaire_admin_service.SHOW_TO),
# 환자 성별은 F/M(00028 check). 'all'(또는 키 없음)은 항상 보인다.
# ⚠️ 옛 코드는 visible_to+한글('여성 환자만')을 읽어 admin이 내리는 실제 값과 어긋나 있었다 —
#    admin으로 만든 「여성만」 문항이 앱에선 전원에게 보였다(C2). 두 계층을 같은 계약으로 맞춘다.
_GENDER_ONLY = {"female": "F", "male": "M"}


def _visible(question: dict, gender: str) -> bool:
    required = _GENDER_ONLY.get(question.get("show_to", "all"))
    return required is None or required == gender  # QNR-SHOW-01


def compute_progress(questions: list[dict], gender: str, answers: list) -> dict:
    """QNR-PROG-04: 서버 한 곳에서 센다(앱·알림 배치가 재사용). 분자=지나간 답 수, 분모=보이는 문항 수."""
    total = sum(1 for q in questions if _visible(q, gender))       # QNR-PROG-02·03·SHOW-05
    return {"answered": len(answers), "total": total}             # QNR-PROG-01·05(빈 답도 셈)


def _load(questions) -> list:
    return json.loads(questions) if isinstance(questions, str) else questions


async def _appt_and_template(conn, appointment_id: UUID):
    appt = await conn.fetchrow(
        "select status, department_id, for_patient_id from appointments where id=$1", appointment_id)
    if appt is None:
        raise AppError("예약을 찾을 수 없습니다.", status_code=404)
    # QADM-VERSION-01: 진료과당 활성 버전은 하나(one_active_per_dept 유니크). 작성·표시는 현재 활성
    # 버전으로 한다 — 옛 무필터 `limit 1`은 버전이 여럿이면 비활성 옛 버전을 줄 수 있었다(C1).
    # (과거 응답 조회는 응답의 template_id 스냅샷을 쓴다 — get_response, QADM-VERSION-06.)
    tpl = await conn.fetchrow(
        "select id, questions from questionnaire_templates where department_id=$1 and is_active",
        appt["department_id"])
    gender = await conn.fetchval("select gender from patients where id=$1", appt["for_patient_id"])
    return appt, tpl, gender


async def get_template(patient: PatientContext, appointment_id: UUID) -> dict | None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        _appt, tpl, gender = await _appt_and_template(conn, appointment_id)
    if tpl is None:
        return None
    visible = [q for q in _load(tpl["questions"]) if _visible(q, gender)]  # QNR-SHOW
    return {"id": tpl["id"], "questions": visible, "total": len(visible)}


async def save_response(patient: PatientContext, appointment_id: UUID,
                        answers: list[dict], complete: bool = False) -> dict:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        appt, tpl, gender = await _appt_and_template(conn, appointment_id)
        if appt["status"] not in EDITABLE_STATUSES:
            raise AppError("진료가 시작되기 전까지만 사전문진을 작성할 수 있습니다.", status_code=400)  # #21
        if tpl is None:
            raise AppError("해당 진료과의 문진 양식이 없습니다.", status_code=404)
        # 자동저장(complete=False)은 completed_at을 건드리지 않는다(QNR-STATE-04). 이미 완료면 유지.
        row = await conn.fetchrow(
            "insert into questionnaire_responses (appointment_id, template_id, answers, completed_at) "
            "values ($1,$2,$3, case when $4 then now() else null end) "
            "on conflict (appointment_id) do update set "
            "  template_id = excluded.template_id, answers = excluded.answers, submitted_at = now(), "
            "  completed_at = case when $4 then now() else questionnaire_responses.completed_at end "
            "returning id, completed_at",
            appointment_id, tpl["id"], json.dumps(answers, ensure_ascii=False), complete)
        prog = compute_progress(_load(tpl["questions"]), gender, answers)
    state = "작성완료" if row["completed_at"] is not None else "작성 중"  # QNR-STATE-02·03
    return {"id": row["id"], "state": state, **prog}


async def get_response(patient: PatientContext, appointment_id: UUID) -> dict | None:
    async with acquire_as(str(patient.auth_user_id)) as conn:
        row = await conn.fetchrow(
            "select id, answers, submitted_at, completed_at, template_id "
            "from questionnaire_responses where appointment_id=$1",
            appointment_id)
        if row is None:
            return None  # QNR-STATE-01: 행 없음 = 미작성(호출자가 판정)
        # QADM-VERSION-06: 저장된 응답은 제출 당시 버전(template_id 스냅샷)으로 센다. 버전 행은 불변이라
        # template_id 참조가 곧 스냅샷(00046) — 뒤에 새 버전이 활성화돼도 이 응답의 문항·분모는 안 바뀐다.
        # ⚠️ 진료과로 다시 고르면(_appt_and_template) 활성 버전으로 갈아끼워져 과거 답의 분모가 어긋난다.
        tpl = await conn.fetchrow(
            "select questions from questionnaire_templates where id=$1", row["template_id"])
        appt = await conn.fetchrow(
            "select for_patient_id from appointments where id=$1", appointment_id)
        gender = await conn.fetchval("select gender from patients where id=$1", appt["for_patient_id"])
    answers = _load(row["answers"])
    prog = compute_progress(_load(tpl["questions"]) if tpl else [], gender, answers)
    state = "작성완료" if row["completed_at"] is not None else "작성 중"
    return {"id": row["id"], "answers": answers, "state": state,
            "completed_at": row["completed_at"], **prog}


def build_reminder_body(state: str, answered: int, total: int) -> tuple[str, int | None] | None:
    """QNR-NOTI-03·04: 상태에 따라 문구 키를 고르고, 작성 중이면 「남은 수」를 함께 준다.

    ⭐ 남은 수 = total − answered (QNR-PROG-10). 화면 셋이 쓰는 「한 것」의 수와 **같은 값에서 나오지만
    글자가 다르다** — 알림은 「무엇을 해야 하나」를 말하는 자리라 남은 양이 재촉으로 기능한다(QNR-PROG-11).
    ⚠️ 예전 문구의 3은 「한 것」의 수였다(QNR-PROG-12) — 같은 값을 반대 뜻으로 쓰고 있었다.
    """
    if state == "작성완료":
        return None                                   # QNR-NOTI-02: 대상이 아니다
    if state == "미작성":
        return ("questionnaire_missing", None)        # QNR-NOTI-03
    remaining = max(total - answered, 0)              # 양식이 줄어도 음수를 말하지 않는다
    return ("questionnaire_partial", remaining)       # QNR-NOTI-04


async def list_reminder_targets(conn, target_date) -> list[dict]:
    """QNR-NOTI-01·02·09: 그날 진료가 있고 **완료 표시가 없는** 사람 전부.

    ⭐ 갭 #53 — 옛 배치는 「문진 행이 있느냐」로 갈라 1문항만 쓴 사람을 빠뜨렸다.
      완료 판정은 오직 completed_at이다(QNR-STATE-04와 같은 기준 = 홈 줄과 같은 판정).
    ⭐ 대상 상태는 EDITABLE_STATUSES 전체 — 문진을 쓸 수 있는 구간과 알림이 가는 구간을 맞춘다(QNR-NOTI-09).
    ⚠️ 배치(전날 몇 시·하루 1회)는 배포 플랜 몫. 여기는 「그날 대상이 누구인가」만 답한다.
    """
    rows = await conn.fetch(
        "select a.id as appointment_id, a.for_patient_id, "
        "       fl.account_patient_id as account_patient_id, "
        "       p.name as target_name, p.gender as gender, "
        "       qr.answers as answers, qr.completed_at as completed_at, "
        "       qt.questions as questions "
        "from appointments a "
        "join patients p on p.id = a.for_patient_id "
        "join appointment_slots s on s.id = a.slot_id "
        "left join questionnaire_responses qr on qr.appointment_id = a.id "
        # QADM-VERSION-01: 활성 버전만 붙인다 — 버전이 여럿인 진료과에서 무필터 조인은 대상 행을
        # 버전 수만큼 배수로 부풀린다(C1). 활성은 진료과당 하나라 예약당 한 줄이 보장된다.
        "left join questionnaire_templates qt on qt.department_id = a.department_id and qt.is_active "
        "left join lateral ("
        "   select coalesce(l.account_patient_id, a.for_patient_id) as account_patient_id "
        "   from patient_family_links l where l.family_patient_id = a.for_patient_id limit 1"
        ") fl on true "
        "where s.slot_date = $1 "
        "  and a.status = any($2::text[]) "
        "  and qr.completed_at is null",           # ⭐ 미작성 + 작성 중 둘 다(QNR-NOTI-02)
        target_date, list(EDITABLE_STATUSES))

    out = []
    for r in rows:
        answers = _load(r["answers"] or [])
        prog = compute_progress(_load(r["questions"] or []), r["gender"] or "", answers)
        state = "미작성" if r["answers"] is None else "작성 중"   # completed_at이 null인 것만 왔다
        out.append({
            "appointment_id": r["appointment_id"],
            "account_patient_id": r["account_patient_id"] or r["for_patient_id"],
            "target_name": r["target_name"] if r["account_patient_id"] != r["for_patient_id"] else None,
            "state": state, **prog,
        })
    return out
