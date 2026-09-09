# Fix #3 — active_flow(진료과 멀티턴 문진 상태) 지속. 리포트 §2.3 확인된 이중 결함:
#   ① active_flow를 쓰는 코드가 전혀 없어 문진 흐름이 다음 턴에 유지되지 않는다.
#   ② orchestrate가 getattr(session, "active_flow")로 읽는데 session은 dict/Record라 항상 None이다.
# 여기서는 (a) 다음 active_flow를 결정하는 순수 함수와 (b) dict 세션에서 읽어 흐름을 유지하는지 검증.
import pytest

from app.services.chat import orchestrator
from app.services.chat.chat_flow_service import next_active_flow


class _Model:
    def __init__(self, label): self._label = label
    async def ainvoke(self, _):
        class R: content = self._label
        return R()


# ── (a) 순수 판정: 봇이 되물었을 때만 흐름 유지, 그 외엔 종료 ──

def test_keeps_flow_when_bot_asks_clarifying_question():
    # route=department_guide인데 아직 추천이 없음(봇이 "어떤 불편이세요?"라고 되물음) → 다음 턴도 유지.
    assert next_active_flow({"route_taken": "department_guide", "suggested_department": None}) == "department_guide"


def test_clears_flow_after_recommendation():
    # 추천이 나오면 문진 종료(다음 턴은 자유 라우팅).
    assert next_active_flow({"route_taken": "department_guide",
                             "suggested_department": {"id": "d1", "name": "정형외과"}}) is None


def test_clears_flow_on_other_routes():
    assert next_active_flow({"route_taken": "rag", "reply": "주차는 지하 1층입니다"}) is None
    assert next_active_flow({"route_taken": "handoff", "handoff_reason": "no_answer"}) is None
    assert next_active_flow({"route_taken": "emergency", "reply": "119에 연락하세요"}) is None


def test_clears_flow_on_emergency_even_within_dept_path():
    # 방어: dept 경로라도 응급 플래그면 흐름을 유지하지 않는다.
    assert next_active_flow(
        {"route_taken": "department_guide", "suggested_department": None, "emergency": True}) is None


# ── (b) 읽기: dict 세션의 active_flow를 실제로 반영해 재분류 없이 흐름 유지 ──

@pytest.mark.asyncio
async def test_orchestrate_keeps_department_guide_from_dict_session_state():
    # 실제 프로덕션 세션은 dict(load_owned_session=dict(row)). 이전 턴이 active_flow='department_guide'를
    # 저장했다면, 이번 턴 발화가 애매해도("이틀 됐어요") 라우터를 재호출하지 않고 진료과 흐름을 이어야 한다.
    session = {"id": "s1", "active_flow": "department_guide"}
    called = {}

    async def dept_guide_fn(s, m):
        called["hit"] = True
        return {"reply": "정형외과를 추천드려요", "suggested_department": {"id": "d1", "name": "정형외과"}}

    # 라우터 모델이 "rag"로 분류하려 해도, active_flow가 있으면 그걸 건너뛰고 department_guide를 유지해야 한다.
    out = await orchestrator.orchestrate(
        session, "이틀 됐어요", dept_guide_fn=dept_guide_fn, model=_Model("rag"))
    assert out["route_taken"] == "department_guide"
    assert called.get("hit") is True


# ── (c) 지속 배선: handle_message가 다음 active_flow를 실제 DB에 저장/해제하는지 ──

@pytest.mark.asyncio
async def test_handle_message_persists_and_clears_active_flow(committed_conn, monkeypatch):
    import uuid
    from app.services.chat import chat_flow_service
    from tests.conftest import seed_patient
    from tests.conftest_chat import seed_chat_thread, FakeEmbedder

    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)

    # 턴1: 봇이 되물음(department_guide·추천 없음) → active_flow가 'department_guide'로 저장돼야 한다.
    async def ask(*a, **k):
        return {"route_taken": "department_guide", "reply": "어떤 불편이 있으세요?",
                "suggested_department": None, "escalated": False}
    monkeypatch.setattr(orchestrator, "orchestrate", ask)
    await chat_flow_service.handle_patient_message(
        s, "속이 안 좋아요", thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=None)
    assert await committed_conn.fetchval(
        "select active_flow from ai_chat_sessions where id=$1", s["id"]) == "department_guide"

    # 턴2: 이제 세션에 흐름이 있고, 추천이 나오면 문진이 해제(null)돼야 한다.
    s2 = await committed_conn.fetchrow("select * from ai_chat_sessions where id=$1", s["id"])
    async def recommend(*a, **k):
        return {"route_taken": "department_guide", "reply": "내과를 추천드려요",
                "suggested_department": {"id": str(uuid.uuid4()), "name": "내과"}, "escalated": False}
    monkeypatch.setattr(orchestrator, "orchestrate", recommend)
    await chat_flow_service.handle_patient_message(
        s2, "어제부터요", thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=None)
    assert await committed_conn.fetchval(
        "select active_flow from ai_chat_sessions where id=$1", s["id"]) is None

    # cleanup
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])
