import pytest
from tests.conftest import seed_staff, set_session_auth


async def _seed_patient(conn):
    return await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )


@pytest.mark.asyncio
async def test_columns_and_defaults(db_conn):
    patient_id = await _seed_patient(db_conn)
    row = await db_conn.fetchrow(
        "insert into notification_preferences (patient_id, notification_type) "
        "values ($1, 'reminder_today') returning enabled, sms_enabled",
        patient_id,
    )
    assert row["enabled"] is True       # 기본 켜짐 — 전부 끌 수 있으나 기본은 수신
    assert row["sms_enabled"] is False  # 문자로도 여부는 기본 꺼짐


@pytest.mark.asyncio
async def test_unique_per_patient_and_type(db_conn):
    patient_id = await _seed_patient(db_conn)
    await db_conn.execute(
        "insert into notification_preferences (patient_id, notification_type) values ($1, 'confirmed')",
        patient_id,
    )
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into notification_preferences (patient_id, notification_type) values ($1, 'confirmed')",
            patient_id,
        )


@pytest.mark.asyncio
async def test_authenticated_staff_cannot_read_patient_preferences(db_conn):
    # 환자 선호는 서버(dispatcher)와 본인(3단계)만 접근한다. 일반 직원 조회 정책은 없다 → 기본 거부.
    patient_id = await _seed_patient(db_conn)
    await db_conn.execute(
        "insert into notification_preferences (patient_id, notification_type) values ($1, 'confirmed')",
        patient_id,
    )
    staff = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, staff["auth_user_id"])
    rows = await db_conn.fetch("select * from notification_preferences")
    assert len(rows) == 0   # RLS 기본 거부(정책 없음)
