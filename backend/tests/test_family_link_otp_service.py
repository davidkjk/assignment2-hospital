"""㉯ 기존 환자 가족 연결 OTP 창구 — 갭 #58·#60·#62·#16을 한꺼번에 지키는 그물.

⚠️ 하네스 보정(형제 test_patient_family_service.py와 같은 이유): 서비스가 자기 커넥션(get_pool)을
   열어 커밋된 데이터만 본다 → 롤백 db_conn 대신 committed_conn(postgres 역할=RLS 우회, autouse
   cleanup이 뒷정리)으로 시딩·검증한다. (플랜 원안의 db_conn은 자기커넥션 서비스에 안 맞다.)
"""
import re
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services import family_link_otp_service as svc
from app.services import patient_family_service
from tests.conftest import seed_patient


def _uphone() -> str:
    return f"010{uuid4().int % 100000000:08d}"   # 유니크 전화(계정 여럿 시딩 시 충돌 방지)


async def _seed_account(conn, *, name="김보호", birth=date(1980, 1, 1), phone=None) -> PatientContext:
    seed = await seed_patient(conn, name=name, phone=phone or _uphone(), birth_date=birth)
    return PatientContext(id=seed["patient_id"], auth_user_id=seed["auth_user_id"])


class _FakeSms:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    def send_sms(self, phone: str, body: str) -> None:
        self.sent.append((phone, body))


def _extract_code(body: str) -> str:
    """문자 본문에서 6자리 코드만 뽑는다(테스트 전용 — 실제 앱은 사용자가 문자를 보고 친다).

    ⚠️ `\\b(\\d{6})\\b`를 쓰지 않는다 — 한글(입니다)이 파이썬 유니코드에서 \\w라 6자리 코드 뒤에
       단어 경계가 생기지 않아 매치가 실패한다(`499023입니다`). 본문에 6자리 연속 숫자는 코드뿐이다.
    """
    m = re.search(r"(\d{6})", body)
    assert m, f"문자에 6자리 코드가 없다: {body}"
    return m.group(1)


async def _seed_hospital_patient(conn, *, name="김영수", birth=date(1948, 5, 20), phone="01012345678"):
    """병원 접수에서 등록된 환자 — 앱이 만든 행이 아니다(app_created_by is null)."""
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ($1,$2,'M',$3) returning id",
        name, birth, phone)


async def _force_link(conn, account_id, family_id, *, relation: str) -> None:
    await conn.execute(
        "insert into patient_family_links (account_patient_id, family_patient_id, relation) values ($1,$2,$3)",
        account_id, family_id, relation)


# ─── Step 3: 요청 창구 ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sends_code_when_exactly_one_match(committed_conn):
    """[FAM-LINK-04][FAM-LINK-20] 정확히 1건일 때만 그 사람 번호로 6자리를 보낸다."""
    me = await _seed_account(committed_conn)
    target = await _seed_hospital_patient(committed_conn)
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
        relation="부모", sms_client=sms)
    assert rid is not None
    assert len(sms.sent) == 1
    to, body = sms.sent[0]
    assert to == "01012345678"                      # FAM-LINK-05: 남의 번호로 나간다
    assert "가족 연결" in body and "5분" in body      # 갭 #42: 한글 문자
    assert len([c for c in body if c.isdigit()]) >= 6
    row = await committed_conn.fetchrow("select * from family_link_requests where id=$1", rid)
    assert row["target_patient_id"] == target
    assert row["relation"] == "부모"                 # FAM-LINK-02: 입력한 관계를 보관한다
    assert row["expires_at"] > datetime.now(timezone.utc) + timedelta(minutes=4)   # FAM-LINK-04: 5분


@pytest.mark.asyncio
async def test_no_match_still_returns_request_id_and_sends_nothing(committed_conn):
    """[FAM-LINK-06][FAM-LINK-08] 후보 0건이어도 화면은 똑같이 진행한다 — 문자만 오지 않는다."""
    me = await _seed_account(committed_conn)
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="없는사람", birth_date=date(1900, 1, 1), phone="01000000000",
        relation="부모", sms_client=sms)
    assert rid is not None                           # 404가 아니다(갭 #58)
    assert sms.sent == []
    row = await committed_conn.fetchrow("select * from family_link_requests where id=$1", rid)
    assert row["target_patient_id"] is None          # 행은 남는다 — 응답을 갈리게 하지 않으려고
    assert row["code_hash"] is not None              # 코드도 만든다(분기 자체를 없앤다)


