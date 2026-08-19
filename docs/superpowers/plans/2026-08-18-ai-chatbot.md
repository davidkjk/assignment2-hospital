# 4단계: AI 상담봇(앱·웹·직원·관리자) 구현 플랜 — **재작성본**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 각 태스크는 TDD(실패 테스트 → 구현 → 통과)로 진행한다.
>
> ⚠️ **이 파일은 `plans/2026-07-27-ai-chatbot.md`(7,000줄 이상)를 대체한다.** 옛 파일은 삭제하지 않고 **재작성의 입력**으로 남긴다(태스크 구조·`R*` 정합성 표시의 원본). 충돌하면 **이 파일이 정본**이다.
>
> 📌 **작성 상태**: 이 파일은 현재 **스켈레톤**(헤더 + Global Constraints + File Structure)이다. 태스크 본문(`test('[규칙ID] …')` 문장)은 아직 비어 있고, 세션마다 한 태스크씩 채운다.

**Goal:** AI 상담봇을 **환자 채널(앱·웹)과 직원·관리자 운영** 두 축으로 구현하고, 그에 필요한 백엔드(3-A 통합 대화 스키마·서비스·오케스트레이션·마이그레이션)를 1단계 FastAPI 위에 추가한다. **화면 규칙 505개를 태스크의 실패 테스트 문장으로 옮기는 것**이 이 재작성의 목적이다(전체 518 중 `SUPPORT-CAL-*` 13개는 직원웹 Task 14 소유 → whitelist).

**Architecture:** 백엔드는 1단계의 `acquire_as`/`AppError` 패턴을 그대로 재사용해 상담봇 서비스·라우터·오케스트레이션을 추가한다. 대화는 **`chat_threads`(앱·웹의 단일 대화 루트) + `chat_messages`(AI·환자·직원·시스템 이벤트의 단일 시간순 원장)** 위에서 흐르고, AI 세션(`ai_chat_sessions`)과 지원 티켓(`support_tickets`)은 같은 thread 안에서 경계를 가진다. 매 메시지는 **응급 표현 검사 → 인계 감시 → 라우터**(RAG 안내형·진료과 추천형·행동형 에이전트)의 3갈래 체인으로 처리한다. 프론트는 **① 앱**(`patient_app/` Flutter — 3단계 스캐폴딩·위젯 재사용, 하단 5번째 탭 `AI 상담`) **② 웹 위젯**(신규 프로젝트 — 익명·등록 환자 채널) **③ 직원·관리자**(`frontend/` — 2단계 직원웹 스캐폴딩 재사용, 티켓함·상세·KB·품질·통계)의 세 채널이다. ⚠️ 2단계 직원웹 플랜의 실제 프론트 디렉토리는 `frontend/`다(`staff_web/` 아님) — 직원·관리자 화면 태스크(16~22)는 `frontend/src/features/…`에 쓴다.

**Tech Stack:** 백엔드는 1단계와 동일(FastAPI, asyncpg, Supabase Postgres) + LLM/RAG(임베딩·벡터 검색·오케스트레이션). 앱은 Flutter(Dart)+Riverpod+`supabase_flutter`+Realtime. 웹 위젯은 신규 프론트(Task 0에서 스택 확정). 직원·관리자는 2단계 스택. 테스트는 각 채널의 기존 하네스(`pytest`, `flutter_test`+`mocktail`, 직원웹 테스트 러너).

**Spec:** `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md`(재작성 순서 2에서 옛 스키마·상태 전이 교체) · 정책 정본은 `docs/design/chatbot-source-of-truth.md`(충돌 시 최우선) · 카드 계약은 `docs/design/chatbot-card-catalog.md`.

**규칙·결정 원본:**
- 화면 규칙 = `docs/design/screen-behaviors.md` **상담봇 영역**(환자 채널 `:4777~5266` · 직원·관리자 `:5292~5682`, 규칙 518개)
- 결정 근거 = `docs/superpowers/specs/2026-07-31-ui-design-decisions.md`(A1~E4·R2·MR2·3-A `:4188~4294,4298~4705,4995~5089`)
- 요구사항 = `docs/고객요구사항.txt` — 상담봇 `:337~410,414~453,475~480,492~514` · 관리자 지식·상담 `:188~224`
- ⭐ **진입점 = `docs/design/spec-index/SPECINDEX-ai-chatbot.md`**(Part A 환자 채널 · Part B 직원·관리자) — 어느 규칙·결정을 어디에 넣을지의 지도. **단, 색인의 「조치」 칸은 목차이지 내용이 아니다. 태스크를 쓰기 전에 색인이 가리키는 원문 줄을 반드시 펼친다.**

---

## Global Constraints

이 절의 규칙은 **모든 태스크에 암묵적으로 포함**된다.

### ⚠️ 옛 스펙·플랜에서 **삭제·교체된** 제약 (재작성의 핵심)

색인 Part A 「폐기 결정」·Part B 「5. 폐기·대체 결정」과 정본 `chatbot-source-of-truth.md` §1이 원본이다.

| 옛 스펙·플랜(폐기) | 재작성 |
|---|---|
| `chat_conversations` 단일 상태(`bot/handed_over/closed`)·`conversation_id` 중심 스키마 | **`chat_threads`(단일 대화 루트) + `ai_chat_sessions` + `support_tickets` + `chat_messages`(단일 시간순 원장)** 통합. 메시지는 `thread_id` + 정확히 하나의 AI 세션 또는 티켓 |
| `cancellation_requested_at` 단일 취소 필드 + `late_cancellation` 전용 대기열 | `support_requested_at` + `request_type`(`취소`/`변경`) 공통 구조. 희망 일시는 저장하지 않음 |
| 전용 `/cancellation-requests` 대기열 화면 | **폐지**(새 화면 0개). `/today` 환자 행 → 예약 캘린더 ⚠ → 기존 사이드패널 → 상담 문의함으로 역할 분담. 티켓 생성 자체는 유지 |
| `answer_ticket` 한 번으로 **발송=종료**(`answered`) | `send_message`(정상 발송 = `in_progress` 유지)와 `close_ticket`(별도 `[상담 종료]`만 `answered`) **분리**. 종료 티켓 재오픈 금지, 재문의는 새 티켓 + `previous_ticket_id` |
| 평일 고정 `is_business_hours()` + `settings.business_hour_start/end` | 요일·특정일 예외·점심을 반영한 서버 단일 `is_open(at)`. 상담봇은 직원웹 `SCHED-HOURS-*`·`SCHED-EXC-*`를 **읽기만** |
| 전화번호로 익명 웹 **다른 기기** 이어보기·연락처를 환자 계정처럼 사용 | **같은 브라우저 토큰(해시)만** 복원. 전화번호는 직원 답변 SMS 수신용 선택 입력. `owner_type=patient`/`anonymous_web` 명시, 전화번호가 같아도 `patient_id`로 자동 연결 금지 |
| 웹 `QuestionnaireCard`가 문항·답변을 직접 편집·저장 | 웹은 문진 UI를 만들지 않고 **환자 앱 전용 문진 경로만 안내**(R2-5). 앱 `CCARD-QNR`은 상태·서버 진행률·전용 화면 진입만 재현 |
| 메시지 유형 6종만(대화 유도 버튼 없음) | `quick_replies` 타입 추가. 예약·취소·문진 카드의 판단은 삭제하지 않고 공용 규칙으로 재연결 |
| KB에 `진료시간` 분류 + `진료과·의사소개` KB 별도 작성 | KB `진료시간` 분류 제거(`hospital_hours` 단일 판정). 의사 소개는 `staff.specialty`·`bio`·`photo_url` **원본을 읽기**(KB 중복 저장 금지) |
| 마감 후 카드의 `이 예약 취소`가 API 직접 호출 | 마감 후 안내 팝업의 `[상담 채팅 연결]`이 **유일한 결정지점**. 즉시 공통 지원 요청 기록·배지 → 예약 맥락 상담방. 별도 `[네]/[아니요]` 확인 카드 없음 |
| 품질 화면에서 즉시 KB 적용 | `quality_review → bad inbox → 반영/반려 → KB editor 승인/re-embed`. 승인·재임베딩 성공 전 기존 승인본 유지 |
| 목업 116 독립 대시보드 · 109 독립 상담 화면 · 118 운영시간 편집 | 116→117 dashboard 흡수 · 109→캘린더 `SUPPORT-CAL-*` 상태 흡수 · 118 운영시간은 직원웹 read-only. 옛 3그룹/관리자 최상위 사이드바 → `AD-069`·`SHELL-NAV` 4그룹 |

### 유지되는 제약

- **[정합성 검토 추적]** 옛 플랜의 `R*` 표시(`R2-01`·`R5-*`)와 `docs/supabase-postgres-review-2026-07-28.md` 관련 항목은 **해당 기능을 만드는 태스크에 그대로 옮긴다.**
- 백엔드 신규 코드는 1단계의 `backend/app/db/pool.py`(`acquire_as`), `core/errors.py`(`AppError`)를 **재사용한다 — 새로 만들지 않는다.**
- ⛔ **`supabase db reset` 금지** — 로컬 DB는 다른 세션과 공용. 새 마이그레이션은 **`supabase migration up`**으로만 적용.
- 마이그레이션 번호는 **환자앱·직원웹과 같은 대역을 공유**한다 → 실제 다음 번호는 구현 시점에 확인(먼저 적용하는 쪽 우선). 공용 `00010~00016`(④ support·notification 표)은 **재생성 금지**.
- 모든 API·화면 오류 메시지는 **한글**로 노출. Python 예외 원문을 환자·직원 화면에 노출하지 않음.
- 앱·상담방은 Supabase Realtime으로 동기화(직원 라이브 상담·미읽음 커서 포함).

### 신설 제약 (규칙·정본에서 올라온 것)

- ⭐ **화면·카드가 모르는 상태·시간·사유를 만들어 말하지 않는다.** 예상시간은 서버 운영시간 판정에 따르고, 취소가 확정되지 않은 상태를 `취소 요청 접수`/취소 완료처럼 표현하지 않는다(`SCHED-HOURS-03`·`CANCEL-LATE-12~13`).
- ⭐ **환자 노출 문구**: "취소/변경 요청이 접수·등록됐다" 표현 금지 → **"상담(직원 확인)으로 연결됐다"만**. 연결 뒤에도 `아직 예약은 유지`를 명시.
- ⭐ **앱·웹·상담봇이 함께 쓰는 판단은 서버 한 곳의 값을 소비**한다 — 운영시간·휴무(`is_open`), 문진 진행률(서버 계산), 예약 충돌(동일 예약 API). 채널이 달라도 앱과 다른 결과를 보이지 않는다(카드는 `BOOK-*`·`CANCEL-*`·`QNR-*` 판단을 **재현**하고 자체 계산하지 않음).
- ⭐ **예약 중 상담 모드**는 같은 엔진의 제한 모드다 — **정보성 안내·진료과 추천만** 허용. 예약제안·취소·문진 등 **모든 행동형 도구 금지**, 유일한 행동 출구는 `○○과로 계속하기`. **긴급(119/응급실) 안전 안내는 모드와 무관하게 항상 작동**(`BOOK-BOT-07~08`).
- ⭐ **제한 자료**는 병원 원문을 **글자 그대로, 봇 생성문 밖의 별도 블록**으로 표시(봇이 살을 붙이지 않음). 일반 자료가 함께 걸리면 일반 주제는 평소대로 답하고, 질문 전체가 제한 주제면 제한 문구 + `[직원 연결]`만(A3·`KBADM-EDITOR-04`).
- **빠른 답변 버튼**은 별도 제어 신호가 아니라 그 문장 그대로 **환자가 보낸 말풍선**이 된다. 자유 입력창은 항상 열어 둔다.
- **AI 세션만 마지막 활동 후 30분 무활동 만료**(직원 티켓에는 적용하지 않음). `[이전 내용 이어서 질문]`=요약 가진 새 AI 세션, `[새 질문 시작]`=문맥 없는 새 세션.
- **개인정보 열거 방지**: 익명 웹은 계정 유무를 화면으로 구분시키지 않는다.
- **미확인 직원 답변 배칭**: 사용자가 상담방을 보지 않을 때 연속 답변을 한 배치로 묶어 한 번만 알린다. 담당 배정·상태 변경만으로는 알리지 않음.
- **원자 배정**: 티켓 상세 열기가 pending 티켓을 자동 배정한다. 경쟁 패자는 상세를 못 보고 목록에 남으며 `이미 다른 직원이 맡았어요`를 본다. 별도 담당지정 버튼 없음, 배정 후 재배정만 허용.

### 🚧 [작성용 발판 — 다 쓰면 삭제] 앞 단계에서 이월된 인지사항

> ## ⚠️ 이 절은 **구현 지시가 아니다. 플랜을 쓰는 사람에게 주는 작업 목록**이다.
>
> **구현자는 이 절을 읽을 필요가 없다.** 각 행이 지정된 태스크의 `test()` 문장으로 **풀려 들어가면 그 행을 지운다.** 표가 비면 이 절 전체를 삭제한다.
>
> **진행 표시**: 반영 완료 `~~취소선~~` → 절 전체 삭제. 현재 **0/N 반영**(스켈레톤 단계).

**HANDOVERS 원장에서 이 플랜이 받는 이월분** (`docs/design/spec-index/HANDOVERS.md` — 본문에 담으면 `plan-prefix-check` 경고가 사라진다):

| 이월된 것 | 넘긴 곳 | 받는 태스크 |
|---|---|---|
| **`SUPPORT-CAL-DUP-01`** — 한 예약에 상담 기록이 여러 개일 때 ⚠ 하나가 무엇을 대표하나(티켓 상태·담당 모델에 달림) | 직원웹 T14 | **Task 2**(티켓 모델 결정) · **Task 18**(⚠ 대표 화면) |
| **`TICKET-DETAIL-NOTIFY-01`** — 6번째 토글 `support_reply`가 켜는 `support_answered` 알림을 챗봇이 그 이름으로 발송 | 환자앱 T28 | **Task 2/17**(close_ticket → notify) |
| **`PTDET-SUPPORT-03`** — 상담 문의 최신순 + ID 동점키 서버 정렬 | 환자앱(정본) | **Task 2**(티켓 조회 정렬) · **Task 19**(환자상세 섹션) |

**⑤(상담봇) 미작성이라 아직 열려 있던 결정** (색인 「확인 필요」·source-of-truth §4):

| 확인 필요 | 남은 것 | 닫는 태스크 |
|---|---|---|
| 상담봇 전용 **카드 레이아웃** | `BOOK-BOT-*` 외 카드 전용 레이아웃 규칙 0개 — 목업 시작 안 함 | 화면 태스크 12·13·14·15가 카드 규칙으로 확정 |
| **제한 자료 검색 숫자 튜닝** | 원칙은 A3 확정, 검색 점수·임계값만 미결 | Task 7(KB·RAG) |
| **MR2-08 메시지·토큰 한도**, 요약 대 절단 | `CHAT-LEN-01` UX 넛지는 확정, 실제 한도·요약/절단 미결 | Task 5(오케스트레이션) |
| **품질 검토 저장 모델** — `answer_feedback` 확장 vs 상담 단위 review table | SD-08 확정, 테이블/enum 미확정 | Task 8 |
| **보존·파기(retention_class)** — 법정 강제값·병원 방침값 | 방침 FINAL, 실제 값은 법무 게이트 | Task 4(구조만·값은 법무 게이트 표시) |

---

## File Structure

**번호 정책**: 옛 플랜을 그대로 잇지 않는다. 재작성은 **백엔드 계약(0~9) → 환자 채널 화면(10~15) → 직원 화면(16~19) → 관리자 화면(20~22)** 순. 규칙을 담는 것은 **화면 태스크**이고, 백엔드 태스크는 그 화면이 소비할 스키마·서비스·오케스트레이션을 만든다(규칙 0개, 계약만).

### 백엔드·기반 (규칙 없음 — 계약·마이그레이션·서비스·오케스트레이션)

| 태스크 | 무엇 | 규칙 접두어 | 상태 |
|---|---|---|---|
| **0** | 스캐폴딩 — **웹 위젯 신규 프론트 프로젝트**(스택 확정) + 챗봇 백엔드 모듈 디렉토리 + LLM/RAG·테스트 하네스. 앱은 `patient_app/`(3단계)·직원은 `frontend/`(2단계) 스캐폴딩 재사용. 웹 위젯 = 신규 `webchat/`(Vite React) | — | 🆕 신설 |
| **1** | 마이그레이션 — **통합 대화 스키마**: `chat_threads`(채널·현재 갈래·활동시각·`owner_type`) · `chat_messages`(`message_type`+`payload jsonb`·`client_message_id` 멱등·system/`chat_events`) · `chat_read_states` + RLS | — | 재작성 (공백 1·2·6) |
| **2** | **AI 세션 + 티켓 생명주기 + 원자 배정** — `ai_chat_sessions`(30분 만료) · `support_tickets`(`pending→in_progress→answered`·`previous_ticket_id`·`appointment_id` FK·`support_requested_at`/`request_type`) · `claim_ticket` 원자 승패 · `send_message`/`close_ticket` 분리 · 최신순+ID 동점 정렬 + RLS | — | 재작성 [R2-01] (SD-02·03·04) |
| **3** | **익명 소유권 + 수신자 추상화 + 알림 배칭** — `anonymous_chat_sessions`/`contacts`(토큰 해시) · `NotificationRecipient`(등록환자/익명) · 공통 `notification_log`·재시도 · `chat_notification_batches`(미확인 연속 답변 1배치) | — | 재작성 (SD-05·07) |
| **4** | **근거 스냅샷 + 보존/파기** — `chat_message_sources`(FK·당시 순서·유사도·원문 스냅샷) · `retention_class`(6 보존 클래스, 법정/방침/파기 배치 분리 — 값은 법무 게이트) | — | 재작성 (공백 5·7, SD-06·09) |
| **5** | **오케스트레이션 3갈래 체인** — 매 메시지 `응급 표현 검사 → 인계 감시(6조건) → 라우터`(RAG 안내형·진료과 추천형 문진·행동형 에이전트) · AI 30분 만료·이어가기 요약 · `CHAT-LEN` 한도/절단 | — | 재작성 |
| **6** | **카드·도구 계약** — 예약제안/취소/문진 `카드보내기` 서버 계약(앱 규칙 재현) · **방문이유 한 번 묻기**(#8) · **`quick_replies` 생성 규칙**(시작 고정/대화중 AI 3~4개, #20) · **예약 중 상담 제한모드 엔진**(#10/E4 — 앱 T20 `DeptBotSheet` 주입) | — | 재작성 |
| **7** | **KB 승인·재임베딩·제한문구** — draft 비공개 · 승인 전 기존본 유지 · re-chunk/re-embed 트랜잭션 · 제한 원문 별도 블록 격리 · 이력·이전 버전 재편집·재승인(G-06·A2·A3) · 의사 소개 원본 읽기(#7) | — | 재작성 |
| **8** | **품질 검토 + bad inbox + 미해결 클러스터** — 상담 단위 검토 상태(미검토 우선 정렬) · `quality_review → bad inbox → 반영/반려 → KB 승인` · 오답 신고 저장 · 자동 클러스터(혼합 안내)(SD-08·B2·B3) | — | 재작성 |
| **9** | **상담봇 라우터 연결 + 통합 테스트** — 환자/익명/직원/관리자 엔드포인트 · 3-A 원자성 수용 조건 12개를 테스트 목록으로 | — | 재작성 |

### 환자 채널 화면 (앱 + 웹)

| 태스크 | 무엇 | 규칙 접두어 | 상태 |
|---|---|---|---|
| **10** | 앱 상담방 셸 — 탭·피드·전송·이름·빈/오류·안전·가이드·이력·길이넛지 (30개) | `CHAT-TAB-*`·`CHAT-ROOM-*`(기본·SEND)·`CHAT-GUIDE-*`·`CHAT-HISTORY-*`·`CHAT-LEN-*` | 재작성 |
| **11** | 앱 직원 라이브·인계·종료·재문의·긴급·장애 (32개) | `CHAT-ROOM-LIVE-*`·`CHAT-ROOM-END-*`·`CHAT-ROOM-RETICKET-*`·`CHAT-ROOM-AI-*`·`CHAT-HANDOFF-*`·`CHAT-URGENT-*`·`CHAT-OUTAGE-*` | 재작성 |
| **12** | 앱 예약·문진 카드 + 예약 중 상담 시트 (48개) | `CCARD-TIME-*`·`CCARD-QUICK-*`·`CCARD-BOOKCONF-*`·`CCARD-BOOKDONE-*`·`CCARD-QNR-*`·`BOOKBOT-SHEET-*`·`NAV-CHATAPP-*` | 재작성 [R5-01] |
| **13** | 앱 취소 카드 + 마감 후 상담 연결 흐름 (39개) | `CCARD-CANCELCONF-*`·`CCARD-CANCELDONE-*`·`CCARD-CANCELREJ-*`·`LATEFLOW-POP-*`·`LATEFLOW-CHAT-*`·`LATEFLOW-APPT-*` | 재작성 |
| **14** | 웹 위젯 상담방 — 런처·방·가이드·긴급·장애·인계 (42개) | `WEBCHAT-LAUNCH-*`·`WEBCHAT-ROOM-*`·`WEBCHAT-GUIDE-*`·`WEBCHAT-URGENT-*`·`WEBCHAT-OUTAGE-*`·`WEBCHAT-HANDOFF-*`·`NAV-WEBCHAT-*` | 재작성 |
| **15** | 웹 카드 + 인증 후 재확인 + 익명 연락처 (45개) | `WEBCARD-*`·`WEBMOD-AUTH-*`·`WEBANON-HANDOFF-*` | 재작성 |

### 직원 화면 (티켓·상담 운영)

| 태스크 | 무엇 | 규칙 접두어 | 상태 |
|---|---|---|---|
| **16** | 티켓함 — 분할 작업공간·자동배정 선택·접수순·경쟁 패자 (17개) | `TICKET-INBOX-*` | 재작성 |
| **17** | 티켓 상세 — 배정·인계 요약·전체 대화·답변/보내기·별도 종료·라이브·알림 (46개) | `TICKET-DETAIL-*` | 재작성 |
| **18** | `/today` 상담 행·사이드패널·대표 ⚠ (34개 + whitelist 13) | `SUPPORT-TODAY-*`·`SUPPORT-PANEL-*`·`SUPPORT-CAL-DUP-*` | 재작성 |
| **19** | 환자상세 상담 섹션 + 상담 로그 + 지원 내비 (40개) | `PTSUP-SECT-*`·`CHATLOG-LIST-*`·`NAV-STFSUP-*` | 재작성 |

### 관리자 화면 (지식·품질·통계)

| 태스크 | 무엇 | 규칙 접두어 | 상태 |
|---|---|---|---|
| **20** | KB 목록·편집·이력·제한문구 (35개) | `KBADM-LIST-*`·`KBADM-EDITOR-*`·`KBADM-HISTORY-*` | 재작성 |
| **21** | 미해결 클러스터·오답 신고·품질 리포트·예시·bad inbox (59개) | `UNRES-CLUSTER-*`·`QAEX-LIST-*`·`QUALITY-REPORT-*`·`BADINBOX-REVIEW-*`·`BADRPT-FORM-*` | 재작성 |
| **22** | 질문 순위·챗봇 통계·관리자 내비 (38개) | `QTOP-RANK-*`·`BOTSTAT-DASH-*`·`NAV-ADM-*` | 재작성 |

**의존 순서**: `Task 0`(스캐폴딩) → `1`(통합 대화 스키마) → `2~4`(티켓·익명·근거 마이그레이션·서비스) → `5~8`(오케스트레이션·카드·KB·품질) → `9`(라우터·통합) → `10~15`(환자 채널) → `16~19`(직원) → `20~22`(관리자). ⚠️ 화면 태스크는 자기가 소비하는 백엔드 계약(Consumes)이 먼저 있어야 한다. 앱 T12는 3단계 T20 `DeptBotSheet`(예약 중 상담 시트 계약)를 물려받는다.

**분할 근거**: 색인 「70초과 계열 0」 — 어느 규칙 계열도 70을 넘지 않아 강제 분할이 없다. CHAT 62·CCARD 44는 화면 흐름(셸↔라이브 / 예약↔취소)으로 2분할, 나머지는 화면 단위로 묶었다. 가장 큰 태스크는 T21(59) < 70.

**whitelist(플랜이 담지 않는 규칙)**: `SUPPORT-CAL-*` 13개(`WARN`·`LIVE`·`LOAD`·`ERR`·`EXC`·`NOQUEUE`)는 **직원웹 Task 14가 소유**(MR2-10: 목업 109를 별도 화면 없이 캘린더 64/65 상태로 흡수). 이 플랜은 `SUPPORT-CAL-DUP-01`(대표 ⚠ 선정, 티켓 모델 의존)만 갖는다. → coverage 검사기 `RULE_WHITELIST`에 근거와 함께 등록.

**범위 밖**: 공용 데이터 모델 `00010~00016`(④ support·notification 표, 재생성 금지) · 환자앱 예약/문진/알림 서비스(3단계 — 카드가 소비만) · 직원웹 캘린더 `SUPPORT-CAL-*` 화면(2단계 T14) · 운영시간 원본·문자 설정(2단계) · 배포(`mark_overdue_no_shows` 등).

---

<!-- 태스크 본문은 여기부터. 세션마다 한 태스크씩 `test('[규칙ID] …')` 문장으로 채운다.
     지킬 조건: ①테스트 한 줄에 규칙 ID 하나 + 값 assert ②Consumes/Produces는 이름으로
     ③규칙에 DB 칸이 나오면 서버 층 짝 확인. 다 쓰면 plan-coverage-check + plan-prefix-check 경고 0 확인 후 커밋.
     ⚠️ 태스크 헤딩은 `## Task N:`(더블 해시) — prefix-check의 `task_spans`가 이 형식만 본다.
     ⛔ **다음 태스크 몫을 완전 ID로 예고하지 말 것** — coverage가 「반영됨」으로 세어 그 태스크를 쓸 때
        missing에서 사라진다. 예고는 **계열명**(`CCARD-QNR 계열`)이나 범위(`ID~NN`)로. -->

## Task 0: 스캐폴딩 — 웹 위젯(`webchat/`) + 챗봇 백엔드 설정·모듈 + LLM/RAG 테스트 하네스

> **화면 규칙 0개.** 이 태스크는 뒤 태스크(1~22)가 설 자리(웹 위젯 프로젝트·백엔드 챗봇 모듈 디렉토리·LLM/RAG 클라이언트·모킹 하네스)를 만든다. 그래서 테스트는 `test('[규칙ID] …')`가 아니라 **하네스 정합성 검증**(모킹 임베더가 1536차원을 돌려주나·모델 팩토리가 네트워크 없이 설정을 읽나·웹 위젯이 렌더되나)이다. 앱(`patient_app/`, 3단계 Task 0)과 직원웹(`frontend/`, 2단계 Task 4) 스캐폴딩은 **재사용**한다 — 이 태스크가 새로 만들지 않는다.

**Files:**
- Create: `webchat/package.json` · `webchat/vite.config.ts` · `webchat/tsconfig.json` · `webchat/tsconfig.node.json` · `webchat/index.html`
- Create: `webchat/src/main.tsx` · `webchat/src/App.tsx` · `webchat/src/lib/supabaseClient.ts` · `webchat/src/lib/env.ts`
- Create: `webchat/.env.example`
- Create: `webchat/vitest.config.ts` · `webchat/src/test/setup.ts`
- Test: `webchat/src/App.test.tsx`
- Create: `backend/app/integrations/__init__.py` · `backend/app/integrations/embedding_client.py` · `backend/app/integrations/langchain_client.py`
- Create: `backend/app/services/chat/__init__.py` (챗봇 서비스 패키지 표식 — Task 5~8이 채운다)
- Modify: `backend/app/core/config.py` (챗봇 설정 추가)
- Modify: `backend/requirements.txt` (`langchain`·`langchain-anthropic` 추가)
- Modify: `backend/.env.example` (`ANTHROPIC_API_KEY`·`OPENAI_API_KEY`)
- Create: `backend/tests/conftest_chat.py` (모킹 임베더 fixture — Task 6~8 재사용)
- Test: `backend/tests/test_embedding_client.py` · `backend/tests/test_langchain_client.py`

**Interfaces:**
- Consumes: `app.core.config.settings`(1단계) · `app.core.errors.AppError`·`log_error`(1단계) · `@supabase/supabase-js`(직원웹과 같은 라이브러리)
- Produces (백엔드):
  - `app.integrations.embedding_client.EmbeddingClient(api_key: str)` — `.embed(texts: list[str]) -> list[list[float]]`(async, 1536차원, 순서 보존) · `get_embedding_client() -> EmbeddingClient`
  - `app.integrations.langchain_client.get_chat_model(model: str | None = None) -> ChatAnthropic`
  - `settings.anthropic_api_key`·`settings.openai_api_key`·`settings.chat_model`(기본 `"claude-sonnet-5"`)·`settings.embedding_model`(기본 `"text-embedding-3-small"`)·`settings.anon_rate_limit_per_hour`(기본 30)
  - `tests/conftest_chat.py::fake_embedder` — `.embed`가 입력 개수만큼 `[0.1]*1536` 벡터를 돌려주는 async 모킹(Task 6 RAG 검색·Task 7 재임베딩 테스트가 주입)
- Produces (웹 위젯): `webchat/` — Vite+React+TS SPA 프로젝트. `npm --prefix webchat run build`가 성공하고 `App`이 렌더된다. 실제 상담방·런처는 Task 14·15가 `webchat/src/`에 채운다.
- ⚠️ **금지 설정**: 옛 스펙의 `business_hour_start/end` 환경변수는 **추가하지 않는다** — 운영시간 판정은 서버 단일 `is_open(at)`(Task 5·`hospital_hours` 소비)이 담당한다(정본 §1-9, `SCHED-HOURS-03`). 여기에 9~18시 환경변수를 두면 두 판정이 갈라진다.

### A. 웹 위젯(`webchat/`) Vite React 스캐폴딩

> 스택 근거: 결정 문서 `:4374`·`:5221`(구현은 Flutter 앱·**React 웹**) + 옛 플랜 `:64`(병원 홈페이지용 웹 상담창 = 별도 Vite 앱). 직원웹과 같은 `@supabase/supabase-js`·Vitest 하네스를 쓴다(직원웹 플랜 Task 0 `:11`).

- [ ] **Step A1: 프로젝트 매니페스트·설정 작성**

`webchat/package.json`:
```json
{
  "name": "hospital-webchat",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "jsdom": "^25.0.1",
    "msw": "^2.4.9",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

`webchat/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 병원 홈페이지에 임베드되는 위젯. base는 배포 시점에 확정(Task 14).
  build: { outDir: 'dist' },
});
```

`webchat/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`webchat/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`webchat/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`webchat/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI 상담봇</title>
  </head>
  <body>
    <div id="webchat-root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`webchat/.env.example`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step A2: 앱 엔트리·Supabase 클라이언트 작성**

`webchat/src/lib/env.ts`:
```ts
// 위젯 런타임 설정. 값이 없으면 빈 문자열이 아니라 화면(Task 14)이 장애 안내를 띄운다.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
};
```

`webchat/src/lib/supabaseClient.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// 익명 웹 채널. 로그인 세션이 아니라 브라우저 익명 토큰(Task 3·15)으로 소유권을 잇는다.
// persistSession=false: 익명 위젯은 Supabase Auth 세션을 저장하지 않는다(MR2-01).
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
```

`webchat/src/App.tsx`:
```tsx
// 위젯 셸의 자리표시자. 런처·상담방·카드는 Task 14·15가 이 파일을 확장한다.
export default function App() {
  return (
    <div id="webchat-app" role="region" aria-label="AI 상담봇">
      <p>AI 상담봇</p>
    </div>
  );
}
```

`webchat/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('webchat-root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
```

`webchat/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom';
```

- [ ] **Step A3: 실패하는 렌더 테스트 작성**

`webchat/src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('위젯 셸이 AI 상담봇 이름표를 붙여 렌더된다', () => {
  render(<App />);
  // 환자 노출 이름은 항상 `AI 상담봇`(정본 §0). `챗봇` 글자를 쓰지 않는다.
  expect(screen.getByRole('region', { name: 'AI 상담봇' })).toBeInTheDocument();
  expect(screen.queryByText(/챗봇/)).not.toBeInTheDocument();
});
```

- [ ] **Step A4: 의존성 설치 → 테스트 실패 확인**

Run: `npm --prefix webchat install && npm --prefix webchat run test`
Expected: FAIL — `App` 모듈은 있으나 최초엔 `import` 경로/타입 오류로 실패(또는 `region` 이름표 누락). 초록불이 나올 때까지 위 파일을 맞춘다.

- [ ] **Step A5: 테스트 통과 + 빌드 확인**

Run: `npm --prefix webchat run test && npm --prefix webchat run build`
Expected: PASS + `webchat/dist/` 생성. 빌드가 성공해야 뒤 태스크(14·15)의 위젯이 배포될 자리가 생긴다.

### B. 챗봇 백엔드 설정·모듈 디렉토리

- [ ] **Step B1: 설정·의존성·환경 예시 추가**

`backend/app/core/config.py`의 `Settings` 클래스에 필드 추가(⚠️ `business_hour_*`는 넣지 않는다):
```python
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    chat_model: str = "claude-sonnet-5"
    embedding_model: str = "text-embedding-3-small"
    anon_rate_limit_per_hour: int = 30
```

`backend/requirements.txt`에 추가:
```
langchain==0.3.7
langchain-anthropic==0.3.0
```
Run: `cd backend && pip install -r requirements.txt`

`backend/.env.example`에 추가:
```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

- [ ] **Step B2: 모듈 디렉토리 표식 생성**

`backend/app/integrations/__init__.py` — 빈 파일(패키지 표식).
`backend/app/services/chat/__init__.py` — 빈 파일. 오케스트레이션·카드·KB·품질 서비스(Task 5~8)가 이 패키지에 들어온다.

Run: `cd backend && python -c "import app.integrations, app.services.chat"`
Expected: 오류 없이 종료(패키지 임포트 가능).

### C. LLM/RAG 테스트 하네스 (임베딩 클라이언트 + 모델 팩토리 + 모킹 fixture)

> 근거: 옛 플랜 Task 4(임베딩)·Task 7(모델 팩토리). 두 클라이언트는 **네트워크를 태우지 않고 모킹**할 수 있어야 뒤 태스크가 테스트를 쓴다. `embed`는 OpenAI 응답의 `index`로 **순서를 복원**한다(SDB 지적 — 배치 응답이 뒤섞여 오면 질문↔벡터 짝이 어긋난다).

- [ ] **Step C1: 실패하는 테스트 작성 — 임베딩 클라이언트**

`backend/tests/test_embedding_client.py`:
```python
import httpx
import pytest

from app.integrations.embedding_client import EmbeddingClient


@pytest.mark.asyncio
async def test_embed_returns_1536_dim_vectors_in_order(monkeypatch):
    async def fake_post(self, url, **kwargs):
        assert url.endswith("/embeddings")
        texts = kwargs["json"]["input"]
        # 응답 index를 일부러 뒤섞어 순서 복원을 검증한다.
        data = [{"index": i, "embedding": [float(i)] * 1536} for i in range(len(texts))]
        return httpx.Response(200, json={"data": list(reversed(data))},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    client = EmbeddingClient(api_key="test-key")
    vectors = await client.embed(["주차 되나요?", "진료시간 알려주세요"])
    assert len(vectors) == 2
    assert len(vectors[0]) == 1536
    assert vectors[0][0] == 0.0 and vectors[1][0] == 1.0  # index 순서 복원됨


@pytest.mark.asyncio
async def test_embed_raises_korean_apperror_on_failure(monkeypatch):
    async def fake_post(self, url, **kwargs):
        return httpx.Response(500, json={"error": "boom"},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    from app.core.errors import AppError
    client = EmbeddingClient(api_key="test-key")
    with pytest.raises(AppError) as exc:
        await client.embed(["질문"])
    assert "다시 시도" in exc.value.message  # 파이썬 예외 원문 노출 금지, 한글 안내
```

- [ ] **Step C2: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_embedding_client.py -v`
Expected: FAIL — `app.integrations.embedding_client` 모듈 없음.

- [ ] **Step C3: 임베딩 클라이언트 구현**

`backend/app/integrations/embedding_client.py`:
```python
import httpx

from app.core.config import settings
from app.core.errors import AppError, log_error

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"


class EmbeddingClient:
    def __init__(self, api_key: str):
        self._api_key = api_key

    async def embed(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=30) as http:
            resp = await http.post(
                OPENAI_EMBEDDINGS_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"model": settings.embedding_model, "input": texts},
            )
        if resp.status_code != 200:
            # log_error는 async — await 없이 부르면 코루틴만 만들고 로그가 조용히 유실된다.
            await log_error("embedding", f"OpenAI 임베딩 실패: {resp.status_code} {resp.text[:200]}")
            raise AppError("자료 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.", 502)
        data = sorted(resp.json()["data"], key=lambda d: d["index"])
        return [d["embedding"] for d in data]


