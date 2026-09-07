# 웹 상담봇 예약 대화 흐름 — 설계 (2026-09-07)

> 대상: **홈페이지 웹 상담봇(webchat)** 의 예약 대화 흐름. 환자 앱의 "예약 중 상담" 시트(`BOOK-BOT-*`)는 별개이며 이미 결정됨 — 이 문서 범위 아님.
> 근거 정본: `docs/design/chatbot-source-of-truth.md`(§1·§2), `docs/고객요구사항.txt` L49·L57, `docs/design/screen-behaviors.md`(`BOOK-*`·`WEBCARD-*`·`WEBMOD-*`).
> 배경: 2026-09-07 6갈래 실호출 검수에서 "예약/취소가 `action_unavailable` handoff로 빠짐 = 통째로 미구현"으로 드러난 최대 갭. 근본원인은 메모리 `feedback-plan-covers-rules-not-wiring`.

## 1. 문제 정의 (검수가 드러낸 것)

- `orchestrate`는 예약 의도를 `route="agent"`로 잡지만, `agent_fn is None`이면 `reply: None`을 반환한다(`orchestrator.py:59-60`) → **막다른 길**.
- `chat_flow_service.handle_message`는 `rag_fn`만 넘기고 **`agent_fn`을 안 넘긴다**(`chat_flow_service.py:62-63`) → 예약 의도가 항상 죽는다.
- 예약 **앞흐름**(예약 시작 → 진료과 → 의사 → 날짜 → 시간)이 통째로 없다. 진료과·의사·날짜 선택 카드는 규칙도 카드 빌더도 없다.
- **뒷단은 완비**: 최종 확인 카드(`build_booking_confirm_card`), 시간 카드(`build_time_select_card`), 완료 카드(`build_booking_done_card`), 예약 실행(`webchat_service.execute_card`→`_execute_booking`→예약 생성), 재검증(`_revalidate_book`·`revalidate_action`).

## 2. 요구사항 근거

- 요구사항 L49: "상담봇은 병원 안내, 진료과 선택 도움, 예약 가능 시간 조회, **예약 신청**, 예약 변경·취소 안내, 검사 전 준비사항 …" → 봇의 **예약 신청**은 범위 안.
- 요구사항 L57: "무엇을 선택해야 할지 모르겠으면 상담봇과 대화하면서 **적절한 진료과와 예약 가능한 시간을 안내**받습니다" → 진료과 안내(대화)가 명시 역할.
- 대전제: 웹 상담봇이 예약을 **끝까지 신청**한다(사용자 결정 2026-09-07, A안). 안내만 하고 앱으로 넘기는 B안은 기각(요구사항 L49 "예약 신청" 포기·완비된 예약 실행 뒷단 미사용).

## 3. 확정 결정 (사용자, 2026-09-07)

| # | 결정 | 채택 | 기각 |
|---|---|---|---|
| 대전제 | 봇이 예약을 끝까지 신청 | A(끝까지) | B(안내만·앱 유도) |
| ① 진료과 | **하이브리드** — 진료과 버튼 카드 + `잘 모르겠어요·증상으로 찾기`(→ 기존 `department_guide` 증상 대화 → `○○과로 예약`) | C | A(버튼만)·B(대화만) |
| ② 의사 | **의사 선택 카드를 항상 표시**(의사가 1명이어도 건너뛰지 않음) | A+항상표시 | B(생략·자동배정), 1명 자동건너뛰기 |
| ③ 날짜·시간 | **날짜 카드 → 시간 카드**(2단계) | A | B(자연어 날짜)·C(여러 날 합쳐 보기) |
| ④ 익명 관문 | **늦은 관문** — 진료과·의사·날짜·시간까지 익명으로 고르고, **시간 고른 뒤 로그인** → 본인/가족 선택 | A(늦은) | B(이른·시작 즉시) |
| ⑤ 방문이유 | **확인 직전 별도 단계**(선택·건너뛰기, 증상 대화로 왔으면 미리 채움) | A | B(확인 카드 내 입력칸) |
| Q1 수정 | 확인 카드는 **수정칸 없음**(정본 `BOOK-CONF-01·03`), 웹은 `[다시 고르기]` 하나로 **진료과부터 재시작** | A | B(`[시간만 다시]` 추가) |

## 4. 전체 흐름

