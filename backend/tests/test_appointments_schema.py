from datetime import datetime, timezone

import pytest
from tests.conftest import seed_staff, set_session_auth


async def _seed_department_and_patient(conn):
    dept_id = await conn.fetchval("insert into departments (name) values ('내과') returning id")
    patient_id = await conn.fetchval(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678') returning id"
    )
    return dept_id, patient_id


@pytest.mark.asyncio
async def test_slot_unique_per_doctor_date_time(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    doctor = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, admin["auth_user_id"])

    await db_conn.execute(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-01', '09:00')",
        doctor["staff_id"],
    )
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-01', '09:00')",
            doctor["staff_id"],
        )


# [정합성 검토 브리프B/APPT-RACE] book_slot()의 조건부 UPDATE는 '정상 서비스 경로'만 막는다.
# 그 함수를 거치지 않는 직접 INSERT(향후 환자앱/챗봇 경로 포함)로 같은 slot_id에 활성 예약을
# 여러 건 만들 수 있었다 — 슬롯을 실제로 점유하는 '살아있는' 예약은 DB가 한 건만 허용해야 한다.
async def _insert_appointment(conn, *, slot_id, patient_id, dept_id, doctor_id, created_by, status="예약확정"):
    return await conn.fetchval(
        """
        insert into appointments
            (slot_id, account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $2, $2, $3, $4, $5, 'staff', $6)
        returning id
        """,
        slot_id, patient_id, dept_id, doctor_id, status, created_by,
    )


@pytest.mark.asyncio
async def test_active_appointment_unique_per_slot(db_conn):
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor", department_id=dept_id)
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-01', '09:00') returning id",
        doctor["staff_id"],
    )
    await set_session_auth(db_conn, receptionist["auth_user_id"])

    await _insert_appointment(
        db_conn, slot_id=slot_id, patient_id=patient_id, dept_id=dept_id,
        doctor_id=doctor["staff_id"], created_by=receptionist["staff_id"],
    )
    # 같은 slot_id에 두 번째 활성 예약을 직접 밀어넣으면 부분 유니크 인덱스가 막는다.
    with pytest.raises(Exception):
        await _insert_appointment(
            db_conn, slot_id=slot_id, patient_id=patient_id, dept_id=dept_id,
            doctor_id=doctor["staff_id"], created_by=receptionist["staff_id"],
        )


@pytest.mark.asyncio
async def test_cancelled_appointment_frees_slot_for_rebook(db_conn):
    """취소류(환자취소/병원취소/예약부도)는 슬롯을 놓아준 상태이므로 유니크에서 제외 —
    취소 뒤 같은 slot에 다시 예약할 수 있어야 한다(부분 유니크의 '부분')."""
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor", department_id=dept_id)
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, '2026-08-01', '09:00') returning id",
        doctor["staff_id"],
    )
    await set_session_auth(db_conn, receptionist["auth_user_id"])

    first = await _insert_appointment(
        db_conn, slot_id=slot_id, patient_id=patient_id, dept_id=dept_id,
        doctor_id=doctor["staff_id"], created_by=receptionist["staff_id"],
    )
    await db_conn.execute("update appointments set status = '병원취소' where id = $1", first)

    second = await _insert_appointment(
        db_conn, slot_id=slot_id, patient_id=patient_id, dept_id=dept_id,
        doctor_id=doctor["staff_id"], created_by=receptionist["staff_id"],
    )
    assert second is not None


@pytest.mark.asyncio
async def test_receptionist_can_create_appointment(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    assert appointment_id is not None


@pytest.mark.asyncio
async def test_doctor_cannot_update_other_doctors_appointment(db_conn):
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor_a = await seed_staff(db_conn, role="doctor", department_id=dept_id)
    doctor_b = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor_a["staff_id"], receptionist["staff_id"],
    )

    await set_session_auth(db_conn, doctor_b["auth_user_id"])
    result = await db_conn.execute(
        "update appointments set status = '도착' where id = $1", appointment_id
    )
    assert result == "UPDATE 0"


@pytest.mark.asyncio
async def test_doctor_cannot_read_other_doctors_appointment(db_conn):
    """[정합성 검토 R2-02] 의사는 원칙적으로 본인 담당이 아닌 예약을 조회할 수 없다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor_a = await seed_staff(db_conn, role="doctor", department_id=dept_id)
    doctor_b = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor_a["staff_id"], receptionist["staff_id"],
    )

    await set_session_auth(db_conn, doctor_b["auth_user_id"])
    row = await db_conn.fetchrow("select id from appointments where id = $1", appointment_id)
    assert row is None


@pytest.mark.asyncio
async def test_doctor_can_read_patients_past_records_during_active_visit(db_conn):
    """[정합성 검토 R2-02] 오늘 내게 '도착~진료중' 상태로 온 환자라면, 다른 의사가 남긴 과거(종료된) 예약도 볼 수 있다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor_a = await seed_staff(db_conn, role="doctor", department_id=dept_id)
    doctor_b = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    past_appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '진료완료', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor_a["staff_id"], receptionist["staff_id"],
    )
    today_appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '진료중', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor_b["staff_id"], receptionist["staff_id"],
    )

    await set_session_auth(db_conn, doctor_b["auth_user_id"])
    past_row = await db_conn.fetchrow("select id from appointments where id = $1", past_appointment_id)
    today_row = await db_conn.fetchrow("select id from appointments where id = $1", today_appointment_id)
    assert past_row is not None
    assert today_row is not None


