"""직원 대행 전화번호 변경 OTP 창구(배포 Task 7D · 갭 #19 · 결정 #4).

직접 저장(㉮)은 계정 탈취·기록 오염으로 기각됐다 — 새 번호로 6자리 코드를 보내 그 번호에 닿는
사람만 바꾼다(㉯). 성공 전까지 기존 번호가 산다(PTDET-ACTION-03). 성공 시 patients.phone과
Auth 전화번호를 한 트랜잭션 결에서 바꾼다(ⓑ) — Auth 실패는 롤백해 부분 성공을 막는다.

⚠️ 하네스 보정(형제 test_family_link_otp_service.py와 같은 이유): 서비스가 자기 커넥션(get_pool)을
   열어 커밋된 데이터만 본다 → committed_conn(postgres 역할=RLS 우회, autouse cleanup)으로 시딩·검증한다.
"""
import re
from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import staff_phone_change_service as svc
from tests.conftest import seed_patient, seed_staff


def _uphone() -> str:
    return f"010{uuid4().int % 100000000:08d}"


class _FakeSms:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    def send_sms(self, phone: str, body: str) -> None:
        self.sent.append((phone, body))


class _FakeAuthSync:
    """ⓑ Auth 전화번호 동기화 대역 — 실제로는 gotrue update_user_by_id."""

    def __init__(self, *, fail: bool = False):
        self.calls: list[tuple[UUID, str]] = []
        self._fail = fail

    def __call__(self, auth_user_id: UUID, new_phone_digits: str) -> None:
        self.calls.append((auth_user_id, new_phone_digits))
        if self._fail:
            raise RuntimeError("gotrue down")


def _code(body: str) -> str:
    m = re.search(r"(\d{6})", body)
    assert m, f"문자에 6자리 코드가 없다: {body}"
    return m.group(1)


async def _seed_staff_ctx(conn, role="receptionist") -> StaffContext:
    s = await seed_staff(conn, role=role)
    return StaffContext(id=s["staff_id"], auth_user_id=s["auth_user_id"], role=role, department_id=None)


# ─── 요청 ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_request_sends_code_to_new_phone_and_records_request(committed_conn):
    """[PTDET-ACTION-02] 새 번호로 6자리를 보내고 요청 행을 남긴다(감사)."""
    staff = await _seed_staff_ctx(committed_conn)
    p = await seed_patient(committed_conn, phone="01011112222")
    new_phone = "01099998888"
    sms = _FakeSms()

    rid = await svc.request_phone_change(staff, p["patient_id"], new_phone, sms_client=sms)

    assert rid is not None
    assert len(sms.sent) == 1
    to, body = sms.sent[0]
    assert to == "01099998888"                        # 새 번호로 나간다(㉯ 소유 증명)
    assert "전화번호 변경" in body and "5분" in body
    row = await committed_conn.fetchrow(
        "select * from patient_phone_change_requests where id=$1", rid)
    assert row["patient_id"] == p["patient_id"]
    assert row["staff_id"] == staff.id                # 누가 시작했나(감사)
    assert row["new_phone_masked"] == "010-****-8888"  # 원문은 안 쌓는다
    assert row["verified_at"] is None
    assert row["expires_at"] > datetime.now(timezone.utc) + timedelta(minutes=4)


@pytest.mark.asyncio
async def test_request_unknown_patient_rejected(committed_conn):
    """존재하지 않는 환자는 요청 전에 막는다(문자도 안 나간다)."""
    staff = await _seed_staff_ctx(committed_conn)
    sms = _FakeSms()
    with pytest.raises(AppError) as e:
        await svc.request_phone_change(staff, uuid4(), _uphone(), sms_client=sms)
    assert e.value.status_code == 404
    assert sms.sent == []


@pytest.mark.asyncio
async def test_request_resend_cooldown_returns_429(committed_conn):
    """[갭 #16] 같은 환자·같은 새 번호로 30초 안에 다시 요청하면 429 + Retry-After."""
    staff = await _seed_staff_ctx(committed_conn)
    p = await seed_patient(committed_conn)
    new_phone = _uphone()
    sms = _FakeSms()
    await svc.request_phone_change(staff, p["patient_id"], new_phone, sms_client=sms)

    with pytest.raises(AppError) as e:
        await svc.request_phone_change(staff, p["patient_id"], new_phone, sms_client=sms)
    assert e.value.status_code == 429
    assert e.value.retry_after_seconds and e.value.retry_after_seconds > 0
    assert len(sms.sent) == 1                          # 두 번째는 문자 안 보냄