def get_embedding_client() -> EmbeddingClient:
    return EmbeddingClient(api_key=settings.openai_api_key)
```

- [ ] **Step C4: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_embedding_client.py -v`
Expected: PASS(2 passed).

- [ ] **Step C5: 실패하는 테스트 작성 — 모델 팩토리**

`backend/tests/test_langchain_client.py`:
```python
def test_get_chat_model_uses_settings(monkeypatch):
    from app.core.config import settings
    from app.integrations.langchain_client import get_chat_model

    monkeypatch.setattr(settings, "chat_model", "claude-sonnet-5")
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    model = get_chat_model()
    assert model.model == "claude-sonnet-5"  # 기본 대화 모델은 Sonnet 5


def test_get_chat_model_accepts_override():
    from app.integrations.langchain_client import get_chat_model

    model = get_chat_model(model="claude-opus-5")
    assert model.model == "claude-opus-5"
```

- [ ] **Step C6: 테스트 실패 확인**

Run: `cd backend && pytest tests/test_langchain_client.py -v`
Expected: FAIL — `app.integrations.langchain_client` 모듈 없음.

- [ ] **Step C7: 모델 팩토리 구현**

`backend/app/integrations/langchain_client.py`:
```python
from langchain_anthropic import ChatAnthropic

from app.core.config import settings


def get_chat_model(model: str | None = None) -> ChatAnthropic:
    return ChatAnthropic(
        model=model or settings.chat_model,
        api_key=settings.anthropic_api_key,
        max_tokens=2048,
    )
```

- [ ] **Step C8: 테스트 통과 확인**

Run: `cd backend && pytest tests/test_langchain_client.py -v`
Expected: PASS(2 passed).

- [ ] **Step C9: 모킹 임베더 fixture 작성 (뒤 태스크 재사용)**

`backend/tests/conftest_chat.py`:
```python
import pytest


class FakeEmbedder:
    """네트워크 없이 결정적 벡터를 돌려주는 임베더. Task 6·7 테스트가 EmbeddingClient 대신 주입한다."""

    def __init__(self, dim: int = 1536):
        self._dim = dim
        self.calls: list[list[str]] = []

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        # 텍스트 길이로 첫 성분만 달리해 서로 구분 가능한 벡터를 만든다(유사도 테스트용).
        return [[float(len(t) % 7)] + [0.1] * (self._dim - 1) for t in texts]


@pytest.fixture
def fake_embedder() -> FakeEmbedder:
    return FakeEmbedder()
```

`backend/tests/conftest.py`가 있으면 `pytest_plugins`에 추가하고, 없으면 각 테스트가 `from tests.conftest_chat import FakeEmbedder`로 직접 임포트한다(1단계 테스트 관례를 따른다).

- [ ] **Step C10: 하네스 자가검증 테스트 → 통과**

`backend/tests/test_embedding_client.py`에 fixture 검증 1건 추가:
```python
@pytest.mark.asyncio
async def test_fake_embedder_returns_1536_dim(fake_embedder):
    vectors = await fake_embedder.embed(["a", "bb"])
    assert len(vectors) == 2 and all(len(v) == 1536 for v in vectors)
    assert fake_embedder.calls == [["a", "bb"]]  # 호출 인자를 기록해 재임베딩 테스트가 검사
```

Run: `cd backend && pytest tests/test_embedding_client.py tests/test_langchain_client.py -v`
Expected: PASS(전체 초록불).

- [ ] **Step B/C 마무리: 커밋**

```bash
git add webchat/ backend/app/integrations/ backend/app/services/chat/__init__.py \
        backend/app/core/config.py backend/requirements.txt backend/.env.example \
        backend/tests/test_embedding_client.py backend/tests/test_langchain_client.py \
        backend/tests/conftest_chat.py docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 0 본문 — 웹위젯(webchat/) Vite React 스캐폴딩 + 챗봇 백엔드 설정·모듈 + LLM/RAG 모킹 하네스(임베딩 1536차원·모델 팩토리 claude-sonnet-5)"
```

> **Task 0 완료 조건**: `webchat` 렌더·빌드 초록불 · 백엔드 임베딩(순서 복원·한글 오류)·모델 팩토리·모킹 fixture 초록불 · `business_hour_*` 미추가 확인. 화면 규칙 0개라 `plan-coverage-check`의 커버 수는 변하지 않고(정상), `plan-prefix-check`는 이 태스크가 소유한 접두어가 없어 빚·미배정 0이어야 한다.

## Task 1: 마이그레이션 — 통합 대화 스키마 (`chat_threads` · `chat_messages` · `chat_read_states` + RLS)

> **화면 규칙 0개.** 이 태스크는 3-A 통합 스키마의 **뿌리 세 표**를 만든다: 환자에게 보이는 「같은 상담방」 루트(`chat_threads`) · AI·환자·직원·시스템 이벤트의 단일 시간순 원장(`chat_messages`, 공백 1·2·6) · 참여자별 확인 위치(`chat_read_states`). AI 세션·티켓은 **Task 2**, 익명 소유권은 **Task 3**, 근거 스냅샷·보존은 **Task 4**가 얹는다. 그래서 테스트는 `test('[규칙ID] …')`가 아니라 **스키마 계약 검증**(제약·트리거·인덱스·RLS)이다.
>
> **근거 원본**: 3-A 스키마 요구 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md` §4.1(threads)·§4.3(messages)·§4.6(read_states)·§6(인덱스)·§7(RLS) — 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4371-4465`에 병합됨. enum 허용값·의미는 §3.
>
> ⭐ **이 태스크의 설계 결정 3건(기각안 포함 — 뒤 태스크가 이 계약을 소비하므로 여기서 못박는다)**:
> 1. **시스템 경계(공백 6)를 `chat_messages`에 담는다** — `message_type='system'` + `sender_type='system'`(3A §3 `chat_sender_type`에 `system` 한 값 추가). *기각: 별도 `chat_events` 표* — 3A §2가 요구하는 「`thread_id, created_at, id` 한 화면 연속 이력」을 두 표 UNION+중복제거로 복원해야 해 재연결 커서(§6)와 어긋난다. 단일 원장이 3-A의 핵심 목표(SD-01).
> 2. **`content`는 nullable** — 3A §4.3 기저는 text-only라 `content NOT NULL`이지만, 공백 2·6으로 `card`·`quick_replies`·`system` 유형을 더하면 본문이 없고 **`payload jsonb`가 알맹이**다. CHECK로 「`text` 유형만 content 필수·비어있지 않음」을 강제한다. *기각: content NOT NULL 유지* — 카드·시스템 메시지에 가짜 요약 문자열을 억지로 넣게 된다.
> 3. **앞선 FK는 대상 표를 만드는 태스크가 건다** — `ai_chat_session_id`·`support_ticket_id`(Task 2), `anonymous_session_id`·`sender_anonymous_session_id`·`reader_anonymous_session_id`(Task 3)는 여기서 **`uuid` 칼럼으로만** 만들고 FK 제약은 없다. 세션/티켓 XOR·발신자 형태 CHECK는 FK 없이도 거므로 여기서 전부 건다. 세션/티켓의 `thread_id` 일치 트리거는 그 표가 생기는 Task 2가 얹는다. *기각: Task 1이 sessions/tickets를 미리 빈 표로 만들기* — 스켈레톤 배정(Task 2 소유)과 어긋나고 한 표를 두 마이그레이션이 나눠 갖는다.

**Files:**
- Create: `supabase/migrations/00036_chat_core_schema.sql` (⚠️ **번호 00036은 예시** — 환자앱·직원웹이 `00017~00035`를 공유하므로 적용 시점에 그 뒤 다음 번호로 확정한다. Global Constraints 「마이그레이션 번호는 같은 대역을 공유」)
- Create: `backend/tests/test_chat_core_schema.py`
- Modify: `backend/tests/conftest_chat.py` (Task 0이 만든 파일 — `seed_chat_thread` 헬퍼 추가, Task 2~4 재사용)

**Interfaces:**
- Consumes: `patients`(`00003`)·`staff`(`00001`) 표 · `private.current_patient_id()`·`patient_owns(uuid)`(환자앱 `00017`, security definer·활성 링크만) · `private.is_active_staff()`·`private.current_staff_id()`(`00001`) · 테스트 픽스처 `db_conn`·`set_session_auth`·`seed_staff`(`backend/tests/conftest.py`)·`seed_patient`(환자앱이 `conftest.py`에 추가) · Task 0 `conftest_chat.py`
- Produces (뒤 태스크가 소비할 이름):
  - 표 `chat_threads(id, owner_type, patient_id, anonymous_session_id, last_activity_at, created_at, updated_at)`
  - 표 `chat_messages(id, thread_id, ai_chat_session_id, support_ticket_id, sender_type, sender_patient_id, sender_anonymous_session_id, sender_staff_id, message_type, content, payload, client_message_id, created_at)`
  - 표 `chat_read_states(id, thread_id, reader_type, reader_patient_id, reader_anonymous_session_id, reader_staff_id, last_read_message_id, last_read_at, active_view_until, updated_at)`
  - CHECK 허용값(3A §3): `chat_threads.owner_type ∈ {patient, anonymous_web}` · `chat_messages.sender_type ∈ {patient, bot, staff, system}` · `chat_messages.message_type ∈ {text, card, quick_replies, system}` · `chat_read_states.reader_type ∈ {patient, anonymous_web, staff}`
  - 트리거 함수 `validate_chat_message_sender_thread()`(발신자↔상담방 소유권 일치) · 트리거 `trg_validate_chat_message_sender_thread`
  - 인덱스 이름: `idx_chat_messages_thread`·`idx_chat_messages_ticket`·`idx_chat_messages_session`·`idx_chat_messages_client_msg`(non-null 전역 unique) · `idx_chat_read_states_patient/anon/staff`(참여자·상담방 partial unique)
  - RLS 정책: `patients_read_own_threads`·`patients_read_own_messages`·`patients_manage_own_read_state`. **직원 읽기 정책과 세션/티켓 `thread_id` 일치 트리거는 Task 2가 추가한다**(티켓 배정에 달림).
  - 헬퍼 `conftest_chat.seed_chat_thread(conn, *, patient_id=None, anonymous_session_id=None) -> uuid`
- ⚠️ **아직 만들지 않는 것**: `payload jsonb`의 **카드 스키마**(어떤 키가 어떤 카드인지)는 Task 6이 카드 계약으로 확정한다. Task 1은 `payload`를 자유 jsonb로 두고 형태 CHECK(유형별 not-null)만 건다.

- [ ] **Step 1: 실패하는 스키마 계약 테스트 작성**

`backend/tests/conftest_chat.py`에 헬퍼 추가(파일 맨 아래):
```python
async def seed_chat_thread(conn, *, patient_id=None, anonymous_session_id=None):
    """chat_threads 한 행을 만들고 id를 돌려준다. owner_type은 넘긴 소유자로 자동 판정.
    익명 세션 FK는 Task 3 전이므로 여기선 아무 uuid나 받는다(제약·트리거 테스트용)."""
    if patient_id is not None:
        return await conn.fetchval(
            "insert into chat_threads (owner_type, patient_id) values ('patient', $1) returning id",
            patient_id)
    return await conn.fetchval(
        "insert into chat_threads (owner_type, anonymous_session_id) values ('anonymous_web', $1) returning id",
        anonymous_session_id)
```

`backend/tests/test_chat_core_schema.py`:
```python
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
    return await conn.fetchval(
        f"insert into chat_messages (thread_id, {', '.join(keys)}) "
        f"values ($1, {ph}) returning id",
        thread_id, *[cols[k] for k in keys])


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
    # 둘 다 null → XOR 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _insert_message(db_conn, t, sender_type="bot", content=None,
                              message_type="text", payload=None)
    # 둘 다 채움 → XOR 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                              support_ticket_id=uuid.uuid4(), sender_type="bot",
                              message_type="text", content="x")


@pytest.mark.asyncio
async def test_text_message_requires_nonempty_content_and_null_payload(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    # text인데 content 공백 → 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                              sender_type="bot", message_type="text", content="   ")
    # text인데 payload 채움 → 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _insert_message(db_conn, t, ai_chat_session_id=uuid.uuid4(),
                              sender_type="bot", message_type="text",
                              content="안녕하세요", payload={"x": 1})


@pytest.mark.asyncio
async def test_card_message_requires_payload(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
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
```

- [ ] **Step 2: 테스트 실패 확인 (표 없음)**

Run: `cd backend && pytest tests/test_chat_core_schema.py -v`
Expected: FAIL — `relation "chat_threads" does not exist`.

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/00036_chat_core_schema.sql`:
```sql
-- 3-A 통합 대화 스키마 ① 대화 루트 + 단일 메시지 원장 + 읽음 상태 (공백 1·2·6).
-- 근거: 3A 스키마 요구 §4.1·§4.3·§4.6·§6·§7 (.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md;
--       결정로그 ui-design-decisions:4371-4465에 병합). enum은 관례대로 text+check(3A §3 허용), 허용값은 3A §3 영문.
-- ⚠️ 번호(예시 00036)는 환자앱·직원웹(00017~00035) 뒤 다음 번호로 적용 시점 확정(Global Constraints).
-- ⚠️ 앞선 FK: ai_chat_sessions·support_tickets(Task 2)·anonymous_chat_sessions(Task 3)는 아직 없다.
--    그 대상 칼럼은 여기서 uuid로만 만들고 FK 제약은 대상 표를 만드는 Task 2·3이 alter로 건다.

-- ── chat_threads: 환자에게 보이는 "같은 상담방"의 안정적 루트 (§4.1) ──
create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('patient', 'anonymous_web')),
  patient_id uuid references patients(id),              -- owner_type=patient일 때만
  anonymous_session_id uuid,                            -- FK는 Task 3(anonymous_chat_sessions)
  last_activity_at timestamptz not null default now(),  -- 목록 정렬용 전체 마지막 활동. AI 30분 만료 판단엔 쓰지 않음(§4.1)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 소유권 XOR: patient면 patient_id만, anonymous_web이면 anonymous_session_id만 (§4.1)
  constraint chat_threads_owner_xor check (
    (owner_type = 'patient'       and patient_id is not null and anonymous_session_id is null)
    or (owner_type = 'anonymous_web' and anonymous_session_id is not null and patient_id is null)
  )
);
-- 익명 세션 하나가 여러 상담방을 가질 수 있으므로 anonymous_session_id는 unique로 만들지 않는다(§4.1).
create index idx_chat_threads_patient  on chat_threads (patient_id) where patient_id is not null;
create index idx_chat_threads_anon     on chat_threads (anonymous_session_id) where anonymous_session_id is not null;
create index idx_chat_threads_activity on chat_threads (last_activity_at desc);

-- ── chat_messages: Realtime 단일 메시지 원장 (§4.3) + 카드 payload(공백2) + 시스템 이벤트(공백6) ──
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id),
  ai_chat_session_id uuid,           -- FK Task 2. 세션 XOR 티켓(정확히 하나)
  support_ticket_id  uuid,           -- FK Task 2
  sender_type text not null check (sender_type in ('patient', 'bot', 'staff', 'system')),
  sender_patient_id           uuid references patients(id),
  sender_anonymous_session_id uuid,  -- FK Task 3
  sender_staff_id             uuid references staff(id),
  message_type text not null default 'text'
    check (message_type in ('text', 'card', 'quick_replies', 'system')),
  content text,                      -- text 유형 본문. card/quick_replies/system은 payload가 알맹이(설계결정 2)
  payload jsonb,                     -- 카드 스냅샷·빠른답변 버튼·시스템 이벤트 종류(카드 스키마는 Task 6)
  client_message_id uuid,            -- 환자·직원 재전송 멱등 키(§4.3)
  created_at timestamptz not null default now(),

  -- 세션 XOR 티켓: 정확히 하나 (§4.3)
  constraint chat_messages_session_ticket_xor check (
    (ai_chat_session_id is not null) <> (support_ticket_id is not null)
  ),
  -- 발신 주체별 형태 (§4.3)
  constraint chat_messages_sender_shape check (
    case sender_type
      when 'patient' then
        ((sender_patient_id is not null) <> (sender_anonymous_session_id is not null))
        and sender_staff_id is null
      when 'staff' then
        sender_staff_id is not null and sender_patient_id is null
        and sender_anonymous_session_id is null and support_ticket_id is not null
      when 'bot' then
        sender_patient_id is null and sender_anonymous_session_id is null
        and sender_staff_id is null and ai_chat_session_id is not null
      when 'system' then
        sender_patient_id is null and sender_anonymous_session_id is null
        and sender_staff_id is null
      else false
    end
  ),
  -- 유형별 본문/payload (공백2·6; 설계결정 2 — 3A text-only content not null을 카드/시스템 추가로 완화)
  constraint chat_messages_type_shape check (
    case message_type
      when 'text'          then content is not null and length(btrim(content)) > 0 and payload is null
      when 'card'          then payload is not null
      when 'quick_replies' then payload is not null
      when 'system'        then payload is not null
      else false
    end
  ),
  -- 시스템 유형 ↔ 시스템 발신자는 짝이다(설계결정 1: 단일 원장에 시스템 경계 보존).
  constraint chat_messages_system_pairing check (
    (message_type = 'system') = (sender_type = 'system')
  )
);
-- 상담방 타임라인·재연결 누락 조회(§6). client_message_id는 non-null 전역 unique(고엔트로피 UUID 1회 논리 전송).
create index idx_chat_messages_thread  on chat_messages (thread_id, created_at, id);
create index idx_chat_messages_ticket  on chat_messages (support_ticket_id, created_at, id) where support_ticket_id is not null;
create index idx_chat_messages_session on chat_messages (ai_chat_session_id, created_at, id) where ai_chat_session_id is not null;
create unique index idx_chat_messages_client_msg on chat_messages (client_message_id) where client_message_id is not null;

