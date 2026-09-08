# 웹 상담봇 예약 대화 흐름 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 상담봇(webchat)이 "예약할래요" 자연어부터 진료과→의사→날짜→시간→(로그인)→대상→방문이유→확인→신청까지 예약을 끝까지 받게 한다. 현재는 예약 의도가 `action_unavailable` 인계로 빠지는 막다른 길이다.

**Architecture:** 두 처리 경로. ⑴ **자연어**는 `orchestrate`의 `agent_fn`(지금 비어 있어 막다른 길)이 받아 진료과 선택 카드를 낸다. ⑵ **카드 버튼 탭**은 결정적 카드 액션 — 기존 `POST /chat/cards/revalidate`(`revalidate_action`)에 새 kind를 더한다. 상태는 서버에 저장하지 않고 카드 payload가 선택값을 누적해 다음 단계로 나르며, 서버는 매 단계 payload를 재검증한다(위변조 방지). 늦은 관문 — 진료과·의사·날짜·시간은 익명(로그인 전)으로 고르고, 시간을 고른 뒤 로그인한다.

**Tech Stack:** 백엔드 FastAPI + asyncpg(파이썬). 프론트 React + Vitest(webchat). 검증 `tools/chatbot-verify/bot_test.py`(실호출 e2e).

**Spec:** `docs/superpowers/specs/2026-09-07-webchat-booking-flow-design.md` — 이 계획은 그 스펙을 구현한다. 실행자는 둘 다 읽는다.

## Global Constraints

- **환자 노출 문구**: "취소 요청이 접수/등록됐다" 표현 금지 → "상담(직원 확인)으로 연결됐다"만. (`CLAUDE.md` 설계 원칙)
- **막다른 길 금지**: 막을 때는 해결 경로를 함께 준다. 앞 선택은 보존한다. 없는 상태를 지어내지 않는다.
- **되돌릴 수 없는 동작은 [예약 신청하기]를 눌러야만** 실행 — 선택·탭만으로 예약·선점하지 않는다(BOOKCONF-01/03).
- **개인정보 열거 방지**: 로그인 성공/실패는 같은 화면으로 진행.
- **아이콘은 인라인 SVG**(이모지 금지). 색 하드코딩 금지 — 위젯 토큰(`webchat/src/widget/widget.css` `--wc-*`) 사용.
- **카드 payload는 표시 스냅샷** — 실행의 진실이 아니다. 서버가 매번 재검증한다(진료과·의사·슬롯 존재, `for_patient_id`가 본인/연결가족).
- **방문이유 최대 100자, 선택 입력**(`BOOK-WHY`, `card_builder.VISIT_REASON_MAX`).
- **테스트 규율**: 빈 테스트 금지 · 테스트 한 줄에 규칙 ID 하나. 백엔드 pytest는 공용 로컬 DB 시드를 비운다 — 순수 단위는 `.venv/bin/python -c` 또는 DB 불필요 테스트로, DB 통합은 CI/전용 확인에서. 재적재는 허브 「손검수·운영 함정」.
- **파일 경계(스펙 §9)**: 이 트랙은 `card_builder.py`·`webchat_service.py`·`chat_flow_service.py`(agent_fn 주입만)·새 agent 파일·webchat 프론트를 소유. patient-chat-wiring 트랙은 `ai_session_service.py`·환자앱(Flutter)만 건드린다(실측 확인: 그 워크트리 diff는 `patient_app/`만). **⚠️ 스펙 §9는 "routers/chat.py 무수정"을 가정했으나, 아래 Task 2에서 이 파일을 최소 수정한다** — 이유·근거는 Task 2 본문(늦은 관문 ④가 로그인 전 카드 탭을 요구하는데 `/cards/revalidate`가 Bearer 필수라 불가피). patient-chat-wiring은 이 파일을 안 건드리므로 충돌 없음.

---

## File Structure

**백엔드 (chatbot-booking-flow 소유)**
- `backend/app/services/chat/card_builder.py` — 예약 앞흐름 카드 4종 추가(department_select·doctor_select·date_select·target_select).
- `backend/app/services/chat/webchat_service.py` — 로그인 전 카탈로그 통로(conn 기반) + `navigate_booking`(익명 nav 액션) + `revalidate_action` 새 kind(`pick_target`).
- `backend/app/services/chat/booking_agent_service.py` — **신규**. `agent_fn` 구현체(예약 의도→진료과 카드, 진료과명 자연어 지름길).
- `backend/app/services/chat/chat_flow_service.py` — `agent_fn` 주입 + `handle_message`에 agent 카드 응답 처리.
- `backend/app/routers/chat.py` — `/cards/revalidate`가 익명 nav kind를 받게 최소 수정(Task 2).

**프론트 (webchat 소유)**
- `webchat/src/widget/cards/FlowCards.tsx` — **신규**. 4종 카드 컴포넌트(DeptSelect·DoctorSelect·DateSelect·TargetSelect) + 방문이유 입력 카드(ReasonCard).
- `webchat/src/widget/cards/WebCard.tsx` — 새 card_type 케이스 + CardContext에 `onNavigate` 추가.
- `webchat/src/api/webchatApi.ts` — `navigateAction`(익명 nav, Bearer 없이) 메서드.
- `webchat/src/widget/WebchatApp.tsx` — nav 카드 피드 삽입 + 로그인 후 대상→방문이유→확인 피드 흐름.
- `webchat/src/widget/WebchatWidget.tsx` — CardSlot에 `onNavigate` 전달.

**규칙·문서**
- `docs/design/screen-behaviors.md` — `WEBCARD-DEPT/DOC/DATE/TARGET/WHY`·`WEBBOOK-*` 규칙.
- `docs/design/chatbot-source-of-truth.md` §4 — "상담봇 전용 화면 규칙 0개" 갱신 + 역참조.
- `docs/superpowers/specs/2026-09-07-webchat-booking-flow-design.md` §10 — kind 이름 확정 역참조.

---

### Task 1: 예약 앞흐름 카드 빌더 4종

**Files:**
- Modify: `backend/app/services/chat/card_builder.py`
- Test: `backend/tests/test_card_builder.py`

**Interfaces:**
- Produces:
  - `build_department_select_card(*, departments: list[dict], allow_symptom_guide: bool = True) -> dict`
    - `departments` = `[{"id": str, "name": str}, ...]`. 반환 `{"card_type":"department_select","departments":[...],"guide_chip": "잘 모르겠어요 · 증상으로 찾기"|None,"state":"정상"}`.
  - `build_doctor_select_card(*, department_id: str, department_name: str, doctors: list[dict]) -> dict`
    - `doctors` = `[{"id":str,"name":str,"specialty":str|None,"schedule_summary":str|None}, ...]`. 반환 `{"card_type":"doctor_select","department_id":...,"department_name":...,"doctors":[...],"state":"정상"|"빈"}`. 빈이면 `state="빈"`(가용 의사 0).
  - `build_date_select_card(*, department_id: str, doctor_id: str, doctor_name: str, dates: list[dict]) -> dict`
    - `dates` = `[{"date":"YYYY-MM-DD","label":"9월 11일 (수)"}, ...]`. 반환 `{"card_type":"date_select","department_id":...,"doctor_id":...,"doctor_name":...,"dates":[...],"state":"정상"|"빈"}`.
  - `build_target_select_card(*, department_id: str, doctor_id: str, slot_id: str, slot_at: str, targets: list[dict]) -> dict`
    - `targets` = `[{"for_patient_id":str,"name":str,"relation":str|None}, ...]`(본인 relation=None). 반환 `{"card_type":"target_select","department_id":...,"doctor_id":...,"slot_id":...,"slot_at":...,"targets":[...],"state":"정상"}`.
  - `CARD_TYPES`에 `"department_select","doctor_select","date_select","target_select"` 추가.

- [ ] **Step 1: 실패하는 테스트 작성** (`backend/tests/test_card_builder.py` 끝에 추가)

```python
def test_department_select_card_carries_departments_and_guide_chip():
    # [WEBCARD-DEPT-01] 진료과 버튼 + 맨 아래 증상으로 찾기 칩
    card = card_builder.build_department_select_card(
        departments=[{"id": "d1", "name": "내과"}, {"id": "d2", "name": "정형외과"}])
    assert card["card_type"] == "department_select"
    assert [d["name"] for d in card["departments"]] == ["내과", "정형외과"]
    assert card["guide_chip"] == "잘 모르겠어요 · 증상으로 찾기"


def test_department_select_card_can_hide_guide_chip():
    # [WEBCARD-DEPT-02] 증상 대화로 이미 좁혀졌으면 칩을 숨긴다
    card = card_builder.build_department_select_card(departments=[{"id": "d1", "name": "내과"}], allow_symptom_guide=False)
    assert card["guide_chip"] is None


def test_doctor_select_card_empty_state_when_no_doctors():
    # [WEBCARD-DOC-02] 가용 의사 0 → 빈 상태(막다른 길 금지 문구는 프론트가 렌더)
    card = card_builder.build_doctor_select_card(department_id="d1", department_name="내과", doctors=[])
    assert card["card_type"] == "doctor_select" and card["state"] == "빈"


def test_doctor_select_card_lists_doctors_always_even_single():
    # [WEBCARD-DOC-01] 의사가 1명이어도 항상 표시(결정 ②)
    card = card_builder.build_doctor_select_card(
        department_id="d1", department_name="내과",
        doctors=[{"id": "s1", "name": "김의사", "specialty": "소화기", "schedule_summary": "월·수·금"}])
    assert card["state"] == "정상" and len(card["doctors"]) == 1
    assert card["doctors"][0]["name"] == "김의사"


def test_date_select_card_empty_state():
    # [WEBCARD-DATE-02] 가용일 0 → 빈 상태
    card = card_builder.build_date_select_card(department_id="d1", doctor_id="s1", doctor_name="김의사", dates=[])
    assert card["card_type"] == "date_select" and card["state"] == "빈"


def test_target_select_card_carries_self_and_family():
    # [WEBCARD-TARGET-01] 본인/가족 + 앞 선택값(dep·doc·slot) 누적
    card = card_builder.build_target_select_card(
        department_id="d1", doctor_id="s1", slot_id="sl1", slot_at="2026-09-11T10:00:00",
        targets=[{"for_patient_id": "p1", "name": "홍길동", "relation": None},
                 {"for_patient_id": "p2", "name": "홍자녀", "relation": "자녀"}])
    assert card["card_type"] == "target_select"
    assert card["slot_id"] == "sl1" and card["department_id"] == "d1"
    assert [t["name"] for t in card["targets"]] == ["홍길동", "홍자녀"]
```