@pytest.mark.asyncio
async def test_two_matches_behaves_like_no_match(committed_conn):
    """[FAM-LINK-18][FAM-LINK-19][FAM-LINK-20] 동명이인 2건이면 특정하지 않는다 — 0건과 같은 응답."""
    me = await _seed_account(committed_conn)
    await _seed_hospital_patient(committed_conn)
    await _seed_hospital_patient(committed_conn)      # 이름·생년월일·번호가 같은 두 행
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
        relation="부모", sms_client=sms)
    assert rid is not None and sms.sent == []         # 잘못 이으면 남의 진료기록에 연결된다
    assert await committed_conn.fetchval(
        "select target_patient_id from family_link_requests where id=$1", rid) is None


@pytest.mark.asyncio
async def test_self_is_rejected_with_plain_reason(committed_conn):
    """[FAM-LINK-10][FAM-LINK-11][FAM-LINK-12] 본인은 사실대로 막는다 — 내가 아는 정보는 열거가 아니다."""
    me = await _seed_account(committed_conn, name="김보호", birth=date(1980, 2, 2), phone="01099998888")
    sms = _FakeSms()
    with pytest.raises(AppError) as e:
        await svc.request_family_link_otp(
            me, name="김보호", birth_date=date(1980, 2, 2), phone="01099998888",
            relation="부모", sms_client=sms)
    assert e.value.status_code == 409
    assert "본인은 가족으로 추가할 수 없습니다" in str(e.value)
    assert sms.sent == []                            # 내 폰으로 인증번호가 오지 않는다


@pytest.mark.asyncio
async def test_already_linked_is_rejected_with_plain_reason(committed_conn):
    """[FAM-LINK-09][FAM-LINK-12] 이미 연결된 가족도 사실대로 — 서버가 판정한다(앱 목록은 낡을 수 있다)."""
    me = await _seed_account(committed_conn)
    target = await _seed_hospital_patient(committed_conn)
    await _force_link(committed_conn, me.id, target, relation="부모")
    with pytest.raises(AppError) as e:
        await svc.request_family_link_otp(
            me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
            relation="부모", sms_client=_FakeSms())
    assert e.value.status_code == 409
    assert "이미 가족으로 연결되어 있습니다" in str(e.value)


@pytest.mark.asyncio
async def test_family_limit_blocks_before_sending(committed_conn):
    """[#62] 상한 10명은 문자를 보내기 전에 걸린다 — ㉯도 명부에 연결선을 하나 더 만드는 일이다."""
    me = await _seed_account(committed_conn)
    for i in range(10):
        await patient_family_service.add_family_member(me, f"가족{i}", date(2010, 1, 1), "M", "자녀")
    await _seed_hospital_patient(committed_conn)
    sms = _FakeSms()
    with pytest.raises(AppError) as e:
        await svc.request_family_link_otp(
            me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
            relation="부모", sms_client=sms)
    assert e.value.status_code == 409 and "최대 10명" in str(e.value)
    assert sms.sent == []


@pytest.mark.asyncio
async def test_resend_interval_is_enforced_by_server(committed_conn):
    """[FAM-LINK-22][#16] 30초 간격은 서버가 검사한다 — 앱 쿨다운은 앱을 거치는 요청만 막는다."""
    me = await _seed_account(committed_conn)
    await _seed_hospital_patient(committed_conn)
    args = dict(name="김영수", birth_date=date(1948, 5, 20), phone="01012345678", relation="부모")
    await svc.request_family_link_otp(me, sms_client=_FakeSms(), **args)
    with pytest.raises(AppError) as e:
        await svc.request_family_link_otp(me, sms_client=_FakeSms(), **args)
    assert e.value.status_code == 429
    assert e.value.retry_after_seconds > 0           # 앱이 버튼 숫자를 서버 값에 맞춘다
    # 31초 전에 보낸 것으로 되돌리면 다시 통과한다.
    await committed_conn.execute(
        "update family_link_requests set created_at = now() - interval '31 seconds' "
        "where requesting_patient_id=$1", me.id)
    assert await svc.request_family_link_otp(me, sms_client=_FakeSms(), **args) is not None