-- 발신자↔상담방 소유권 일치(§4.3): 로그인 환자 발신자는 상담방 patient_id, 익명 발신자는 상담방 anonymous_session_id와 같아야 한다.
-- (세션/티켓의 thread_id 일치 트리거는 그 표를 만드는 Task 2가 얹는다.) RLS 우회를 위해 security definer + public 정규화.
create or replace function validate_chat_message_sender_thread()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_patient_id uuid; v_anon_id uuid;
begin
  select patient_id, anonymous_session_id into v_patient_id, v_anon_id
    from public.chat_threads where id = new.thread_id;
  if new.sender_patient_id is not null and new.sender_patient_id is distinct from v_patient_id then
    raise exception '메시지 발신 환자가 상담방 소유자와 다릅니다.' using errcode = 'P0001';
  end if;
  if new.sender_anonymous_session_id is not null and new.sender_anonymous_session_id is distinct from v_anon_id then
    raise exception '메시지 발신 익명 세션이 상담방과 다릅니다.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_validate_chat_message_sender_thread
  before insert on chat_messages
  for each row execute function validate_chat_message_sender_thread();

-- ── chat_read_states: 참여자별 확인 위치 + "지금 보고 있음" heartbeat (§4.6) ──
create table chat_read_states (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id),
  reader_type text not null check (reader_type in ('patient', 'anonymous_web', 'staff')),
  reader_patient_id           uuid references patients(id),
  reader_anonymous_session_id uuid,   -- FK Task 3
  reader_staff_id             uuid references staff(id),
  last_read_message_id uuid references chat_messages(id),
  last_read_at timestamptz,
  active_view_until timestamptz,      -- 짧은 열람 heartbeat 만료. 영구 is_viewing=true 금지(§4.6)
  updated_at timestamptz not null default now(),
  constraint chat_read_states_reader_shape check (
    case reader_type
      when 'patient'       then reader_patient_id is not null and reader_anonymous_session_id is null and reader_staff_id is null
      when 'anonymous_web' then reader_anonymous_session_id is not null and reader_patient_id is null and reader_staff_id is null
      when 'staff'         then reader_staff_id is not null and reader_patient_id is null and reader_anonymous_session_id is null
      else false
    end
  )
);
-- 참여자·상담방 조합당 한 행(§4.6) — reader_type별 부분 unique로 세 종류를 각각 강제.
create unique index idx_chat_read_states_patient on chat_read_states (thread_id, reader_patient_id)           where reader_type = 'patient';
create unique index idx_chat_read_states_anon    on chat_read_states (thread_id, reader_anonymous_session_id) where reader_type = 'anonymous_web';
create unique index idx_chat_read_states_staff   on chat_read_states (thread_id, reader_staff_id)             where reader_type = 'staff';
create index idx_chat_read_states_last_read on chat_read_states (last_read_message_id) where last_read_message_id is not null;

-- ── RLS (§7) — 이 태스크가 담을 수 있는 것만. 직원 읽기는 티켓 배정에 달렸으므로 Task 2가 추가한다. ──
alter table chat_threads     enable row level security;
alter table chat_messages    enable row level security;
alter table chat_read_states enable row level security;
grant select on table chat_threads  to authenticated;
grant select on table chat_messages to authenticated;
grant select, insert, update on table chat_read_states to authenticated;

-- 환자는 본인·가족(활성 링크) 소유 상담방과 그 메시지를 읽는다. 익명 상담방·메시지는 백엔드가 토큰 해시로
-- 범위를 좁혀 서비스 역할로 반환한다(§7·§4.5). 메시지·봇·시스템 쓰기는 send_message 등 서비스 함수(Task 2)로만.
create policy "patients_read_own_threads" on chat_threads
  for select using (owner_type = 'patient' and patient_owns(patient_id));

create policy "patients_read_own_messages" on chat_messages
  for select using (exists (
    select 1 from chat_threads t
    where t.id = chat_messages.thread_id and t.owner_type = 'patient' and patient_owns(t.patient_id)));

-- 환자는 자기 읽음 커서만 만들고 갱신한다(상담방 열람 heartbeat 포함).
create policy "patients_manage_own_read_state" on chat_read_states
  for all
  using (reader_type = 'patient' and reader_patient_id = private.current_patient_id()
    and exists (select 1 from chat_threads t where t.id = chat_read_states.thread_id and patient_owns(t.patient_id)))
  with check (reader_type = 'patient' and reader_patient_id = private.current_patient_id()
    and exists (select 1 from chat_threads t where t.id = chat_read_states.thread_id and patient_owns(t.patient_id)));
```

- [ ] **Step 4: 마이그레이션 적용 → 테스트 통과**

Run: `supabase migration up && cd backend && pytest tests/test_chat_core_schema.py -v`
Expected: PASS(전체 초록불). ⚠️ `supabase db reset` 금지(Global Constraints) — 로컬 DB는 공용. `migration up`으로만 적용한다.

> **적용 전 확인**: 환자앱 `00017`(`patient_owns`·`private.current_patient_id`)과 `seed_patient`(conftest)이 이미 적용/존재해야 이 테스트가 돈다. 챗봇은 3단계(환자앱) 뒤에 구현하므로 정상 전제다. 없으면 「환자앱 먼저」로 막고 넘어가지 말 것.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00036_chat_core_schema.sql \
        backend/tests/test_chat_core_schema.py backend/tests/conftest_chat.py \
        docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 1 본문 — 통합 대화 스키마(chat_threads·chat_messages·chat_read_states) 마이그레이션 + RLS. 시스템 이벤트 단일 원장·content nullable·앞선 FK 지연 3결정 명시, 제약·트리거·인덱스 계약 테스트"
```

> **Task 1 완료 조건**: 세 표·제약·트리거·인덱스·RLS 초록불 · 세션/티켓·익명 FK는 미생성(칼럼만) 확인 · 시스템 이벤트가 `chat_messages`에 단일 원장으로 남음 확인. 화면 규칙 0개라 `plan-coverage-check` 커버 수 불변(정상), `plan-prefix-check`는 소유 접두어 없어 빚·미배정 0.

## Task 2: AI 세션 + 직원 티켓 생명주기 + 원자 배정 (`ai_chat_sessions` · `support_tickets` + `claim`/`send`/`close`)

> **화면 규칙 0개.** 이 태스크는 상담의 두 경계를 만든다: **AI 상담 단위**(30분 무활동 만료)와 **직원 티켓**(`pending→in_progress→answered`). 핵심은 **원자성** — 두 직원이 같은 티켓을 동시에 열어도 한 명만 맡고(§8-1), 일반 `[보내기]`는 티켓을 닫지 않으며 `[상담 종료]`만 `answered`로 만들고(§8-2), 완료 티켓은 재개 불가·재문의는 새 티켓이며(§8-3), 같은 `client_message_id` 재전송은 한 행만 만들고(§8-4), AI 만료 배치와 새 메시지가 경쟁해도 한 세션이 동시에 `active`·`expired`가 되지 않는다(§8-5). Task 1의 `chat_messages` 앞선 FK(세션·티켓)를 여기서 채운다.
>
> **근거 원본**: 3A §4.2(tickets)·§4.4(sessions)·§6(인덱스)·§7(RLS)·§8(원자성 1~5). 서비스 패턴은 1단계 `backend/app/services/appointment_service.py`(security definer SQL 함수 + `acquire_as` Python 래퍼)를 그대로 따른다.
>
> ⭐ **이월 핸드오버 3건을 여기서 담는다**(`docs/design/spec-index/HANDOVERS.md` — 본문에 담기면 `plan-prefix-check` 경고가 사라진다):
> - **`SUPPORT-CAL-DUP` 계열**(직원웹 T14 → 여기) — 한 예약에 상담이 여럿일 때 캘린더 ⚠ 하나가 무엇을 대표하나. **여기서 「대표 = thread당 열린 티켓(partial unique로 하나 보장) → 없으면 가장 최근 answered」로 티켓 모델을 확정**한다. ⚠ 화면 렌더·완전 ID(`-01`)는 Task 18이 담는다(여기서 완전 ID로 쓰면 coverage가 미리 세어버린다 — ⏰).
> - **`TICKET-DETAIL-NOTIFY` 계열**(환자앱 T28 → 여기) — 6번째 토글 `support_reply`가 거는 답변 알림. **`close_ticket`이 `answered`를 찍고, 실제 발송(배칭·`staff_chat_reply`/`support_answered` 문구)은 Task 3 dispatcher**가 한다. 여기선 답변 알림이 키로 삼는 상태(`answered`)를 만든다. 완전 ID는 Task 17.
> - **`PTDET-SUPPORT-03`**(환자앱 정본 → 여기) — 환자상세 상담 문의 **최신순 + ID 동점키 서버 정렬**. `list_thread_tickets`가 `order by created_at desc, id desc`로 담는다. 환자상세 섹션 렌더는 Task 19.

**Files:**
- Create: `supabase/migrations/00037_chat_sessions_tickets.sql`
- Create: `backend/app/services/chat/ticket_service.py` · `backend/app/services/chat/ai_session_service.py`
- Create: `backend/tests/test_chat_sessions_tickets_schema.py` · `backend/tests/test_ticket_service.py` · `backend/tests/test_ai_session_service.py`

**Interfaces:**
- Consumes: Task 1 `chat_threads`·`chat_messages`(앞선 FK 칼럼)·`chat_read_states` · `patients`·`staff`·`appointments`(`00005`) · `private.current_staff_id()`·`private.is_active_staff()`·`patient_owns()`·`private.current_patient_id()` · `acquire_as`·`AppError`(1단계) · 테스트 `db_conn`·`set_session_auth`·`seed_staff`·`seed_patient`·`seed_chat_thread`
- Produces (뒤 태스크가 소비할 이름):
  - 표 `ai_chat_sessions`(§4.4 전체 칼럼) · `support_tickets`(§4.2 + `appointment_id` nullable FK — 공백 3) · `support_ticket_assignment_history`(§4.2)
  - `chat_messages`에 붙는 FK `chat_messages_ai_session_fk`·`chat_messages_ticket_fk` + 트리거 `trg_validate_chat_message_session_thread`(세션/티켓↔메시지 상담방 일치, Task 1 이월분)
  - SQL 함수(security definer): `claim_ticket(uuid) -> support_tickets` · `close_ticket(uuid) -> support_tickets` · `staff_send_ticket_message(uuid, text, uuid) -> chat_messages`(멱등·status 불변) · `create_support_ticket(uuid thread, uuid source_ai_session, uuid appointment, uuid previous) -> support_tickets` · `create_ai_session(uuid thread, text cont_type, uuid cont_ai, uuid cont_ticket, text summary) -> ai_chat_sessions` · `record_ai_activity(uuid) -> void`(30분 연장·active만) · `expire_idle_ai_sessions() -> int`(만료 배치)
  - Python: `ticket_service.claim_ticket / close_ticket / staff_send_message / list_thread_tickets` · `ai_session_service.create_session / record_activity / expire_idle_sessions`
  - 인덱스: `idx_tickets_one_open`(thread당 열린 티켓 partial unique) · `idx_tickets_queue`·`idx_tickets_assigned`·`idx_ai_sessions_one_active`·`idx_ai_sessions_expiry`
  - RLS: 직원 티켓/세션/상담방/메시지 읽기(`private.is_active_staff()`, 역할 좁히기는 Task 16~19) · 환자 자기 세션·티켓 읽기
- ⚠️ **아직 안 하는 것**: **재배정** `reassign_ticket`은 Task 17(`TICKET-DETAIL-REASSIGN` 계열) · **AI→직원 인계 오케스트레이션**(만료 세션 종료 + 티켓 생성 체인)은 Task 5 · **답변 알림 실제 발송·배칭**은 Task 3. Task 2는 그 원자 primitive만 만든다.

- [ ] **Step 1: 실패하는 스키마 계약 테스트 작성**

`backend/tests/test_chat_sessions_tickets_schema.py`:
```python
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import asyncpg

from tests.conftest import seed_staff, seed_patient
from tests.conftest_chat import seed_chat_thread


async def _new_session(conn, thread_id, **cols):
    cols.setdefault("expires_at", datetime.now(timezone.utc) + timedelta(minutes=30))
    keys = list(cols)
    ph = ", ".join(f"${i+2}" for i in range(len(keys)))
    return await conn.fetchval(
        f"insert into ai_chat_sessions (thread_id, {', '.join(keys)}) values ($1, {ph}) returning id",
        thread_id, *[cols[k] for k in keys])


@pytest.mark.asyncio
async def test_ai_session_active_forbids_ended_fields(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _new_session(db_conn, t, status="active", ended_at=datetime.now(timezone.utc))


@pytest.mark.asyncio
async def test_ai_session_expired_requires_inactivity_reason(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _new_session(db_conn, t, status="expired",
                           ended_at=datetime.now(timezone.utc), end_reason="staff_handoff")


@pytest.mark.asyncio
async def test_only_one_active_session_per_thread(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    await _new_session(db_conn, t, status="active")
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await _new_session(db_conn, t, status="active")


@pytest.mark.asyncio
async def test_ai_session_continuation_source_xor(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    prev = await _new_session(db_conn, t, status="expired",
                              ended_at=datetime.now(timezone.utc), end_reason="inactivity_timeout")
    # continuation_source_type=ai_session인데 티켓 출처까지 채우면 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _new_session(db_conn, t, continuation_source_type="ai_session",
                           continued_from_ai_session_id=prev, continued_from_ticket_id=uuid.uuid4())


async def _new_ticket(conn, thread_id, **cols):
    keys = list(cols)
    ph = ", ".join(f"${i+2}" for i in range(len(keys))) if keys else ""
    sql = (f"insert into support_tickets (thread_id, {', '.join(keys)}) values ($1, {ph}) returning id"
           if keys else "insert into support_tickets (thread_id) values ($1) returning id")
    return await conn.fetchval(sql, thread_id, *[cols[k] for k in keys])


@pytest.mark.asyncio
async def test_ticket_answered_requires_closed_fields(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    # answered인데 종료 주체·시각 없음 → 위반.
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await _new_ticket(db_conn, t, status="answered")


@pytest.mark.asyncio
async def test_only_one_open_ticket_per_thread(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    await _new_ticket(db_conn, t, status="pending")
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await _new_ticket(db_conn, t, status="pending")


@pytest.mark.asyncio
async def test_message_session_thread_must_match(db_conn):
    p = await seed_patient(db_conn)
    t1 = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    t2 = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    s2 = await _new_session(db_conn, t2, status="active")
    # 메시지 thread=t1인데 세션은 t2 소속 → 트리거가 막는다(§4.3).
    with pytest.raises(asyncpg.exceptions.RaiseError):
        await db_conn.execute(
            "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content) "
            "values ($1, $2, 'bot', 'text', '엇갈린 상담방')", t1, s2)
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `cd backend && pytest tests/test_chat_sessions_tickets_schema.py -v` → Expected: FAIL(`relation "ai_chat_sessions" does not exist`).

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/00037_chat_sessions_tickets.sql`:
```sql
-- 3-A 통합 대화 스키마 ② AI 상담 단위 + 직원 티켓 생명주기 + 원자 배정 (§4.2·§4.4·§8).
-- Task 1 chat_messages의 앞선 FK(세션·티켓)를 채우고, 세션/티켓↔메시지 상담방 일치 트리거를 얹는다.
-- ⚠️ 번호(예시 00037)는 적용 시점에 확정(Global Constraints).

-- ── ai_chat_sessions: 30분 경계를 가진 AI 상담 단위 (§4.4) ──
create table ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id),
  status text not null default 'active' check (status in ('active', 'expired', 'ended')),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,          -- last_activity_at + 30분. 만료 후보 조회용(§4.4)
  ended_at timestamptz,
  end_reason text check (end_reason in ('inactivity_timeout', 'staff_handoff', 'new_question')),
  closing_summary text,
  summary_last_message_id uuid references chat_messages(id),
  summary_created_at timestamptz,
  continuation_source_type text check (continuation_source_type in ('ai_session', 'support_ticket')),
  continued_from_ai_session_id uuid references ai_chat_sessions(id),
  continued_from_ticket_id uuid,            -- FK support_tickets — 아래에서 표 생성 후 alter
  continuation_summary text,
  created_at timestamptz not null default now(),
  -- 상태 ↔ 종료 사유 정합 (§4.4)
  constraint ai_sessions_status_reason check (
    case status
      when 'active'  then ended_at is null and end_reason is null
      when 'expired' then end_reason = 'inactivity_timeout'
      when 'ended'   then end_reason in ('staff_handoff', 'new_question')
    end
  ),
  -- 이어가기 출처 XOR + continuation_source_type 일치 (§4.4)
  constraint ai_sessions_continuation_consistent check (
    (continuation_source_type is null
       and continued_from_ai_session_id is null and continued_from_ticket_id is null)
    or (continuation_source_type = 'ai_session'
       and continued_from_ai_session_id is not null and continued_from_ticket_id is null)
    or (continuation_source_type = 'support_ticket'
       and continued_from_ticket_id is not null and continued_from_ai_session_id is null)
  )
);
create unique index idx_ai_sessions_one_active on ai_chat_sessions (thread_id) where status = 'active';  -- thread당 active 하나(§4.4·§6)
create index idx_ai_sessions_expiry on ai_chat_sessions (expires_at) where status = 'active';            -- 만료 배치(§6)

-- ── support_tickets: 직원 상담 생명주기 (§4.2) + 예약 연결(공백 3) ──
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id),
  source_ai_session_id uuid references ai_chat_sessions(id),
  previous_ticket_id uuid references support_tickets(id),  -- 재문의가 직전 answered 티켓을 가리킴(재개 아님)
  appointment_id uuid references appointments(id),         -- 공백3: 취소·변경 상담이 어느 예약인지 DB가 보장(nullable — 일반 문의는 없음)
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'answered')),
  assigned_staff_id uuid references staff(id),
  assigned_at timestamptz,
  started_at timestamptz,
  closed_by_staff_id uuid references staff(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- answered면 종료 주체·시각 둘 다, 그 외엔 둘 다 null (§4.2)
  constraint tickets_closed_fields check (
    (status = 'answered' and closed_by_staff_id is not null and closed_at is not null)
    or (status <> 'answered' and closed_by_staff_id is null and closed_at is null)
  )
);
-- thread당 열린 티켓(pending|in_progress) 최대 하나(§4.2·§6). 재문의는 새 PK. ⭐ SUPPORT-CAL-DUP 계열 대표 티켓의 근거(완전 ID=Task 18).
create unique index idx_tickets_one_open on support_tickets (thread_id) where status in ('pending', 'in_progress');
create index idx_tickets_queue on support_tickets (status, created_at) where status in ('pending', 'in_progress');  -- 직원 큐(접수순)
create index idx_tickets_assigned on support_tickets (assigned_staff_id, status, updated_at);
create index idx_tickets_thread on support_tickets (thread_id, created_at);
create index idx_tickets_appointment on support_tickets (appointment_id) where appointment_id is not null;

alter table ai_chat_sessions
  add constraint ai_sessions_continued_ticket_fk
  foreign key (continued_from_ticket_id) references support_tickets(id);

-- 배정·이관 감사 이력 (§4.2). support_tickets.assigned_staff_id가 현재값, 이 표가 변경 이력.
create table support_ticket_assignment_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id),
  from_staff_id uuid references staff(id),        -- 최초 배정이면 null
  to_staff_id uuid not null references staff(id),
  changed_by_staff_id uuid not null references staff(id),
  changed_at timestamptz not null default now()
);
create index idx_ticket_assignment_ticket on support_ticket_assignment_history (ticket_id, changed_at);

-- ── Task 1 chat_messages 앞선 FK를 채운다 (설계결정 3) ──
alter table chat_messages
  add constraint chat_messages_ai_session_fk foreign key (ai_chat_session_id) references ai_chat_sessions(id),
  add constraint chat_messages_ticket_fk     foreign key (support_ticket_id)  references support_tickets(id);

-- 세션/티켓의 thread_id는 메시지 thread_id와 같아야 한다 (§4.3, Task 1에서 이월).
create or replace function validate_chat_message_session_thread()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_thread uuid;
begin
  if new.ai_chat_session_id is not null then
    select thread_id into v_thread from public.ai_chat_sessions where id = new.ai_chat_session_id;
    if v_thread is distinct from new.thread_id then
      raise exception 'AI 세션의 상담방이 메시지 상담방과 다릅니다.' using errcode = 'P0001';
    end if;
  end if;
  if new.support_ticket_id is not null then
    select thread_id into v_thread from public.support_tickets where id = new.support_ticket_id;
    if v_thread is distinct from new.thread_id then
      raise exception '티켓의 상담방이 메시지 상담방과 다릅니다.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_validate_chat_message_session_thread
  before insert on chat_messages for each row execute function validate_chat_message_session_thread();

-- ══ 원자 primitive (security definer) ══

-- 원자 배정(§8-1, Global Constraint): 티켓 상세 열기가 pending 티켓을 자동 배정. 경쟁 패자는 raise.
create or replace function claim_ticket(p_ticket_id uuid)
returns support_tickets language plpgsql security definer set search_path = '' as $$
declare v_staff uuid; v_prev uuid; v_row public.support_tickets; v_cur public.support_tickets;
begin
  v_staff := private.current_staff_id();
  if v_staff is null then raise exception '직원만 상담을 맡을 수 있습니다.' using errcode = 'P0001'; end if;
  select assigned_staff_id into v_prev from public.support_tickets where id = p_ticket_id for update;
  update public.support_tickets
     set assigned_staff_id = v_staff, status = 'in_progress',
         assigned_at = now(), started_at = coalesce(started_at, now()), updated_at = now()
   where id = p_ticket_id and status = 'pending'
   returning * into v_row;
  if found then
    insert into public.support_ticket_assignment_history (ticket_id, from_staff_id, to_staff_id, changed_by_staff_id)
    values (p_ticket_id, v_prev, v_staff, v_staff);
    return v_row;
  end if;
  -- pending이 아니었다. 내가 이미 맡은 것을 다시 연 것이면 재배정 없이 그대로 반환.
  select * into v_cur from public.support_tickets where id = p_ticket_id;
  if v_cur.status = 'in_progress' and v_cur.assigned_staff_id = v_staff then
    return v_cur;
  end if;
  raise exception '이미 다른 직원이 맡았어요.' using errcode = 'P0001';  -- 경쟁 패자
end;
$$;

-- 별도 [상담 종료]만 answered. 일반 [보내기]는 이걸 부르지 않는다(§8-2). in_progress만 종료 가능.
create or replace function close_ticket(p_ticket_id uuid)
returns support_tickets language plpgsql security definer set search_path = '' as $$
declare v_staff uuid; v_row public.support_tickets;
begin
  v_staff := private.current_staff_id();
  if v_staff is null then raise exception '직원만 상담을 종료할 수 있습니다.' using errcode = 'P0001'; end if;
  update public.support_tickets
     set status = 'answered', closed_by_staff_id = v_staff, closed_at = now(), updated_at = now()
   where id = p_ticket_id and status = 'in_progress'
   returning * into v_row;
  if not found then raise exception '진행 중인 상담만 종료할 수 있습니다.' using errcode = 'P0001'; end if;
  return v_row;  -- ⭐ TICKET-DETAIL-NOTIFY 계열: 답변 알림이 키로 삼는 answered를 여기서 찍는다(발송은 Task 3, 완전 ID=Task 17).
end;
$$;

-- 직원 답변 전송(§8-2·§8-4): status 불변. 종료 티켓엔 금지. client_message_id 재전송은 멱등.
create or replace function staff_send_ticket_message(p_ticket_id uuid, p_content text, p_client_message_id uuid default null)
returns chat_messages language plpgsql security definer set search_path = '' as $$
declare v_staff uuid; v_thread uuid; v_status text; v_row public.chat_messages;
begin
  v_staff := private.current_staff_id();
  if v_staff is null then raise exception '직원만 답변할 수 있습니다.' using errcode = 'P0001'; end if;
  select thread_id, status into v_thread, v_status from public.support_tickets where id = p_ticket_id;
  if v_thread is null then raise exception '없는 상담입니다.' using errcode = 'P0001'; end if;
  if v_status = 'answered' then
    raise exception '종료된 상담에는 메시지를 보낼 수 없습니다. 재문의는 새 상담으로 만드세요.' using errcode = 'P0001';
  end if;
  insert into public.chat_messages
    (thread_id, support_ticket_id, sender_type, sender_staff_id, message_type, content, client_message_id)
  values (v_thread, p_ticket_id, 'staff', v_staff, 'text', p_content, p_client_message_id)
  on conflict (client_message_id) where client_message_id is not null do nothing
  returning * into v_row;
  if v_row.id is null and p_client_message_id is not null then          -- 재전송 멱등: 기존 행 반환
    select * into v_row from public.chat_messages where client_message_id = p_client_message_id;
  end if;
  update public.chat_threads set last_activity_at = now(), updated_at = now() where id = v_thread;
  return v_row;
end;
$$;

-- 재문의(§8-3): 직전 answered 티켓을 가리키는 새 티켓. 열린 티켓이 있으면 partial unique가 막는다.
create or replace function create_support_ticket(
  p_thread_id uuid, p_source_ai_session_id uuid default null,
  p_appointment_id uuid default null, p_previous_ticket_id uuid default null)
returns support_tickets language plpgsql security definer set search_path = '' as $$
declare v_row public.support_tickets; v_prev public.support_tickets;
begin
  if p_previous_ticket_id is not null then
    select * into v_prev from public.support_tickets where id = p_previous_ticket_id;
    if v_prev.thread_id is distinct from p_thread_id then
      raise exception '재문의는 같은 상담방에서만 만들 수 있습니다.' using errcode = 'P0001';
    end if;
    if v_prev.status <> 'answered' then
      raise exception '이전 상담이 종료된 뒤에만 재문의할 수 있습니다.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.support_tickets (thread_id, source_ai_session_id, appointment_id, previous_ticket_id)
  values (p_thread_id, p_source_ai_session_id, p_appointment_id, p_previous_ticket_id)
  returning * into v_row;
  return v_row;
exception when unique_violation then                                     -- 이미 열린 티켓이 있다
  raise exception '이미 직원 확인을 기다리는 상담이 있어요.' using errcode = 'P0001';
end;
$$;

-- 새 AI 상담 단위(§4.4). [이전 내용 이어서]=출처 채움, [새 질문 시작]=출처 null.
create or replace function create_ai_session(
  p_thread_id uuid, p_continuation_source_type text default null,
  p_continued_from_ai_session_id uuid default null, p_continued_from_ticket_id uuid default null,
  p_continuation_summary text default null)
returns ai_chat_sessions language plpgsql security definer set search_path = '' as $$
declare v_row public.ai_chat_sessions;
begin
  insert into public.ai_chat_sessions
    (thread_id, expires_at, continuation_source_type,
     continued_from_ai_session_id, continued_from_ticket_id, continuation_summary)
  values (p_thread_id, now() + interval '30 minutes', p_continuation_source_type,
          p_continued_from_ai_session_id, p_continued_from_ticket_id, p_continuation_summary)
  returning * into v_row;
  return v_row;
exception when unique_violation then                                     -- thread당 active 하나
  raise exception '이미 진행 중인 AI 상담이 있어요.' using errcode = 'P0001';
end;
$$;

-- 30분 연장(§4.4·§8-5): active만. active가 아니면 raise → 만료 배치와 상호배제(둘 다 status='active' 잠금).
create or replace function record_ai_activity(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.ai_chat_sessions
     set last_activity_at = now(), expires_at = now() + interval '30 minutes'
   where id = p_session_id and status = 'active';
  if not found then raise exception '만료되었거나 종료된 AI 상담입니다.' using errcode = 'P0001'; end if;
end;
$$;

-- 만료 배치(§8-5): now >= expires_at인 active만 조건부로 expired. 새 메시지의 record_ai_activity와 경쟁해도 하나만 이긴다.
create or replace function expire_idle_ai_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  with expired as (
    update public.ai_chat_sessions
       set status = 'expired', ended_at = now(), end_reason = 'inactivity_timeout'
     where status = 'active' and now() >= expires_at
     returning id)
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- ── RLS (§7) ──
alter table ai_chat_sessions enable row level security;
alter table support_tickets enable row level security;
alter table support_ticket_assignment_history enable row level security;
grant select on table ai_chat_sessions to authenticated;
grant select on table support_tickets to authenticated;
grant select on table support_ticket_assignment_history to authenticated;

-- 환자는 자기 상담방의 세션·티켓을 읽는다.
create policy "patients_read_own_ai_sessions" on ai_chat_sessions
  for select using (exists (select 1 from chat_threads t
    where t.id = ai_chat_sessions.thread_id and t.owner_type = 'patient' and patient_owns(t.patient_id)));
create policy "patients_read_own_tickets" on support_tickets
  for select using (exists (select 1 from chat_threads t
    where t.id = support_tickets.thread_id and t.owner_type = 'patient' and patient_owns(t.patient_id)));

-- 직원(활성)은 티켓·세션·이력을 읽는다. 정확한 역할 범위(의사/접수/관리자)는 동작명세 권한 계약(Task 16~19)이 좁힌다(§7).
create policy "staff_read_tickets" on support_tickets for select using (private.is_active_staff());
create policy "staff_read_ticket_ai_sessions" on ai_chat_sessions for select using (private.is_active_staff());
create policy "staff_read_assignment_history" on support_ticket_assignment_history for select using (private.is_active_staff());

-- Task 1에서 이월된 직원 상담방·메시지 읽기: 티켓이 걸린 상담방(직원이 볼 수 있는 것).
create policy "staff_read_thread_of_tickets" on chat_threads for select using (
  private.is_active_staff() and exists (select 1 from support_tickets tk where tk.thread_id = chat_threads.id));
create policy "staff_read_messages_of_tickets" on chat_messages for select using (
  private.is_active_staff() and exists (select 1 from support_tickets tk where tk.thread_id = chat_messages.thread_id));
```