- [ ] **Step 2: 실패 확인** — `cd backend && .venv/bin/python -m pytest tests/test_card_builder.py -k "department_select or doctor_select or date_select or target_select" -v` → FAIL(AttributeError: build_department_select_card 없음). ⚠️ 이 파일은 DB를 안 쓴다(순수). DB 전체 pytest는 시드를 비우니 이 파일만 지정 실행.

- [ ] **Step 3: 최소 구현** (`card_builder.py`)

```python
# CARD_TYPES 집합에 추가
CARD_TYPES = {
    "time_select", "booking_confirm", "booking_done",
    "cancel_confirm", "cancel_done", "cancel_reject",
    "questionnaire", "quick_replies",
    "department_select", "doctor_select", "date_select", "target_select",  # 예약 앞흐름
}

DEPT_GUIDE_CHIP = "잘 모르겠어요 · 증상으로 찾기"   # [WEBCARD-DEPT-01] 하이브리드(결정 ①)


def build_department_select_card(*, departments: list[dict], allow_symptom_guide: bool = True) -> dict:
    # 진료과 버튼 카드 + (선택)증상으로 찾기 칩. 상태(선택값)는 다음 카드 payload가 누적한다.
    return {"card_type": "department_select",
            "departments": [{"id": str(d["id"]), "name": d["name"]} for d in departments],
            "guide_chip": DEPT_GUIDE_CHIP if allow_symptom_guide else None, "state": "정상"}


def build_doctor_select_card(*, department_id: str, department_name: str, doctors: list[dict]) -> dict:
    # [WEBCARD-DOC-01] 의사가 1명이어도 항상 표시. 0명이면 빈(막다른 길 문구는 프론트).
    return {"card_type": "doctor_select", "department_id": str(department_id), "department_name": department_name,
            "doctors": [{"id": str(d["id"]), "name": d["name"], "specialty": d.get("specialty"),
                         "schedule_summary": d.get("schedule_summary")} for d in doctors],
            "state": "정상" if doctors else "빈"}


def build_date_select_card(*, department_id: str, doctor_id: str, doctor_name: str, dates: list[dict]) -> dict:
    return {"card_type": "date_select", "department_id": str(department_id), "doctor_id": str(doctor_id),
            "doctor_name": doctor_name, "dates": list(dates), "state": "정상" if dates else "빈"}


def build_target_select_card(*, department_id: str, doctor_id: str, slot_id: str, slot_at: str,
                             targets: list[dict]) -> dict:
    # [WEBCARD-TARGET-01] 본인/가족 대상 + 앞 선택값(dep·doc·slot) 누적(payload가 상태를 나른다).
    return {"card_type": "target_select", "department_id": str(department_id), "doctor_id": str(doctor_id),
            "slot_id": str(slot_id), "slot_at": slot_at,
            "targets": [{"for_patient_id": str(t["for_patient_id"]), "name": t["name"],
                         "relation": t.get("relation")} for t in targets], "state": "정상"}
```

- [ ] **Step 4: 통과 확인** — 같은 pytest 명령 → PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/app/services/chat/card_builder.py backend/tests/test_card_builder.py
git commit -m "feat(상담봇 예약): 예약 앞흐름 카드 빌더 4종 (WEBCARD-DEPT/DOC/DATE/TARGET)"
```

---

### Task 2: 로그인 전 카탈로그 통로 + 익명 nav 액션 + 엔드포인트

**Files:**
- Modify: `backend/app/services/chat/webchat_service.py`
- Modify: `backend/app/routers/chat.py:144-149` (`/cards/revalidate` 익명 nav 분기)
- Test: `backend/tests/test_webchat_cards.py`, `backend/tests/test_webchat_endpoints.py`

**Interfaces:**
- Consumes: Task 1 카드 빌더, 기존 `department_service.list_departments(conn)`, SQL `list_bookable_slots(doctor_id, date)`.
- Produces:
  - `webchat_service.ANON_NAV_KINDS = ("pick_department", "pick_doctor", "pick_date")`.
  - `async webchat_service.navigate_booking(action: dict) -> dict` — 익명 nav 액션을 다음 카드로. 반환은 `_envelope(card)`.
  - 내부: `_list_doctors_public(conn, department_id)`, `_list_dates_public(conn, doctor_id)` (환자 없이 서비스 역할 conn).

**설계 노트 — 스펙 §9 이탈(routers/chat.py 수정):** 늦은 관문(④)은 진료과·의사·날짜·시간을 **로그인 전** 고르게 한다. 그런데 카드 탭이 가는 `/cards/revalidate`는 `get_current_patient`(Bearer)를 강제한다(`routers/chat.py:147`) → 로그인 전 탭은 401. 스펙 §9의 "routers/chat.py 무수정" 가정은 이 인증 제약을 놓쳤다(메모리 `feedback-plan-covers-rules-not-wiring`가 경고한 배선 갭). 해소: `/cards/revalidate`가 `action.kind`가 익명 nav kind면 Bearer 없이 X-Anon-Token으로 세션을 확인하고 `navigate_booking`으로, 아니면 기존 Bearer 경로로 분기한다. patient-chat-wiring은 이 파일을 안 건드림(실측)이라 충돌 없음.

- [ ] **Step 1: navigate_booking 단위 테스트 작성** (`backend/tests/test_webchat_cards.py`) — DB 통합. 기존 예약 픽스처(의사·빈시간 슬롯) 재사용 패턴을 따른다(같은 파일의 `_revalidate_book` 테스트 참고).

```python
@pytest.mark.asyncio
async def test_navigate_pick_department_returns_doctor_card(seeded_department_with_doctor):
    # [WEBBOOK-02] pick_department → 그 과 의사 선택 카드(로그인 전, 환자 없이)
    dep = seeded_department_with_doctor
    out = await webchat_service.navigate_booking(
        {"kind": "pick_department", "payload": {"department_id": str(dep["department_id"])}})
    card = out["payload"]
    assert card["card_type"] == "doctor_select"
    assert card["department_id"] == str(dep["department_id"])
    assert any(d["id"] == str(dep["doctor_id"]) for d in card["doctors"])


@pytest.mark.asyncio
async def test_navigate_pick_doctor_returns_date_card(seeded_department_with_doctor):
    # [WEBBOOK-03] pick_doctor → 예약 가능 날짜 카드
    dep = seeded_department_with_doctor
    out = await webchat_service.navigate_booking(
        {"kind": "pick_doctor", "payload": {"department_id": str(dep["department_id"]),
                                            "doctor_id": str(dep["doctor_id"])}})
    assert out["payload"]["card_type"] == "date_select"


@pytest.mark.asyncio
async def test_navigate_pick_date_returns_time_card(seeded_department_with_doctor):
    # [WEBBOOK-04] pick_date → 그날 시간 선택 카드(기존 build_time_select_card 재사용)
    dep = seeded_department_with_doctor
    out = await webchat_service.navigate_booking(
        {"kind": "pick_date", "payload": {"department_id": str(dep["department_id"]),
                                          "doctor_id": str(dep["doctor_id"]), "date": dep["slot_date"]}})
    card = out["payload"]
    assert card["card_type"] == "time_select"
    # 시간 후보 payload가 다음 단계로 dep·doc·for 없이도 slot_id·slot_at을 나른다
    assert all("slot_id" in c and "slot_at" in c for c in card["candidates"])


@pytest.mark.asyncio
async def test_navigate_unknown_kind_rejected():
    # 위변조·오타 kind는 400(막다른 길이 아니라 명확한 거절)
    with pytest.raises(AppError):
        await webchat_service.navigate_booking({"kind": "pick_bogus", "payload": {}})
```

> ⚠️ `seeded_department_with_doctor` 픽스처가 없으면 이 파일 상단에 만든다: departments 1행 + role='doctor' staff 1행(department_id 연결) + doctor_schedule_rules 1행(오늘 요일, not is_day_off) + appointment_slots 1행(status='빈시간', slot_date=오늘+7, doctor_id). 반환 dict = `{department_id, doctor_id, slot_date(str)}`. `conftest_chat.py`의 기존 시드 헬퍼를 재사용.

- [ ] **Step 2: 실패 확인** — `cd backend && .venv/bin/python -m pytest tests/test_webchat_cards.py -k navigate -v` → FAIL(navigate_booking 없음). ⚠️ DB 통합이라 pytest가 공용 시드를 비운다 → 끝나면 재적재(허브 참조).

- [ ] **Step 3: navigate_booking 구현** (`webchat_service.py`)

```python
from datetime import date as _date
from app.services import department_service
from app.services.doctor_schedule_summary import summarize_schedule

ANON_NAV_KINDS = ("pick_department", "pick_doctor", "pick_date")   # 로그인 전 카탈로그 탐색(늦은 관문 ④)