1. **"예약할래요"(자연어)** → 봇이 **진료과 선택 카드**(진료과 버튼 + 맨 아래 `잘 모르겠어요·증상으로 찾기`).
   - `증상으로 찾기` → **증상 대화**(기존 `department_guide`) → `○○과를 추천드려요 [○○과로 예약]` → 그 과로 진행. **말한 증상은 ⑦ 방문이유로 재사용.**
2. 진료과 정해짐 → **의사 선택 카드**(그 과 의사: 이름·전공·(사진)) — 1명이어도 표시.
3. 의사 탭 → **날짜 선택 카드**(예약 가능한 날짜, 휴진 제외).
4. 날짜 탭 → **시간 선택 카드**(*기존 `build_time_select_card`*). 그날 빈이면 "다른 날짜" 로 되돌림.
5. 시간 탭 → (미로그인이면) **로그인 관문**(*기존 `WEBMOD-AUTH`, 팝업*) → 로그인/가입 → 익명 세션을 계정에 연결(*기존 `attributeSessionToAccount`, `WEBMOD-AUTH-09`*).
6. 로그인됨 → **대상 선택 카드**(본인/가족, *`list_family_members`*; 가족 없으면 본인만).
7. 대상 탭 → **방문이유 묻기**(선택, `[건너뛰기]`; 증상 대화로 왔으면 미리 채움, 최대 100자 — `BOOK-WHY`).
8. → **최종 확인 카드**(대상·진료과·의사·일시·방문이유·장소, *기존 `build_booking_confirm_card`*; `[예약 신청하기]` + `[다시 고르기]`).
9. 신청 → 서버 재확인(가능?) → **예약 생성 + 완료 카드**(*기존 `build_booking_done_card`* + 사전문진 안내). 충돌이면 "방금 찼어요" → 시간 카드로 되돌림(*`BOOK-RACE`*).

## 5. 기술 구조

### 5.1 상태 모델 — 카드 payload가 상태를 들고 다닌다 (서버 무상태)
선택값(진료과 → 의사 → 날짜 → 슬롯 → 대상 → 방문이유)이 카드 버튼 payload에 누적되어 다음 단계로 전달된다. 서버는 상태를 저장하지 않고 매 단계 payload를 **재검증**한다(위변조 방지). 기존 `_revalidate_book`·`execute_card`가 이미 이 방식이며 그대로 확장한다.
- **대안(기각)**: 서버 예약 초안(draft) 테이블 — 새 테이블·만료 정리 로직 필요, YAGNI.

### 5.2 두 처리 경로
- **자연어 = `agent_fn`(LLM)**: `orchestrate`가 `route="agent"`로 잡으면 `agent_fn(session, message)` 호출. 담당: 예약 진입("예약할래요") → 진료과 카드, 증상 대화 → 진료과 추천 → `[○○과로 예약]`. **← 지금 비어 있어 막다른 길이던 자리.**
- **버튼 탭 = 결정적 카드 액션**: 기존 `POST /chat/cards/revalidate`(`revalidate_action`)에 **새 kind만 추가**. `POST /chat/cards/execute`는 최종 신청(기존). **새 엔드포인트 없음 — `routers/chat.py` 무수정**(§9 조율).

### 5.3 데이터 출처 (이미 있음 + 로그인 전 통로만 보완)
- 진료과: `department_service.list_departments(conn)` (로그인 무관).
- 과별 의사: `patient_catalog_service.list_doctors(department_id, patient)`.
- 예약 가능 날짜: `patient_catalog_service.list_available_dates(doctor_id, patient)`.
- 그날 시간: `patient_catalog_service.list_available_slots(doctor_id, date, patient)` / `webchat_service._revalidate_book`가 쓰는 `list_bookable_slots(doctor_id, date)`.
- 가족: `patient_family_service.list_family_members(patient)` (로그인 후).
- ⚠️ **보완 필요**: 의사·날짜·시간 조회가 `PatientContext` 전제인데, ④(늦은 관문)에선 **로그인 전**에 이걸 봐야 한다. 조회에 환자가 실제 필터로 쓰이지 않으므로, webchat 전용으로 **환자 없이(conn 기반) 읽는 얇은 통로**를 추가한다(진료과는 이미 conn 기반). 이 통로는 `webchat_service` 안에 두어 §9 경계를 지킨다.

