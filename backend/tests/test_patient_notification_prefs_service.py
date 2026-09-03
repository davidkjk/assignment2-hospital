import pytest

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.db.pool import acquire_as
from app.services import patient_notification_prefs_service as prefs
from tests.conftest import seed_patient


def _ctx(me: dict) -> PatientContext:
    return PatientContext(id=me["patient_id"], auth_user_id=me["auth_user_id"])


def test_일곱_토글이_모든_종류를_빠짐없이_덮는다():
    """[SET-NOTI-04] 2묶음·7토글. 지금 발송되는 모든 notification_type이 정확히 한 토글씩에 든다 —
    빠지면 그 알림은 끌 방법이 없고(SET-NOTI-01 위반), 겹치면 한 토글이 남의 알림을 끈다.
    ⚠️ support_answered(4단계 챗봇)는 아직 MESSAGES에 없는 예정 종류라 초과분으로만 허용
    (questionnaire_partial·family_linked는 이제 MESSAGES에 들어와 실제 발송 종류가 됐다)."""
    from app.services.notification_service import MESSAGES  # T9의 코드 기본 문구 표(=발송되는 종류)
    covered = [t for types in prefs.TOGGLE_GROUPS.values() for t in types]
    assert len(covered) == len(set(covered))                       # 겹침 없음
    assert set(MESSAGES) <= set(covered)                           # 발송되는 종류는 전부 덮인다
    assert set(covered) - set(MESSAGES) == {"support_answered"}    # 초과=예정 1종뿐(챗봇)


def test_토글_묶음이_설계대로다():
    """[SET-NOTI-04][SET-NOTI-05] 예약 3토글(변경·취소 / 신청·확정 / 전날·당일) + 그밖 4토글(문진·진료후·상담답변·가족연결)."""
    assert prefs.TOGGLE_GROUPS["appt_change"] == \
        ["changed", "hospital_cancelled", "cancellation_approved", "cancellation_rejected"]
    assert prefs.TOGGLE_GROUPS["appt_reminder"] == ["reminder_day_before", "reminder_today"]
    assert prefs.TOGGLE_GROUPS["questionnaire"] == ["questionnaire_missing", "questionnaire_partial"]


@pytest.mark.asyncio
async def test_줄이_없으면_일곱_토글이_모두_켜짐(committed_conn):
    """[SET-NOTI-01][00012 「줄 없으면 켜짐」] 새 환자는 아무 선호 행이 없다 → 전부 True."""
    me = await seed_patient(committed_conn)
    got = await prefs.get_prefs(_ctx(me))
    assert got == {k: True for k in prefs.TOGGLE_GROUPS}            # 7키 전부 True


@pytest.mark.asyncio
async def test_토글을_끄면_그_그룹의_모든_종류가_꺼진다(committed_conn):
    """[SET-NOTI-12][SET-NOTI-01] 「변경·취소」 하나를 끄면 그 그룹의 네 종류가 다 off.
    T9 notify_patient가 종류별로 enabled를 읽으므로 그룹의 모든 행을 써야 실제로 안 온다."""
    me = await seed_patient(committed_conn)
    after = await prefs.set_pref(_ctx(me), "appt_change", enabled=False)
    assert after["appt_change"] is False and after["appt_status"] is True   # 그 토글만
    got = await prefs.get_prefs(_ctx(me))
    assert got["appt_change"] is False                                       # 다시 읽어도 off
    async with acquire_as(str(me["auth_user_id"])) as conn:
        rows = await conn.fetch("select notification_type, enabled from notification_preferences "
                                "where patient_id=$1", me["patient_id"])
    off = {r["notification_type"] for r in rows if not r["enabled"]}
    assert off == set(prefs.TOGGLE_GROUPS["appt_change"])                    # 그룹 네 종류 모두 off


@pytest.mark.asyncio
async def test_모르는_토글은_거부(committed_conn):
    """[SET-NOTI-12] 화면에 없는 group 키가 오면 400 — 임의 종류를 끄는 우회를 막는다."""
    me = await seed_patient(committed_conn)
    with pytest.raises(AppError):
        await prefs.set_pref(_ctx(me), "everything", enabled=False)