async def _list_doctors_public(conn, department_id: UUID) -> list[dict]:
    # 로그인 전 통로: 환자 없이(서비스 역할 conn) 그 과의 예약 가능 의사. RLS를 안 타지만
    # departments·staff·schedule는 민감정보 아님(list_doctors도 schedule는 이미 get_pool로 읽는다).
    rows = await conn.fetch(
        "select id, name, specialty from staff where role='doctor' and department_id=$1 and is_active order by name",
        department_id)
    doctors = [dict(r) for r in rows]
    if not doctors:
        return []
    ids = [d["id"] for d in doctors]
    srows = await conn.fetch(
        "select doctor_id, weekday, start_time, end_time from doctor_schedule_rules "
        "where doctor_id = any($1::uuid[]) and not is_day_off", ids)
    by_doc: dict = {}
    for r in srows:
        by_doc.setdefault(r["doctor_id"], []).append(
            {"weekday": r["weekday"], "start_time": r["start_time"], "end_time": r["end_time"]})
    # [BOOK-DOC-10] 진료시간 없는 의사는 예약 칸이 없어 숨긴다(막다른 길 방지, list_doctors와 동일 규칙).
    doctors = [d for d in doctors if by_doc.get(d["id"])]
    for d in doctors:
        d["schedule_summary"] = summarize_schedule(by_doc.get(d["id"], []))
    return doctors


async def _list_dates_public(conn, doctor_id: UUID) -> list[dict]:
    rows = await conn.fetch(
        "select distinct slot_date from appointment_slots "
        "where doctor_id=$1 and status='빈시간' and slot_date between current_date and current_date+56 "
        "order by slot_date", doctor_id)
    return [{"date": str(r["slot_date"]), "label": _date_label(r["slot_date"])} for r in rows]


_WD = ["월", "화", "수", "목", "금", "토", "일"]
def _date_label(d) -> str:
    return f"{d.month}월 {d.day}일 ({_WD[d.weekday()]})"


async def navigate_booking(action: dict) -> dict:
    """[WEBBOOK-02~04] 로그인 전 예약 탐색 — pick_department→의사, pick_doctor→날짜, pick_date→시간.
    환자 없이(서비스 역할) 읽는다. 각 단계 payload는 다음 카드로 선택값을 누적한다(서버 무상태)."""
    kind = action.get("kind")
    payload = action.get("payload") or {}
    pool = await get_pool()
    async with pool.acquire() as conn:
        if kind == "pick_department":
            department_id = UUID(payload["department_id"])
            dept_name = await conn.fetchval("select name from departments where id=$1", department_id)
            doctors = await _list_doctors_public(conn, department_id)
            return _envelope(card_builder.build_doctor_select_card(
                department_id=str(department_id), department_name=dept_name, doctors=doctors))
        if kind == "pick_doctor":
            department_id = UUID(payload["department_id"])
            doctor_id = UUID(payload["doctor_id"])
            doctor_name = await conn.fetchval("select name from staff where id=$1", doctor_id)
            dates = await _list_dates_public(conn, doctor_id)
            return _envelope(card_builder.build_date_select_card(
                department_id=str(department_id), doctor_id=str(doctor_id),
                doctor_name=doctor_name, dates=dates))
        if kind == "pick_date":
            department_id = UUID(payload["department_id"])
            doctor_id = UUID(payload["doctor_id"])
            target_date = _date.fromisoformat(payload["date"])
            rows = await conn.fetch("select id, start_time from list_bookable_slots($1, $2)", doctor_id, target_date)
            candidates = [{
                "label": r["start_time"].strftime("%H:%M"),
                "slot_at": datetime.combine(target_date, r["start_time"]).isoformat(),
                "slot_id": str(r["id"]), "department_id": str(department_id), "doctor_id": str(doctor_id),
            } for r in rows]
            return _envelope(card_builder.build_time_select_card(
                candidates=candidates, state=("정상" if candidates else "빈")))
    raise AppError("알 수 없는 예약 탐색 동작입니다.", status_code=400)
```

- [ ] **Step 4: navigate_booking 테스트 통과 확인** — Step 1 명령 → PASS. 끝나면 시드 재적재.

- [ ] **Step 5: 엔드포인트 익명 nav 분기 라우터 테스트 작성** (`backend/tests/test_webchat_endpoints.py`)

```python
def test_revalidate_anon_nav_needs_anon_token(client):
    # 익명 nav도 X-Anon-Token 없이는 401(세션 소유 확인)
    r = client.post("/chat/cards/revalidate", json={"action": {"kind": "pick_department", "payload": {"department_id": "00000000-0000-0000-0000-000000000000"}}})
    assert r.status_code == 401


def test_revalidate_nav_kind_uses_anon_path_not_bearer(client, anon_token, seeded_department_with_doctor):
    # [WEBBOOK-02] nav kind는 Bearer 없이 X-Anon-Token만으로 다음 카드를 준다
    dep = seeded_department_with_doctor
    r = client.post("/chat/cards/revalidate",
                    headers={"X-Anon-Token": anon_token},
                    json={"action": {"kind": "pick_department", "payload": {"department_id": str(dep["department_id"])}}})
    assert r.status_code == 200
    assert r.json()["card"]["payload"]["card_type"] == "doctor_select"
```

> 기존 `test_webchat_endpoints.py`의 client·anon_token 픽스처 패턴을 따른다(없으면 `require_anonymous_session` 우회 없이 실제 `POST /chat/sessions`로 anon_token 획득).

- [ ] **Step 6: 실패 확인** — `.venv/bin/python -m pytest tests/test_webchat_endpoints.py -k "anon_nav or nav_kind" -v` → FAIL(401 대신 다른 동작 / 현재 Bearer 강제).

- [ ] **Step 7: 엔드포인트 구현** (`backend/app/routers/chat.py`)

```python
from fastapi import Header  # 이미 import돼 있음

@router.post("/cards/revalidate")
async def revalidate_card(body: RevalidateRequest, request: Request,
                          x_anon_token: str | None = Header(default=None)):
    # 늦은 관문(④): 진료과·의사·날짜 탐색은 로그인 전(익명 nav)이라 Bearer가 없다 → X-Anon-Token으로 소유 확인.
    kind = (body.action or {}).get("kind")
    if kind in webchat_service.ANON_NAV_KINDS:
        await require_anonymous_session(x_anon_token)   # 없으면 401
        card = await webchat_service.navigate_booking(body.action)
        return {"card": card}
    # 그 외(book·cancel·view_my_appointments·pick_target)는 인증(Bearer)한 환자로 재검증.
    patient = await get_current_patient(request)
    card = await webchat_service.revalidate_action(patient, body.action)
    return {"card": card}
```

- [ ] **Step 8: 통과 확인** — Step 5 테스트 PASS. 끝나면 시드 재적재.

- [ ] **Step 9: 커밋**

```bash
git add backend/app/services/chat/webchat_service.py backend/app/routers/chat.py backend/tests/test_webchat_cards.py backend/tests/test_webchat_endpoints.py
git commit -m "feat(상담봇 예약): 로그인 전 카탈로그 통로 + 익명 nav 액션 + /cards/revalidate 분기 (WEBBOOK-02~04)"
```

---

### Task 3: 로그인 후 대상 선택 카드 (revalidate_action pick_target)

**Files:**
- Modify: `backend/app/services/chat/webchat_service.py` (`revalidate_action`)
- Test: `backend/tests/test_webchat_cards.py`

**Interfaces:**
- Consumes: `patient_family_service.list_family_members(patient)`, Task 1 `build_target_select_card`.
- Produces: `revalidate_action`이 `kind == "pick_target"`를 처리 → 대상 선택 카드(본인 + 활성 가족). payload는 dep·doc·slot_id·slot_at를 그대로 나른다.

**설계 노트:** 로그인 직후 흐름은 시간→(로그인)→**대상**→방문이유→확인이다(스펙 §4-6·7·8). 대상 카드는 가족 목록이 필요해 서버(Bearer)에서 만든다. 대상 탭·방문이유 입력은 클라이언트가 처리하고(Task 8), 최종 `book` revalidate가 `for_patient_id`·`visit_reason`을 실어 확인 카드를 받는다(기존 `_revalidate_book` 재사용).

- [ ] **Step 1: 실패 테스트** (`test_webchat_cards.py`)

```python
@pytest.mark.asyncio
async def test_revalidate_pick_target_returns_self_and_family(patient_with_family, seeded_department_with_doctor):
    # [WEBCARD-TARGET-01] 로그인 후 대상 선택 = 본인 + 활성 가족, 앞 선택값 누적
    patient = patient_with_family["patient"]; dep = seeded_department_with_doctor
    out = await webchat_service.revalidate_action(patient, {"kind": "pick_target", "payload": {
        "department_id": str(dep["department_id"]), "doctor_id": str(dep["doctor_id"]),
        "slot_id": str(dep["slot_id"]), "slot_at": dep["slot_at"]}})
    card = out["payload"]
    assert card["card_type"] == "target_select"
    ids = [t["for_patient_id"] for t in card["targets"]]
    assert str(patient.id) in ids                     # 본인 항상 포함
    assert card["slot_id"] == str(dep["slot_id"])     # 앞 선택값 보존


@pytest.mark.asyncio
async def test_revalidate_pick_target_self_only_when_no_family(patient_no_family, seeded_department_with_doctor):
    # [WEBCARD-TARGET-02] 가족 없으면 본인만(가족 추가는 앱 몫)
    patient = patient_no_family; dep = seeded_department_with_doctor
    out = await webchat_service.revalidate_action(patient, {"kind": "pick_target", "payload": {
        "department_id": str(dep["department_id"]), "doctor_id": str(dep["doctor_id"]),
        "slot_id": str(dep["slot_id"]), "slot_at": dep["slot_at"]}})
    assert len(out["payload"]["targets"]) == 1
    assert out["payload"]["targets"][0]["relation"] is None
