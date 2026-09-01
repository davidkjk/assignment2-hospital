import json
import pytest
from datetime import date, timedelta

from app.services import dispatch_service, notification_service
from app.services import patient_questionnaire_service as qsvc
from tests.conftest import seed_patient, seed_staff

# 미작성 알림(갭 #53) — 문구 빌더(순수)·notify_patient 배관·대상 조회 세 층을 검증한다.
# list_reminder_targets·notify_patient는 자기커넥션(get_pool/acquire_as)이라 시드는 committed_conn으로
# (커밋돼야 그 커넥션이 본다. T5~T9 하네스 패턴). committed_conn은 postgres 역할이라 RLS를 우회한다.

TOMORROW = date(2999, 8, 1)

# 정본 계약: show_to {all,female,male}(admin _validate). 옛 visible_to+한글은 서비스가 실제로 내리는
# 값과 어긋나 있었다(C2) — 여기를 정본으로 맞춘다.
_THREE_QUESTIONS = [
    {"id": "q1", "text": "키", "type": "short_text", "show_to": "all"},
    {"id": "q2", "text": "몸무게", "type": "short_text", "show_to": "all"},
    {"id": "q3", "text": "임신 가능성", "type": "yes_no", "show_to": "female"},
]
_ALL_ANSWERS = [
    {"question_id": "q1", "question_text": "키", "value": "170"},
    {"question_id": "q2", "question_text": "몸무게", "value": "60"},
    {"question_id": "q3", "question_text": "임신 가능성", "value": "아니오"},
]


# ─────────────────────────── Step 4: 문구 빌더(순수) ───────────────────────────

def test_body_for_unwritten():
    """[QNR-NOTI-03] 미작성이면 「내일 진료 전 사전문진을 작성해 주세요」."""
    key, remaining = qsvc.build_reminder_body(state="미작성", answered=0, total=8)
    assert key == "questionnaire_missing"
    assert remaining is None                      # 숫자를 넣지 않는다(셀 것이 없다)


def test_body_for_partial_uses_remaining():
    """[QNR-NOTI-04][QNR-PROG-10] 작성 중이면 「남은 수」 — 8문항 중 3개를 했으면 5다."""
    key, remaining = qsvc.build_reminder_body(state="작성 중", answered=3, total=8)
    assert key == "questionnaire_partial"
    assert remaining == 5                         # ⭐ 3이 아니다(QNR-PROG-12가 고친 것)


def test_partial_remaining_is_never_negative():
    """[QNR-PROG-10] 답이 분모보다 많아도(양식이 줄었을 때) 음수를 말하지 않는다."""
    _key, remaining = qsvc.build_reminder_body(state="작성 중", answered=9, total=8)
    assert remaining == 0


def test_completed_gets_no_reminder():
    """[QNR-NOTI-02] 완료 표시가 있으면 대상이 아니다 — 문구를 만들 일이 없다."""
    assert qsvc.build_reminder_body(state="작성완료", answered=8, total=8) is None


def test_messages_have_both_bodies_and_no_false_sentence():
    """[QNR-NOTI-05][QNR-NOTI-08] 문구는 두 벌이고, 작성 중 문구에 「작성하지 않으셨습니다」가 없다."""
    from app.services.notification_service import MESSAGES
    assert "questionnaire_missing" in MESSAGES and "questionnaire_partial" in MESSAGES
    partial = MESSAGES["questionnaire_partial"]
    assert "작성하지 않으" not in partial          # 사실이 아닌 말(QNR-NOTI-05)
    assert "{remaining}" in partial                # 남은 수 자리(QNR-PROG-10)


def test_message_wording_matches_mockup():
    """[QNR-NOTI-03][QNR-NOTI-04][QNR-NOTI-08] 두 파일에 다르게 있던 문구를 하나로 통일한다(갭 #53)."""
    from app.services.notification_service import MESSAGES
    assert MESSAGES["questionnaire_missing"] == "내일 진료 전 사전문진을 작성해 주세요."
    assert MESSAGES["questionnaire_partial"] == \
        "작성하시던 사전문진이 {remaining}문항 남았습니다. 내일 진료 전에 마쳐 주세요."


