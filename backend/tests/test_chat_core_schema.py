import json
import uuid
import pytest
import asyncpg

from tests.conftest import seed_staff, set_session_auth
from tests.conftest_chat import seed_chat_thread

# patient 시드는 환자앱이 conftest.py에 넣은 seed_patient을 쓴다(챗봇은 3단계 뒤에 구현).
from tests.conftest import seed_patient


async def _insert_message(conn, thread_id, **cols):
    keys = list(cols)
    ph = ", ".join(f"${i+2}" for i in range(len(keys)))
    # asyncpg의 jsonb 코덱은 dict가 아니라 JSON 문자열을 받는다 — payload dict를 인코딩한다.
    vals = [json.dumps(cols[k]) if isinstance(cols[k], dict) else cols[k] for k in keys]
    return await conn.fetchval(
        f"insert into chat_messages (thread_id, {', '.join(keys)}) "
        f"values ($1, {ph}) returning id",
        thread_id, *vals)


@pytest.mark.asyncio
async def test_thread_owner_xor_rejects_both(db_conn):
    p = await seed_patient(db_conn)
    # owner_type=patient인데 anonymous_session_id까지 채우면 XOR 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await db_conn.execute(
            "insert into chat_threads (owner_type, patient_id, anonymous_session_id) "
            "values ('patient', $1, $2)", p["patient_id"], uuid.uuid4())


@pytest.mark.asyncio
async def test_thread_patient_requires_patient_id(db_conn):
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await db_conn.execute(
            "insert into chat_threads (owner_type) values ('patient')")


@pytest.mark.asyncio
async def test_message_requires_exactly_one_of_session_or_ticket(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    # 둘 다 null → XOR 위반. (savepoint로 감싸 outer tx가 살아 이어지는 검증을 계속한다.)
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        async with db_conn.transaction():
            await _insert_message(db_conn, t, sender_type="bot", content=None,
                                  message_type="text", payload=None)
    # 둘 다 채움 → XOR 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        async with db_conn.transaction():
            await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                                  support_ticket_id=uuid.uuid4(), sender_type="bot",
                                  message_type="text", content="x")


@pytest.mark.asyncio
async def test_text_message_requires_nonempty_content_and_null_payload(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    # text인데 content 공백 → 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        async with db_conn.transaction():
            await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                                  sender_type="bot", message_type="text", content="   ")
    # text인데 payload 채움 → 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        async with db_conn.transaction():
            await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                                  sender_type="bot", message_type="text",
                                  content="안녕하세요", payload={"x": 1})


@pytest.mark.asyncio
async def test_card_message_requires_payload(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        async with db_conn.transaction():
            await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                                  sender_type="bot", message_type="card", payload=None)
    # payload 있으면 성공(카드는 봇 발신).
    mid = await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                                sender_type="bot", message_type="card",
                                payload={"card_type": "예약제안_카드"})
    assert mid is not None


@pytest.mark.asyncio
async def test_system_message_type_pairs_with_system_sender(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    # message_type=system인데 sender_type=bot → system_pairing 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        async with db_conn.transaction():
            await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                                  sender_type="bot", message_type="system",
                                  payload={"event": "ai_expired"})
    # 짝이 맞으면 성공(시스템 이벤트는 단일 원장에 남는다 = 공백 6).
    mid = await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                                sender_type="system", message_type="system",
                                payload={"event": "staff_handoff"})
    assert mid is not None


@pytest.mark.asyncio
async def test_bot_sender_forbids_person_fks(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                              sender_type="bot", sender_patient_id=p["patient_id"],
                              message_type="text", content="봇인데 환자 FK")


@pytest.mark.asyncio
async def test_staff_sender_requires_ticket_and_staff(db_conn):
    p = await seed_patient(db_conn)
    st = await seed_staff(db_conn, role="doctor")
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    # 직원 발신인데 티켓이 아니라 세션에 넣음 → 형태 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        async with db_conn.transaction():
            await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                                  sender_type="staff", sender_staff_id=st["staff_id"],
                                  message_type="text", content="직원 답변")
    # 티켓 문맥이면 성공.
    mid = await _insert_message(db_conn, t, support_ticket_id=uuid.uuid4(),
                                sender_type="staff", sender_staff_id=st["staff_id"],
                                message_type="text", content="직원 답변")
    assert mid is not None


@pytest.mark.asyncio
async def test_sender_thread_ownership_trigger(db_conn):
    p1 = await seed_patient(db_conn, phone="010-1111-1111")
    p2 = await seed_patient(db_conn, phone="010-2222-2222")
    t = await seed_chat_thread(db_conn, patient_id=p1["patient_id"])
    # 상담방 소유자는 p1인데 발신 환자가 p2 → 트리거가 막는다(§4.3).
    with pytest.raises(asyncpg.exceptions.RaiseError):
        await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                              sender_type="patient", sender_patient_id=p2["patient_id"],
                              message_type="text", content="남의 방에 쓰기")


@pytest.mark.asyncio
async def test_client_message_id_is_globally_unique_when_present(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    cid = uuid.uuid4()
    await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                          sender_type="patient", sender_patient_id=p["patient_id"],
                          message_type="text", content="첫 전송", client_message_id=cid)
    # 같은 client_message_id 재전송 → 멱등(한 행만) = unique 위반으로 차단(§4.3, §6).
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                              sender_type="patient", sender_patient_id=p["patient_id"],
                              message_type="text", content="재전송", client_message_id=cid)


@pytest.mark.asyncio
async def test_client_message_id_null_is_allowed_multiple_times(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    # 봇·시스템 메시지는 client_message_id가 없다(null 여러 개 허용 = partial unique).
    for _ in range(3):
        await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                              sender_type="bot", message_type="text", content="봇")


@pytest.mark.asyncio
async def test_read_state_one_row_per_participant(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    await db_conn.execute(
        "insert into chat_read_states (thread_id, reader_type, reader_patient_id) "
        "values ($1, 'patient', $2)", t, p["patient_id"])
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await db_conn.execute(
            "insert into chat_read_states (thread_id, reader_type, reader_patient_id) "
            "values ($1, 'patient', $2)", t, p["patient_id"])


@pytest.mark.asyncio
async def test_read_state_reader_shape(db_conn):
    p = await seed_patient(db_conn)
    st = await seed_staff(db_conn, role="doctor")
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    # reader_type=patient인데 staff FK를 채움 → 형태 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await db_conn.execute(
            "insert into chat_read_states (thread_id, reader_type, reader_patient_id, reader_staff_id) "
            "values ($1, 'patient', $2, $3)", t, p["patient_id"], st["staff_id"])


@pytest.mark.asyncio
async def test_patient_rls_reads_only_own_thread(db_conn):
    p1 = await seed_patient(db_conn, phone="010-1111-1111", with_auth=True)
    p2 = await seed_patient(db_conn, phone="010-2222-2222", with_auth=True)
    t1 = await seed_chat_thread(db_conn, patient_id=p1["patient_id"])
    t2 = await seed_chat_thread(db_conn, patient_id=p2["patient_id"])
    await set_session_auth(db_conn, p1["auth_user_id"])
    rows = await db_conn.fetch("select id from chat_threads")
    ids = {r["id"] for r in rows}
    assert t1 in ids and t2 not in ids  # p1은 자기 상담방만 본다(§7)