```

> 픽스처: `test_patient_catalog_service.py`·`test_webchat_cards.py`의 기존 환자·가족 시드 헬퍼를 재사용(`PatientContext` 생성 + `patient_family_links` 활성 1행). `seeded_department_with_doctor`에 `slot_id`·`slot_at`(ISO) 반환값을 Task 2에서 추가해 둔다.

- [ ] **Step 2: 실패 확인** — `.venv/bin/python -m pytest tests/test_webchat_cards.py -k pick_target -v` → FAIL(AppError "알 수 없는 재확인 행동").

- [ ] **Step 3: 구현** (`webchat_service.py` — `revalidate_action`에 분기 추가 + 헬퍼)

```python
async def _revalidate_pick_target(patient: PatientContext, payload: dict) -> dict:
    # [WEBCARD-TARGET-01/02] 로그인 후 대상 선택 카드. 본인 + 활성 가족(list_family_members). 앞 선택값(dep·doc·slot) 누적.
    from app.services import patient_family_service
    async with acquire_as(str(patient.auth_user_id)) as conn:
        self_name = await conn.fetchval("select name from patients where id=$1", patient.id)
    family = await patient_family_service.list_family_members(patient)
    targets = [{"for_patient_id": str(patient.id), "name": self_name, "relation": None}]
    targets += [{"for_patient_id": str(m["patient_id"]), "name": m["name"], "relation": m.get("relation")}
                for m in family]
    return _envelope(card_builder.build_target_select_card(
        department_id=str(UUID(payload["department_id"])), doctor_id=str(UUID(payload["doctor_id"])),
        slot_id=str(UUID(payload["slot_id"])), slot_at=payload["slot_at"], targets=targets))
```

그리고 `revalidate_action`에 분기 추가(기존 `book`/`cancel`/`view_my_appointments` 옆):

```python
    if kind == "pick_target":
        return await _revalidate_pick_target(patient, payload)
```

> ⚠️ `list_family_members` 반환 키(`patient_id`/`name`/`relation`)를 구현 전 실제로 확인하고 맞춘다(`patient_family_service.py:68`). 다르면 매핑을 맞춘다.

- [ ] **Step 4: 통과 확인** — Step 1 명령 PASS. 시드 재적재.

- [ ] **Step 5: 커밋**

```bash
git add backend/app/services/chat/webchat_service.py backend/tests/test_webchat_cards.py
git commit -m "feat(상담봇 예약): 로그인 후 대상 선택 카드 pick_target (WEBCARD-TARGET)"
```

---

### Task 4: 예약 agent (agent_fn 구현체)

**Files:**
- Create: `backend/app/services/chat/booking_agent_service.py`
- Test: `backend/tests/test_booking_agent_service.py` (신규, 순수 — DB 불필요)

**Interfaces:**
- Consumes: `department_service.list_departments(conn)`, Task 1 `build_department_select_card`, `build_doctor_select_card`.
- Produces: `async booking_agent(session, message, *, conn_factory=None) -> dict` — 반환 `{"reply": str, "card": dict}`. `orchestrate`가 `{route_taken:"agent", **result}`로 병합한다. `reply`는 항상 비어 있지 않다(막다른 길 방지).

**설계 노트:** MVP는 예약 의도 → 진료과 선택 카드. 진료과명이 메시지에 있으면(예 "내과 예약") 그 과의 **의사 선택 카드**로 지름길(결정 ①-하이브리드의 자연어 갈래). 증상 대화(`department_guide`)는 orchestrator가 별도 route로 처리하므로 여기 없음(Task 8에서 칩→guide 연결).

- [ ] **Step 1: 실패 테스트** (`backend/tests/test_booking_agent_service.py`)

```python
import pytest
from app.services.chat import booking_agent_service


class _FakeConn:
    def __init__(self, departments): self._departments = departments
    async def fetch(self, *a, **k):
        return [{"id": d["id"], "name": d["name"]} for d in self._departments]
    async def fetchval(self, q, *a):
        for d in self._departments:
            if d["id"] == a[0]: return d["name"]
        return None
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False


def _factory(departments):
    class _Pool:
        def acquire(self): return _FakeConn(departments)
    async def f(): return _Pool()
    return f


@pytest.mark.asyncio
async def test_booking_intent_returns_department_card():
    # [WEBBOOK-01] "예약할래요" → 진료과 선택 카드(막다른 길 아님)
    out = await booking_agent_service.booking_agent(
        None, "예약할래요", conn_factory=_factory([{"id": "d1", "name": "내과"}, {"id": "d2", "name": "정형외과"}]))
    assert out["reply"]                                  # 비어 있지 않음
    assert out["card"]["card_type"] == "department_select"
    assert len(out["card"]["departments"]) == 2


@pytest.mark.asyncio
async def test_named_department_shortcut_to_doctor_card():
    # [WEBBOOK-01b] "내과 예약하고 싶어요" → 진료과 이미 정해짐 → 의사 카드 지름길 + 증상칩 숨김
    out = await booking_agent_service.booking_agent(
        None, "내과 예약하고 싶어요", conn_factory=_factory([{"id": "d1", "name": "내과"}]))
    assert out["card"]["card_type"] == "doctor_select"
    assert out["card"]["department_id"] == "d1"
```

- [ ] **Step 2: 실패 확인** — `cd backend && .venv/bin/python -m pytest tests/test_booking_agent_service.py -v` → FAIL(모듈 없음). ⚠️ 순수 — DB 안 씀.

- [ ] **Step 3: 구현** (`booking_agent_service.py`)

```python
"""예약 agent — orchestrate의 agent_fn 구현체. 자연어 예약 의도를 결정적 카드 흐름의 시작으로 바꾼다.

지금까지 agent_fn이 비어 있어(orchestrator.py:59) 예약이 action_unavailable 인계로 빠지던 막다른 길의 해소.
증상 대화(department_guide)는 orchestrator가 별도 route로 처리하므로 여기 없다(Task 8이 칩으로 연결).
"""
from app.db.pool import get_pool
from app.services import department_service
from app.services.chat import card_builder

BOOKING_REPLY = "어느 진료과로 예약하시겠어요? 아래에서 골라 주세요."
BOOKING_REPLY_NAMED = "{name}로 예약을 도와드릴게요. 담당의를 골라 주세요."


async def booking_agent(session, message: str, *, conn_factory=None) -> dict:
    # conn_factory: 테스트 주입(없으면 실제 풀). 진료과 목록은 로그인 무관(conn 기반).
    pool = await (conn_factory or get_pool)()
    async with pool.acquire() as conn:
        departments = await department_service.list_departments(conn)
        named = _match_department(message, departments)
        if named is not None:
            # 진료과가 자연어에 있으면 진료과 단계를 건너뛰고 의사 카드로(증상칩 불필요).
            from app.services.chat.webchat_service import _list_doctors_public
            doctors = await _list_doctors_public(conn, named["id"])
            return {"reply": BOOKING_REPLY_NAMED.format(name=named["name"]),
                    "card": card_builder.build_doctor_select_card(
                        department_id=str(named["id"]), department_name=named["name"], doctors=doctors)}
    return {"reply": BOOKING_REPLY,
            "card": card_builder.build_department_select_card(departments=departments)}


def _match_department(message: str, departments: list[dict]) -> dict | None:
    # 진료과명이 메시지에 정확히 포함되면 그 과로 지름길(위변조 아님 — 이름 문자열 매칭, 이후 서버 재검증).
    for d in departments:
        if d["name"] and d["name"] in message:
            return d
    return None
```

> ⚠️ Step 3의 `_list_doctors_public` import는 Task 2에서 만든 함수다. Task 2를 먼저 끝낸다. 테스트의 `_FakeConn`은 `_list_doctors_public`의 두 fetch(staff·schedule)도 처리해야 하므로, named 테스트는 conn.fetch가 doctors·schedule 순서로 불리도록 `_FakeConn.fetch`를 인자로 분기하거나, named 테스트는 doctors 빈([])이어도 `doctor_select` `state="빈"`으로 통과하게 단순화한다(테스트를 그렇게 맞춘다: `state in ("정상","빈")`).

- [ ] **Step 4: 통과 확인** — Step 1 명령 PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/app/services/chat/booking_agent_service.py backend/tests/test_booking_agent_service.py
git commit -m "feat(상담봇 예약): 예약 agent — 예약 의도→진료과 카드·진료과명 지름길 (WEBBOOK-01)"
```

---

### Task 5: agent_fn 주입 + agent 카드 응답 처리 (막다른 길 해소 마일스톤)

**Files:**
- Modify: `backend/app/services/chat/chat_flow_service.py`
- Test: `backend/tests/test_chat_integration.py`

**Interfaces:**
- Consumes: Task 4 `booking_agent_service.booking_agent`, Task 1 카드.
- Produces: `handle_message`가 `orchestrate(..., agent_fn=booking_agent)`를 넘기고, `route_taken=="agent"`이며 `card`가 있으면 봇 텍스트 + 카드를 저장하고 `{route_taken:"agent", message_id, reply, card}`를 반환한다. `/chat/messages` 응답의 `card`는 프론트가 렌더한다(no_answer 카드와 같은 통로).

**⭐ 이 태스크 끝 = 스펙 §8 완료 판정의 1차 마일스톤: 예약 갈래가 `action_unavailable` 인계가 아니라 진료과 카드에 도달.**

- [ ] **Step 1: 실패 테스트** (`test_chat_integration.py`) — DB 통합. 기존 파이프라인 테스트 패턴 따름.

```python
@pytest.mark.asyncio
async def test_booking_intent_reaches_department_card_not_handoff(anon_thread, monkeypatch):
    # [WEBBOOK-05] 예약 의도 → agent 카드(막다른 길 action_unavailable 아님)
    # 라우터를 agent로, 진료과 목록을 결정적으로 고정(LLM 비의존).
    from app.services.chat import chat_router, department_service
    async def fake_classify(*a, **k): return "agent"
    monkeypatch.setattr(chat_router, "classify", fake_classify)
    out = await chat_flow_service.handle_message(
        anon_thread["session"], "예약하고 싶어요", thread_id=anon_thread["thread_id"],
        client_message_id=uuid4(), embedder=_fake_embedder, model=_fake_model, sender_kind="anonymous_web")
    assert out["route_taken"] == "agent"
    assert out["card"]["card_type"] == "department_select"
    assert out.get("reason") != "action_unavailable"
```