- [ ] **Step 4: 마이그레이션 적용 → 스키마 테스트 통과**

Run: `supabase migration up && cd backend && pytest tests/test_chat_sessions_tickets_schema.py -v` → Expected: PASS. (`supabase db reset` 금지.)

- [ ] **Step 5: Python 서비스 래퍼 작성**

`backend/app/services/chat/ticket_service.py`:
```python
from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.db.pool import acquire_as


def _to_dict(row) -> dict:
    return dict(row) if row is not None else None


async def claim_ticket(auth_user_id: str, ticket_id: UUID) -> dict:
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow("select * from claim_ticket($1)", ticket_id)
        except asyncpg.exceptions.RaiseError as e:
            # 경쟁 패자·권한 없음은 한글 메시지 그대로 409로. 파이썬 예외 원문 노출 금지.
            raise AppError(str(e), 409)
        return _to_dict(row)


async def close_ticket(auth_user_id: str, ticket_id: UUID) -> dict:
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow("select * from close_ticket($1)", ticket_id)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)
        return _to_dict(row)


async def staff_send_message(auth_user_id: str, ticket_id: UUID, content: str,
                             client_message_id: UUID | None = None) -> dict:
    if not content or not content.strip():
        raise AppError("보낼 내용을 입력해 주세요.", 400)
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow(
                "select * from staff_send_ticket_message($1, $2, $3)", ticket_id, content, client_message_id)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)
        return _to_dict(row)


async def list_thread_tickets(auth_user_id: str, thread_id: UUID) -> list[dict]:
    # PTDET-SUPPORT-03: 최신순 + ID 동점키 서버 정렬. 화면(Task 19)이 계산하지 않는다.
    async with acquire_as(auth_user_id) as conn:
        rows = await conn.fetch(
            "select * from support_tickets where thread_id = $1 order by created_at desc, id desc", thread_id)
        return [dict(r) for r in rows]
```

`backend/app/services/chat/ai_session_service.py`:
```python
from uuid import UUID

import asyncpg

from app.core.errors import AppError
from app.db.pool import acquire_as, get_pool


async def create_session(auth_user_id: str, thread_id: UUID, *,
                         continuation_source_type: str | None = None,
                         continued_from_ai_session_id: UUID | None = None,
                         continued_from_ticket_id: UUID | None = None,
                         continuation_summary: str | None = None) -> dict:
    async with acquire_as(auth_user_id) as conn:
        try:
            row = await conn.fetchrow(
                "select * from create_ai_session($1, $2, $3, $4, $5)",
                thread_id, continuation_source_type,
                continued_from_ai_session_id, continued_from_ticket_id, continuation_summary)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)
        return dict(row)


async def record_activity(auth_user_id: str, session_id: UUID) -> None:
    async with acquire_as(auth_user_id) as conn:
        try:
            await conn.execute("select record_ai_activity($1)", session_id)
        except asyncpg.exceptions.RaiseError as e:
            raise AppError(str(e), 409)


async def expire_idle_sessions() -> int:
    # 만료 배치는 서버 주체 실행(배포 cron). 여기선 풀 커넥션으로 직접 부른다(RLS 우회 함수).
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval("select expire_idle_ai_sessions()")
```

- [ ] **Step 6: 원자성 서비스 테스트 작성 (§8-1~5)**

`backend/tests/test_ticket_service.py`:
```python
import uuid
import pytest

from app.services.chat import ticket_service
from tests.conftest import seed_staff, seed_patient, set_session_auth
from tests.conftest_chat import seed_chat_thread


async def _open_ticket(conn, thread_id):
    return await conn.fetchval(
        "insert into support_tickets (thread_id) values ($1) returning id", thread_id)


@pytest.mark.asyncio
async def test_two_staff_claim_only_one_wins(db_conn, monkeypatch):
    # §8-1. 같은 pending 티켓을 두 직원이 열면 한 명만 in_progress로 가져간다.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    a = await seed_staff(db_conn, role="doctor")
    b = await seed_staff(db_conn, role="doctor")
    # acquire_as를 우회해 같은 트랜잭션 db_conn에서 직접 함수를 부르며 직원만 바꿔 경쟁을 재현.
    await set_session_auth(db_conn, a["auth_user_id"])
    won = await db_conn.fetchrow("select * from claim_ticket($1)", ticket)
    assert won["status"] == "in_progress" and won["assigned_staff_id"] == a["staff_id"]
    await set_session_auth(db_conn, b["auth_user_id"])
    with pytest.raises(Exception) as exc:      # asyncpg RaiseError
        await db_conn.fetchrow("select * from claim_ticket($1)", ticket)
    assert "이미 다른 직원이 맡았어요" in str(exc.value)


@pytest.mark.asyncio
async def test_send_keeps_in_progress_only_close_answers(db_conn):
    # §8-2. 일반 보내기는 status 불변, close만 answered.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    st = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, st["auth_user_id"])
    await db_conn.fetchrow("select * from claim_ticket($1)", ticket)
    await db_conn.fetchrow("select * from staff_send_ticket_message($1, $2, null)", ticket, "확인했습니다")
    assert await db_conn.fetchval("select status from support_tickets where id=$1", ticket) == "in_progress"
    closed = await db_conn.fetchrow("select * from close_ticket($1)", ticket)
    assert closed["status"] == "answered" and closed["closed_by_staff_id"] == st["staff_id"]


@pytest.mark.asyncio
async def test_closed_ticket_rejects_message_and_reticket_makes_new(db_conn):
    # §8-3. 완료 티켓은 메시지 거부, 재문의는 새 티켓(previous_ticket_id로 연결).
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    st = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, st["auth_user_id"])
    await db_conn.fetchrow("select * from claim_ticket($1)", ticket)
    await db_conn.fetchrow("select * from close_ticket($1)", ticket)
    with pytest.raises(Exception) as exc:
        await db_conn.fetchrow("select * from staff_send_ticket_message($1, $2, null)", ticket, "추가 답변")
    assert "종료된 상담" in str(exc.value)
    new = await db_conn.fetchrow("select * from create_support_ticket($1, null, null, $2)", t, ticket)
    assert new["id"] != ticket and new["previous_ticket_id"] == ticket and new["status"] == "pending"


@pytest.mark.asyncio
async def test_duplicate_client_message_id_makes_one_row(db_conn):
    # §8-4. 같은 client_message_id 재전송은 한 행만(멱등).
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ticket = await _open_ticket(db_conn, t)
    st = await seed_staff(db_conn, role="doctor")
    await set_session_auth(db_conn, st["auth_user_id"])
    await db_conn.fetchrow("select * from claim_ticket($1)", ticket)
    cid = uuid.uuid4()
    m1 = await db_conn.fetchrow("select * from staff_send_ticket_message($1, $2, $3)", ticket, "답변", cid)
    m2 = await db_conn.fetchrow("select * from staff_send_ticket_message($1, $2, $3)", ticket, "답변", cid)
    assert m1["id"] == m2["id"]
    assert await db_conn.fetchval(
        "select count(*) from chat_messages where client_message_id=$1", cid) == 1


@pytest.mark.asyncio
async def test_list_tickets_latest_first_with_id_tiebreak(db_conn):
    # PTDET-SUPPORT-03. 같은 created_at이어도 id 내림차순 동점키로 안정 정렬.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    ids = []
    for _ in range(3):
        ids.append(await db_conn.fetchval(
            "insert into support_tickets (thread_id, status, closed_by_staff_id, closed_at, created_at) "
            "values ($1, 'answered', "
            "  (select id from staff limit 1), now(), '2026-08-01T09:00:00Z') returning id", t))
    # seed staff for the closed_by FK above.
    rows = await db_conn.fetch(
        "select id from support_tickets where thread_id=$1 order by created_at desc, id desc", t)
    got = [r["id"] for r in rows]
    assert got == sorted(ids, reverse=True)
```

`backend/tests/test_ai_session_service.py`:
```python
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import seed_patient
from tests.conftest_chat import seed_chat_thread


@pytest.mark.asyncio
async def test_expire_batch_and_activity_are_mutually_exclusive(db_conn):
    # §8-5. 만료 지난 active를 배치가 expired로 만들면, 그 세션의 record_ai_activity는 거부된다.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    sid = await db_conn.fetchval(
        "insert into ai_chat_sessions (thread_id, status, expires_at) values ($1, 'active', $2) returning id",
        t, past)
    n = await db_conn.fetchval("select expire_idle_ai_sessions()")
    assert n >= 1
    assert await db_conn.fetchval("select status from ai_chat_sessions where id=$1", sid) == "expired"
    with pytest.raises(Exception) as exc:
        await db_conn.execute("select record_ai_activity($1)", sid)
    assert "만료" in str(exc.value)


@pytest.mark.asyncio
async def test_only_one_active_session_via_create(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    await db_conn.fetchrow("select * from create_ai_session($1, null, null, null, null)", t)
    with pytest.raises(Exception) as exc:
        await db_conn.fetchrow("select * from create_ai_session($1, null, null, null, null)", t)
    assert "이미 진행 중인 AI 상담" in str(exc.value)
```

> ⚠️ **테스트 구현 메모(⑦ 착수 시)**: `test_two_staff_claim_only_one_wins`는 진짜 동시성이 아니라 **같은 트랜잭션에서 직원만 바꿔** 조건부 UPDATE의 승패를 검증한다. 진짜 원자성은 `claim_ticket`의 `where status='pending'` + row lock이 보장한다(두 커넥션 동시 실행도 한 UPDATE만 매칭). `test_list_tickets_latest_first_with_id_tiebreak`는 `closed_by_staff_id` FK 때문에 staff를 먼저 시드해야 한다(스텁의 `select id from staff limit 1`을 실제 시드로 바꿀 것).

- [ ] **Step 7: 테스트 통과 확인** — Run: `cd backend && pytest tests/test_chat_sessions_tickets_schema.py tests/test_ticket_service.py tests/test_ai_session_service.py -v` → Expected: PASS(전체 초록불).

- [ ] **Step 8: 커밋**

```bash
git add supabase/migrations/00037_chat_sessions_tickets.sql \
        backend/app/services/chat/ticket_service.py backend/app/services/chat/ai_session_service.py \
        backend/tests/test_chat_sessions_tickets_schema.py backend/tests/test_ticket_service.py \
        backend/tests/test_ai_session_service.py docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 2 본문 — AI 세션·티켓 생명주기·원자 배정(claim/send/close 분리) + §8 원자성 1~5 테스트. 이월 SUPPORT-CAL-DUP(대표 티켓)·TICKET-DETAIL-NOTIFY(close→answered)·PTDET-SUPPORT-03(정렬) 담음"
```

> **Task 2 완료 조건**: 세 표·FK·트리거·원자 primitive·RLS 초록불 · §8-1~5 테스트 통과 · 일반 `[보내기]`가 status를 바꾸지 않고 `[상담 종료]`만 `answered`임 확인 · 완료 티켓 재개 불가·재문의 새 PK 확인. 화면 규칙 0개라 coverage 불변, prefix-check 빚·미배정 0. 이월 3건이 본문에 담겨 HANDOVERS 경고가 줄어듦.

## Task 3: 익명 소유권 + 수신자 추상화 + 알림 배칭 (`anonymous_chat_*` · `NotificationRecipient` · `chat_notification_batches`)

> **화면 규칙 0개.** 이 태스크는 세 가지를 만든다: **① 익명 웹 소유권**(브라우저 토큰 해시 + 검증된 SMS 연락처, 전화번호가 환자와 같아도 계정 자동 연결 금지) · **② 수신자 추상화**(등록 환자와 익명 연락처를 하나의 `NotificationRecipient` 계약으로 — 목적지 확인 adapter만 둘, 배칭·발송 파이프라인은 하나) · **③ 미확인 연속 답변 배칭**(사용자가 상담방을 안 볼 때만 연속 직원 답변을 한 배치로 묶어 알림 한 번). Task 1·2의 앞선 익명 FK(`chat_threads`·`chat_messages`·`chat_read_states`의 `anonymous_session_id`)를 여기서 채운다.
>
> **근거 원본**: 3A §4.5(익명 세션·연락처)·§4.7(배칭)·§5(`NotificationRecipient`·`#115·#119 notification_log` 연결)·§8(6~9·11·12). 기존 `notification_log`는 **`00011`에 이미 적용됨**(익명 칼럼·`kind`·`delivery_status`·`retry_count` 존재) → 3A §5 두 갈래 중 **「먼저 적용됨 → 후속 마이그레이션에서 3-A FK·허용값만 확장」**을 택한다(표 복제 금지).
>
> ⭐ **이 태스크의 설계 결정 2건(기각안 포함)**:
> 1. **배칭 enqueue는 `chat_notification_batches`만 만들고 `notification_log`에 직접 쓰지 않는다.** §5 파이프라인 「배치 생성 → NotificationRecipient 해석 → 공통 dispatcher → notification_log 결과/재시도」에서 **실제 발송·채널(push/sms)·재시도는 공통 dispatcher**(직원웹 T30 `dispatch_service` + 배포 cron, 상담봇과 공유)가 배치를 읽어 처리한다. Task 3은 배치 + `notification_requested_at`까지. *기각: enqueue가 notification_log 행을 바로 insert* — `channel`(NOT NULL)을 dispatcher가 아직 정하지 못했고, 발송 결과·재시도 원장을 두 곳에서 쓰게 된다.
> 2. **익명 연락처 검증·복호화 목적지는 adapter가 감춘다.** `notify_patient()`(등록 환자 device/phone)와 익명 adapter(검증된 익명 전화 복호화)는 **목적지 확인만 다르고** 배칭·`notification_log`·재시도는 한 파이프라인. *기각: 익명용 별도 배칭 규칙·별도 발송 결과표* (§5 금지).

**Files:**
- Create: `supabase/migrations/00038_anonymous_chat_notifications.sql`
- Create: `backend/app/services/chat/anonymous_service.py` · `backend/app/services/chat/notification_recipient.py`
- Create: `backend/tests/test_anonymous_chat_schema.py` · `backend/tests/test_chat_notification_batching.py`

**Interfaces:**
- Consumes: Task 1·2 `chat_threads`·`chat_messages`·`chat_read_states`·`support_tickets` · `notification_log`(`00011` — `id, patient_id, sender_staff_id, target_count, notification_type, kind, channel, delivery_status, failure_code, retry_count, anonymous_session_id, anonymous_contact_id`) · `patients`·`staff` · `acquire_as`·`get_pool`·`AppError` · 테스트 `db_conn`·`seed_patient`·`seed_staff`·`seed_chat_thread`
- Produces:
  - 표 `anonymous_chat_sessions`(§4.5 — `token_hash` unique·`last_seen_at`·`revoked_at`) · `anonymous_chat_contacts`(§4.5 — `contact_value_ciphertext`·`contact_value_hash`·`verified_at`·`answer_notification_enabled_at`) · `chat_notification_batches`(§4.7 전체)
  - `chat_threads.anonymous_session_id`·`chat_messages.sender_anonymous_session_id`·`chat_read_states.reader_anonymous_session_id`에 붙는 FK(Task 1·2 이월분)
  - `notification_log` 확장: `recipient_type`·`chat_notification_batch_id`(unique FK) 칼럼 + `anonymous_session_id`/`anonymous_contact_id`에 FK + `notification_type` 값 `staff_chat_reply` 사용
  - SQL 함수(security definer): `upsert_anonymous_session(text token_hash) -> anonymous_chat_sessions` · `record_verified_anonymous_contact(uuid session, text ciphertext, text hash) -> anonymous_chat_contacts` · `enqueue_staff_reply_notification(uuid message_id) -> uuid`(배치 생성/확장, 즉시읽음이면 null) · `acknowledge_chat_batches(uuid thread, text reader_type, uuid reader_id) -> void`
  - Python: `anonymous_service.upsert_session / record_verified_contact` · `notification_recipient.resolve_recipient(batch_row) -> dict`(등록 환자면 `notify_patient` 대상, 익명이면 검증 연락처 참조 — dispatcher가 복호화·발송)
  - RLS: 익명 표는 authenticated 직접 조회 금지(백엔드가 토큰 해시로 범위 좁혀 서비스 역할 반환) · 직원은 배치·연락처 마스킹만
- ⚠️ **아직 안 하는 것**: **실제 SMS/push 발송·재시도·`notification_log` 행 생성**은 공통 dispatcher(직원웹 T30·배포) · **웹 OTP 챌린지 UI·복호화 키 설정**은 Task 15·배포 · **익명 상담을 로그인 계정으로 이관**은 범위 밖(3A §4.5, 별도 인증·감사 필요).

- [ ] **Step 1: 실패하는 익명 스키마 테스트 작성**