@pytest.mark.asyncio
async def test_cooldown_follows_the_phone_number_not_the_account(committed_conn):
    """[FAM-LINK-05] 쿨다운 기준은 전화번호다 — 남의 번호로 보내는 유일한 창구라 번호를 지켜야 한다."""
    a = await _seed_account(committed_conn, name="딸", phone="01011112222")
    b = await _seed_account(committed_conn, name="아들", phone="01033334444")
    await _seed_hospital_patient(committed_conn)
    args = dict(name="김영수", birth_date=date(1948, 5, 20), phone="01012345678", relation="부모")
    await svc.request_family_link_otp(a, sms_client=_FakeSms(), **args)
    with pytest.raises(AppError) as e:
        await svc.request_family_link_otp(b, sms_client=_FakeSms(), **args)   # 다른 계정, 같은 번호
    assert e.value.status_code == 429


@pytest.mark.asyncio
async def test_target_without_phone_is_indistinguishable(committed_conn):
    """[FAM-LINK-13] 번호가 바뀐 가족: 새 번호로는 0건이라 문자가 오지 않는다 — 화면은 똑같다."""
    me = await _seed_account(committed_conn)
    await _seed_hospital_patient(committed_conn, phone="01012345678")     # 병원 기록엔 옛 번호
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="김영수", birth_date=date(1948, 5, 20), phone="01055556666",   # 새 번호
        relation="부모", sms_client=sms)
    assert rid is not None and sms.sent == []       # 앱이 판정할 수 없다 → 병원 문의 경로(FAM-LINK-14)


# ─── Step 4: 확인 창구 ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_confirm_links_with_typed_relation(committed_conn):
    """[FAM-LINK-02][FAM-LINK-21] 관계는 입력한 값으로 저장된다 — '가족(연결)' 하드코딩을 버린다."""
    me = await _seed_account(committed_conn)
    target = await _seed_hospital_patient(committed_conn)
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
        relation="부모", sms_client=sms)
    code = _extract_code(sms.sent[0][1])
    linked = await svc.confirm_family_link_otp(me, rid, code)
    assert linked == target
    assert await committed_conn.fetchval(
        "select relation from patient_family_links where account_patient_id=$1 and family_patient_id=$2",
        me.id, target) == "부모"


@pytest.mark.asyncio
async def test_confirm_keeps_hospital_record_as_hospital_owned(committed_conn):
    """[FAM-EDIT 계열 전제] ㉯로 이은 사람의 환자 행은 병원 것이다 — app_created_by를 채우지 않는다."""
    me = await _seed_account(committed_conn)
    target = await _seed_hospital_patient(committed_conn)
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
        relation="부모", sms_client=sms)
    await svc.confirm_family_link_otp(me, rid, _extract_code(sms.sent[0][1]))
    assert await committed_conn.fetchval("select app_created_by from patients where id=$1", target) is None
    # → T25 판정에서 can_edit_identity=false, identity_lock_reason='linked'가 된다.


@pytest.mark.asyncio
async def test_confirm_rejects_wrong_expired_and_foreign_requests(committed_conn):
    """틀린 코드·만료·남의 요청은 전부 막는다 — 그리고 대상 없는 요청도 '틀림'으로 끝난다(#58)."""
    me = await _seed_account(committed_conn)
    other = await _seed_account(committed_conn, name="남", phone="01077776666")
    await _seed_hospital_patient(committed_conn)
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
        relation="부모", sms_client=sms)

    with pytest.raises(AppError) as e:
        await svc.confirm_family_link_otp(me, rid, "000000")
    assert "인증번호가 올바르지 않습니다" in str(e.value)

    with pytest.raises(AppError):                                  # 남의 요청 id
        await svc.confirm_family_link_otp(other, rid, _extract_code(sms.sent[0][1]))

    await committed_conn.execute(
        "update family_link_requests set expires_at = now() - interval '1 minute' where id=$1", rid)
    with pytest.raises(AppError) as e:
        await svc.confirm_family_link_otp(me, rid, _extract_code(sms.sent[0][1]))
    assert "만료" in str(e.value)