> `anon_thread` 픽스처: 익명 세션+thread+active AI 세션 생성(기존 `test_chat_integration.py`의 익명 no_answer 테스트가 쓰는 헬퍼 재사용).

- [ ] **Step 2: 실패 확인** — `.venv/bin/python -m pytest tests/test_chat_integration.py -k booking_intent_reaches -v` → FAIL(현재 route=agent·card 없음 → body 빈 → handoff action_unavailable). 시드 재적재.

- [ ] **Step 3: 구현** (`chat_flow_service.py`)

① import 추가:
```python
from app.services.chat import orchestrator, rag_service, quality_service, card_builder, booking_agent_service
```

② `handle_message`의 orchestrate 호출에 agent_fn 주입(L62-63):
```python
    async def agent_fn(s, m):
        return await booking_agent_service.booking_agent(s, m)

    out = await orchestrator.orchestrate(session, content, history_texts=history_texts,
                                         rag_fn=rag_fn, agent_fn=agent_fn, model=model)
```

③ `body` 계산 뒤, `action_unavailable` 인계 가드(L68) **앞에** agent-카드 분기 추가:
```python
    body = (out.get("reply") or "").strip() or (out.get("restricted_block") or "").strip()
    # 행동형(agent)이 카드를 냈으면 막다른 길이 아니다 — 봇 말풍선 + 카드를 저장·반환한다(no_answer 카드와 같은 통로).
    if out["route_taken"] == "agent" and out.get("card"):
        async with pool.acquire() as conn:
            bmsg = await conn.fetchrow(
                "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content, route_taken) "
                "values ($1,$2,'bot','text',$3,'agent') returning id", thread_id, sid, body)
            await conn.execute(
                "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, payload, route_taken) "
                "values ($1,$2,'bot','card',$3::jsonb,'agent')", thread_id, sid, json.dumps(out["card"]))
            await conn.execute(
                "update ai_chat_sessions set last_activity_at=now(), expires_at=now()+interval '30 minutes' "
                "where id=$1 and status='active' and now() < expires_at", sid)
        return {"route_taken": "agent", "message_id": bmsg["id"], "reply": body, "card": out["card"]}
    # 본문이 비면(카드도 없는 행동형) 막다른 길 금지 원칙대로 직원 인계로 되돌린다.
    if out["route_taken"] != "handoff" and not body:
        out = {**out, "route_taken": "handoff", "handoff_reason": "action_unavailable"}
```

> ⚠️ agent_fn은 항상 non-empty `reply`를 준다(Task 4). 따라서 `chat_messages_type_shape`(빈 봇 텍스트 금지) 위반 없음.

- [ ] **Step 4: 통과 확인** — Step 1 명령 PASS. 기존 no_answer·rag·handoff 통합 테스트도 회귀 없이 통과 확인: `.venv/bin/python -m pytest tests/test_chat_integration.py -v`. 시드 재적재.

- [ ] **Step 5: 프론트 계약 확인** — `sendMessage`(webchatApi.ts)는 이미 `j.card`를 `cardMessage`로 매핑한다(L99-103). agent 카드가 no_answer 카드와 같은 통로로 렌더됨을 확인(코드 읽기만, 변경 없음).

- [ ] **Step 6: 커밋**

```bash
git add backend/app/services/chat/chat_flow_service.py backend/tests/test_chat_integration.py
git commit -m "feat(상담봇 예약): agent_fn 주입 + agent 카드 응답 처리 — 예약 막다른 길 해소 (WEBBOOK-05)"
```

---

### Task 6: 프론트 카드 4종 + WebCard 케이스 + navigateAction API

**Files:**
- Create: `webchat/src/widget/cards/FlowCards.tsx`
- Create: `webchat/src/widget/cards/FlowCards.test.tsx`
- Modify: `webchat/src/widget/cards/WebCard.tsx` (케이스 + CardContext.onNavigate)
- Modify: `webchat/src/api/webchatApi.ts` (navigateAction)

**Interfaces:**
- Produces:
  - `DeptSelectCard`, `DoctorSelectCard`, `DateSelectCard`, `TargetSelectCard`, `ReasonCard` 컴포넌트(props `{ p, ctx }: CardProps`).
  - `CardContext.onNavigate(action: {kind: string; payload: Record<string,unknown>}) => void` — 카드 탭이 다음 카드를 요청.
  - `WebchatApi.navigateAction(args: {action: {kind:string; payload:Record<string,unknown>}}) => Promise<{card: CardMessage}>` — 익명(Bearer 없이) 호출. X-Anon-Token만.
- Consumes: 백엔드 card_type department_select·doctor_select·date_select·target_select.

- [ ] **Step 1: 실패 테스트** (`FlowCards.test.tsx`) — 기존 `BookingCards.test.tsx`의 `ctx()` 헬퍼 패턴 재사용(onNavigate 추가).

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebCard, type CardContext } from './WebCard';

function ctx(over: Partial<CardContext> = {}): CardContext {
  return { isAnonymous: true, onAuthGate: vi.fn(), onExecute: vi.fn(), onPick: vi.fn(),
           onReconsult: vi.fn(), onRebook: vi.fn(), onNavigate: vi.fn(), ...over };
}

test('[WEBCARD-DEPT-01] 진료과 버튼 + 증상으로 찾기 칩을 표시한다', () => {
  render(<WebCard payload={{ card_type: 'department_select', departments: [{ id: 'd1', name: '내과' }], guide_chip: '잘 모르겠어요 · 증상으로 찾기' }} ctx={ctx()} />);
  expect(screen.getByRole('button', { name: '내과' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '잘 모르겠어요 · 증상으로 찾기' })).toBeInTheDocument();
});

test('[WEBCARD-DEPT-03] 진료과 탭 → onNavigate(pick_department)', async () => {
  const onNavigate = vi.fn();
  render(<WebCard payload={{ card_type: 'department_select', departments: [{ id: 'd1', name: '내과' }] }} ctx={ctx({ onNavigate })} />);
  await userEvent.click(screen.getByRole('button', { name: '내과' }));
  expect(onNavigate).toHaveBeenCalledWith({ kind: 'pick_department', payload: { department_id: 'd1' } });
});

test('[WEBCARD-DEPT-04] 증상으로 찾기 칩 → onPick(증상 문장)으로 department_guide 유발', async () => {
  const onPick = vi.fn();
  render(<WebCard payload={{ card_type: 'department_select', departments: [], guide_chip: '잘 모르겠어요 · 증상으로 찾기' }} ctx={ctx({ onPick })} />);
  await userEvent.click(screen.getByRole('button', { name: '잘 모르겠어요 · 증상으로 찾기' }));
  expect(onPick).toHaveBeenCalledWith(expect.stringContaining('증상'));
});

test('[WEBCARD-DOC-02] 가용 의사 0 → 막다른 길 금지 안내 + 다른 과 경로', () => {
  render(<WebCard payload={{ card_type: 'doctor_select', state: '빈', doctors: [], department_name: '내과' }} ctx={ctx()} />);
  expect(screen.getByText(/예약 가능한 의사가 없습니다/)).toBeInTheDocument();
});

test('[WEBCARD-DOC-01] 의사 1명이어도 표시하고 탭 → onNavigate(pick_doctor)', async () => {
  const onNavigate = vi.fn();
  render(<WebCard payload={{ card_type: 'doctor_select', state: '정상', department_id: 'd1', department_name: '내과', doctors: [{ id: 's1', name: '김의사', specialty: '소화기', schedule_summary: '월·수·금' }] }} ctx={ctx({ onNavigate })} />);
  await userEvent.click(screen.getByRole('button', { name: /김의사/ }));
  expect(onNavigate).toHaveBeenCalledWith({ kind: 'pick_doctor', payload: { department_id: 'd1', doctor_id: 's1' } });
});

test('[WEBCARD-DATE-01] 날짜 탭 → onNavigate(pick_date)', async () => {
  const onNavigate = vi.fn();
  render(<WebCard payload={{ card_type: 'date_select', state: '정상', department_id: 'd1', doctor_id: 's1', dates: [{ date: '2026-09-11', label: '9월 11일 (수)' }] }} ctx={ctx({ onNavigate })} />);
  await userEvent.click(screen.getByRole('button', { name: '9월 11일 (수)' }));
  expect(onNavigate).toHaveBeenCalledWith({ kind: 'pick_date', payload: { department_id: 'd1', doctor_id: 's1', date: '2026-09-11' } });
});

test('[WEBCARD-TARGET-01] 대상 탭 → onNavigate(pick_reason)로 방문이유 단계', async () => {
  const onNavigate = vi.fn();
  render(<WebCard payload={{ card_type: 'target_select', state: '정상', department_id: 'd1', doctor_id: 's1', slot_id: 'sl1', slot_at: '2026-09-11T10:00:00', targets: [{ for_patient_id: 'p1', name: '홍길동', relation: null }] }} ctx={ctx({ onNavigate })} />);
  await userEvent.click(screen.getByRole('button', { name: /홍길동/ }));
  expect(onNavigate).toHaveBeenCalledWith({ kind: 'pick_reason', payload: expect.objectContaining({ for_patient_id: 'p1', slot_id: 'sl1' }) });
});
```

- [ ] **Step 2: 실패 확인** — `npm --prefix webchat run test -- --run FlowCards` → FAIL(컴포넌트·onNavigate 없음).

- [ ] **Step 3: 구현** — `FlowCards.tsx`에 5개 컴포넌트. `onNavigate`는 다음 단계 요청, `onPick`은 증상칩(텍스트 전송). 위젯 토큰 클래스(`wc-card-btn` 등, `BookingCards`와 동일 계열) 사용. 방문이유 카드(ReasonCard)는 텍스트 입력 + [건너뛰기]/[다음] — 로컬 state로 값 보관 후 `onNavigate({kind:'submit_reason', payload:{...,visit_reason}})`.

```tsx
import { useState } from 'react';
import type { CardProps } from './WebCard';