### 5.4 새로 만들 것
- 카드 빌더(`card_builder.py`): `build_department_select_card`, `build_doctor_select_card`, `build_date_select_card`, `build_target_select_card`(대상). 방문이유는 카드/프롬프트 형태(구현 때 확정).
- `revalidate_action`(`webchat_service.py`) 새 kind: `pick_department` → 의사 카드, `pick_doctor` → 날짜 카드, `pick_date` → 시간 카드(기존 `_revalidate_book` 재사용), `pick_target` → 방문이유, `set_reason` → 확인 카드. (이름은 구현 시 확정)
- 예약 agent 서비스 파일 1개: 자연어 진입 + 증상 대화→예약 연결 → 진료과 카드 반환(`agent_fn` 구현체).
- 배선: `chat_flow_service`가 `orchestrate(..., agent_fn=<위 구현>)` 주입(현재 `rag_fn`만).
- 화면 규칙(`screen-behaviors.md`): `WEBCARD-DEPT`·`WEBCARD-DOC`·`WEBCARD-DATE`·`WEBCARD-TARGET`·`WEBCARD-WHY`(카드), `WEBBOOK-*`(흐름 오케스트레이션). ID는 결정 문서와 함께 배정.
- 프론트(webchat): 새 카드 4종 렌더 + 탭→`revalidateAction` 배선. 기존 카드 렌더러 패턴(`renderCard`/`extraCards`) 확장.

### 5.5 안전·제한 (기존 우선순위 유지)
- 긴급(119/응급실) → 예약 중에도 최우선(`orchestrator` ⓪).
- 제한 모드(`restricted`/`unhelpful_flagged`) → agent가 rag로 강등(기존 `orchestrator.py:51`). 예약 불가 시 직원 연결.

## 6. 경계·에러 처리

원칙: **막다른 길 금지 · 앞 선택 보존 · 없는 상태를 지어내지 않기.**

| 상황 | 처리 |
|---|---|
| 로그인 팝업 차단 | "팝업이 막혔어요 `[로그인 창 열기]`" 재시도 + 선택 유지(`webAuth.ts` null 반환 경로). |
| 로그인 취소·실패 | 시간 고른 상태로 복귀·선택 보존, `[로그인]` 재시도. 개인정보 열거 방지(성공/실패 동일 화면). |
| 시간 채임(신청 순간) | 서버 재확인 → "방금 찼어요" → 같은 의사·날짜 시간 카드로 되돌림(`BOOK-RACE`). |
| 그날 꽉 참 / 의사 가용일 0 | 빈 → "다른 날짜"(기존 TIME "빈" 상태); 가용일 0 → "예약 가능한 날짜가 없어요" + 다른 의사/과 경로. |
| 증상 대화 중 마음 바뀜 | 자유 입력 항상 열림 → 진료과 카드/직접 지정 복귀. 과 판정 실패 시 전체 목록 또는 직원 연결. |
| 제한 모드 | agent → rag 강등. 예약 불가 시 직원 연결. |
| 긴급 | 응급 안내 최우선(⓪). |
| 가족 없음 | 대상 카드 본인만(가족 추가는 앱 몫). |
| 방문이유 건너뜀 | 비워도 됨(선택). 확인 카드 방문이유 줄 생략. |
| 새로고침·재적재 | 진행 중 선택 초기화 감수(카드가 상태를 들고 다니는 구조). 지난 대화는 남음. |
| 위변조 | 매 단계 서버 재검증 — 진료과·의사·슬롯 존재, `for_patient_id`가 본인/연결가족(`BOOK-WHO`). |

## 7. 재사용하는 기존 자산

- 카드: `build_time_select_card`(TIME)·`build_booking_confirm_card`(BOOKCONF)·`build_booking_done_card`(BOOKDONE).
- 실행/재검증: `webchat_service.execute_card`·`_execute_booking`·`_revalidate_book`·`revalidate_action`.
- 예약 생성: `patient_booking_service.create_booking`.
- 슬롯: `list_bookable_slots`.
- 라우팅/안전: `orchestrator`(⓪ 긴급, ⓪-b 직원연결, agent/rag 분기), `department_guide_chain`(증상→진료과), `safety_watchdog`.
- 인증/세션: `WEBMOD-AUTH`(팝업 로그인), `attributeSessionToAccount`.
- 규칙: `BOOK-WHO`·`BOOK-WHY`·`BOOK-CONF`·`BOOK-DONE`·`BOOK-RACE`·`BOOK-TODAY`·`BOOK-TIME`.

## 8. 테스트 전략 (TDD)

