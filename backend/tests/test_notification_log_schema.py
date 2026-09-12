import uuid
import pytest
from tests.conftest import seed_staff


async def _seed_patient_and_appt(conn):
    dept_id = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor = await seed_staff(conn, role="doctor", department_id=dept_id)
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) "
        "values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    appt_id = await conn.fetchval(
        """
        insert into appointments
          (account_patient_id, for_patient_id, department_id, doctor_id, status, source)
        values ($1, $1, $2, $3, '예약확정', 'app') returning id
        """,
        patient_id, dept_id, doctor["staff_id"],
    )
    return patient_id, appt_id


@pytest.mark.asyncio
async def test_defaults_and_all_columns_insertable(db_conn):
    patient_id, appt_id = await _seed_patient_and_appt(db_conn)
    row_id = await db_conn.fetchval(
        """
        insert into notification_log (appointment_id, patient_id, notification_type, channel)
        values ($1, $2, 'confirmed', 'push') returning id
        """,
        appt_id, patient_id,
    )
    row = await db_conn.fetchrow("select * from notification_log where id = $1", row_id)
    assert row["kind"] == "transactional"          # 기본 분류
    assert row["delivery_status"] == "발송중"        # 기본 상태
    assert row["retry_count"] == 0
    assert row["notification_date"] is not None      # KST 기본값


@pytest.mark.asyncio
async def test_appointment_id_nullable_for_marketing(db_conn):
    # #110: 광고 발송은 특정 예약이 없다 → appointment_id 없이 기록 가능.
    row_id = await db_conn.fetchval(
        """
        insert into notification_log (notification_type, channel, kind, sender_staff_id, target_count, body)
        values ('promo', 'sms', 'marketing', null, 1500, '건강검진 할인 안내') returning id
        """,
    )
    assert row_id is not None


@pytest.mark.asyncio
async def test_anonymous_recipient_columns(db_conn):
    # 3-A: 익명 상담 연락처는 patients 행 없이 같은 원장에 남는다.
    # ⚠️ 챗봇 Task 3(00055)이 anonymous_session_id/anonymous_contact_id에 FK를 채웠다 → 임의 uuid 대신
    #    실재하는 익명 세션·연락처를 만들어 넣는다(FK 없던 시절 자리표시자 보정, Task 2 동형).
    sid = await db_conn.fetchval(
        "insert into anonymous_chat_sessions (token_hash) values ($1) returning id", "h-" + uuid.uuid4().hex)
    cid = await db_conn.fetchval(
        "insert into anonymous_chat_contacts (anonymous_session_id, contact_kind, "
        "contact_value_ciphertext, contact_value_hash) values ($1,'phone','ENC','PHASH') returning id", sid)
    row_id = await db_conn.fetchval(
        """
        insert into notification_log
          (notification_type, channel, anonymous_session_id, anonymous_contact_id)
        values ('chat_reply', 'sms', $1, $2) returning id
        """,
        sid, cid,
    )
    assert row_id is not None


@pytest.mark.asyncio
async def test_check_constraint_rejects_bad_kind(db_conn):
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into notification_log (notification_type, channel, kind) "
            "values ('x', 'push', $1)",
            "spam",
        )


@pytest.mark.asyncio
async def test_check_constraint_rejects_bad_channel(db_conn):
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into notification_log (notification_type, channel) values ('x', $1)",
            "email",
        )


@pytest.mark.asyncio
async def test_check_constraint_rejects_bad_delivery_status(db_conn):
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into notification_log (notification_type, channel, delivery_status) "
            "values ('x', 'push', $1)",
            "완료",
        )


@pytest.mark.asyncio
async def test_dedup_once_type_blocks_duplicate(db_conn):
    _, appt_id = await _seed_patient_and_appt(db_conn)
    await db_conn.execute(
        "insert into notification_log (appointment_id, notification_type, channel) "
        "values ($1, 'confirmed', 'push')", appt_id,
    )
    with pytest.raises(Exception):  # 같은 예약+1회성 종류는 두 번 안 됨
        await db_conn.execute(
            "insert into notification_log (appointment_id, notification_type, channel) "
            "values ($1, 'confirmed', 'push')", appt_id,
        )


@pytest.mark.asyncio
async def test_failed_row_excluded_from_dedup(db_conn):
    # #121: 실패한 줄은 자물쇠에서 빠져 다시 보낼 수 있다("닿은 것만 보냈다로 본다").
    _, appt_id = await _seed_patient_and_appt(db_conn)
    await db_conn.execute(
        "insert into notification_log (appointment_id, notification_type, channel, delivery_status) "
        "values ($1, 'confirmed', 'push', '실패')", appt_id,
    )
    # 실패 줄이 있어도 재발송 기록이 가능해야 한다.
    ok_id = await db_conn.fetchval(
        "insert into notification_log (appointment_id, notification_type, channel, delivery_status) "
        "values ($1, 'confirmed', 'push', '발송중') returning id", appt_id,
    )
    assert ok_id is not None
    # 그러나 성공(비실패) 줄이 생기면 그 다음 중복은 다시 막힌다.
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into notification_log (appointment_id, notification_type, channel) "
            "values ($1, 'confirmed', 'push')", appt_id,
        )


@pytest.mark.asyncio
async def test_staff_can_read_but_authenticated_cannot_insert(db_conn):
    from tests.conftest import set_session_auth
    _, appt_id = await _seed_patient_and_appt(db_conn)
    await db_conn.execute(
        "insert into notification_log (appointment_id, notification_type, channel) "
        "values ($1, 'confirmed', 'push')", appt_id,
    )
    staff = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, staff["auth_user_id"])
    rows = await db_conn.fetch("select * from notification_log")
    assert len(rows) == 1                              # 발송 이력 조회 허용
    with pytest.raises(Exception):                     # 쓰기는 서버(서비스 역할)만
        await db_conn.execute(
            "insert into notification_log (notification_type, channel) values ('x', 'push')"
        )
