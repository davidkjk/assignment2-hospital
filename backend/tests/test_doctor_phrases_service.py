import pytest

from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import doctor_phrases
from tests.conftest import seed_staff, set_session_auth


def _to_context(seed: dict, role: str) -> StaffContext:
    return StaffContext(
        id=seed["staff_id"],
        auth_user_id=seed["auth_user_id"],
        role=role,
        department_id=None,
    )


@pytest.mark.asyncio
async def test_의사는_본인_문구만_보고_고친다(db_conn):
    doctor_one = _to_context(await seed_staff(db_conn, role="doctor"), "doctor")
    doctor_two = _to_context(await seed_staff(db_conn, role="doctor"), "doctor")

    await set_session_auth(db_conn, doctor_one.auth_user_id)
    mine = await doctor_phrases.add_phrase(
        doctor=doctor_one,
        text="목이 부었습니다",
        conn=db_conn,
    )

    await set_session_auth(db_conn, doctor_two.auth_user_id)
    await doctor_phrases.add_phrase(
        doctor=doctor_two,
        text="다른 의사 문구",
        conn=db_conn,
    )

    await set_session_auth(db_conn, doctor_one.auth_user_id)
    phrases = await doctor_phrases.list_phrases(doctor_one.id, doctor_one, conn=db_conn)
    assert [phrase["id"] for phrase in phrases] == [mine]

    await doctor_phrases.update_phrase(
        mine,
        "목이 많이 부었습니다",
        staff=doctor_one,
        conn=db_conn,
    )
    await doctor_phrases.delete_phrase(mine, staff=doctor_one, conn=db_conn)
    assert await doctor_phrases.list_phrases(doctor_one.id, doctor_one, conn=db_conn) == []


@pytest.mark.asyncio
async def test_다른_의사의_문구는_수정도_삭제도_못_한다(db_conn):
    doctor_one = _to_context(await seed_staff(db_conn, role="doctor"), "doctor")
    doctor_two = _to_context(await seed_staff(db_conn, role="doctor"), "doctor")

    await set_session_auth(db_conn, doctor_two.auth_user_id)
    phrase_id = await doctor_phrases.add_phrase(
        doctor=doctor_two,
        text="다른 의사의 문구",
        conn=db_conn,
    )

    await set_session_auth(db_conn, doctor_one.auth_user_id)
    with pytest.raises(AppError):
        await doctor_phrases.update_phrase(
            phrase_id,
            "가로채기",
            staff=doctor_one,
            conn=db_conn,
        )
    with pytest.raises(AppError):
        await doctor_phrases.delete_phrase(phrase_id, staff=doctor_one, conn=db_conn)


@pytest.mark.asyncio
async def test_접수직원과_관리자는_진료문구_API를_쓸_수_없다(db_conn):
    staff_members = [
        (await seed_staff(db_conn, role="receptionist"), "receptionist"),
        (await seed_staff(db_conn, role="admin"), "admin"),
    ]
    for seed, role in staff_members:
        staff = _to_context(seed, role)
        await set_session_auth(db_conn, staff.auth_user_id)
        with pytest.raises(AppError):
            await doctor_phrases.add_phrase(
                doctor=staff,
                text="아무거나",
                conn=db_conn,
            )


@pytest.mark.asyncio
async def test_문구가_0건이어도_오류가_아니다(db_conn):
    doctor = _to_context(await seed_staff(db_conn, role="doctor"), "doctor")
    await set_session_auth(db_conn, doctor.auth_user_id)

    assert await doctor_phrases.list_phrases(doctor.id, doctor, conn=db_conn) == []
    with pytest.raises(doctor_phrases.ServiceError):
        await doctor_phrases.list_phrases(None, doctor, conn=db_conn)


@pytest.mark.asyncio
async def test_문구_삽입은_서버_일이_아니다(db_conn):
    doctor = _to_context(await seed_staff(db_conn, role="doctor"), "doctor")
    await set_session_auth(db_conn, doctor.auth_user_id)
    await doctor_phrases.add_phrase(doctor=doctor, text="증상 소견", conn=db_conn)

    phrase = (await doctor_phrases.list_phrases(doctor.id, doctor, conn=db_conn))[0]
    assert "target_field" not in phrase
