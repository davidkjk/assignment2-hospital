"""직원 대행 가족 연결 — B 번호 OTP 본인확인 창구(배포 Task 7E · 결정 #3 ㉠ · 갭 손검수 ①).

가족 연결의 본인확인부는 3층이다(결정 #3): ㉠기본=B 번호로 OTP · ㉡예외=번호 없을 때만 대면·서류
(patient_service.link_family_member의 method!="otp" 경로가 이미 담당) · ㉢항상=연결 완료 시 B에 통보.
이 서비스는 ㉠(OTP)와 ㉢(통보)를 담당한다 — 대상 B는 이미 특정돼 있고(후보검색 없음), B의 등록번호로
6자리를 보내 그 번호에 닿는 사람만 연결되게 한다. 확인 성공 시 link_family_member(otp_verified=True)로
실제 연결하고, 직후 B에게 family_linked를 통보한다(㉢).

⚠️ 7D staff_phone_change_service와 같은 결의 방어:
  · 코드가 틀리면 attempts를 올리되 **트랜잭션 커밋 뒤에 raise**한다(안에서 raise하면 롤백돼 카운트가 0).
  · 확인·연결·통보의 원자성: 연결이 실패(이미 연결됨 등)하면 verified_at도 롤백해 「확인됐는데 연결 안 됨」을 막는다.

⚠️ 하네스 보정(형제 test_staff_phone_change_service.py와 같은 이유): 서비스가 자기 커넥션(get_pool)을
   열어 커밋된 데이터만 본다 → committed_conn(postgres 역할=RLS 우회, autouse cleanup)으로 시딩·검증한다.
"""
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import patient_service
from app.services import staff_family_link_otp_service as svc
from tests.conftest import seed_patient, seed_staff


class _FakeSms:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    def send_sms(self, phone: str, body: str) -> None:
        self.sent.append((phone, body))


class _FakeNotify:
    """㉢ B 통보 대역 — 실제로는 notification_service.notify_patient."""

    def __init__(self):
        self.calls: list[tuple] = []

    async def __call__(self, patient_id, notification_type, **kwargs):
        self.calls.append((patient_id, notification_type, kwargs))


def _code(body: str) -> str:
    m = re.search(r"(\d{6})", body)
    assert m, f"문자에 6자리 코드가 없다: {body}"
    return m.group(1)


async def _seed_staff_ctx(conn, role="receptionist") -> StaffContext:
    s = await seed_staff(conn, role=role)
    return StaffContext(id=s["staff_id"], auth_user_id=s["auth_user_id"], role=role, department_id=None)


# ─── 요청 ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_request_sends_code_to_family_registered_phone(committed_conn):
    """[결정 #3 ㉠] B의 등록번호로 6자리를 보내고 요청 행을 남긴다(감사)."""
    staff = await _seed_staff_ctx(committed_conn)
    a = await seed_patient(committed_conn, name="김철수", phone="01011112222")
    b = await seed_patient(committed_conn, name="김영희", phone="01099998888")
    sms = _FakeSms()

    rid = await svc.request_family_link_otp(
        staff, a["patient_id"], b["patient_id"], "배우자", sms_client=sms)

    assert rid is not None
    assert len(sms.sent) == 1
    to, body = sms.sent[0]
    assert to == "01099998888"                        # B의 등록번호로 나간다(본인확인)
    assert "가족" in body and "5분" in body
    row = await committed_conn.fetchrow(
        "select * from staff_family_link_requests where id=$1", rid)
    assert row["account_patient_id"] == a["patient_id"]
    assert row["family_patient_id"] == b["patient_id"]
    assert row["staff_id"] == staff.id                # 누가 시작했나(감사)
    assert row["relation"] == "배우자"                 # 확인 성공 시 이 관계로 연결
    assert row["verified_at"] is None
    assert row["expires_at"] > datetime.now(timezone.utc) + timedelta(minutes=4)


@pytest.mark.asyncio
async def test_request_family_without_phone_rejected(committed_conn):
    """[PTDET-FAMILY-04] B에 번호가 없으면 OTP로 확인할 수 없다 — 예외 경로(대면·서류)로 가야 한다."""
    staff = await _seed_staff_ctx(committed_conn)
    a = await seed_patient(committed_conn, phone="01011112222")
    b = await seed_patient(committed_conn, name="번호없음", phone=None, with_auth=False)
    sms = _FakeSms()

    with pytest.raises(AppError) as e:
        await svc.request_family_link_otp(
            staff, a["patient_id"], b["patient_id"], "자녀", sms_client=sms)
    assert e.value.status_code == 409
    assert sms.sent == []                              # 문자도 안 나간다


@pytest.mark.asyncio
async def test_request_unknown_family_rejected(committed_conn):
    """존재하지 않는 B는 요청 전에 막는다(문자도 안 나간다)."""
    staff = await _seed_staff_ctx(committed_conn)
    a = await seed_patient(committed_conn, phone="01011112222")
    sms = _FakeSms()
    with pytest.raises(AppError) as e:
        await svc.request_family_link_otp(staff, a["patient_id"], uuid4(), "자녀", sms_client=sms)
    assert e.value.status_code == 404
    assert sms.sent == []