export function DeptSelectCard({ p, ctx }: CardProps) {
  const departments = (p.departments as { id: string; name: string }[]) ?? [];
  const guideChip = p.guide_chip as string | null;
  return (
    <div>
      <ul aria-label="진료과 선택">
        {departments.map((d) => (
          <li key={d.id}><button type="button" onClick={() => ctx.onNavigate?.({ kind: 'pick_department', payload: { department_id: d.id } })}>{d.name}</button></li>
        ))}
      </ul>
      {guideChip && (
        <button type="button" className="wc-card-btn--ghost"
          onClick={() => ctx.onPick('증상으로 진료과를 찾고 싶어요')}>{guideChip}</button>
      )}
    </div>
  );
}

export function DoctorSelectCard({ p, ctx }: CardProps) {
  const state = (p.state as string) ?? '정상';
  const doctors = (p.doctors as { id: string; name: string; specialty?: string; schedule_summary?: string }[]) ?? [];
  if (state === '빈' || doctors.length === 0)
    return <div><p>예약 가능한 의사가 없습니다</p><button type="button" onClick={() => ctx.onPick('다른 진료과로 예약할게요')}>다른 진료과 고르기</button></div>;
  return (
    <ul aria-label="담당의 선택">
      {doctors.map((d) => (
        <li key={d.id}><button type="button"
          onClick={() => ctx.onNavigate?.({ kind: 'pick_doctor', payload: { department_id: p.department_id as string, doctor_id: d.id } })}>
          {d.name}{d.specialty ? ` · ${d.specialty}` : ''}{d.schedule_summary ? ` · ${d.schedule_summary}` : ''}</button></li>
      ))}
    </ul>
  );
}

export function DateSelectCard({ p, ctx }: CardProps) {
  const state = (p.state as string) ?? '정상';
  const dates = (p.dates as { date: string; label: string }[]) ?? [];
  if (state === '빈' || dates.length === 0)
    return <div><p>예약 가능한 날짜가 없습니다</p><button type="button" onClick={() => ctx.onPick('다른 의사로 예약할게요')}>다른 담당의 고르기</button></div>;
  return (
    <ul aria-label="예약 가능한 날짜">
      {dates.map((d) => (
        <li key={d.date}><button type="button"
          onClick={() => ctx.onNavigate?.({ kind: 'pick_date', payload: { department_id: p.department_id as string, doctor_id: p.doctor_id as string, date: d.date } })}>{d.label}</button></li>
      ))}
    </ul>
  );
}

export function TargetSelectCard({ p, ctx }: CardProps) {
  const targets = (p.targets as { for_patient_id: string; name: string; relation?: string | null }[]) ?? [];
  const base = { department_id: p.department_id, doctor_id: p.doctor_id, slot_id: p.slot_id, slot_at: p.slot_at };
  return (
    <ul aria-label="예약 대상 선택">
      {targets.map((t) => (
        <li key={t.for_patient_id}><button type="button"
          onClick={() => ctx.onNavigate?.({ kind: 'pick_reason', payload: { ...base, for_patient_id: t.for_patient_id } })}>
          {t.name}{t.relation ? ` (${t.relation})` : ' (본인)'}</button></li>
      ))}
    </ul>
  );
}

export function ReasonCard({ p, ctx }: CardProps) {
  // [WEBCARD-WHY] 방문이유 = 확인 직전 별도 단계(선택). 증상 대화로 왔으면 prefill.
  const [reason, setReason] = useState((p.prefill as string) ?? '');
  const submit = (v: string) => ctx.onNavigate?.({ kind: 'submit_reason', payload: { ...(p as object), visit_reason: v } });
  return (
    <div>
      <label>방문 이유 (선택, 최대 100자)
        <input type="text" maxLength={100} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <button type="button" onClick={() => submit(reason)}>다음</button>
      <button type="button" className="wc-card-btn--ghost" onClick={() => submit('')}>건너뛰기</button>
    </div>
  );
}
```

`WebCard.tsx` — import + 케이스 + CardContext.onNavigate 추가:
```tsx
import { DeptSelectCard, DoctorSelectCard, DateSelectCard, TargetSelectCard, ReasonCard } from './FlowCards';
// CardContext 타입에 추가:
//   onNavigate?: (action: { kind: string; payload: Record<string, unknown> }) => void;
// switch에 추가:
      case 'department_select': return <DeptSelectCard p={payload} ctx={ctx} />;
      case 'doctor_select':     return <DoctorSelectCard p={payload} ctx={ctx} />;
      case 'date_select':       return <DateSelectCard p={payload} ctx={ctx} />;
      case 'target_select':     return <TargetSelectCard p={payload} ctx={ctx} />;
      case 'reason_input':      return <ReasonCard p={payload} ctx={ctx} />;
```

`webchatApi.ts` — `navigateAction`(익명, authed=false):
```ts
  // 로그인 전 예약 탐색(진료과·의사·날짜). X-Anon-Token만, Bearer 없음.
  navigateAction(args: { action: { kind: string; payload: Record<string, unknown> } }): Promise<{ card: CardMessage }>;
// createWebchatApi 안:
    async navigateAction(args) {
      return call('/chat/cards/revalidate', { method: 'POST', body: JSON.stringify(args) }, loadAnonToken());
    },
```

> ⚠️ `reason_input` card_type은 프론트 전용(서버가 안 만든다) — Task 8이 로컬로 삽입한다. 서버 `CARD_TYPES`엔 없어도 된다(프론트만 렌더).

- [ ] **Step 4: 통과 확인** — `npm --prefix webchat run test -- --run FlowCards` → PASS. 전체 회귀: `npm --prefix webchat run test -- --run` 초록.

- [ ] **Step 5: 커밋**

```bash
git add webchat/src/widget/cards/FlowCards.tsx webchat/src/widget/cards/FlowCards.test.tsx webchat/src/widget/cards/WebCard.tsx webchat/src/api/webchatApi.ts
git commit -m "feat(상담봇 예약 웹): 예약 앞흐름 카드 4종 + navigateAction (WEBCARD-DEPT/DOC/DATE/TARGET/WHY)"
```

---

### Task 7: 로그인 전 nav 피드 배선 (진료과→의사→날짜→시간)

**Files:**
- Modify: `webchat/src/widget/WebchatApp.tsx` (onNavigate → navigateAction → 피드 삽입)
- Modify: `webchat/src/widget/WebchatWidget.tsx` (CardSlot.onNavigate 전달)
- Test: `webchat/src/widget/WebchatApp.test.tsx`

**Interfaces:**
- Consumes: Task 6 `navigateAction`, `onNavigate`.
- Produces: nav 탭 → 서버가 준 다음 카드를 피드 끝(`flowCards` 상태)에 삽입. 시간 탭은 기존 `onAuthGate({kind:'book', payload})`로(변경 없음).

- [ ] **Step 1: 실패 테스트** (`WebchatApp.test.tsx`) — fake api로 navigateAction 스텁.

```tsx
test('[WEBBOOK-06] 진료과 탭 → navigateAction(pick_department) → 의사 카드가 피드에 삽입된다', async () => {
  const api = fakeApi({
    navigateAction: vi.fn().mockResolvedValue({ card: { id: 'c2', senderType: 'bot', messageType: 'card',
      payload: { card_type: 'doctor_select', state: '정상', department_id: 'd1', department_name: '내과',
                 doctors: [{ id: 's1', name: '김의사' }] } } }),
  });
  // 진료과 카드를 초기 메시지로 렌더한 상태에서 내과 탭
  renderWithDeptCard(api);
  await userEvent.click(screen.getByRole('button', { name: '내과' }));
  expect(api.navigateAction).toHaveBeenCalledWith({ action: { kind: 'pick_department', payload: { department_id: 'd1' } } });
  expect(await screen.findByRole('button', { name: /김의사/ })).toBeInTheDocument();  // 다음 카드 삽입
});
```

> `fakeApi`·`renderWithDeptCard` 헬퍼: 기존 `WebchatApp.test.tsx`의 api 목 패턴 재사용. 진료과 카드는 `sendMessage`가 `cardMessage`로 돌려주게 하거나, 초기 세션 messages에 넣어 렌더.

- [ ] **Step 2: 실패 확인** — `npm --prefix webchat run test -- --run WebchatApp` → FAIL(onNavigate 미배선).

- [ ] **Step 3: 구현** (`WebchatApp.tsx`)

`flowCards` 상태 + onNavigate 배선. `cardCtx`에 onNavigate 추가:
```tsx
const [flowCards, setFlowCards] = useState<CardMessage[]>([]);

// cardCtx 안에 추가:
  onNavigate: async (action) => {
    if (action.kind === 'pick_reason') {           // 대상 선택 후 방문이유 입력(로컬 카드)
      setFlowCards((prev) => [...prev, localCard('reason_input', action.payload)]);
      return;
    }
    if (action.kind === 'submit_reason') {          // 방문이유 확정 → 확인 카드(Bearer 재검증)
      const { card } = await api.revalidateAction({ action: { kind: 'book', payload: action.payload } });
      if (card) setFlowCards((prev) => [...prev, card]);
      return;
    }
    // 로그인 전 nav(진료과·의사·날짜) → 익명 통로
    const { card } = await api.navigateAction({ action });
    if (card) setFlowCards((prev) => [...prev, card]);
  },
