# 4단계: AI 상담봇 설계 (재작성판)

> 근거 문서: `고객요구사항.txt` 1.5·3.8·3.9·3.10·5장·6장
> 전체 프로젝트 5단계 중 **4단계**. 1단계 스펙(`2026-07-27-foundation-auth-data-model-design.md`)과 구현이 이미 존재하며, 이 문서는 그 위에 쌓는 상담봇 백엔드 + 환자 채널(앱·웹) + 직원·관리자 운영 화면 설계다.
>
> ⚠️ **이 문서는 설계 결정이 모두 확정된 뒤의 재작성판이다.** 결정 근거는 결정로그(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md`), 화면 동작 규칙은 `docs/design/screen-behaviors.md`(상담봇 절 `4777~5682`), 반영 범위·추적성은 `docs/design/spec-index/SPECINDEX-ai-chatbot.md`(Part A 환자 채널 + Part B 직원·관리자 운영)가 원본이다. 이 스펙은 **"화면에 안 보이는 계약"**(테이블·API·상태 전이·오류·권한)을 계약 층까지 확정하고, 화면 규칙 전수(`test('[규칙ID] …')`)와 SQL·migration은 **플랜 재작성(⑤단계)**이 맡는다.
> **통합 대화 스키마 8개 테이블의 컬럼·제약 원본은 결정로그 3-A 절**(`ui-design-decisions.md:4298~4760`)이 단일 원본이며, 이 문서는 그 계약을 요약·참조한다. 컬럼 전수를 여기 복사하지 않는다.
> **여러 단계가 공유하는 데이터 모델**(발송 원장 `notification_log`·알림 설정표·`appointments.support_requested_at`/`request_type`·`phone_reveal` 감사·Twilio 도달)은 **1단계 스펙 섹션 4 「`00010_` 이후 공용 데이터 모델」**이 단일 원본이며, 이 문서는 그것을 **참조**한다. 특히 `support_tickets.appointment_id` FK는 1단계 섹션 4 ①의 `appointments`를 가리킨다.
> DB 반영은 실제 적용 최신 `00009` 다음 **`00010_*.sql`부터** 순차 파일로 하며, 공용 `notification_log` 대기 마이그레이션(`#115·#119`)과 3-A 상담 스키마를 한 계열로 정리한다.

## 범위

**다룬다**: 5.1(앱·웹 두 채널 등장)·5.2(안내형 RAG)·5.3(진료과 추천·응급 안내)·5.4(예약 행동형)·5.5(직원 인계)·5.6(답변 근거·오답 신고), 3.8(병원 안내·지식 관리)·3.9(상담 문의 관리)·3.10(질문 통계)의 화면 본체와 백엔드. 통합 대화 스키마(8개 신규 테이블), 익명 웹 소유권·연락처, 상담 답변 알림 배칭.

**다루지 않는다**: 공용 데이터 모델 정의(→ 1단계 섹션 4) · 직원 웹 셸·역할표·`/today`·캘린더·설정 화면 본체(→ 2단계, 상담봇은 셸 링크·`/today` 상담 행·운영시간을 **읽기만**) · 공용 문진 저장/이력·예약 변경 트랜잭션·의사 소개 원본 저장 UI(→ 2·3단계, 상담봇은 서버 결과를 소비) · 배포·통합 테스트(→ 5단계).

## 화면 목록 (정본)

세는 단위는 사용자가 진입하는 대표 화면이다. 상담봇은 route 기반 SPA가 아니라 앱 탭·웹 위젯·직원 웹 사이드바 그룹으로 나뉜다.

| 소유 | 화면 |
|---|---|
| 환자 앱(Flutter) | `AI 상담` 탭(하단 5번째, 노출명 `AI 상담봇`) · 상담방(단일 시간순 피드) · 이전 상담 목록(`CHAT-HISTORY`) · 예약 중 상담 시트(`BOOKBOT-SHEET`) · 마감 후 팝업(`LATEFLOW-POP`) |
| 웹 상담창(React) | 위젯 런처 + 채팅창 · 로그인/가입 모달(별도 페이지 방식) · 익명 연락처(전화) 폼 |
| 직원 웹 상담봇 그룹(2단계 셸 확장) | 티켓함(분할 작업공간) · 티켓 상세 · 전체 상담 기록 · 오답 신고 |
| 관리자 상담봇 그룹 | ① 병원 안내자료 관리 · ② 미해결 질문 모아보기 · ③ 오답 신고 처리함 · ④ 상담 품질 리포트 · ⑤ 참고 예시 관리 · ⑥ 전체 질문 순위 · 상담봇 통계 대시보드(목업 117, 116 흡수) |

- 사이드바는 **의사 진료화면 단독 + `업무`·`기록`·`설정`·`상담봇` 4그룹**의 상담봇 그룹에 위 직원·관리자 화면이 들어간다(`AD-069`·`SHELL-NAV-01/02/04`, 2단계 셸이 소유). 별도 최상위 메뉴·축소형 사이드바를 만들지 않는다.
- 폐기: 전용 `/cancellation-requests` 대기열(0개 신설), 목업 116 독립 대시보드, 목업 109 독립 상담 화면, 목업 118 운영시간 편집(→ 폐기·교체 표).

## 기술 스택 (4단계 추가분)

| 영역 | 선택 |
|---|---|
| 상담봇 두뇌 | FastAPI + LangChain(LCEL 체인 + `RunnableBranch` 라우터 + `AgentExecutor`) |
| 대화 모델 | Claude Sonnet(`langchain-anthropic`) — 성능·비용 균형 |
| 답변 근거 | RAG(pgvector + OpenAI `text-embedding-3-small`) — 승인 자료만 검색 |
| 저장소 | Supabase(Postgres + pgvector) |
| 실시간 | Supabase Realtime(메시지 INSERT·티켓 상태/담당 구독) + Broadcast/Presence(입력중·접속) |
| 인증 | Supabase Auth(전화번호+비밀번호, 앱·웹 동일 계정. OTP는 가입·비밀번호 찾기만) |

## 섹션 1: 아키텍처 — 채널·처리 순서·장애 격리

- **두 채널, 하나의 백엔드**(5.1): 환자 앱 `AI 상담` 탭과 병원 홈페이지 웹 상담창이 **같은 API**를 쓴다. AI 대화와 직원 상담이 환자에게는 **같은 상담방의 시간순 이력**으로 보인다.
- **매 메시지 처리 순서**(구조 결정 「3-A 실행 순서와 3갈래 체인」): **⓪ 응급 표현 검사(규칙 기반 키워드, AI 호출 전 코드가 직접) → ① 인계 감시(6조건, 라우팅과 무관하게 매 턴) → ② 라우터(`RunnableBranch`, 3갈래)**. ⓪이면 119/응급실 안내 후 종료, ①이면 진행 중 갈래를 중단하고 인계 체인으로 강제 전환.
  - ⓪·①을 코드 단계로 분리하는 이유: 진단 금지·인계 조건 같은 안전장치를 "AI의 그때그때 판단"에만 맡기지 않는다.
- **3갈래**(②): 안내형(RAG 체인) / 진료과 추천형(문진 체인, 진단 금지 강화) / 행동형(에이전트 체인, 도구 실행). 상세는 섹션 3.
- **실제 예약·취소 실행은 봇 권한 밖**(5.4): 확인 카드의 버튼 → **Claude를 거치지 않고** 3단계 예약/취소 API 직행. "봇이 몰래 예약·취소하지 않는다"를 구조로 보장.
- **장애 격리**(6.4): 상담봇은 예약·진료 시스템과 분리된 별도 기능. Claude/OpenAI 중단 시에도 예약·진료기록은 정상. 봇 장애 시 상담창은 봇 없이 티켓을 만드는 경로로 전환(웹은 전화·`[문의 남기기]` 주 CTA, 앱 예약은 보조 — `WEBCHAT-OUTAGE-*`, 갭 「번호 없음」).
- **긴급 표현 대응**(5.3): ⓪단계는 규칙 기반이라 AI가 놓칠 위험이 없다. 심한 흉통·호흡곤란·의식 저하 등 긴급 표현 시 예약·진료과 추천을 멈추고 119/응급실 안내. 진단·약 추천·확정 표현 금지. 완벽 보장으로 표현하지 않는다. 분류를 확정 못 한 예외는 제목 `안내`, 본문 고정 문구(`CHAT-URGENT-EXC-01`).
- **인증·소유권**: 앱·웹 동일 전화번호+비밀번호 계정. 웹 익명 사용자는 로그인 없이 시작하되, 로그인이 필요한 시점(내 예약 확인·예약 실행)에 로그인/가입 모달. 익명 상담은 **환자 계정으로 자동 매칭하지 않는다**(섹션 4·SD-05).

## 섹션 2: 통합 대화 스키마 (`chat_threads` 루트) — 3-A / 구조 결정 SD-01~09

> 컬럼·제약·enum·인덱스의 **단일 원본은 결정로그 3-A 절**(`ui-design-decisions.md:4298~4760`). 이 절은 테이블의 역할과 **화면에 안 보이는 핵심 계약**(상태 전이·소유권·경계)만 확정한다. 옛 `chat_conversations`(`bot/handed_over/closed` 단일 상태) 모델은 **폐기**하고 아래로 통합한다.

**관계**: `chat_threads`가 환자에게 보이는 "같은 상담방"의 안정적 루트다.

```
chat_threads
  ├─ ai_chat_sessions           0..N  (30분 무활동 경계를 가진 AI 상담 단위)
  ├─ support_tickets            0..N  (재문의마다 새 행 + previous_ticket_id)
  ├─ chat_messages              0..N  (AI·환자·직원 메시지의 단일 시간순 원장)
  ├─ chat_read_states           0..N  (참여자별 확인 위치·열람)
  └─ chat_notification_batches  0..N  (미확인 연속 직원 답변 묶음)
anonymous_chat_sessions
  ├─ chat_threads               0..N
  └─ anonymous_chat_contacts    0..N  (익명 웹 SMS 연락처)
```
메시지는 항상 `thread_id`를 가지며 동시에 **정확히 하나**의 `ai_chat_session_id` 또는 `support_ticket_id`를 가진다. `thread_id, created_at, id` 순서로 한 화면의 연속 이력을 복원한다.

**8개 신규 테이블(+보조 3개)과 핵심 계약**:

1. **`chat_threads`** — 상담방 루트(SD-01). `owner_type`(`patient`/`anonymous_web`)에 따라 `patient_id` 또는 `anonymous_session_id` **정확히 하나만** 존재. **연락처가 같다는 이유로 `owner_type`·`patient_id`를 바꾸지 않는다**(SD-05). `last_activity_at`은 목록 정렬용이며 AI 30분 만료 판단의 원본으로 쓰지 않는다.
2. **`support_tickets`** — 직원 상담 생명주기(SD-02). 전이는 **`pending → in_progress → answered`만** 허용, 역전이 금지. 일반 `[보내기]`는 상태를 바꾸지 않고 직원의 **`[상담 종료]`만** `answered`(+`closed_by_staff_id`·`closed_at`). 한 `thread_id`에 열린 티켓(`pending`/`in_progress`)은 **최대 하나**(partial unique). 완료 티켓은 재개하지 않고 재문의는 새 PK 행 + `previous_ticket_id`. **`appointment_id`(nullable FK → 1단계 섹션 4 ①의 `appointments`)**로 취소·변경 상담이 어느 예약인지 DB가 보장(SD-04, 통합 공백 3). AI 30분 만료 작업은 이 표를 건드리지 않는다.
   - 보조 **`support_ticket_assignment_history`**: 배정·이관 감사 이력(현재값은 `support_tickets.assigned_staff_id`, 변경 이력은 이 표). 동시 배정 경쟁에서 한 명만 성공(SD-03, 원자성 테스트 필수).
3. **`chat_messages`** — Realtime 단일 메시지 원장(SD-01·SD-06). `ai_chat_session_id`와 `support_ticket_id` 중 **정확히 하나**. `sender_type`(`patient`/`bot`/`staff`)에 맞는 발신자 FK 규칙. **`client_message_id`(non-null 전역 unique)**로 재전송 멱등. **직원 티켓이 `pending`/`in_progress`인 동안 봇 메시지를 그 문맥에 넣지 않는다**(AI 침묵을 서비스 계층에서 강제). 전송 성공 후 본문·발신자·시각 수정 금지. **카드 보존**: `message_type + payload jsonb` 버전 스냅샷(카드 8종·상태·실행결과 복원, 통합 공백 2·SD-06). **시스템 경계**(직원 연결·담당 변경·상담 종료·AI 만료·새 AI 시작)는 `chat_events` 또는 `system` 메시지 유형으로 시간순 보존(통합 공백 6).
   - 보조 **`chat_message_sources`**(통합 공백 5): 답변 근거를 실제 FK(`message_id`·`chunk_id`)로 저장 + 당시 순서·유사도·가능하면 원문 스냅샷. 옛 `source_chunk_ids uuid[]`는 재임베딩 시 근거가 깨져 **폐기**. 5.6 근거 추적·과거 답변 재현.
4. **`ai_chat_sessions`** — 30분 경계 AI 상담 단위(SD-06 만료). 한 `thread_id`에 `active`는 **최대 하나**(partial unique). `last_activity_at + 30분 = expires_at`, 무활동 시 조건부로 `expired`(+`end_reason=inactivity_timeout`). **창 닫힘·Realtime 끊김만으로 종료하지 않는다.** 직원 인계 시 `ended/staff_handoff`로 닫고 티켓 생성 — **직원 티켓에는 30분 만료를 적용하지 않는다.** 이어가기(`[이전 내용 이어서 질문]`)는 요약을 가진 **새 행**, `[새 질문 시작]`은 출처·요약 칼럼 모두 `null`인 새 행(과거 문맥 미전달).
5. **`anonymous_chat_sessions`** — 익명 웹 세션(SD-05). 브라우저 원문 토큰은 저장하지 않고 `token_hash`(단방향 해시, unique)만. 회전·폐기 가능. 토큰 만료 기간은 3-A 미확정 → 플랜이 임의 제품값으로 쓰지 않는다.
6. **`anonymous_chat_contacts`** — 익명 웹 SMS 연락처(SD-05). `contact_kind=phone`, 전화번호는 **암호화 저장**(`contact_value_ciphertext`) + 검증·중복용 `contact_value_hash`. **해시가 기존 환자 번호와 같아도 `patient_id`를 자동 채우지 않는다.** `verified_at`·`answer_notification_enabled_at`(정보성 SMS 동의, 광고 아님). 익명 SMS의 실제 대상은 이 검증된 연락처이며 `patients`·`notify_patient()` 대상 조회에 의존하지 않는다.
7. **`chat_read_states`** — 참여자별 확인 위치(SD-07). `reader_type`(`patient`/`anonymous_web`/`staff`)에 맞는 FK 하나. `last_read_message_id`·`active_view_until`(짧은 열람 heartbeat, 영구 `is_viewing=true` 금지). 참여자·상담방 조합당 한 행.
8. **`chat_notification_batches`** — 미확인 연속 직원 답변 한 묶음(SD-07). PK가 알림 멱등 키. 사용자가 상담방을 **보고 있으면**(`active_view_until`) 즉시 확인 처리하고 배치·알림을 만들지 않는다. 안 보고 있으면 첫 미확인 직원 메시지가 열린 배치를 만들고 **알림 한 번만** 요청, 확인 전 연속 답변은 같은 배치 갱신(새 알림 없음). 확인 후 새 답변은 새 배치. **담당 배정·이관·상태 변경만으로는 배치를 만들지 않는다**(실제 `sender_type=staff` 메시지만).

**enum 요구**(3-A §3): `chat_thread_owner_type`·`support_ticket_status`·`chat_sender_type`·`ai_chat_session_status`·`ai_chat_end_reason`·`chat_continuation_source_type`·`chat_reader_type`·`anonymous_contact_kind`·`notification_recipient_type`·`notification_message_class`. 발송 상태는 공용 `notification_delivery_status`(`sending/delivered/failed/retrying`)를 재사용하고 상담 전용 결과 enum을 만들지 않는다.

**인덱스·무결성**(3-A §6): FK 전 인덱스 + 타임라인/큐/경쟁 경로(`chat_messages(thread_id, created_at, id)`, `support_tickets(status, created_at)` partial, 열린 티켓·활성 AI 세션·열린 배치의 partial unique, `notification_log(chat_notification_batch_id)` unique 등). 메시지·티켓·세션·알림 이력은 **hard delete·연쇄 삭제 금지**(보존기간 파기는 섹션 8).

**지식베이스·품질 테이블**(옛 스펙에서 존치): `kb_documents`(승인 상태·`is_restricted`) · `kb_chunks`(RAG 검색 단위, 승인·수정 시 재청킹+재임베딩) · `kb_document_revisions`(3.8 수정이력) · `answer_feedback`(오답 신고·정정, `source`=`realtime_report`/`periodic_review`/`quality_review`) · `qa_example_bank`(교정 예시 축적). **품질 검토 완료 상태**(오답 없어도 "검토했음" 저장 + 미검토 우선 정렬)는 SD-08 — `answer_feedback` 확장 vs 상담 단위 review 표는 플랜 확정(대상 미확인).

## 섹션 3: 대화 처리 흐름과 도구

**메시지 처리**: ① 환자 메시지 저장 → ② ⓪응급 검사(걸리면 `route_taken=emergency` 저장·종료) → ③ ①인계 감시(6조건, 걸리면 인계 체인, 라우터 건너뜀) → ④ ②라우터 분류 → ⑤ 갈래 체인 실행 → ⑥ 봇 답변을 `chat_message_sources`·`route_taken`·카드 payload와 함께 저장 → Realtime 반영.

**갈래 ①: RAG 체인 — 안내형**(5.2): 질문 임베딩 → pgvector로 `kb_chunks` 유사 조각 3~5개(**승인 자료만**) → LCEL 프롬프트 → Claude. 도구 없음. 검색 1위가 **제한 자료**(`is_restricted`)면 Claude를 호출하지 않고 원문을 **별도 블록에 그대로** 표시(생성문에 안 섞음). 질문 전체가 제한 주제면 제한 문구 + `[직원 연결]`만, 일반 자료가 함께 걸리면 일반 주제는 답한다(구조 결정 「제한 자료 안전 경계」, `KBADM-EDITOR-03/04`). 검색 실패 시 **코드가 직접** 행동형으로 1회 재시도(무한루프 없음), 재실패는 인계 감시 `no_answer`.

**갈래 ②: 문진 체인 — 진료과 추천형**(5.3): 자유 대화가 아니라 정해진 순서(불편 증상 → 시작 시점 → 동반 증상 → 방문 목적). 전용 시스템 프롬프트에서 병명 언급·확정 표현·약 추천 금지를 강화. 마지막에 `진료과의사_조회`로 실 진료과 확인 후 1~2개 안내, 최종 선택은 환자.

**갈래 ③: 에이전트 체인 — 행동형**(5.4): `AgentExecutor` + 도구.

| 도구 | 하는 일 | 로그인 |
|---|---|---|
| `병원자료_추가검색` | 대화 중 새 주제 KB 재검색 | ✕ |
| `진료과의사_조회` | 운영 진료과·의사·요일·시간·휴진 실 DB 조회(문진 체인과 공유). 요일 요약은 서버 단일 `schedule_summary` 소비(갭 #9) | ✕ |
| `예약가능시간_조회` | 실제 빈 시간(지어내기 차단) | ✕ |
| `내예약_확인` | 본인·가족 현재 예약 | ✅ |
| `예약제안_카드보내기` | 대상·과·의사·**방문이유**·날짜·시간 확인 카드(갭 #8, 방문이유 1회 물음·최대 100자·선택) | ✅ |
| `예약취소_카드보내기` | 취소 대상 확인 카드, 마감 전후 자동 분기 | ✅ |
| `사전문진_카드보내기` | 사전문진 카드로 상태·전용 화면 진입 제공 | ✅ |

- **가족 도구 확장**: `내예약_확인`·`예약제안_카드보내기`·`예약취소_카드보내기`는 본인+가족(대리 등록) 대상. 1단계 `patient_family_links`·`patient_owns()`·`account_patient_id`/`for_patient_id` 재사용(새 모델 없음). 대상이 여럿이면 먼저 "누구의 예약인가요?" 확인.
- **도구화 원칙**: 조회성·"버튼 누르면 그대로 실행"만 도구. 개인정보 신규 생성(가입·가족 등록)·타인 정보·비가역 행동은 앱/모달로 안내.
- **KB 문서 작성 원칙**: 도구가 처리하는 동작(예약 확인·취소)은 경쟁 KB 문서를 만들지 않는다. 예외(하이브리드)는 **진료과·의사소개** 카테고리 — 실시간 값은 `진료과의사_조회`가, 소개성 정보(전공·경력·인사말)만 KB. 의사 소개 원본은 `staff.specialty/bio/photo_url`(갭 #7, 저장·관리 UI는 2·3단계). KB에 소개를 중복 저장하지 않는다.

**빠른 답변**(`quick_replies`, 갭 #20 / `CCARD-QUICK-*`): `message_type=quick_replies` + 버튼 배열. 시작은 앱의 다가오는 예약 유무로 **고정 4개**, 대화 중은 AI가 안전 규칙 적용해 **3~4개 생성(성공 시에만)**, **생성 중·실패는 표시하지 않고** 자유 입력은 항상 유지. 버튼 문장은 그대로 환자 말풍선으로 저장. 실제 값·API는 환자 채널(코4) 주담당.

**`예약취소_카드보내기` — 마감 전후 분기**(4.3·5.4, 갭 #6): 확인 카드 `[이 예약 취소]` → **Claude 거치지 않고** 3단계 `cancel_appointment` 직행.
- **마감 전(생성 후 30분 이내 포함)**: 즉시 취소 확정.
- **마감 후**: 카드/API를 직접 호출하지 않고 **`LATEFLOW-POP`으로 보낸다.** 팝업 `[상담 채팅 연결]`이 **유일한 결정지점** → 즉시 `appointments.support_requested_at`+`request_type`(1단계 섹션 4 ①) 기록 + 배지 + `support_tickets.appointment_id`로 예약 맥락 상담방 진입. **희망 일시는 저장하지 않는다**(새 시간은 대화에서). 전용 `/cancellation-requests` 대기열·옛 `cancellation_requested_at`·`late_cancellation` 사유는 **폐기**.
- **환자 노출 문구 원칙**: "취소 요청이 접수/등록됐다" 표현 **금지**. **"상담(직원 확인)으로 연결됐다"만.** 취소 확정 전 취소 완료·접수 표현 금지.

**`사전문진_카드보내기`**(4.4, `CCARD-QNR-*`): 문항을 채팅에 나열하지 않고 **상태·서버 진행률·전용 문진 화면 진입만** 제공. 예약 신청 완료 시 코드가 1회 자동 호출 + 이후 재요청 시 재호출(`for_patient_id`/`appointment_id`). 앱은 진료 시작 전 보기/수정·진료중부터 읽기 전용(갭 #21, 서버 계약 소비 — 카드가 재계산하지 않음), **웹은 문진 UI를 만들지 않고 환자 앱 경로만 안내**(R2-5). 0문항은 `작성할 문진이 없습니다`, 기존 답은 `[내용 보기]` 읽기 전용. 취소 뒤 답은 읽기 전용 보존·자동 복사 금지. 옛 웹 `QuestionnaireCard` 직접 편집·저장은 **폐기**.

**예약 중 상담 시트**(`BOOKBOT-SHEET-*`, 갭 #10 / E4): 예약 2단계 위에서 시트를 열고 본인/가족 맥락 전달. **정보성 안내·진료과 추천만** 허용, 예약·취소·문진 등 행동형 도구는 **전부 금지**(119·응급실 안전 안내만 예외). 유일한 출구는 `○○과로 계속하기`(3단계에 값 반환). X/스와이프는 선택값을 잃지 않는다.

**인계 체인**(감시 ①이 발동): 별도 LLM 호출로 요약 5항목(환자 질문 / 확인 정보 / 안내한 내용 / 미해결 이유 / 직원 확인 사항) 작성 → `support_tickets` 생성(감지 조건을 사유에 기록) → AI 세션 `ended/staff_handoff`. 감시 6조건(답 못 찾음·의료판단 필요·👎·정보 불일치·불만/사고/개인정보/비용분쟁·반복 미해결)은 라우터 갈래와 무관하게 매 턴 검사, 에이전트 판단과 무관하게 무조건 실행.

**직원 라이브·종료·재문의·이어가기**(`CHAT-ROOM-LIVE/END-*`, R2-3A): 직원 상담은 같은 방·같은 피드. 상태 `직원 연결 중 → 직원 상담 중 → 상담 종료`. 일반 답변 전송은 종료가 아니다. 직원 `[상담 종료]`만 `answered`. 종료 후 AI 이어가기(`continued_from_ticket_id`+요약)/새 질문 제공. 종료 티켓 재개 대신 새 티켓(`CHAT-ROOM-RETICKET-*`). 긴 대화는 하드 차단 대신 소프트 넛지(`CHAT-LEN-01`, 실제 한도·요약/절단은 플랜 확인 필요 — 대상 미확인).

## 섹션 4: 환자 채널 화면 (앱·웹)

**공통**(`CHAT-TAB/ROOM-*`): AI·직원 메시지·카드를 **하나의 시간순 피드**에 넣고 자유 입력은 항상 유지. 카드는 넓은 세로형·상단 꼬리표·강화 테두리/배경(임의 아이콘·좌측 바 금지). 봇 답변 말풍선은 색이 아니라 작은 머리말 `진료 안내`/`병원 이용 안내`로 구분(요구사항 7절, `CHAT-ROOM-VISUAL-*`). 문진 체인 진행 중 `진단이 아니라 진료과 안내입니다` 고정 배너(5.3·`CHAT-GUIDE-*`). 전송 중 버튼 잠금·재전송(`CHAT-ROOM-SEND-01~03`, 실패를 성공처럼 보이지 않게).

**환자 앱**: 하단 5번째 탭 `AI 상담`(노출명 `AI 상담봇`). 인계 후 상단에 티켓 상태 배지(`대기중`/`직원 확인중`/`답변완료` = `support_ticket_status` 그대로) + 예상 답변시간 문구(업무시간 내/외, 운영시간은 직원 웹 `SCHED-HOURS`를 **읽기만** — 섹션 7). 직원 답변 푸시 → 해당 방. 이전 상담 목록(`CHAT-HISTORY`, 상단 `이전 상담` 아이콘 `NAV-CHATAPP-09/10`, 목록에서 뒤로가면 상담방 복귀).

**웹 상담창**(`WEBCHAT-*`): 홈페이지 우하단 런처 → 채팅 위젯(앱과 동일 API). **닫힌 런처는 미읽음 숫자 대신 작은 점만**. 로그인 필요 시점에 로그인/가입 모달(가입=별도 페이지 방식, 3단계 백엔드·Twilio 재사용). 인증 완료 뒤 **예약·취소를 자동 실행하지 않고** 최신 대상·슬롯 서버 재검증한 **재확인 카드**를 다시 표시(`WEBMOD-AUTH-08`, MR2-03).

**익명 웹 소유권·연락처**(`WEBANON-HANDOFF-*`, SD-05·MR2-01): 익명 전화번호는 **선택 입력**이며 **직원 답변 SMS 수신용으로만**. **같은 브라우저 토큰으로만 복원**하고 **다른 기기 이어보기는 제공하지 않는다**(전화번호로 환자 계정·다른 기기 복원하는 옛 해석 **폐기**). 번호가 없으면 런처의 미읽음 점으로 재방문 안내. 미확인 연속 답변은 한 번만 배칭(섹션 7).

**AI 장애 시**(`WEBCHAT-OUTAGE-*`, 갭 「번호 없음」): 웹 주 CTA는 전화 + `[문의 남기기]`, 앱 예약은 보조. 긴급 안내는 인증·연락처 수집보다 먼저. 앱·웹 모두 봇 없이 기존 문맥으로 티켓 생성.

## 섹션 5: 직원 상담 화면 (2단계 셸 확장) — 갭 G-01·G-04·G-05

- **티켓함**(`TICKET-INBOX-*`): **왼쪽 목록 + 오른쪽 넓은 작업공간 분할**(전체 화면 원칙의 명시적 예외, R2-3). 탭 `새 문의(pending)/처리 중(in_progress)/답변완료(answered)`. 순서 **`created_at ASC, id ASC`**(D2). 행 선택은 **자동 배정 + 상태 전이를 한 원자 동작**(SD-03) — 경쟁에서 진 직원은 상세를 열지 않고 목록에 남으며 `이미 다른 직원이 맡았어요`. **별도 담당지정 버튼은 없다**(배정 후 재배정만). 로딩/오류/Realtime 갱신.
- **티켓 상세**(`TICKET-DETAIL-*`, MR2-09): 배정 → **인계 요약 5항목**(질문·확인 정보·안내한 내용·미해결 이유·직원 확인 사항, 값 없으면 만들어내지 않음) → **전체 대화** → 답변 입력/`[보내기]` → **별도 `[상담 종료]`**. **`[보내기]` 성공은 `in_progress` 유지**, 실패는 입력 보존. `[상담 종료]`만 `answered`(SD-02, `TICKET-DETAIL-CLOSE-SEP-01`). `medical_judgment` 사유엔 담당 의사 재배정 강조. 답변 전용 버튼·최초 담당지정 전용 버튼은 없다. 옛 `answer_ticket`(발송=종료)은 **폐기**.
- **전체 상담 기록**: 앱·웹 통합 목록(`channel`·`route_taken` 필터, 5.1). 봇 답변 클릭 시 근거 자료 표시(5.6, `chat_message_sources`).
- **오답 신고**: 봇 답변에 `잘못된 답변` + 올바른 안내(`source=realtime_report`) + `향후 유사 질문 예시로도 사용` 체크박스. 저장 후 원래 상담/티켓 상세로 스크롤 복귀(B2).
- **`/today`·캘린더 소비 계약**(G-01, D4 — 화면 본체는 2단계): `/today`의 `확인 필요 상담 문의` 카드는 **`pending` 티켓 실제 건수**(옛 `pending_inquiries_count: 0` 하드코딩 폐기). 마감 후 취소·변경 상담은 **독립 수치카드를 만들지 않고**(폐기) `/today`의 `확인 필요한 예약` **환자별 행**으로 합류, 행↔티켓↔예약 **양방향 이동**(`NAV-STFSUP-02/08/13/14`, 티켓·예약 context·목록 필터/스크롤 복원). 예약 처리는 캘린더 ⚠+기존 패널, 티켓함은 전체 대화용. 환자 상세(`/patients/:id`)의 `지원 문의` 섹션은 해당 환자 `support_tickets`를 표시(3.5, 2단계 화면).

## 섹션 6: 관리자 운영 화면 — 갭 G-05·G-06 (3.8·3.9·3.10)

콘텐츠 검토·수정·업그레이드 사이클: **②③④에서 문제를 찾아 → ①에서 안내자료 수정 → `[승인]` 시 자동 재임베딩으로 반영 → ⑤에 교정 결과 축적.** 각 목록은 **loading/empty/error/retry**와 **0건 vs 계약 부재("현재 집계할 수 없음")**를 구분하고, 원문 실패 시 수정 금지(G-05).

- **① 병원 안내자료 관리**(`KBADM-*`): 목록(분류·상태 필터), 작성/수정. **draft 저장은 비공개**, `[승인]` 시 **재청킹+재임베딩이 성공하기 전 기존 승인본 유지**(오승인 복구·이전 버전 재편집→재승인 경로). `상담봇이 직접 답변하지 않고 이 문구만 그대로 보여줍니다` 체크박스(정확한 문구, `is_restricted`, 3.8). 자료별 `수정이력 보기`(`kb_document_revisions` 역순, 3.8).
- **② 미해결 질문 모아보기**(`UNRES-CLUSTER-*`, 신규, 3.9/3.10): 기간의 `no_answer`/`repeated` 티켓을 질문 임베딩 유사도로 클러스터링, `대표 문구 + N건` 내림차순. **`자동으로 묶은 결과라 다른 질문이 섞일 수 있다` 안내**. `medical_judgment`/`unhelpful`/`data_mismatch`/`complaint`는 제외.
- **③ 오답 신고 처리함**(`BADRPT-*`): `반영`(자료 수정 연결, `add_to_example_bank` 체크 시 `qa_example_bank` 등록) / `반려`.
- **④ 상담 품질 리포트**(`QUALITY-REPORT-*`, 신규, R2-4): **목록 + 우측 상세 패널**(분할 예외), **미검토 우선·20건 단위**. 신고 무관하게 아무 대화나 열어 교정(`source=quality_review`) → **bad inbox → 반영/반려 → KB 승인**(즉시 KB 적용 **폐기**, SD-08). `검토 완료` 저장(오답 없어도).
- **⑤ 참고 예시 관리**(`QAEX-LIST-*`): `qa_example_bank` 목록, 더 안 쓸 예시는 `비활성화`(삭제 대신 숨김). 답변 생성 직전 유사 활성 예시를 프롬프트에 주입.
- **⑥ 전체 질문 순위**(`QTOP-RANK-*`, 신규, 3.10): 기간 `chat_messages(sender=patient)` 전체를 클러스터링(②와 같은 방식이나 **답변 성공 여부 무관**). 자주묻는질문 KB 등록으로 이어짐. 클러스터 혼합 가능성 표시.
- **상담봇 통계 대시보드**(`BOTSTAT-DASH-*`, 목업 117 — 116 흡수, 별도 최상위 메뉴 없음): 기간별 상담 수(앱/웹), 갈래별 분포, 인계 건수·사유, 오답 신고 수. **앱/직원/챗봇 유입 비율 분리**, 유효한 0 vs 계약 부재 구분. `/admin/stats`(2단계)와 같은 상호작용 — CSV·드릴다운·마스킹·감사 로그.

## 섹션 7: 상담 답변 알림 — 공용 dispatcher 참조 (1단계 섹션 4 ②·⑧ / SD-07)

- **별도 발송 로그를 만들지 않는다.** 등록 환자와 익명 연락처가 **같은 `notification_log`·배칭·dispatcher·재시도**를 쓴다(1단계 섹션 4 ② 확장).
- **수신 대상 추상화 `NotificationRecipient`**(3-A §5): 등록 환자(`patient_id`, 기존 채널 정책) / 익명(`anonymous_session_id`+`anonymous_contact_id`, 채널 **SMS**, 분류 항상 `transactional`). **목적지 확인 adapter만 두 종류**, 이후 `배치 생성 → 대상 해석 → 공통 dispatcher → notification_log 결과/재시도`는 한 파이프라인. `patients`에 가짜 행·전화번호 추측 매칭 금지. 기존 `notify_patient()`는 등록 환자 adapter로 감싼다.
- **`notification_log` 추가 요구**: `notification_type`에 **`staff_chat_reply` 추가**, `recipient_type`·`message_class`, `chat_notification_batch_id`(상담 답변 알림에서 not null·unique), `appointment_id` nullable, 익명 수신자 컬럼(`anonymous_session_id`+`anonymous_contact_id`). 자동 발송이라 `sender_staff_id=null`(답변 직원은 `chat_messages.sender_staff_id`로 추적), `target_count=1`. 한 배치당 로그 1행, 재시도는 같은 행 갱신.
- **운영시간·다음 영업일 문구**(MR2-05·갭 #9): 앱·웹이 환경변수·로컬 계산을 쓰지 않고 서버 `is_open(at)` 결과를 소비. 직원 웹 `SCHED-HOURS/EXC`가 단일 소스, 상담봇은 **읽기만**. 옛 `is_business_hours()`·`settings.business_hour_start/end`는 **폐기**.

## 섹션 8: 오류·보안·보존기간·원자성·테스트

**오류 처리**(6.4): AI 장애 시 예약·진료 무영향. 개발자용 오류문 노출 금지(전부 한글). 메시지 전송 상태·재전송(실패를 성공처럼 보이지 않게). 상담봇 오류는 시간·기능과 함께 기록, 관리자 확인(서비스 전체 장애는 `system_error_log`, 수신자별 발송 실패는 `notification_log` — 다른 층).

**보안**(5.6·6.5): 모든 신규 공개 테이블 RLS 활성 + FK/조회 칼럼 인덱스.
- 로그인 환자는 자신(또는 가족 접근 계약) `patient_id`의 상담방·메시지만 읽고 자기 주체 메시지만 생성.
- 익명 웹은 원문 토큰을 DB에 직접 제시하지 않는다 — 백엔드가 `token_hash` 검증 후 해당 `anonymous_session_id` 범위만 반환(또는 서명된 Realtime 권한). 원문 토큰·전체 연락처·해시가 payload로 새지 않게.
- 직원은 상담 지원 역할 범위 티켓·메시지만(정확한 역할표는 2단계 셸·동작명세 소비, 이 스펙이 넓히지 않음). 환자·익명은 `assigned_staff_id`/`status`/`closed_*` 갱신 불가. 직원은 `patient`/`bot` 메시지 생성 불가, 환자는 `staff` 메시지 생성 불가.
- bot 메시지 생성·30분 만료·요약 저장·알림 배칭/재시도는 제한된 서버 주체만. API 키(Claude/OpenAI/Twilio)는 서버 환경변수만, 웹도 반드시 백엔드 경유. 익명 웹 시간당 메시지 rate limiting.

**보존기간·파기**(SD-09, 방침 `FINAL` / migration **BLOCKED**): 전역 TTL 금지 → `retention_class` 6개 분리. 법정값은 **코드 강제**(화면 설정칸 없음): `medical_record` 진료기록 편입분 **10년**(의료법 시규 §15), `access_audit` 감사로그 **2년**(안전성확보 §8), `pseudonymous_or_tokenized` 암호화 전화·재식별 토큰 **원 데이터와 동일**. 병원 방침값(기본 1년, 안전한 초기값): `appointment_operation`·`consultation_message`(진료 편입분은 `medical_record`로 이관/복제)·`notification_delivery`. 미확정 3개는 목적 종료 후 **5일 내 파기**. ⚠️ **법무 게이트**: 직원웹 #14 보존기간과 한 묶음(의료법 시규 §15·안전성확보 §8 원문 재확인). `retention_class` 칸 + 클래스별 TTL/파기 배치는 플랜 재작성 때 **BLOCKED**.

**원자성·멱등성 수용 조건**(3-A §8, 플랜 테스트로 이관): ① 두 직원 동시 배정 → 한 명만 담당 ② 일반 `[보내기]` 뒤에도 `in_progress`, `[상담 종료]` 한 번만 `answered` ③ 완료 티켓 메시지 추가·재개 불가, 재문의는 새 ID ④ 동일 `client_message_id` 재전송 → 1행 ⑤ AI 만료 vs 새 메시지 경쟁 → `active`·`expired` 동시 불가 ⑥ 직원 동시 답변 → 배치 1·로그 1 ⑦ 확인 후 새 답변 → 새 배치 ⑧ 상담방 열람 중·배정·상태 변경만으로는 배치 없음 ⑨ 연락처 해시 일치해도 `patient_id` 자동 연결 없음 ⑩ Realtime 재연결 시 커서 이후 중복 없이 보충 ⑪ `patients`·기기토큰 없는 익명도 검증 전화로 SMS(로그에 `patient_id=null`+익명 FK) ⑫ 등록/익명이 같은 대상 계약·배칭·dispatcher·상태/재시도 테스트 통과, 익명 답변 SMS는 항상 `transactional`.

**기능별 테스트**: 승인 자료만 검색 / 수정 시 재임베딩·기존 승인본 유지 / 도구 권한(본인·가족 범위 밖 조회·예약·취소 차단, 대상 다수 시 먼저 확인) / 인계 감시 6조건 개별 / 응급 골든 문구 100%(결정적 필터) / 라우터 분류(애매하면 도구 있는 행동형) / RAG 골든 30~50 적중률·청크 실험 / 마감 전후 분기(마감 후 `support_requested_at`·티켓 + "취소 요청 접수" 문구 미노출) / 사전문진 자동 1회·재요청 재호출·도착 후 잠금 / 품질 사이클(예시 등록 후 반영) / 시스템 이벤트·카드 payload 과거 재현.

## 이번 단계에서 다루지 않는 것 (다른 영역 담당)

- 공용 문진 저장·문항 대상 성별·진행률·이력 API, 예약 변경 시 문진 이동(#17·#18·#21·#24) → **2·3단계**. 상담봇은 서버 계약·앱 경로만 소비(카드가 재계산하지 않음).
- 의사 소개 원본 저장·관리 UI(#7) · 운영시간 저장/수정·문자 사용 설정(MR2-05) · 역할 포함관계·전역 감사(#114) · 직원 웹 셸·`/today`·캘린더·환자 상세 화면 본체 → **2·3단계**. 상담봇은 읽기·소비 계약만.
- 관리자 품질 처리함·KB 승인 트랜잭션·알림 dispatcher 구현의 공용 부분은 담당 경계 API만 남긴다.
- 배포·통합 시나리오·데이터 백업 → **5단계**.

## 폐기·교체 요약

| 폐기 | 교체 |
|---|---|
| `chat_conversations` 단일 상태(`bot/handed_over/closed`) · `conversation_id` 중심 | `chat_threads` 루트 + `ai_chat_sessions`·`support_tickets`·`chat_messages`(단일 원장)·`chat_read_states`·`chat_notification_batches`·익명 세션/연락처 (3-A) |
| `source_chunk_ids uuid[]` | `chat_message_sources`(실제 FK + 당시 순서·유사도·원문 스냅샷) |
| 6개 메시지 유형만·`quick_replies` 없음 | `message_type + payload jsonb` 카드 스냅샷 + `quick_replies` + `system`/`chat_events` |
| `cancellation_requested_at` 단일 취소 필드 · `late_cancellation` 전용 대기열 | `appointments.support_requested_at`+`request_type`(1단계 섹션 4 ①) · `[상담 채팅 연결]` 즉시 상담 연결 · `support_tickets.appointment_id` |
| 전용 `/cancellation-requests` 대기열 (0개 신설) | `/today` 환자 행 · 캘린더 ⚠+기존 패널 · 상담 문의함 |
| `answer_ticket` 한 번으로 발송=종료·봇 복귀 | `send_message`(`in_progress` 유지)와 `close_ticket`(`[상담 종료]`만 `answered`) 분리 |
| 웹 `QuestionnaireCard` 직접 편집·저장·앱/웹 동일 문진 | 웹은 문진 UI 없음(앱 경로 안내), 앱 `CCARD-QNR`는 상태·진행률·전용 화면 진입 (R2-5) |
| 전화번호 기반 익명 다른 기기 이어보기 | 같은 브라우저 토큰 복원만, 전화번호는 선택 SMS 수신용 (MR2-01·SD-05) |
| `is_business_hours()`·`settings.business_hour_start/end` | 서버 단일 `is_open(at)` (직원 웹 `SCHED-HOURS/EXC` 읽기, MR2-05) |
| 품질 화면에서 즉시 KB 적용 | `quality_review → bad inbox → 반영/반려 → KB 승인·재임베딩` (SD-08) |
| 목업 116 독립 대시보드 · 목업 109 독립 상담 화면 · 목업 118 운영시간 편집 | 117 대시보드 흡수 · 캘린더 64/65 `SUPPORT-CAL-*` 흡수 · 직원 웹 운영시간 read-only (MR2-06·09·10) |