@pytest.mark.asyncio
async def test_request_resend_cooldown_returns_429(committed_conn):
    """[갭 #16] 같은 A·B 쌍으로 30초 안에 다시 요청하면 429 + Retry-After."""
    staff = await _seed_staff_ctx(committed_conn)
    a = await seed_patient(committed_conn, phone="01011112222")
    b = await seed_patient(committed_conn, phone="01099998888")
    sms = _FakeSms()
    await svc.request_family_link_otp(staff, a["patient_id"], b["patient_id"], "배우자", sms_client=sms)

    with pytest.raises(AppError) as e:
        await svc.request_family_link_otp(staff, a["patient_id"], b["patient_id"], "배우자", sms_client=sms)
    assert e.value.status_code == 429
    assert e.value.retry_after_seconds and e.value.retry_after_seconds > 0
    assert len(sms.sent) == 1                          # 두 번째는 문자 안 보냄


# ─── 확인 ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_confirm_correct_code_creates_link_and_notifies_b(committed_conn):
    """[결정 #3 ㉠·㉢] 코드가 맞으면 가족을 연결(method=otp)하고 직후 B에게 통보한다."""
    staff = await _seed_staff_ctx(committed_conn)
    a = await seed_patient(committed_conn, name="김철수", phone="01011112222")
    b = await seed_patient(committed_conn, name="김영희", phone="01099998888")
    sms = _FakeSms()
    notify = _FakeNotify()
    await svc.request_family_link_otp(staff, a["patient_id"], b["patient_id"], "배우자", sms_client=sms)
    code = _code(sms.sent[0][1])

    link_id = await svc.confirm_family_link_otp(
        staff, a["patient_id"], b["patient_id"], code, notify=notify)

    assert link_id is not None
    row = await committed_conn.fetchrow(
        "select * from patient_family_links where id=$1", link_id)
    assert row["account_patient_id"] == a["patient_id"]
    assert row["family_patient_id"] == b["patient_id"]
    assert row["relation"] == "배우자"
    assert row["verification_method"] == "otp"         # OTP 경로로 연결됨
    assert row["linked_by"] == staff.id
    # ㉢ 통보 — 항상 B(family_patient_id)에게, family_linked 종류로.
    assert len(notify.calls) == 1
    pid, ntype, kwargs = notify.calls[0]
    assert pid == b["patient_id"]
    assert ntype == "family_linked"
    assert kwargs.get("target_name") == "김영희"
    # 요청 행은 검증 표시가 찍힌다(감사).
    vreq = await committed_conn.fetchval(
        "select verified_at from staff_family_link_requests "
        "where account_patient_id=$1 and family_patient_id=$2",
        a["patient_id"], b["patient_id"])
    assert vreq is not None


@pytest.mark.asyncio
async def test_confirm_wrong_code_counts_and_creates_no_link(committed_conn):
    """코드가 틀리면 연결하지 않고 시도만 센다(커밋돼 남는다)."""
    staff = await _seed_staff_ctx(committed_conn)
    a = await seed_patient(committed_conn, phone="01011112222")
    b = await seed_patient(committed_conn, phone="01099998888")
    sms = _FakeSms()
    notify = _FakeNotify()
    await svc.request_family_link_otp(staff, a["patient_id"], b["patient_id"], "배우자", sms_client=sms)

    with pytest.raises(AppError) as e:
        await svc.confirm_family_link_otp(staff, a["patient_id"], b["patient_id"], "000000", notify=notify)
    assert e.value.status_code == 400

    n = await committed_conn.fetchval(
        "select count(*) from patient_family_links "
        "where account_patient_id=$1 and family_patient_id=$2",
        a["patient_id"], b["patient_id"])
    assert n == 0                                      # 연결 안 됨
    assert notify.calls == []                          # 통보 안 함
    attempts = await committed_conn.fetchval(
        "select attempts from staff_family_link_requests "
        "where account_patient_id=$1 and family_patient_id=$2",
        a["patient_id"], b["patient_id"])
    assert attempts == 1                               # 시도는 커밋돼 남는다


@pytest.mark.asyncio
async def test_confirm_expired_code_rejected(committed_conn):
    """만료된 코드는 거부하고 연결하지 않는다 — 다시 받게 안내."""
    staff = await _seed_staff_ctx(committed_conn)
    a = await seed_patient(committed_conn, phone="01011112222")
    b = await seed_patient(committed_conn, phone="01099998888")
    sms = _FakeSms()
    notify = _FakeNotify()
    await svc.request_family_link_otp(staff, a["patient_id"], b["patient_id"], "배우자", sms_client=sms)
    code = _code(sms.sent[0][1])
    await committed_conn.execute(
        "update staff_family_link_requests set expires_at = now() - interval '1 minute' "
        "where account_patient_id=$1 and family_patient_id=$2",
        a["patient_id"], b["patient_id"])

    with pytest.raises(AppError) as e:
        await svc.confirm_family_link_otp(staff, a["patient_id"], b["patient_id"], code, notify=notify)
    assert e.value.status_code == 400
    n = await committed_conn.fetchval(
        "select count(*) from patient_family_links "
        "where account_patient_id=$1 and family_patient_id=$2",
        a["patient_id"], b["patient_id"])
    assert n == 0
    assert notify.calls == []