def test_progress_source_is_shared_function():
    """[QNR-NOTI-06][QNR-PROG-04] 알림은 화면과 같은 compute_progress를 쓴다 — 따로 세지 않는다."""
    questions = [{"id": "q1", "show_to": "all"}, {"id": "q2", "show_to": "female"}]
    prog = qsvc.compute_progress(questions, "M", [{"question_id": "q1"}])
    _key, remaining = qsvc.build_reminder_body(state="작성 중", **prog)
    assert prog["total"] == 1 and remaining == 0   # 남성은 분모 1 — 다 쓴 셈이라 남은 것이 없다


# ─────────────────────── Step 5: notify_patient 「남은 수」 배관 ───────────────────────

@pytest.fixture
def sent(monkeypatch):
    """직원웹 T30의 배달 계층을 스텁한다 — 이 태스크는 '판정'만 검증한다(T9 선례)."""
    calls = []

    async def fake_send_now(notification_ids, conn):
        calls.append(list(notification_ids))

    monkeypatch.setattr(dispatch_service, "send_now", fake_send_now)
    return calls


async def _appt_with_slot(conn, patient_id, *, status="예약확정"):
    dept = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor = await seed_staff(conn, role="doctor")
    await conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    slot_id = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,'09:00') returning id",
        doctor["staff_id"], TOMORROW)
    return await conn.fetchval(
        "insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, slot_id, status, source) "
        "values ($1,$1,$2,$3,$4,$5,'app') returning id",
        patient_id, dept, doctor["staff_id"], slot_id, status)


async def _last_body(conn, patient_id):
    # 이 테스트들은 환자당 로그 한 줄만 만든다(dedup 없이) — 정렬 없이 그 한 줄을 읽는다.
    return await conn.fetchval(
        "select body from notification_log where patient_id=$1 limit 1", patient_id)


@pytest.mark.asyncio
async def test_notify_patient_fills_remaining(committed_conn, sent):
    """[QNR-NOTI-04] 「{remaining}」 자리가 서버 값으로 채워진다."""
    p = await seed_patient(committed_conn)
    appt = await _appt_with_slot(committed_conn, p["patient_id"])
    await committed_conn.execute("insert into device_tokens (patient_id, token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(
        p["patient_id"], "questionnaire_missing", appointment_id=appt, remaining=5)
    assert "5문항 남았습니다" in await _last_body(committed_conn, p["patient_id"])


@pytest.mark.asyncio
async def test_notify_patient_without_remaining_uses_missing_body(committed_conn, sent):
    """[QNR-NOTI-03] remaining이 없으면 미작성 문구 — 숫자 자리가 남지 않는다."""
    p = await seed_patient(committed_conn)
    appt = await _appt_with_slot(committed_conn, p["patient_id"])
    await committed_conn.execute("insert into device_tokens (patient_id, token) values ($1,'t')", p["patient_id"])
    await notification_service.notify_patient(
        p["patient_id"], "questionnaire_missing", appointment_id=appt)
    body = await _last_body(committed_conn, p["patient_id"])
    assert body == "내일 진료 전 사전문진을 작성해 주세요."
    assert "{" not in body


@pytest.mark.asyncio
async def test_preference_off_silences_both_bodies(committed_conn, sent):
    """[QNR-NOTI-04] 문구가 두 벌이어도 선호도는 한 스위치다 — 끄면 둘 다 안 간다."""
    p = await seed_patient(committed_conn)
    appt = await _appt_with_slot(committed_conn, p["patient_id"])
    await committed_conn.execute("insert into device_tokens (patient_id, token) values ($1,'t')", p["patient_id"])
    await committed_conn.execute(
        "insert into notification_preferences (patient_id, notification_type, enabled) values ($1,'questionnaire_missing',false)",
        p["patient_id"])
    await notification_service.notify_patient(
        p["patient_id"], "questionnaire_missing", appointment_id=appt, remaining=5)
    assert await _last_body(committed_conn, p["patient_id"]) is None   # 로그 자체가 없다


# ─────────────────────── Step 6: 대상 조회(완료 표시 없는 사람 전부) ───────────────────────

