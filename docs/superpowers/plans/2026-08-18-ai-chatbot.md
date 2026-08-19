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