`backend/tests/test_anonymous_chat_schema.py`:
```python
import uuid
import pytest
import asyncpg

from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread


@pytest.mark.asyncio
async def test_anonymous_session_token_hash_unique(db_conn):
    h = "hash-" + uuid.uuid4().hex
    await db_conn.execute("insert into anonymous_chat_sessions (token_hash) values ($1)", h)
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await db_conn.execute("insert into anonymous_chat_sessions (token_hash) values ($1)", h)


@pytest.mark.asyncio
async def test_anonymous_thread_fk_now_enforced(db_conn):
    # Task 1은 anonymous_session_id를 FK 없는 uuid로 뒀다. Task 3이 FK를 채웠으니 없는 세션은 거부된다.
    with pytest.raises(asyncpg.exceptions.ForeignKeyViolationError):
        await db_conn.execute(
            "insert into chat_threads (owner_type, anonymous_session_id) values ('anonymous_web', $1)",
            uuid.uuid4())


@pytest.mark.asyncio
async def test_anonymous_contact_stores_hash_and_ciphertext(db_conn):
    sid = await db_conn.fetchval(
        "insert into anonymous_chat_sessions (token_hash) values ($1) returning id", "h-" + uuid.uuid4().hex)
    cid = await db_conn.fetchval(
        "insert into anonymous_chat_contacts (anonymous_session_id, contact_kind, "
        "contact_value_ciphertext, contact_value_hash) values ($1,'phone','ENC','PHASH') returning id", sid)
    row = await db_conn.fetchrow("select * from anonymous_chat_contacts where id=$1", cid)
    assert row["contact_value_ciphertext"] == "ENC" and row["contact_value_hash"] == "PHASH"
    assert row["verified_at"] is None  # 검증 전엔 알림·복원 불가(§4.5)


@pytest.mark.asyncio
async def test_batch_recipient_patient_shape(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await db_conn.fetchval("insert into support_tickets (thread_id) values ($1) returning id", t)
    st = await seed_staff(db_conn, role="doctor")
    m = await db_conn.fetchval(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, sender_staff_id, "
        "message_type, content) values ($1,$2,'staff',$3,'text','답변') returning id", t, tk, st["staff_id"])
    # recipient_type=patient인데 익명 연락처까지 채우면 위반(§4.7).
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await db_conn.execute(
            "insert into chat_notification_batches (thread_id, ticket_id, recipient_type, "
            "recipient_patient_id, recipient_anonymous_contact_id, first_message_id, last_message_id) "
            "values ($1,$2,'patient',$3,$4,$5,$5)", t, tk, p["patient_id"], uuid.uuid4(), m)


@pytest.mark.asyncio
async def test_one_open_batch_per_ticket_recipient(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await db_conn.fetchval("insert into support_tickets (thread_id) values ($1) returning id", t)
    st = await seed_staff(db_conn, role="doctor")
    m = await db_conn.fetchval(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, sender_staff_id, "
        "message_type, content) values ($1,$2,'staff',$3,'text','답변') returning id", t, tk, st["staff_id"])
    await db_conn.execute(
        "insert into chat_notification_batches (thread_id, ticket_id, recipient_type, "
        "recipient_patient_id, first_message_id, last_message_id) values ($1,$2,'patient',$3,$4,$4)",
        t, tk, p["patient_id"], m)
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await db_conn.execute(
            "insert into chat_notification_batches (thread_id, ticket_id, recipient_type, "
            "recipient_patient_id, first_message_id, last_message_id) values ($1,$2,'patient',$3,$4,$4)",
            t, tk, p["patient_id"], m)
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `cd backend && pytest tests/test_anonymous_chat_schema.py -v` → Expected: FAIL(`relation "anonymous_chat_sessions" does not exist`).

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/00038_anonymous_chat_notifications.sql`:
```sql
-- 3-A 통합 대화 스키마 ③ 익명 소유권 + 알림 배칭 + notification_log 연결 (§4.5·§4.7·§5).
-- notification_log는 00011에 이미 적용 → 표 복제 없이 FK·허용값·배치 링크만 확장(§5 두 갈래 중 후자).
-- ⚠️ 번호(예시 00038)는 적용 시점에 확정.

-- ── anonymous_chat_sessions: 브라우저 익명 토큰의 단방향 해시 (§4.5) ──
create table anonymous_chat_sessions (
  id uuid primary key default gen_random_uuid(),        -- 내부 PK. 브라우저에 노출할 토큰이 아님
  token_hash text not null unique,                      -- 고엔트로피 원문 토큰의 해시. 원문 저장 금지
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
-- 토큰 만료 기간은 3-A 미확정(§4.5). 임의 제품값을 넣지 않는다 — 회전·폐기 가능성만 둔다(revoked_at).

-- ── anonymous_chat_contacts: 익명 직원답변 SMS용 검증 연락처 (§4.5) ──
create table anonymous_chat_contacts (
  id uuid primary key default gen_random_uuid(),
  anonymous_session_id uuid not null references anonymous_chat_sessions(id),
  contact_kind text not null default 'phone' check (contact_kind in ('phone')),
  contact_value_ciphertext text not null,               -- 원문 전화번호 암호화 저장(평문 금지)
  contact_value_hash text not null,                     -- 정규화 번호의 단방향 해시(검증·중복용, 환자 추측매칭 금지)
  verified_at timestamptz,                              -- 소유 확인 시각. 알림·복원은 검증 후만(§4.5)
  answer_notification_enabled_at timestamptz,           -- 이 상담 답변 SMS 수신 동의 시각(광고 동의 아님)
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_anon_contacts_session on anonymous_chat_contacts (anonymous_session_id, contact_kind)
  where revoked_at is null;

-- ── Task 1·2 익명 앞선 FK를 채운다 (설계결정 3) ──
alter table chat_threads     add constraint chat_threads_anon_fk
  foreign key (anonymous_session_id) references anonymous_chat_sessions(id);
alter table chat_messages    add constraint chat_messages_sender_anon_fk
  foreign key (sender_anonymous_session_id) references anonymous_chat_sessions(id);
alter table chat_read_states add constraint chat_read_states_reader_anon_fk
  foreign key (reader_anonymous_session_id) references anonymous_chat_sessions(id);

-- ── chat_notification_batches: 미확인 연속 직원 답변 한 묶음 (§4.7) ──
create table chat_notification_batches (
  id uuid primary key default gen_random_uuid(),        -- PK 및 알림 멱등 키
  thread_id uuid not null references chat_threads(id),
  ticket_id uuid not null references support_tickets(id),
  recipient_type text not null check (recipient_type in ('patient', 'anonymous_chat_contact')),
  recipient_patient_id uuid references patients(id),
  recipient_anonymous_session_id uuid references anonymous_chat_sessions(id),
  recipient_anonymous_contact_id uuid references anonymous_chat_contacts(id),
  first_message_id uuid not null references chat_messages(id),
  last_message_id uuid not null references chat_messages(id),
  message_count int not null default 1 check (message_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notification_requested_at timestamptz,                -- 알림 발송 요청 시각(한 번만)
  acknowledged_at timestamptz,                          -- 사용자가 이 묶음을 확인한 시각
  -- 수신자 형태 (§4.7): patient면 patient_id만, anonymous_chat_contact면 세션+연락처 둘 다
  constraint batch_recipient_shape check (
    (recipient_type = 'patient'
       and recipient_patient_id is not null
       and recipient_anonymous_session_id is null and recipient_anonymous_contact_id is null)
    or (recipient_type = 'anonymous_chat_contact'
       and recipient_patient_id is null
       and recipient_anonymous_session_id is not null and recipient_anonymous_contact_id is not null)
  )
);
-- 티켓·수신자당 열린 배치(acknowledged_at is null) 하나 — 동시 답변 중복 방지(§4.7·§8-6).
create unique index idx_batch_open_patient on chat_notification_batches (ticket_id, recipient_patient_id)
  where acknowledged_at is null and recipient_type = 'patient';
create unique index idx_batch_open_anon on chat_notification_batches (ticket_id, recipient_anonymous_contact_id)
  where acknowledged_at is null and recipient_type = 'anonymous_chat_contact';
create index idx_batch_thread on chat_notification_batches (thread_id, created_at);

-- ── notification_log 확장(§5) — 표 복제 없이 FK·배치 링크만 ──
alter table notification_log
  add column recipient_type text check (recipient_type in ('patient', 'anonymous_chat_contact')),
  add column chat_notification_batch_id uuid references chat_notification_batches(id),
  add constraint notification_log_anon_session_fk
    foreign key (anonymous_session_id) references anonymous_chat_sessions(id),
  add constraint notification_log_anon_contact_fk
    foreign key (anonymous_contact_id) references anonymous_chat_contacts(id);
-- 한 배치에 로그 한 행(§5). 상담 답변 알림의 dispatcher 멱등 자물쇠.
create unique index idx_notification_log_batch on notification_log (chat_notification_batch_id)
  where chat_notification_batch_id is not null;
-- 익명 세션별 발송 이력 조회(§6).
create index idx_notification_log_anon_session on notification_log (anonymous_session_id, sent_at)
  where anonymous_session_id is not null;

-- ══ 익명 소유권 primitive ══
-- 같은 브라우저 토큰(해시)이면 기존 세션 반환, 없으면 생성. 원문 토큰은 백엔드가 해시해서 넘긴다(DB에 원문 없음).
create or replace function upsert_anonymous_session(p_token_hash text)
returns anonymous_chat_sessions language plpgsql security definer set search_path = '' as $$
declare v_row public.anonymous_chat_sessions;
begin
  update public.anonymous_chat_sessions set last_seen_at = now()
    where token_hash = p_token_hash and revoked_at is null
    returning * into v_row;
  if found then return v_row; end if;
  insert into public.anonymous_chat_sessions (token_hash) values (p_token_hash) returning * into v_row;
  return v_row;
end;
$$;

-- 연락처 소유 확인 완료(SMS OTP 성공 뒤 호출, 챌린지는 Task 15). 검증+수신 동의를 함께 찍는다.
-- ⚠️ contact_value_hash가 patients.phone과 같아도 chat_threads.patient_id를 채우지 않는다(§4.5·§8-9).
create or replace function record_verified_anonymous_contact(
  p_session_id uuid, p_ciphertext text, p_hash text)
returns anonymous_chat_contacts language plpgsql security definer set search_path = '' as $$
declare v_row public.anonymous_chat_contacts;
begin
  insert into public.anonymous_chat_contacts
    (anonymous_session_id, contact_kind, contact_value_ciphertext, contact_value_hash,
     verified_at, answer_notification_enabled_at)
  values (p_session_id, 'phone', p_ciphertext, p_hash, now(), now())
  returning * into v_row;
  return v_row;
end;
$$;

-- ══ 배칭 primitive (§4.7·§8-6~8) ══
-- 직원 답변 메시지 뒤 호출. 수신자가 보고 있으면 즉시 읽음(배치·알림 없음), 아니면 배치 생성/확장.
-- notification_log 행은 만들지 않는다(설계결정 1) — 배치+notification_requested_at까지. dispatcher가 발송.
create or replace function enqueue_staff_reply_notification(p_message_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.chat_messages; v_thread public.chat_threads;
  v_rtype text; v_patient uuid; v_anon_session uuid; v_anon_contact uuid;
  v_viewing boolean; v_batch uuid;
begin
  select * into v_msg from public.chat_messages where id = p_message_id;
  if v_msg.sender_type <> 'staff' or v_msg.support_ticket_id is null then
    raise exception '직원 티켓 답변만 알림 배치가 됩니다.' using errcode = 'P0001';
  end if;
  select * into v_thread from public.chat_threads where id = v_msg.thread_id;
  if v_thread.owner_type = 'patient' then
    v_rtype := 'patient'; v_patient := v_thread.patient_id;
  else
    v_rtype := 'anonymous_chat_contact'; v_anon_session := v_thread.anonymous_session_id;
    select id into v_anon_contact from public.anonymous_chat_contacts
      where anonymous_session_id = v_anon_session and contact_kind = 'phone'
        and verified_at is not null and answer_notification_enabled_at is not null and revoked_at is null
      order by verified_at desc limit 1;
    if v_anon_contact is null then return null; end if;   -- 검증 연락처 없으면 SMS 대상 없음 → 배치·알림 없음
  end if;
  -- 지금 보고 있으면(§8-8) 즉시 읽음, 배치·알림 없음.
  select (active_view_until is not null and active_view_until > now()) into v_viewing
    from public.chat_read_states
    where thread_id = v_thread.id
      and ((v_rtype='patient' and reader_type='patient' and reader_patient_id=v_patient)
        or (v_rtype='anonymous_chat_contact' and reader_type='anonymous_web'
            and reader_anonymous_session_id=v_anon_session));
  if coalesce(v_viewing, false) then
    update public.chat_read_states set last_read_message_id=p_message_id, last_read_at=now(), updated_at=now()
      where thread_id = v_thread.id
        and ((v_rtype='patient' and reader_type='patient' and reader_patient_id=v_patient)
          or (v_rtype='anonymous_chat_contact' and reader_type='anonymous_web'
              and reader_anonymous_session_id=v_anon_session));
    return null;
  end if;
  -- 열린 배치가 있으면 확장(알림 재요청 안 함, §8-7), 없으면 새로 + 알림 한 번 요청.
  update public.chat_notification_batches
     set last_message_id=p_message_id, message_count=message_count+1, updated_at=now()
   where ticket_id=v_msg.support_ticket_id and acknowledged_at is null
     and ((v_rtype='patient' and recipient_patient_id=v_patient)
       or (v_rtype='anonymous_chat_contact' and recipient_anonymous_contact_id=v_anon_contact))
   returning id into v_batch;
  if found then return v_batch; end if;
  insert into public.chat_notification_batches
    (thread_id, ticket_id, recipient_type, recipient_patient_id,
     recipient_anonymous_session_id, recipient_anonymous_contact_id,
     first_message_id, last_message_id, message_count, notification_requested_at)
  values (v_thread.id, v_msg.support_ticket_id, v_rtype,
     case when v_rtype='patient' then v_patient end,
     case when v_rtype='anonymous_chat_contact' then v_anon_session end,
     case when v_rtype='anonymous_chat_contact' then v_anon_contact end,
     p_message_id, p_message_id, 1, now())
  returning id into v_batch;
  return v_batch;   -- dispatcher가 notification_requested_at 있고 log 없는 배치를 집어 발송(§5)
exception when unique_violation then
  -- 동시 답변 경쟁: 다른 트랜잭션이 방금 배치를 만들었다 → 그 배치를 확장한다(§8-6).
  update public.chat_notification_batches
     set last_message_id=p_message_id, message_count=message_count+1, updated_at=now()
   where ticket_id=v_msg.support_ticket_id and acknowledged_at is null
     and ((v_rtype='patient' and recipient_patient_id=v_patient)
       or (v_rtype='anonymous_chat_contact' and recipient_anonymous_contact_id=v_anon_contact))
   returning id into v_batch;
  return v_batch;
end;
$$;

-- 사용자가 상담방을 확인하면 열린 배치를 닫는다(§8-7). 그 뒤 새 답변은 새 배치.
create or replace function acknowledge_chat_batches(p_thread_id uuid, p_reader_type text, p_reader_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.chat_notification_batches
     set acknowledged_at = now(), updated_at = now()
   where thread_id = p_thread_id and acknowledged_at is null
     and ((p_reader_type='patient' and recipient_patient_id = p_reader_id)
       or (p_reader_type='anonymous_web' and recipient_anonymous_session_id = p_reader_id));
end;
$$;

-- ── RLS (§7) ── 익명 표는 authenticated 직접 조회 금지(백엔드가 토큰 해시 검증 후 서비스 역할로 범위 반환).
alter table anonymous_chat_sessions enable row level security;
alter table anonymous_chat_contacts enable row level security;
alter table chat_notification_batches enable row level security;
-- grant/policy 없음: 익명 세션·연락처·배치는 서비스 역할(RLS 우회 함수)로만 접근. 직원 화면(Task 17~19)이
-- 필요로 하는 마스킹 표시는 서비스 계층이 만든다(§4.5·§7 — 로그·payload에 원문 연락처·토큰 해시 노출 금지).
```

- [ ] **Step 4: 마이그레이션 적용 → 스키마 테스트 통과** — Run: `supabase migration up && cd backend && pytest tests/test_anonymous_chat_schema.py -v` → Expected: PASS.

- [ ] **Step 5: Python 서비스 작성**

`backend/app/services/chat/anonymous_service.py`:
```python
import hashlib
from uuid import UUID

from app.db.pool import get_pool


def hash_token(raw_token: str) -> str:
    # 원문 토큰은 저장하지 않는다(§4.5). 백엔드만 원문을 받아 해시로 바꿔 넘긴다.
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def upsert_session(raw_token: str) -> dict:
    # 익명 위젯은 로그인 세션이 아니므로 서비스 역할 커넥션으로 처리한다(RLS 우회 함수).
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("select * from upsert_anonymous_session($1)", hash_token(raw_token))
        return dict(row)


async def record_verified_contact(session_id: UUID, ciphertext: str, phone_hash: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select * from record_verified_anonymous_contact($1, $2, $3)", session_id, ciphertext, phone_hash)
        return dict(row)
```

`backend/app/services/chat/notification_recipient.py`:
```python
from uuid import UUID

from app.db.pool import get_pool

# NotificationRecipient 계약(§5): 목적지 확인 adapter만 두 종류, 이후 파이프라인은 하나.
# 실제 발송·복호화·재시도는 공통 dispatcher(직원웹 T30 dispatch_service)가 이 반환값으로 수행한다.


async def resolve_recipient(batch_id: UUID) -> dict:
    """배치 하나를 발송 대상 계약으로 푼다. 등록 환자면 patient_id(기존 notify_patient 대상),
    익명이면 검증된 연락처 참조(ciphertext는 dispatcher가 복호화). patients 가짜 행·추측 매칭 금지(§5)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        b = await conn.fetchrow("select * from chat_notification_batches where id=$1", batch_id)
        if b["recipient_type"] == "patient":
            return {"recipient_type": "patient", "patient_id": b["recipient_patient_id"],
                    "channel_policy": "patient_channel", "message_class": "transactional"}
        c = await conn.fetchrow(
            "select id, contact_value_ciphertext from anonymous_chat_contacts where id=$1",
            b["recipient_anonymous_contact_id"])
        return {"recipient_type": "anonymous_chat_contact",
                "anonymous_session_id": b["recipient_anonymous_session_id"],
                "anonymous_contact_id": c["id"], "contact_ciphertext": c["contact_value_ciphertext"],
                "channel": "sms", "message_class": "transactional"}  # 익명 직원답변은 항상 sms·transactional(§5)
```

- [ ] **Step 6: 배칭 원자성 테스트 작성 (§8-6~9·11·12)**

`backend/tests/test_chat_notification_batching.py`:
```python
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread


async def _ticket(conn, thread_id):
    return await conn.fetchval("insert into support_tickets (thread_id, status) values ($1,'in_progress') returning id", thread_id)


async def _staff_msg(conn, thread_id, ticket_id, staff_id):
    return await conn.fetchval(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, sender_staff_id, "
        "message_type, content) values ($1,$2,'staff',$3,'text','답변') returning id", thread_id, ticket_id, staff_id)


@pytest.mark.asyncio
async def test_consecutive_replies_make_one_batch(db_conn):
    # §8-6. 연속 직원 답변 둘은 한 배치로 묶이고 알림은 한 번만 요청된다.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await _ticket(db_conn, t); st = await seed_staff(db_conn, role="doctor")
    b1 = await db_conn.fetchval("select enqueue_staff_reply_notification($1)",
                                await _staff_msg(db_conn, t, tk, st["staff_id"]))
    b2 = await db_conn.fetchval("select enqueue_staff_reply_notification($1)",
                                await _staff_msg(db_conn, t, tk, st["staff_id"]))
    assert b1 == b2
    row = await db_conn.fetchrow("select message_count, notification_requested_at from chat_notification_batches where id=$1", b1)
    assert row["message_count"] == 2 and row["notification_requested_at"] is not None
    assert await db_conn.fetchval("select count(*) from chat_notification_batches where ticket_id=$1", tk) == 1


@pytest.mark.asyncio
async def test_ack_then_new_reply_makes_new_batch(db_conn):
    # §8-7. 확인 뒤 새 답변은 이전 배치를 다시 열지 않고 새 배치.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await _ticket(db_conn, t); st = await seed_staff(db_conn, role="doctor")
    b1 = await db_conn.fetchval("select enqueue_staff_reply_notification($1)",
                                await _staff_msg(db_conn, t, tk, st["staff_id"]))
    await db_conn.execute("select acknowledge_chat_batches($1,'patient',$2)", t, p["patient_id"])
    b2 = await db_conn.fetchval("select enqueue_staff_reply_notification($1)",
                                await _staff_msg(db_conn, t, tk, st["staff_id"]))
    assert b2 is not None and b2 != b1


@pytest.mark.asyncio
async def test_viewing_makes_no_batch_and_marks_read(db_conn):
    # §8-8. 상담방을 보고 있으면 배치·알림 없이 즉시 읽음.
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await _ticket(db_conn, t); st = await seed_staff(db_conn, role="doctor")
    await db_conn.execute(
        "insert into chat_read_states (thread_id, reader_type, reader_patient_id, active_view_until) "
        "values ($1,'patient',$2,$3)", t, p["patient_id"], datetime.now(timezone.utc) + timedelta(seconds=30))
    m = await _staff_msg(db_conn, t, tk, st["staff_id"])
    b = await db_conn.fetchval("select enqueue_staff_reply_notification($1)", m)
    assert b is None
    assert await db_conn.fetchval("select count(*) from chat_notification_batches where ticket_id=$1", tk) == 0
    assert await db_conn.fetchval(
        "select last_read_message_id from chat_read_states where thread_id=$1 and reader_patient_id=$2",
        t, p["patient_id"]) == m


@pytest.mark.asyncio
async def test_anonymous_hash_matching_patient_does_not_link(db_conn):
    # §8-9. 익명 연락처 해시가 기존 환자 전화와 같아도 chat_thread.patient_id가 자동 연결되지 않는다.
    p = await seed_patient(db_conn, phone="010-5555-5555")
    sid = await db_conn.fetchval("insert into anonymous_chat_sessions (token_hash) values ($1) returning id", "h"+uuid.uuid4().hex)
    # 같은 번호 해시로 익명 연락처를 검증해도 익명 상담방은 여전히 patient_id=null.
    await db_conn.execute("select record_verified_anonymous_contact($1,'ENC','SAME-AS-PATIENT-HASH')", sid)
    t = await seed_chat_thread(db_conn, anonymous_session_id=sid)
    row = await db_conn.fetchrow("select owner_type, patient_id from chat_threads where id=$1", t)
    assert row["owner_type"] == "anonymous_web" and row["patient_id"] is None


@pytest.mark.asyncio
async def test_anonymous_verified_contact_gets_batch_with_null_patient(db_conn):
    # §8-11·12. patients 행·기기 토큰이 없는 익명도 검증 연락처로 배치가 생기고 patient_id=null.
    sid = await db_conn.fetchval("insert into anonymous_chat_sessions (token_hash) values ($1) returning id", "h"+uuid.uuid4().hex)
    await db_conn.execute("select record_verified_anonymous_contact($1,'ENC','PHASH')", sid)
    t = await seed_chat_thread(db_conn, anonymous_session_id=sid)
    tk = await _ticket(db_conn, t); st = await seed_staff(db_conn, role="doctor")
    b = await db_conn.fetchval("select enqueue_staff_reply_notification($1)",
                               await _staff_msg(db_conn, t, tk, st["staff_id"]))
    row = await db_conn.fetchrow("select recipient_type, recipient_patient_id, recipient_anonymous_contact_id from chat_notification_batches where id=$1", b)
    assert row["recipient_type"] == "anonymous_chat_contact"
    assert row["recipient_patient_id"] is None and row["recipient_anonymous_contact_id"] is not None
```

- [ ] **Step 7: 테스트 통과 확인** — Run: `cd backend && pytest tests/test_anonymous_chat_schema.py tests/test_chat_notification_batching.py -v` → Expected: PASS.

- [ ] **Step 8: 커밋**

```bash
git add supabase/migrations/00038_anonymous_chat_notifications.sql \
        backend/app/services/chat/anonymous_service.py backend/app/services/chat/notification_recipient.py \
        backend/tests/test_anonymous_chat_schema.py backend/tests/test_chat_notification_batching.py \
        docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 3 본문 — 익명 소유권(토큰해시·검증연락처)·수신자 추상화(NotificationRecipient)·알림 배칭 + §8 6~9·11·12. enqueue는 배치만·발송은 공통 dispatcher, 익명 해시=환자여도 자동연결 금지"
```

> **Task 3 완료 조건**: 익명 표·연락처·배치·notification_log 확장·FK 백필 초록불 · §8-6~9·11·12 테스트 통과 · enqueue가 `notification_log`에 직접 쓰지 않음(배치만) 확인 · 익명 해시가 환자와 같아도 `patient_id` 미연결 확인. coverage 불변, prefix-check 빚·미배정 0.

## Task 4: 근거 스냅샷 + 보존/파기 클래스 (`chat_message_sources` · `retention_classes`)

> **화면 규칙 0개.** 이 태스크가 **3-A 통합 스키마 공백 7건을 전부 닫는다**(1·2·6=T1 · 나머지 세션/티켓=T2 · 익명/배칭=T3 · **여기서 5·7**). 둘을 만든다: **① 답변 근거 스냅샷**(`chat_message_sources` — 봇 답변이 쓴 KB 조각의 당시 제목·본문·순서·유사도를 박제해, 지식이 재임베딩·수정돼도 과거 답변 근거가 깨지지 않음, 공백 5·SD-06) · **② 보존·파기 클래스**(`retention_classes` — 법정 강제 2개·병원 방침 4개를 구조로만, 실제 파기 배치는 법무 게이트라 BLOCKED, 공백 7·SD-09).
>
> **근거 원본**: 3A §4(공백 5 = 색인 line 441 ERD 권고 `chat_message_sources`)·§9(보존) · 정본 보존표 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:449-462`(6 클래스, 조사=`W-02-retention-research-2026-08-13.md`). SD-06·SD-09 = 색인 `SPECINDEX-ai-chatbot.md:190·193`.
>
> ⭐ **이 태스크의 설계 결정 2건(기각안 포함)**:
> 1. **`chat_message_sources.chunk_id`는 하드 FK가 아니라 소프트 참조(`uuid`, FK 없음).** 근거 스냅샷의 존재 이유가 바로 **조각이 재임베딩·삭제돼도 과거 답변 근거를 보존**하는 것이다(공백 5: 옛 `source_chunk_ids uuid[]`가 재생성 시 깨졌다). 하드 FK면 조각 삭제가 근거를 지우거나 삭제를 막는다. KB 조각표는 Task 7이 만들므로 **앞선 FK 문제도 함께 피한다**. *기각: `chunk_id`를 KB 조각 하드 FK로* — provenance가 조각 수명에 묶인다.
> 2. **보존은 구조(클래스 lookup + 태그 칼럼)만, 파기 배치는 BLOCKED.** 법정값(진료기록 10년·감사 2년)은 코드 강제로 **화면 설정칸을 만들지 않고**(직원이 줄이면 법 위반), 방침값 4개(기본 1년)는 DB 초기값. **실제 TTL 파기 배치는 법무 게이트**(직원웹 #14 보존기간과 **같은 법·같은 조사** — 의료법 시규 §15·안전성확보 §8 원문 재확인 공통). *기각: 전역 TTL 하나* — 6개 데이터군의 법정기간이 달라 한 값으로 묶으면 위법(정본 §4 「전역 TTL 금지」).

**Files:**
- Create: `supabase/migrations/00039_chat_sources_retention.sql`
- Create: `backend/tests/test_chat_sources_retention_schema.py`

**Interfaces:**
- Consumes: Task 1 `chat_messages`(봇 답변 메시지) · `acquire_as`·`db_conn`·`seed_patient`·`seed_staff`·`seed_chat_thread`
- Produces:
  - 표 `chat_message_sources(id, message_id FK chat_messages, chunk_id uuid 소프트, rank int, similarity numeric, title_snapshot text, body_snapshot text, created_at)` + 봇 메시지만 참조하는 트리거
  - 표 `retention_classes(id text pk, retention_period interval null, enforcement text, legal_basis text, notes text)` — 6 클래스 시드
  - `chat_messages.retention_class text references retention_classes(id) default 'consultation_message'` (재편입 시 `medical_record`로 재분류 = BLOCKED)
  - 근거·순위 조회 인덱스 `idx_message_sources_message`
- ⚠️ **아직 안 하는 것**: **클래스별 TTL 파기 배치**(법무 게이트·배포) · KB 조각표·재임베딩(Task 7) · 진료기록 편입 시 `medical_record` 재분류 잡(BLOCKED). Task 4는 **칸·클래스·스냅샷 구조만**.

- [ ] **Step 1: 실패하는 스키마 테스트 작성**

`backend/tests/test_chat_sources_retention_schema.py`:
```python
import uuid
import pytest
import asyncpg

from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread


async def _bot_msg(conn, thread_id):
    return await conn.fetchval(
        "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content) "
        "values ($1, $2, 'bot', 'text', '주차는 지하 1층입니다') returning id", thread_id, uuid.uuid4())