- 카드 빌더 4종: 순수 단위(형태·payload 누적).
- `revalidate_action` 새 kind: 단위(각 kind가 다음 카드를 주는지, payload 재검증·위변조 거절).
- `agent_fn`: 단위("예약할래요" → 진료과 카드; 증상 → guide → 진료과 추천; 제한 모드 → 미제안).
- `chat_flow_service` 주입: 통합(agent route가 `reply:None` 대신 카드 반환).
- 로그인 전 카탈로그 통로: 환자 없이 진료과/의사/날짜/시간이 조회되는지.
- 프론트: 새 카드 렌더 + 탭 액션 배선(vitest).
- **완료 판정 = 실호출 e2e**: `tools/chatbot-verify/bot_test.py` 예약 갈래가 `action_unavailable` handoff가 아니라 진료과 카드로 도달(현재 막다른 길 → 카드). 로그인 이후 단계는 인증 필요라 별도 시나리오.

## 9. 파일 경계 (병렬 창 조율, 2026-09-07 확정)

- **이 트랙(chatbot-booking-flow) 소유**: 예약 대화흐름·agent 라우팅 · `card_builder.py` · `webchat_service.py` · 새 agent 서비스 파일 · `chat_flow_service.py`(**agent_fn 주입만**).
- **patient-chat-wiring 트랙 소유**: `routers/chat.py`(환자 분기) · `ai_session_service.py` · 환자용 `/chat/sessions`·`/chat/messages` 계약(ai_chat_session_id).
- 충돌 회피: 이 트랙은 **새 엔드포인트를 안 만들고**(기존 `/cards/revalidate` kind 확장) `routers/chat.py`를 안 건드린다. 상대 트랙은 `webchat_service.py`·`chat_flow_service.py`를 안 건드린다(환자 세션 로직은 새 파일).

## 10. 미결·후속

- ~~`revalidate_action` 새 kind 이름 최종 확정(구현 시).~~ ✅ **확정(2026-09-07 구현)**: 익명 nav = `pick_department`·`pick_doctor`·`pick_date`(`webchat_service.ANON_NAV_KINDS`, `/cards/revalidate`가 X-Anon-Token으로 처리) · 로그인 후 = `pick_target`(Bearer) → 대상 카드 · 프론트 로컬 = `pick_reason`(방문이유 카드)·`submit_reason`(→ `book` 재검증) · 최종 = `book`(기존). 스펙 §5.4의 `set_reason`은 프론트 로컬 `submit_reason`으로 대체.
- ~~`WEBCARD-DEPT/DOC/DATE/TARGET/WHY`·`WEBBOOK-*` 규칙 ID 배정 + 결정 문서 역참조.~~ ✅ **완료(2026-09-07)**: `screen-behaviors.md` 「C. 웹 예약 앞흐름」에 `WEBBOOK-01~08`·`WEBCARD-DEPT/DOC/DATE/TARGET/WHY`·`BOOK-BOT-WIZARD-01~02` 신설, `chatbot-source-of-truth.md` §4 역참조.
- ⭐ **채널 분기 계약 추가(2026-09-07, 사용자 결정 B, patient-chat-wiring 트랙과 합의)**: 앱(`owner_type=patient`/`channel=app`) AI 상담은 대화 안에서 예약하지 않고 **예약 마법사로 인계**한다 — `card_type="open_booking_wizard"`, `payload={department_id?, department_name?}`(추천 과 프리필). 웹(`anonymous_web`)만 대화 내 예약(department_select~booking_confirm). 백엔드 카드·라우팅=이 트랙(`booking_wizard_handoff`, `chat_flow_service`가 `sender_kind`로 분기), 앱 렌더·"예약하러 가기"→마법사 이동·과 프리필=patient-app 트랙.
- ⚠️ **스펙 §9 이탈(routers/chat.py 수정)**: 늦은 관문(④)이 로그인 전 카드 탭을 요구하는데 `/cards/revalidate`가 Bearer 필수라, 익명 nav kind면 X-Anon-Token으로 처리하도록 최소 수정함(patient-chat-wiring은 이 파일 무수정 확인 → 충돌 없음).
- 원격 반영은 배포 단계(백엔드 push=Railway 자동배포, webchat=Vercel). 이 설계·구현은 코드 단계.
- 카드 레이아웃(시각) 목업은 구현 착수 시 별도 — 정본 색·형태는 기존 webchat 카드 따름.