async def _seed_appt(conn, *, gender="F", status="예약확정", slot_date=TOMORROW, name="환자"):
    dept = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor = await seed_staff(conn, role="doctor")
    await conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    slot_id = await conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,'09:00') returning id",
        doctor["staff_id"], slot_date)
    ps = await seed_patient(conn, gender=gender, name=name, phone=f"010-{ps_phone()}")
    aid = await conn.fetchval(
        "insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, slot_id, status, source) "
        "values ($1,$1,$2,$3,$4,$5,'app') returning id",
        ps["patient_id"], dept, doctor["staff_id"], slot_id, status)
    return {"appointment_id": aid, "department_id": dept, "me": ps["patient_id"], "patient_id": ps["patient_id"]}


_phone_seq = [0]


def ps_phone():
    _phone_seq[0] += 1
    return f"{_phone_seq[0]:07d}"


async def _seed_template(conn, department_id, questions):
    await conn.execute("insert into questionnaire_templates (department_id, questions) values ($1,$2)",
                       department_id, json.dumps(questions, ensure_ascii=False))


async def _seed_response(conn, appointment_id, department_id, answers, *, complete=False):
    tpl = await conn.fetchval("select id from questionnaire_templates where department_id=$1 limit 1", department_id)
    await conn.execute(
        "insert into questionnaire_responses (appointment_id, template_id, answers, completed_at) "
        "values ($1,$2,$3, case when $4 then now() else null end)",
        appointment_id, tpl, json.dumps(answers, ensure_ascii=False), complete)


@pytest.mark.asyncio
async def test_target_includes_partially_written(committed_conn):
    """[QNR-NOTI-02][QNR-NOTI-07] 1문항만 쓴 사람도 대상이다 — 갭 #53(행 존재로 가르지 않는다)."""
    ctx = await _seed_appt(committed_conn, gender="F", status="예약확정")
    await _seed_template(committed_conn, ctx["department_id"], _THREE_QUESTIONS)
    await _seed_response(committed_conn, ctx["appointment_id"], ctx["department_id"],
                         [{"question_id": "q1", "question_text": "키", "value": "170"}], complete=False)
    targets = await qsvc.list_reminder_targets(committed_conn, TOMORROW)
    row = next(t for t in targets if t["appointment_id"] == ctx["appointment_id"])
    assert row["state"] == "작성 중" and row["answered"] == 1 and row["total"] == 3


@pytest.mark.asyncio
async def test_target_includes_unwritten(committed_conn):
    """[QNR-NOTI-02] 미작성도 대상이다 — 둘 다 「완료 표시가 없는 사람」."""
    ctx = await _seed_appt(committed_conn, gender="F", status="예약확정")
    await _seed_template(committed_conn, ctx["department_id"], _THREE_QUESTIONS)
    targets = await qsvc.list_reminder_targets(committed_conn, TOMORROW)
    assert next(t for t in targets if t["appointment_id"] == ctx["appointment_id"])["state"] == "미작성"


@pytest.mark.asyncio
async def test_target_excludes_completed(committed_conn):
    """[QNR-NOTI-02] 완료 표시가 있으면 빠진다 — 다 쓴 사람을 재촉하지 않는다."""
    ctx = await _seed_appt(committed_conn, gender="F", status="예약확정")
    await _seed_template(committed_conn, ctx["department_id"], _THREE_QUESTIONS)
    await _seed_response(committed_conn, ctx["appointment_id"], ctx["department_id"], _ALL_ANSWERS, complete=True)
    targets = await qsvc.list_reminder_targets(committed_conn, TOMORROW)
    assert all(t["appointment_id"] != ctx["appointment_id"] for t in targets)


@pytest.mark.asyncio
async def test_target_includes_requested_status(committed_conn):
    """[QNR-NOTI-09] 「예약신청」도 대상이다 — 확정이 늦어져도 알림이 간다(옛 배치는 예약확정만)."""
    ctx = await _seed_appt(committed_conn, gender="F", status="예약신청")
    await _seed_template(committed_conn, ctx["department_id"], _THREE_QUESTIONS)
    targets = await qsvc.list_reminder_targets(committed_conn, TOMORROW)
    assert any(t["appointment_id"] == ctx["appointment_id"] for t in targets)


