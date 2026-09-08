"""로그인 환자의 AI 상담 세션 확보(CHAT-TAB-NAV-01) — patient_ai_session.start.

환자앱 AI 상담 탭이 「상담방」을 열기 전에 세션을 확보하는 서버 경로. 익명 웹챗봇과 달리
이 경로는 그동안 배선이 비어 있었다(create_session 함수는 있으나 아무 라우트도 안 불렀고,
/chat/sessions는 익명 전용이었다) → 탭이 먹통이었다. 여기서 그 경로를 검증한다.

get_pool(서비스 풀)을 쓰므로 롤백형 db_conn이 아니라 committed_conn으로 커밋해 시드한다
(뒷정리는 autouse _cleanup_committed_data가 챗 테이블 truncate로 담당).
"""
from uuid import UUID

import pytest

from app.core.errors import AppError
from app.core.patient_security import PatientContext
from app.services.chat import patient_ai_session
from tests.conftest import seed_patient
from tests.conftest_chat import seed_chat_thread


def _ctx(p) -> PatientContext:
    return PatientContext(id=p["patient_id"], auth_user_id=p["auth_user_id"])


@pytest.mark.asyncio
async def test_tab_start_creates_patient_thread_and_reuses_active(committed_conn):
    # 탭 진입: 상담방 + 활성 AI 세션을 확보한다. 재진입은 같은 것을 재사용(새 방·세션 안 만듦).
    p = await seed_patient(committed_conn)
    ctx = _ctx(p)

    r1 = await patient_ai_session.start(ctx)
    assert r1["thread_id"]
    assert r1["ai_chat_session_id"]

    # 상담방이 이 환자 소유로 생성됐다 — 전송 경로(load_owned_session)의 RLS patient_owns 전제.
    owner = await committed_conn.fetchval(
        "select patient_id from chat_threads where id=$1", UUID(r1["thread_id"]))
    assert owner == p["patient_id"]

    r2 = await patient_ai_session.start(ctx)
    assert r2["thread_id"] == r1["thread_id"]
    assert r2["ai_chat_session_id"] == r1["ai_chat_session_id"]


@pytest.mark.asyncio
async def test_open_specific_owned_thread_by_id(committed_conn):
    # 지난 상담 이어보기: 내 상담방 id를 주면 그 방의 활성 세션을 확보한다.
    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])

    r = await patient_ai_session.start(_ctx(p), thread_id=t)
    assert r["thread_id"] == str(t)
    assert r["ai_chat_session_id"]


@pytest.mark.asyncio
async def test_list_threads_returns_only_threads_with_messages(committed_conn):
    # 지난 상담 목록: 메시지가 있는 내 상담방만, 빈 방(방금 연 것)은 제외(CHAT-HISTORY-LIST-01).
    p = await seed_patient(committed_conn)
    empty = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    talked = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    sid = await committed_conn.fetchval(
        "select id from create_ai_session($1, null, null, null, null)", talked)
    await committed_conn.execute(
        "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content) "
        "values ($1, $2, 'bot', 'text', '두통은 내과로 안내드려요')", talked, sid)

    rows = await patient_ai_session.list_threads(_ctx(p))
    ids = [r["thread_id"] for r in rows]
    assert str(talked) in ids
    assert str(empty) not in ids  # 메시지 없는 방은 이력이 아니다
    row = next(r for r in rows if r["thread_id"] == str(talked))
    assert row["last_snippet"] == "두통은 내과로 안내드려요"


@pytest.mark.asyncio
async def test_rejects_other_patients_thread(committed_conn):
    # 남의 상담방은 이어볼 수 없다(404) — 개인정보 경계(맞든 틀리든 여는 게 아니라 못 연다).
    me = await seed_patient(committed_conn)
    other = await seed_patient(committed_conn)
    t_other = await seed_chat_thread(committed_conn, patient_id=other["patient_id"])

    with pytest.raises(AppError):
        await patient_ai_session.start(_ctx(me), thread_id=t_other)