@pytest.mark.asyncio
async def test_confirm_already_linked_returns_409_and_rolls_back_verified(committed_conn):
    """[PTDET-FAMILY-01] 이미 연결된 가족이면 409 — 확인 표시(verified_at)도 롤백한다(원자성)."""
    staff = await _seed_staff_ctx(committed_conn)
    a = await seed_patient(committed_conn, phone="01011112222")
    b = await seed_patient(committed_conn, phone="01099998888")
    # 이미 살아있는 연결(어느 경로로든 만들어진 것)이 있다 — 가드에 걸리지 않게 직접 삽입한다.
    await committed_conn.execute(
        "insert into patient_family_links "
        "  (account_patient_id, family_patient_id, relation, verification_method, linked_by) "
        "values ($1,$2,$3,$4,$5)",
        a["patient_id"], b["patient_id"], "배우자", "otp", staff.id)
    sms = _FakeSms()
    notify = _FakeNotify()
    await svc.request_family_link_otp(staff, a["patient_id"], b["patient_id"], "배우자", sms_client=sms)
    code = _code(sms.sent[0][1])

    with pytest.raises(AppError) as e:
        await svc.confirm_family_link_otp(staff, a["patient_id"], b["patient_id"], code, notify=notify)
    assert e.value.status_code == 409
    assert notify.calls == []                          # 연결 실패 시 통보 안 함
    vreq = await committed_conn.fetchval(
        "select verified_at from staff_family_link_requests "
        "where account_patient_id=$1 and family_patient_id=$2",
        a["patient_id"], b["patient_id"])
    assert vreq is None                                # 확인 표시도 롤백(「확인됐는데 연결 안 됨」 방지)


# ─── ㉢ 통보 헬퍼(OTP·예외 공통, PTDET-FAMILY-06) ────────────────────────────

@pytest.mark.asyncio
async def test_notify_family_linked_notifies_b_with_name(committed_conn):
    """연결 직후 B(family_patient_id)에게 family_linked를 통보한다 — 이름을 붙여."""
    b = await seed_patient(committed_conn, name="박민수", phone="01099998888")
    notify = _FakeNotify()

    await svc.notify_family_linked(b["patient_id"], notify=notify)

    assert len(notify.calls) == 1
    pid, ntype, kwargs = notify.calls[0]
    assert pid == b["patient_id"]
    assert ntype == "family_linked"
    assert kwargs.get("target_name") == "박민수"


@pytest.mark.asyncio
async def test_notify_family_linked_swallows_failure(committed_conn):
    """통보가 실패해도(문자 서비스 장애 등) 예외를 삼킨다 — 이미 성공한 연결을 되돌리지 않는다."""
    b = await seed_patient(committed_conn, name="박민수", phone="01099998888")

    async def _boom(*a, **k):
        raise RuntimeError("문자 서비스 장애")

    # raise 하지 않고 조용히 넘어가야 한다.
    await svc.notify_family_linked(b["patient_id"], notify=_boom)


# ─── link_family_member OTP 가드 리팩터 ──────────────────────────────────────

@pytest.mark.asyncio
async def test_link_family_member_otp_guard_blocks_without_verification(committed_conn):
    """otp_verified=False면 method=otp 경로는 여전히 501로 막힌다(우회 방지)."""
    staff = await _seed_staff_ctx(committed_conn)
    a = await seed_patient(committed_conn, phone="01011112222")
    b = await seed_patient(committed_conn, phone="01099998888")
    with pytest.raises(AppError) as e:
        await patient_service.link_family_member(
            a["patient_id"], b["patient_id"], "배우자", "otp", staff, conn=committed_conn)
    assert e.value.status_code == 501


@pytest.mark.asyncio
async def test_link_family_member_otp_passes_when_verified(committed_conn):
    """otp_verified=True면 OTP 서비스만 통과해 실제 연결된다."""
    staff = await _seed_staff_ctx(committed_conn)
    a = await seed_patient(committed_conn, phone="01011112222")
    b = await seed_patient(committed_conn, phone="01099998888")
    link_id = await patient_service.link_family_member(
        a["patient_id"], b["patient_id"], "배우자", "otp", staff,
        conn=committed_conn, otp_verified=True)
    row = await committed_conn.fetchrow(
        "select verification_method from patient_family_links where id=$1", link_id)
    assert row["verification_method"] == "otp"
