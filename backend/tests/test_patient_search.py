"""[SEARCH-IMPL-*][SEARCH-MATCH-*][SEARCH-AND-*][SEARCH-ORDER-*][SEARCH-RESULT-*][SEARCH-WHY-*]
Task 24a — /patients 전역 환자 검색의 **조회 쿼리·커서**만 본다.

⭐ 마스킹·감사 적재(MASK-*·SEARCH-LOG-01~05)는 Task 6·15가 이미 테스트했다. 여기는 조회
   자체(부분일치·다중필드·정렬·페이징·이유 배지·오늘 상태)를 소유한다.

시드 패턴(Task 13과 동일): 환자·예약은 db_conn 트랜잭션에 소유자로 넣고 conn=db_conn으로
   같은 트랜잭션에서 RLS를 적용해 조회한다. 단 검색 감사(_log_search)는 서비스풀에 커밋되며
   staff_id FK가 걸려 있어, 검색을 실행하는 receptionist만 committed_conn에 심는다.
"""
import random
from datetime import date, time

import pytest

from app.services.patient_service import _classify_fragment, search_patients
from tests.conftest import seed_staff, set_session_auth
from tests.task13_fixtures import (
    db_today,
    seed_appointment,
    seed_department,
    seed_doctor,
    seed_patient,
    seed_slot,
    to_context,
)


async def _receptionist(committed_conn, db_conn):
    """검색을 실행하는 접수직원 — 감사 FK 때문에 커밋된 staff여야 하고, READ COMMITTED라
    db_conn의 RLS 조회에서도 보인다. 시드를 마친 뒤 db_conn을 이 직원 세션으로 전환한다."""
    seed = await seed_staff(committed_conn, role="receptionist")
    return to_context(seed, "receptionist"), seed["auth_user_id"]


# ── 조각 분류 정규화 (속성 테스트) ─────────────────────────────────────────────

def _sprinkle_separators(digits: str) -> str:
    out = []
    for ch in digits:
        out.append(ch)
        if random.random() < 0.3:
            out.append(random.choice("-. "))
    return "".join(out)


def test_MATCH_03_숫자조각_판정은_어떤_형태에서도_숫자를_잃지_않는다():
    """[SEARCH-MATCH-03][SEARCH-IMPL-01] 구분자가 섞여도 같은 숫자로 분류하고, 한글이 섞이면 이름이다."""
    random.seed(24)
    for _ in range(3000):
        digits = "".join(random.choice("0123456789") for _ in range(random.randint(1, 11)))
        kind, val = _classify_fragment(_sprinkle_separators(digits))
        assert kind == "number" and val == digits
        assert _classify_fragment(digits + random.choice("김이박최"))[0] == "name"


# ── 다중 필드 부분 일치 ────────────────────────────────────────────────────────

async def test_MATCH_01_이름의_일부로_찾는다(committed_conn, db_conn):
    """[SEARCH-MATCH-01][SEARCH-IMPL-01] 김만 넣어도 김철수가 나온다 — 완전 일치가 아니다."""
    recep, auth = await _receptionist(committed_conn, db_conn)
    await seed_patient(db_conn, name="김철수")
    await seed_patient(db_conn, name="박영희")
    await set_session_auth(db_conn, auth)

    page = await search_patients("김", recep, conn=db_conn)
    assert [r["name"] for r in page.rows] == ["김철수"]


async def test_MATCH_02_숫자는_전화와_생일_양쪽에_맞힌다(committed_conn, db_conn):
    """[SEARCH-MATCH-02] 어느 쪽을 찾는지 직원이 고르지 않는다."""
    recep, auth = await _receptionist(committed_conn, db_conn)
    p_tel = await seed_patient(db_conn, name="전화맞음", phone="01099991234", birth_date=date(1985, 5, 5))
    p_dob = await seed_patient(db_conn, name="생일맞음", phone="01000000000", birth_date=date(1958, 12, 3))
    await set_session_auth(db_conn, auth)

    by_birth = await search_patients("1203", recep, conn=db_conn)
    assert {r["id"] for r in by_birth.rows} == {p_dob}
    by_phone = await search_patients("1234", recep, conn=db_conn)
    assert {r["id"] for r in by_phone.rows} == {p_tel}


async def test_MATCH_03_하이픈과_점을_지우고_비교한다(committed_conn, db_conn):
    """[SEARCH-MATCH-03] 환자가 불러준 010-1234를 그대로 붙여넣어도 통한다."""
    recep, auth = await _receptionist(committed_conn, db_conn)
    p = await seed_patient(db_conn, phone="01012345678")
    await set_session_auth(db_conn, auth)

    page = await search_patients("010-1234", recep, conn=db_conn)
    assert p in {r["id"] for r in page.rows}


async def test_MATCH_04_가려진_자리도_검색된다(committed_conn, db_conn):
    """[SEARCH-MATCH-04] 전화 중간 4자리·생년월일 월(가린 자리)도 원본으로 맞힌다."""
    recep, auth = await _receptionist(committed_conn, db_conn)
    p = await seed_patient(db_conn, phone="01012345678", birth_date=date(1958, 3, 12))
    await set_session_auth(db_conn, auth)

    mid = await search_patients("345", recep, conn=db_conn)
    assert p in {r["id"] for r in mid.rows}
    masked_month = await search_patients("1958-03", recep, conn=db_conn)
    assert p in {r["id"] for r in masked_month.rows}