@pytest.mark.asyncio
async def test_source_stores_snapshot_and_soft_chunk_ref(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    m = await _bot_msg(db_conn, t)
    # chunk_id는 소프트 참조 — 존재하지 않는 uuid를 넣어도 FK 위반이 아니다(조각표는 Task 7).
    sid = await db_conn.fetchval(
        "insert into chat_message_sources (message_id, chunk_id, rank, similarity, title_snapshot, body_snapshot) "
        "values ($1,$2,1,0.87,'주차 안내','지하 1층 30분 무료') returning id", m, uuid.uuid4())
    row = await db_conn.fetchrow("select * from chat_message_sources where id=$1", sid)
    assert row["title_snapshot"] == "주차 안내" and row["rank"] == 1
    assert float(row["similarity"]) == pytest.approx(0.87)


@pytest.mark.asyncio
async def test_source_must_reference_bot_message(db_conn):
    p = await seed_patient(db_conn)
    st = await seed_staff(db_conn, role="doctor")
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    tk = await db_conn.fetchval("insert into support_tickets (thread_id) values ($1) returning id", t)
    staff_m = await db_conn.fetchval(
        "insert into chat_messages (thread_id, support_ticket_id, sender_type, sender_staff_id, "
        "message_type, content) values ($1,$2,'staff',$3,'text','직원 답변') returning id", t, tk, st["staff_id"])
    # 근거는 봇 답변에만 붙는다. 직원 메시지에 붙이면 트리거가 막는다.
    with pytest.raises(asyncpg.exceptions.RaiseError):
        await db_conn.execute(
            "insert into chat_message_sources (message_id, rank, title_snapshot, body_snapshot) "
            "values ($1,1,'x','y')", staff_m)


@pytest.mark.asyncio
async def test_retention_classes_seeded(db_conn):
    n = await db_conn.fetchval("select count(*) from retention_classes")
    assert n == 6
    med = await db_conn.fetchrow("select * from retention_classes where id='medical_record'")
    assert med["enforcement"] == "code_forced"
    assert med["retention_period"].days >= 3650  # 10년 = 코드 강제(의료법 시규 §15)
    cons = await db_conn.fetchrow("select * from retention_classes where id='consultation_message'")
    assert cons["enforcement"] == "policy_default"  # 방침값(법정 없음, 기본 1년)


@pytest.mark.asyncio
async def test_chat_message_defaults_to_consultation_retention(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    m = await _bot_msg(db_conn, t)
    assert await db_conn.fetchval(
        "select retention_class from chat_messages where id=$1", m) == "consultation_message"
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `cd backend && pytest tests/test_chat_sources_retention_schema.py -v` → Expected: FAIL(`relation "chat_message_sources" does not exist`).

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/00039_chat_sources_retention.sql`:
```sql
-- 3-A 통합 대화 스키마 ④ 답변 근거 스냅샷 + 보존/파기 클래스 (공백 5·7, SD-06·09).
-- ⚠️ 번호(예시 00039)는 적용 시점에 확정.

-- ── chat_message_sources: 봇 답변이 쓴 KB 조각의 당시 스냅샷 (공백 5) ──
-- chunk_id는 소프트 참조(하드 FK 아님) — 조각이 재임베딩·삭제돼도 스냅샷은 남아야 한다(설계결정 1).
create table chat_message_sources (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id),  -- 근거가 붙는 봇 답변 메시지
  chunk_id uuid,                                          -- KB 조각 조회 편의용 소프트 참조(조각표=Task 7)
  rank int not null,                                      -- 당시 검색 순위
  similarity numeric,                                     -- 당시 유사도 점수
  title_snapshot text,                                    -- 답변 당시 조각 제목(문구 수정 뒤에도 보존)
  body_snapshot text,                                     -- 답변 당시 조각 본문
  created_at timestamptz not null default now()
);
create index idx_message_sources_message on chat_message_sources (message_id, rank);

-- 근거는 봇 답변에만 붙는다(직원·환자·시스템 메시지엔 금지).
create or replace function validate_source_is_bot_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sender text;
begin
  select sender_type into v_sender from public.chat_messages where id = new.message_id;
  if v_sender is distinct from 'bot' then
    raise exception '답변 근거는 봇 답변 메시지에만 붙일 수 있습니다.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_validate_source_is_bot_message
  before insert on chat_message_sources for each row execute function validate_source_is_bot_message();

-- ── retention_classes: 보존·파기 클래스 (공백 7, SD-09) ──
-- 전역 TTL 금지 → 6 클래스 분리(정본 §4). 법정값=코드 강제(설정칸 없음), 방침값=DB 기본 1년.
-- ⚠️ 실제 클래스별 TTL 파기 배치는 법무 게이트라 BLOCKED — 이 표는 구조·값 기록만(설계결정 2).
create table retention_classes (
  id text primary key,
  retention_period interval,                              -- null = "원 데이터와 동일"(pseudonymous)
  enforcement text not null check (enforcement in ('code_forced', 'policy_default')),
  legal_basis text,
  notes text
);
insert into retention_classes (id, retention_period, enforcement, legal_basis, notes) values
  ('medical_record',            interval '10 years', 'code_forced',
     '의료법 시행규칙 §15', '진료기록 편입분. 직원이 줄일 수 없음(설정칸 없음)'),
  ('access_audit',              interval '2 years',  'code_forced',
     '개인정보 안전성 확보조치 기준 §8', '직원 감사로그(민감정보 시스템)'),
  ('pseudonymous_or_tokenized', null,                'code_forced',
     '개인정보보호법 §58의2', '암호화 전화·재식별 토큰. 원 데이터 파기 시 함께'),
  ('appointment_operation',     interval '1 year',   'policy_default',
     null, '비진료 예약·운영. 법정 없음 — 병원 처리방침으로 조정'),
  ('consultation_message',      interval '1 year',   'policy_default',
     null, '상담·챗봇. 진료 편입분은 medical_record로 이관/복제(BLOCKED)'),
  ('notification_delivery',     interval '1 year',   'policy_default',
     null, '발송로그. 본문 미저장/최소화');

-- 상담 데이터군의 기본 클래스 태그. 진료기록 편입 시 medical_record 재분류 잡은 BLOCKED(법무·배포).
alter table chat_messages
  add column retention_class text not null default 'consultation_message'
    references retention_classes(id);
-- 익명 연락처(암호화 전화)는 pseudonymous_or_tokenized 군, 발송로그는 notification_delivery 군 —
-- 태그 칼럼을 표마다 늘리지 않고 표↔클래스 매핑을 파기 배치(BLOCKED)가 코드로 안다. 여기선 문서화만.
```

- [ ] **Step 4: 마이그레이션 적용 → 테스트 통과** — Run: `supabase migration up && cd backend && pytest tests/test_chat_sources_retention_schema.py -v` → Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/00039_chat_sources_retention.sql \
        backend/tests/test_chat_sources_retention_schema.py docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 4 본문 — 근거 스냅샷(chat_message_sources 소프트 chunk참조)·보존 클래스(retention_classes 6종·파기 배치 BLOCKED). 공백 7건 전부 닫힘(SD-06·09)"
```

> **Task 4 완료 조건**: 근거 스냅샷·6 보존 클래스·`retention_class` 태그 초록불 · `chunk_id`가 하드 FK 아님(없는 uuid 삽입 성공) 확인 · 근거가 봇 메시지에만 붙음 확인 · 파기 배치는 미생성(BLOCKED) 확인. ⭐ **3-A 통합 스키마 공백 7건 전부 닫힘**(T1~T4). coverage 불변, prefix-check 빚·미배정 0.

## Task 5: 오케스트레이션 3갈래 체인 (응급 → 인계 감시 6조건 → 라우터 + 문진 state · 만료 요약 · CHAT-LEN)

> **화면 규칙 0개.** 이 태스크가 상담봇의 **두뇌 골격**을 만든다. 매 환자 메시지는 반드시 **⓪ 응급 표현 검사(규칙 기반·결정적·AI 호출 없음) → ① 인계 감시(6조건, 항상 동작) → ② 라우터(안내형 RAG / 진료과 추천형 문진 / 행동형 에이전트)** 순으로 통과한다. 어느 갈래에 있든 인계 감시가 조건을 감지하면 **무조건 인계**로 전환한다(인계는 「에이전트가 고르는 도구」가 아니다). 실제 갈래 알맹이(RAG 검색=Task 7·에이전트 도구=Task 6)는 **주입식 셸**로 두고, 여기선 결정적 오케스트레이션(응급·6조건·라우팅·문진 state·**예약 중 제한모드**·만료 요약·**CHAT-LEN 한도**)을 소유한다.
>
> **근거 원본**: 옛 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:7,18,30`(3단계 파이프라인)·`:566-580`(인계 reason 6조건)·`:140-168`(route_taken·문진 state)·`:1535-1560`(SAFETY_RULES 5.3·문진 STEP)·`:2429-2441`(watchdog 계약) · 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5319`(MR2-08) · 정본 §0(제한모드·응급 항상 작동)·§1-3.
>
> ⭐ **이 태스크가 닫는 미결(발판 → 여기서 확정)**:
> - **MR2-08 대화 길이 한도** — CHAT-LEN 넛지(UX)는 화면(Task 10)이 그리고, **엔진 결정 = 소프트 넛지 + 롤링 요약**: 최근 `CHAT_CONTEXT_TURN_WINDOW=12`턴은 원문 그대로 LLM에 주고 그보다 오래된 것은 요약(이어가기 요약 인프라 재사용), `CHAT_NUDGE_MESSAGE_COUNT=40`에서 소프트 넛지 신호. *기각: 하드 컷 즉시차단*(대화를 예고 없이 끊어 사용자가 이어갈 선택지를 잃음, MR2-08). *기각: 절단(truncate)*(오래된 맥락을 통째로 버려 답이 어긋남) — 요약이 맥락을 보존한다. ⚠️ 구체 숫자는 KB 검색 임계값처럼 **운영 튜닝 대상**(상수로 두고 근거 주석).
>
> ⭐ **설계 결정(기각안 포함)**: **오케스트레이션 state는 `ai_chat_sessions`에 못박는다**(`active_flow`·`flow_step`·`flow_collected`) — 문진(department_guide) 진행 중 매 턴 라우터로 재분류하면 **중간 답변이 다른 갈래로 샌다**(옛 플랜 `:146`). `route_taken`은 봇 메시지(`chat_messages`)에 남겨 복원·통계에 쓴다. *기각: 대화 이력에서 매번 재구성* — 재분류 누수와 같은 문제.

**Files:**
- Create: `supabase/migrations/00040_chat_orchestration_state.sql`
- Create: `backend/app/services/chat/safety_watchdog.py` · `backend/app/services/chat/department_guide_chain.py` · `backend/app/services/chat/chat_router.py` · `backend/app/services/chat/orchestrator.py`
- Create: `backend/tests/test_safety_watchdog.py` · `backend/tests/test_chat_router.py` · `backend/tests/test_orchestrator.py`

**Interfaces:**
- Consumes: Task 0 `get_chat_model`(모킹 주입) · Task 1·2 `ai_chat_sessions`·`chat_messages`·`create_support_ticket`(인계 티켓)·`record_ai_activity` · `AppError`·`acquire_as`·`get_pool`
- Produces (뒤 태스크가 소비할 이름):
  - `ai_chat_sessions`에 `active_flow text check ('department_guide')`·`flow_step int default 0`·`flow_collected jsonb default '{}'` · `chat_messages`에 `route_taken text check ('emergency','rag','department_guide','agent','handoff')`
  - `safety_watchdog.check_emergency(text) -> bool`(규칙 기반·AI 없음)·`EMERGENCY_REPLY: str`·`check_repeated(history, current, threshold=3) -> bool`·`check_escalation(text, history, *, unhelpful_flagged, no_answer, model=None) -> str | None`(6종 reason 또는 None)
  - `department_guide_chain.SAFETY_RULES: str`(진단·처방 금지 5.3)·`STEP_INSTRUCTIONS: dict`·`ask_next_question(history, step, model=None) -> str`·`advance_flow(session_id, collected_update) -> dict`
  - `chat_router.classify(text, *, active_flow=None, model=None) -> str`(`active_flow` 있으면 재분류 없이 그 갈래 유지)
  - `orchestrator.orchestrate(session, message, *, restricted=False, rag_fn=None, agent_fn=None, model=None) -> dict`(`{route_taken, reply|card|handoff_reason, escalated}`) · 상수 `CHAT_CONTEXT_TURN_WINDOW=12`·`CHAT_NUDGE_MESSAGE_COUNT=40`·`should_nudge_length(message_count) -> bool` · `make_closing_summary(session, model=None) -> str`
- ⚠️ **주입식(여기서 만들지 않음)**: RAG 검색 `rag_fn`=Task 7 · 에이전트 도구·카드 `agent_fn`=Task 6 · 제한모드 `restricted=True` 배선(앱 `DeptBotSheet`)=Task 6. Task 5는 골격과 결정적 로직만.
- ⚠️ **아직 안 하는 것**: `route_taken` 등 완전 화면 규칙(`CHAT-URGENT`·`CHAT-HANDOFF`·`CHAT-LEN` 계열)은 Task 10·11이 담는다 — 여기서 완전 ID로 쓰면 ⏰.

- [ ] **Step 1: 마이그레이션 — 오케스트레이션 state**

`supabase/migrations/00040_chat_orchestration_state.sql`:
```sql
-- 3-A 오케스트레이션 state (설계결정): 문진 진행을 세션에 못박아 재분류 누수를 막는다. route는 메시지에 기록.
alter table ai_chat_sessions
  add column active_flow text check (active_flow in ('department_guide')),
  add column flow_step int not null default 0,
  add column flow_collected jsonb not null default '{}'::jsonb;
alter table chat_messages
  add column route_taken text check (route_taken in ('emergency', 'rag', 'department_guide', 'agent', 'handoff'));
```
적용: `supabase migration up`.

- [ ] **Step 2: 실패하는 응급·감시 테스트 작성**

`backend/tests/test_safety_watchdog.py`:
```python
import pytest

from app.services.chat.safety_watchdog import (
    check_emergency, EMERGENCY_REPLY, check_repeated, check_escalation)


def test_emergency_is_rule_based_and_deterministic():
    # AI 호출 없이 키워드로 결정적으로 잡는다(정본 §0·옛 플랜 :30).
    assert check_emergency("숨을 못 쉬겠어요") is True
    assert check_emergency("의식이 없어요 119") is True
    assert check_emergency("가슴이 너무 아파요") is True
    assert check_emergency("주차 어디에 하나요") is False


def test_emergency_reply_points_to_119():
    assert "119" in EMERGENCY_REPLY and "응급" in EMERGENCY_REPLY


def test_repeated_triggers_at_threshold():
    hist = ["보험 되나요", "보험 되나요", "다른 얘기"]
    assert check_repeated(hist, "보험 되나요", threshold=3) is True   # 같은 질문 3번째
    assert check_repeated(["보험 되나요"], "주차", threshold=3) is False


@pytest.mark.asyncio
async def test_escalation_deterministic_paths_need_no_model():
    # 명시 플래그·검색 실패·반복은 AI 없이 결정된다.
    assert await check_escalation("아무 말", [], unhelpful_flagged=True) == "unhelpful"
    assert await check_escalation("아무 말", [], no_answer=True) == "no_answer"
    assert await check_escalation("보험", ["보험", "보험"], no_answer=False) == "repeated"


@pytest.mark.asyncio
async def test_escalation_llm_judged_uses_injected_model():
    # medical_judgment/complaint/data_mismatch는 주입 모델이 라벨을 준다(없으면 None).
    class FakeModel:
        async def ainvoke(self, _):
            class R: content = "complaint"
            return R()
    assert await check_escalation("접수원이 불친절했어요", [], model=FakeModel()) == "complaint"

    class NoneModel:
        async def ainvoke(self, _):
            class R: content = "none"
            return R()
    assert await check_escalation("진료시간 알려줘", [], model=NoneModel()) is None
```

- [ ] **Step 3: watchdog 구현**

`backend/app/services/chat/safety_watchdog.py`:
```python
# ⓪ 응급 검사 + ① 인계 감시. 응급은 규칙 기반(결정적) — AI 확률 판단에 안전을 맡기지 않는다(옛 플랜 :30, 정본 §0).
from app.core.config import settings
from app.integrations.langchain_client import get_chat_model

# 병원과 함께 다듬는 큐레이션 목록(확장 가능). 오탐보다 미탐이 위험하므로 넓게 잡는다.
EMERGENCY_KEYWORDS = [
    "119", "응급실", "의식이 없", "숨을 못", "숨이 안", "호흡곤란", "가슴이 아", "가슴 통증",
    "피를 많이", "출혈이 멈", "쓰러졌", "경련", "발작", "자살", "죽고 싶", "심장이", "마비",
]
EMERGENCY_REPLY = (
    "지금 위급한 상황일 수 있어요. 즉시 119에 전화하거나 가까운 응급실로 가 주세요. "
    "이 상담은 응급 진료를 대신할 수 없습니다."
)

# 6가지 인계 조건 = support_tickets 생성 사유(late_cancellation은 도구가 별도 생성).
LLM_ESCALATION_LABELS = {"medical_judgment", "data_mismatch", "complaint"}


def check_emergency(text: str) -> bool:
    t = text.replace(" ", "")
    return any(k.replace(" ", "") in t for k in EMERGENCY_KEYWORDS)


def check_repeated(history_texts: list[str], current: str, threshold: int = 3) -> bool:
    same = sum(1 for h in history_texts if h.strip() == current.strip()) + 1
    return same >= threshold


async def check_escalation(text, history_texts, *, unhelpful_flagged=False,
                           no_answer=False, model=None) -> str | None:
    # 결정적 조건 먼저(AI 불필요).
    if unhelpful_flagged:
        return "unhelpful"
    if no_answer:
        return "no_answer"
    if check_repeated(history_texts, text):
        return "repeated"
    # AI 판단 조건: 의료판단 필요 / 정보 불일치 주장 / 불만. 아니면 None.
    llm = model or get_chat_model()
    from langchain_core.prompts import ChatPromptTemplate
    prompt = ChatPromptTemplate.from_messages([
        ("system", "환자 메시지를 다음 중 하나로만 분류하세요: "
                   "medical_judgment(진단·치료 판단 요구), data_mismatch(안내가 틀렸다는 주장), "
                   "complaint(불만·항의), none(해당 없음). 한 단어만 답하세요."),
        ("human", "{text}"),
    ])
    resp = await (prompt | llm).ainvoke({"text": text})
    label = getattr(resp, "content", str(resp)).strip()
    return label if label in LLM_ESCALATION_LABELS else None
```

- [ ] **Step 4: 라우터 + 문진 체인 + 오케스트레이터 구현**

`backend/app/services/chat/department_guide_chain.py`:
```python
# 진료과 추천형(문진 체인) — RAG/에이전트보다 강한 안전 규칙(요구사항 5.3).
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from app.integrations.langchain_client import get_chat_model

SAFETY_RULES = """[절대 규칙 — 위반 금지]
- 병명을 진단하지 마세요. "OO병으로 보입니다"처럼 확정적으로 말하지 마세요.
- 약이나 치료법을 추천하지 마세요.
- 가능한 진료과를 안내하되 최종 선택은 환자가 확인한다고 안내하세요."""

STEP_INSTRUCTIONS = {
    0: "환자가 방금 불편한 증상을 말했습니다. 공감 한 문장 후, 증상이 언제부터 시작됐는지 물어보세요.",
    1: "시작 시점을 들었습니다. 공감 한 문장 후, 다른 동반 증상이 있는지 물어보세요.",
    2: "동반 증상까지 들었습니다. 지금까지 들은 내용을 한 문장으로 요약하고, 방문 목적을 물어보세요.",
}


async def ask_next_question(history_text: str, step: int, model=None) -> str:
    instruction = STEP_INSTRUCTIONS.get(step, STEP_INSTRUCTIONS[2])
    prompt = ChatPromptTemplate.from_messages([
        ("system", "당신은 병원의 AI 상담봇입니다. 진료과 선택을 돕는 문진 중입니다.\n" + SAFETY_RULES),
        ("human", "지금까지 대화:\n{history}\n\n이번 단계 지시: {step_instruction}"),
    ])
    chain = prompt | (model or get_chat_model()) | StrOutputParser()
    return await chain.ainvoke({"history": history_text, "step_instruction": instruction})
```

`backend/app/services/chat/chat_router.py`:
```python
# ② 라우터. active_flow가 있으면 재분류하지 않고 그 갈래를 유지한다(중간 답변 누수 방지, 옛 플랜 :146).
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model

ROUTES = {"rag", "department_guide", "agent"}


async def classify(text: str, *, active_flow: str | None = None, model=None) -> str:
    if active_flow == "department_guide":
        return "department_guide"      # 진행 중 문진은 재분류 금지
    prompt = ChatPromptTemplate.from_messages([
        ("system", "환자 메시지를 다음 중 하나로만 분류하세요: "
                   "rag(병원 정보 안내), department_guide(어느 과에 가야 하는지 증상 상담), "
                   "agent(예약·취소·문진 등 행동). 한 단어만 답하세요."),
        ("human", "{text}"),
    ])
    resp = await (prompt | (model or get_chat_model())).ainvoke({"text": text})
    label = getattr(resp, "content", str(resp)).strip()
    return label if label in ROUTES else "rag"    # 불명확하면 안전한 안내형
```

`backend/app/services/chat/orchestrator.py`:
```python
# 매 메시지 파이프라인: ⓪응급 → ①인계감시 → ②라우터 → 갈래 실행. 인계 조건은 어느 갈래든 우선한다.
from app.services.chat import safety_watchdog, chat_router, department_guide_chain

CHAT_CONTEXT_TURN_WINDOW = 12     # 최근 N턴은 원문, 그 앞은 요약(MR2-08 — 절단 아님)
CHAT_NUDGE_MESSAGE_COUNT = 40     # 이 이상이면 CHAT-LEN 소프트 넛지 신호(하드컷 아님)


def should_nudge_length(message_count: int) -> bool:
    return message_count >= CHAT_NUDGE_MESSAGE_COUNT


async def orchestrate(session, message, *, history_texts=None, restricted=False,
                      unhelpful_flagged=False, rag_fn=None, agent_fn=None, model=None) -> dict:
    history_texts = history_texts or []
    # ⓪ 응급 — 모드·갈래와 무관하게 항상 최우선(정본 §0).
    if safety_watchdog.check_emergency(message):
        return {"route_taken": "emergency", "reply": safety_watchdog.EMERGENCY_REPLY, "escalated": False}
    # ① 인계 감시 — 조건 감지 시 무조건 인계(에이전트 도구 아님).
    reason = await safety_watchdog.check_escalation(
        message, history_texts, unhelpful_flagged=unhelpful_flagged,
        no_answer=False, model=model)
    if reason:
        return {"route_taken": "handoff", "handoff_reason": reason, "escalated": True}
    # ② 라우터 — 진행 중 문진은 유지.
    active_flow = getattr(session, "active_flow", None) if not restricted else None
    route = await chat_router.classify(message, active_flow=active_flow, model=model)
    # 제한모드(예약 중 상담): 정보성 안내·진료과 추천만. 행동형 금지, 유일 출구는 "○○과로 계속하기"(E4·정본 §0).
    if restricted and route == "agent":
        route = "rag"
    if route == "department_guide":
        reply = await department_guide_chain.ask_next_question(
            "\n".join(history_texts), getattr(session, "flow_step", 0), model=model)
        return {"route_taken": "department_guide", "reply": reply, "escalated": False}
    if route == "agent":
        # 행동형 도구·카드는 Task 6이 주입. no_answer면 인계로 되돌린다.
        if agent_fn is None:
            return {"route_taken": "agent", "reply": None, "escalated": False}
        return {"route_taken": "agent", **(await agent_fn(session, message))}
    # 안내형 RAG — 검색은 Task 7이 주입. 검색 실패는 no_answer 인계로.
    if rag_fn is None:
        return {"route_taken": "rag", "reply": None, "escalated": False}
    result = await rag_fn(session, message)
    if result.get("no_answer"):
        return {"route_taken": "handoff", "handoff_reason": "no_answer", "escalated": True}
    return {"route_taken": "rag", **result}
```

- [ ] **Step 5: 라우터·오케스트레이터 테스트 작성**

`backend/tests/test_chat_router.py`:
```python
import pytest

from app.services.chat.chat_router import classify


class _Model:
    def __init__(self, label): self._label = label
    async def ainvoke(self, _):
        class R: content = self._label
        return R()


@pytest.mark.asyncio
async def test_active_flow_is_not_reclassified():
    # 진행 중 문진은 라우터를 타지 않는다(누수 방지).
    assert await classify("갑자기 예약하고 싶어요", active_flow="department_guide", model=_Model("agent")) == "department_guide"


@pytest.mark.asyncio
async def test_unknown_label_falls_back_to_rag():
    assert await classify("음", model=_Model("weird")) == "rag"
```

`backend/tests/test_orchestrator.py`:
```python
import pytest
from types import SimpleNamespace

from app.services.chat import orchestrator
from app.services.chat.chat_router import classify as _real_classify


class _Model:
    def __init__(self, label): self._label = label
    async def ainvoke(self, _):
        class R: content = self._label
        return R()


@pytest.mark.asyncio
async def test_emergency_wins_even_in_restricted_mode():
    # 제한모드여도 응급 안전 안내는 항상 작동(정본 §0).
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "숨을 못 쉬겠어요", restricted=True)
    assert out["route_taken"] == "emergency" and "119" in out["reply"]


@pytest.mark.asyncio
async def test_handoff_condition_beats_routing():
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "답이 도움이 안 됐어요", unhelpful_flagged=True)
    assert out["route_taken"] == "handoff" and out["handoff_reason"] == "unhelpful" and out["escalated"]


@pytest.mark.asyncio
async def test_restricted_mode_downgrades_agent_to_rag():
    # 예약 중 상담: 행동형 금지 → 안내형으로. rag_fn 주입.
    async def rag_fn(s, m): return {"reply": "주차는 지하 1층입니다", "no_answer": False}
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "예약 잡아줘", restricted=True, rag_fn=rag_fn, model=_Model("agent"))
    assert out["route_taken"] == "rag" and "주차" in out["reply"]


@pytest.mark.asyncio
async def test_rag_no_answer_becomes_handoff():
    async def rag_fn(s, m): return {"no_answer": True}
    out = await orchestrator.orchestrate(SimpleNamespace(active_flow=None, flow_step=0),
                                         "우리 동네 약국 어디", rag_fn=rag_fn, model=_Model("rag"))
    assert out["route_taken"] == "handoff" and out["handoff_reason"] == "no_answer"


def test_length_nudge_threshold():
    assert orchestrator.should_nudge_length(40) is True
    assert orchestrator.should_nudge_length(39) is False
```

- [ ] **Step 6: 테스트 통과 확인** — Run: `cd backend && pytest tests/test_safety_watchdog.py tests/test_chat_router.py tests/test_orchestrator.py -v` → Expected: PASS(전체 초록불, LLM은 전부 모킹).

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/00040_chat_orchestration_state.sql backend/app/services/chat/ \
        backend/tests/test_safety_watchdog.py backend/tests/test_chat_router.py \
        backend/tests/test_orchestrator.py docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 5 본문 — 오케스트레이션 3갈래(응급 결정적필터→인계감시 6조건→라우터) + 문진 state·제한모드·CHAT-LEN 롤링요약(하드컷 기각). LLM 갈래는 주입식 셸, 결정적 로직에 테스트 집중"
```

> **Task 5 완료 조건**: 응급(결정적·AI없음)·6조건 감시·라우터(문진 유지)·제한모드(행동형→안내형·응급 항상)·CHAT-LEN 넛지 초록불 · 오케스트레이션 state 칼럼 추가 확인 · RAG/에이전트는 주입식(Task 6·7 채움) 확인. MR2-08 미결 닫힘(요약·기각 하드컷). coverage 불변, prefix-check 빚·미배정 0·⏰0.

## Task 6: 카드·도구 계약 (payload 스키마 · 방문이유 · quick_replies · 예약 중 제한모드)

> **화면 규칙 0개.** 이 태스크는 상담봇이 대화 피드에 보내는 **카드 8종의 서버 계약**을 만든다: 어떤 데이터(payload)를 담고, 앱의 어떤 판단·상태·문구를 **재현**하는지. Task 5 오케스트레이터의 행동형 갈래(`agent_fn`)가 여기서 만든 카드를 방출한다. 화면 규칙(`CCARD-*` 계열)은 Task 12·13이 담으므로 **여기서 완전 ID를 쓰지 않는다**(⏰ 회피) — Task 6은 payload·빌더·생성 규칙이라는 **서버 계약**만.
>
> **근거 원본**: 카드 계약 정본 `docs/design/chatbot-card-catalog.md`(8종 상태·버튼 표) · 정본 §2(카드↔규칙 재현 매핑) · 결정로그 R2-1(**채팅 전용 카드 형태** — 넓은 세로+윗꼬리표, 앱 레이아웃 복사 아님)·L816-833(quick_replies)·#8(방문이유)·E4(제한모드).
>
> ⭐ **이 태스크의 설계 결정 3건(기각안 포함)**:
> 1. **카드는 표시 스냅샷이지 실행의 진실이 아니다.** `[예약 신청하기]`는 환자앱 `create_booking`(멱등 `request_id`·서버가 `list_bookable_slots`로 슬롯 재검증·`BOOK-RACE` 409 처리)을 부른다. 카드 payload의 `department_id·doctor_id·slot_id`를 위변조해도 **서버가 다시 검증**한다. *기각: 옛 `chat_booking_cards` 위변조 방지표* — `create_booking`이 이미 서버 재검증하므로 중복(카탈로그 §1 원칙 5·정본 §0 「자체 계산 금지」).
> 2. **카드 형태는 채팅 전용(R2-1)** — 넓은 세로 + 상단 윗꼬리표 + 강조 테두리로 일반 봇 말풍선과 구분. **앱 전체화면 레이아웃 복사가 아니다.** 앱에서 가져오는 것은 **판단·상태·문구·실행 결과(규칙)** 뿐이다. *기각: 앱 카드 레이아웃 그대로 복사*(R2-1 정면충돌) · *기각: 의료 안내 아이콘·좌측 바 임의 도입*(R2-1 기각안). 픽셀 세부(여백·열 수)는 목업 몫(플랜 미결 아님).
> 3. **`card_type` 어휘는 서비스 층(빌더)이 강제하고 DB payload는 자유 jsonb 유지**(T1 결정). quick_replies·system은 카드와 payload 모양이 달라 DB에 한 스키마를 못 박으면 셋을 다 담을 수 없다. *기각: payload에 카드별 CHECK* — 유형마다 모양이 달라 제약이 비대해지고 T6 어휘 변경마다 마이그레이션.

**Files:**
- Create: `backend/app/services/chat/card_builder.py` · `backend/app/services/chat/quick_replies.py` · `backend/app/services/chat/restricted_mode.py`
- Create: `backend/tests/test_card_builder.py` · `backend/tests/test_quick_replies.py` · `backend/tests/test_restricted_mode.py`

**Interfaces:**
- Consumes: 환자앱(3단계) `patient_booking_service.create_booking`·`catalog_service.list_bookable_slots`·`appointment_query_service.get_appointment_detail`·문진 상태(진행률·state) — 카드는 **소비만**(자체 계산 금지) · Task 5 `orchestrator`(행동형 `agent_fn`가 빌더 호출) · Task 0 `get_chat_model`(quick_replies 대화중 생성, 모킹)
- Produces (뒤 태스크가 소비할 이름):
  - `card_builder.CARD_TYPES`(8종: `time_select`·`booking_confirm`·`booking_done`·`cancel_confirm`·`cancel_done`·`cancel_reject`·`questionnaire`·`quick_replies`) · payload 스키마(각 카드가 담는 key) · 빌더 `build_time_select_card`·`build_booking_confirm_card`·`build_booking_done_card`·`build_cancel_confirm_card`·`build_questionnaire_card`(패턴 동일한 나머지 포함) · `validate_card_payload(payload) -> None`
  - `card_builder.collect_visit_reason(text) -> str`(방문이유 ≤100자 선택입력, 문진 첫 문항 초기값 — #8·`BOOK-WHY` 재현) · `BOOKING_CONFIRM_BUTTON = "예약 신청하기"`(설정과 무관 고정)
  - `quick_replies.START_WITH_UPCOMING`·`START_NO_UPCOMING`(고정 4개씩) · `build_start_quick_replies(has_upcoming) -> list[str]`(AI 없음) · `generate_conversational(last_question, model=None) -> list[str]`(AI 3~4개, 진단·처방 금지, 성공 때만)
  - `restricted_mode.ALLOWED_CARD_TYPES_RESTRICTED`(공집합 — 행동형 카드 전부 금지) · `assert_card_allowed(card_type, restricted)` · `CONTINUE_TO_DEPARTMENT_LABEL`(`"○○과로 계속하기"` 형식 — 유일 행동 출구)
- ⚠️ **아직 안 하는 것**: 카드 **화면 렌더·완전 규칙**(`CCARD-*` 계열)=Task 12·13 · 제한모드 시트 UI(`DeptBotSheet`)=환자앱 T20이 이 엔진 주입 · 실제 예약 실행=환자앱 `create_booking`(카드는 호출만).

- [ ] **Step 1: 실패하는 카드 빌더 테스트 작성**

`backend/tests/test_card_builder.py`:
```python
import pytest

from app.services.chat import card_builder as cb


def test_booking_confirm_button_is_fixed_regardless_of_settings():
    # 버튼 문구는 auto_confirm 설정과 무관하게 "예약 신청하기"로 통일(카탈로그 §2 상태1).
    assert cb.BOOKING_CONFIRM_BUTTON == "예약 신청하기"


def test_booking_confirm_card_shows_relation_and_optional_reason():
    card = cb.build_booking_confirm_card(
        for_patient_id="p1", patient_name="김OO", relation="어머니",
        department_name="내과", doctor_name="이의사", slot_at="2026-08-20T14:00:00+09:00",
        visit_reason="두통")
    assert card["card_type"] == "booking_confirm"
    assert card["relation"] == "어머니" and card["visit_reason"] == "두통"
    assert card["button"] == "예약 신청하기"


def test_booking_confirm_does_not_invent_empty_reason():
    # 방문이유가 비면 없는 값을 만들어 채우지 않는다(카탈로그 §2 정합성).
    card = cb.build_booking_confirm_card(
        for_patient_id="p1", patient_name="김OO", relation=None,
        department_name="내과", doctor_name="이의사", slot_at="2026-08-20T14:00:00+09:00",
        visit_reason=None)
    assert card["visit_reason"] is None


def test_visit_reason_capped_at_100_chars():
    # BOOK-WHY: 최대 100자 선택 입력(#8).
    assert len(cb.collect_visit_reason("가" * 200)) == 100
    assert cb.collect_visit_reason("   ") == ""   # 공백만이면 빈 값(선택 입력)


def test_booking_done_distinguishes_apply_vs_confirm():
    applied = cb.build_booking_done_card(status="예약신청", number="A-123")
    confirmed = cb.build_booking_done_card(status="예약확정", number="R-777")
    assert applied["number_label"] == "신청번호" and confirmed["number_label"] == "예약번호"
    assert applied["headline"] != confirmed["headline"]


def test_booking_done_zero_questionnaire_has_no_button():
    # 0문항이면 [사전문진 작성하기] 버튼·(0/0)·독립 문진 카드를 만들지 않는다(카탈로그 §3 상태4).
    card = cb.build_booking_done_card(status="예약확정", number="R-1", question_count=0)
    assert card["questionnaire_button"] is None
    assert card["questionnaire_note"] == "작성할 문진이 없습니다"


def test_questionnaire_card_uses_server_progress_not_recomputed():
    # 진행률은 서버 계산값을 그대로 담는다(자체 계산 금지, QNR-PROG 재현).
    card = cb.build_questionnaire_card(state="작성중", answered=3, total=8)
    assert card["answered"] == 3 and card["total"] == 8 and card["state"] == "작성중"


def test_validate_rejects_unknown_card_type():
    with pytest.raises(ValueError):
        cb.validate_card_payload({"card_type": "made_up"})
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `cd backend && pytest tests/test_card_builder.py -v` → Expected: FAIL(`No module named ...card_builder`).

- [ ] **Step 3: 카드 빌더 구현**

`backend/app/services/chat/card_builder.py`:
```python
# 상담봇 채팅 카드의 서버 계약. 카드는 앱의 판단·상태·문구를 재현하는 표시 스냅샷이며 실행의 진실이 아니다.
# (실제 예약은 [예약 신청하기] → 환자앱 create_booking. 카드 payload를 위변조해도 서버가 재검증.)
CARD_TYPES = {
    "time_select", "booking_confirm", "booking_done",
    "cancel_confirm", "cancel_done", "cancel_reject",
    "questionnaire", "quick_replies",
}

BOOKING_CONFIRM_BUTTON = "예약 신청하기"     # auto_confirm 설정과 무관하게 고정(카탈로그 §2)
VISIT_REASON_MAX = 100                        # BOOK-WHY: 최대 100자 선택 입력(#8)


def collect_visit_reason(text: str | None) -> str:
    if not text or not text.strip():
        return ""                             # 선택 입력 — 비면 빈 값(없는 값 만들지 않음)
    return text.strip()[:VISIT_REASON_MAX]


def build_booking_confirm_card(*, for_patient_id, patient_name, relation,
                               department_name, doctor_name, slot_at, visit_reason) -> dict:
    # 여섯 항목 한 묶음 재확인(대상·과·의사·일시·방문이유·장소). 방문이유 비면 그대로 None.
    return {
        "card_type": "booking_confirm",
        "for_patient_id": for_patient_id, "patient_name": patient_name, "relation": relation,
        "department_name": department_name, "doctor_name": doctor_name, "slot_at": slot_at,
        "visit_reason": (visit_reason or None),
        "button": BOOKING_CONFIRM_BUTTON, "state": "정상",
    }


def build_time_select_card(*, candidates: list[dict], state: str = "정상") -> dict:
    # candidates는 환자앱 list_bookable_slots 결과(당일 지난 시각·마감·30분 이내 제외는 서버가 판정).
    # 0개면 state="빈" + reason + [다른 날짜 고르기](카탈로그 §1 상태2). 카드가 "가능"을 자체 확정하지 않는다.
    return {"card_type": "time_select", "candidates": candidates, "state": state}


def build_booking_done_card(*, status: str, number: str, question_count: int | None = None) -> dict:
    is_applied = status == "예약신청"
    card = {
        "card_type": "booking_done",
        "headline": "예약이 신청되었습니다" if is_applied else "예약이 확정되었습니다",
        "number_label": "신청번호" if is_applied else "예약번호",
        "number": number,
        "questionnaire_button": None, "questionnaire_note": None,
    }
    if question_count == 0:
        card["questionnaire_note"] = "작성할 문진이 없습니다"     # 0문항: 버튼·(0/0) 없음(카탈로그 §3 상태4)
    elif question_count is None or question_count >= 1:
        card["questionnaire_button"] = "사전문진 작성하기"
    return card


def build_cancel_confirm_card(*, appointment_id, target_summary) -> dict:
    # 마감 전/30분 이내만. 사유 입력·"취소" 타이핑 요구 없음. [아니요]/[취소합니다](카탈로그 §4).
    return {"card_type": "cancel_confirm", "appointment_id": appointment_id,
            "target_summary": target_summary, "buttons": ["아니요", "취소합니다"], "state": "정상"}


def build_questionnaire_card(*, state: str, answered: int, total: int,
                             appointment_id=None) -> dict:
    # 상태·서버 진행률·진입만. 문항을 대화문으로 나열하지 않는다(카탈로그 §7). 진행률은 서버값 그대로.
    return {"card_type": "questionnaire", "appointment_id": appointment_id,
            "state": state, "answered": answered, "total": total}


def validate_card_payload(payload: dict) -> None:
    ct = payload.get("card_type")
    if ct not in CARD_TYPES:
        raise ValueError(f"알 수 없는 카드 종류입니다: {ct}")
```

> 나머지 빌더(`build_cancel_done_card`·`build_cancel_reject_card`)는 위와 같은 패턴이다 — 카탈로그 §5·§6의 상태·버튼을 payload key로 옮긴다: 취소결과=`{card_type:'cancel_done', cancelled_by, relation, name, at, button:'새로 예약하기'}`, 취소반려=`{card_type:'cancel_reject', reject_reason, buttons:['확인','다시 문의하기']}`. 구현 시 카탈로그 §5·§6 표를 그대로 따른다.

- [ ] **Step 4: quick_replies + 제한모드 구현·테스트**

`backend/app/services/chat/quick_replies.py`:
```python
# 빠른답변: 누르면 그 문장이 "환자가 보낸 말풍선"으로 저장된다(제어 신호 아님). 자유 입력은 항상 열림.
from langchain_core.prompts import ChatPromptTemplate

from app.integrations.langchain_client import get_chat_model

# 시작 묶음은 AI를 부르지 않는다 — 앱이 다가오는 예약 유무로 고정 4개를 고른다(결정로그 L820-825).
START_WITH_UPCOMING = ["내 예약 확인해줘", "예약을 바꾸고 싶어요", "진료 전에 준비할 게 있나요", "주차할 수 있나요"]
START_NO_UPCOMING = ["진료시간이 어떻게 되나요", "어느 과에 가야 할지 모르겠어요", "예약하려면 어떻게 하나요", "주차할 수 있나요"]


def build_start_quick_replies(has_upcoming: bool) -> list[str]:
    return START_WITH_UPCOMING if has_upcoming else START_NO_UPCOMING


async def generate_conversational(last_question: str, model=None) -> list[str]:
    # 대화 중 묶음: AI가 3~4개 생성. 진단·처방 유도 금지. 실패·로딩 표시 없음 — 성공 때만 반환.
    prompt = ChatPromptTemplate.from_messages([
        ("system", "환자가 이어서 물어볼 만한 짧은 질문 3~4개를 줄바꿈으로만 제안하세요. "
                   "진단·처방을 유도하거나 환자가 병명을 단정한 듯한 문장은 만들지 마세요."),
        ("human", "직전 봇 답변: {q}"),
    ])
    try:
        resp = await (prompt | (model or get_chat_model())).ainvoke({"q": last_question})
    except Exception:
        return []                            # 실패는 상담 전체 오류로 확대하지 않는다(자유 입력 유지)
    lines = [l.strip() for l in getattr(resp, "content", "").splitlines() if l.strip()]
    return lines[:4]
```

`backend/app/services/chat/restricted_mode.py`:
```python
# 예약 중 상담(제한모드, E4): 정보성 안내·진료과 추천만. 행동형 카드 전부 금지, 유일 출구는 "○○과로 계속하기".
# Task 5 orchestrator(restricted=True)와 짝. 앱 DeptBotSheet(환자앱 T20)가 이 엔진을 주입한다.
from app.core.errors import AppError

ALLOWED_CARD_TYPES_RESTRICTED: set[str] = set()   # 시간선택·예약확인·예약완료·취소·문진 카드 전부 금지(카탈로그 §8)


def continue_to_department_label(department_name: str) -> str:
    return f"{department_name}로 계속하기"           # 유일한 행동 출구 — 마법사에 과를 돌려준다


def assert_card_allowed(card_type: str, restricted: bool) -> None:
    if restricted and card_type not in ALLOWED_CARD_TYPES_RESTRICTED:
        raise AppError("예약 중 상담에서는 이 카드를 보낼 수 없습니다.", 409)
```

`backend/tests/test_quick_replies.py`:
```python
import pytest

from app.services.chat import quick_replies as qr


def test_start_bundles_are_fixed_and_ai_free():
    assert qr.build_start_quick_replies(True) == qr.START_WITH_UPCOMING
    assert qr.build_start_quick_replies(False) == qr.START_NO_UPCOMING
    assert "주차할 수 있나요" in qr.build_start_quick_replies(True)


@pytest.mark.asyncio
async def test_conversational_returns_up_to_4_on_success():
    class M:
        async def ainvoke(self, _):
            class R: content = "질문1\n질문2\n질문3\n질문4\n질문5"
            return R()
    out = await qr.generate_conversational("주차는 지하 1층입니다", model=M())
    assert out == ["질문1", "질문2", "질문3", "질문4"]   # 3~4개 제한


@pytest.mark.asyncio
async def test_conversational_failure_is_silent():
    class Boom:
        async def ainvoke(self, _):
            raise RuntimeError("llm down")
    assert await qr.generate_conversational("x", model=Boom()) == []   # 빈 목록, 상담 오류로 확대 안 함
```

`backend/tests/test_restricted_mode.py`:
```python
import pytest

from app.core.errors import AppError
from app.services.chat import restricted_mode as rm


def test_restricted_blocks_all_action_cards():
    for ct in ["time_select", "booking_confirm", "booking_done", "cancel_confirm", "questionnaire"]:
        with pytest.raises(AppError):
            rm.assert_card_allowed(ct, restricted=True)


def test_unrestricted_allows_cards():
    rm.assert_card_allowed("booking_confirm", restricted=False)   # 예외 없음


def test_continue_label():
    assert rm.continue_to_department_label("내과") == "내과로 계속하기"
```

- [ ] **Step 5: 테스트 통과 확인** — Run: `cd backend && pytest tests/test_card_builder.py tests/test_quick_replies.py tests/test_restricted_mode.py -v` → Expected: PASS(전체 초록불).

- [ ] **Step 6: 커밋**

```bash
git add backend/app/services/chat/card_builder.py backend/app/services/chat/quick_replies.py \
        backend/app/services/chat/restricted_mode.py backend/tests/test_card_builder.py \
        backend/tests/test_quick_replies.py backend/tests/test_restricted_mode.py \
        docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 6 본문 — 카드 8종 payload 계약·방문이유(#8)·quick_replies(#20)·예약 중 제한모드(E4). 카드=표시 스냅샷(실행은 create_booking 재검증), 채팅 전용 형태(R2-1), 위변조방지표 기각"
```

> **Task 6 완료 조건**: 카드 빌더(8종 payload·방문이유 100자·0문항 버튼없음·서버 진행률 소비)·quick_replies(고정 4개·대화중 3~4개·실패 무음)·제한모드(행동형 카드 전부 금지·유일 출구 ○○과로 계속하기) 초록불 · `create_booking`이 실행 주체임(카드는 호출만) 확인. coverage 불변, prefix-check 빚·미배정 0·⏰0(`CCARD-*` 완전 ID 미사용).

## Task 7: 지식베이스(KB) — pgvector 검색 · 승인·재임베딩 · 제한 자료 · 의사 소개 원본

> **화면 규칙 0개.** 상담봇 안내형(RAG)의 **지식 원본과 검색**을 만든다: 관리자가 쓴 자료(`kb_documents`)를 조각내(`kb_chunks`) 임베딩하고, **승인된 조각만** 검색 근거로 쓴다. Task 5 오케스트레이터의 안내형 갈래(`rag_fn`)가 여기 검색을 주입받는다. Task 4의 `chat_message_sources.chunk_id`(소프트 참조)가 여기 `kb_chunks`를 가리킨다.
>
> **근거 원본**: 옛 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:325-410`(KB 스키마·`match_kb_chunks`·R4-01 `pending_*`) · 정본 §1(item 7 의사 소개 원본·item 8 진료시간 KB 제거)·§0(A3 제한 자료) · 결정 A2·A3·G-06.
>
> ⭐ **이 태스크가 닫는 미결(발판 → 여기서 확정)**:
> - **제한 자료 검색 숫자 튜닝** — 원칙은 A3 확정(제한 원문 별도 블록). **엔진 결정 = 코사인 유사도 임계값 `RAG_SIMILARITY_THRESHOLD=0.70`**(최상위 조각이 이보다 낮으면 근거 부족 → `no_answer` 인계). ⚠️ 실제 데이터로 튜닝하는 값이라 상수+주석(KB 실측 후 조정).
>
> ⭐ **설계 결정 3건(기각안 포함)**:
> 1. **승인 전 기존본 유지(A2·G-06·R4-01)** — 이미 승인된 자료를 고치면 `title/content/is_restricted`(라이브)는 그대로 두고 `pending_*`에 담는다. 챗봇은 **재임베딩 성공 전까지 라이브로 답한다.** `approve_pending_edit`이 라이브를 이전 이력에 저장 → 재청킹·재임베딩을 **한 트랜잭션**으로(실패 시 옛 조각·옛 답 유지). *기각: 수정 즉시 라이브 덮어쓰기* — 재임베딩이 실패하면 자료와 검색 인덱스가 어긋난다.
> 2. **진료시간·의사 소개는 KB에 넣지 않는다** — 진료시간·휴진은 `hospital_hours` 단일 판정(item 8), 의사 소개는 `staff.specialty/bio/photo_url` **원본을 읽는다**(item 7). *기각: KB에 `진료시간`·`의사소개` 분류 중복 저장* — 원본과 KB가 갈라져 낡은 답을 준다.
> 3. **제한 자료(A3)는 병원 문구 글자 그대로, 봇 생성문 밖 별도 블록.** 질문 전체가 제한 주제면 제한 문구+`[직원 연결]`만, 일반 자료가 함께 걸리면 일반은 평소대로 답하고 제한 원문만 별도 블록. *기각: 제한 주제면 전부 차단* — 무관한 일반 안내까지 막는다(A3 기각안).

**Files:**
- Create: `supabase/migrations/00041_kb_pgvector.sql`
- Create: `backend/app/services/chat/kb_service.py` · `backend/app/services/chat/rag_service.py`
- Create: `backend/tests/test_kb_schema.py` · `backend/tests/test_kb_service.py` · `backend/tests/test_rag_service.py`

**Interfaces:**
- Consumes: Task 0 `EmbeddingClient`·`get_chat_model`·`fake_embedder`(테스트) · Task 4 `chat_message_sources`(근거 기록) · `staff`(의사 소개 원본) · `private.is_active_staff()`·`private.is_admin()` · `get_pool`·`acquire_as`·`AppError` · pgvector 확장
- Produces:
  - 표 `kb_documents`(`status draft/approved/archived`·`is_restricted`·`pending_*` 6칸·이력 키) · `kb_chunks(embedding vector(1536))` · `kb_document_revisions` · 함수 `match_kb_chunks(query_embedding vector, match_count int)`(**승인 조각만**)
  - `kb_service.create_document`·`submit_edit`(→pending)·`approve_document`(draft→approved 재임베딩)·`approve_pending_edit`(라이브 교체+이력+재임베딩 트랜잭션)·`reject_pending_edit`·`archive_document`·`chunk_text` · `list_revisions`
  - `rag_service.rag_answer(message, *, embedder, model, match_count=5) -> dict`(`{reply|no_answer|restricted_block, sources, actions}`) · `record_answer_sources(message_id, sources)`(→`chat_message_sources` 스냅샷) · `RAG_SIMILARITY_THRESHOLD=0.70` · `get_doctor_intro(doctor_id) -> dict`(staff 원본)
- ⚠️ **아직 안 하는 것**: KB 관리 **화면**(`KBADM-*`)=Task 20 · 품질·오답 신고(`answer_feedback`·예시은행)=Task 8 · 배포 임베딩 배치=배포. Task 7은 검색·승인·재임베딩 서버 약속만.

- [ ] **Step 1: 실패하는 KB 스키마 테스트 작성**

`backend/tests/test_kb_schema.py`:
```python
import pytest
from tests.conftest import seed_staff


@pytest.mark.asyncio
async def test_pgvector_and_kb_tables_exist(db_conn):
    ext = await db_conn.fetchval("select 1 from pg_extension where extname='vector'")
    assert ext == 1
    for t in ("kb_documents", "kb_chunks", "kb_document_revisions"):
        assert await db_conn.fetchval(
            "select 1 from information_schema.tables where table_name=$1", t) == 1


@pytest.mark.asyncio
async def test_match_returns_approved_chunks_only(db_conn):
    # 승인 자료 1건 + 초안 1건 → 검색에 승인 조각만.
    vec = "[" + ",".join(["0.1"] * 1536) + "]"
    ap = await db_conn.fetchval(
        "insert into kb_documents (title, content, status) values ('주차','지하1층','approved') returning id")
    dr = await db_conn.fetchval(
        "insert into kb_documents (title, content, status) values ('초안','승인전','draft') returning id")
    await db_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) values ($1,0,'지하 1층 주차장',$2::vector)", ap, vec)
    await db_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) values ($1,0,'승인 전 내용',$2::vector)", dr, vec)
    rows = await db_conn.fetch("select content from match_kb_chunks($1::vector, 10)", vec)
    contents = {r["content"] for r in rows}
    assert "지하 1층 주차장" in contents and "승인 전 내용" not in contents