@pytest.mark.asyncio
async def test_confirm_on_phantom_request_fails_like_a_wrong_code(committed_conn):
    """[FAM-LINK-06][FAM-LINK-07] 대상 없는 요청도 「틀린 인증번호」로 끝난다 — 특별한 분기가 없다."""
    me = await _seed_account(committed_conn)
    rid = await svc.request_family_link_otp(
        me, name="없는사람", birth_date=date(1900, 1, 1), phone="01000000000",
        relation="부모", sms_client=_FakeSms())
    with pytest.raises(AppError) as e:
        await svc.confirm_family_link_otp(me, rid, "123456")
    assert "인증번호가 올바르지 않습니다" in str(e.value)   # 「그런 환자 없습니다」가 아니다


@pytest.mark.asyncio
async def test_confirm_is_single_use(committed_conn):
    """한 번 쓴 요청은 다시 못 쓴다 — 문자를 한 번 본 사람이 계속 연결을 만들 수 없다."""
    me = await _seed_account(committed_conn)
    await _seed_hospital_patient(committed_conn)
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
        relation="부모", sms_client=sms)
    code = _extract_code(sms.sent[0][1])
    await svc.confirm_family_link_otp(me, rid, code)
    with pytest.raises(AppError) as e:
        await svc.confirm_family_link_otp(me, rid, code)
    assert "이미 처리된 요청입니다" in str(e.value)


@pytest.mark.asyncio
async def test_confirm_stops_after_five_wrong_attempts(committed_conn):
    """6자리를 무한히 넣어보지 못하게 한다(Step 1 주석 — 규칙 밖의 추가 방어)."""
    me = await _seed_account(committed_conn)
    await _seed_hospital_patient(committed_conn)
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
        relation="부모", sms_client=sms)
    for _ in range(5):
        with pytest.raises(AppError):
            await svc.confirm_family_link_otp(me, rid, "000000")
    with pytest.raises(AppError) as e:
        await svc.confirm_family_link_otp(me, rid, _extract_code(sms.sent[0][1]))   # 맞는 코드여도
    assert "다시 받아" in str(e.value)


@pytest.mark.asyncio
async def test_confirm_reactivates_previously_unlinked(committed_conn):
    """[FAM-UNLINK-12] 해제했던 가족을 ㉯로 다시 이으면 같은 줄이 되살아난다(새 줄을 만들지 않는다)."""
    me = await _seed_account(committed_conn)
    target = await _seed_hospital_patient(committed_conn)
    await _force_link(committed_conn, me.id, target, relation="부모")
    await patient_family_service.unlink_family_member(me, target)
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
        relation="어머니", sms_client=sms)
    assert await svc.confirm_family_link_otp(me, rid, _extract_code(sms.sent[0][1])) == target
    rows = await committed_conn.fetch(
        "select relation, is_active from patient_family_links "
        "where account_patient_id=$1 and family_patient_id=$2", me.id, target)
    assert len(rows) == 1 and rows[0]["is_active"] is True and rows[0]["relation"] == "어머니"


@pytest.mark.asyncio
async def test_confirm_rechecks_the_limit(committed_conn):
    """[#62] 상한은 확인 시점에도 다시 본다 — 요청과 확인 사이에 다른 창에서 10명을 채울 수 있다."""
    me = await _seed_account(committed_conn)
    await _seed_hospital_patient(committed_conn)
    sms = _FakeSms()
    rid = await svc.request_family_link_otp(
        me, name="김영수", birth_date=date(1948, 5, 20), phone="01012345678",
        relation="부모", sms_client=sms)
    for i in range(10):
        await patient_family_service.add_family_member(me, f"가족{i}", date(2010, 1, 1), "M", "자녀")
    with pytest.raises(AppError) as e:
        await svc.confirm_family_link_otp(me, rid, _extract_code(sms.sent[0][1]))
    assert e.value.status_code == 409 and "최대 10명" in str(e.value)