async def test_AND_01_공백_조각을_전부_만족해야_나온다(committed_conn, db_conn):
    """[SEARCH-AND-01] 공백으로 나눈 조각을 전부 만족하는 사람만 나온다."""
    recep, auth = await _receptionist(committed_conn, db_conn)
    hit = await seed_patient(db_conn, name="김철수", phone="01099991234")
    await seed_patient(db_conn, name="김영희", phone="01055556789")
    await set_session_auth(db_conn, auth)

    page = await search_patients("김 1234", recep, conn=db_conn)
    assert {r["id"] for r in page.rows} == {hit}


# ── 왜 걸렸는지(matched 배지) ──────────────────────────────────────────────────

async def test_WHY_01_03_맞은_항목을_matched로_돌려준다(committed_conn, db_conn):
    """[SEARCH-WHY-01·03] 이름·전화·생일 중 무엇에 걸렸는지 줄마다 알린다."""
    recep, auth = await _receptionist(committed_conn, db_conn)
    p = await seed_patient(db_conn, name="김철수", phone="01099991234", birth_date=date(1985, 3, 1))
    await set_session_auth(db_conn, auth)

    both = await search_patients("김 1234", recep, conn=db_conn)
    row = next(r for r in both.rows if r["id"] == p)
    assert row["matched"] == ["name", "phone"]

    birth = await search_patients("1985", recep, conn=db_conn)
    row2 = next(r for r in birth.rows if r["id"] == p)
    assert row2["matched"] == ["birth"]


# ── 정렬·오늘 상태 ────────────────────────────────────────────────────────────

async def test_ORDER_01_06_오늘_볼_사람이_먼저오고_예약시각을_함께_준다(committed_conn, db_conn):
    """[SEARCH-ORDER-01·06][SEARCH-ACT-*] 오늘 예약이 있는 환자가 맨 위 묶음이고, 그 줄에
    오늘 예약 시각과 오늘 상태를 함께 준다."""
    recep, auth = await _receptionist(committed_conn, db_conn)
    dept = await seed_department(db_conn)
    doctor = await seed_doctor(db_conn, dept)
    today = await db_today(db_conn)
    a = await seed_patient(db_conn, name="환자갑")
    b = await seed_patient(db_conn, name="환자을")
    slot = await seed_slot(db_conn, doctor["staff_id"], today, start_time=time(14, 30))
    await seed_appointment(
        db_conn, doctor_id=doctor["staff_id"], department_id=dept, patient_id=a,
        slot_id=slot, status="예약확정",
    )
    await set_session_auth(db_conn, auth)

    page = await search_patients("환자", recep, conn=db_conn)
    assert [r["id"] for r in page.rows] == [a, b]
    top = page.rows[0]
    assert top["today_status"] == "booked"
    assert top["today_appointment_time"] == "14:30"
    assert page.rows[1]["today_status"] is None
    assert page.rows[1]["today_appointment_time"] is None


async def test_ORDER_03_오늘이_없으면_이름_가나다순으로_안정_정렬된다(committed_conn, db_conn):
    """[SEARCH-ORDER-03·04] 앞선 기준이 같으면 이름 가나다순, 그다음 고유번호로 못박는다."""
    recep, auth = await _receptionist(committed_conn, db_conn)
    await seed_patient(db_conn, name="김나")
    await seed_patient(db_conn, name="김가")
    await set_session_auth(db_conn, auth)

    page = await search_patients("김", recep, conn=db_conn)
    assert [r["name"] for r in page.rows] == ["김가", "김나"]


# ── 페이징 커서 (20건씩 이어받기) ─────────────────────────────────────────────

async def test_RESULT_02_03_스무건씩_커서로_이어받는다(committed_conn, db_conn):
    """[SEARCH-RESULT-02·03][SEARCH-IMPL-02·03] 20건을 먼저 주고, 커서로 겹치지도 빠지지도
    않게 다음 묶음을 잇는다."""
    recep, auth = await _receptionist(committed_conn, db_conn)
    for i in range(25):
        await seed_patient(db_conn, name=f"환자{i:02d}")
    await set_session_auth(db_conn, auth)

    page1 = await search_patients("환자", recep, conn=db_conn)
    assert len(page1.rows) == 20
    assert page1.has_more is True
    assert page1.next_cursor is not None

    page2 = await search_patients("환자", recep, conn=db_conn, cursor=page1.next_cursor)
    assert len(page2.rows) == 5
    assert page2.has_more is False

    ids1 = {r["id"] for r in page1.rows}
    ids2 = {r["id"] for r in page2.rows}
    assert ids1.isdisjoint(ids2)
    assert len(ids1 | ids2) == 25


@pytest.mark.asyncio
async def test_빈_검색어는_활성_환자를_돌려준다(committed_conn, db_conn):
    """[SEARCH-IMPL-01] 검색어가 없으면(첫 진입) 활성 환자를 정렬해 준다 — matched는 비어 있다."""
    recep, auth = await _receptionist(committed_conn, db_conn)
    await seed_patient(db_conn, name="김철수")
    await set_session_auth(db_conn, auth)

    page = await search_patients(None, recep, conn=db_conn)
    assert [r["name"] for r in page.rows] == ["김철수"]
    assert page.rows[0]["matched"] == []