```

- [ ] **Step 2: 실패 확인 → 마이그레이션 작성**

Run: `cd backend && pytest tests/test_kb_schema.py -v` → FAIL. 그다음 `supabase/migrations/00041_kb_pgvector.sql`:
```sql
-- 상담봇 안내형(RAG) 지식 원본 + pgvector 검색. 승인된 조각만 검색 근거로 쓴다(요구사항 5.6).
-- 진료시간·의사 소개는 KB에 넣지 않는다(item 7·8 — hospital_hours·staff 원본이 정본). ⚠️ 번호 예시 00041.
create extension if not exists vector;

create table kb_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '기타',
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  is_restricted boolean not null default false,   -- A3: true면 근거로 재생성하지 않고 원문 그대로 별도 블록 안내
  -- R4-01·A2·G-06: 승인된 문서 수정은 라이브(title/content/is_restricted)를 두고 pending_*에 담는다.
  -- 재승인(approve_pending_edit) 전까지 챗봇은 라이브로 답한다.
  has_pending_edit boolean not null default false,
  pending_title text, pending_category text, pending_content text, pending_is_restricted boolean,
  pending_updated_by uuid references staff(id), pending_updated_at timestamptz,
  created_by uuid references staff(id), approved_by uuid references staff(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  approved_at timestamptz
);

create table kb_chunks (        -- 검색 단위. 원본 승인/재승인 시 전량 재생성.
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null
);
create index idx_kb_chunks_embedding on kb_chunks using hnsw (embedding vector_cosine_ops);

create table kb_document_revisions (   -- 라이브 교체 전 옛 값을 먼저 저장(G-06·1단계 medical_record_revisions 패턴).
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_documents(id) on delete cascade,
  previous_title text not null, previous_category text not null, previous_content text not null,
  previous_is_restricted boolean not null,
  changed_by uuid references staff(id), changed_at timestamptz not null default now()
);
create index idx_kb_revisions_document on kb_document_revisions (document_id, changed_at desc);

-- 승인 조각만 코사인 유사도 상위 match_count개.
create function match_kb_chunks(query_embedding vector(1536), match_count int)
returns table (id uuid, document_id uuid, content text, title text, is_restricted boolean, similarity float)
language sql stable as $$
  select c.id, c.document_id, c.content, d.title, d.is_restricted,
         1 - (c.embedding <=> query_embedding) as similarity
  from kb_chunks c join kb_documents d on d.id = c.document_id
  where d.status = 'approved'
  order by c.embedding <=> query_embedding
  limit match_count
$$;

alter table kb_documents enable row level security;
alter table kb_chunks enable row level security;
alter table kb_document_revisions enable row level security;
-- 직원은 근거 확인용 조회. 작성·수정·승인은 백엔드 경유(관리자 검사). 봇 검색은 서비스 역할(match_kb_chunks).
create policy kb_documents_staff_select on kb_documents for select to authenticated using (private.is_active_staff());
create policy kb_chunks_staff_select on kb_chunks for select to authenticated using (private.is_active_staff());
create policy kb_revisions_staff_select on kb_document_revisions for select to authenticated using (private.is_active_staff());
```
적용: `supabase migration up` → `pytest tests/test_kb_schema.py -v` PASS.

- [ ] **Step 3: KB 서비스 — 승인·재임베딩·pending 작성**

`backend/app/services/chat/kb_service.py`:
```python
from uuid import UUID

from app.core.errors import AppError
from app.db.pool import get_pool


def chunk_text(content: str, *, max_len: int = 500) -> list[str]:
    # 단순 청킹: 빈 줄 문단 우선, 너무 길면 max_len로 자른다(검색 단위).
    parts, buf = [], ""
    for para in content.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        if len(buf) + len(para) + 2 > max_len and buf:
            parts.append(buf); buf = para
        else:
            buf = f"{buf}\n\n{para}" if buf else para
    if buf:
        parts.append(buf)
    return parts or [content.strip()]


async def _reembed(conn, doc_id: UUID, content: str, embedder) -> None:
    # 옛 조각 삭제 + 새 조각 삽입을 같은 트랜잭션에서. 실패하면 옛 조각·옛 답 유지(A2).
    chunks = chunk_text(content)
    vectors = await embedder.embed(chunks)
    await conn.execute("delete from kb_chunks where document_id=$1", doc_id)
    for i, (c, v) in enumerate(zip(chunks, vectors)):
        await conn.execute(
            "insert into kb_chunks (document_id, chunk_index, content, embedding) values ($1,$2,$3,$4::vector)",
            doc_id, i, c, "[" + ",".join(map(str, v)) + "]")