```

`localCard` 헬퍼(프론트 전용 카드 합성):
```tsx
function localCard(cardType: string, payload: Record<string, unknown>): CardMessage {
  return { id: `local-${crypto.randomUUID()}`, senderType: 'bot', messageType: 'card',
           content: null, payload: { card_type: cardType, ...payload } };
}
```

`extraCards`에 flowCards 합류:
```tsx
extraCards={[...flowCards, ...doneCards]}
```

`WebchatWidget.tsx` — CardSlot에 onNavigate 전달:
```tsx
// CardSlot 타입에 onNavigate 추가, renderCard 콜에 넘김:
renderCard={(payload) => renderCard(payload, {
  send: w.send,
  onHandoff: () => { if (w.session) onHandoffNeeded({ threadId: w.session.threadId, summary: [] }); },
  onNavigate: undefined,  // WebchatApp의 cardCtx가 실제 구현을 채운다(slot 병합)
})}
```

> ⚠️ 현재 `cardCtx(slot)`는 slot의 send·onHandoff만 쓴다. onNavigate는 slot이 아니라 cardCtx가 직접 구현하므로 slot에서 받을 필요 없다 — WebchatWidget 변경은 최소(타입만). WebchatApp의 `renderCard`가 `cardCtx(slot)`를 만들 때 onNavigate를 이미 넣는다.

- [ ] **Step 4: 통과 확인** — `npm --prefix webchat run test -- --run WebchatApp` PASS. 전체 회귀 초록.

- [ ] **Step 5: 커밋**

```bash
git add webchat/src/widget/WebchatApp.tsx webchat/src/widget/WebchatWidget.tsx webchat/src/widget/WebchatApp.test.tsx
git commit -m "feat(상담봇 예약 웹): 로그인 전 nav 피드 배선 — 진료과→의사→날짜→시간 (WEBBOOK-06)"
```

---

### Task 8: 로그인 후 대상→방문이유→확인 피드 흐름

**Files:**
- Modify: `webchat/src/widget/WebchatApp.tsx` (`afterAuth`의 book 분기)
- Test: `webchat/src/widget/WebchatApp.test.tsx`

**Interfaces:**
- Consumes: Task 3 `pick_target`(revalidate), Task 6 ReasonCard, Task 7 onNavigate(submit_reason).
- Produces: 시간 탭 후 로그인 성공(book) → 귀속 → `revalidateAction({kind:'pick_target', payload})`로 대상 카드를 피드에 삽입(모달 대신 피드). 대상 탭 → 방문이유 카드 → 확인 카드 → [예약 신청하기] → executeCard → 완료 카드.

**설계 노트:** 기존 `afterAuth`는 book이면 곧장 `revalidateAction({kind:'book'})`→booking_confirm 모달을 띄웠다(대상·방문이유 없이). 새 흐름은 대상·방문이유 단계를 사이에 넣는다. 취소(cancel)·내 예약 조회는 기존대로.

- [ ] **Step 1: 실패 테스트** (`WebchatApp.test.tsx`)

```tsx
test('[WEBBOOK-07] 시간 선택 후 로그인 → 대상 선택 카드가 피드에 뜬다(확인 카드로 직행하지 않음)', async () => {
  const api = fakeApi({
    attributeSessionToAccount: vi.fn().mockResolvedValue(undefined),
    revalidateAction: vi.fn().mockResolvedValue({ card: { id: 't1', senderType: 'bot', messageType: 'card',
      payload: { card_type: 'target_select', state: '정상', department_id: 'd1', doctor_id: 's1',
                 slot_id: 'sl1', slot_at: '2026-09-11T10:00:00',
                 targets: [{ for_patient_id: 'p1', name: '홍길동', relation: null }] } } }),
  });
  // book 관문 통과(afterAuth 호출)를 시뮬레이션
  await triggerAuthAndComplete(api, { kind: 'book', payload: { department_id: 'd1', doctor_id: 's1', slot_id: 'sl1', slot_at: '2026-09-11T10:00:00' } });
  expect(api.revalidateAction).toHaveBeenCalledWith({ action: { kind: 'pick_target', payload: expect.objectContaining({ slot_id: 'sl1' }) } });
  expect(await screen.findByRole('button', { name: /홍길동/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: 실패 확인** — `npm --prefix webchat run test -- --run WebchatApp` → FAIL(afterAuth가 pick_target 대신 book 호출).

- [ ] **Step 3: 구현** (`WebchatApp.tsx` `afterAuth`)

```tsx
  const afterAuth = async (pid: string, action: PendingAction) => {
    setPatientId(pid);
    setAuthAction(null);
    try {
      await api.attributeSessionToAccount({ patientId: pid });
      if (action.kind === 'view_my_appointments') { await api.revalidateAction({ action }); return; }
      if (action.kind === 'book') {
        // 늦은 관문(④): 로그인 뒤 대상→방문이유→확인. 확인 카드로 직행하지 않는다.
        const { card } = await api.revalidateAction({ action: { kind: 'pick_target', payload: action.payload ?? {} } });
        if (card) setFlowCards((prev) => [...prev, card]);
        return;
      }
      const { card } = await api.revalidateAction({ action });   // cancel 등 기존 경로(모달)
      setReconfirm(card);
    } catch { /* ⑦ 미배선 시 로그인만 성공 처리 */ }
  };
```

확인 카드([예약 신청하기])는 기존 `BookConfirmCard`가 `ctx.onExecute('booking_confirm', p)`를 부르고, `onExecute`가 executeCard→doneCards에 완료 카드를 얹는다(기존 배선 그대로 재사용). ReasonCard의 submit_reason이 book revalidate로 확인 카드를 피드에 얹는 것은 Task 7에서 배선됨.

- [ ] **Step 4: 통과 확인** — `npm --prefix webchat run test -- --run WebchatApp` PASS. e2e 흐름(대상 탭→방문이유→확인→신청→완료) 컴포넌트 테스트 1건 추가로 확인. 전체 회귀 초록.

- [ ] **Step 5: 커밋**

```bash
git add webchat/src/widget/WebchatApp.tsx webchat/src/widget/WebchatApp.test.tsx
git commit -m "feat(상담봇 예약 웹): 로그인 후 대상→방문이유→확인 피드 흐름 (WEBBOOK-07)"
```

---

### Task 9: 하이브리드 ① — 증상 대화 → 진료과 연결

**Files:**
- Modify: `backend/app/services/chat/department_guide_chain.py` (결론 시 진료과 카드 신호)
- Modify: `backend/app/services/chat/chat_flow_service.py` (department_guide 카드 처리)
- Test: `backend/tests/test_orchestrator.py`, `backend/tests/test_chat_integration.py`

**Interfaces:**
- Consumes: Task 1 `build_department_select_card`, `department_service.list_departments`.
- Produces: 증상 대화가 진료과를 좁히면(추천 시점) 봇 안내 + `department_select`(좁혀진 후보, `allow_symptom_guide=False`) 카드를 낸다. `[○○과로 예약]` 탭은 기존 nav(pick_department)로 이어진다.

**설계 노트(범위 제한):** guide chain은 LLM 대화라 "언제 결론인지"가 결정적이지 않다. MVP는 **추천 문장에 진료과명이 나오면** 그 과(들)로 좁힌 진료과 카드를 함께 낸다. 완전 결론 판정(문진 종료 상태머신)은 후속. 이 태스크가 없어도 자연어 갈래(Task 4 지름길)와 버튼 갈래(Task 6~8)는 동작한다 — 증상 갈래의 편의 연결.

- [ ] **Step 1: 실패 테스트** (`test_orchestrator.py`) — 결정적으로: guide가 추천 텍스트에 "내과"를 담으면 orchestrate 결과에 department_select 카드가 붙는다(department_guide 결과 확장).

```python
@pytest.mark.asyncio
async def test_department_guide_with_recommendation_attaches_department_card(monkeypatch):
    # [WEBBOOK-08] 증상 대화가 진료과를 추천하면 진료과 카드를 함께 낸다(하이브리드 ①)
    from app.services.chat import department_guide_chain, chat_router
    async def fake_classify(*a, **k): return "department_guide"
    async def fake_ask(*a, **k): return "증상을 보면 내과 진료가 좋겠어요."
    monkeypatch.setattr(chat_router, "classify", fake_classify)
    monkeypatch.setattr(department_guide_chain, "ask_next_question", fake_ask)
    out = await orchestrator.orchestrate(_FakeSession(), "배가 아파요", history_texts=[],
                                         rag_fn=None, agent_fn=None,
                                         list_departments_fn=_const_departments([{"id": "d1", "name": "내과"}]))
    assert out["route_taken"] == "department_guide"
    assert out.get("card", {}).get("card_type") == "department_select"
    assert [d["name"] for d in out["card"]["departments"]] == ["내과"]
```

> orchestrate에 `list_departments_fn=None` 선택 인자를 더한다(테스트 주입용, 없으면 결론 카드 생략 = 안전). guide 텍스트에서 진료과명을 매칭해 좁힌다(`_match_departments_in_text`).

- [ ] **Step 2: 실패 확인** — `.venv/bin/python -m pytest tests/test_orchestrator.py -k guide_with_recommendation -v` → FAIL.

- [ ] **Step 3: 구현** — `orchestrator.orchestrate`의 `department_guide` 분기에서 reply 텍스트에 등장한 진료과명을 목록과 매칭해, 있으면 `build_department_select_card(departments=matched, allow_symptom_guide=False)`를 `card`로 붙인다. `chat_flow_service`의 department_guide 처리에 카드 저장 추가(Task 5의 agent 카드 저장과 동일 패턴 — 봇 텍스트 + 카드).

```python
# orchestrator.py, department_guide 분기:
    if route == "department_guide":
        reply = await department_guide_chain.ask_next_question(
            "\n".join(history_texts), getattr(session, "flow_step", 0), model=model)
        result = {"route_taken": "department_guide", "reply": reply, "escalated": False}
        if list_departments_fn is not None:
            departments = await list_departments_fn()
            matched = [d for d in departments if d["name"] and d["name"] in reply]
            if matched:
                result["card"] = card_builder.build_department_select_card(
                    departments=matched, allow_symptom_guide=False)
        return result
```

`chat_flow_service`: department_guide도 `out.get("card")`면 Task 5의 agent-카드 저장 분기를 타게 조건 확장(route_taken in ("agent","department_guide") and card). `list_departments_fn`은 `chat_flow_service`가 `department_service.list_departments`(conn)로 주입.

- [ ] **Step 4: 통과 확인** — Step 1 PASS + 통합 테스트(guide 추천 → card 저장·반환) PASS. 회귀: 기존 department_guide 테스트(카드 없는 경우) 통과. 시드 재적재.

- [ ] **Step 5: 커밋**

```bash
git add backend/app/services/chat/orchestrator.py backend/app/services/chat/chat_flow_service.py backend/app/services/chat/department_guide_chain.py backend/tests/test_orchestrator.py backend/tests/test_chat_integration.py
git commit -m "feat(상담봇 예약): 하이브리드 ① 증상 대화→진료과 카드 연결 (WEBBOOK-08)"
```

---

### Task 10: 화면 규칙 + 정본 문서 반영

**Files:**
- Modify: `docs/design/screen-behaviors.md` (WEBCARD-DEPT/DOC/DATE/TARGET/WHY·WEBBOOK-*)
- Modify: `docs/design/chatbot-source-of-truth.md` §4
- Modify: `docs/design/spec-index/SPECINDEX-ai-chatbot.md` (새 규칙 ID 색인)
- Modify: `docs/superpowers/specs/2026-09-07-webchat-booking-flow-design.md` §10 (kind 이름 확정 역참조)

**설계 노트:** 규칙 ID는 구현이 실제로 만든 동작과 1:1이어야 한다(테스트 한 줄에 규칙 ID 하나 규율). 아래는 배정된 ID — 이미 Task 1~9의 테스트 주석에 쓴 것과 일치시킨다.

- [ ] **Step 1: 규칙 표 추가** (`screen-behaviors.md` 웹 상담봇 절)

배정 ID(테스트와 대조):
- `WEBBOOK-01` 예약 의도(자연어)→진료과 카드 / `WEBBOOK-01b` 진료과명 지름길→의사 카드
- `WEBBOOK-02` pick_department→의사 / `WEBBOOK-03` pick_doctor→날짜 / `WEBBOOK-04` pick_date→시간
- `WEBBOOK-05` agent 카드 응답(막다른 길 아님) / `WEBBOOK-06` nav 피드 삽입 / `WEBBOOK-07` 로그인 후 대상→방문이유→확인 / `WEBBOOK-08` 증상 대화→진료과 카드
- `WEBCARD-DEPT-01` 버튼+증상칩 / `-02` 칩 숨김 / `-03` 탭→pick_department / `-04` 증상칩→guide
- `WEBCARD-DOC-01` 1명이어도 표시·탭→pick_doctor / `-02` 0명 빈+다른 과 경로
- `WEBCARD-DATE-01` 탭→pick_date / `-02` 0일 빈+다른 의사 경로
- `WEBCARD-TARGET-01` 본인+가족·탭→방문이유 / `-02` 가족 없으면 본인만
- `WEBCARD-WHY-01` 방문이유 선택 입력(≤100자)·건너뛰기·prefill

- [ ] **Step 2: chatbot-source-of-truth §4 갱신** — "상담봇 전용 화면 규칙 0개, WEBCARD-DEPT/DOC 없음"을 위 규칙으로 갱신. `~~옛 서술~~ ✅ 해소(2026-09-07, WEBBOOK/WEBCARD-DEPT~) — 결과` 역참조 형식.

- [ ] **Step 3: 설계 문서 §10 역참조** — kind 이름 확정: `pick_department/pick_doctor/pick_date`(익명 nav), `pick_target`(Bearer), 프론트 로컬 `pick_reason`·`submit_reason`, 최종 `book`(기존). 스펙 §5.4의 `set_reason`은 프론트 로컬(submit_reason)로 대체됨을 명시.

- [ ] **Step 4: 색인 갱신** — `SPECINDEX-ai-chatbot.md`에 새 규칙 ID 등재.

- [ ] **Step 5: 커밋**

```bash
git add docs/design/screen-behaviors.md docs/design/chatbot-source-of-truth.md docs/design/spec-index/SPECINDEX-ai-chatbot.md docs/superpowers/specs/2026-09-07-webchat-booking-flow-design.md
git commit -m "docs(상담봇 예약): 예약 대화흐름 규칙 정본 반영 + kind 이름 확정 역참조 (WEBBOOK·WEBCARD-DEPT~WHY)"
```

---

### Task 11: 실호출 e2e 검증 + 마감

**Files:**
- 검증만(코드 변경 없음). 필요 시 `tools/chatbot-verify/bot_test.py` 예약 케이스 기대값 확인.

- [ ] **Step 1: 백엔드 회귀 게이트** — CI 격리 러너 기준으로 챗봇 백엔드 테스트 전건 통과 확인(로컬은 공용 DB 오염 주의). `cd backend && .venv/bin/python -m pytest tests/test_card_builder.py tests/test_booking_agent_service.py -v`(순수) + DB 통합은 전용/CI.

- [ ] **Step 2: 프론트 회귀 게이트** — `npm --prefix webchat run test -- --run` 전건 초록 + `npm --prefix webchat run build`.

- [ ] **Step 3: 실호출 e2e(완료 판정, 스펙 §8)** — `cd tools/chatbot-verify && python3 bot_test.py`(`dangerouslyDisableSandbox:true`). **예약 갈래("예약하고 싶어요")가 `action_unavailable` handoff가 아니라 `route_taken=agent` + department_select 카드에 도달**하는지 확인. ⚠️ 이 검증은 배포된 원격 API를 친다 — Task 5까지가 **원격에 배포된 뒤에만** 통과한다(로컬 커밋만으론 원격 미반영). 배포 전이면 로컬 API(:8000)로 확인하거나, DB 통합 테스트(Task 5)로 대체.

- [ ] **Step 4: verification-before-completion 스킬로 완료 주장 검증** — 각 게이트 출력(실제 PASS 수)을 근거로 보고. 증거 없이 "완료" 주장 금지.

- [ ] **Step 5: finishing** — `superpowers:finishing-a-development-branch`로 통합 방식 결정(머지=Railway 백엔드 프로덕션 자동배포 + Vercel 프리뷰 → **외부 영향이라 사용자 확인 필수**). 원격 반영은 배포 단계(백엔드 push, webchat 재배포).

---

## Self-Review

**Spec coverage(스펙 §4 흐름 1~9 대조):**
- 1 예약 의도→진료과 카드 = Task 4·5·6·7. 증상으로 찾기 = Task 6(칩)·9(연결). ✅
- 2 진료과→의사 카드(1명이어도) = Task 1·2·6(WEBCARD-DOC-01). ✅
- 3 의사→날짜 카드 = Task 1·2·6. ✅
- 4 날짜→시간 카드(기존 재사용) = Task 2(navigate pick_date→time_select). ✅
- 5 시간→로그인 관문(기존 WEBMOD-AUTH) = 기존 onAuthGate(변경 없음) + Task 8 afterAuth. ✅
- 6 로그인→대상 카드 = Task 3·8. ✅
- 7 대상→방문이유 = Task 6 ReasonCard·7 pick_reason/submit_reason. ✅
- 8 확인 카드(기존) = Task 8 book revalidate→booking_confirm. ✅
- 9 신청→완료 카드(기존)·충돌 BOOK-RACE = 기존 execute_card·_revalidate_book(변경 없음). ✅
- 결정 ①~⑤·Q1: 하이브리드(Task 6·9)·의사 항상(WEBCARD-DOC-01)·날짜→시간 2카드·늦은 관문(Task 8)·방문이유 별도(Task 6)·확인 수정칸 없음(기존 BookConfirmCard). ✅
- §5.3 로그인 전 카탈로그 통로 = Task 2(_list_doctors_public·_list_dates_public). ✅
- §6 경계(팝업 차단·로그인 취소·시간 채임·빈·증상 이탈·제한·가족 없음·방문이유 건너뜀·새로고침·위변조) = 기존 자산 + Task 2·6 빈 상태 + Task 3 가족 없음 + 서버 재검증. ✅
- §9 파일 경계 = 준수(단 routers/chat.py 최소 수정을 Task 2에서 명시적 이탈로 문서화). ✅

**Placeholder scan:** 각 Step에 실제 코드·명령·기대 결과 포함. "적절한 처리" 류 없음. 픽스처가 없을 수 있는 곳(seeded_department_with_doctor·anon_thread·patient_with_family)은 "없으면 이렇게 만든다"를 명시. ✅

**Type consistency:** kind 이름 = `pick_department`·`pick_doctor`·`pick_date`(익명 nav, ANON_NAV_KINDS)·`pick_target`(Bearer)·프론트 로컬 `pick_reason`·`submit_reason`·`book`(기존). 카드 card_type = department_select·doctor_select·date_select·target_select·reason_input(프론트 로컬)·time_select/booking_confirm/booking_done(기존). agent 반환 = `{reply, card}`. 전 태스크 일치. ✅

> ⚠️ **알려진 미결(구현 중 확인)**: ① `list_family_members` 반환 키(patient_id/name/relation) 실제 확인(Task 3) ② `seeded_department_with_doctor`·`anon_thread` 등 픽스처는 기존 conftest 헬퍼 재사용 우선 ③ Task 9(하이브리드 결론 판정)는 텍스트 매칭 MVP — 완전 상태머신은 후속.