# ─── 확인 ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_confirm_correct_code_updates_phone_and_syncs_auth(committed_conn):
    """[PTDET-ACTION-02][결정 #4 ⓑ] 코드가 맞으면 patients.phone + Auth를 바꾸고 감사 한 줄을 남긴다."""
    staff = await _seed_staff_ctx(committed_conn)
    p = await seed_patient(committed_conn, phone="01011112222")
    new_phone = "01099998888"
    sms = _FakeSms()
    auth = _FakeAuthSync()
    await svc.request_phone_change(staff, p["patient_id"], new_phone, sms_client=sms)
    code = _code(sms.sent[0][1])

    await svc.confirm_phone_change(staff, p["patient_id"], new_phone, code, auth_sync=auth)

    phone = await committed_conn.fetchval("select phone from patients where id=$1", p["patient_id"])
    assert re.sub(r"\D", "", phone) == "01099998888"
    assert auth.calls == [(p["auth_user_id"], "01099998888")]   # Auth 동기화 호출됨
    row = await committed_conn.fetchrow(
        "select verified_at, old_phone_masked from patient_phone_change_requests where patient_id=$1",
        p["patient_id"])
    assert row["verified_at"] is not None             # 언제(변경 이력)
    assert row["old_phone_masked"] == "010-****-2222"  # 어느 번호→(마스킹)


@pytest.mark.asyncio
async def test_confirm_wrong_code_keeps_old_phone_and_counts(committed_conn):
    """[PTDET-ACTION-03] 코드가 틀리면 기존 번호를 지키고 시도만 센다."""
    staff = await _seed_staff_ctx(committed_conn)
    p = await seed_patient(committed_conn, phone="01011112222")
    new_phone = "01099998888"
    sms = _FakeSms()
    auth = _FakeAuthSync()
    await svc.request_phone_change(staff, p["patient_id"], new_phone, sms_client=sms)

    with pytest.raises(AppError) as e:
        await svc.confirm_phone_change(staff, p["patient_id"], new_phone, "000000", auth_sync=auth)
    assert e.value.status_code == 400

    phone = await committed_conn.fetchval("select phone from patients where id=$1", p["patient_id"])
    assert phone == "01011112222"                     # 기존 번호가 산다
    assert auth.calls == []                            # Auth 안 건드림
    attempts = await committed_conn.fetchval(
        "select attempts from patient_phone_change_requests where patient_id=$1", p["patient_id"])
    assert attempts == 1                               # 시도는 커밋돼 남는다


@pytest.mark.asyncio
async def test_confirm_auth_sync_failure_rolls_back(committed_conn):
    """[결정 #4 ⓑ] Auth 동기화가 실패하면 patients.phone도 되돌린다(부분 성공 방지)."""
    staff = await _seed_staff_ctx(committed_conn)
    p = await seed_patient(committed_conn, phone="01011112222")
    new_phone = "01099998888"
    sms = _FakeSms()
    auth = _FakeAuthSync(fail=True)
    await svc.request_phone_change(staff, p["patient_id"], new_phone, sms_client=sms)
    code = _code(sms.sent[0][1])

    with pytest.raises(AppError) as e:
        await svc.confirm_phone_change(staff, p["patient_id"], new_phone, code, auth_sync=auth)
    assert e.value.status_code == 503

    phone = await committed_conn.fetchval("select phone from patients where id=$1", p["patient_id"])
    assert phone == "01011112222"                     # 롤백 — 기존 번호 유지
    verified = await committed_conn.fetchval(
        "select verified_at from patient_phone_change_requests where patient_id=$1", p["patient_id"])
    assert verified is None                            # 요청도 검증 전으로 롤백


@pytest.mark.asyncio
async def test_confirm_patient_without_account_skips_auth_sync(committed_conn):
    """계정 없는 환자(㉮ auth_user_id null)는 patients.phone만 바꾸고 Auth는 건드리지 않는다."""
    staff = await _seed_staff_ctx(committed_conn)
    p = await seed_patient(committed_conn, phone="01011112222", with_auth=False)
    new_phone = "01099998888"
    sms = _FakeSms()
    auth = _FakeAuthSync()
    await svc.request_phone_change(staff, p["patient_id"], new_phone, sms_client=sms)
    code = _code(sms.sent[0][1])

    await svc.confirm_phone_change(staff, p["patient_id"], new_phone, code, auth_sync=auth)

    phone = await committed_conn.fetchval("select phone from patients where id=$1", p["patient_id"])
    assert re.sub(r"\D", "", phone) == "01099998888"
    assert auth.calls == []                            # 계정 없으면 Auth 동기화 없음


@pytest.mark.asyncio
async def test_confirm_expired_code_rejected(committed_conn):
    """[결정 #4] 만료된 코드는 거부한다 — 다시 받게 안내."""
    staff = await _seed_staff_ctx(committed_conn)
    p = await seed_patient(committed_conn, phone="01011112222")
    new_phone = "01099998888"
    sms = _FakeSms()
    auth = _FakeAuthSync()
    await svc.request_phone_change(staff, p["patient_id"], new_phone, sms_client=sms)
    code = _code(sms.sent[0][1])
    await committed_conn.execute(
        "update patient_phone_change_requests set expires_at = now() - interval '1 minute' "
        "where patient_id=$1", p["patient_id"])

    with pytest.raises(AppError) as e:
        await svc.confirm_phone_change(staff, p["patient_id"], new_phone, code, auth_sync=auth)
    assert e.value.status_code == 400
    phone = await committed_conn.fetchval("select phone from patients where id=$1", p["patient_id"])
    assert phone == "01011112222"                     # 기존 번호 유지
    assert auth.calls == []
