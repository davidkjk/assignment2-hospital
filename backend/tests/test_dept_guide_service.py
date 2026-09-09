# 예약 중 진료과 추천(제한모드, E4) 서비스 — 세션 없이 대화 이력만 받아 진료과만 추천한다.
# 모델·진료과 목록을 주입해 오프라인 단위 테스트(DB·네트워크 없음).
import pytest

from app.services.chat import dept_guide_service, safety_watchdog


class _Model:
    """주입 가짜 LLM — ainvoke가 정해진 문장을 돌려준다(department_guide_chain과 호환)."""
    def __init__(self, text):
        self._t = text

    async def ainvoke(self, _):
        class R:
            content = self._t
        return R()


_DEPTS = [
    {"id": "d1", "name": "내과"},
    {"id": "d2", "name": "정형외과"},
    {"id": "d3", "name": "외과"},
]


@pytest.mark.asyncio
async def test_emergency_wins_and_never_recommends():
    # 응급은 모드·진행단계와 무관하게 항상 최우선(정본 §0). 진료과 추천으로 넘어가지 않는다.
    out = await dept_guide_service.guide(
        message="숨을 못 쉬겠어요", history=["무릎이 아파요", "이틀 됐어요"],
        departments=_DEPTS, model=_Model("정형외과를 추천드려요"))
    assert out["emergency"] is True
    assert "119" in out["reply"]
    assert out["suggested_department"] is None


@pytest.mark.asyncio
async def test_staff_request_redirects_without_ticket():
    # 제한모드: 직원 연결 요청도 티켓을 만들지 않고 '상담' 탭으로 부드럽게 안내(막다른 길 금지).
    out = await dept_guide_service.guide(
        message="직원에게 연결해주세요", history=[], departments=_DEPTS, model=_Model("무시됨"))
    assert out["emergency"] is False
    assert out["suggested_department"] is None
    assert "상담" in out["reply"]


@pytest.mark.asyncio
async def test_unclear_symptom_asks_once_no_suggestion():
    # Q3: 증상이 불명확하면 진단식으로 캐묻지 않고 딱 한 번만 질문한다 — 과 언급이 없으면 추천 없음.
    out = await dept_guide_service.guide(
        message="잘 모르겠어요", history=[], departments=_DEPTS,
        model=_Model("어떤 불편이 있으세요?"))
    assert out["emergency"] is False
    assert out["suggested_department"] is None
    assert out["reply"] == "어떤 불편이 있으세요?"


@pytest.mark.asyncio
async def test_recommends_on_first_symptom_without_extra_questions():
    # Q3: 첫 발화라도 증상을 말하면(history 없어도) 되묻지 않고 바로 진료과를 추천한다.
    out = await dept_guide_service.guide(
        message="무릎이 아파요", history=[], departments=_DEPTS,
        model=_Model("많이 불편하셨겠어요. 정형외과를 추천드려요. 최종 선택은 확인해 주세요."))
    assert out["suggested_department"] == {"id": "d2", "name": "정형외과"}


@pytest.mark.asyncio
async def test_after_enough_turns_recommends_department_from_list():
    # 충분히 물어본 뒤(이전 환자 발화 2턴 이상)엔 실제 목록 중 한 과를 추천하고, 그 과를 suggested로 돌려준다.
    out = await dept_guide_service.guide(
        message="계단에서 넘어졌어요", history=["무릎이 아파요", "이틀 됐어요"],
        departments=_DEPTS,
        model=_Model("많이 아프셨겠어요. 정형외과를 추천드려요. 최종 선택은 직접 확인해 주세요."))
    assert out["suggested_department"] == {"id": "d2", "name": "정형외과"}


@pytest.mark.asyncio
async def test_match_prefers_longer_department_name():
    # 답변에 "정형외과"가 있으면 "외과"가 아니라 "정형외과"로 매칭한다(긴 이름 우선 — 부분일치 오탐 방지).
    out = await dept_guide_service.guide(
        message="넘어졌어요", history=["무릎", "이틀"], departments=_DEPTS,
        model=_Model("정형외과를 추천드려요"))
    assert out["suggested_department"]["name"] == "정형외과"


def test_redirect_reply_constant_mentions_consult_tab():
    assert "상담" in dept_guide_service.REDIRECT_TO_CONSULT_REPLY


def test_emergency_reply_reused_from_watchdog():
    # 응급 문구는 safety_watchdog 정본을 재사용한다(중복 정의 금지).
    assert safety_watchdog.EMERGENCY_REPLY


@pytest.mark.asyncio
async def test_guide_with_real_department_rows(committed_conn):
    # 엔드포인트가 넘기는 것과 같은 **실제 DB 진료과 행**(id=UUID)으로 동작 검증 —
    # suggested_department.id가 앱이 파싱 가능한 문자열 UUID로 나오는지(계약 DEPT-GUIDE-MATCH).
    import uuid as _uuid
    from app.services import department_service
    await committed_conn.execute("insert into departments (name, is_active) values ('정형외과', true)")
    departments = await department_service.list_departments(committed_conn)
    out = await dept_guide_service.guide(
        message="계단에서 넘어졌어요", history=["무릎이 아파요", "이틀 됐어요"],
        departments=departments, model=_Model("정형외과를 추천드려요. 최종 선택은 확인해 주세요."))
    assert out["suggested_department"]["name"] == "정형외과"
    _uuid.UUID(out["suggested_department"]["id"])   # 실제 UUID 문자열이어야 한다(throw 없으면 통과)


@pytest.mark.asyncio
async def test_mental_crisis_gives_crisis_hotlines_in_dept_bot():
    # ① 응급 분기: 진료과봇 경로에서도 마음 위기는 자살예방·정신건강 상담번호를 안내한다(3곳 공통).
    out = await dept_guide_service.guide(
        message="사는 게 힘들어서 자살 생각이 나요", history=[], departments=_DEPTS,
        model=_Model("무시됨"))
    assert out["emergency"] is True
    assert out["suggested_department"] is None
    assert "109" in out["reply"] and "1577-0199" in out["reply"]