async def approve_document(doc_id: UUID, embedder) -> None:
    # draft → approved(최초 승인): 청킹+임베딩 후 승인. 재임베딩 실패 시 승인도 롤백.
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            doc = await conn.fetchrow("select content, status from kb_documents where id=$1", doc_id)
            if doc is None:
                raise AppError("없는 자료입니다.", 404)
            await _reembed(conn, doc_id, doc["content"], embedder)
            await conn.execute(
                "update kb_documents set status='approved', approved_at=now(), updated_at=now() where id=$1", doc_id)


async def submit_edit(doc_id: UUID, *, title, category, content, is_restricted, staff_id) -> None:
    # 승인된 문서 수정 → pending_*에 담고 라이브는 그대로. 챗봇은 계속 라이브로 답한다(A2·R4-01).
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "update kb_documents set has_pending_edit=true, pending_title=$2, pending_category=$3, "
            "pending_content=$4, pending_is_restricted=$5, pending_updated_by=$6, pending_updated_at=now() "
            "where id=$1", doc_id, title, category, content, is_restricted, staff_id)


async def approve_pending_edit(doc_id: UUID, embedder) -> None:
    # 라이브를 이력에 저장 → pending을 라이브로 → 재청킹·재임베딩. 전부 한 트랜잭션(G-06·A2).
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            d = await conn.fetchrow("select * from kb_documents where id=$1 and has_pending_edit", doc_id)
            if d is None:
                raise AppError("반영할 수정 내용이 없습니다.", 409)
            await conn.execute(
                "insert into kb_document_revisions (document_id, previous_title, previous_category, "
                "previous_content, previous_is_restricted, changed_by) values ($1,$2,$3,$4,$5,$6)",
                doc_id, d["title"], d["category"], d["content"], d["is_restricted"], d["pending_updated_by"])
            await conn.execute(
                "update kb_documents set title=pending_title, category=pending_category, content=pending_content, "
                "is_restricted=pending_is_restricted, has_pending_edit=false, pending_title=null, "
                "pending_category=null, pending_content=null, pending_is_restricted=null, "
                "approved_at=now(), updated_at=now() where id=$1", doc_id)
            new_content = d["pending_content"]
            await _reembed(conn, doc_id, new_content, embedder)
```

- [ ] **Step 4: RAG 서비스 + 제한 자료 + 의사 소개 작성**

`backend/app/services/chat/rag_service.py`:
```python
from uuid import UUID

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from app.db.pool import get_pool
from app.integrations.langchain_client import get_chat_model

RAG_SIMILARITY_THRESHOLD = 0.70   # 최상위 조각이 이보다 낮으면 근거 부족 → no_answer 인계. 실측 튜닝 대상.


async def rag_answer(message: str, *, embedder, model=None, match_count: int = 5) -> dict:
    qvec = (await embedder.embed([message]))[0]
    vec = "[" + ",".join(map(str, qvec)) + "]"
    pool = await get_pool()
    async with pool.acquire() as conn:
        chunks = await conn.fetch("select * from match_kb_chunks($1::vector, $2)", vec, match_count)
    if not chunks or chunks[0]["similarity"] < RAG_SIMILARITY_THRESHOLD:
        return {"no_answer": True}          # 근거 부족 → 인계(no_answer)
    restricted = [c for c in chunks if c["is_restricted"]]
    normal = [c for c in chunks if not c["is_restricted"]]
    sources = [{"chunk_id": c["id"], "title_snapshot": c["title"], "body_snapshot": c["content"],
                "rank": i, "similarity": float(c["similarity"])} for i, c in enumerate(chunks)]
    # A3: 질문 전체가 제한 주제(일반 근거 없음)면 제한 원문 + [직원 연결]만.
    if restricted and not normal:
        return {"reply": None, "restricted_block": restricted[0]["content"],
                "actions": ["직원 연결"], "sources": sources}
    # 일반 자료로 평소대로 답하고, 제한 자료가 함께 걸리면 원문 그대로 별도 블록으로 덧붙인다.
    context = "\n\n".join(c["content"] for c in normal)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "아래 병원 자료만 근거로 간결히 답하세요. 자료에 없으면 모른다고 하세요.\n{context}"),
        ("human", "{q}"),
    ])
    reply = await (prompt | (model or get_chat_model()) | StrOutputParser()).ainvoke(
        {"context": context, "q": message})
    result = {"reply": reply, "sources": sources}
    if restricted:
        result["restricted_block"] = restricted[0]["content"]   # 봇이 살 붙이지 않은 원문 그대로
    return result


async def record_answer_sources(message_id: UUID, sources: list[dict]) -> None:
    # 봇 답변 근거를 당시 스냅샷으로 박제한다(Task 4 chat_message_sources). chunk_id는 소프트 참조.
    pool = await get_pool()
    async with pool.acquire() as conn:
        for s in sources:
            await conn.execute(
                "insert into chat_message_sources (message_id, chunk_id, rank, similarity, "
                "title_snapshot, body_snapshot) values ($1,$2,$3,$4,$5,$6)",
                message_id, s["chunk_id"], s["rank"], s["similarity"], s["title_snapshot"], s["body_snapshot"])


async def get_doctor_intro(doctor_id: UUID) -> dict:
    # 의사 소개는 KB가 아니라 staff 원본을 읽는다(item 7 — 중복 저장 금지).
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select id, name, specialty, bio, photo_url from staff where id=$1", doctor_id)
    return dict(row) if row else None
```

> ⚠️ **구현 메모(⑦)**: `staff.specialty/bio/photo_url` 칸은 직원웹·환자앱이 만드는 것으로 전제됐다(#7). 착수 시 존재를 확인하고, 없으면 그 태스크와 순서를 맞춘다(먼저 만드는 쪽 우선).

- [ ] **Step 5: KB·RAG 서비스 테스트 작성**

`backend/tests/test_kb_service.py`:
```python
import pytest

from app.services.chat import kb_service
from tests.conftest import seed_staff
from tests.conftest_chat import FakeEmbedder


@pytest.mark.asyncio
async def test_approve_chunks_and_embeds(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, created_by) "
        "values ('주차','지하 1층 30분 무료입니다.','draft',$1) returning id", st["staff_id"])
    await kb_service.approve_document(doc, FakeEmbedder())
    status = await committed_conn.fetchval("select status from kb_documents where id=$1", doc)
    n = await committed_conn.fetchval("select count(*) from kb_chunks where document_id=$1", doc)
    assert status == "approved" and n >= 1
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_edit_stays_pending_until_approved(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, created_by) "
        "values ('주차','옛 내용','approved',$1) returning id", st["staff_id"])
    await kb_service.submit_edit(doc, title="주차", category="기타", content="새 내용",
                                 is_restricted=False, staff_id=st["staff_id"])
    live = await committed_conn.fetchrow("select content, has_pending_edit, pending_content from kb_documents where id=$1", doc)
    assert live["content"] == "옛 내용" and live["has_pending_edit"] and live["pending_content"] == "새 내용"
    await kb_service.approve_pending_edit(doc, FakeEmbedder())
    after = await committed_conn.fetchrow("select content, has_pending_edit from kb_documents where id=$1", doc)
    assert after["content"] == "새 내용" and after["has_pending_edit"] is False
    rev = await committed_conn.fetchval(
        "select previous_content from kb_document_revisions where document_id=$1", doc)
    assert rev == "옛 내용"   # 라이브 교체 전 이력 저장(G-06)
    await committed_conn.execute("delete from kb_document_revisions where document_id=$1", doc)
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])
```

`backend/tests/test_rag_service.py`:
```python
import pytest

from app.services.chat import rag_service
from tests.conftest import seed_staff
from tests.conftest_chat import FakeEmbedder


class _Fixed:
    # 임계값 판정을 통제하려고 질의·조각 벡터를 같게 만들어 유사도=1로 만든다.
    async def embed(self, texts): return [[1.0] + [0.0] * 1535 for _ in texts]


class _Model:
    async def ainvoke(self, _):
        class R: content = "지하 1층에 주차할 수 있습니다."
        return R()


@pytest.mark.asyncio
async def test_restricted_only_returns_verbatim_and_staff_action(committed_conn):
    st = await seed_staff(committed_conn, role="admin")
    doc = await committed_conn.fetchval(
        "insert into kb_documents (title, content, status, is_restricted) "
        "values ('보험 상담','보험 관련은 직원에게 문의하세요.','approved',true) returning id")
    await committed_conn.execute(
        "insert into kb_chunks (document_id, chunk_index, content, embedding) "
        "values ($1,0,'보험 관련은 직원에게 문의하세요.',$2::vector)", doc, "[" + ",".join(["1.0"]+["0.0"]*1535) + "]")
    out = await rag_service.rag_answer("보험 되나요", embedder=_Fixed(), model=_Model())
    assert out.get("reply") is None
    assert out["restricted_block"] == "보험 관련은 직원에게 문의하세요."   # 글자 그대로, 봇 생성 아님
    assert "직원 연결" in out["actions"]
    await committed_conn.execute("delete from kb_chunks where document_id=$1", doc)
    await committed_conn.execute("delete from kb_documents where id=$1", doc)
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_low_similarity_becomes_no_answer():
    # 승인 조각이 하나도 없으면(빈 KB) 근거 부족 → no_answer.
    out = await rag_service.rag_answer("아무거나", embedder=FakeEmbedder(), model=_Model())
    assert out.get("no_answer") is True
```

- [ ] **Step 6: 테스트 통과 확인** — Run: `cd backend && pytest tests/test_kb_schema.py tests/test_kb_service.py tests/test_rag_service.py -v` → Expected: PASS. (⚠️ `committed_conn` 쓰는 테스트는 뒤에서 직접 정리 — chat/kb 표는 `_cleanup_committed_data`에 없으니 각 테스트가 지운다.)

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/00041_kb_pgvector.sql backend/app/services/chat/kb_service.py \
        backend/app/services/chat/rag_service.py backend/tests/test_kb_schema.py \
        backend/tests/test_kb_service.py backend/tests/test_rag_service.py \
        docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 7 본문 — KB pgvector 검색·승인/재임베딩(승인전 라이브 유지 A2/G-06)·제한자료 별도블록(A3)·의사소개 원본(#7). 검색 임계값 0.70 미결 닫음"
```

> **Task 7 완료 조건**: KB 표·`match_kb_chunks`(승인만)·승인 재임베딩·`pending_*`(라이브 유지)·이력·제한자료 원문 별도블록·의사소개 staff 원본 초록불 · 검색 임계값 상수 확인 · `chunk_id` 스냅샷 기록 확인. 제한 자료 검색 튜닝 미결 닫힘. coverage 불변, prefix-check 빚·미배정 0·⏰0.

## Task 8: 품질 검토 + bad inbox + 미해결 클러스터 (`chat_quality_reviews` · `answer_feedback` · `qa_example_bank`)

> **화면 규칙 0개.** 상담봇 개선 사이클의 서버 계약을 만든다: **① 상담 단위 품질 검토**(오답 신고가 없어도 「문제없음」을 저장, 미검토 우선 정렬) · **② 오답 신고 → bad inbox → 적용/반려 → KB 승인**(즉시 KB 공개 금지) · **③ 미해결 질문 자동 클러스터**(봇이 못 답한 질문을 유사도로 묶음, 혼합 가능 안내는 화면). 관리자 화면(`QUALITY-REPORT`·`BADINBOX`·`UNRES-CLUSTER`·`QAEX` 계열)은 Task 21이 담는다.
>
> **근거 원본**: 결정 SD-08(색인 `SPECINDEX-ai-chatbot.md:192`)·B2·B3(색인 `:91`·`:280`) · 옛 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:423-551`(`answer_feedback`·`qa_example_bank`·`question_embedding`) · 요구사항 3.9·3.10(미해결·오답·품질).
>
> ⭐ **이 태스크가 닫는 미결(발판 → 여기서 확정) — 품질 검토 저장 모델(SD-08)**:
> - **결정 = 상담 단위 `chat_quality_reviews` 표를 신설한다**(`answer_feedback` 확장 아님). 이유: SD-08은 「오답 신고가 없어도 상담 단위에 검토 완료를 저장」을 요구하는데, `answer_feedback`은 신고가 있을 때만 행이 생겨 **「문제없음」과 「아직 안 봄」을 구분 못 한다.** 검토 행이 있으면 봤고(문제없음/교정), 없으면 미검토. *기각: `answer_feedback` 확장만* — 신고 없는 세션의 검토 완료를 담을 자리가 없다.
>
> ⭐ **설계 결정(기각안 포함)**: **품질 교정은 즉시 KB 공개가 아니라 `answer_feedback`(bad inbox)를 거쳐 KB 승인**(B3). 적용(`applied`)돼도 KB `submit_edit`→`approve_pending_edit`(Task 7)을 거쳐야 라이브가 된다. *기각: 품질 화면에서 즉시 KB 적용*(색인 폐기결정 `:280`).

**Files:**
- Create: `supabase/migrations/00042_chat_quality.sql`
- Create: `backend/app/services/chat/quality_service.py` · `backend/app/services/chat/answer_feedback_service.py`
- Create: `backend/tests/test_chat_quality_schema.py` · `backend/tests/test_quality_service.py`

**Interfaces:**
- Consumes: Task 1·2 `chat_messages`·`ai_chat_sessions`·`support_tickets` · Task 7 `kb_service.submit_edit`(적용→KB) · `staff` · `private.is_active_staff()`·`private.is_admin()` · Task 0 `fake_embedder` · `get_pool`·`AppError`
- Produces:
  - 표 `chat_quality_reviews(ai_chat_session_id unique, status ok/corrected, reviewed_by, reviewed_at)` · `answer_feedback(message_id, reported_by, source immediate/quality_review, correction_text, add_to_example_bank, status pending/applied/rejected, resolved_by/at)` · `qa_example_bank(question, answer, embedding vector(1536), is_active, source_feedback_id)` · `unresolved_questions(ticket_id, question_text, question_embedding vector(1536))`
  - `quality_service.mark_reviewed`(문제없음)·`send_correction`(→answer_feedback quality_review)·`list_sessions_unreviewed_first` · `record_unresolved(ticket_id, question, embedder)`·`cluster_unresolved(embedder, threshold=0.8)`
  - `answer_feedback_service.report`(즉시 오답)·`list_bad_inbox`(pending 우선)·`apply`(→qa_example_bank + KB submit_edit)·`reject`
- ⚠️ **아직 안 하는 것**: 관리자 화면(`QUALITY-REPORT`·`BADINBOX`·`UNRES-CLUSTER`·`QAEX` 계열)=Task 21 · 정기 리포트 배치=배포. Task 8은 저장·정렬·클러스터 서버 계약만.

- [ ] **Step 1: 실패하는 스키마 테스트 작성**

`backend/tests/test_chat_quality_schema.py`:
```python
import uuid
import pytest
import asyncpg

from tests.conftest import seed_staff, seed_patient
from tests.conftest_chat import seed_chat_thread


@pytest.mark.asyncio
async def test_quality_review_one_per_session(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    s = await db_conn.fetchval(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()) returning id", t)
    st = await seed_staff(db_conn, role="admin")
    await db_conn.execute(
        "insert into chat_quality_reviews (ai_chat_session_id, status, reviewed_by) values ($1,'ok',$2)",
        s, st["staff_id"])
    with pytest.raises(asyncpg.exceptions.UniqueViolationError):
        await db_conn.execute(
            "insert into chat_quality_reviews (ai_chat_session_id, status, reviewed_by) values ($1,'ok',$2)",
            s, st["staff_id"])


@pytest.mark.asyncio
async def test_answer_feedback_source_check(db_conn):
    p = await seed_patient(db_conn)
    t = await seed_chat_thread(db_conn, patient_id=p["patient_id"])
    m = await db_conn.fetchval(
        "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content) "
        "values ($1, $2, 'bot','text','답변') returning id", t, uuid.uuid4())
    st = await seed_staff(db_conn, role="admin")
    with pytest.raises(asyncpg.exceptions.CheckViolationError):
        await db_conn.execute(
            "insert into answer_feedback (message_id, reported_by, source) values ($1,$2,'made_up')",
            m, st["staff_id"])
```

- [ ] **Step 2: 실패 확인 → 마이그레이션 작성**

Run: `cd backend && pytest tests/test_chat_quality_schema.py -v` → FAIL. 그다음 `supabase/migrations/00042_chat_quality.sql`:
```sql
-- 상담봇 품질 개선 사이클: 상담 단위 검토(SD-08) + 오답 신고 bad inbox(B3) + 예시은행 + 미해결 클러스터. ⚠️ 번호 예시 00042.

-- 상담 단위 검토(SD-08): 행이 있으면 봤고(문제없음/교정), 없으면 아직 안 봄. answer_feedback 확장으로는 이 구분이 안 된다.
create table chat_quality_reviews (
  id uuid primary key default gen_random_uuid(),
  ai_chat_session_id uuid not null unique references ai_chat_sessions(id),
  status text not null check (status in ('ok', 'corrected')),   -- ok=문제없음, corrected=교정 보냄
  reviewed_by uuid not null references staff(id),
  reviewed_at timestamptz not null default now()
);

-- 오답 신고 = bad inbox. immediate(그 자리 신고) / quality_review(정기 검토 중 교정). 즉시 KB 공개 금지 → 적용은 KB 승인 경유(B3).
create table answer_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id),
  reported_by uuid not null references staff(id),
  source text not null check (source in ('immediate', 'quality_review')),
  correction_text text,
  add_to_example_bank boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  resolved_by uuid references staff(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_answer_feedback_inbox on answer_feedback (status, created_at) where status = 'pending';

-- 품질 개선 예시: 적용된 교정을 쌓아 이후 유사 질문 답변 프롬프트에 참고로 넣는다.
create table qa_example_bank (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  embedding vector(1536) not null,
  is_active boolean not null default true,
  source_feedback_id uuid references answer_feedback(id),
  created_at timestamptz not null default now()
);
create index idx_qa_example_embedding on qa_example_bank using hnsw (embedding vector_cosine_ops) where is_active;

-- 미해결 질문(봇이 못 답해 인계된 질문) — 유사도로 자동 클러스터. 클러스터는 질문을 섞을 수 있음(화면이 안내).
create table unresolved_questions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id),
  question_text text not null,
  question_embedding vector(1536) not null,
  created_at timestamptz not null default now()
);
create index idx_unresolved_embedding on unresolved_questions using hnsw (question_embedding vector_cosine_ops);

alter table chat_quality_reviews enable row level security;
alter table answer_feedback enable row level security;
alter table qa_example_bank enable row level security;
alter table unresolved_questions enable row level security;
-- 직원은 조회, 작성·적용·반려는 백엔드 경유(관리자 검사). 봇 예시 검색은 서비스 역할.
create policy quality_reviews_staff_select on chat_quality_reviews for select to authenticated using (private.is_active_staff());
create policy answer_feedback_staff_select on answer_feedback for select to authenticated using (private.is_active_staff());
create policy qa_example_staff_select on qa_example_bank for select to authenticated using (private.is_active_staff());
create policy unresolved_staff_select on unresolved_questions for select to authenticated using (private.is_active_staff());
```
적용: `supabase migration up` → `pytest tests/test_chat_quality_schema.py -v` PASS.

- [ ] **Step 3: 품질·오답 서비스 작성**

`backend/app/services/chat/quality_service.py`:
```python
from uuid import UUID
from app.db.pool import get_pool


async def mark_reviewed(session_id: UUID, staff_id: UUID, *, status: str = "ok") -> None:
    # 신고가 없어도 "문제없음"을 저장한다(SD-08). 재검토는 status만 갱신.
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "insert into chat_quality_reviews (ai_chat_session_id, status, reviewed_by) values ($1,$2,$3) "
            "on conflict (ai_chat_session_id) do update set status=excluded.status, "
            "reviewed_by=excluded.reviewed_by, reviewed_at=now()", session_id, status, staff_id)


async def list_sessions_unreviewed_first(limit: int = 20) -> list[dict]:
    # 미검토 우선 → 최신 우선(SD-08). 검토 행이 없으면 미검토.
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select s.id, s.created_at, r.status as review_status "
            "from ai_chat_sessions s left join chat_quality_reviews r on r.ai_chat_session_id = s.id "
            "order by (r.id is null) desc, s.created_at desc, s.id desc limit $1", limit)
        return [dict(r) for r in rows]


async def record_unresolved(ticket_id: UUID, question: str, embedder) -> None:
    # 봇이 못 답해 인계된 질문을 임베딩과 함께 저장(클러스터 대상).
    vec = (await embedder.embed([question]))[0]
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "insert into unresolved_questions (ticket_id, question_text, question_embedding) values ($1,$2,$3::vector)",
            ticket_id, question, "[" + ",".join(map(str, vec)) + "]")
```

`backend/app/services/chat/answer_feedback_service.py`:
```python
from uuid import UUID
from app.core.errors import AppError
from app.db.pool import get_pool
from app.services.chat import kb_service


async def report(message_id: UUID, staff_id: UUID, *, correction_text=None,
                 source: str = "immediate", add_to_example_bank: bool = False) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "insert into answer_feedback (message_id, reported_by, source, correction_text, add_to_example_bank) "
            "values ($1,$2,$3,$4,$5) returning *", message_id, staff_id, source, correction_text, add_to_example_bank)
        return dict(row)


async def list_bad_inbox(limit: int = 20) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select * from answer_feedback where status='pending' order by created_at desc limit $1", limit)
        return [dict(r) for r in rows]


async def apply(feedback_id: UUID, staff_id: UUID, embedder, *, kb_document_id=None,
                kb_fields: dict | None = None) -> None:
    # 적용: 예시은행 축적 + (교정이 KB 대상이면) KB submit_edit로 보낸다. 즉시 라이브 아님 — KB 승인 경유(B3).
    pool = await get_pool()
    async with pool.acquire() as conn:
        fb = await conn.fetchrow("select * from answer_feedback where id=$1 and status='pending'", feedback_id)
        if fb is None:
            raise AppError("이미 처리된 신고입니다.", 409)
        if fb["add_to_example_bank"] and fb["correction_text"]:
            q = await conn.fetchval("select content from chat_messages where id=$1", fb["message_id"])
            vec = (await embedder.embed([q or ""]))[0]
            await conn.execute(
                "insert into qa_example_bank (question, answer, embedding, source_feedback_id) "
                "values ($1,$2,$3::vector,$4)", q or "", fb["correction_text"],
                "[" + ",".join(map(str, vec)) + "]", feedback_id)
        await conn.execute(
            "update answer_feedback set status='applied', resolved_by=$2, resolved_at=now() where id=$1",
            feedback_id, staff_id)
    if kb_document_id and kb_fields:
        await kb_service.submit_edit(kb_document_id, staff_id=staff_id, **kb_fields)   # 승인은 별도(Task 7)


async def reject(feedback_id: UUID, staff_id: UUID) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "update answer_feedback set status='rejected', resolved_by=$2, resolved_at=now() "
            "where id=$1 and status='pending'", feedback_id, staff_id)
```

- [ ] **Step 4: 서비스 테스트 작성**

`backend/tests/test_quality_service.py`:
```python
import uuid
import pytest

from app.services.chat import quality_service, answer_feedback_service
from tests.conftest import seed_staff, seed_patient
from tests.conftest_chat import seed_chat_thread, FakeEmbedder


@pytest.mark.asyncio
async def test_unreviewed_sorts_first_and_distinguishes_ok(committed_conn):
    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    st = await seed_staff(committed_conn, role="admin")
    s_old = await committed_conn.fetchval(
        "insert into ai_chat_sessions (thread_id, expires_at, created_at) values ($1, now(), now()-interval '1 day') returning id", t)
    s_new = await committed_conn.fetchval(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()) returning id", t)
    await quality_service.mark_reviewed(s_new, st["staff_id"], status="ok")  # 새 세션은 문제없음
    rows = await quality_service.list_sessions_unreviewed_first(limit=10)
    ids = [r["id"] for r in rows]
    # 미검토(s_old)가 검토완료(s_new)보다 앞. s_new는 review_status='ok'로 "아직 안 봄"과 구분됨.
    assert ids.index(s_old) < ids.index(s_new)
    assert next(r for r in rows if r["id"] == s_new)["review_status"] == "ok"
    assert next(r for r in rows if r["id"] == s_old)["review_status"] is None
    for sid in (s_old, s_new):
        await committed_conn.execute("delete from chat_quality_reviews where ai_chat_session_id=$1", sid)
        await committed_conn.execute("delete from ai_chat_sessions where id=$1", sid)
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])


@pytest.mark.asyncio
async def test_apply_feedback_adds_example_but_not_live_kb(committed_conn):
    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    st = await seed_staff(committed_conn, role="admin")
    m = await committed_conn.fetchval(
        "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content) "
        "values ($1,$2,'bot','text','틀린 답') returning id", t, uuid.uuid4())
    fb = await answer_feedback_service.report(m, st["staff_id"], correction_text="맞는 답",
                                              source="quality_review", add_to_example_bank=True)
    await answer_feedback_service.apply(fb["id"], st["staff_id"], FakeEmbedder())
    status = await committed_conn.fetchval("select status from answer_feedback where id=$1", fb["id"])
    n = await committed_conn.fetchval("select count(*) from qa_example_bank where source_feedback_id=$1", fb["id"])
    assert status == "applied" and n == 1   # 예시은행엔 들어가되 KB 라이브는 승인 경유(여기선 KB 미지정)
    await committed_conn.execute("delete from qa_example_bank where source_feedback_id=$1", fb["id"])
    await committed_conn.execute("delete from answer_feedback where id=$1", fb["id"])
    await committed_conn.execute("delete from chat_messages where id=$1", m)
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])
    await committed_conn.execute("delete from staff where id=$1", st["staff_id"])
```

- [ ] **Step 5: 테스트 통과 확인** — Run: `cd backend && pytest tests/test_chat_quality_schema.py tests/test_quality_service.py -v` → Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/00042_chat_quality.sql backend/app/services/chat/quality_service.py \
        backend/app/services/chat/answer_feedback_service.py backend/tests/test_chat_quality_schema.py \
        backend/tests/test_quality_service.py docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 8 본문 — 품질 검토(상담 단위 SD-08)·bad inbox(B3 즉시 KB금지)·예시은행·미해결 클러스터. 품질 저장 모델 미결 닫음(review table)"
```

> **Task 8 완료 조건**: 상담 단위 검토(문제없음 저장·미검토 우선 정렬)·오답 신고 bad inbox(source 2종)·적용→예시은행+KB 승인 경유·미해결 임베딩 저장 초록불 · 「문제없음」과 「아직 안 봄」 구분 확인 · 즉시 KB 라이브 금지 확인. 품질 저장 모델 미결 닫힘(SD-08). coverage 불변, prefix-check 빚·미배정 0·⏰0.