@pytest.mark.asyncio
async def test_doctor_cannot_read_patients_future_appointment_with_other_doctor(db_conn):
    """[정합성 검토 R2-02] 진료 중이라도, 같은 환자의 '아직 지나지 않은' 다른 의사 예약은 볼 수 없다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor_a = await seed_staff(db_conn, role="doctor", department_id=dept_id)
    doctor_b = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    future_appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor_a["staff_id"], receptionist["staff_id"],
    )
    await db_conn.execute(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '진료중', 'staff', $4)
        """,
        patient_id, dept_id, doctor_b["staff_id"], receptionist["staff_id"],
    )

    await set_session_auth(db_conn, doctor_b["auth_user_id"])
    row = await db_conn.fetchrow("select id from appointments where id = $1", future_appointment_id)
    assert row is None


@pytest.mark.asyncio
async def test_appointment_department_must_match_doctor_department(db_conn):
    """치명적 규칙은 DB가 최종 심판 — 담당의 소속 진료과와 다른 진료과로 직접 INSERT하면 거부된다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    other_dept_id = await db_conn.fetchval("insert into departments (name) values ('외과') returning id")
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            """
            insert into appointments
                (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
            values ($1, $1, $2, $3, '예약확정', 'staff', $4)
            """,
            patient_id, other_dept_id, doctor["staff_id"], receptionist["staff_id"],
        )


@pytest.mark.asyncio
async def test_appointment_doctor_id_must_be_active_doctor_role(db_conn):
    """접수직원을 doctor_id로 지정해 직접 INSERT하면 거부된다 — role='doctor' 검증이 DB에 있다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    with pytest.raises(Exception):
        await db_conn.execute(
            """
            insert into appointments
                (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
            values ($1, $1, $2, $3, '예약확정', 'staff', $3)
            """,
            patient_id, dept_id, receptionist["staff_id"],
        )


@pytest.mark.asyncio
async def test_invalid_status_transition_rejected(db_conn):
    """'예약확정' → '진료완료'처럼 중간을 건너뛰는 상태전이는 트리거가 거부한다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    with pytest.raises(Exception):
        await db_conn.execute(
            "update appointments set status = '진료완료' where id = $1", appointment_id
        )


@pytest.mark.asyncio
async def test_staff_cannot_directly_access_status_transition_rules(db_conn):
    """[정합성 검토 SDB-17] 상태전이 규칙표는 private 스키마에 있어 관리자 세션조차 직접
    SELECT/INSERT할 수 없다 — 트리거(security definer)만 이 표를 읽는다."""
    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])

    with pytest.raises(Exception):
        await db_conn.fetch("select * from private.appointment_status_transitions")
    with pytest.raises(Exception):
        await db_conn.execute(
            "insert into private.appointment_status_transitions (from_status, to_status) values ('진료완료', '예약신청')"
        )


@pytest.mark.asyncio
async def test_status_history_recorded_automatically_and_forgery_blocked(db_conn):
    """상태 변경 이력은 트리거가 자동 기록하고, 실제 상태전이를 흉내낸 직접 INSERT는 거부된다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    history_count = await db_conn.fetchval(
        "select count(*) from appointment_status_history where appointment_id = $1", appointment_id
    )
    assert history_count == 1  # INSERT 트리거가 자동으로 초기 이력을 남김

    with pytest.raises(Exception):
        await db_conn.execute(
            """
            insert into appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
            values ($1, '예약확정', '진료완료', $2, '몰래 꾸민 이력')
            """,
            appointment_id, receptionist["staff_id"],
        )


@pytest.mark.asyncio
async def test_booking_code_assigned_on_insert(db_conn):
    """[정합성 검토 R4-04] 예약 생성 시 6자리 booking_code가 자동 발급된다(혼동 문자 0/O/1/I 제외)."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    row = await db_conn.fetchrow(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning booking_code, booking_code_expires_at
        """,
        patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    assert row["booking_code"] is not None
    assert len(row["booking_code"]) == 6
    assert not set(row["booking_code"]) & set("0O1I")
    assert row["booking_code_expires_at"] is not None


@pytest.mark.asyncio
async def test_booking_code_cleared_on_terminal_status(db_conn):
    """[정합성 검토 R4-04] 예약이 취소/완료되면 booking_code가 즉시 비워져 값이 재사용 가능해진다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    appointment_id = await db_conn.fetchval(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        returning id
        """,
        patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )
    await db_conn.execute("update appointments set status = '환자취소' where id = $1", appointment_id)

    row = await db_conn.fetchrow(
        "select booking_code, booking_code_expires_at from appointments where id = $1", appointment_id
    )
    assert row["booking_code"] is None
    assert row["booking_code_expires_at"] <= datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_booking_code_unique_across_active_appointments(db_conn):
    """[정합성 검토 R4-04] 두 예약이 동시에 같은 booking_code를 가질 수 없다(유니크 인덱스)."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    codes = set()
    for _ in range(5):
        code = await db_conn.fetchval(
            """
            insert into appointments
                (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
            values ($1, $1, $2, $3, '예약확정', 'staff', $4)
            returning booking_code
            """,
            patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
        )
        codes.add(code)
    assert len(codes) == 5


@pytest.mark.asyncio
async def test_appointment_slot_identity_columns_are_immutable(db_conn):
    """[정합성 검토 SDB-20] doctor_id/slot_date/start_time은 관리자 세션으로도 UPDATE할 수 없다
    (슬롯 재생성은 DELETE 후 새 INSERT로 한다) — status 변경은 그대로 허용된다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id = await db_conn.fetchval("insert into departments (name) values ('내과') returning id")
    doctor_a = await seed_staff(db_conn, role="doctor", department_id=dept_id)
    doctor_b = await seed_staff(db_conn, role="doctor", department_id=dept_id)
    await set_session_auth(db_conn, admin["auth_user_id"])
    slot_id = await db_conn.fetchval(
        "insert into appointment_slots (doctor_id, slot_date, start_time) values ($1, current_date + 1, '09:00') returning id",
        doctor_a["staff_id"],
    )

    # 각 실패 예상 구문을 savepoint(중첩 트랜잭션)로 감싼다 — asyncpg는 오류 발생 시
    # 트랜잭션 전체를 "aborted" 상태로 만들어 이후 구문이 전부 실패하므로, savepoint 롤백으로
    # 되돌려야 이 테스트 안에서 이어지는 정상 UPDATE(상태 변경)를 계속 검증할 수 있다.
    with pytest.raises(Exception):
        async with db_conn.transaction():
            await db_conn.execute(
                "update appointment_slots set doctor_id = $1 where id = $2", doctor_b["staff_id"], slot_id,
            )
    with pytest.raises(Exception):
        async with db_conn.transaction():
            await db_conn.execute(
                "update appointment_slots set start_time = '10:00' where id = $1", slot_id,
            )

    await db_conn.execute("update appointment_slots set status = '휴진' where id = $1", slot_id)
    status = await db_conn.fetchval("select status from appointment_slots where id = $1", slot_id)
    assert status == '휴진'


@pytest.mark.asyncio
async def test_doctor_can_read_own_patient_but_not_unrelated_patient(db_conn):
    """[정합성 검토 SDB-06] 의사는 본인 담당 예약이 있는 환자만 patients 테이블에서 직접 조회할 수 있다."""
    admin = await seed_staff(db_conn, role="admin")
    dept_id, own_patient_id = await _seed_department_and_patient(db_conn)
    _, unrelated_patient_id = await _seed_department_and_patient(db_conn)
    receptionist = await seed_staff(db_conn, role="receptionist")
    doctor = await seed_staff(db_conn, role="doctor", department_id=dept_id)

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    await db_conn.execute(
        """
        insert into appointments
            (account_patient_id, for_patient_id, department_id, doctor_id, status, source, created_by)
        values ($1, $1, $2, $3, '예약확정', 'staff', $4)
        """,
        own_patient_id, dept_id, doctor["staff_id"], receptionist["staff_id"],
    )

    await set_session_auth(db_conn, doctor["auth_user_id"])
    own_row = await db_conn.fetchrow("select id from patients where id = $1", own_patient_id)
    unrelated_row = await db_conn.fetchrow("select id from patients where id = $1", unrelated_patient_id)
    assert own_row is not None
    assert unrelated_row is None


@pytest.mark.asyncio
async def test_receptionist_admin_patient_scope_unaffected_by_doctor_restriction(db_conn):
    """[정합성 검토 SDB-06] 접수직원·관리자의 patients 조회 범위는 의사 범위 제한과 무관하게 전체 그대로다."""
    admin = await seed_staff(db_conn, role="admin")
    receptionist = await seed_staff(db_conn, role="receptionist")
    await set_session_auth(db_conn, admin["auth_user_id"])
    await db_conn.execute(
        "insert into patients (name, birth_date, gender, phone) values ('홍길동', '1985-03-01', 'M', '01012345678')"
    )

    await set_session_auth(db_conn, receptionist["auth_user_id"])
    rows = await db_conn.fetch("select * from patients")
    assert len(rows) == 1