@pytest.mark.asyncio
async def test_target_excludes_cancelled_and_other_days(committed_conn):
    """[QNR-NOTI-01][QNR-NOTI-09] 그날 예약만, 살아 있는 예약만."""
    cancelled = await _seed_appt(committed_conn, gender="F", status="환자취소")
    later = await _seed_appt(committed_conn, gender="F", status="예약확정", slot_date=TOMORROW + timedelta(days=3))
    targets = await qsvc.list_reminder_targets(committed_conn, TOMORROW)
    ids = {t["appointment_id"] for t in targets}
    assert cancelled["appointment_id"] not in ids and later["appointment_id"] not in ids


@pytest.mark.asyncio
async def test_target_carries_account_owner_not_family_member(committed_conn):
    """[QNR-NOTI-01] 알림은 늘 계정 소유자에게 간다 — 가족 예약이면 대상자 이름을 함께 준다."""
    owner = await seed_patient(committed_conn, name="김보호", phone=f"010-{ps_phone()}")
    member = await seed_patient(committed_conn, name="김어머니", phone=f"010-{ps_phone()}")
    await committed_conn.execute(
        "insert into patient_family_links (account_patient_id, family_patient_id, relation, is_active) "
        "values ($1,$2,'어머니',true)", owner["patient_id"], member["patient_id"])
    dept = await committed_conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor = await seed_staff(committed_conn, role="doctor")
    await committed_conn.execute("update staff set department_id=$1 where id=$2", dept, doctor["staff_id"])
    slot_id = await committed_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1,$2,'09:00') returning id",
        doctor["staff_id"], TOMORROW)
    appt = await committed_conn.fetchval(
        "insert into appointments (account_patient_id, for_patient_id, department_id, doctor_id, slot_id, status, source) "
        "values ($1,$2,$3,$4,$5,'예약확정','app') returning id",
        owner["patient_id"], member["patient_id"], dept, doctor["staff_id"], slot_id)
    await _seed_template(committed_conn, dept, _THREE_QUESTIONS)
    targets = await qsvc.list_reminder_targets(committed_conn, TOMORROW)
    row = next(t for t in targets if t["appointment_id"] == appt)
    assert row["account_patient_id"] == owner["patient_id"]     # 받는 사람
    assert row["target_name"] == "김어머니"                      # 본문에 들어갈 대상자(T9 소유)


@pytest.mark.asyncio
async def test_target_total_uses_patient_gender(committed_conn):
    """[QNR-NOTI-06] 배치가 따로 세지 않는다 — 진료받는 사람의 성별로 compute_progress를 부른다."""
    ctx = await _seed_appt(committed_conn, gender="M", status="예약확정")
    await _seed_template(committed_conn, ctx["department_id"], _THREE_QUESTIONS)  # 하나가 여성 전용
    row = next(t for t in await qsvc.list_reminder_targets(committed_conn, TOMORROW)
               if t["appointment_id"] == ctx["appointment_id"])
    assert row["total"] == 2                                    # 여성 전용 문항이 빠졌다


@pytest.mark.asyncio
async def test_target_not_duplicated_by_multiple_versions(committed_conn):
    """[QADM-VERSION-01] 진료과에 버전이 여럿이어도 대상은 예약당 한 줄, 분모는 활성 버전 — 조인이 행을 배수로 부풀리지 않는다."""
    ctx = await _seed_appt(committed_conn, gender="F", status="예약확정")
    await _seed_template(committed_conn, ctx["department_id"], _THREE_QUESTIONS)  # v1 = 3문항
    await committed_conn.execute(
        "update questionnaire_templates set is_active=false where department_id=$1", ctx["department_id"])
    await committed_conn.execute(
        "insert into questionnaire_templates (department_id, questions, version_no, is_active) "
        "values ($1, $2::jsonb, 2, true)", ctx["department_id"],
        json.dumps([{"id": "q9", "text": "새 문항", "type": "short_text", "show_to": "all"}], ensure_ascii=False))
    matching = [t for t in await qsvc.list_reminder_targets(committed_conn, TOMORROW)
                if t["appointment_id"] == ctx["appointment_id"]]
    assert len(matching) == 1                                  # 버전이 둘이어도 대상 줄이 불어나지 않는다
    assert matching[0]["total"] == 1                           # 활성 v2의 문항 수
