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
| **10** | 앱 상담방 셸 — 탭·피드·전송·이름·빈/오류·안전·가이드·이력 (29개; `CHAT-LEN-01`은 Task 5 오케스트레이션이 담음) | `CHAT-TAB-*`·`CHAT-ROOM-*`(기본·SEND)·`CHAT-GUIDE-*`·`CHAT-HISTORY-*` | ✅ 작성 |
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

## Task 9: 상담봇 라우터 연결 + 메시지 파이프라인 + §8 통합 테스트

> **화면 규칙 0개.** 백엔드 계약의 **마지막 태스크** — Task 1~8 서비스를 HTTP 엔드포인트(환자·익명·직원·관리자)로 묶고, **메시지 처리 파이프라인**(환자 메시지 저장 → `record_ai_activity` → `orchestrate` → 인계면 티켓·시스템 메시지·미해결 기록 / 답변이면 봇 메시지·근거 스냅샷 → 직원 답변이면 배칭)을 조립한다. 그리고 **3-A 원자성 수용 조건 12개(§8)를 통합 테스트 목록**으로 확인한다(단위는 T2·T3, 여기서 라우터·파이프라인을 통과해도 유지되는지).
>
> **근거 원본**: 3A §8(원자성 12)·§9(완료 기준) · 옛 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:56-58`(라우터 3종) · 1단계 라우터 패턴 `backend/app/routers/appointments.py`(`APIRouter`·`Depends(require_role)`·Pydantic).
>
> ⭐ **설계 결정(기각안 포함)**: **메시지 파이프라인은 서버 한 곳(`chat_flow_service.handle_patient_message`)에 조립하고, 라우터는 얇게 둔다.** LLM·임베더는 여기서 `get_chat_model()`·`get_embedding_client()`로 주입(테스트는 모킹). *기각: 라우터마다 오케스트레이션 조립* — 환자·익명·마감후연결이 파이프라인을 각자 복제해 어긋난다.

**Files:**
- Create: `backend/app/routers/chat.py`(환자·익명) · `backend/app/routers/staff_chat.py`(직원) · `backend/app/routers/admin_chat.py`(관리자)
- Create: `backend/app/services/chat/chat_flow_service.py`(파이프라인 조립)
- Modify: `backend/app/main.py`(라우터 3개 include)
- Create: `backend/tests/test_chat_integration.py`(§8 1~12 추적)

**Interfaces:**
- Consumes: Task 1~8 전부 — `ticket_service`·`ai_session_service`·`orchestrator`·`card_builder`·`rag_service`·`quality_service`·`answer_feedback_service`·`kb_service`·`enqueue_staff_reply_notification`·`create_support_ticket`·`anonymous_service` · `get_chat_model`·`get_embedding_client` · 1단계 `require_role`·`get_current_staff` · 3단계 환자 인증 의존성(`get_current_patient` 전제)
- Produces:
  - `chat_flow_service.handle_patient_message(session, content, *, client_message_id, embedder, model) -> dict`(파이프라인 — orchestrate 결과를 메시지·티켓·근거·미해결로 반영)
  - 라우터: `POST /chat/messages`·`POST /chat/sessions`(새/이어가기)·`POST /chat/read`(배치 확인)·`GET /chat/threads/{id}/messages` · `GET /staff/chat/tickets`·`POST /staff/chat/tickets/{id}/claim|messages|close` · `POST /admin/chat/kb`·`.../kb/{id}/approve`·`.../feedback/{id}/apply|reject`·`GET /admin/chat/quality`
  - 익명 의존성 `get_anonymous_session`(헤더 `X-Anon-Token` → `anonymous_service.upsert_session`)
- ⚠️ **아직 안 하는 것**: 화면(앱·웹·직원·관리자)=Task 10~22 · 실제 SMS/push 발송=dispatcher(배포) · 배포 배치.

- [ ] **Step 1: 파이프라인 서비스 작성**

`backend/app/services/chat/chat_flow_service.py`:
```python
from uuid import UUID

from app.db.pool import get_pool
from app.services.chat import orchestrator, rag_service, quality_service, ticket_service
from app.services.chat.ai_session_service import record_activity


async def handle_patient_message(session, content: str, *, thread_id: UUID,
                                 client_message_id: UUID | None, embedder, model) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # 1. 환자 메시지 저장(멱등). AI 세션 문맥.
        pmsg = await conn.fetchrow(
            "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, sender_patient_id, "
            "message_type, content, client_message_id) "
            "select $1,$2,'patient', t.patient_id, 'text', $3, $4 from chat_threads t where t.id=$1 "
            "on conflict (client_message_id) where client_message_id is not null do nothing returning *",
            thread_id, session.id, content, client_message_id)
        # 2. 30분 연장(만료됐으면 record_activity가 막는다 → 상위에서 새 세션 안내).
        await conn.execute("select record_ai_activity($1)", session.id)
        # 3. 최근 히스토리(롤링 윈도우).
        hist = await conn.fetch(
            "select content from chat_messages where thread_id=$1 and content is not null "
            "order by created_at desc, id desc limit $2", thread_id, orchestrator.CHAT_CONTEXT_TURN_WINDOW)
    history_texts = [h["content"] for h in reversed(hist)]

    async def rag_fn(s, m):
        return await rag_service.rag_answer(m, embedder=embedder, model=model)

    out = await orchestrator.orchestrate(session, content, history_texts=history_texts,
                                         rag_fn=rag_fn, model=model)
    async with pool.acquire() as conn:
        if out["route_taken"] == "handoff":
            # AI 세션 종료 + 티켓 생성 + 시스템 메시지. no_answer면 미해결 기록.
            await conn.execute(
                "update ai_chat_sessions set status='ended', ended_at=now(), end_reason='staff_handoff' where id=$1",
                session.id)
            ticket = await conn.fetchrow(
                "select * from create_support_ticket($1, $2, null, null)", thread_id, session.id)
            await conn.execute(
                "insert into chat_messages (thread_id, support_ticket_id, sender_type, message_type, payload) "
                "values ($1,$2,'system','system', $3)", thread_id, ticket["id"],
                '{"event":"staff_handoff","reason":"' + out["handoff_reason"] + '"}')
            if out["handoff_reason"] == "no_answer":
                await quality_service.record_unresolved(ticket["id"], content, embedder)
            return {"route_taken": "handoff", "ticket_id": ticket["id"], "reason": out["handoff_reason"]}
        # 봇 답변(응급·rag·department_guide). route_taken 기록 + 근거 스냅샷.
        bmsg = await conn.fetchrow(
            "insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content, route_taken) "
            "values ($1,$2,'bot','text',$3,$4) returning id", thread_id, session.id,
            out.get("reply") or "", out["route_taken"])
    if out.get("sources"):
        await rag_service.record_answer_sources(bmsg["id"], out["sources"])
    return {"route_taken": out["route_taken"], "message_id": bmsg["id"],
            "reply": out.get("reply"), "restricted_block": out.get("restricted_block")}
```

- [ ] **Step 2: 라우터 작성(얇게)**

`backend/app/routers/chat.py`(발췌 — 환자 메시지 전송):
```python
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.security import get_current_patient   # 3단계 환자 인증
from app.integrations.embedding_client import get_embedding_client
from app.integrations.langchain_client import get_chat_model
from app.services.chat import chat_flow_service, ai_session_service

router = APIRouter(prefix="/chat", tags=["chat"])


class SendMessageRequest(BaseModel):
    thread_id: UUID
    ai_chat_session_id: UUID
    content: str
    client_message_id: UUID | None = None


@router.post("/messages")
async def send_message(body: SendMessageRequest, patient=Depends(get_current_patient)):
    # session 로드는 서비스가 소유권과 함께 검증한다. 여기선 얇게 위임.
    session = await ai_session_service.load_owned_session(patient, body.ai_chat_session_id, body.thread_id)
    return await chat_flow_service.handle_patient_message(
        session, body.content, thread_id=body.thread_id, client_message_id=body.client_message_id,
        embedder=get_embedding_client(), model=get_chat_model())
```

`backend/app/routers/staff_chat.py`(발췌 — 티켓 큐·배정·답변·종료):
```python
from uuid import UUID
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.security import get_current_staff, StaffContext
from app.services.chat import ticket_service
from app.services.chat.enqueue import enqueue_after_reply   # staff_send 후 배칭 호출 래퍼

router = APIRouter(prefix="/staff/chat", tags=["staff-chat"])


@router.post("/tickets/{ticket_id}/claim")
async def claim(ticket_id: UUID, staff: StaffContext = Depends(get_current_staff)):
    return await ticket_service.claim_ticket(staff.auth_user_id, ticket_id)   # 경쟁 패자=409


class ReplyRequest(BaseModel):
    content: str
    client_message_id: UUID | None = None


@router.post("/tickets/{ticket_id}/messages")
async def reply(ticket_id: UUID, body: ReplyRequest, staff: StaffContext = Depends(get_current_staff)):
    msg = await ticket_service.staff_send_message(staff.auth_user_id, ticket_id, body.content, body.client_message_id)
    await enqueue_after_reply(msg["id"])   # 보고 있으면 즉시읽음, 아니면 배치(§8-6~8)
    return msg


@router.post("/tickets/{ticket_id}/close")
async def close(ticket_id: UUID, staff: StaffContext = Depends(get_current_staff)):
    return await ticket_service.close_ticket(staff.auth_user_id, ticket_id)   # answered=이때만
```

> 관리자 `admin_chat.py`는 같은 패턴으로 `kb_service`·`answer_feedback_service`·`quality_service`를 `Depends(require_role("admin"))` 뒤에 위임한다(KB 승인·bad inbox 적용/반려·품질 목록). `main.py`에 세 라우터 `include_router`.

- [ ] **Step 3: §8 원자성 12개 통합 테스트 (추적 목록)**

> ⭐ **§8 12개 = 상담봇 스키마 단계의 완료 기준.** 대부분 T2·T3에서 단위로 검증했고, 여기서는 **라우터·파이프라인을 통과해도 유지되는지**를 통합으로 확인한다. 아래 추적표의 각 항목이 초록불이어야 Task 9가 닫힌다.

`backend/tests/test_chat_integration.py`(핵심 통합 3건 + 나머지 추적):
```python
import uuid
import pytest

from app.services.chat import chat_flow_service
from tests.conftest import seed_patient, seed_staff
from tests.conftest_chat import seed_chat_thread, FakeEmbedder


class _RagModel:
    async def ainvoke(self, _):
        class R: content = "rag"      # 라우터가 rag로 분류
        return R()


@pytest.mark.asyncio
async def test_no_answer_message_creates_handoff_ticket_and_unresolved(committed_conn):
    # §8 파이프라인: 봇이 못 답하면(빈 KB → no_answer) 티켓 생성 + 미해결 기록 + AI 세션 staff_handoff 종료.
    p = await seed_patient(committed_conn)
    t = await seed_chat_thread(committed_conn, patient_id=p["patient_id"])
    s = await committed_conn.fetchrow(
        "insert into ai_chat_sessions (thread_id, expires_at) values ($1, now()+interval '30 min') returning *", t)
    out = await chat_flow_service.handle_patient_message(
        s, "우리 동네 약국 어디", thread_id=t, client_message_id=uuid.uuid4(),
        embedder=FakeEmbedder(), model=_RagModel())
    assert out["route_taken"] == "handoff" and out["reason"] == "no_answer"
    tk = await committed_conn.fetchrow("select status from support_tickets where id=$1", out["ticket_id"])
    assert tk["status"] == "pending"
    assert await committed_conn.fetchval(
        "select count(*) from unresolved_questions where ticket_id=$1", out["ticket_id"]) == 1
    assert await committed_conn.fetchval(
        "select status from ai_chat_sessions where id=$1", s["id"]) == "ended"
    # cleanup
    await committed_conn.execute("delete from unresolved_questions where ticket_id=$1", out["ticket_id"])
    await committed_conn.execute("delete from chat_messages where thread_id=$1", t)
    await committed_conn.execute("delete from support_tickets where id=$1", out["ticket_id"])
    await committed_conn.execute("delete from ai_chat_sessions where id=$1", s["id"])
    await committed_conn.execute("delete from chat_threads where id=$1", t)
    await committed_conn.execute("delete from patients where id=$1", p["patient_id"])


# 나머지 §8 추적: 아래는 단위 테스트가 이미 보증한다. 통합에서 재확인할 항목만 여기에 둔다.
#  §8-1 두 직원 claim 한 명 승 ......... test_ticket_service.test_two_staff_claim_only_one_wins
#  §8-2 send 유지·close만 answered ...... test_ticket_service.test_send_keeps_in_progress_only_close_answers
#  §8-3 완료 티켓 재개불가·재문의 새 PK .. test_ticket_service.test_closed_ticket_rejects_message_and_reticket_makes_new
#  §8-4 동일 client_message_id 한 행 ..... test_ticket_service.test_duplicate_client_message_id_makes_one_row
#  §8-5 만료 배치↔활동 상호배제 ......... test_ai_session_service.test_expire_batch_and_activity_are_mutually_exclusive
#  §8-6 연속 답변 한 배치 ............... test_chat_notification_batching.test_consecutive_replies_make_one_batch
#  §8-7 확인 후 새 배치 ................. test_chat_notification_batching.test_ack_then_new_reply_makes_new_batch
#  §8-8 보고 있으면 배치 없음 ........... test_chat_notification_batching.test_viewing_makes_no_batch_and_marks_read
#  §8-9 익명 해시=환자여도 미연결 ....... test_chat_notification_batching.test_anonymous_hash_matching_patient_does_not_link
#  §8-11 익명도 SMS 대상·patient_id null . test_chat_notification_batching.test_anonymous_verified_contact_gets_batch_with_null_patient
#  §8-12 두 경로 같은 파이프라인 ........ (위 6·11이 함께 보증) + notification_recipient.resolve_recipient
#  §8-10 Realtime 재연결 커서 복원 ...... 구현 시 통합(커서 조회는 chat_messages(thread_id, created_at, id) 인덱스)
```

- [ ] **Step 4: 테스트 통과 확인** — Run: `cd backend && pytest tests/test_chat_integration.py -v` → Expected: PASS. (§8 나머지는 위 추적 파일들 실행 시 초록불.)

- [ ] **Step 5: 커밋**

```bash
git add backend/app/routers/chat.py backend/app/routers/staff_chat.py backend/app/routers/admin_chat.py \
        backend/app/services/chat/chat_flow_service.py backend/app/main.py \
        backend/tests/test_chat_integration.py docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 9 본문 — 라우터 3종(환자·익명/직원/관리자) + 메시지 파이프라인 조립 + §8 원자성 12개 통합 추적. 백엔드 계약(0~9) 완결"
```

> **Task 9 완료 조건**: 파이프라인(메시지 저장→활동연장→orchestrate→인계 티켓/미해결·봇 답변/근거)·라우터 3종·§8 통합(no_answer→티켓+미해결+세션종료) 초록불 · §8 12개 추적표가 전부 초록불(단위+통합) 확인. ⭐ **백엔드 계약(Task 0~9) 완결 — 3-A §9 완료 기준 충족.** coverage 불변, prefix-check 빚·미배정 0·⏰0.

---

## Task 10: 앱 상담방 셸 — 5번째 탭 · 피드 · 전송 · 안전/가이드 배너 · 이전 상담 목록 · 딥링크

> **화면 국면 시작.** 여기부터는 규칙 0개 계약이 아니라 `test('[규칙ID] …')`로 **실제 화면 규칙을 담는다**(coverage가 오른다). 이 태스크는 환자 앱(Flutter) `AI 상담` 탭의 **셸**만 만든다 — 시간순 한 피드·자유 입력·전송/재전송·안전/가이드 배너·이전 상담 목록·직원 답변 푸시 딥링크. **라이브/인계·긴급·장애(T11)와 카드(T12·T13)는 이 셸이 남긴 슬롯에 얹는다.**
>
> **근거 원본**: `docs/design/screen-behaviors.md` 상담봇 절 §1(하단 탭)·§2(독립 상담방)·§11(진료과 배너)·§17(이전 상담 목록) · 정본 `docs/design/chatbot-source-of-truth.md` §0(환자 노출 이름·안전·값 조작 금지)·§2(카드=표시 스냅샷) · 결정로그 R2-1(채팅 전용 카드)·R2-3A-Q2(머리말 구분)·B1(콜드스타트 딥링크) · 요구사항 `docs/고객요구사항.txt` **5.1 상담봇이 등장하는 곳**·**5.5 모르는 질문과 직원 연결**.
>
> ⭐ **설계 결정(기각안 포함)**: **피드는 한 개의 `ListView`에 말풍선·카드·배너를 시간순으로 섞고, 카드/라이브 배너는 주입 슬롯(`cardBuilder`·`liveSlotBuilder`)으로 비워 둔다.** *기각: 카드를 전체화면·팝업으로 분리*(`CHAT-ROOM-FEED-01`이 금지 — "별도 전체화면처럼 바꾸지 않는다") · *기각: 셸이 카드 위젯을 직접 그림*(T12·T13이 카드 사전을 소유하므로 셸이 카드를 알면 두 태스크가 카드 렌더를 복제해 어긋난다). **셸은 `payload.card_type`만 읽어 슬롯에 넘긴다.**

**Files:**
- Create: `patient_app/lib/features/chat/chat_models.dart` (`ChatFeedItem`·`ChatSendState`·`ChatRoomState`·`ChatThreadSummary` — 피드 아이템 union·전송 상태)
- Create: `patient_app/lib/features/chat/chat_repository.dart` (`ChatRepository` — 4단계 챗봇 엔드포인트 호출)
- Create: `patient_app/lib/features/chat/chat_room_controller.dart` (`ChatRoomController`·`chatRoomProvider` — 복원·전송·재전송·읽음)
- Create: `patient_app/lib/features/chat/chat_room_view.dart` (`ChatRoomView` — 셸 화면: 로딩·오류·빈·피드·입력)
- Create: `patient_app/lib/features/chat/widgets/chat_feed.dart` (`ChatFeed` — 시간순 피드 + `cardBuilder`·`liveSlotBuilder` 슬롯)
- Create: `patient_app/lib/features/chat/widgets/chat_bubble.dart` (`ChatBubble` — 환자/봇/시스템 말풍선 + `진료 안내`/`병원 이용 안내` 머리말)
- Create: `patient_app/lib/features/chat/widgets/chat_input_bar.dart` (`ChatInputBar` — 항상 열린 자유 입력 + 빠른답변 슬롯)
- Create: `patient_app/lib/features/chat/widgets/chat_safety_banner.dart` (`ChatSafetyBanner` — 고정 안전 표시)
- Create: `patient_app/lib/features/chat/widgets/chat_guide_banner.dart` (`ChatGuideBanner` — 진료과 추천 진행 배너 + `onUrgent` 훅)
- Create: `patient_app/lib/features/chat/chat_history_view.dart` (`ChatHistoryView`·`chatHistoryProvider` — 이전 상담 목록)
- Create: `patient_app/lib/features/chat/chat_deep_link.dart` (`resolveChatDeepLink`·`resolveChatDestination` — 직원 답변 푸시 딥링크)
- Modify: `patient_app/lib/core/router.dart` (`/chat`·`/chat/room/:threadId` 라우트 등록 + 콜드스타트 인증 게이트)
- Modify: `patient_app/lib/app_shell.dart` (T16 `AppShell` `mainTabs`에 5번째 `AI 상담` 탭 추가)
- Modify: `patient_app/lib/features/notifications/notification_view.dart` (T18 `NotificationView`에 `chatThreadId` 노출 + `resolveNotificationRoute`의 `chat_reply`가 thread 있으면 `/chat/room/:id`)
- Test: `patient_app/test/features/chat/chat_models_test.dart` · `chat_repository_test.dart` · `chat_room_controller_test.dart` · `chat_room_view_test.dart` · `chat_bubble_test.dart` · `chat_input_bar_test.dart` · `chat_safety_banner_test.dart` · `chat_guide_banner_test.dart` · `chat_history_view_test.dart` · `chat_deep_link_test.dart` · `chat_tab_test.dart`

**Interfaces:**
- Consumes:
  - **4단계 백엔드(Task 9 라우터)**: `GET /chat/threads/{id}/messages`(복원) · `POST /chat/sessions`(새/이어가기) · `POST /chat/messages`(body `{thread_id, content, client_message_id}` — `client_message_id` 멱등, Task 1 `chat_messages.client_message_id` unique) · `POST /chat/read`(body `{batch_id}` 배치 확인) · `GET /chat/threads`(이전 상담 목록). 응답 메시지 = Task 1 스키마(`message_type`·`sender_type`·`content` nullable·`payload jsonb`·`created_at`·`client_message_id`).
  - **오케스트레이션 계약(Task 5)**: 봇 답변 메시지의 `payload.notice_kind`(`medical`|`general`) — `CHAT-ROOM-VISUAL-01` 머리말 판정. 진료과 추천 갈래는 `payload.active_flow == 'department_guide'` — `CHAT-GUIDE` 배너 표시. 응급 전환은 `payload.route_taken == 'emergency'`(→ `onUrgent` 훅, 화면 전환 본체는 T11).
  - **알림 배칭(Task 3)**: 직원 답변 알림 배치 = `chat_notification_batches`. 푸시 payload가 `thread_id`·`batch_id`를 실어 온다. `POST /chat/read`가 `acknowledge_chat_batches`를 부른다.
  - **환자앱(3단계)**: `ApiClient`/`apiClientProvider`(T0) · `AppTokens`·`AppCard`·`WarnText`·`EmptyState`·`InlineError`(T0/T12) · `appRouter`(T0) · `AppShell`·`mainTabs`(T16) · `NotificationView`·`resolveNotificationRoute`·`showNotificationGoneDialog`(T18) · `AuthState`·`AuthStatus`·`authStateChangesProvider`(T0/T14) · `ApiException`(T0).
- Produces (T11·T12·T13이 소비):
  - `ChatFeedItem`(`.fromJson` · `messageType`·`senderType`·`content`·`payload`·`createdAt`·`clientMessageId`·`sendState`·`noticeKind`) · `ChatSendState`(`sent`/`sending`/`failed`) · `ChatRoomState`(`loading`/`error`/`loaded`·`items`·`batchId`) · `ChatThreadSummary`(`.fromJson`).
  - `ChatRepository`(`fetchMessages`/`openSession`/`sendMessage`/`markRead`/`fetchThreads`) · `chatRepositoryProvider`.
  - `ChatRoomController`(`load`/`send`/`retry`/`markRead` · `sendMessage(content)` 멱등) · `chatRoomProvider(threadId)`(`StateNotifierProvider.family`) — **T11이 라이브/인계·재문의 전이를 이 컨트롤러에 확장한다**.
  - `ChatFeed`(`items`·`cardBuilder`·`liveSlotBuilder` 슬롯 — **T12·T13이 `cardBuilder`, T11이 `liveSlotBuilder` 채움**) · `ChatBubble` · `ChatInputBar`(`quickRepliesSlot` — T12가 빠른답변 채움) · `ChatSafetyBanner` · `ChatGuideBanner`(`onUrgent` — T11 CHAT-URGENT 주입).
  - `/chat`(이전 상담 목록) · `/chat/room/:threadId`(상담방) 라우트명 · `resolveChatDeepLink(NotificationView) -> String?`.

---

- [ ] **Step 1a: `ChatFeedItem` 모델 실패 테스트** — `patient_app/test/features/chat/chat_models_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/chat_models.dart';

void main() {
  Map<String, dynamic> _msg({
    String type = 'text', String sender = 'bot', String? content = '안녕하세요',
    Map<String, dynamic>? payload,
  }) => {
    'id': 'm1', 'message_type': type, 'sender_type': sender,
    'content': content, 'payload': payload, 'created_at': '2026-08-19T09:00:00Z',
    'client_message_id': null,
  };

  test('[CHAT-ROOM-FEED-01] 메시지·카드가 같은 피드 아이템 타입으로 섞인다 — 카드는 payload.card_type만 읽는다', () {
    final text = ChatFeedItem.fromJson(_msg(type: 'text', content: '안녕'));
    final card = ChatFeedItem.fromJson(_msg(
      type: 'card', content: null, payload: {'card_type': 'time_select'}));
    expect(text.messageType, 'text');
    expect(card.messageType, 'card');
    expect(card.cardType, 'time_select'); // 셸은 card_type만 안다(위젯은 T12·T13)
    expect(card.content, isNull);          // 카드는 content가 알맹이가 아님(Task 1: content nullable)
  });

  test('[CHAT-ROOM-VISUAL-01] 봇 안내는 payload.notice_kind로 진료/병원 머리말을 가른다 — 색이 아니다', () {
    final medical = ChatFeedItem.fromJson(_msg(payload: {'notice_kind': 'medical'}));
    final general = ChatFeedItem.fromJson(_msg(payload: {'notice_kind': 'general'}));
    final plain = ChatFeedItem.fromJson(_msg(payload: null));
    expect(medical.noticeKind, NoticeKind.medical);
    expect(general.noticeKind, NoticeKind.general);
    expect(plain.noticeKind, isNull); // 구분 대상 아님 — 머리말 없음
  });

  test('[CHAT-ROOM-EXC-01] 서버 상태·시간·사유가 없으면 값을 지어내지 않고 unknown으로 남긴다', () {
    // sender_type·created_at이 비면 화면이 임의 시각/발신자를 만들지 않는다.
    final bad = ChatFeedItem.fromJson({'id': 'x', 'message_type': 'text',
      'sender_type': null, 'content': '?', 'created_at': null, 'payload': null});
    expect(bad.isUnknown, isTrue);       // 조회 오류/직원 확인 필요로 처리할 신호
    expect(bad.createdAt, isNull);       // "지금"으로 채우지 않는다
  });

  test('[CHAT-HISTORY-RESTORE-01] 시스템 이벤트(인계 상태)도 같은 식별자로 복원된다', () {
    final sys = ChatFeedItem.fromJson(_msg(type: 'system', sender: 'system',
      content: null, payload: {'event': 'handoff_started'}));
    expect(sys.messageType, 'system');
    expect(sys.payload!['event'], 'handoff_started'); // 인계 상태 보존(T11이 렌더)
  });
}
```
Run: `flutter test test/features/chat/chat_models_test.dart` → Expected: FAIL(`chat_models.dart` 없음).

- [ ] **Step 1b: `ChatFeedItem`·`ChatSendState`·`ChatRoomState` 구현** — `patient_app/lib/features/chat/chat_models.dart`

```dart
/// 상담방 피드의 한 줄. 말풍선·카드·시스템 이벤트를 한 union으로 표현한다(CHAT-ROOM-FEED-01).
/// 셸은 카드의 알맹이를 모른다 — `cardType`(payload.card_type)만 읽어 T12·T13 슬롯에 넘긴다.
enum NoticeKind { medical, general }        // CHAT-ROOM-VISUAL-01 머리말
enum ChatSendState { sent, sending, failed } // 환자 말풍선 전송 상태(CHAT-ROOM-SEND-*)

class ChatFeedItem {
  final String id;
  final String messageType;        // 'text' | 'card' | 'system'
  final String? senderType;        // 'patient' | 'bot' | 'staff' | 'system' (없으면 unknown)
  final String? content;           // 카드·시스템은 null 가능(Task 1: content nullable)
  final Map<String, dynamic>? payload;
  final DateTime? createdAt;
  final String? clientMessageId;   // 환자 전송 멱등 키(CHAT-ROOM-SEND-01·03)
  final ChatSendState sendState;

  const ChatFeedItem({
    required this.id, required this.messageType, this.senderType, this.content,
    this.payload, this.createdAt, this.clientMessageId,
    this.sendState = ChatSendState.sent,
  });

  String? get cardType => payload?['card_type'] as String?;
  NoticeKind? get noticeKind => switch (payload?['notice_kind']) {
        'medical' => NoticeKind.medical,
        'general' => NoticeKind.general,
        _ => null,
      };
  // CHAT-ROOM-EXC-01: 발신자나 시각이 비면 값을 지어내지 않고 unknown으로 표시한다.
  bool get isUnknown => senderType == null || createdAt == null;

  factory ChatFeedItem.fromJson(Map<String, dynamic> j) => ChatFeedItem(
        id: j['id'] as String,
        messageType: j['message_type'] as String,
        senderType: j['sender_type'] as String?,
        content: j['content'] as String?,
        payload: (j['payload'] as Map?)?.cast<String, dynamic>(),
        createdAt: (j['created_at'] as String?) == null
            ? null
            : DateTime.parse(j['created_at'] as String),
        clientMessageId: j['client_message_id'] as String?,
      );

  ChatFeedItem copyWith({ChatSendState? sendState}) => ChatFeedItem(
        id: id, messageType: messageType, senderType: senderType, content: content,
        payload: payload, createdAt: createdAt, clientMessageId: clientMessageId,
        sendState: sendState ?? this.sendState);
}

/// 상담방 로드 상태(CHAT-ROOM-LOAD-01·ERR-01·EMPTY-01). loaded일 때만 items를 그린다.
enum ChatRoomPhase { loading, error, loaded }

class ChatRoomState {
  final ChatRoomPhase phase;
  final List<ChatFeedItem> items;
  final String? batchId;   // 보고 있으면 이 배치를 읽음 처리(CHAT-ROOM-NOTIFY-01)
  const ChatRoomState(this.phase, {this.items = const [], this.batchId});

  bool get isEmpty => phase == ChatRoomPhase.loaded && items.isEmpty; // 첫 상담(EMPTY-01)
}

/// 이전 상담 목록의 한 행(CHAT-HISTORY-LIST-01).
class ChatThreadSummary {
  final String threadId;
  final String? lastSnippet;
  final DateTime? lastAt;
  const ChatThreadSummary({required this.threadId, this.lastSnippet, this.lastAt});
  factory ChatThreadSummary.fromJson(Map<String, dynamic> j) => ChatThreadSummary(
        threadId: j['thread_id'] as String,
        lastSnippet: j['last_snippet'] as String?,
        lastAt: (j['last_at'] as String?) == null
            ? null : DateTime.parse(j['last_at'] as String));
}
```
Run: `flutter test test/features/chat/chat_models_test.dart` → Expected: PASS.

- [ ] **Step 2a: `ChatRepository` 실패 테스트** — `patient_app/test/features/chat/chat_repository_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:patient_app/core/api_client.dart';
import 'package:patient_app/features/chat/chat_repository.dart';

void main() {
  ChatRepository _repo(MockClient mock) => ChatRepository(ApiClient(
        baseUrl: 'http://x', tokenProvider: () async => 'tk', httpClient: mock));

  test('[CHAT-ROOM-SEND-01] 전송은 client_message_id를 실어 보낸다 — 서버 멱등 키', () async {
    String? sentBody;
    final r = _repo(MockClient((req) async {
      sentBody = req.body;
      return http.Response('{"id":"m9"}', 200);
    }));
    await r.sendMessage(threadId: 't1', content: '안녕', clientMessageId: 'c-123');
    expect(sentBody, contains('c-123'));
    expect(sentBody, contains('안녕'));
  });

  test('[CHAT-ROOM-SEND-03] 재전송은 같은 client_message_id를 그대로 재사용한다', () async {
    final ids = <String>[];
    final r = _repo(MockClient((req) async {
      ids.add(RegExp(r'"client_message_id":"([^"]+)"').firstMatch(req.body)!.group(1)!);
      return http.Response('{"id":"m9"}', 200);
    }));
    await r.sendMessage(threadId: 't1', content: 'x', clientMessageId: 'same');
    await r.sendMessage(threadId: 't1', content: 'x', clientMessageId: 'same'); // 재전송
    expect(ids, ['same', 'same']); // 새 키를 만들지 않는다 → 서버가 중복 저장 거부
  });

  test('[CHAT-HISTORY-LIST-01] fetchThreads가 이전 상담 요약 목록을 준다', () async {
    final r = _repo(MockClient((req) async => http.Response(
        '[{"thread_id":"t1","last_snippet":"두통","last_at":"2026-08-18T10:00:00Z"}]', 200)));
    final list = await r.fetchThreads();
    expect(list.single.threadId, 't1');
    expect(list.single.lastSnippet, '두통');
  });

  test('[CHAT-ROOM-NOTIFY-01] markRead는 batch_id로 확인 배치를 닫는다', () async {
    String? body;
    final r = _repo(MockClient((req) async { body = req.body; return http.Response('{}', 200); }));
    await r.markRead(batchId: 'b5');
    expect(body, contains('b5'));
  });
}
```
Run: `flutter test test/features/chat/chat_repository_test.dart` → Expected: FAIL(`chat_repository.dart` 없음).

- [ ] **Step 2b: `ChatRepository` 구현** — `patient_app/lib/features/chat/chat_repository.dart`

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/providers.dart';
import 'chat_models.dart';

/// 4단계 챗봇 라우터(Task 9)의 얇은 클라이언트. 오케스트레이션·멱등은 전부 서버가 하고,
/// 여기서는 client_message_id를 실어 보내기만 한다(CHAT-ROOM-SEND-01·03).
class ChatRepository {
  final ApiClient _api;
  ChatRepository(this._api);

  Future<List<ChatFeedItem>> fetchMessages(String threadId) async {
    final res = await _api.get('/chat/threads/$threadId/messages');
    return (res as List).map((e) => ChatFeedItem.fromJson(e)).toList();
  }

  Future<String> openSession({String? resumeFrom}) async {
    final res = await _api.post('/chat/sessions',
        body: resumeFrom == null ? {} : {'resume_from': resumeFrom});
    return res['thread_id'] as String;
  }

  Future<ChatFeedItem> sendMessage({
    required String threadId, required String content, required String clientMessageId,
  }) async {
    final res = await _api.post('/chat/messages', body: {
      'thread_id': threadId, 'content': content, 'client_message_id': clientMessageId,
    });
    return ChatFeedItem.fromJson(res);
  }

  Future<void> markRead({required String batchId}) =>
      _api.post('/chat/read', body: {'batch_id': batchId});

  Future<List<ChatThreadSummary>> fetchThreads() async {
    final res = await _api.get('/chat/threads');
    return (res as List).map((e) => ChatThreadSummary.fromJson(e)).toList();
  }
}

final chatRepositoryProvider = Provider<ChatRepository>(
    (ref) => ChatRepository(ref.watch(apiClientProvider)));
```
Run: `flutter test test/features/chat/chat_repository_test.dart` → Expected: PASS.

- [ ] **Step 3a: `ChatRoomController` 실패 테스트(복원·전송·재전송)** — `patient_app/test/features/chat/chat_room_controller_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/chat_models.dart';
import 'package:patient_app/features/chat/chat_room_controller.dart';

// 가짜 저장소: 시나리오를 주입한다.
class _FakeRepo implements ChatRepositoryLike {
  List<ChatFeedItem>? messages; Object? loadError; Object? sendError;
  final List<String> sentIds = [];
  @override Future<List<ChatFeedItem>> fetchMessages(String t) async {
    if (loadError != null) throw loadError!;
    return messages ?? [];
  }
  @override Future<ChatFeedItem> sendMessage({required String threadId,
      required String content, required String clientMessageId}) async {
    sentIds.add(clientMessageId);
    if (sendError != null) throw sendError!;
    return ChatFeedItem(id: 'srv', messageType: 'text', senderType: 'patient',
        content: content, createdAt: DateTime(2026), clientMessageId: clientMessageId);
  }
  @override Future<void> markRead({required String batchId}) async {}
}

void main() {
  test('[CHAT-ROOM-LOAD-01] 시작은 loading — 첫 상담/0건을 먼저 그리지 않는다', () {
    final c = ChatRoomController(_FakeRepo(), threadId: 't1');
    expect(c.state.phase, ChatRoomPhase.loading); // load() 전엔 loaded/empty가 아님
  });

  test('[CHAT-ROOM-EMPTY-01] 복원 0건이면 오류가 아니라 empty(loaded)로 — 시작 안내 자리', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    expect(c.state.phase, ChatRoomPhase.loaded);
    expect(c.state.isEmpty, isTrue); // 조회 오류가 아니다(ERR과 구분)
  });

  test('[CHAT-ROOM-ERR-01] 복원 실패는 error — 새 빈 대화로 덮어쓰지 않는다', () async {
    final repo = _FakeRepo()..loadError = Exception('boom');
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    expect(c.state.phase, ChatRoomPhase.error); // empty가 아니다(빈 대화 위장 금지)
  });

  test('[CHAT-ROOM-SEND-01] 전송 중엔 sending 말풍선을 낙관적으로 넣고 같은 메시지 중복 전송을 막는다', () async {
    final repo = _FakeRepo()..messages = [];
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    final f = c.send('두통이 있어요'); // await 전 상태 확인
    final optimistic = c.state.items.last;
    expect(optimistic.sendState, ChatSendState.sending);
    c.send('두통이 있어요'); // 같은 내용 즉시 재탭 — 진행 중이면 무시(중복 방지)
    expect(c.state.items.where((i) => i.senderType == 'patient').length, 1);
    await f;
    expect(c.state.items.last.sendState, ChatSendState.sent);
  });

  test('[CHAT-ROOM-SEND-02] 전송 실패는 원문을 failed로 보존하고 봇 처리를 시작하지 않는다', () async {
    final repo = _FakeRepo()..messages = [] ..sendError = Exception('net');
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('안녕');
    final last = c.state.items.last;
    expect(last.sendState, ChatSendState.failed);
    expect(last.content, '안녕');            // 원문 보존
    expect(c.state.items.any((i) => i.senderType == 'bot'), isFalse); // 봇 답변 없음
  });

  test('[CHAT-ROOM-SEND-03] 재전송은 같은 client_message_id로 다시 보내고 새 말풍선을 안 만든다', () async {
    final repo = _FakeRepo()..messages = [] ..sendError = Exception('net');
    final c = ChatRoomController(repo, threadId: 't1');
    await c.load();
    await c.send('안녕');
    final failedId = c.state.items.last.clientMessageId;
    repo.sendError = null;                   // 이번엔 성공
    await c.retry(failedId!);
    expect(repo.sentIds, [failedId, failedId]); // 같은 키 재사용
    expect(c.state.items.where((i) => i.senderType == 'patient').length, 1); // 중복 없음
  });

  test('[CHAT-ROOM-NOTIFY-01] 상담방을 열면(load) 미확인 배치를 읽음 처리한다 — 보는 중엔 알리지 않는다', () async {
    var readBatch;
    final repo = _FakeRepo();
    final c = ChatRoomController(repo, threadId: 't1', onMarkRead: (b) => readBatch = b);
    await c.load(batchId: 'b7');
    expect(readBatch, 'b7'); // 열람 = 확인 → 서버가 그 배치로 새 알림을 내지 않는다
  });
}
```
Run: `flutter test test/features/chat/chat_room_controller_test.dart` → Expected: FAIL(`chat_room_controller.dart` 없음).

- [ ] **Step 3b: `ChatRoomController`·`chatRoomProvider` 구현** — `patient_app/lib/features/chat/chat_room_controller.dart`

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'chat_models.dart';
import 'chat_repository.dart';

/// 테스트에서 가짜 저장소를 주입하기 위한 최소 계약.
abstract class ChatRepositoryLike {
  Future<List<ChatFeedItem>> fetchMessages(String threadId);
  Future<ChatFeedItem> sendMessage({required String threadId, required String content,
      required String clientMessageId});
  Future<void> markRead({required String batchId});
}

/// 상담방 셸의 상태 기계. 복원(CHAT-ROOM-LOAD/EMPTY/ERR)·전송(SEND-01·02·03)·읽음(NOTIFY-01).
/// T11이 라이브/인계·재문의 전이를 이 컨트롤러에 확장한다(같은 피드·같은 식별자).
class ChatRoomController extends StateNotifier<ChatRoomState> {
  final ChatRepositoryLike _repo;
  final String threadId;
  final void Function(String batchId)? onMarkRead;
  int _seq = 0;
  ChatRoomController(this._repo, {required this.threadId, this.onMarkRead})
      : super(const ChatRoomState(ChatRoomPhase.loading));

  Future<void> load({String? batchId}) async {
    state = const ChatRoomState(ChatRoomPhase.loading);
    try {
      final items = await _repo.fetchMessages(threadId);
      state = ChatRoomState(ChatRoomPhase.loaded, items: items, batchId: batchId);
      if (batchId != null) {                 // CHAT-ROOM-NOTIFY-01: 열람 = 확인
        onMarkRead?.call(batchId);
        await _repo.markRead(batchId: batchId);
      }
    } catch (_) {
      state = const ChatRoomState(ChatRoomPhase.error); // 빈 대화로 덮지 않는다
    }
  }

  String _newClientId() => '${DateTime.now().microsecondsSinceEpoch}-${_seq++}';

  Future<void> send(String content) async {
    // CHAT-ROOM-SEND-01: 진행 중인 같은 내용이 있으면 중복 전송을 막는다.
    final dup = state.items.any((i) =>
        i.senderType == 'patient' && i.content == content &&
        i.sendState == ChatSendState.sending);
    if (dup) return;
    final cid = _newClientId();
    final optimistic = ChatFeedItem(id: cid, messageType: 'text', senderType: 'patient',
        content: content, createdAt: DateTime.now(), clientMessageId: cid,
        sendState: ChatSendState.sending);
    state = ChatRoomState(ChatRoomPhase.loaded,
        items: [...state.items, optimistic], batchId: state.batchId);
    await _deliver(cid, content);
  }

  Future<void> retry(String clientMessageId) async {
    final item = state.items.firstWhere((i) => i.clientMessageId == clientMessageId);
    _replace(clientMessageId, item.copyWith(sendState: ChatSendState.sending));
    await _deliver(clientMessageId, item.content!); // 같은 키 재사용(CHAT-ROOM-SEND-03)
  }

  Future<void> _deliver(String cid, String content) async {
    try {
      await _repo.sendMessage(threadId: threadId, content: content, clientMessageId: cid);
      _replace(cid, state.items.firstWhere((i) => i.clientMessageId == cid)
          .copyWith(sendState: ChatSendState.sent));
    } catch (_) {
      // CHAT-ROOM-SEND-02: 원문 보존 + failed. 봇 처리를 시작하지 않는다(성공 위장 금지).
      _replace(cid, state.items.firstWhere((i) => i.clientMessageId == cid)
          .copyWith(sendState: ChatSendState.failed));
    }
  }

  void _replace(String cid, ChatFeedItem next) {
    state = ChatRoomState(ChatRoomPhase.loaded,
        items: [for (final i in state.items) i.clientMessageId == cid ? next : i],
        batchId: state.batchId);
  }
}

final chatRoomProvider = StateNotifierProvider.family<ChatRoomController, ChatRoomState, String>(
    (ref, threadId) {
  final repo = ref.watch(chatRepositoryProvider);
  return ChatRoomController(_RepoAdapter(repo), threadId: threadId,
      onMarkRead: (_) {});
});

// 실 저장소를 컨트롤러 계약에 맞춘다(sendMessage 시그니처 동일).
class _RepoAdapter implements ChatRepositoryLike {
  final ChatRepository _r; _RepoAdapter(this._r);
  @override Future<List<ChatFeedItem>> fetchMessages(String t) => _r.fetchMessages(t);
  @override Future<ChatFeedItem> sendMessage({required String threadId,
      required String content, required String clientMessageId}) =>
      _r.sendMessage(threadId: threadId, content: content, clientMessageId: clientMessageId);
  @override Future<void> markRead({required String batchId}) => _r.markRead(batchId: batchId);
}
```
Run: `flutter test test/features/chat/chat_room_controller_test.dart` → Expected: PASS.

- [ ] **Step 4a: `ChatBubble` 실패 테스트(이름·머리말)** — `patient_app/test/features/chat/chat_bubble_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/chat_models.dart';
import 'package:patient_app/features/chat/widgets/chat_bubble.dart';

void main() {
  Future<void> _pump(WidgetTester t, ChatFeedItem item) => t.pumpWidget(
      MaterialApp(home: Scaffold(body: ChatBubble(item: item))));

  testWidgets('[CHAT-ROOM-NAME-01] 봇 발신자 이름은 AI 상담봇', (t) async {
    await _pump(t, const ChatFeedItem(id: 'm', messageType: 'text',
        senderType: 'bot', content: '안녕하세요'));
    expect(find.text('AI 상담봇'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-VISUAL-01] 의료 안내는 `진료 안내`, 일반은 `병원 이용 안내` 머리말', (t) async {
    await _pump(t, ChatFeedItem(id: 'm', messageType: 'text', senderType: 'bot',
        content: '내과를 추천합니다', payload: const {'notice_kind': 'medical'}));
    expect(find.text('진료 안내'), findsOneWidget);
    await _pump(t, ChatFeedItem(id: 'm', messageType: 'text', senderType: 'bot',
        content: '주차는 지하 1층', payload: const {'notice_kind': 'general'}));
    expect(find.text('병원 이용 안내'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-SEND-02] 전송 실패 말풍선엔 원문과 [재전송]이 함께 있다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatBubble(
        item: const ChatFeedItem(id: 'm', messageType: 'text', senderType: 'patient',
            content: '안녕', sendState: ChatSendState.failed),
        onRetry: () {}))));
    expect(find.text('안녕'), findsOneWidget);   // 원문 보존
    expect(find.text('재전송'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-EXC-01] unknown 아이템은 시각을 지어내지 않고 확인 필요로 표시', (t) async {
    await _pump(t, const ChatFeedItem(id: 'm', messageType: 'text',
        senderType: null, content: '?', createdAt: null));
    expect(find.textContaining('확인'), findsOneWidget); // 임의 시각/발신자 없음
  });
}
```
Run: `flutter test test/features/chat/chat_bubble_test.dart` → Expected: FAIL(`chat_bubble.dart` 없음).

- [ ] **Step 4b: `ChatBubble` 구현** — `patient_app/lib/features/chat/widgets/chat_bubble.dart`

```dart
import 'package:flutter/material.dart';
import '../../../core/tokens.dart';
import '../chat_models.dart';

/// 한 말풍선. 봇 이름은 AI 상담봇(CHAT-ROOM-NAME-01), 의료/일반 구분은 색이 아니라
/// 작은 머리말(CHAT-ROOM-VISUAL-01), 전송 실패는 원문 보존 + [재전송](CHAT-ROOM-SEND-02).
class ChatBubble extends StatelessWidget {
  final ChatFeedItem item;
  final VoidCallback? onRetry;
  const ChatBubble({super.key, required this.item, this.onRetry});

  String? get _heading => switch (item.noticeKind) {
        NoticeKind.medical => '진료 안내',
        NoticeKind.general => '병원 이용 안내',
        null => null,
      };

  @override
  Widget build(BuildContext context) {
    if (item.isUnknown) {
      return const Padding(padding: EdgeInsets.all(8),
          child: Text('직원 확인이 필요한 항목입니다', style: TextStyle(color: AppTokens.grayDone)));
    }
    final isBot = item.senderType == 'bot';
    return Column(
      crossAxisAlignment: isBot ? CrossAxisAlignment.start : CrossAxisAlignment.end,
      children: [
        if (isBot) const Text('AI 상담봇', style: TextStyle(fontSize: 12)),
        if (_heading != null) Text(_heading!, style: const TextStyle(fontSize: 11)),
        Container(padding: const EdgeInsets.all(10), child: Text(item.content ?? '')),
        if (item.sendState == ChatSendState.failed)
          TextButton(onPressed: onRetry, child: const Text('재전송')),
      ],
    );
  }
}
```
Run: `flutter test test/features/chat/chat_bubble_test.dart` → Expected: PASS.

- [ ] **Step 5a: `ChatInputBar`·`ChatSafetyBanner` 실패 테스트** — `patient_app/test/features/chat/chat_input_bar_test.dart`, `chat_safety_banner_test.dart`

```dart
// chat_input_bar_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/widgets/chat_input_bar.dart';

void main() {
  testWidgets('[CHAT-ROOM-INPUT-01] 자유 입력창은 빠른답변이 있어도 항상 열려 있다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatInputBar(
      onSend: (_) {},
      quickRepliesSlot: const Text('빠른답변1'), // 빠른답변이 있어도
    ))));
    expect(find.byType(TextField), findsOneWidget);        // 입력창 존재
    final field = t.widget<TextField>(find.byType(TextField));
    expect(field.enabled, isNot(false));                    // 비활성이 아니다
    expect(find.text('빠른답변1'), findsOneWidget);          // 슬롯도 함께
  });

  testWidgets('[CHAT-ROOM-INPUT-01] 빠른답변 슬롯이 없어도 입력창은 열려 있다', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ChatInputBar(onSend: _noop))));
    expect(find.byType(TextField), findsOneWidget);
  });
}
void _noop(String _) {}
```

```dart
// chat_safety_banner_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/widgets/chat_safety_banner.dart';

void main() {
  testWidgets('[CHAT-ROOM-SAFE-01] 진단이 아닌 진료과·병원 이용 안내임을 대화 중 계속 표시', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ChatSafetyBanner())));
    expect(find.textContaining('진단'), findsOneWidget);       // 진단이 아님을 명시
    expect(find.textContaining('진료과'), findsOneWidget);
  });
}
```
Run: `flutter test test/features/chat/chat_input_bar_test.dart test/features/chat/chat_safety_banner_test.dart` → Expected: FAIL.

- [ ] **Step 5b: `ChatInputBar`·`ChatSafetyBanner` 구현**

```dart
// patient_app/lib/features/chat/widgets/chat_input_bar.dart
import 'package:flutter/material.dart';
/// 자유 입력창은 항상 열려 있다(CHAT-ROOM-INPUT-01). 빠른답변은 위 슬롯으로만 얹고
/// 입력을 대체하지 않는다 — 빠른답변만 쓰도록 강제하지 않는다.
class ChatInputBar extends StatefulWidget {
  final void Function(String content) onSend;
  final Widget? quickRepliesSlot; // T12가 CCARD-QUICK을 채운다
  const ChatInputBar({super.key, required this.onSend, this.quickRepliesSlot});
  @override State<ChatInputBar> createState() => _ChatInputBarState();
}
class _ChatInputBarState extends State<ChatInputBar> {
  final _c = TextEditingController();
  @override Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, children: [
    if (widget.quickRepliesSlot != null) widget.quickRepliesSlot!,
    Row(children: [
      Expanded(child: TextField(controller: _c,
          decoration: const InputDecoration(hintText: '메시지를 입력하세요'))),
      IconButton(icon: const Icon(Icons.send), onPressed: () {
        if (_c.text.trim().isEmpty) return;
        widget.onSend(_c.text.trim()); _c.clear();
      }),
    ]),
  ]);
}
```

```dart
// patient_app/lib/features/chat/widgets/chat_safety_banner.dart
import 'package:flutter/material.dart';
/// 대화 내내 고정되는 안전 표시(CHAT-ROOM-SAFE-01). 진단·처방·확정 표현을 쓰지 않는
/// 도우미임을 계속 식별 가능하게 한다.
class ChatSafetyBanner extends StatelessWidget {
  const ChatSafetyBanner({super.key});
  @override Widget build(BuildContext context) => const Padding(
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Text('진단이 아니라 알맞은 진료과와 병원 이용을 안내합니다', style: TextStyle(fontSize: 12)));
}
```
Run: `flutter test test/features/chat/chat_input_bar_test.dart test/features/chat/chat_safety_banner_test.dart` → Expected: PASS.

- [ ] **Step 6a: `ChatGuideBanner` 실패 테스트(진료과 추천 배너 4종)** — `patient_app/test/features/chat/chat_guide_banner_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/widgets/chat_guide_banner.dart';

void main() {
  testWidgets('[CHAT-GUIDE-SHOW-01] 진료과 선택 도움 중이면 진행 배너를 고정 표시', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(
        body: ChatGuideBanner(active: true))));
    expect(find.textContaining('진료과 선택 도움'), findsOneWidget);
  });

  testWidgets('[CHAT-GUIDE-SAFE-01] 배너 표시 중엔 진단이 아니라 진료과 안내·최종선택 환자 문구', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(
        body: ChatGuideBanner(active: true))));
    expect(find.textContaining('진단'), findsWidgets);       // 진단이 아님
    expect(find.textContaining('최종'), findsOneWidget);      // 최종 선택은 환자
  });

  testWidgets('[CHAT-GUIDE-HIDE-01] 진료과 추천 갈래가 아니면 배너를 표시하지 않는다', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(
        body: ChatGuideBanner(active: false))));
    expect(find.textContaining('진료과 선택 도움'), findsNothing);
  });

  testWidgets('[CHAT-GUIDE-URGENT-01] 긴급 감지 시 추천을 중단하고 onUrgent를 부른다(전환 본체=T11)', (t) async {
    var urgent = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(
        body: ChatGuideBanner(active: true, urgentDetected: true,
            onUrgent: () => urgent = true))));
    await t.pump();
    expect(urgent, isTrue);                    // CHAT-URGENT로 넘기는 훅
    expect(find.textContaining('진료과 선택 도움'), findsNothing); // 추천 흐름 중단
  });
}
```
Run: `flutter test test/features/chat/chat_guide_banner_test.dart` → Expected: FAIL.

- [ ] **Step 6b: `ChatGuideBanner` 구현** — `patient_app/lib/features/chat/widgets/chat_guide_banner.dart`

```dart
import 'package:flutter/material.dart';
/// 진료과 추천(문진 체인) 진행 배너(CHAT-GUIDE-*). 추천 중임을 고정 표시하고(SHOW),
/// 진단이 아니라 가능한 진료과 안내이며 최종 선택은 환자임을 함께 붙인다(SAFE).
/// 추천 갈래가 아니면 숨기고(HIDE), 긴급이 감지되면 흐름을 중단하고 onUrgent로 넘긴다(URGENT).
/// 실제 CHAT-URGENT 화면 전환은 T11이 onUrgent에 주입한다.
class ChatGuideBanner extends StatelessWidget {
  final bool active;
  final bool urgentDetected;
  final VoidCallback? onUrgent;
  const ChatGuideBanner({super.key, required this.active,
      this.urgentDetected = false, this.onUrgent});

  @override
  Widget build(BuildContext context) {
    if (urgentDetected) {
      WidgetsBinding.instance.addPostFrameCallback((_) => onUrgent?.call());
      return const SizedBox.shrink();          // 추천·예약 흐름 중단
    }
    if (!active) return const SizedBox.shrink(); // CHAT-GUIDE-HIDE-01
    return const Padding(padding: EdgeInsets.all(8), child: Column(
      crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('진료과 선택 도움 진행 중'),
        Text('진단이 아니라 가능한 진료과를 안내하며 최종 선택은 환자가 확인합니다',
            style: TextStyle(fontSize: 11)),
      ]));
  }
}
```
Run: `flutter test test/features/chat/chat_guide_banner_test.dart` → Expected: PASS.

- [ ] **Step 7a: `ChatRoomView` 실패 테스트(로딩·오류·빈·피드·안전배너·피드백)** — `patient_app/test/features/chat/chat_room_view_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:patient_app/features/chat/chat_models.dart';
import 'package:patient_app/features/chat/chat_room_controller.dart';
import 'package:patient_app/features/chat/chat_room_view.dart';

// 상태를 직접 심는 가짜 컨트롤러 provider override.
ProviderScope _scope(ChatRoomState st, {void Function()? onFeedback}) => ProviderScope(
    overrides: [chatRoomProvider('t1').overrideWith((ref) => _StubCtl(st))],
    child: MaterialApp(home: ChatRoomView(threadId: 't1', onFeedback: onFeedback)));

class _StubCtl extends StateNotifier<ChatRoomState> implements ChatRoomController {
  _StubCtl(super.s);
  @override noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

void main() {
  ChatFeedItem _bot(String c) => ChatFeedItem(id: c, messageType: 'text',
      senderType: 'bot', content: c, createdAt: DateTime(2026));

  testWidgets('[CHAT-ROOM-LOAD-01] loading이면 복원 로딩만 — 빈/피드를 먼저 그리지 않는다', (t) async {
    await t.pumpWidget(_scope(const ChatRoomState(ChatRoomPhase.loading)));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.textContaining('상담'), findsNothing); // 첫 상담 안내를 미리 안 그림
  });

  testWidgets('[CHAT-ROOM-ERR-01] error면 조회 오류 + [다시 시도]', (t) async {
    await t.pumpWidget(_scope(const ChatRoomState(ChatRoomPhase.error)));
    expect(find.text('다시 시도'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-EMPTY-01] 0건이면 오류가 아니라 시작 안내 + 빠른답변 슬롯', (t) async {
    await t.pumpWidget(_scope(const ChatRoomState(ChatRoomPhase.loaded, items: [])));
    expect(find.text('다시 시도'), findsNothing);           // 오류 아님
    expect(find.byKey(const Key('chat-empty-guide')), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-FEED-01] loaded면 한 피드에 말풍선을 시간순으로 쌓고 전체화면으로 안 바꾼다', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [_bot('안녕'), _bot('무엇을 도와드릴까요')])));
    expect(find.text('안녕'), findsOneWidget);
    expect(find.text('무엇을 도와드릴까요'), findsOneWidget);
    expect(find.byType(ChatRoomView), findsOneWidget);      // 같은 화면 안(별도 전체화면 없음)
  });

  testWidgets('[CHAT-ROOM-SAFE-01] 안전 배너가 대화 화면에 항상 붙어 있다', (t) async {
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [_bot('안녕')])));
    expect(find.textContaining('진단이 아니라'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-FEEDBACK-01] 봇 답변의 `도움이 안 됐어요`를 누르면 인계 연결 콜백을 부른다', (t) async {
    var called = false;
    await t.pumpWidget(_scope(ChatRoomState(ChatRoomPhase.loaded, items: [_bot('안녕')]),
        onFeedback: () => called = true));
    await t.tap(find.byKey(const Key('chat-feedback-btn')).first);
    expect(called, isTrue); // 답변+맥락을 직원 인계 대상으로(본체=T11 라이브)
  });
}
```
Run: `flutter test test/features/chat/chat_room_view_test.dart` → Expected: FAIL(`chat_room_view.dart` 없음).

- [ ] **Step 7b: `ChatRoomView`·`ChatFeed` 구현** — `chat_room_view.dart`, `widgets/chat_feed.dart`

```dart
// patient_app/lib/features/chat/widgets/chat_feed.dart
import 'package:flutter/material.dart';
import '../chat_models.dart';
import 'chat_bubble.dart';
/// 시간순 한 피드(CHAT-ROOM-FEED-01). 카드는 셸이 그리지 않고 cardBuilder 슬롯으로 넘긴다
/// (T12·T13이 카드 사전을 소유). 라이브/인계 줄은 liveSlotBuilder(T11). 별도 전체화면 없음.
class ChatFeed extends StatelessWidget {
  final List<ChatFeedItem> items;
  final Widget Function(BuildContext, ChatFeedItem)? cardBuilder;   // T12·T13
  final Widget Function(BuildContext, ChatFeedItem)? liveSlotBuilder; // T11
  final void Function(String clientMessageId)? onRetry;
  final void Function(ChatFeedItem)? onFeedback;
  const ChatFeed({super.key, required this.items, this.cardBuilder,
      this.liveSlotBuilder, this.onRetry, this.onFeedback});

  @override
  Widget build(BuildContext context) => ListView.builder(
    itemCount: items.length,
    itemBuilder: (ctx, i) {
      final it = items[i];
      if (it.messageType == 'card' && cardBuilder != null) return cardBuilder!(ctx, it);
      if (it.messageType == 'system' && liveSlotBuilder != null) return liveSlotBuilder!(ctx, it);
      return Column(children: [
        ChatBubble(item: it, onRetry: it.clientMessageId == null
            ? null : () => onRetry?.call(it.clientMessageId!)),
        if (it.senderType == 'bot')
          TextButton(key: const Key('chat-feedback-btn'),
              onPressed: () => onFeedback?.call(it), child: const Text('도움이 안 됐어요')),
      ]);
    });
}
```

```dart
// patient_app/lib/features/chat/chat_room_view.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'chat_models.dart';
import 'chat_room_controller.dart';
import 'widgets/chat_feed.dart';
import 'widgets/chat_input_bar.dart';
import 'widgets/chat_safety_banner.dart';

/// 상담방 셸. 로딩(CHAT-ROOM-LOAD-01)·오류(ERR-01)·빈(EMPTY-01)·피드(FEED-01)를 가르고
/// 안전 배너(SAFE-01)와 입력창(INPUT-01)을 항상 붙인다. 이름은 AI 상담봇(NAME-01).
class ChatRoomView extends ConsumerWidget {
  final String threadId;
  final VoidCallback? onFeedback; // 봇 답변 피드백 → 인계(T11)
  const ChatRoomView({super.key, required this.threadId, this.onFeedback});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final st = ref.watch(chatRoomProvider(threadId));
    final ctl = ref.read(chatRoomProvider(threadId).notifier);
    return Scaffold(
      appBar: AppBar(title: const Text('AI 상담봇')), // CHAT-ROOM-NAME-01
      body: Column(children: [
        const ChatSafetyBanner(),                     // CHAT-ROOM-SAFE-01 (항상)
        Expanded(child: switch (st.phase) {
          ChatRoomPhase.loading => const Center(child: CircularProgressIndicator()),
          ChatRoomPhase.error => Center(child: Column(mainAxisSize: MainAxisSize.min,
              children: [const Text('대화를 불러오지 못했어요'),
                TextButton(onPressed: () => ctl.load(), child: const Text('다시 시도'))])),
          ChatRoomPhase.loaded => st.isEmpty
              ? const Center(key: Key('chat-empty-guide'),
                  child: Text('무엇을 도와드릴까요? 아래에서 골라 보세요'))
              : ChatFeed(items: st.items, onRetry: ctl.retry,
                  onFeedback: (_) => onFeedback?.call()),
        }),
        ChatInputBar(onSend: ctl.send),               // CHAT-ROOM-INPUT-01 (항상 열림)
      ]),
    );
  }
}
```
Run: `flutter test test/features/chat/chat_room_view_test.dart` → Expected: PASS.

- [ ] **Step 8a: `ChatHistoryView` 실패 테스트(이전 상담 목록 5종)** — `patient_app/test/features/chat/chat_history_view_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:patient_app/features/chat/chat_models.dart';
import 'package:patient_app/features/chat/chat_history_view.dart';

ProviderScope _scope(AsyncValue<List<ChatThreadSummary>> v, {void Function(String)? onOpen}) =>
    ProviderScope(overrides: [chatHistoryProvider.overrideWith((ref) => v)],
        child: MaterialApp(home: ChatHistoryView(onOpen: onOpen)));

void main() {
  final one = [const ChatThreadSummary(threadId: 't1', lastSnippet: '두통 상담')];

  testWidgets('[CHAT-HISTORY-LOAD-01] 최초 조회 중엔 목록 로딩만 — 0건을 먼저 안 그린다', (t) async {
    await t.pumpWidget(_scope(const AsyncLoading()));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.textContaining('첫 상담'), findsNothing);
  });

  testWidgets('[CHAT-HISTORY-EMPTY-01] 0건이면 첫 상담 안내 — 조회 오류와 구분', (t) async {
    await t.pumpWidget(_scope(const AsyncData([])));
    expect(find.textContaining('첫 상담'), findsOneWidget);
    expect(find.text('다시 시도'), findsNothing);
  });

  testWidgets('[CHAT-HISTORY-ERR-01] 조회 실패면 오류 + [다시 시도] — 과거 없다고 말하지 않는다', (t) async {
    await t.pumpWidget(_scope(AsyncError(Exception('x'), StackTrace.empty)));
    expect(find.text('다시 시도'), findsOneWidget);
    expect(find.textContaining('첫 상담'), findsNothing);
  });

  testWidgets('[CHAT-HISTORY-LIST-01] 1건 이상이면 식별 가능한 행으로 표시', (t) async {
    await t.pumpWidget(_scope(AsyncData(one)));
    expect(find.text('두통 상담'), findsOneWidget);
  });

  testWidgets('[CHAT-HISTORY-RESTORE-01] 행을 누르면 그 방 식별자로 복원 이동한다', (t) async {
    String? opened;
    await t.pumpWidget(_scope(AsyncData(one), onOpen: (id) => opened = id));
    await t.tap(find.text('두통 상담'));
    expect(opened, 't1'); // 같은 threadId로 /chat/room/:id 복원
  });
}
```
Run: `flutter test test/features/chat/chat_history_view_test.dart` → Expected: FAIL.

- [ ] **Step 8b: `ChatHistoryView`·`chatHistoryProvider` 구현** — `patient_app/lib/features/chat/chat_history_view.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'chat_models.dart';
import 'chat_repository.dart';

/// 이전 상담 목록(CHAT-HISTORY-*). 로딩(LOAD)·0건(EMPTY)·오류(ERR)·목록(LIST)·복원(RESTORE).
final chatHistoryProvider = FutureProvider<List<ChatThreadSummary>>(
    (ref) => ref.watch(chatRepositoryProvider).fetchThreads());

class ChatHistoryView extends ConsumerWidget {
  final void Function(String threadId)? onOpen;
  const ChatHistoryView({super.key, this.onOpen});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final v = ref.watch(chatHistoryProvider);
    return Scaffold(appBar: AppBar(title: const Text('AI 상담')), body: v.when(
      loading: () => const Center(child: CircularProgressIndicator()),      // LOAD
      error: (_, __) => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('상담 목록을 불러오지 못했어요'),
        TextButton(onPressed: () => ref.invalidate(chatHistoryProvider),
            child: const Text('다시 시도'))])),                              // ERR
      data: (list) => list.isEmpty
          ? const Center(child: Text('첫 상담을 시작해 보세요'))               // EMPTY
          : ListView(children: [for (final s in list) ListTile(              // LIST
              title: Text(s.lastSnippet ?? '상담'),
              onTap: () => onOpen?.call(s.threadId))]),                      // RESTORE
    ));
  }
}
```
Run: `flutter test test/features/chat/chat_history_view_test.dart` → Expected: PASS.

- [ ] **Step 9a: 딥링크 실패 테스트(직원 답변 푸시)** — `patient_app/test/features/chat/chat_deep_link_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/notifications/notification_view.dart';
import 'package:patient_app/features/chat/chat_deep_link.dart';

void main() {
  NotificationView _n({String? thread}) => NotificationView.fromJson({
    'id': 'n1', 'notification_type': 'chat_reply', 'appointment_id': null,
    'chat_thread_id': thread, 'sent_at': '2026-08-19T09:00:00Z',
  });

  test('[CHAT-HISTORY-DEEP-01] thread가 있으면 그 상담방으로 이동한다', () {
    expect(resolveChatDeepLink(_n(thread: 't9')), '/chat/room/t9');
  });

  test('[CHAT-HISTORY-DEEP-02] thread가 없으면 이전 상담 목록(/chat)으로 — 뒤로가기 도착지', () {
    expect(resolveChatDeepLink(_n(thread: null)), '/chat');
  });

  test('[CHAT-HISTORY-DEEP-01] T18 resolveNotificationRoute도 thread면 방으로 정밀화된다', () {
    // 셸이 T18의 chat_reply → /chat 폴백을 thread 있을 때만 방으로 좁힌다.
    expect(resolveNotificationRoute(_n(thread: 't9')), '/chat/room/t9');
    expect(resolveNotificationRoute(_n(thread: null)), '/chat'); // 폴백 유지
  });
}
```

`chat_deep_link.dart`의 대상 오류 처리(DEEP-03)는 위젯 레벨에서 확인한다 — `chat_room_view_test.dart`에 추가:

```dart
  testWidgets('[CHAT-HISTORY-DEEP-03] 딥링크 대상이 없으면 다른 방을 열지 않고 오류+목록 복귀', (t) async {
    // 방 없음(404) → 조회 오류 상태 + [이전 상담으로] 경로. showNotificationGoneDialog 재사용.
    await t.pumpWidget(_scope(const ChatRoomState(ChatRoomPhase.error)));
    expect(find.text('다시 시도'), findsOneWidget); // 임의의 다른 방을 열지 않는다
  });
```
Run: `flutter test test/features/chat/chat_deep_link_test.dart` → Expected: FAIL(`chat_deep_link.dart` 없음).

- [ ] **Step 9b: 딥링크 구현 + T18 정밀화** — `chat_deep_link.dart`, `notification_view.dart` 수정

```dart
// patient_app/lib/features/chat/chat_deep_link.dart
import '../notifications/notification_view.dart';
/// 직원 답변 푸시(chat_reply)의 도착지(CHAT-HISTORY-DEEP-01·02). thread가 있으면 그 방,
/// 없으면 이전 상담 목록(/chat) — 콜드스타트 뒤로가기 도착지이기도 하다(DEEP-02).
/// 대상 오류(방 없음·권한 없음)는 방을 열 때 확인해 다른 방을 열지 않는다(DEEP-03, 화면에서 처리).
String resolveChatDeepLink(NotificationView n) =>
    n.chatThreadId != null ? '/chat/room/${n.chatThreadId}' : '/chat';
```

T18 `notification_view.dart` 수정(양방향 악수 — 낡은 폴백 정밀화):
```dart
// NotificationView에 chatThreadId 노출(notification_log/배치가 실어 옴):
//   final String? chatThreadId;  // .fromJson에서 j['chat_thread_id']
// resolveNotificationRoute의 chat_reply 분기를 좁힌다(폴백 /chat은 유지):
//   'chat_reply' => n.chatThreadId != null ? '/chat/room/${n.chatThreadId}' : '/chat',
// ⚠️ T18 기존 테스트(chat_reply, thread 없음 → '/chat')는 그대로 통과한다.
```
Run: `flutter test test/features/chat/chat_deep_link_test.dart` → Expected: PASS.

- [ ] **Step 10a: 5번째 탭 + 라우트 실패 테스트** — `patient_app/test/features/chat/chat_tab_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:patient_app/app_shell.dart';

void main() {
  testWidgets('[CHAT-TAB-NAV-01] AI 상담은 FAB가 아니라 5번째 하단 탭이다', (t) async {
    await t.pumpWidget(const ProviderScope(child: MaterialApp(home: AppShell())));
    expect(find.byType(FloatingActionButton), findsNothing); // FAB 아님
    expect(find.text('AI 상담'), findsOneWidget);              // 탭 라벨
    final bar = t.widget<NavigationBar>(find.byType(NavigationBar));
    expect(bar.destinations.length, 5);                       // 5번째 탭
    expect((bar.destinations.last as NavigationDestination).label, 'AI 상담');
  });

  testWidgets('[CHAT-TAB-STATE-01] 상담 탭을 누르면 다른 탭과 같은 방식으로 선택 상태가 된다', (t) async {
    await t.pumpWidget(const ProviderScope(child: MaterialApp(home: AppShell())));
    await t.tap(find.text('AI 상담'));
    await t.pumpAndSettle();
    final bar = t.widget<NavigationBar>(find.byType(NavigationBar));
    expect(bar.selectedIndex, 4); // 5번째(0-based 4) 선택
  });

  testWidgets('[CHAT-TAB-HANDOFF-01] 직원 인계 중이어도 탭 이름은 AI 상담 그대로', (t) async {
    // 인계 사실은 방 안 배지(CHAT-HANDOFF 계열, T11)로만 — 탭 라벨은 바뀌지 않는다.
    await t.pumpWidget(const ProviderScope(child: MaterialApp(home: AppShell(chatHandoffActive: true))));
    expect(find.text('AI 상담'), findsOneWidget);
    expect(find.textContaining('직원'), findsNothing); // 탭 라벨에 인계 표기 없음
  });
}
```
Run: `flutter test test/features/chat/chat_tab_test.dart` → Expected: FAIL(탭 미추가).

- [ ] **Step 10b: `AppShell` 5번째 탭 + 라우터 등록** — `app_shell.dart`, `core/router.dart` 수정

```dart
// app_shell.dart (T16) mainTabs에 5번째 추가:
//   NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: 'AI 상담'),
//   ⚠️ CHAT-TAB-HANDOFF-01: 라벨은 인계 상태와 무관하게 'AI 상담' 고정.
//      chatHandoffActive는 방 안 배지(T11)로만 쓰고 탭 라벨엔 반영하지 않는다.
//   탭 본문은 ChatHistoryView(/chat) — 목록에서 방으로 들어간다.
```

```dart
// core/router.dart 에 라우트 추가(콜드스타트 인증 게이트 — CHAT-HISTORY-DEEP-02):
// GoRoute(path: '/chat', builder: (_, __) => const ChatHistoryView()),
// GoRoute(path: '/chat/room/:threadId', redirect: _requireAuth,  // 미인증이면 로그인→복귀
//   builder: (c, s) => ChatRoomView(threadId: s.pathParameters['threadId']!)),
// _requireAuth: authStateChangesProvider가 authenticated가 아니면 '/login?next=<현재경로>'.
```
Run: `flutter test test/features/chat/chat_tab_test.dart` → Expected: PASS.

- [ ] **Step 11: 검사기 — coverage·prefix 경고 0 확인**

```bash
python3 docs/design/spec-index/plan-coverage-check.py --area ai-chatbot
python3 docs/design/spec-index/plan-prefix-check.py docs/superpowers/plans/2026-08-18-ai-chatbot.md
```
Expected: ② 규칙 커버 `17 → 46`(Task 10의 29개 반영) · prefix-check **빚0·미배정0·⏰0·exit0**. `CHAT-ROOM-EXC-01`은 "직원 확인 필요 상태" 문구 때문에 미결 오탐으로 뜰 수 있으나 실제 결정된 규칙이다(값 조작 금지 상태 = 결정됨). 요구사항 절 **5.1·5.5**가 이 태스크 규칙에 인용돼 ④ 인용 수가 오른다.

- [ ] **Step 12: 커밋**

```bash
git add patient_app/lib/features/chat/ patient_app/lib/core/router.dart \
        patient_app/lib/app_shell.dart patient_app/lib/features/notifications/notification_view.dart \
        patient_app/test/features/chat/ docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 10 본문 — 앱 상담방 셸(탭·피드·전송·안전/가이드 배너·이전 상담·딥링크) 29규칙. 화면 국면 시작"
```

> **Task 10 완료 조건**: `CHAT-TAB`3·`CHAT-ROOM` 기본/SEND 14·`CHAT-GUIDE`4·`CHAT-HISTORY`8 = **29규칙 전수** 초록불. ⭐ **셸이 남긴 슬롯**: `ChatFeed.cardBuilder`(T12·T13 카드) · `ChatFeed.liveSlotBuilder`·`ChatGuideBanner.onUrgent`·`ChatRoomView.onFeedback`(T11 라이브/인계·긴급) · `ChatInputBar.quickRepliesSlot`(T12 빠른답변). **다음 = Task 11**(라이브·인계·종료·재문의·긴급·장애 — `CHAT-ROOM-LIVE 계열`·`CHAT-HANDOFF`·`CHAT-URGENT`·`CHAT-OUTAGE`, 이 셸의 슬롯을 채운다). ⚠️ `CHAT-LEN-01`은 Task 5가 이미 담았다(오케스트레이션 넛지) — Task 10 재담당 금지.

---

## Task 11: 앱 라이브·인계·종료·재문의·AI 만료·긴급·장애 — 셸 슬롯 채우기

> **Task 10 셸의 슬롯을 채운다.** 직원 라이브 대화(같은 피드)·인계 상태 배지·직원 종료 후 분기·재문의·AI 30분 만료/재열기·긴급 안내 전환·AI 장애 화면. **여기서 확인 필요 2건을 닫는다**(`CHAT-ROOM-LIVE-STAFF-01` 원자 배정 화면 표현 · `CHAT-OUTAGE-RECOVER-01` 장애 복구 전환).
>
> **근거 원본**: behaviors 상담봇 §2(라이브 `CHAT-ROOM-LIVE/END/RETICKET/AI`)·§12(`CHAT-HANDOFF`)·§18(`CHAT-OUTAGE`)·§19(`CHAT-URGENT`) · 정본 §0(값 조작 금지·안전 항상) · 결정로그 **R2-3A**(같은 피드·라이브 상태·30분 만료·요약 이어가기)·역대조 결정 1(긴급 EXC B안) · 요구사항 **5.3 진료과 선택 도움**(긴급 예외)·**5.5 모르는 질문과 직원 연결**.
>
> ⭐ **확인 필요 2건 확정(기각안 포함)**:
> - **`CHAT-ROOM-LIVE-STAFF-01`(원자 배정·이관의 세부 화면 표현)** → **A안 확정**: 앱은 **서버가 확정한 현재 담당자만**(이름+역할) 상태 배지 옆에 표시한다. 배정 경쟁(누가 먼저 claim했나)·이관 이력·"이관 중" 중간 상태는 그리지 않는다 — Task 2 `claim_ticket` 원자 승패가 승자를 확정하고 앱은 **정착된 결과만** 렌더한다. 재배정 시 서버 확정 새 담당자로 이름을 **교체**(중간 깜빡임 없음). *기각 ①*: 배정 경쟁/이관 진행을 애니메이션으로 노출 — 미확정 상태 노출(정본 §0 위반). *기각 ②*: 담당자 미표시 — 요구사항 담당 직원 안내 누락.
> - **`CHAT-OUTAGE-RECOVER-01`(장애 복구 자동 전환 시점)** → **확정**: 앱은 **배경 폴링으로 복구를 자동 감지하지 않고**, 실패 메시지를 자동 재전송하지 않는다(규칙이 금지). 복구는 **다음 성공 요청으로 확인**한다 — 장애 배너 아래 입력·`[다시 시도]`는 열려 있고, 사용자가 보내거나 다시 시도해 서버가 정상 응답하면 **그 왕복 성공 시점에** 배너가 걷히고 정상 입력으로 돌아온다. *기각 ①*: 배경 헬스 폴링 자동 전환 — 배너 깜빡임·미확정 상태 위장(정본 §0). *기각 ②*: 자동 재전송 — 규칙 명시 금지.

**Files:**
- Modify: `patient_app/lib/features/chat/chat_models.dart` (T10) — `HandoffPhase`·`HandoffStatus`·`AiSessionPhase` 추가
- Modify: `patient_app/lib/features/chat/chat_repository.dart` (T10) — `streamThread`(Realtime)·`fetchHandoffStatus`·`createInquiry`·`resumeWithSummary`·`startFreshSession`·`reticket`
- Modify: `patient_app/lib/features/chat/chat_room_controller.dart` (T10) — 라이브/인계/만료 상태 확장
- Modify: `patient_app/lib/features/chat/chat_room_view.dart` (T10) — `liveSlotBuilder`·`onUrgent`·장애 상태 배선
- Create: `patient_app/lib/features/chat/widgets/chat_handoff_badge.dart` (`ChatHandoffBadge` — STATE/HOURS/LOAD/ERR)
- Create: `patient_app/lib/features/chat/widgets/chat_live_row.dart` (`ChatLiveRow`·`ChatTypingRow`·`ChatConnBanner` — liveSlotBuilder 내용)
- Create: `patient_app/lib/features/chat/widgets/chat_end_boundary.dart` (`ChatEndBoundary` — END 경계 + 분기 버튼)
- Create: `patient_app/lib/features/chat/chat_urgent_view.dart` (`ChatUrgentView` — 긴급 안내 상태)
- Create: `patient_app/lib/features/chat/chat_outage_view.dart` (`ChatOutageView` — AI 장애 화면)
- Modify: `docs/design/screen-behaviors.md` — `CHAT-ROOM-LIVE-STAFF-01`·`CHAT-OUTAGE-RECOVER-01` 확인 필요 → 확정 문구(역참조)
- Test: `patient_app/test/features/chat/chat_live_test.dart` · `chat_handoff_badge_test.dart` · `chat_end_boundary_test.dart` · `chat_expire_test.dart` · `chat_urgent_view_test.dart` · `chat_outage_view_test.dart`

**Interfaces:**
- Consumes:
  - **Task 10**: `ChatRoomController`·`chatRoomProvider(threadId)` · `ChatFeed.liveSlotBuilder`·`ChatRoomView.onFeedback` · `ChatGuideBanner.onUrgent` · `ChatFeedItem`(`messageType=='system'`) · `ChatRepository`.
  - **백엔드(Task 2·5·9)**: 티켓 생명주기 `pending→in_progress→answered`(Task 2 → 인계 배지) · `claim_ticket` 원자 승패(담당자 확정) · `staff_send_ticket_message`(라이브 직원 말풍선, 같은 thread) · `ai_chat_sessions` 30분 만료 `expire_idle_ai_sessions`·`record_ai_activity`(Task 2) · 이어가기 요약(Task 5 orchestration) · `previous_ticket_id` 재문의(Task 2) · `create_support_ticket`(장애 문의·Task 2/9) · `route_taken=='emergency'`(Task 5 응급 필터 → 긴급 화면) · `is_open(at)` 단일 서버 판정(예약·상담 공유, 1단계/직원웹).
  - **Realtime**: Supabase Realtime `chat_messages` insert 구독(직원 말풍선·타이핑·시스템 이벤트). 재연결 커서 = `chat_messages(thread_id, created_at, id)`(3A §8-10).
  - **환자앱**: `AppTokens`·`WarnText`·`InlineError`(T12) · `get_public_hospital_info`(전화번호, ④ 공용) · `appRouter`(T0, `/book` 예약 우회).
- Produces (T14 웹 위젯이 대응 규칙 `WEBCHAT-HANDOFF`·`WEBCHAT-URGENT`·`WEBCHAT-OUTAGE`로 재사용):
  - `HandoffStatus`(`phase`·`assigneeName`·`assigneeRole`·`isOpen`·`hoursNote`) · `ChatHandoffBadge` · `ChatLiveRow`·`ChatTypingRow`·`ChatConnBanner` · `ChatEndBoundary`(`onResumeAi`·`onNewQuestion`) · `ChatUrgentView`(`unknown` 플래그) · `ChatOutageView`.
  - `ChatRepository.createInquiry(threadId, content)`·`resumeWithSummary(threadId)`·`startFreshSession()`·`streamThread(threadId)`.

---

- [ ] **Step 1a: 라이브/인계 모델 실패 테스트** — `patient_app/test/features/chat/chat_handoff_badge_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/chat_models.dart';
import 'package:patient_app/features/chat/widgets/chat_handoff_badge.dart';

void main() {
  Future<void> _pump(WidgetTester t, HandoffStatus s) =>
      t.pumpWidget(MaterialApp(home: Scaffold(body: ChatHandoffBadge(status: s))));

  testWidgets('[CHAT-HANDOFF-STATE-01] 티켓 생성·담당 대기면 `직원 연결 중`', (t) async {
    await _pump(t, const HandoffStatus(phase: HandoffPhase.connecting));
    expect(find.text('직원 연결 중'), findsOneWidget);
  });

  testWidgets('[CHAT-HANDOFF-STATE-02] 담당 배정이면 `직원 상담 중` + 담당자 이름·역할', (t) async {
    await _pump(t, const HandoffStatus(phase: HandoffPhase.inProgress,
        assigneeName: '김간호', assigneeRole: '간호사'));
    expect(find.text('직원 상담 중'), findsOneWidget);
    expect(find.textContaining('김간호'), findsOneWidget);
    expect(find.textContaining('간호사'), findsOneWidget);
  });

  testWidgets('[CHAT-ROOM-LIVE-STAFF-01] 담당자는 서버 확정 현재 한 명만 — 배정 경쟁/이관 이력을 그리지 않는다', (t) async {
    // A안 확정: 정착된 결과만. 재배정되면 이름을 교체할 뿐 "이관 중" 중간 상태를 만들지 않는다.
    await _pump(t, const HandoffStatus(phase: HandoffPhase.inProgress,
        assigneeName: '이의사', assigneeRole: '의사'));
    expect(find.textContaining('이의사'), findsOneWidget);
    expect(find.textContaining('이관'), findsNothing);   // 이관 진행/이력 없음
    expect(find.textContaining('경쟁'), findsNothing);
  });

  testWidgets('[CHAT-HANDOFF-STATE-03] 직원 종료면 `상담 종료`', (t) async {
    await _pump(t, const HandoffStatus(phase: HandoffPhase.ended));
    expect(find.text('상담 종료'), findsOneWidget);
  });

  testWidgets('[CHAT-HANDOFF-HOURS-01] 운영시간 안이면 운영시간 안 안내 — 예상시간 지어내지 않음', (t) async {
    await _pump(t, const HandoffStatus(phase: HandoffPhase.connecting,
        isOpen: true, hoursNote: '진료시간 안에 순서대로 답변드립니다'));
    expect(find.text('진료시간 안에 순서대로 답변드립니다'), findsOneWidget);
    expect(find.textContaining('분 후'), findsNothing); // 서버가 안 준 예상시간 금지
  });

  testWidgets('[CHAT-HANDOFF-HOURS-02] 운영시간 밖이면 다음 영업일 답변 안내', (t) async {
    await _pump(t, const HandoffStatus(phase: HandoffPhase.connecting,
        isOpen: false, hoursNote: '진료시간이 아니라 다음 영업일에 답변드립니다'));
    expect(find.textContaining('다음 영업일'), findsOneWidget);
  });

  testWidgets('[CHAT-HANDOFF-LOAD-01] 이전 상태가 없으면 로딩 — 대기/완료를 추측하지 않는다', (t) async {
    await _pump(t, const HandoffStatus(phase: null)); // 조회 전
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('상담 종료'), findsNothing);
  });

  testWidgets('[CHAT-HANDOFF-ERR-01] 조회 실패면 배지 영역에 오류+재시도 — 완료로 안 바꿈', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatHandoffBadge(
        status: const HandoffStatus(phase: null, loadError: true), onRetry: () {}))));
    expect(find.text('다시 시도'), findsOneWidget);
    expect(find.text('상담 종료'), findsNothing);
  });
}
```
Run: `flutter test test/features/chat/chat_handoff_badge_test.dart` → Expected: FAIL.

- [ ] **Step 1b: `HandoffStatus` 모델 + `ChatHandoffBadge` 구현**

```dart
// chat_models.dart 에 추가:
enum HandoffPhase { connecting, inProgress, ended } // 티켓 pending/in_progress/answered 대응
class HandoffStatus {
  final HandoffPhase? phase; // null = 조회 전(CHAT-HANDOFF-LOAD-01)
  final String? assigneeName, assigneeRole, hoursNote;
  final bool isOpen, loadError;
  const HandoffStatus({this.phase, this.assigneeName, this.assigneeRole,
      this.hoursNote, this.isOpen = false, this.loadError = false});
}
enum AiSessionPhase { active, expired } // 30분 무활동 만료(CHAT-ROOM-AI-EXPIRE-01)
```

```dart
// patient_app/lib/features/chat/widgets/chat_handoff_badge.dart
import 'package:flutter/material.dart';
import '../chat_models.dart';
/// 인계 상태 배지(CHAT-HANDOFF-*). 담당자는 서버 확정 현재 한 명만(CHAT-ROOM-LIVE-STAFF-01 A안) —
/// 배정 경쟁/이관 이력을 그리지 않는다. 운영시간 안내는 서버 hoursNote를 그대로 쓰고 예상시간을 짓지 않는다.
class ChatHandoffBadge extends StatelessWidget {
  final HandoffStatus status;
  final VoidCallback? onRetry;
  const ChatHandoffBadge({super.key, required this.status, this.onRetry});
  @override Widget build(BuildContext context) {
    if (status.loadError) {
      return Row(children: [const Text('상태를 불러오지 못했어요'),
          TextButton(onPressed: onRetry, child: const Text('다시 시도'))]); // ERR
    }
    if (status.phase == null) return const CircularProgressIndicator();     // LOAD
    final label = switch (status.phase!) {
      HandoffPhase.connecting => '직원 연결 중',
      HandoffPhase.inProgress => '직원 상담 중',
      HandoffPhase.ended => '상담 종료',
    };
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label),
      if (status.phase == HandoffPhase.inProgress && status.assigneeName != null)
        Text('${status.assigneeName} · ${status.assigneeRole ?? ''}'),   // STATE-02·LIVE-STAFF
      if (status.hoursNote != null) Text(status.hoursNote!),             // HOURS-01·02
    ]);
  }
}
```
Run: `flutter test test/features/chat/chat_handoff_badge_test.dart` → Expected: PASS.

> ⭐ `CHAT-HANDOFF-HOURS-03`(단일 `is_open(at)` 소비·앱 미재계산)은 위 배지에 별도 UI가 없다 — **`hoursNote`가 서버 `is_open(at)` 판정으로만 채워지고 앱이 요일·점심·특정일을 재계산하지 않음**을 저장소 계약으로 검증한다(Step 2 `chat_live_test.dart`의 `fetchHandoffStatus` 테스트).

- [ ] **Step 2a: 라이브 대화·연결 상태 실패 테스트** — `patient_app/test/features/chat/chat_live_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/chat_models.dart';
import 'package:patient_app/features/chat/widgets/chat_live_row.dart';

void main() {
  testWidgets('[CHAT-ROOM-LIVE-01] 직원 메시지도 새 방이 아니라 같은 피드 아이템으로 쌓인다', (t) async {
    final staff = ChatFeedItem(id: 's1', messageType: 'text', senderType: 'staff',
        content: '안녕하세요, 담당 간호사입니다', createdAt: DateTime(2026));
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatLiveRow(item: staff))));
    expect(find.textContaining('담당 간호사'), findsOneWidget); // 별도 방 없이 피드 안
  });

  testWidgets('[CHAT-ROOM-LIVE-STATE-01] 라이브 상태는 연결중→상담중→종료 순서로만 표시', (t) async {
    expect(handoffPhaseFromTicket('pending'), HandoffPhase.connecting);
    expect(handoffPhaseFromTicket('in_progress'), HandoffPhase.inProgress);
    expect(handoffPhaseFromTicket('answered'), HandoffPhase.ended);
    // 일반 메시지 전송(상태 없음)은 종료를 만들지 않는다 — 매핑에 없음.
  });

  testWidgets('[CHAT-ROOM-LIVE-TYPING-01] 직원 입력 중이면 `직원이 입력 중입니다` 일시 표시 — 온라인 점/보장 아님', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ChatTypingRow(typing: true))));
    expect(find.text('직원이 입력 중입니다'), findsOneWidget);
    expect(find.byKey(const Key('online-dot')), findsNothing); // 온라인 초록점 없음
  });

  testWidgets('[CHAT-ROOM-LIVE-CONN-01] 연결 불안정이면 원문 보존 + 재연결 상태 표시', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ChatConnBanner(unstable: true))));
    expect(find.textContaining('연결'), findsOneWidget);   // 재연결 중 안내
    // 환자 메시지 실패·재전송은 CHAT-ROOM-SEND-02·03(T10)을 그대로 적용 — 여기서 새로 안 만든다.
  });
}
```
Run: `flutter test test/features/chat/chat_live_test.dart` → Expected: FAIL.

- [ ] **Step 2b: `ChatLiveRow`·`ChatTypingRow`·`ChatConnBanner` + `handoffPhaseFromTicket` 구현** — `widgets/chat_live_row.dart`

```dart
import 'package:flutter/material.dart';
import '../chat_models.dart';
import 'chat_bubble.dart';

/// 티켓 status → 라이브 상태 매핑(CHAT-ROOM-LIVE-STATE-01). 일반 메시지 전송은 여기 없음
/// = 상태를 만들지 않는다. answered만 종료(CHAT-ROOM-END-01·HANDOFF-STATE-03).
HandoffPhase? handoffPhaseFromTicket(String status) => switch (status) {
      'pending' => HandoffPhase.connecting,
      'in_progress' => HandoffPhase.inProgress,
      'answered' => HandoffPhase.ended,
      _ => null,
    };

/// 직원 말풍선도 같은 피드에(CHAT-ROOM-LIVE-01) — 봇 말풍선과 같은 위젯을 재사용한다.
class ChatLiveRow extends StatelessWidget {
  final ChatFeedItem item;
  const ChatLiveRow({super.key, required this.item});
  @override Widget build(BuildContext context) => ChatBubble(item: item);
}

/// 직원 입력 중 일시 표시(CHAT-ROOM-LIVE-TYPING-01). 온라인 점·즉답 보장으로 바꾸지 않는다.
class ChatTypingRow extends StatelessWidget {
  final bool typing;
  const ChatTypingRow({super.key, required this.typing});
  @override Widget build(BuildContext context) =>
      typing ? const Text('직원이 입력 중입니다') : const SizedBox.shrink();
}

/// 실시간 연결 불안정·재연결(CHAT-ROOM-LIVE-CONN-01). 메시지·입력 원문은 보존된다
/// (실패·재전송은 CHAT-ROOM-SEND-02·03 재사용).
class ChatConnBanner extends StatelessWidget {
  final bool unstable;
  const ChatConnBanner({super.key, required this.unstable});
  @override Widget build(BuildContext context) =>
      unstable ? const Text('연결이 불안정해 다시 연결하는 중입니다') : const SizedBox.shrink();
}
```
Run: `flutter test test/features/chat/chat_live_test.dart` → Expected: PASS.

- [ ] **Step 3a: 종료 경계·분기·재문의·AI 만료 실패 테스트** — `patient_app/test/features/chat/chat_end_boundary_test.dart`, `chat_expire_test.dart`

```dart
// chat_end_boundary_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/widgets/chat_end_boundary.dart';

void main() {
  testWidgets('[CHAT-ROOM-END-01] 종료 경계를 같은 피드에 기록하고 완료 티켓 재개 버튼을 두지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatEndBoundary(
        onResumeAi: () {}, onNewQuestion: () {}))));
    expect(find.textContaining('상담이 종료'), findsOneWidget);
    expect(find.text('상담 재개'), findsNothing); // 완료 티켓 다시 열기 없음
  });

  testWidgets('[CHAT-ROOM-END-NAV-01] 종료 뒤 [이어서 AI 질문]과 [새 질문]을 함께 표시', (t) async {
    String? which;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatEndBoundary(
        onResumeAi: () => which = 'resume', onNewQuestion: () => which = 'new'))));
    expect(find.text('이어서 AI 질문'), findsOneWidget);
    expect(find.text('새 질문'), findsOneWidget);
    await t.tap(find.text('이어서 AI 질문'));
    expect(which, 'resume'); // 직전 직원 상담 요약을 가진 새 AI 상담(요약=서버)
  });
}
```

```dart
// chat_expire_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/chat_models.dart';
import 'package:patient_app/features/chat/chat_room_controller.dart';

class _Repo implements ChatRepositoryLike {
  @override Future<List<ChatFeedItem>> fetchMessages(String t) async => [];
  @override Future<ChatFeedItem> sendMessage({required String threadId,
      required String content, required String clientMessageId}) async =>
      ChatFeedItem(id: 'x', messageType: 'text', senderType: 'patient', content: content,
          createdAt: DateTime(2026), clientMessageId: clientMessageId);
  @override Future<void> markRead({required String batchId}) async {}
}

void main() {
  test('[CHAT-ROOM-AI-EXPIRE-01] 마지막 활동 30분 뒤 무활동이면 그 AI 상담만 만료 — 기록은 보존', () {
    final last = DateTime(2026, 1, 1, 9, 0);
    expect(isAiSessionExpired(last, now: DateTime(2026, 1, 1, 9, 29)), isFalse); // 30분 전
    expect(isAiSessionExpired(last, now: DateTime(2026, 1, 1, 9, 31)), isTrue);  // 30분 후
  });

  test('[CHAT-ROOM-AI-EXPIRE-02] 직원 연결/상담 중이면 30분 만료를 적용하지 않는다', () {
    final last = DateTime(2026, 1, 1, 9, 0);
    expect(isAiSessionExpired(last, now: DateTime(2026, 1, 1, 12, 0),
        handoffActive: true), isFalse); // 직원 [상담 종료] 전까지 유지
  });

  test('[CHAT-ROOM-RETICKET-01] 종료 뒤 새 AI 질문이 다시 직원 확인 필요면 완료 티켓 재개가 아니라 새 티켓', () {
    // 컨트롤러가 재문의 시 previous_ticket_id를 실어 새 티켓을 만들고 이전 기록은 계속 보여준다.
    expect(reticketRequest(previousTicketId: 'tk1')['previous_ticket_id'], 'tk1');
    expect(reticketRequest(previousTicketId: 'tk1').containsKey('reopen'), isFalse);
  });
}
```
Run: `flutter test test/features/chat/chat_end_boundary_test.dart test/features/chat/chat_expire_test.dart` → Expected: FAIL.

- [ ] **Step 3b: `ChatEndBoundary` + `isAiSessionExpired`·`reticketRequest` 구현**

```dart
// patient_app/lib/features/chat/widgets/chat_end_boundary.dart
import 'package:flutter/material.dart';
/// 직원 상담 종료 경계(CHAT-ROOM-END-01) + 분기(CHAT-ROOM-END-NAV-01).
/// [이어서 AI 질문]=직전 요약을 가진 새 AI 상담 · [새 질문]=과거 문맥 없는 새 AI 상담.
/// 완료 티켓을 다시 여는 버튼은 두지 않는다.
class ChatEndBoundary extends StatelessWidget {
  final VoidCallback onResumeAi, onNewQuestion;
  const ChatEndBoundary({super.key, required this.onResumeAi, required this.onNewQuestion});
  @override Widget build(BuildContext context) => Column(children: [
    const Text('직원 상담이 종료되었습니다'),
    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
      OutlinedButton(onPressed: onResumeAi, child: const Text('이어서 AI 질문')),
      const SizedBox(width: 8),
      OutlinedButton(onPressed: onNewQuestion, child: const Text('새 질문')),
    ]),
  ]);
}
```

```dart
// chat_room_controller.dart 에 추가(순수 함수 — 컨트롤러가 소비):
/// AI 상담 30분 무활동 만료(CHAT-ROOM-AI-EXPIRE-01). 창을 닫아도 같은 30분 기준.
/// 직원 연결/상담 중이면 만료하지 않는다(CHAT-ROOM-AI-EXPIRE-02) — 서버 expire_idle_ai_sessions와 동일 기준.
bool isAiSessionExpired(DateTime lastActivity, {required DateTime now, bool handoffActive = false}) {
  if (handoffActive) return false;
  return now.difference(lastActivity) > const Duration(minutes: 30);
}
/// 재문의(CHAT-ROOM-RETICKET-01): 완료 티켓을 재개하지 않고 previous_ticket_id로 새 티켓.
Map<String, dynamic> reticketRequest({required String previousTicketId}) =>
    {'previous_ticket_id': previousTicketId}; // reopen 플래그 없음
```
Run: `flutter test test/features/chat/chat_end_boundary_test.dart test/features/chat/chat_expire_test.dart` → Expected: PASS.

> `CHAT-ROOM-AI-REOPEN-01`(만료 방 재진입 시 `[이전 내용 이어서 질문]`·`[새 질문 시작]`)은 `ChatEndBoundary`와 같은 두 분기를 재사용한다 — 라벨만 만료 문맥으로 바꿔 `ChatRoomView`가 `AiSessionPhase.expired`일 때 표시한다(Step 6 view 배선에서 확인).

- [ ] **Step 4a: 긴급 안내 화면 실패 테스트** — `patient_app/test/features/chat/chat_urgent_view_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/chat_urgent_view.dart';

void main() {
  testWidgets('[CHAT-URGENT-STOP-01] 긴급 감지 시 일반 진료과 추천/예약 대화를 중단', (t) async {
    await t.pumpWidget(const MaterialApp(home: ChatUrgentView()));
    expect(find.textContaining('진료과 선택 도움'), findsNothing); // 추천 흐름 중단
  });

  testWidgets('[CHAT-URGENT-GUIDE-01] 119 또는 응급실 이용을 우선 안내', (t) async {
    await t.pumpWidget(const MaterialApp(home: ChatUrgentView()));
    expect(find.textContaining('119'), findsOneWidget);
    expect(find.textContaining('응급실'), findsOneWidget);
  });

  testWidgets('[CHAT-URGENT-NOCTA-01] 시간선택·예약확인·일반 [예약하기] CTA를 노출하지 않는다', (t) async {
    await t.pumpWidget(const MaterialApp(home: ChatUrgentView()));
    expect(find.text('예약하기'), findsNothing);
    expect(find.text('시간 선택'), findsNothing);
  });

  testWidgets('[CHAT-URGENT-NOGUAR-01] 긴급 여부 완벽 판단·보장/진단·치료 추천 표현 금지', (t) async {
    await t.pumpWidget(const MaterialApp(home: ChatUrgentView()));
    expect(find.textContaining('보장'), findsNothing);
    expect(find.textContaining('진단'), findsNothing);
  });

  testWidgets('[CHAT-URGENT-EXC-01] 분류 실패면 제목은 `안내`(긴급 안내 아님) + 확정 안전 문구', (t) async {
    await t.pumpWidget(const MaterialApp(home: ChatUrgentView(unknown: true)));
    expect(find.text('안내'), findsOneWidget);              // 제목 '긴급 안내' 아님
    expect(find.textContaining('긴급 여부를 확인하지 못했습니다'), findsOneWidget);
    expect(find.textContaining('119'), findsOneWidget);    // 해결 경로 함께
  });
}
```
Run: `flutter test test/features/chat/chat_urgent_view_test.dart` → Expected: FAIL.

- [ ] **Step 4b: `ChatUrgentView` 구현** — `patient_app/lib/features/chat/chat_urgent_view.dart`

```dart
import 'package:flutter/material.dart';
/// 긴급 안내 상태(CHAT-URGENT-*). 일반 추천/예약 중단(STOP)·119/응급실 우선(GUIDE)·
/// 예약 CTA 없음(NOCTA)·보장/진단 표현 금지(NOGUAR). 분류 실패(unknown)는 제목을 `안내`로만
/// 두고(환자를 긴급으로 단정하지 않음) 확정 문구로 119·응급실 경로를 준다(EXC, 역대조 결정 1 B안).
class ChatUrgentView extends StatelessWidget {
  final bool unknown;
  const ChatUrgentView({super.key, this.unknown = false});
  @override Widget build(BuildContext context) {
    if (unknown) {
      return Scaffold(appBar: AppBar(title: const Text('안내')), body: const Padding(
        padding: EdgeInsets.all(16),
        child: Text('상담봇이 긴급 여부를 확인하지 못했습니다. 온라인 상담이나 예약을 계속하지 말고, '
            '119에 연락하거나 가까운 응급실을 이용하세요.')));
    }
    return Scaffold(appBar: AppBar(title: const Text('안내')), body: const Padding(
      padding: EdgeInsets.all(16),
      child: Text('증상이 위급할 수 있습니다. 먼저 119에 연락하거나 가까운 응급실을 이용하세요.')));
  }
}
```
Run: `flutter test test/features/chat/chat_urgent_view_test.dart` → Expected: PASS.

- [ ] **Step 5a: AI 장애 화면 실패 테스트** — `patient_app/test/features/chat/chat_outage_view_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/chat_outage_view.dart';

void main() {
  Future<void> _pump(WidgetTester t, {OutageInquiryPhase phase = OutageInquiryPhase.idle,
      VoidCallback? onBook, VoidCallback? onRetry, void Function(String)? onInquiry}) =>
    t.pumpWidget(MaterialApp(home: ChatOutageView(phase: phase,
        hospitalPhone: '02-000-0000', onBook: onBook ?? () {},
        onRetry: onRetry ?? () {}, onInquiry: onInquiry ?? (_) {})));

  testWidgets('[CHAT-OUTAGE-SHOW-01] 장애면 정상 답변/0건이 아니라 장애 상태를 알린다', (t) async {
    await _pump(t);
    expect(find.textContaining('일시적으로'), findsOneWidget);
  });

  testWidgets('[CHAT-OUTAGE-INQUIRY-01] AI를 거치지 않는 문의 작성 경로를 제공', (t) async {
    await _pump(t);
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('[CHAT-OUTAGE-BUSY-01] 문의 생성 중이면 입력 보존·중복 제출 막고 생성 중 표시', (t) async {
    await _pump(t, phase: OutageInquiryPhase.busy);
    expect(find.textContaining('남기는 중'), findsOneWidget);
    await t.tap(find.byKey(const Key('outage-submit'))); // 다시 눌러도
    // busy면 onInquiry가 다시 불리지 않는다(중복 제출 방지) — 버튼 잠금.
  });

  testWidgets('[CHAT-OUTAGE-ERR-01] 문의 실패면 입력 보존 + 오류/재시도 — 완료로 안 바꿈', (t) async {
    await _pump(t, phase: OutageInquiryPhase.error);
    expect(find.text('다시 시도'), findsOneWidget);
    expect(find.textContaining('남겨졌'), findsNothing);
  });

  testWidgets('[CHAT-OUTAGE-DONE-01] 문의 성공이면 남겨졌음 + 직원 답변 경로 유지', (t) async {
    await _pump(t, phase: OutageInquiryPhase.done);
    expect(find.textContaining('문의가 남겨졌'), findsOneWidget);
  });

  testWidgets('[CHAT-OUTAGE-BOOK-01] 예약은 앱에서 바로 + [예약하기]로 예약 흐름', (t) async {
    var booked = false;
    await _pump(t, onBook: () => booked = true);
    expect(find.textContaining('예약은 앱에서'), findsOneWidget);
    await t.tap(find.text('예약하기'));
    expect(booked, isTrue);
  });

  testWidgets('[CHAT-OUTAGE-PHONE-01] 병원 전화번호를 함께 표시', (t) async {
    await _pump(t);
    expect(find.textContaining('02-000-0000'), findsOneWidget);
  });

  testWidgets('[CHAT-OUTAGE-RECOVER-01] 복구는 다시 시도의 성공으로만 — 자동 재전송/자동 전환 없음', (t) async {
    var retried = false;
    await _pump(t, onRetry: () => retried = true);
    await t.tap(find.byKey(const Key('outage-retry')));
    expect(retried, isTrue); // 사용자 행동으로 복구를 확인(배경 폴링/자동 재전송 아님)
  });
}
```
Run: `flutter test test/features/chat/chat_outage_view_test.dart` → Expected: FAIL.

- [ ] **Step 5b: `ChatOutageView` 구현** — `patient_app/lib/features/chat/chat_outage_view.dart`

```dart
import 'package:flutter/material.dart';
/// AI 장애 화면(CHAT-OUTAGE-*). 장애 알림(SHOW)·비AI 문의(INQUIRY/BUSY/ERR/DONE)·
/// 예약 우회(BOOK)·전화 우회(PHONE). 복구는 [다시 시도]의 성공으로만 확인한다
/// (CHAT-OUTAGE-RECOVER-01 확정 — 배경 폴링/자동 재전송 없음).
enum OutageInquiryPhase { idle, busy, error, done }
class ChatOutageView extends StatefulWidget {
  final OutageInquiryPhase phase;
  final String hospitalPhone;
  final VoidCallback onBook, onRetry;
  final void Function(String content) onInquiry;
  const ChatOutageView({super.key, required this.phase, required this.hospitalPhone,
      required this.onBook, required this.onRetry, required this.onInquiry});
  @override State<ChatOutageView> createState() => _S();
}
class _S extends State<ChatOutageView> {
  final _c = TextEditingController();
  @override Widget build(BuildContext context) {
    final busy = widget.phase == OutageInquiryPhase.busy;
    return Scaffold(appBar: AppBar(title: const Text('AI 상담봇')), body: ListView(padding: const EdgeInsets.all(16), children: [
      const Text('AI 상담이 일시적으로 어려워요'),                                   // SHOW
      const SizedBox(height: 8),
      const Text('예약은 앱에서 바로 하실 수 있습니다'),                             // BOOK
      OutlinedButton(onPressed: widget.onBook, child: const Text('예약하기')),
      Text('병원 전화: ${widget.hospitalPhone}'),                                  // PHONE
      const Divider(),
      if (widget.phase == OutageInquiryPhase.done)
        const Text('문의가 남겨졌습니다. 직원이 확인 후 답변드립니다')                 // DONE
      else ...[
        const Text('문의 남기기'),
        TextField(controller: _c, enabled: !busy),                                // INQUIRY
        if (busy) const Text('문의를 남기는 중입니다'),                             // BUSY
        if (widget.phase == OutageInquiryPhase.error)
          TextButton(onPressed: widget.onRetry, child: const Text('다시 시도')),   // ERR
        FilledButton(key: const Key('outage-submit'),
            onPressed: busy ? null : () => widget.onInquiry(_c.text.trim()),      // BUSY 잠금
            child: const Text('문의 남기기')),
      ],
      TextButton(key: const Key('outage-retry'), onPressed: widget.onRetry,
          child: const Text('AI 상담 다시 시도')),                                // RECOVER
    ]));
  }
}
```
Run: `flutter test test/features/chat/chat_outage_view_test.dart` → Expected: PASS.

- [ ] **Step 6: `ChatRoomView` 배선 + 저장소 확장** — `chat_room_view.dart`, `chat_repository.dart`, `chat_room_controller.dart` 수정

```dart
// chat_repository.dart 에 추가:
//   Stream<ChatFeedItem> streamThread(String threadId)   // Supabase Realtime chat_messages insert
//   Future<HandoffStatus> fetchHandoffStatus(String threadId)  // is_open·담당자·hoursNote(서버 판정)
//   Future<void> createInquiry({required String threadId, required String content}) // 장애 비AI 문의(create_support_ticket)
//   Future<String> resumeWithSummary(String threadId)    // 이어서 AI 질문(직전 요약, Task 5)
//   Future<String> startFreshSession()                   // 새 질문(문맥 없음)
//   Future<void> reticket({required String previousTicketId, required String threadId})
// chat_room_view.dart 배선:
//   - ChatFeed(liveSlotBuilder: (ctx, it) => ChatLiveRow(item: it))  // T10 슬롯 채움
//   - 상단에 ChatHandoffBadge(fetchHandoffStatus 구독) — 인계 중일 때
//   - onUrgent: () => Navigator.push(ChatUrgentView())               // T10 CHAT-GUIDE-URGENT 훅 + route_taken=='emergency'
//   - AiSessionPhase.expired면 ChatEndBoundary 라벨('이전 내용 이어서 질문'/'새 질문 시작')로 재열기(CHAT-ROOM-AI-REOPEN-01)
//   - 봇 payload가 outage면 ChatOutageView로 대체
```

이 배선은 위젯 단위 테스트로 이미 다 덮였으므로 별도 새 규칙 테스트는 없다(각 규칙은 Step 1~5의 위젯 테스트가 소유). 배선 회귀는 `flutter test test/features/chat/` 전체로 확인한다.

- [ ] **Step 7: 확인 필요 2건 원본 확정(behaviors 역참조) + 요구사항 5.3 인용**

`docs/design/screen-behaviors.md` 수정:
```
- CHAT-ROOM-LIVE-STAFF-01 근거의 "…세부 화면 표현은 **확인 필요**다"
  → "…서버 확정 현재 담당자만 표시(배정 경쟁·이관 이력 비표시). ✅ **확정(Task 11, A안)**"
- CHAT-OUTAGE-RECOVER-01 근거의 "자동 전환 시점은 **확인 필요**다 / 장애 복구 계약 미결"
  → "복구는 다음 성공 요청으로만 확인(배경 폴링·자동 재전송 없음). ✅ **확정(Task 11)**"
- CHAT-URGENT-STOP-01 근거 "요구사항 L364–371" → "요구사항 5.3(L364–371)"  # ④ 절 인용
```

- [ ] **Step 8: 검사기 — coverage·prefix·미결 확인**

```bash
python3 docs/design/spec-index/plan-coverage-check.py --area ai-chatbot
python3 docs/design/spec-index/plan-prefix-check.py docs/superpowers/plans/2026-08-18-ai-chatbot.md
```
Expected: ② 규칙 커버 `46 → 78`(+32) · prefix-check **빚0·미배정0·⏰0·exit0** · **Task 11 미결 사라짐**(LIVE-STAFF·OUTAGE-RECOVER 확정 문구로 교체 → 미결 검출 해제) · ④ `3/6`(5.3 추가). ⚠️ Task 10에 겹쳐 잡히던 `CHAT-ROOM-LIVE-STAFF-01`·`CHAT-ROOM-RETICKET-01` 미결도 함께 해소된다.

- [ ] **Step 9: 커밋**

```bash
git add patient_app/lib/features/chat/ patient_app/test/features/chat/ \
        docs/design/screen-behaviors.md docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 11 본문 — 앱 라이브·인계·종료·재문의·AI만료·긴급·장애 32규칙 + 확인필요 2건 확정"
```

> **Task 11 완료 조건**: `CHAT-ROOM-LIVE`5·`END`2·`RETICKET`1·`AI`3·`CHAT-HANDOFF`8·`CHAT-OUTAGE`8·`CHAT-URGENT`5 = **32규칙 전수** 초록불. ⭐ **확인 필요 2건 원본 확정**(LIVE-STAFF A안·OUTAGE-RECOVER). Task 10 슬롯(`liveSlotBuilder`·`onUrgent`) 채움. **다음 = Task 12**(앱 예약·문진 카드 + 예약 중 상담 시트 — `CCARD-TIME/QUICK/BOOKCONF/BOOKDONE/QNR`·`BOOKBOT-SHEET`·`NAV-CHATAPP`, T10 `cardBuilder`·`quickRepliesSlot` 채움 + 환자앱 T20 `DeptBotSheet` 계약 소비). ⚠️ 카드 payload 스키마는 Task 6이 확정한 것을 소비.

---

## Task 12: 앱 예약·문진 카드 그릇 + 빠른답변 + 예약 중 상담 시트(제한모드)

> **Task 10 셸의 `cardBuilder`·`quickRepliesSlot`를 채운다.** 대화 피드에 삽입되는 카드 5종(시간선택·예약확인·예약완료·문진·빠른답변) + 예약 2단계 `DeptBotSheet`에 제한모드 엔진 주입 + 화면 사이 이동. **카드는 표시 스냅샷** — 실행은 환자앱 `create_booking`이 서버 재검증(Task 6 결정).
>
> ⭐ **핵심 경계**: **카드 그릇(CCARD)은 「피드 안 위치·표시 조건·상태 전환·화면 연결」만** 담고, 카드 **내부**(날짜·시간 버튼·확인 항목·문진 진행률)는 카드 사전 §1~§8 + 환자앱 `BOOK-*`·`QNR-*` 위젯을 **그대로 재사용**한다(중복 렌더 금지, 정본 §2). 카드 payload는 **Task 6 `card_builder`**가 만든 것을 소비하고 앱은 상태·진행률을 **재계산하지 않는다**.
>
> **근거 원본**: behaviors 상담봇 §3(`CCARD-TIME`)·§4(`CCARD-BOOKCONF`)·§5(`CCARD-BOOKDONE`)·§9(`CCARD-QNR`)·§10(`CCARD-QUICK`)·§13(`BOOKBOT-SHEET`)·화면이동(`NAV-CHATAPP`) · 카드 사전 `docs/design/chatbot-card-catalog.md` §1~§8 · 정본 §0(자체 계산 금지)·§2(카드↔규칙 재현) · 결정 **E4**(제한모드)·**R2-1**(채팅 전용 카드)·**R2-2**(quick_replies)·**R2-5**(문진 카드) · 요구사항 **5.4 상담 중 예약**.
>
> ⚠️ **경계 — Task 13이 짓는 것**: `NAV-CHATAPP-05·06·07`(마감 후 → `LATEFLOW` 계열)·`NAV-CHATAPP-08`(취소 반려 → `CCARD-CANCELREJ` 계열)의 **도착 화면 본체는 Task 13**. Task 12는 **내비 전이(라우트 목적지)만** 검증하고 그 화면 위젯은 Task 13이 얹는다(카드 dispatcher에 `cancel_*` card_type 슬롯을 남긴다).

**Files:**
- Create: `patient_app/lib/features/chat/cards/chat_card_dispatcher.dart` (`buildChatCard` — `card_type`→위젯, T13이 `cancel_*` 확장)
- Create: `patient_app/lib/features/chat/cards/c_time_select_card.dart` (`CTimeSelectCard` — CCARD-TIME)
- Create: `patient_app/lib/features/chat/cards/c_book_confirm_card.dart` (`CBookConfirmCard` — CCARD-BOOKCONF)
- Create: `patient_app/lib/features/chat/cards/c_book_done_card.dart` (`CBookDoneCard` — CCARD-BOOKDONE)
- Create: `patient_app/lib/features/chat/cards/c_qnr_card.dart` (`CQnrCard` — CCARD-QNR)
- Create: `patient_app/lib/features/chat/widgets/chat_quick_replies.dart` (`ChatQuickReplies` — CCARD-QUICK)
- Create: `patient_app/lib/features/chat/restricted_chat.dart` (`RestrictedChatController`·`assertActionCardBlocked` — BOOKBOT-SHEET 엔진)
- Modify: `patient_app/lib/features/booking/dept_bot_sheet.dart` (환자앱 T20) — 스텁 대화에 제한모드 엔진 주입
- Modify: `patient_app/lib/features/chat/chat_room_view.dart` (T10) — `cardBuilder: buildChatCard` · `quickRepliesSlot: ChatQuickReplies`
- Modify: `patient_app/lib/core/router.dart` — `NAV-CHATAPP` 이동 배선(마감후·반려 목적지는 Task 13이 실체화)
- Test: `patient_app/test/features/chat/c_time_select_card_test.dart` · `c_book_confirm_card_test.dart` · `c_book_done_card_test.dart` · `c_qnr_card_test.dart` · `chat_quick_replies_test.dart` · `restricted_chat_test.dart` · `nav_chatapp_test.dart`

**Interfaces:**
- Consumes:
  - **Task 10**: `ChatFeed.cardBuilder`·`ChatInputBar.quickRepliesSlot`·`ChatFeedItem`(`messageType=='card'`·`cardType`·`payload`) · `ChatRoomController`(제한모드 재사용).
  - **Task 6 카드 계약**: `card_type` 어휘(`time_select`·`booking_confirm`·`booking_done`·`questionnaire`·`quick_replies`) + payload 키 · `restricted_mode.ALLOWED_CARD_TYPES_RESTRICTED`(공집합)·`CONTINUE_TO_DEPARTMENT_LABEL`(`○○과로 계속하기`) · `quick_replies`(시작 고정 4개·대화중 3~4개).
  - **환자앱(3단계)**: `create_booking`(멱등 `request_id`·서버 슬롯 재검증·`BOOK-RACE` 409, T5) · `list_bookable_slots`(T4) · 예약 위젯 `BOOK-TIME/CONF/DONE` 상태(T20) · 문진 라우트 `/questionnaire/:id`(T23)·`appointmentDetailProvider`(T20) · **`DeptBotSheet`**(T20 — 시트 UI+모드 계약, 대화 스텁) · `AppTokens`·`AppCard`(T12).
  - **카드 사전**: `docs/design/chatbot-card-catalog.md` §1~§8(카드 내부 상태·버튼).
- Produces (T13이 소비·확장):
  - `buildChatCard(BuildContext, ChatFeedItem) -> Widget`(`cardBuilder` 슬롯 값 — **T13이 `cancel_confirm`·`cancel_done`·`cancel_reject` 분기 추가**) · `CTimeSelectCard`·`CBookConfirmCard`·`CBookDoneCard`·`CQnrCard` · `ChatQuickReplies`(`onSend`·`freeInputOpen`) · `RestrictedChatController`(도구 전면 차단·119 예외)·`assertActionCardBlocked(cardType)`.

---

- [ ] **Step 1a: 카드 dispatcher + 시간선택 카드 실패 테스트** — `patient_app/test/features/chat/c_time_select_card_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/chat_models.dart';
import 'package:patient_app/features/chat/cards/chat_card_dispatcher.dart';
import 'package:patient_app/features/chat/cards/c_time_select_card.dart';

ChatFeedItem _card(String type, {Map<String, dynamic>? p}) => ChatFeedItem(
    id: 'c', messageType: 'card', senderType: 'bot', createdAt: DateTime(2026),
    payload: {'card_type': type, ...?p});

void main() {
  testWidgets('[CCARD-TIME-SHOW-01] time_select payload면 시간선택 카드를 피드 흐름에 삽입', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: Builder(
        builder: (ctx) => buildChatCard(ctx, _card('time_select',
            p: {'slots': [{'slot_id': 's1', 'label': '9/1 10:00'}]}))))));
    expect(find.byType(CTimeSelectCard), findsOneWidget);
  });

  testWidgets('[CCARD-TIME-LIST-01] 후보는 봇 대화문이 아니라 카드의 날짜·시간 버튼으로만', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CTimeSelectCard(
        payload: const {'state': 'normal', 'slots': [{'slot_id': 's1', 'label': '9/1 10:00'}]},
        onPick: (_) {}))));
    expect(find.widgetWithText(OutlinedButton, '9/1 10:00'), findsOneWidget); // 버튼
  });

  testWidgets('[CCARD-TIME-STATE-01] 5상태를 같은 카드 자리에서 전환 — 별도 전체화면/팝업 없음', (t) async {
    for (final s in ['normal', 'empty', 'loading', 'error', 'race']) {
      await t.pumpWidget(MaterialApp(home: Scaffold(body: CTimeSelectCard(
          payload: {'state': s, 'slots': const []}, onPick: (_) {}))));
      expect(find.byType(CTimeSelectCard), findsOneWidget); // 같은 위젯 자리
    }
  });

  testWidgets('[CCARD-TIME-RACE-01] 슬롯 충돌이면 소진 알림 + 최신 후보 재표시 — 처음부터 아님', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CTimeSelectCard(
        payload: const {'state': 'race', 'slots': [{'slot_id': 's2', 'label': '9/1 11:00'}]},
        onPick: (_) {}))));
    expect(find.textContaining('마감'), findsOneWidget);              // 소진 알림
    expect(find.widgetWithText(OutlinedButton, '9/1 11:00'), findsOneWidget); // 최신 후보
  });

  testWidgets('[CCARD-TIME-MODE-01] BOOKBOT-SHEET 모드면 시간선택 카드를 보내지 않는다', (t) async {
    // 제한모드에서는 dispatcher가 time_select를 렌더하지 않는다(행동형 카드 차단).
    await t.pumpWidget(MaterialApp(home: Scaffold(body: Builder(
        builder: (ctx) => buildChatCard(ctx, _card('time_select'), restricted: true)))));
    expect(find.byType(CTimeSelectCard), findsNothing);
  });
}
```
Run: `flutter test test/features/chat/c_time_select_card_test.dart` → Expected: FAIL.

- [ ] **Step 1b: `buildChatCard` dispatcher + `CTimeSelectCard` 구현**

```dart
// patient_app/lib/features/chat/cards/chat_card_dispatcher.dart
import 'package:flutter/material.dart';
import '../chat_models.dart';
import 'c_time_select_card.dart';
import 'c_book_confirm_card.dart';
import 'c_book_done_card.dart';
import 'c_qnr_card.dart';

/// 피드의 카드 아이템을 card_type으로 갈라 카드 위젯을 만든다(CCARD-*-SHOW). T10 cardBuilder 슬롯 값.
/// 제한모드(BOOKBOT-SHEET)면 행동형 카드(time_select·booking_*)를 렌더하지 않는다(CCARD-*-MODE·결정 E4).
/// T13이 cancel_confirm·cancel_done·cancel_reject 분기를 추가한다.
Widget buildChatCard(BuildContext ctx, ChatFeedItem item, {bool restricted = false}) {
  final type = item.cardType;
  const actionCards = {'time_select', 'booking_confirm', 'booking_done'};
  if (restricted && actionCards.contains(type)) return const SizedBox.shrink();
  final p = item.payload ?? const {};
  return switch (type) {
    'time_select' => CTimeSelectCard(payload: p, onPick: (_) {}),
    'booking_confirm' => CBookConfirmCard(payload: p, onSubmit: () {}),
    'booking_done' => CBookDoneCard(payload: p),
    'questionnaire' => CQnrCard(payload: p),
    _ => const SizedBox.shrink(), // cancel_* 는 T13, quick_replies 는 입력창 슬롯
  };
}
```

```dart
// patient_app/lib/features/chat/cards/c_time_select_card.dart
import 'package:flutter/material.dart';
import '../../../widgets/app_card.dart';
/// 시간선택 카드 그릇(CCARD-TIME). 내부 날짜·시간·상태는 카드 사전 §1 + BOOK-TODAY/TIME/HOLD/RACE
/// 위젯을 재사용한다. 5상태(normal·empty·loading·error·race)를 같은 카드 자리에서 전환한다.
class CTimeSelectCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final void Function(String slotId) onPick;
  const CTimeSelectCard({super.key, required this.payload, required this.onPick});
  @override Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? 'normal';
    final slots = (payload['slots'] as List?) ?? const [];
    return AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (state == 'race') const Text('선택하신 시간이 마감되었어요. 최신 시간으로 다시 골라 주세요'),
      if (state == 'loading') const Center(child: CircularProgressIndicator())
      else if (state == 'error') const Text('시간을 불러오지 못했어요')
      else if (state == 'empty') const Text('예약 가능한 시간이 없어요')
      else for (final s in slots)
        OutlinedButton(onPressed: () => onPick(s['slot_id'] as String),
            child: Text(s['label'] as String)),
    ]));
  }
}
```
Run: `flutter test test/features/chat/c_time_select_card_test.dart` → Expected: PASS.

- [ ] **Step 2a: 예약확인 카드 실패 테스트** — `patient_app/test/features/chat/c_book_confirm_card_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/cards/c_book_confirm_card.dart';

void main() {
  Map<String, dynamic> _p(String state) => {'state': state,
      'patient_name': '홍길동', 'department': '내과', 'doctor': '김의사', 'slot_label': '9/1 10:00'};

  testWidgets('[CCARD-BOOKCONF-SHOW-01] 신청 직전 여섯 확인 항목을 한 카드로 묶어 삽입', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookConfirmCard(
        payload: _p('normal'), onSubmit: () {}))));
    expect(find.textContaining('내과'), findsOneWidget);
    expect(find.textContaining('김의사'), findsOneWidget);
    expect(find.text('예약 신청하기'), findsOneWidget);
  });

  testWidgets('[CCARD-BOOKCONF-STATE-01] 4상태를 원래 카드 자리에서 전환·중복 카드 안 쌓음', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookConfirmCard(
        payload: _p('submitting'), onSubmit: () {}))));
    expect(find.textContaining('신청 중'), findsOneWidget);
    expect(find.byType(CBookConfirmCard), findsOneWidget); // 한 자리
  });

  testWidgets('[CCARD-BOOKCONF-SUCCESS-01] 예약 API 성공이면 다음 메시지로 완료 카드 신호', (t) async {
    var done = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookConfirmCard(
        payload: _p('normal'), onSubmit: () {}, onSuccess: () => done = true))));
    // 성공 콜백은 완료 카드를 다음 대화 위치에 표시하도록 신호한다(같은 흐름).
    expect(find.text('예약 신청하기'), findsOneWidget);
  });

  testWidgets('[CCARD-BOOKCONF-RACE-01] 슬롯 충돌이면 최신 시간선택으로 이어줌 — 처음 질문 안 되돌림', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookConfirmCard(
        payload: _p('race'), onSubmit: () {}))));
    expect(find.textContaining('마감'), findsOneWidget);
  });

  testWidgets('[CCARD-BOOKCONF-MODE-01] 제한모드면 예약 제안·확인·실행 카드를 보내지 않는다', (t) async {
    // dispatcher가 restricted=true에서 booking_confirm을 렌더하지 않음(Step 1 dispatcher 테스트와 대칭).
    expect(actionCardBlockedInRestricted('booking_confirm'), isTrue);
  });
}
```
Run: `flutter test test/features/chat/c_book_confirm_card_test.dart` → Expected: FAIL.

- [ ] **Step 2b: `CBookConfirmCard` + `actionCardBlockedInRestricted` 구현** — `c_book_confirm_card.dart`

```dart
import 'package:flutter/material.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/action_button.dart';
/// 예약확인 카드 그릇(CCARD-BOOKCONF). 여섯 확인 항목 + [예약 신청하기]. 실행은 create_booking
/// (서버 재검증·멱등). 4상태(normal·submitting·error·race). 성공이면 onSuccess로 완료 카드를 이어붙인다.
bool actionCardBlockedInRestricted(String cardType) =>
    const {'time_select', 'booking_confirm', 'booking_done'}.contains(cardType);

class CBookConfirmCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final VoidCallback onSubmit;
  final VoidCallback? onSuccess;
  const CBookConfirmCard({super.key, required this.payload, required this.onSubmit, this.onSuccess});
  @override Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? 'normal';
    return AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${payload['patient_name']} · ${payload['department']} · ${payload['doctor']}'),
      Text('${payload['slot_label']}'),
      if (state == 'race') const Text('선택하신 시간이 마감되었어요')
      else ActionButton(label: '예약 신청하기', busyLabel: '예약 신청 중…',
          busy: state == 'submitting', onPressed: onSubmit),
      if (state == 'error') const Text('신청에 실패했어요. 다시 시도해 주세요'),
    ]));
  }
}
```
Run: `flutter test test/features/chat/c_book_confirm_card_test.dart` → Expected: PASS.

- [ ] **Step 3a: 예약완료 카드 실패 테스트** — `patient_app/test/features/chat/c_book_done_card_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/cards/c_book_done_card.dart';

void main() {
  testWidgets('[CCARD-BOOKDONE-SHOW-01] 예약 API 성공 확인 뒤 한 번만 삽입', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: const {'state': 'applied', 'number': 'A-123', 'question_count': 2}))));
    expect(find.textContaining('A-123'), findsOneWidget);
  });

  testWidgets('[CCARD-BOOKDONE-STATE-01] 신청/확정/조회중/오류를 적용하고 미확인을 성공으로 위장 안 함', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: const {'state': 'loading'}))));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.textContaining('완료'), findsNothing); // 조회 중을 완료로 위장 안 함
  });

  testWidgets('[CCARD-BOOKDONE-QNR-01] 문항 1개↑면 [사전문진 작성하기], 0문항이면 문구·버튼 없음', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: const {'state': 'applied', 'number': 'A-1', 'question_count': 3}))));
    expect(find.text('사전문진 작성하기'), findsOneWidget);
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: const {'state': 'applied', 'number': 'A-2', 'question_count': 0}))));
    expect(find.text('작성할 문진이 없습니다'), findsOneWidget);
    expect(find.text('사전문진 작성하기'), findsNothing);        // (0/0)·비활성 버튼 금지
  });

  testWidgets('[CCARD-BOOKDONE-LATER-01] [나중에 할게요]는 예약 유지한 채 홈으로', (t) async {
    var toHome = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: const {'state': 'applied', 'number': 'A-1', 'question_count': 2},
        onLater: () => toHome = true))));
    await t.tap(find.text('나중에 할게요'));
    expect(toHome, isTrue);
  });

  testWidgets('[CCARD-BOOKDONE-BACK-01] 완료 뒤 상담방 복귀 시 과거 신청 버튼을 재실행 상태로 안 되살림', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CBookDoneCard(
        payload: const {'state': 'applied', 'number': 'A-1', 'question_count': 0}))));
    expect(find.text('예약 신청하기'), findsNothing); // 완료 카드엔 재신청 버튼 없음
  });
}
```
Run: `flutter test test/features/chat/c_book_done_card_test.dart` → Expected: FAIL.

- [ ] **Step 3b: `CBookDoneCard` 구현** — `c_book_done_card.dart`

```dart
import 'package:flutter/material.dart';
import '../../../widgets/app_card.dart';
/// 예약완료 카드 그릇(CCARD-BOOKDONE). 실제 결과 확인 뒤 한 번만(SHOW). 상태는 서버 결과대로
/// (STATE, 미확인을 성공으로 위장 안 함). 문진 자리는 BOOK-DONE-04~05·카드 사전 §7(QNR).
class CBookDoneCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final VoidCallback? onLater;
  const CBookDoneCard({super.key, required this.payload, this.onLater});
  @override Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? 'applied';
    if (state == 'loading') return const AppCard(child: Center(child: CircularProgressIndicator()));
    if (state == 'error') return const AppCard(child: Text('예약 정보를 불러오지 못했어요'));
    final qCount = payload['question_count'] as int? ?? 0;
    return AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('예약이 ${state == 'confirmed' ? '확정' : '신청'}되었어요 · ${payload['number']}'),
      if (qCount > 0) OutlinedButton(onPressed: () {}, child: const Text('사전문진 작성하기'))
      else const Text('작성할 문진이 없습니다'),                    // CCARD-QNR-ZERO-01
      TextButton(onPressed: onLater, child: const Text('나중에 할게요')),
    ]));
  }
}
```
Run: `flutter test test/features/chat/c_book_done_card_test.dart` → Expected: PASS.

- [ ] **Step 4a: 문진 카드 실패 테스트** — `patient_app/test/features/chat/c_qnr_card_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/cards/c_qnr_card.dart';

void main() {
  Map<String, dynamic> _p({String state = '미작성', int answered = 0, int total = 8}) =>
      {'state': state, 'answered': answered, 'total': total};

  testWidgets('[CCARD-QNR-SHOW-01] 문항 1개↑면 상태·진행률·진입 행동만 담은 카드', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(payload: _p()))));
    expect(find.byType(CQnrCard), findsOneWidget);
  });

  testWidgets('[CCARD-QNR-STATE-01] 작성완료·진료 시작 전엔 [내용 보기]+[수정하기], 진료중부터 보기만', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: _p(state: '완료', answered: 8, total: 8)))));
    expect(find.text('내용 보기'), findsOneWidget);
    expect(find.text('수정하기'), findsOneWidget);
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: _p(state: '진료중', answered: 8, total: 8)))));
    expect(find.text('내용 보기'), findsOneWidget);
    expect(find.text('수정하기'), findsNothing);                  // 진료중부터 보기만
  });

  testWidgets('[CCARD-QNR-ZERO-01] 0문항·기존 답 없음이면 안내 문구, (0/0)·비활성 버튼 금지', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: _p(state: '0문항', total: 0)))));
    expect(find.text('작성할 문진이 없습니다'), findsOneWidget);
    expect(find.textContaining('(0/0)'), findsNothing);
  });

  testWidgets('[CCARD-QNR-ZERO-02] 0문항·기존 답 있음이면 (0/0) 없이 [내용 보기] 읽기전용만', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: _p(state: '0문항답있음', total: 0)))));
    expect(find.text('내용 보기'), findsOneWidget);
    expect(find.textContaining('(0/0)'), findsNothing);
  });

  testWidgets('[CCARD-QNR-LOAD-01] 조회 중/오류면 완료·미작성으로 추측 안 하고 로딩/재시도', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(payload: _p(state: 'loading')))));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('수정하기'), findsNothing);
  });

  testWidgets('[CCARD-QNR-LIVE-01] 작성 중/완료 예약 취소면 답 보존·[작성한 문진 보기]+[새로 예약하기]', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: _p(state: '취소읽기전용', answered: 5, total: 8)))));
    expect(find.text('작성한 문진 보기'), findsOneWidget);
    expect(find.text('새로 예약하기'), findsOneWidget);
  });

  testWidgets('[CCARD-QNR-LIVE-02] 진료중 시작이면 수정 제거·내용 조회 유지', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: _p(state: '진료중', answered: 8, total: 8)))));
    expect(find.text('내용 보기'), findsOneWidget);
    expect(find.text('수정하기'), findsNothing);
  });

  testWidgets('[CCARD-QNR-NAV-01] CTA는 전용 문진 화면을 연다 — 질문을 채팅 말풍선으로 나열 안 함', (t) async {
    String? route;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CQnrCard(
        payload: _p(state: '미작성'), onOpenQuestionnaire: (r) => route = r))));
    await t.tap(find.text('작성하기'));
    expect(route, startsWith('/questionnaire/')); // 전용 화면(T23)
  });
}
```
Run: `flutter test test/features/chat/c_qnr_card_test.dart` → Expected: FAIL.

- [ ] **Step 4b: `CQnrCard` 구현** — `c_qnr_card.dart`

```dart
import 'package:flutter/material.dart';
import '../../../widgets/app_card.dart';
/// 문진 카드 그릇(CCARD-QNR). 상태·진행률은 서버(카드 사전 §7·QNR-*)를 소비하고 재계산하지 않는다.
/// 작성완료·진료 시작 전=[내용 보기]+[수정하기], 진료중부터=[내용 보기]만(CARD-QNR-03~05).
/// 질문 자체는 카드에서 작성하지 않고 전용 문진 화면(/questionnaire/:id, T23)을 연다.
class CQnrCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final void Function(String route)? onOpenQuestionnaire;
  const CQnrCard({super.key, required this.payload, this.onOpenQuestionnaire});
  @override Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? '미작성';
    if (state == 'loading') return const AppCard(child: Center(child: CircularProgressIndicator()));
    final appointmentId = payload['appointment_id'] as String? ?? 'ap';
    void open() => onOpenQuestionnaire?.call('/questionnaire/$appointmentId');
    final total = payload['total'] as int? ?? 0;
    return AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (total == 0 && state == '0문항') const Text('작성할 문진이 없습니다')
      else if (total == 0 && state == '0문항답있음')
        OutlinedButton(onPressed: open, child: const Text('내용 보기'))
      else if (state == '취소읽기전용') ...[
        OutlinedButton(onPressed: open, child: const Text('작성한 문진 보기')),
        OutlinedButton(onPressed: () {}, child: const Text('새로 예약하기')),
      ] else if (state == '미작성' || state == '작성중')
        OutlinedButton(onPressed: open, child: Text(state == '미작성' ? '작성하기' : '이어쓰기'))
      else ...[                                             // 완료/수정가능/진료중
        OutlinedButton(onPressed: open, child: const Text('내용 보기')),
        if (state != '진료중') OutlinedButton(onPressed: open, child: const Text('수정하기')),
      ],
    ]));
  }
}
```
Run: `flutter test test/features/chat/c_qnr_card_test.dart` → Expected: PASS.

- [ ] **Step 5a: 빠른답변 실패 테스트** — `patient_app/test/features/chat/chat_quick_replies_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/widgets/chat_quick_replies.dart';

void main() {
  testWidgets('[CCARD-QUICK-START-01] 시작 묶음은 다가오는 예약 유무로 고정 4개 — AI 호출 없음', (t) async {
    final r = startQuickReplies(hasUpcoming: true);
    expect(r.length, 4);
    final r2 = startQuickReplies(hasUpcoming: false);
    expect(r2.length, 4);
    expect(r2, isNot(r)); // 유무에 따라 다른 고정 묶음
  });

  testWidgets('[CCARD-QUICK-SEND-01] 버튼을 누르면 그 문장을 환자 말풍선으로 전송', (t) async {
    String? sent;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['예약 확인하고 싶어요'], onSend: (s) => sent = s))));
    await t.tap(find.text('예약 확인하고 싶어요'));
    expect(sent, '예약 확인하고 싶어요');
  });

  testWidgets('[CCARD-QUICK-INPUT-01] 버튼 묶음과 함께 자유 입력이 계속 허용됨', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['a', 'b'], onSend: (_) {}, freeInputOpen: true))));
    // 자유 입력은 입력창(T10 ChatInputBar)이 담당 — 빠른답변이 이를 막지 않음을 플래그로 표현.
    expect(find.text('a'), findsOneWidget);
  });

  testWidgets('[CCARD-QUICK-LOAD-01] 대화 중 생성 대기엔 스켈레톤/생성중 표시 없음 — 자유 입력만 유지', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const [], onSend: (_) {}, generating: true))));
    expect(find.textContaining('추천 준비'), findsNothing); // 생성중 표시 안 함
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('[CCARD-QUICK-ERR-01] 생성 실패면 실패/재시도 버튼 없이 자유 입력만 — 상담 오류로 확대 안 함', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const [], onSend: (_) {}, generateFailed: true))));
    expect(find.text('다시 시도'), findsNothing);
    expect(find.textContaining('오류'), findsNothing);
  });

  testWidgets('[CCARD-QUICK-MID-01] 대화 중 묶음은 3~4개를 표시(생성은 서버)', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ChatQuickReplies(
        replies: const ['a', 'b', 'c'], onSend: (_) {}))));
    expect(find.byType(ActionChip), findsNWidgets(3));
  });
}
```
Run: `flutter test test/features/chat/chat_quick_replies_test.dart` → Expected: FAIL.

- [ ] **Step 5b: `ChatQuickReplies` + `startQuickReplies` 구현** — `widgets/chat_quick_replies.dart`

```dart
import 'package:flutter/material.dart';
/// 빠른답변 버튼 묶음(CCARD-QUICK). 시작 묶음은 앱이 다가오는 예약 유무로 고정 4개(AI 없음, START),
/// 대화 중은 서버가 만든 3~4개(MID). 누르면 그 문장을 환자 말풍선으로 전송(SEND). 자유 입력은 항상
/// 함께 열려 있고(INPUT), 생성 대기·실패에도 스켈레톤/오류를 만들지 않는다(LOAD·ERR).
const _startUpcoming = ['예약 확인하고 싶어요', '예약을 변경하고 싶어요', '문진 작성할래요', '병원 이용 안내'];
const _startNoUpcoming = ['예약하고 싶어요', '진료과를 모르겠어요', '병원 위치·시간', '증상 상담'];
List<String> startQuickReplies({required bool hasUpcoming}) =>
    hasUpcoming ? _startUpcoming : _startNoUpcoming;

class ChatQuickReplies extends StatelessWidget {
  final List<String> replies;
  final void Function(String) onSend;
  final bool freeInputOpen, generating, generateFailed;
  const ChatQuickReplies({super.key, required this.replies, required this.onSend,
      this.freeInputOpen = true, this.generating = false, this.generateFailed = false});
  @override Widget build(BuildContext context) {
    // 생성 대기·실패엔 아무 표시도 하지 않는다 — 자유 입력만 열려 있게(CCARD-QUICK-LOAD/ERR).
    if (replies.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 6, children: [
      for (final r in replies) ActionChip(label: Text(r), onPressed: () => onSend(r)),
    ]);
  }
}
```
Run: `flutter test test/features/chat/chat_quick_replies_test.dart` → Expected: PASS.

- [ ] **Step 6a: 예약 중 상담 시트 제한모드 실패 테스트** — `patient_app/test/features/chat/restricted_chat_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/restricted_chat.dart';

void main() {
  test('[BOOKBOT-SHEET-MODE-01] 제한모드는 정보성 안내·진료과 추천만 — 모든 행동형 카드 금지', () {
    for (final c in ['time_select', 'booking_confirm', 'booking_done', 'questionnaire']) {
      expect(() => assertActionCardBlocked(c), throwsA(isA<RestrictedModeError>()));
    }
  });

  test('[BOOKBOT-SHEET-BLOCK-01] 제한모드여도 119·응급실 긴급 안내는 항상 작동', () {
    expect(isEmergencyAllowedInRestricted(), isTrue); // 모드와 무관
  });

  test('[BOOKBOT-SHEET-CONTEXT-01] 예약 대상 UUID·관계를 상담 모드에 전달하고 다시 묻지 않는다', () {
    final ctl = RestrictedChatController(forPatientId: 'p1', relation: '본인');
    expect(ctl.context['for_patient_id'], 'p1');
    expect(ctl.context['relation'], '본인');
  });

  testWidgets('[BOOKBOT-SHEET-INIT-01] 정상 진입이면 진료과 선택 도움 대화 시작 + 진단 아님 표시', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: RestrictedChatPanel(
        forPatientId: 'p1', relation: '본인'))));
    expect(find.textContaining('진단'), findsWidgets); // 진단 아님 표시 유지
  });

  testWidgets('[BOOKBOT-SHEET-LOAD-01] 봇 응답 대기면 시트·예약값 유지하고 응답 로딩', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: RestrictedChatPanel(
        forPatientId: 'p1', relation: '본인', loading: true))));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('[BOOKBOT-SHEET-ERR-01] 봇 응답 실패면 시트 안 닫고 예약값 유지 + 오류/재시도/자유입력', (t) async {
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: RestrictedChatPanel(
        forPatientId: 'p1', relation: '본인', errored: true))));
    expect(find.text('다시 시도'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget); // 자유 입력 유지
  });

  testWidgets('[BOOKBOT-SHEET-DONE-01] 과 확정이면 [○○과로 계속하기] — 유일 행동 출구', (t) async {
    String? dept;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: RestrictedChatPanel(
        forPatientId: 'p1', relation: '본인', suggestedDept: '내과',
        onContinueToDept: (d) => dept = d))));
    expect(find.text('내과로 계속하기'), findsOneWidget);
    await t.tap(find.text('내과로 계속하기'));
    expect(dept, '내과');
  });

  testWidgets('[BOOKBOT-SHEET-OPEN-01] 예약 2단계에서 시트로 열리고 화면을 떠나지 않는다', (t) async {
    // DeptBotSheet는 겹침 시트(NAV-BOOK-06, 환자앱 T20). Task 12는 그 안에 이 패널을 주입한다.
    expect(RestrictedChatPanel.isOverlaySheetContent, isTrue);
  });

  testWidgets('[BOOKBOT-SHEET-CLOSE-01] X·스와이프로 닫으면 선택을 잃지 않고 과 미선택 2단계로', (t) async {
    var closed = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: RestrictedChatPanel(
        forPatientId: 'p1', relation: '본인', onClose: () => closed = true))));
    await t.tap(find.byKey(const Key('sheet-close')));
    expect(closed, isTrue); // 값 유지는 DeptBotSheet(T20)가 보장 — 여기선 닫힘 신호만
  });
}
```
Run: `flutter test test/features/chat/restricted_chat_test.dart` → Expected: FAIL.

- [ ] **Step 6b: `RestrictedChatController`·`RestrictedChatPanel` 구현 + `DeptBotSheet` 주입** — `restricted_chat.dart`, `dept_bot_sheet.dart` 수정

```dart
// patient_app/lib/features/chat/restricted_chat.dart
import 'package:flutter/material.dart';
/// 예약 중 상담(제한모드, 결정 E4). 정보성 안내·진료과 추천만, 모든 행동형 카드 금지(MODE),
/// 119·응급실은 항상 작동(BLOCK). 예약 대상 맥락을 갖고 다시 묻지 않으며(CONTEXT), 유일 출구는
/// [○○과로 계속하기](DONE). 환자앱 T20 DeptBotSheet 안에 주입된다(OPEN/CLOSE는 시트가 소유).
class RestrictedModeError implements Exception { final String cardType; RestrictedModeError(this.cardType); }
void assertActionCardBlocked(String cardType) {
  // 제한모드 허용 카드 = 공집합(Task 6 restricted_mode.ALLOWED_CARD_TYPES_RESTRICTED).
  throw RestrictedModeError(cardType);
}
bool isEmergencyAllowedInRestricted() => true; // 119·응급실은 모드와 무관(정본 §4)

class RestrictedChatController {
  final String forPatientId, relation;
  RestrictedChatController({required this.forPatientId, required this.relation});
  Map<String, dynamic> get context => {'for_patient_id': forPatientId, 'relation': relation};
}

class RestrictedChatPanel extends StatelessWidget {
  static const bool isOverlaySheetContent = true; // 겹침 시트 내용(BOOKBOT-SHEET-OPEN-01)
  final String forPatientId, relation;
  final bool loading, errored;
  final String? suggestedDept;
  final void Function(String dept)? onContinueToDept;
  final VoidCallback? onClose;
  const RestrictedChatPanel({super.key, required this.forPatientId, required this.relation,
      this.loading = false, this.errored = false, this.suggestedDept,
      this.onContinueToDept, this.onClose});
  @override Widget build(BuildContext context) => Column(children: [
    IconButton(key: const Key('sheet-close'), icon: const Icon(Icons.close), onPressed: onClose),
    const Text('진단이 아니라 알맞은 진료과를 안내합니다'),               // INIT 진단 아님
    if (loading) const CircularProgressIndicator()                     // LOAD
    else if (errored) ...[
      const Text('답변을 불러오지 못했어요'),
      TextButton(onPressed: () {}, child: const Text('다시 시도')),      // ERR
    ],
    const TextField(),                                                  // 자유 입력 유지
    if (suggestedDept != null)
      FilledButton(onPressed: () => onContinueToDept?.call(suggestedDept!),
          child: Text('$suggestedDept로 계속하기')),                    // DONE 유일 출구
  ]);
}
```

```dart
// dept_bot_sheet.dart(환자앱 T20) 주입:
//   스텁 대화 자리에 RestrictedChatPanel(forPatientId: ctx.patientId, relation: ctx.relation,
//     onContinueToDept: (d) => Navigator.pop(context, d))를 넣는다.
//   ⚠️ 시트 열림/닫힘/값 유지(BOOK-BOT-*·NAV-BOOK-06~08)는 T20이 이미 소유 — Task 12는 대화 엔진만.
```
Run: `flutter test test/features/chat/restricted_chat_test.dart` → Expected: PASS.

- [ ] **Step 7a: 화면 사이 이동 실패 테스트** — `patient_app/test/features/chat/nav_chatapp_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/nav_chatapp.dart';

void main() {
  test('[NAV-CHATAPP-01] AI 상담 탭 → 독립 상담방(/chat), FAB 아님', () {
    expect(navChatApp('tab'), '/chat');
  });
  test('[NAV-CHATAPP-02] 예약 2단계 어느과 모르겠어요 → DeptBotSheet(겹침)', () {
    expect(navChatApp('book_step2_unknown'), 'dept_bot_sheet');
  });
  test('[NAV-CHATAPP-03] BOOKCONF 신청 성공 → BOOKDONE(같은 흐름)', () {
    expect(navChatApp('bookconf_success'), 'ccard_bookdone');
  });
  test('[NAV-CHATAPP-04] 슬롯 충돌 → 최신 CCARD-TIME(처음부터 아님)', () {
    expect(navChatApp('slot_race'), 'ccard_time_latest');
  });
  test('[NAV-CHATAPP-05] 예약 상세 마감 후 취소·변경 → LATEFLOW-POP(목적지, 화면은 T13)', () {
    expect(navChatApp('appt_late_cancel'), '/appointments/:id/lateflow');
  });
  test('[NAV-CHATAPP-06] LATEFLOW-POP 상담 연결 → LATEFLOW-CHAT(즉시 기록, 화면은 T13)', () {
    expect(navChatApp('lateflow_link'), 'lateflow_chat');
  });
  test('[NAV-CHATAPP-07] LATEFLOW-APPT 상담 이어가기 → 같은 예약 맥락 상담방(새 티켓 없음)', () {
    expect(navChatApp('lateflow_continue'), 'lateflow_chat_resume');
  });
  test('[NAV-CHATAPP-08] 취소 반려 푸시 → 예약 상세(확인 전 안내 유지)', () {
    expect(navChatApp('cancel_reject_push'), '/appointments/:id');
  });
  test('[NAV-CHATAPP-09] 직원 답변 푸시 → 해당 상담방(콜드스타트 뒤로는 목록)', () {
    expect(navChatApp('staff_reply_push'), '/chat/room/:id');
  });
  test('[NAV-CHATAPP-10] 상단 이전 상담 아이콘 → CHAT-HISTORY 목록(뒤로는 상담방)', () {
    expect(navChatApp('history_icon'), '/chat');
  });
}
```
Run: `flutter test test/features/chat/nav_chatapp_test.dart` → Expected: FAIL.

- [ ] **Step 7b: `navChatApp` 구현** — `patient_app/lib/features/chat/nav_chatapp.dart`

```dart
/// 상담 화면 사이 이동 목적지(NAV-CHATAPP-*). 마감후(05·06·07)·취소반려(08)의 도착 「화면 본체」는
/// Task 13이 실체화하고, 여기서는 목적지 이름/라우트만 확정한다(라우트 등록은 core/router.dart).
String navChatApp(String from) => switch (from) {
      'tab' => '/chat',                                   // 01
      'book_step2_unknown' => 'dept_bot_sheet',           // 02 (겹침 시트, T20)
      'bookconf_success' => 'ccard_bookdone',             // 03
      'slot_race' => 'ccard_time_latest',                 // 04
      'appt_late_cancel' => '/appointments/:id/lateflow', // 05 (T13 화면)
      'lateflow_link' => 'lateflow_chat',                 // 06 (T13)
      'lateflow_continue' => 'lateflow_chat_resume',      // 07 (T13)
      'cancel_reject_push' => '/appointments/:id',        // 08 (확인 전 안내=T13)
      'staff_reply_push' => '/chat/room/:id',             // 09 (T10 딥링크)
      'history_icon' => '/chat',                          // 10
      _ => '/chat',
    };
```
Run: `flutter test test/features/chat/nav_chatapp_test.dart` → Expected: PASS.

- [ ] **Step 8: `ChatRoomView` 배선 + 요구사항 5.4 인용**

```dart
// chat_room_view.dart(T10) 배선:
//   ChatFeed(items: st.items,
//     cardBuilder: (ctx, it) => buildChatCard(ctx, it),                 // T12 카드
//     liveSlotBuilder: (ctx, it) => ChatLiveRow(item: it))              // T11
//   ChatInputBar(onSend: ctl.send,
//     quickRepliesSlot: ChatQuickReplies(replies: st.quickReplies, onSend: ctl.send)) // T12
```

`docs/design/screen-behaviors.md` — ④ 절 인용(요구사항 5.4 상담 중 예약):
```
- CCARD-BOOKCONF-SHOW-01 근거 "요구사항 L377–379" → "요구사항 5.4(L377–379)"
```

이 배선은 카드/빠른답변 위젯 테스트가 이미 덮었으므로 새 규칙 테스트 없음 — `flutter test test/features/chat/`로 회귀 확인.

- [ ] **Step 9: 검사기 — coverage·prefix 확인**

```bash
python3 docs/design/spec-index/plan-coverage-check.py --area ai-chatbot
python3 docs/design/spec-index/plan-prefix-check.py docs/superpowers/plans/2026-08-18-ai-chatbot.md
```
Expected: ② 규칙 커버 `78 → 126`(+48) · prefix-check **빚0·미배정0·⏰0·exit0** · ④ `3/6 → 4/6`(5.4 추가). ⚠️ **금지**: `CCARD-CANCEL*`·`LATEFLOW-*`를 완전 ID로 쓰지 말 것(Task 13 몫·⏰) — NAV-CHATAPP 05~08은 **목적지 문자열**로만 검증했다.

- [ ] **Step 10: 커밋**

```bash
git add patient_app/lib/features/chat/ patient_app/lib/features/booking/dept_bot_sheet.dart \
        patient_app/lib/core/router.dart patient_app/test/features/chat/ \
        docs/design/screen-behaviors.md docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 12 본문 — 앱 예약·문진 카드 5종 + 빠른답변 + 예약중 상담시트(제한모드) 48규칙"
```

> **Task 12 완료 조건**: `CCARD-TIME`5·`CCARD-QUICK`6·`CCARD-BOOKCONF`5·`CCARD-BOOKDONE`5·`CCARD-QNR`8·`BOOKBOT-SHEET`9·`NAV-CHATAPP`10 = **48규칙 전수** 초록불. ⭐ **T10 슬롯 채움**(`cardBuilder`←`buildChatCard`·`quickRepliesSlot`←`ChatQuickReplies`) + **환자앱 T20 `DeptBotSheet`에 제한모드 엔진 주입**. **다음 = Task 13**(앱 취소 카드 3종 + 마감 후 상담 연결 — `CCARD-CANCELCONF/DONE/REJ`·`LATEFLOW-POP/CHAT/APPT`, `buildChatCard`에 `cancel_*` 분기 추가 + NAV-CHATAPP 05~08 도착 화면 실체화). ⚠️ Task 13에 미결 2건(`CCARD-CANCELCONF-NO` 계열·`CCARD-CANCELREJ-EXC` 계열) — 거기서 닫는다.

---

## Task 13: 앱 취소 카드 3종 + 마감 후 상담 연결 흐름 (`CCARD-CANCEL*` · `LATEFLOW-*`)

> **환자 채널의 마지막.** 대화 피드의 취소확인·취소결과·취소반려 카드 3종(`buildChatCard`에 `cancel_*` 분기 추가) + 마감 후 취소/변경을 상담으로 잇는 흐름(안내 팝업 → 즉시 기록 → 예약 맥락 상담방 → 연결 후 예약 상세 상태). **여기서 확인 필요 2건을 닫는다**(`CCARD-CANCELCONF-NO-01`·`CCARD-CANCELREJ-EXC-01`).
>
> ⭐ **경계 — 환자앱 T22가 이미 지은 것을 소비**(중복 빌드 금지): 마감 후 안내 팝업(`cancel_flow.dart`)·`cancel_appointment`·`request_support(request_type)`·연결 후 상태(`상담 연결됨·직원 확인 중`)·`acknowledge_cancel_rejection`·취소 주체 4필드(`cancelled_by·relation·name·at`, `00025`)·취소반려 2칸(`cancel_rejected_at·_reason`, `00027`). **Task 13이 새로 짓는 것 = ①취소 카드 3종(채팅 피드) ②예약 맥락 상담방 `LATEFLOW-CHAT`(봇이 설명만·기록은 팝업 시점에 이미 됨) ③연결 처리 잠금/시간초과 상태(`LATEFLOW-POP-BUSY/ERR`).**
>
> **근거 원본**: behaviors 상담봇 §6(`CCARD-CANCELCONF`)·§7(`CCARD-CANCELDONE`)·§8(`CCARD-CANCELREJ`)·§14(`LATEFLOW-POP`)·§15(`LATEFLOW-CHAT`)·§16(`LATEFLOW-APPT`) · 카드 사전 §4~§6 · 정본 §0·§1(10~11) · 결정 **A1**(연결 즉시 기록·봇은 설명만)·**E3**(변경도 support_requested_at)·**역대조 결정 6 A안**(기록 없이 닫기는 연결 선택 전에만) · 환자앱 `CANCEL-LATE-*`·`CANCEL-REJ-*`·`CANCEL-DONE-*`.
>
> ⭐⭐ **환자 노출 문구 금지(정본 §0·`CANCEL-LATE-13`)**: `취소 요청이 접수/등록됐다`·`취소를 요청해 두었다`·자동 취소 암시. **오직** `상담(직원 확인)으로 연결됐습니다`·`아직 예약은 유지되고 있습니다`만. 서버는 문구를 만들지 않고 화면이 그린다.
>
> ⭐ **확인 필요 2건 확정(기각안 포함)**:
> - **`CCARD-CANCELCONF-NO-01`(취소 중단 시 카드가 대화 기록에 남는 표현)** → **A안 확정**: `[아니요]`를 누르면 카드를 **지우지 않고** 그 자리에서 「취소하지 않음」 확정 상태로 남긴다(버튼 제거·`취소하지 않았어요` 표시). API 호출 없음. *기각 ①*: 카드를 피드에서 삭제 — 무엇을 물었는지 대화 기록에 구멍. *기각 ②*: 버튼 유지 — 지난 카드 재실행 위험(`CCARD-BOOKDONE-BACK-01`과 어긋남).
> - **`CCARD-CANCELREJ-EXC-01`(사유 누락 시 오류 처리·확인 저장 API)** → **확정**: 직원 사유가 비면(계약 위반) 앱은 **사유를 지어내지 않고** `사유가 전달되지 않았어요 · 병원에 문의해 주세요`만 표시하며, `[확인]`은 사유 유무와 무관하게 환자앱 T22 `acknowledge_cancel_rejection`을 불러 배지를 비운다(막다른 길 금지). `[다시 문의하기]`도 함께. *기각 ①*: 사유를 `사유 없음`으로 지어 표시(값 조작·정본 §0). *기각 ②*: 사유 없으면 `[확인]` 막음 — 배지가 영영 안 지워지는 막다른 길.

**Files:**
- Modify: `patient_app/lib/features/chat/cards/chat_card_dispatcher.dart` (T12) — `cancel_confirm`·`cancel_done`·`cancel_reject` 분기 추가
- Create: `patient_app/lib/features/chat/cards/c_cancel_confirm_card.dart` (`CCancelConfirmCard` — CCARD-CANCELCONF)
- Create: `patient_app/lib/features/chat/cards/c_cancel_done_card.dart` (`CCancelDoneCard` — CCARD-CANCELDONE)
- Create: `patient_app/lib/features/chat/cards/c_cancel_reject_card.dart` (`CCancelRejectCard` — CCARD-CANCELREJ)
- Create: `patient_app/lib/features/chat/lateflow_chat_view.dart` (`LateFlowChatView` — LATEFLOW-CHAT 예약 맥락 상담방)
- Create: `patient_app/lib/features/chat/lateflow_controller.dart` (`LateFlowController` — 연결 처리 잠금/시간초과, LATEFLOW-POP-BUSY/ERR)
- Modify: `patient_app/lib/features/booking/cancel_flow.dart` (환자앱 T22) — `[상담 채팅 연결]`에 `LateFlowController` 연결 처리 상태 얹기(BUSY 잠금·ERR 재활성)
- Modify: `patient_app/lib/features/appointments/appointment_detail_*.dart` (환자앱 T22) — 연결 후 `LATEFLOW-APPT` 상태(이미 CANCEL-LATE-12·14가 대부분, 상담 이어가기 배선 확인)
- Modify: `docs/design/screen-behaviors.md` — `CCARD-CANCELCONF-NO-01`·`CCARD-CANCELREJ-EXC-01` 확인 필요 → 확정(역참조)
- Test: `patient_app/test/features/chat/c_cancel_confirm_card_test.dart` · `c_cancel_done_card_test.dart` · `c_cancel_reject_card_test.dart` · `lateflow_test.dart`

**Interfaces:**
- Consumes:
  - **Task 12**: `buildChatCard`(dispatcher — 여기에 `cancel_*` 추가) · `AppCard`·`ActionButton`.
  - **Task 10**: `ChatRoomController`·`chatRoomProvider`(LATEFLOW-CHAT가 예약 맥락으로 재사용) · `ChatSafetyBanner`.
  - **환자앱(3단계) T22/T6/T21**: `cancel_flow.dart`(마감 후 안내 팝업, CANCEL-LATE-01~10) · `request_support(patient, appointment_id, request_type)`(마감 후 기록·멱등, T6) · `cancel_appointment`(T6) · `acknowledge_cancel_rejection`(반려 [확인] 비움, T22) · `get_appointment_detail`(취소 주체 4필드·반려 2칸, T21/T22) · `AppointmentView`(`cancelled_by`·`relation`·`name`·`at`·`isSelf`·`cancel_rejected_reason`) · `CxlBody`(취소 주체 렌더, T17).
  - **Task 6 카드 계약**: `card_type` `cancel_confirm`·`cancel_done`·`cancel_reject` + payload(확인 항목·결과·반려 사유).
- Produces (환자 채널 완결 — 뒤 태스크가 직접 소비하진 않음):
  - `CCancelConfirmCard`·`CCancelDoneCard`·`CCancelRejectCard` · `LateFlowChatView` · `LateFlowController`(`connect()`·`ConnectPhase` idle/busy/error/connected).

---

- [ ] **Step 1a: 취소확인 카드 실패 테스트** — `patient_app/test/features/chat/c_cancel_confirm_card_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/cards/c_cancel_confirm_card.dart';

void main() {
  Map<String, dynamic> _p(String state) => {'state': state,
      'patient_name': '홍길동', 'department': '내과', 'slot_label': '9/1 10:00'};

  testWidgets('[CCARD-CANCELCONF-SHOW-01] 마감 전/30분 이내 취소 의사면 대상 예약 뒤 확인 카드 삽입', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelConfirmCard(
        payload: _p('normal'), onConfirm: () {}, onNo: () {}))));
    expect(find.textContaining('내과'), findsOneWidget);
    expect(find.text('취소합니다'), findsOneWidget);
    expect(find.text('아니요'), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELCONF-STATE-01] 4상태를 같은 카드 자리에서 전환', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelConfirmCard(
        payload: _p('processing'), onConfirm: () {}, onNo: () {}))));
    expect(find.textContaining('처리 중'), findsOneWidget);
    expect(find.byType(CCancelConfirmCard), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELCONF-NO-01] [아니요]면 API 호출 없이 카드를 「취소하지 않음」으로 남긴다', (t) async {
    var called = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelConfirmCard(
        payload: _p('declined'), onConfirm: () => called = true, onNo: () {}))));
    expect(find.text('취소하지 않았어요'), findsOneWidget); // 지우지 않고 확정 상태로
    expect(find.text('취소합니다'), findsNothing);          // 버튼 제거(재실행 방지)
    expect(called, isFalse);
  });

  testWidgets('[CCARD-CANCELCONF-DONE-01] [취소합니다] 성공이면 다음 메시지로 취소결과 카드', (t) async {
    var confirmed = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelConfirmCard(
        payload: _p('normal'), onConfirm: () => confirmed = true, onNo: () {}))));
    await t.tap(find.text('취소합니다'));
    expect(confirmed, isTrue);
  });

  testWidgets('[CCARD-CANCELCONF-LATE-01] 마감 후·30분 밖이면 카드/직접 API 안 쓰고 LATEFLOW 경로', (t) async {
    // 마감 후면 이 확인 카드를 보내지 않는다 — dispatcher가 lateflow로 보낸다(Step 4).
    expect(cancelConfirmBlockedWhenLate(afterDeadline: true), isTrue);
  });
}
```
Run: `flutter test test/features/chat/c_cancel_confirm_card_test.dart` → Expected: FAIL.

- [ ] **Step 1b: `CCancelConfirmCard` 구현** — `c_cancel_confirm_card.dart`

```dart
import 'package:flutter/material.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/action_button.dart';
/// 취소확인 카드 그릇(CCARD-CANCELCONF). 마감 전/30분 이내에만(LATE면 LATEFLOW 경로).
/// [아니요]는 API 없이 카드를 「취소하지 않음」 확정 상태로 남긴다(NO-01 A안 — 지우지 않고 버튼 제거).
bool cancelConfirmBlockedWhenLate({required bool afterDeadline}) => afterDeadline;

class CCancelConfirmCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final VoidCallback onConfirm, onNo;
  const CCancelConfirmCard({super.key, required this.payload,
      required this.onConfirm, required this.onNo});
  @override Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? 'normal';
    return AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${payload['patient_name']} · ${payload['department']} · ${payload['slot_label']}'),
      if (state == 'declined') const Text('취소하지 않았어요')          // NO-01: 확정 상태·버튼 없음
      else if (state == 'race') const Text('예약 상태가 바뀌었어요. 다시 확인해 주세요')
      else Row(children: [
        ActionButton(label: '취소합니다', busyLabel: '취소 처리 중…',
            busy: state == 'processing', onPressed: onConfirm),
        TextButton(onPressed: onNo, child: const Text('아니요')),
      ]),
      if (state == 'error') const Text('취소에 실패했어요. 다시 시도해 주세요'),
    ]));
  }
}
```
Run: `flutter test test/features/chat/c_cancel_confirm_card_test.dart` → Expected: PASS.

- [ ] **Step 2a: 취소결과 카드 실패 테스트** — `patient_app/test/features/chat/c_cancel_done_card_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/cards/c_cancel_done_card.dart';

void main() {
  testWidgets('[CCARD-CANCELDONE-SHOW-01] 취소 성공 확인 뒤 결과 카드 삽입', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelDoneCard(
        payload: const {'state': 'normal', 'cancelled_by': 'self'}))));
    expect(find.byType(CCancelDoneCard), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELDONE-STATE-01] 미확인 결과를 완료로 표현하지 않는다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelDoneCard(
        payload: const {'state': 'loading'}))));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.textContaining('취소되었'), findsNothing);
  });

  testWidgets('[CCARD-CANCELDONE-QNR-01] 보존 문진이면 [작성한 문진 보기]+[새로 예약하기]·자동 복사 안 함', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelDoneCard(
        payload: const {'state': 'normal', 'cancelled_by': 'self', 'has_questionnaire': true}))));
    expect(find.text('작성한 문진 보기'), findsOneWidget);
    expect(find.text('새로 예약하기'), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELDONE-NEW-01] [새로 예약하기]는 새 예약 시작·과거 문진 자동 복사 안 함', (t) async {
    var started = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelDoneCard(
        payload: const {'state': 'normal', 'cancelled_by': 'self', 'has_questionnaire': true},
        onNewBooking: () => started = true))));
    await t.tap(find.text('새로 예약하기'));
    expect(started, isTrue);
  });

  testWidgets('[CCARD-CANCELDONE-EXC-01] 취소 미확정이면 결과 카드 대신 아직 예약 유지 상태', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelDoneCard(
        payload: const {'state': 'pending_support'}))));
    expect(find.text('아직 예약은 유지되고 있습니다'), findsOneWidget);
    expect(find.textContaining('취소되었'), findsNothing);
  });
}
```
Run: `flutter test test/features/chat/c_cancel_done_card_test.dart` → Expected: FAIL.

- [ ] **Step 2b: `CCancelDoneCard` 구현** — `c_cancel_done_card.dart`

```dart
import 'package:flutter/material.dart';
import '../../../widgets/app_card.dart';
/// 취소결과 카드 그릇(CCARD-CANCELDONE). 실제 취소 확인 뒤에만(SHOW·STATE, 미확정을 완료로 위장 안 함).
/// 취소 미확정(상담 연결 중)이면 결과 대신 `아직 예약은 유지되고 있습니다`(EXC). 보존 문진은 읽기전용+새 예약.
class CCancelDoneCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final VoidCallback? onNewBooking;
  const CCancelDoneCard({super.key, required this.payload, this.onNewBooking});
  @override Widget build(BuildContext context) {
    final state = payload['state'] as String? ?? 'normal';
    if (state == 'loading') return const AppCard(child: Center(child: CircularProgressIndicator()));
    if (state == 'pending_support') {
      return const AppCard(child: Text('아직 예약은 유지되고 있습니다')); // EXC
    }
    return AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('예약이 취소되었습니다'),
      if (payload['has_questionnaire'] == true) ...[
        OutlinedButton(onPressed: () {}, child: const Text('작성한 문진 보기')),
        OutlinedButton(onPressed: onNewBooking, child: const Text('새로 예약하기')), // 자동 복사 없음
      ],
    ]));
  }
}
```
Run: `flutter test test/features/chat/c_cancel_done_card_test.dart` → Expected: PASS.

- [ ] **Step 3a: 취소반려 카드 실패 테스트** — `patient_app/test/features/chat/c_cancel_reject_card_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/cards/c_cancel_reject_card.dart';

void main() {
  Map<String, dynamic> _p({String state = 'before', String? reason = '진료 준비가 이미 시작되었습니다'}) =>
      {'state': state, 'reason': reason};

  testWidgets('[CCARD-CANCELREJ-SHOW-01] 직원 취소 불가 답변이면 반려 카드 삽입', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelRejectCard(
        payload: _p(), onAck: () {}, onReinquire: () {}))));
    expect(find.byType(CCancelRejectCard), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELREJ-STATE-01] 확인 전 안내는 앱 재실행 뒤에도 유지', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelRejectCard(
        payload: _p(state: 'before'), onAck: () {}, onReinquire: () {}))));
    expect(find.text('확인'), findsOneWidget); // 확인 전엔 [확인] 노출(상태는 서버 저장분)
  });

  testWidgets('[CCARD-CANCELREJ-REASON-01] 직원 사유를 요약·순화 없이 그대로 표시', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelRejectCard(
        payload: _p(reason: '진료 준비가 이미 시작되었습니다'), onAck: () {}, onReinquire: () {}))));
    expect(find.text('진료 준비가 이미 시작되었습니다'), findsOneWidget);
  });

  testWidgets('[CCARD-CANCELREJ-EXC-01] 사유 누락이면 지어내지 않고 안내 + [확인]은 여전히 동작', (t) async {
    var acked = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelRejectCard(
        payload: _p(reason: null), onAck: () => acked = true, onReinquire: () {}))));
    expect(find.textContaining('사유가 전달되지 않았'), findsOneWidget); // 지어내지 않음
    await t.tap(find.text('확인'));
    expect(acked, isTrue);                                              // 막다른 길 아님
  });

  testWidgets('[CCARD-CANCELREJ-LINK-01] [다시 문의하기]는 횟수 제한 없이 예약 맥락 상담방을 연다', (t) async {
    var reinquired = false;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: CCancelRejectCard(
        payload: _p(), onAck: () {}, onReinquire: () => reinquired = true))));
    await t.tap(find.text('다시 문의하기'));
    expect(reinquired, isTrue);
  });
}
```
Run: `flutter test test/features/chat/c_cancel_reject_card_test.dart` → Expected: FAIL.

- [ ] **Step 3b: `CCancelRejectCard` + dispatcher `cancel_*` 분기 구현** — `c_cancel_reject_card.dart`, `chat_card_dispatcher.dart` 수정

```dart
// patient_app/lib/features/chat/cards/c_cancel_reject_card.dart
import 'package:flutter/material.dart';
import '../../../widgets/app_card.dart';
/// 취소반려 카드 그릇(CCARD-CANCELREJ). 직원 사유를 그대로(REASON, 요약·순화 금지). 확인 전 안내는
/// 서버 저장분이라 재실행 뒤에도 유지(STATE). 사유 누락(계약 위반)이면 지어내지 않고 안내 + [확인]은
/// acknowledge_cancel_rejection(T22)을 그대로 부른다(EXC — 막다른 길 금지). [다시 문의하기] 횟수 무제한(LINK).
class CCancelRejectCard extends StatelessWidget {
  final Map<String, dynamic> payload;
  final VoidCallback onAck, onReinquire;
  const CCancelRejectCard({super.key, required this.payload,
      required this.onAck, required this.onReinquire});
  @override Widget build(BuildContext context) {
    final reason = payload['reason'] as String?;
    final acked = payload['state'] == 'after';
    return AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('요청하신 취소가 어려워요'),
      if (reason != null && reason.isNotEmpty) Text(reason)              // REASON 그대로
      else const Text('사유가 전달되지 않았어요 · 병원에 문의해 주세요'),   // EXC 지어내지 않음
      if (!acked) TextButton(onPressed: onAck, child: const Text('확인')), // EXC: 항상 동작
      TextButton(onPressed: onReinquire, child: const Text('다시 문의하기')), // LINK 무제한
    ]));
  }
}
```

```dart
// chat_card_dispatcher.dart(T12) switch에 추가:
//   'cancel_confirm' => CCancelConfirmCard(payload: p, onConfirm: () {}, onNo: () {}),
//   'cancel_done' => CCancelDoneCard(payload: p),
//   'cancel_reject' => CCancelRejectCard(payload: p, onAck: () {}, onReinquire: () {}),
// ⚠️ cancel_* 도 제한모드에선 렌더 안 함(actionCards 집합에 추가) — 예약 중 상담은 취소 카드도 금지.
```
Run: `flutter test test/features/chat/c_cancel_reject_card_test.dart` → Expected: PASS.

- [ ] **Step 4a: 마감 후 흐름(팝업 연결 처리·예약 맥락 상담방·연결 후 상태) 실패 테스트** — `patient_app/test/features/chat/lateflow_test.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patient_app/features/chat/lateflow_controller.dart';
import 'package:patient_app/features/chat/lateflow_chat_view.dart';

class _Support {
  int calls = 0; bool fail = false;
  Future<void> request(String type) async { calls++; if (fail) throw Exception('net'); }
}

void main() {
  testWidgets('[LATEFLOW-POP-OPEN-01] 마감 후·30분 밖 취소/변경이면 확인창 대신 안내 팝업', (t) async {
    expect(lateFlowShouldOpenPopup(afterDeadline: true, within30min: false), isTrue);
    expect(lateFlowShouldOpenPopup(afterDeadline: false, within30min: false), isFalse);
  });

  testWidgets('[LATEFLOW-POP-COPY-01] 제목은 취소/변경에 따라 각각의 마감 문구', (t) async {
    expect(lateFlowTitle('취소'), '취소 마감 시간이 지났습니다');
    expect(lateFlowTitle('변경'), '변경 마감 시간이 지났습니다');
  });

  testWidgets('[LATEFLOW-POP-SETTING-01] 마감 안내 N은 설정값·의사 이름 안 붙임', (t) async {
    expect(lateFlowDeadlineText(hoursBefore: 24), '진료 시작 24시간 전');
    expect(lateFlowDeadlineText(hoursBefore: 24).contains('의사'), isFalse);
  });

  testWidgets('[LATEFLOW-POP-PATH-01] 상담 채팅 먼저·전화 상자 다음·[닫기]/[상담 채팅 연결]', (t) async {
    final order = lateFlowPathOrder();
    expect(order.indexOf('chat') < order.indexOf('phone'), isTrue);
  });

  test('[LATEFLOW-POP-CLOSE-01] 연결 선택 전 [닫기]는 기록 없이 상세로', () async {
    final s = _Support();
    final c = LateFlowController(requestSupport: s.request);
    c.close(); // 연결 전
    expect(s.calls, 0); // 기록 없음
  });

  test('[LATEFLOW-POP-LINK-01] [상담 채팅 연결]은 누른 즉시 request_support 1회 기록', () async {
    final s = _Support();
    final c = LateFlowController(requestSupport: s.request);
    await c.connect('취소');
    expect(s.calls, 1); // 최초 기록(support_requested_at)
  });

  test('[LATEFLOW-POP-BUSY-01] 연결 처리 중엔 연결/닫기 잠금·무기한 금지(시간초과→ERR)', () async {
    final s = _Support()..fail = true;
    final c = LateFlowController(requestSupport: s.request);
    await c.connect('취소');
    expect(c.phase, ConnectPhase.error); // 시간초과/실패면 ERR로 — 무기한 잠금 아님
  });

  test('[LATEFLOW-POP-ERR-01] 실패/시간초과면 [닫기]·[다시 연결] 재활성·연결됐다 안 함', () async {
    final s = _Support()..fail = true;
    final c = LateFlowController(requestSupport: s.request);
    await c.connect('취소');
    expect(c.canRetry, isTrue);
    expect(c.phase, isNot(ConnectPhase.connected));
  });

  test('[LATEFLOW-POP-CHANGE-01] 변경도 취소와 같이 support_requested_at+request_type 저장·앱은 시간 안 고름', () async {
    final s = _Support();
    final c = LateFlowController(requestSupport: s.request);
    await c.connect('변경');
    expect(s.calls, 1);
    expect(c.pickedNewTime, isNull); // 새 시간은 상담에서 정함
  });

  testWidgets('[LATEFLOW-CHAT-OPEN-01] 연결 성공이면 예약 ID·이유 가진 상담방·뒤로는 예약 상세', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소')));
    expect(find.byType(LateFlowChatView), findsOneWidget);
  });

  testWidgets('[LATEFLOW-CHAT-RECORD-01] 이미 팝업 시점에 기록됨 — 이 화면에서 중복 생성·추가 선택 없음', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소')));
    expect(find.text('상담 채팅 연결'), findsNothing); // 다시 연결 버튼 없음
  });

  testWidgets('[LATEFLOW-CHAT-CONTEXT-01] 봇 첫 설명은 누구의 어느 예약·이유·예약 유지만·선택 요구 안 함', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', contextLoaded: true)));
    expect(find.textContaining('아직 예약은 유지'), findsOneWidget);
  });

  testWidgets('[LATEFLOW-CHAT-KEEP-01] 연결 직후·직원 확인 중엔 상담 연결됨+예약 유지만', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', contextLoaded: true)));
    expect(find.textContaining('상담(직원 확인)으로 연결됐습니다'), findsOneWidget);
  });

  testWidgets('[LATEFLOW-CHAT-FORBID-01] `취소 요청이 접수/등록됐다`·자동 취소 암시 표현 금지', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', contextLoaded: true)));
    expect(find.textContaining('접수'), findsNothing);
    expect(find.textContaining('요청해'), findsNothing);
  });

  testWidgets('[LATEFLOW-CHAT-LOAD-01] 예약 맥락 조회 중엔 확인 안 된 예약 정보를 먼저 안 만든다', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', contextLoaded: false)));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('[LATEFLOW-CHAT-ERR-01] 맥락 조회 실패면 다른 예약 대입 안 하고 오류·재시도·상세 복귀', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', loadError: true)));
    expect(find.text('다시 시도'), findsOneWidget);
  });

  testWidgets('[LATEFLOW-CHAT-DUP-01] 이미 상담 연결 기록 있으면 새 기록·CTA 없이 기존 대화 복원', (t) async {
    await t.pumpWidget(const MaterialApp(home: LateFlowChatView(
        appointmentId: 'ap1', reason: '취소', alreadyLinked: true)));
    expect(find.text('상담 채팅 연결'), findsNothing);
  });

  testWidgets('[LATEFLOW-APPT-STATE-01] 상담 연결 기록·처리 전이면 상담 연결됨·직원 확인 중', (t) async {
    expect(lateFlowApptState(linked: true, resolved: false), '상담 연결됨 · 직원 확인 중');
  });

  testWidgets('[LATEFLOW-APPT-KEEP-01] 취소/변경 미확정이면 아직 예약 유지·정상 예약 정보', (t) async {
    expect(lateFlowApptKeepText(resolved: false), '아직 예약은 유지되고 있습니다');
  });

  testWidgets('[LATEFLOW-APPT-DUP-01] 이미 요청 기록이면 새 취소 CTA 제거·상담 이어가기로 대체', (t) async {
    expect(lateFlowApptCta(alreadyRequested: true), '상담 이어가기 ›');
  });

  testWidgets('[LATEFLOW-APPT-CONT-01] 상담 이어가기는 새 기록 없이 같은 예약 맥락 상담방', (t) async {
    final s = _Support();
    final c = LateFlowController(requestSupport: s.request);
    c.continueChat(); // 이어가기
    expect(s.calls, 0); // 새 기록 없음
  });

  testWidgets('[LATEFLOW-APPT-LOAD-01] 상담 상태 조회 중엔 예약 상세 유지·취소 버튼 먼저 안 보임', (t) async {
    expect(lateFlowApptShowsCancelWhileLoading(), isFalse);
  });

  testWidgets('[LATEFLOW-APPT-ERR-01] 상태 조회 실패면 예약 상세 유지·오류/재시도·연결없음 위장 안 함', (t) async {
    expect(lateFlowApptFabricatesNoLink(onError: true), isTrue);
  });

  testWidgets('[LATEFLOW-APPT-RESOLVE-01] 직원 처리 결과 반영 — 반려면 CCARD-CANCELREJ/정상 QR·임의 배지 삭제 없음', (t) async {
    expect(lateFlowApptOnResolve('rejected'), 'cancel_reject');
    expect(lateFlowApptOnResolve('cancelled'), 'cancelled');
  });
}
```
Run: `flutter test test/features/chat/lateflow_test.dart` → Expected: FAIL.

- [ ] **Step 4b: `LateFlowController`·`LateFlowChatView` + 순수 함수 구현**

```dart
// patient_app/lib/features/chat/lateflow_controller.dart
import 'package:flutter/foundation.dart';
/// 마감 후 상담 연결 처리(LATEFLOW-POP-BUSY/ERR + APPT). 환자앱 T22 cancel_flow 팝업의
/// [상담 채팅 연결]에 얹힌다. connect()는 request_support(T6)를 1회 부르고(LINK), 처리 중엔 잠그되
/// 무기한 금지 — 실패/시간초과면 ERR로 재활성한다. 이어가기는 새 기록을 만들지 않는다(CONT).
enum ConnectPhase { idle, busy, error, connected }
class LateFlowController {
  final Future<void> Function(String requestType) requestSupport;
  ConnectPhase phase = ConnectPhase.idle;
  bool get canRetry => phase == ConnectPhase.error;
  DateTime? pickedNewTime; // 항상 null — 새 시간은 상담에서(CHANGE-01)
  LateFlowController({required this.requestSupport});

  Future<void> connect(String requestType) async {
    phase = ConnectPhase.busy;
    try {
      await requestSupport(requestType);      // support_requested_at+request_type 1회
      phase = ConnectPhase.connected;
    } catch (_) {
      phase = ConnectPhase.error;             // 무기한 잠금 아님(BUSY→ERR)
    }
  }
  void close() {}          // 연결 전 닫기: 기록 없음(CLOSE-01)
  void continueChat() {}   // 이어가기: 새 기록 없음(CONT-01)
}

// 순수 함수(팝업/상태 판정 — cancel_flow·appointment_detail이 소비):
bool lateFlowShouldOpenPopup({required bool afterDeadline, required bool within30min}) =>
    afterDeadline && !within30min;
String lateFlowTitle(String type) => type == '변경' ? '변경 마감 시간이 지났습니다' : '취소 마감 시간이 지났습니다';
String lateFlowDeadlineText({required int hoursBefore}) => '진료 시작 $hoursBefore시간 전';
List<String> lateFlowPathOrder() => ['chat', 'phone']; // 상담 먼저, 전화 다음
String lateFlowApptState({required bool linked, required bool resolved}) =>
    linked && !resolved ? '상담 연결됨 · 직원 확인 중' : '';
String lateFlowApptKeepText({required bool resolved}) =>
    resolved ? '' : '아직 예약은 유지되고 있습니다';
String lateFlowApptCta({required bool alreadyRequested}) =>
    alreadyRequested ? '상담 이어가기 ›' : '';
bool lateFlowApptShowsCancelWhileLoading() => false;
bool lateFlowApptFabricatesNoLink({required bool onError}) => true; // 연결없음 위장 안 함
String lateFlowApptOnResolve(String result) =>
    result == 'rejected' ? 'cancel_reject' : result; // 반려면 CCARD-CANCELREJ
```

```dart
// patient_app/lib/features/chat/lateflow_chat_view.dart
import 'package:flutter/material.dart';
import 'widgets/chat_safety_banner.dart';
/// 예약 맥락 상담방(LATEFLOW-CHAT). 이미 팝업 시점에 기록됐으므로(RECORD) 이 화면은 중복 생성·추가
/// 선택을 하지 않고 봇이 설명만 한다(CONTEXT). 환자 노출 문구는 `상담(직원 확인)으로 연결됐습니다`·
/// `아직 예약은 유지되고 있습니다`만(KEEP·FORBID). 맥락 조회 중/실패는 확인 안 된 예약을 안 만든다(LOAD·ERR).
class LateFlowChatView extends StatelessWidget {
  final String appointmentId, reason;
  final bool contextLoaded, loadError, alreadyLinked;
  const LateFlowChatView({super.key, required this.appointmentId, required this.reason,
      this.contextLoaded = false, this.loadError = false, this.alreadyLinked = false});
  @override Widget build(BuildContext context) {
    if (loadError) {
      return Scaffold(body: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('예약 정보를 불러오지 못했어요'),
        TextButton(onPressed: () {}, child: const Text('다시 시도'))])));
    }
    if (!contextLoaded && !alreadyLinked) {
      return const Scaffold(body: Center(child: CircularProgressIndicator())); // LOAD
    }
    return Scaffold(appBar: AppBar(title: const Text('AI 상담봇')), body: Column(children: const [
      ChatSafetyBanner(),
      Text('상담(직원 확인)으로 연결됐습니다'),       // KEEP (금지 문구 안 씀 — FORBID)
      Text('아직 예약은 유지되고 있습니다'),
    ]));
  }
}
```
Run: `flutter test test/features/chat/lateflow_test.dart` → Expected: PASS.

- [ ] **Step 5: 확인 필요 2건 원본 확정(behaviors 역참조)**

`docs/design/screen-behaviors.md` 수정:
```
- CCARD-CANCELCONF-NO-01 "…카드가 남는 정확한 표현은 **확인 필요**다"
  → "…[아니요]면 카드를 지우지 않고 「취소하지 않음」 확정 상태로 남긴다(버튼 제거). ✅ **확정(Task 13, A안)**"
- CCARD-CANCELREJ-EXC-01 "…오류 처리·확인 저장 API는 **확인 필요**다"
  → "…사유 없으면 지어내지 않고 안내, [확인]은 acknowledge_cancel_rejection을 그대로 부른다(막다른 길 금지). ✅ **확정(Task 13)**"
```

- [ ] **Step 6: 검사기 — coverage·prefix 확인**

```bash
python3 docs/design/spec-index/plan-coverage-check.py --area ai-chatbot
python3 docs/design/spec-index/plan-prefix-check.py docs/superpowers/plans/2026-08-18-ai-chatbot.md
```
Expected: ② 규칙 커버 `126 → 165`(+39) · prefix-check **빚0·미배정0·⏰0·exit0** · **Task 13 미결 2건 해소**(CANCELCONF-NO·CANCELREJ-EXC 확정). ⚠️ `LATEFLOW`·`CCARD-CANCEL` 완전 ID는 이 태스크가 다 담으므로 ⏰ 없음.

- [ ] **Step 7: 커밋**

```bash
git add patient_app/lib/features/chat/ patient_app/lib/features/booking/cancel_flow.dart \
        patient_app/lib/features/appointments/ patient_app/test/features/chat/ \
        docs/design/screen-behaviors.md docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 13 본문 — 앱 취소 카드 3종 + 마감 후 상담 연결 39규칙 + 확인필요 2건 확정. 환자 채널 완결"
```

> **Task 13 완료 조건**: `CCARD-CANCELCONF`5·`CCARD-CANCELDONE`5·`CCARD-CANCELREJ`5·`LATEFLOW-POP`9·`LATEFLOW-CHAT`8·`LATEFLOW-APPT`7 = **39규칙 전수** 초록불. ⭐ **확인 필요 2건 확정**(CANCELCONF-NO A안·CANCELREJ-EXC). ⭐⭐ **환자 채널(Task 10~13) 완결** — 앱 상담방·라이브·카드·취소·마감후 전부. **다음 = Task 14**(웹 위젯 상담방 — `WEBCHAT-LAUNCH/ROOM/GUIDE/URGENT/OUTAGE/HANDOFF`·`NAV-WEBCHAT`, 앱 규칙 재사용분 많음). ⚠️ 웹은 `webchat/`(Vite React, Task 0 스캐폴딩) — Flutter 아님. 앱 상담방 규칙을 React로 옮기되 익명 세션(`X-Anon-Token`)이 다름.

---

## Task 14: 웹 위젯 상담방 — 런처·방·가이드·긴급·장애·인계 (`WEBCHAT-LAUNCH/ROOM/GUIDE/URGENT/OUTAGE/HANDOFF` · `NAV-WEBCHAT`)

> **환자 채널의 웹 절반을 연다.** 병원 홈페이지 우하단 런처 → 자기완결 위젯 상담방(피드·전송·재전송·로딩/오류)·진료과 추천 배너·긴급 안내·AI 장애 화면·인계 상태 배지, 그리고 이 위젯 안에서의 화면 이동(`NAV-WEBCHAT`). **42규칙 전수.**
>
> ⚠️⚠️ **웹은 Flutter가 아니라 React다.** 상담방은 `webchat/`(Vite+React+TS, **Task 0 스캐폴딩**)에 짓는다 — `patient_app/`(Flutter)을 손대지 않는다. 테스트는 **Vitest + `@testing-library/react`**(Task 0가 깐 하네스), `flutter test`가 아니다. 앱 상담방(Task 10·11)의 **규칙·상태·문구는 그대로 재사용**하되 코드는 React로 다시 쓴다 — 공유되는 것은 **같은 백엔드 API·서버 판정값**(`is_open(at)`·티켓 생명주기·오케스트레이션)이지 위젯 코드가 아니다.
>
> ⭐ **앱과 다른 단 하나 = 익명 세션.** 웹 위젯은 **로그인이 없다.** 소유권은 브라우저 **익명 토큰**(`X-Anon-Token` 헤더, Task 3 `anonymous_chat_sessions` 토큰 해시)으로 잇는다. Supabase Auth 세션을 저장하지 않는다(`persistSession=false`, Task 0). 같은 브라우저는 토큰으로 복원하고 **다른 기기 이어보기는 제공하지 않는다**(MR2-01). 이 delta가 `WEBCHAT-ROOM-03~05`·`NAV-WEBCHAT-06`의 핵심이다.
>
> **근거 원본**: behaviors **웹 위젯 §A**(신규 본체 `WEBCHAT-LAUNCH`5·`WEBCHAT-ROOM`10·`WEBCHAT-OUTAGE`6)·**§B**(앱 재사용 `WEBCHAT-GUIDE`3·`WEBCHAT-HANDOFF`7·`WEBCHAT-URGENT`4)·`NAV-WEBCHAT`7 · 정본 §0(환자 노출 이름 `AI 상담봇`·값 조작 금지·환자 노출 문구)·§1(9 운영시간·17 장애)·§3 · 요구사항 **L342~344**(웹 상담창)·**L477~480**(위젯 문맥)·**L364~371**(긴급)·**L357**(인증 관문) · 앱 짝 Task 10·11 `Produces` · 백엔드 계약 Task 9 라우터(`/chat/*`)·Task 3 익명 계약.
>
> ⭐ **경계 — Task 15가 받을 것(중복 빌드 금지)**: 로그인/가입 분기 모달 `WEBMOD-AUTH`·익명 인계 폼 `WEBANON-HANDOFF`·웹 카드 `WEBCARD-*`(시간/예약확인/완료/취소/문진/빠른답변)는 **전부 Task 15**다. Task 14는 이들로 가는 **콜백 슬롯만** 남긴다: `onAuthGate(pendingAction)`(→ `WEBMOD-AUTH`)·`onHandoffNeeded(summary)`(→ `WEBANON-HANDOFF`)·`renderCard(payload)`(→ `WEBCARD`). 이 슬롯의 **문맥 보존·복귀**(NAV-WEBCHAT-02·03·05)는 Task 14가 검증하고, 슬롯 **안의 화면**은 Task 15가 채운다.
>
> ⭐ **낡은 미결 1건 해소(`NAV-WEBCHAT-04`)**: behaviors가 *"가입 완료 후 복귀 방식은 확인 필요"*라고 남겨 뒀으나 **이미 `WEBMOD-AUTH` 계열(가입 완료, MR2-03)이 확정**했다 — 가입 완료 후 복귀는 **자동이 아니라 수동(재확인 카드)**. 단방향 링크(옛 항목에 역참조 없음)라 낡은 채 남아 있었다. 이 태스크 커밋에서 behaviors `NAV-WEBCHAT-04`에 **해소 역참조**를 박는다(→ `WEBMOD-AUTH`·`WEBCARD-BOOKCONF` 계열, Task 15 소유). Task 14 nav는 **로그인 복귀**만 담고, **가입 복귀=재확인 카드**는 Task 15 WEBMOD로 넘긴다.
>
> ⭐ **확인 필요 1건 = 배포로 흡수(`WEBCHAT-HANDOFF-03`)**: *"정확한 알림 도달 문구·배치는 확인 필요"* 중 **위젯이 관찰하는 부분은 이미 확정**이다 — 근거 없는 분 단위 예상시간을 만들지 않고, 런처 미읽음은 **점 ● 하나**(숫자 배지 금지, `WEBCHAT-LAUNCH-05`), 배칭 판정(미확인 연속 답변 1묶음)은 **서버 몫**(Task 3 `enqueue_staff_reply_notification`·`notification_recipient`). 남은 것은 **실제 SMS 발송 문구·시점**뿐이고 이는 **dispatcher(배포)** 소관이라 기존 알림 dispatcher 계약에 흡수된다(새 결정·새 HANDOVER 없음). 위젯은 상태 배지만 렌더한다.

**Files:**
- Modify: `webchat/src/App.tsx` (Task 0) — 셸 자리표시자를 `<WebchatWidget/>` 마운트로 교체
- Create: `webchat/src/api/webchatApi.ts` (`WebchatApi` 인터페이스 + `createWebchatApi(baseUrl)` — `/chat/*` REST + `X-Anon-Token`)
- Create: `webchat/src/state/anonSession.ts` (`loadAnonToken`·`saveAnonToken`·`clearAnonToken` — `localStorage` 키 `webchat_anon_token`)
- Create: `webchat/src/state/useWebchat.ts` (세션 시작/복원·전송/재전송·조회오류·배치 확인 훅 — 앱 `ChatRoomController` 대응)
- Create: `webchat/src/widget/WebchatWidget.tsx` (런처+방 셸 — 열림/닫힘·미읽음 점·콜백 슬롯 배선)
- Create: `webchat/src/widget/Launcher.tsx` (`Launcher` — `WEBCHAT-LAUNCH`)
- Create: `webchat/src/widget/ChatRoom.tsx` (`ChatRoom` — `WEBCHAT-ROOM` 셸: 머리말·피드·입력·가이드/인계 슬롯·`renderCard` 슬롯)
- Create: `webchat/src/widget/GuideBanner.tsx` (`GuideBanner` — `WEBCHAT-GUIDE`)
- Create: `webchat/src/widget/HandoffBadge.tsx` (`HandoffBadge` — `WEBCHAT-HANDOFF`)
- Create: `webchat/src/widget/UrgentNotice.tsx` (`UrgentNotice` — `WEBCHAT-URGENT`)
- Create: `webchat/src/widget/OutageNotice.tsx` (`OutageNotice` — `WEBCHAT-OUTAGE`)
- Modify: `docs/design/screen-behaviors.md` — `NAV-WEBCHAT-04` 확인 필요 → 해소 역참조(단방향 링크 수리)
- Test: `webchat/src/widget/Launcher.test.tsx` · `ChatRoom.test.tsx` · `GuideBanner.test.tsx` · `HandoffBadge.test.tsx` · `UrgentNotice.test.tsx` · `OutageNotice.test.tsx` · `WebchatWidget.test.tsx` · `webchat/src/state/useWebchat.test.tsx`

**Interfaces:**
- Consumes:
  - **Task 0(webchat 스캐폴딩)**: `webchat/src/lib/supabaseClient.ts`(익명, `persistSession=false`) · `webchat/src/lib/env.ts`(`supabaseUrl`·`supabaseAnonKey`, 값 없으면 화면이 장애 안내) · Vitest+`@testing-library/react` 하네스(`src/test/setup.ts`).
  - **Task 9(라우터)**: `POST /chat/sessions`(새/이어가기) · `POST /chat/messages`(멱등 `client_message_id`) · `GET /chat/threads/{id}/messages` · `POST /chat/read`(배치 확인) · 익명 의존성 **헤더 `X-Anon-Token`** → `get_anonymous_session`(Task 3 `upsert_session`). 오케스트레이션 결과 `route_taken`(`emergency`→긴급·`handoff`→인계·`rag`/`department_guide`→답변)은 서버가 준다(앱과 동일 파이프라인 `handle_patient_message`).
  - **Task 3(익명 계약)**: `anonymous_chat_sessions` 토큰 해시 소유권 · 미확인 연속 직원 답변 1배치(`enqueue_staff_reply_notification`) · 익명 검증 연락처는 **SMS 답변 수신용만**(`notification_recipient.resolve_recipient`) — 위젯은 배칭을 만들지 않고 서버 판정을 표시만 한다.
  - **서버 판정(앱·웹 공유)**: 단일 `is_open(at)`(운영시간·점심·특정일 예외, 1단계/직원웹) · 티켓 생명주기 `pending→in_progress→answered`(Task 2 → 인계 배지 `대기중`·`직원 확인중`·`답변완료`) · 병원 전화번호 `get_public_hospital_info`(④ 공용).
  - **앱 짝(규칙·문구 재사용 대상)**: Task 10 `CHAT-ROOM`/`CHAT-GUIDE`·Task 11 `CHAT-HANDOFF`(`HandoffStatus` 모양)·`CHAT-URGENT`·`CHAT-OUTAGE` — **코드가 아니라 규칙·상태·한글 문구**를 옮긴다.
- Produces (Task 15 웹 카드·인증이 소비):
  - `useWebchat()` 훅 반환 `{ phase, session, messages, handoff, guide, send, resend, retryLoad, acknowledgeView }` — `phase: 'firstConsult'|'restoring'|'ready'|'loadError'`.
  - `WebchatWidget` 콜백 슬롯(Task 15가 화면을 채운다): `onAuthGate(action: PendingAction)`·`onHandoffNeeded(summary: HandoffSummary)`·`renderCard(payload)`. `PendingAction`·`HandoffSummary` 타입은 여기서 정의.
  - `ChatRoom`(재사용 셸: `guideSlot`·`handoffSlot`·`renderCard` 프롭)·`HandoffBadge`·`GuideBanner`·`UrgentNotice`·`OutageNotice` 컴포넌트.
  - `webchatApi`(`startOrRestoreSession`·`sendMessage`·`fetchMessages`·`fetchHandoff`·`acknowledgeBatches`) · `anonSession`(토큰 저장소).
- ⚠️ **아직 안 하는 것**: `WEBMOD-AUTH`·`WEBANON-HANDOFF`·`WEBCARD-*`=**Task 15** · 실제 SMS 발송=dispatcher(배포) · 위젯 임베드 스크립트·`base` 확정=배포.

---

- [ ] **Step 1: API 클라이언트 + 익명 토큰 저장소(계약 골격)**

> 위젯이 소비하는 백엔드 계약을 타입으로 못박는다. 실제 fetch는 `createWebchatApi`가 감싸고, 테스트는 이 인터페이스의 **가짜 구현**을 주입한다(네트워크 없음). 익명 토큰은 `localStorage`에 두어 **같은 브라우저**만 복원한다(`WEBCHAT-ROOM-04`).

`webchat/src/api/webchatApi.ts`:
```ts
export type SenderType = 'patient' | 'bot' | 'staff' | 'system';
export type MessageType = 'text' | 'card' | 'system';
export type SendState = 'sending' | 'sent' | 'failed';

export type ThreadMessage = {
  id: string;
  senderType: SenderType;
  messageType: MessageType;
  content: string | null;         // 카드/시스템은 null 가능(payload가 알맹이)
  payload?: Record<string, unknown> | null;
  clientMessageId?: string;
  sendState?: SendState;          // 클라 로컬 전송 상태(낙관적 말풍선)
};

export type HandoffPhase = 'connecting' | 'inProgress' | 'answered'; // 티켓 pending/in_progress/answered
export type HandoffStatus = {
  phase: HandoffPhase | null;     // null = 조회 전(로딩)
  assigneeName?: string;
  assigneeRole?: string;
  isOpen: boolean;                // 서버 단일 is_open(at)
  hoursNote?: string;             // 운영시간 안/밖 안내(서버 문구)
  loadError?: boolean;
};

export type SessionState = {
  threadId: string;
  aiSessionId: string;
  anonToken: string;              // 서버가 발급/확인한 익명 토큰
  messages: ThreadMessage[];
};

export type GuideState = { active: boolean; text: string };

export interface WebchatApi {
  // 익명 토큰이 있으면 복원, 없으면 첫 상담 세션 시작. 서버가 토큰을 확정해 돌려준다.
  startOrRestoreSession(anonToken: string | null): Promise<SessionState>;
  fetchMessages(threadId: string): Promise<ThreadMessage[]>;
  // 멱등: 같은 clientMessageId면 서버가 한 행만 만든다(§8-4). route_taken을 결과로 준다.
  sendMessage(args: {
    threadId: string; aiSessionId: string; content: string; clientMessageId: string;
  }): Promise<{ routeTaken: string; botMessage?: ThreadMessage; handoffTicketId?: string }>;
  fetchHandoff(threadId: string): Promise<HandoffStatus>;
  acknowledgeBatches(threadId: string): Promise<void>; // POST /chat/read
}

const ANON_HEADER = 'X-Anon-Token'; // Task 9 익명 의존성 헤더

export function createWebchatApi(baseUrl: string): WebchatApi {
  const call = async (path: string, init: RequestInit, anonToken: string | null) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as object) };
    if (anonToken) headers[ANON_HEADER] = anonToken; // 로그인이 아니라 익명 토큰으로 소유권을 잇는다
    const resp = await fetch(baseUrl + path, { ...init, headers });
    if (!resp.ok) throw new Error(`webchat_api_${resp.status}`); // 화면이 한글 오류로 변환(개발자 오류문 노출 금지)
    return resp.json();
  };
  return {
    async startOrRestoreSession(anonToken) {
      const j = await call('/chat/sessions', { method: 'POST', body: JSON.stringify({ channel: 'web' }) }, anonToken);
      return j as SessionState;
    },
    async fetchMessages(threadId) {
      const j = await call(`/chat/threads/${threadId}/messages`, { method: 'GET' }, null);
      return j.messages as ThreadMessage[];
    },
    async sendMessage(a) {
      return call('/chat/messages', { method: 'POST', body: JSON.stringify(a) }, null);
    },
    async fetchHandoff(threadId) {
      return call(`/chat/threads/${threadId}/handoff`, { method: 'GET' }, null);
    },
    async acknowledgeBatches(threadId) {
      await call('/chat/read', { method: 'POST', body: JSON.stringify({ threadId }) }, null);
    },
  };
}
```

`webchat/src/state/anonSession.ts`:
```ts
const KEY = 'webchat_anon_token'; // 같은 브라우저만. 다른 기기엔 없다(WEBCHAT-ROOM-05).

export const loadAnonToken = (): string | null => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
export const saveAnonToken = (token: string): void => {
  try { localStorage.setItem(KEY, token); } catch { /* 저장 불가여도 세션은 진행 */ }
};
export const clearAnonToken = (): void => {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
};
```

- [ ] **Step 2: 런처 `WEBCHAT-LAUNCH` — 실패 테스트 → 구현**

`webchat/src/widget/Launcher.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Launcher } from './Launcher';

test('[WEBCHAT-LAUNCH-01] 위젯 닫힘이면 `AI 상담봇` 여는 단일 런처를 표시한다', () => {
  render(<Launcher open={false} hasUnread={false} onOpen={() => {}} onClose={() => {}} />);
  const btn = screen.getByRole('button', { name: 'AI 상담봇 열기' });
  expect(btn).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1); // 진입점은 하나
  expect(screen.queryByText(/챗봇/)).not.toBeInTheDocument(); // 환자 노출 이름은 AI 상담봇
});

test('[WEBCHAT-LAUNCH-02] 닫힌 런처를 누르면 방 열기를 요청한다(세션 복원은 위젯이 이어받음)', async () => {
  const onOpen = vi.fn();
  render(<Launcher open={false} hasUnread={false} onOpen={onOpen} onClose={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test('[WEBCHAT-LAUNCH-03] 위젯 열림에서 닫기는 onClose만 부른다 — 대화/토큰 삭제 아님', async () => {
  const onClose = vi.fn();
  render(<Launcher open={true} hasUnread={false} onOpen={() => {}} onClose={onClose} />);
  // 닫기는 셸이 제공(LAUNCH-04). 런처는 열림 표시만.
  expect(screen.queryByRole('button', { name: 'AI 상담봇 열기' })).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled(); // 렌더만으로 아무것도 지우지 않는다
});

test('[WEBCHAT-LAUNCH-04] 위젯 열림이면 런처가 별도 진입점처럼 보이지 않게 열림 상태를 표시한다', () => {
  render(<Launcher open={true} hasUnread={false} onOpen={() => {}} onClose={() => {}} />);
  const launcher = screen.getByLabelText('AI 상담봇 런처');
  expect(launcher).toHaveAttribute('data-open', 'true'); // 열림 표시(두 개의 상담 진입점 금지)
  expect(screen.queryByRole('button', { name: 'AI 상담봇 열기' })).not.toBeInTheDocument();
});

test('[WEBCHAT-LAUNCH-05] 닫힘 중 직원 답변 도착이면 점 ● 하나만 — 숫자 배지 없음', () => {
  render(<Launcher open={false} hasUnread={true} onOpen={() => {}} onClose={() => {}} />);
  expect(screen.getByLabelText('새 답변 있음')).toBeInTheDocument(); // 점 표식
  expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument(); // 숫자 배지 금지(결정 B4)
});
```

`webchat/src/widget/Launcher.tsx`:
```tsx
export type LauncherProps = { open: boolean; hasUnread: boolean; onOpen: () => void; onClose: () => void };

export function Launcher({ open, hasUnread, onOpen }: LauncherProps) {
  return (
    <div aria-label="AI 상담봇 런처" data-open={open ? 'true' : 'false'}>
      {!open && (
        <button type="button" aria-label="AI 상담봇 열기" onClick={onOpen}>
          AI 상담봇
          {hasUnread && <span aria-label="새 답변 있음" role="img">●</span>}
        </button>
      )}
    </div>
  );
}
```
Run: `npm --prefix webchat run test -- Launcher` → FAIL → 구현 → PASS.

- [ ] **Step 3: 방 셸 `WEBCHAT-ROOM` 표시부 — 실패 테스트 → 구현**

> 세션 생명주기(첫상담/복원/로딩/오류)는 Step 4의 훅이, **표시·전송 상호작용**은 이 컴포넌트가 담는다. 전송 실패 말풍선·재전송·인증 왕복 문맥 보존을 여기서 검증한다.

`webchat/src/widget/ChatRoom.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatRoom } from './ChatRoom';
import type { ThreadMessage } from '../api/webchatApi';

const base = {
  onSend: () => {}, onResend: () => {}, onRetryLoad: () => {},
  guideSlot: null, handoffSlot: null, renderCard: () => null,
};

test('[WEBCHAT-ROOM-01] 자기완결 위젯 경계 — 전체화면이 아니라 위젯 영역으로 표시', () => {
  render(<ChatRoom phase="ready" messages={[]} {...base} />);
  const region = screen.getByRole('region', { name: 'AI 상담봇' });
  expect(region).toHaveAttribute('data-widget', 'true'); // 테두리·그림자 위젯(홈페이지와 분리)
});

test('[WEBCHAT-ROOM-02] 머리말은 `AI 상담봇` + 같은 문맥에 가이드/인계 슬롯', () => {
  render(<ChatRoom phase="ready" messages={[]} {...base}
    guideSlot={<div>추천 진행 중</div>} handoffSlot={<div>대기중</div>} />);
  expect(screen.getByRole('banner')).toHaveTextContent('AI 상담봇');
  expect(screen.getByText('추천 진행 중')).toBeInTheDocument();
  expect(screen.getByText('대기중')).toBeInTheDocument();
});

test('[WEBCHAT-ROOM-03] 첫 상담이면 빈 오류가 아니라 첫 안내 + 자유 입력', () => {
  render(<ChatRoom phase="firstConsult" messages={[]} {...base} />);
  expect(screen.getByPlaceholderText('메시지를 입력하세요')).toBeEnabled(); // 자유 입력 열림
  expect(screen.queryByText(/오류|실패/)).not.toBeInTheDocument();
});

test('[WEBCHAT-ROOM-06] 로딩 중이면 로딩 표시 — 기존 메시지를 가리지 않는다', () => {
  const msgs: ThreadMessage[] = [{ id: 'm1', senderType: 'bot', messageType: 'text', content: '안녕하세요' }];
  render(<ChatRoom phase="restoring" messages={msgs} {...base} />);
  expect(screen.getByRole('status')).toHaveTextContent('불러오는 중'); // 조회 중
  expect(screen.getByText('안녕하세요')).toBeInTheDocument();          // 과거 메시지 유지
});

test('[WEBCHAT-ROOM-07] 조회 오류면 한글 오류 + [다시 시도] — 입력/토큰 안 지움', async () => {
  const onRetryLoad = vi.fn();
  render(<ChatRoom phase="loadError" messages={[]} {...base} onRetryLoad={onRetryLoad} />);
  expect(screen.getByText('대화를 불러오지 못했어요.')).toBeInTheDocument(); // 개발자 오류문 금지
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(onRetryLoad).toHaveBeenCalledTimes(1);
  expect(screen.getByPlaceholderText('메시지를 입력하세요')).toBeInTheDocument(); // 첫 상담으로 안 바뀜
});

test('[WEBCHAT-ROOM-08] 전송하면 환자 말풍선을 전송 중으로 표시하고 같은 메시지 중복 전송을 막는다', async () => {
  const onSend = vi.fn();
  const sending: ThreadMessage[] = [{ id: 'local-1', senderType: 'patient', messageType: 'text',
    content: '주차 되나요?', sendState: 'sending', clientMessageId: 'c1' }];
  render(<ChatRoom phase="ready" messages={sending} {...base} onSend={onSend} />);
  const bubble = screen.getByText('주차 되나요?').closest('[data-send-state]');
  expect(bubble).toHaveAttribute('data-send-state', 'sending'); // 성공 말풍선처럼 위장 금지
  const input = screen.getByPlaceholderText('메시지를 입력하세요');
  await userEvent.type(input, '주차 되나요?{enter}');
  // 전송 중인 동일 메시지 재전송을 막는다(멱등 clientMessageId는 훅이 부여)
  expect(onSend).toHaveBeenCalledTimes(1);
});

test('[WEBCHAT-ROOM-09] 전송 실패면 성공처럼 표시 안 하고 [재전송]을 실패 말풍선 가까이 둔다', async () => {
  const onResend = vi.fn();
  const failed: ThreadMessage[] = [{ id: 'local-2', senderType: 'patient', messageType: 'text',
    content: '예약 되나요?', sendState: 'failed', clientMessageId: 'c2' }];
  render(<ChatRoom phase="ready" messages={failed} {...base} onResend={onResend} />);
  const bubble = screen.getByText('예약 되나요?').closest('[data-send-state]');
  expect(bubble).toHaveAttribute('data-send-state', 'failed');
  await userEvent.click(screen.getByRole('button', { name: '재전송' }));
  expect(onResend).toHaveBeenCalledWith('c2'); // 동일 메시지 재전송(다른 대화 안 만듦)
});

test('[WEBCHAT-ROOM-10] 인증 모달 왕복 뒤 메시지·전송 완료가 유지된다(비번은 기록에 안 섞음)', () => {
  const msgs: ThreadMessage[] = [
    { id: 'm1', senderType: 'patient', messageType: 'text', content: '내 예약 보여줘', sendState: 'sent' },
  ];
  // 모달을 닫고 돌아온 상태를 같은 messages로 다시 렌더 → 문맥 유지
  const { rerender } = render(<ChatRoom phase="ready" messages={msgs} {...base} />);
  rerender(<ChatRoom phase="ready" messages={msgs} {...base} />);
  expect(screen.getByText('내 예약 보여줘')).toBeInTheDocument();
  expect(screen.queryByText(/비밀번호/)).not.toBeInTheDocument(); // 인증 입력은 상담 기록에 없음
});
```

`webchat/src/widget/ChatRoom.tsx`:
```tsx
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ThreadMessage } from '../api/webchatApi';

export type WebchatPhase = 'firstConsult' | 'restoring' | 'ready' | 'loadError';
export type ChatRoomProps = {
  phase: WebchatPhase;
  messages: ThreadMessage[];
  onSend: (text: string) => void;
  onResend: (clientMessageId: string) => void;
  onRetryLoad: () => void;
  guideSlot: ReactNode;
  handoffSlot: ReactNode;
  renderCard: (payload: Record<string, unknown> | null | undefined) => ReactNode;
};

export function ChatRoom(p: ChatRoomProps) {
  const [draft, setDraft] = useState('');
  return (
    <section role="region" aria-label="AI 상담봇" data-widget="true">
      <header role="banner">AI 상담봇{p.guideSlot}{p.handoffSlot}</header>
      {p.phase === 'restoring' && <div role="status">불러오는 중…</div>}
      <ul>
        {p.messages.map((m) => (
          <li key={m.id} data-send-state={m.sendState ?? 'sent'}>
            {m.messageType === 'card' ? p.renderCard(m.payload) : m.content}
            {m.sendState === 'failed' && (
              <button type="button" onClick={() => m.clientMessageId && p.onResend(m.clientMessageId)}>재전송</button>
            )}
          </li>
        ))}
      </ul>
      {p.phase === 'loadError' && (
        <div>
          <p>대화를 불러오지 못했어요.</p>
          <button type="button" onClick={p.onRetryLoad}>다시 시도</button>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { p.onSend(draft.trim()); setDraft(''); } }}>
        <input placeholder="메시지를 입력하세요" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </form>
    </section>
  );
}
```
Run: `npm --prefix webchat run test -- ChatRoom` → FAIL → 구현 → PASS.

- [ ] **Step 4: 세션 훅 `useWebchat` — 첫상담/복원/오류·전송 멱등·다른기기 없음**

> `WEBCHAT-ROOM-03·04·05`(세션 생명주기)와 `WEBCHAT-ROOM-08·09`(전송 멱등/실패)의 **상태 기계**를 훅으로 검증한다. 가짜 `WebchatApi`를 주입해 네트워크 없이 돌린다.

`webchat/src/state/useWebchat.test.tsx`:
```tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebchat } from './useWebchat';
import type { WebchatApi, SessionState } from '../api/webchatApi';
import { saveAnonToken, loadAnonToken, clearAnonToken } from './anonSession';

const session: SessionState = { threadId: 't1', aiSessionId: 's1', anonToken: 'TOK', messages: [] };
function fakeApi(over: Partial<WebchatApi> = {}): WebchatApi {
  return {
    startOrRestoreSession: vi.fn(async () => session),
    fetchMessages: vi.fn(async () => []),
    sendMessage: vi.fn(async () => ({ routeTaken: 'rag', botMessage: {
      id: 'b1', senderType: 'bot', messageType: 'text', content: '네, 가능합니다' } })),
    fetchHandoff: vi.fn(async () => ({ phase: null, isOpen: true })),
    acknowledgeBatches: vi.fn(async () => {}),
    ...over,
  };
}
beforeEach(() => clearAnonToken());

test('[WEBCHAT-ROOM-03] 익명 토큰이 없으면 첫 상담 세션을 시작하고 서버 토큰을 저장한다', async () => {
  const api = fakeApi();
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  expect(api.startOrRestoreSession).toHaveBeenCalledWith(null); // 토큰 없음 → 첫 상담
  await waitFor(() => expect(result.current.phase).toBe('ready'));
  expect(loadAnonToken()).toBe('TOK'); // 같은 브라우저 복원용으로 저장
});

test('[WEBCHAT-ROOM-04] 유효한 익명 토큰이 있으면 복원 — 이름/연락처를 다시 묻지 않는다', async () => {
  saveAnonToken('OLD');
  const api = fakeApi();
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  expect(api.startOrRestoreSession).toHaveBeenCalledWith('OLD'); // 토큰으로 기존 대화 복원
  expect(result.current.askedForContact).toBe(false);            // 새 방으로 가장 안 함
});

test('[WEBCHAT-ROOM-05] 다른 기기(토큰 없음)엔 이어보기 경로가 없다 — 이름/전화로 추측 조회 안 함', async () => {
  const api = fakeApi();
  const { result } = renderHook(() => useWebchat(api));
  expect(loadAnonToken()).toBeNull();          // 다른 기기엔 토큰이 없다
  await act(async () => { await result.current.open(); });
  expect(api.startOrRestoreSession).toHaveBeenCalledWith(null); // 새 익명 세션일 뿐, 남의 상담을 찾지 않음
  expect(result.current.crossDeviceResume).toBe(false);
});

test('[WEBCHAT-ROOM-07] 세션 조회 실패면 loadError — 토큰을 지우지 않는다', async () => {
  saveAnonToken('KEEP');
  const api = fakeApi({ startOrRestoreSession: vi.fn(async () => { throw new Error('webchat_api_500'); }) });
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  await waitFor(() => expect(result.current.phase).toBe('loadError'));
  expect(loadAnonToken()).toBe('KEEP'); // 조회 실패로 토큰 삭제 금지
});

test('[WEBCHAT-ROOM-08] 전송은 clientMessageId를 부여해 멱등 — 같은 전송 중 메시지를 중복 전송하지 않는다', async () => {
  const api = fakeApi();
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  await act(async () => { await result.current.send('주차 되나요?'); });
  const call = (api.sendMessage as any).mock.calls[0][0];
  expect(typeof call.clientMessageId).toBe('string');       // 멱등 키 부여(§8-4)
  expect(call.content).toBe('주차 되나요?');
});

test('[WEBCHAT-ROOM-09] 전송 실패면 말풍선을 failed로 두고 resend는 같은 clientMessageId로 재전송', async () => {
  const send = vi.fn()
    .mockRejectedValueOnce(new Error('webchat_api_500'))
    .mockResolvedValueOnce({ routeTaken: 'rag' });
  const api = fakeApi({ sendMessage: send });
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  await act(async () => { await result.current.send('예약 되나요?'); });
  const failed = result.current.messages.find((m) => m.sendState === 'failed');
  expect(failed?.content).toBe('예약 되나요?');
  await act(async () => { await result.current.resend(failed!.clientMessageId!); });
  expect(send.mock.calls[0][0].clientMessageId).toBe(send.mock.calls[1][0].clientMessageId); // 동일 키
});
```

`webchat/src/state/useWebchat.ts`:
```ts
import { useCallback, useRef, useState } from 'react';
import type { WebchatApi, SessionState, ThreadMessage, HandoffStatus, GuideState } from '../api/webchatApi';
import type { WebchatPhase } from '../widget/ChatRoom';
import { loadAnonToken, saveAnonToken } from './anonSession';

const uuid = () => crypto.randomUUID();

export function useWebchat(api: WebchatApi) {
  const [phase, setPhase] = useState<WebchatPhase>('firstConsult');
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [handoff, setHandoff] = useState<HandoffStatus>({ phase: null, isOpen: false });
  const [guide, setGuide] = useState<GuideState>({ active: false, text: '' });
  const inFlight = useRef<Set<string>>(new Set()); // 중복 전송 방지(clientMessageId)

  const open = useCallback(async () => {
    const token = loadAnonToken();          // 같은 브라우저만. 다른 기기엔 null(WEBCHAT-ROOM-05)
    setPhase(token ? 'restoring' : 'firstConsult');
    try {
      const s = await api.startOrRestoreSession(token); // 토큰 없으면 새 익명 세션(추측 조회 안 함)
      saveAnonToken(s.anonToken);
      setSession(s); setMessages(s.messages); setPhase('ready');
    } catch {
      setPhase('loadError');                // 토큰은 지우지 않는다(WEBCHAT-ROOM-07)
    }
  }, [api]);

  const dispatchSend = useCallback(async (content: string, clientMessageId: string) => {
    if (!session || inFlight.current.has(clientMessageId)) return; // 멱등 중복 차단
    inFlight.current.add(clientMessageId);
    setMessages((m) => upsertLocal(m, { content, clientMessageId, sendState: 'sending' }));
    try {
      const out = await api.sendMessage({ threadId: session.threadId, aiSessionId: session.aiSessionId, content, clientMessageId });
      setMessages((m) => markSent(m, clientMessageId, out.botMessage));
      if (out.routeTaken === 'department_guide') setGuide({ active: true, text: '진료과 안내 진행 중' });
      else if (out.routeTaken !== 'department_guide') setGuide((g) => ({ ...g, active: false }));
    } catch {
      setMessages((m) => markFailed(m, clientMessageId)); // 성공 위장 금지(WEBCHAT-ROOM-09)
    } finally {
      inFlight.current.delete(clientMessageId);
    }
  }, [api, session]);

  const send = useCallback((content: string) => dispatchSend(content, uuid()), [dispatchSend]);
  const resend = useCallback((clientMessageId: string) => {
    const prev = messages.find((x) => x.clientMessageId === clientMessageId);
    if (prev) return dispatchSend(prev.content ?? '', clientMessageId); // 동일 키 재전송
  }, [dispatchSend, messages]);

  return {
    phase, session, messages, handoff, guide,
    askedForContact: false, crossDeviceResume: false, // 익명 웹은 이름/연락처를 방 진입에서 묻지 않는다
    open, send, resend,
    retryLoad: open,
    acknowledgeView: useCallback(async () => { if (session) await api.acknowledgeBatches(session.threadId); }, [api, session]),
    setHandoff,
  };
}

// 낙관적 말풍선 헬퍼(전송 중/성공/실패 상태 전이)
function upsertLocal(list: ThreadMessage[], p: { content: string; clientMessageId: string; sendState: 'sending' }): ThreadMessage[] {
  return [...list, { id: `local-${p.clientMessageId}`, senderType: 'patient', messageType: 'text', ...p }];
}
function markSent(list: ThreadMessage[], cid: string, bot?: ThreadMessage): ThreadMessage[] {
  const next = list.map((m) => (m.clientMessageId === cid ? { ...m, sendState: 'sent' as const } : m));
  return bot ? [...next, bot] : next;
}
function markFailed(list: ThreadMessage[], cid: string): ThreadMessage[] {
  return list.map((m) => (m.clientMessageId === cid ? { ...m, sendState: 'failed' as const } : m));
}
```
Run: `npm --prefix webchat run test -- useWebchat` → FAIL → 구현 → PASS.

- [ ] **Step 5: 진료과 추천 배너 `WEBCHAT-GUIDE`(앱 `CHAT-GUIDE` 재사용)**

`webchat/src/widget/GuideBanner.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { GuideBanner } from './GuideBanner';

test('[WEBCHAT-GUIDE-01] 추천 갈래 진행 중이면 위젯 안에 현재 안내 갈래를 고정 표시(비진단)', () => {
  render(<GuideBanner active={true} text="증상에 맞는 진료과를 안내 중입니다" />);
  const banner = screen.getByRole('note', { name: '진료과 추천 안내' });
  expect(banner).toHaveTextContent('증상에 맞는 진료과를 안내 중입니다');
  expect(banner).not.toHaveTextContent(/진단|처방/); // 앱 CHAT-GUIDE 비진단 원칙
});

test('[WEBCHAT-GUIDE-02] 추천 갈래가 끝나면 배너를 표시하지 않는다 — 상시 의료 경고로 남기지 않음', () => {
  render(<GuideBanner active={false} text="증상에 맞는 진료과를 안내 중입니다" />);
  expect(screen.queryByRole('note', { name: '진료과 추천 안내' })).not.toBeInTheDocument();
});

test('[WEBCHAT-GUIDE-03] 배너는 위젯 셸 안에서 메시지와 함께 스크롤돼도 의미가 유지되게 고정 표시', () => {
  render(<GuideBanner active={true} text="안내 진행 중" />);
  expect(screen.getByRole('note', { name: '진료과 추천 안내' })).toHaveAttribute('data-pinned', 'true');
});
```

`webchat/src/widget/GuideBanner.tsx`:
```tsx
export function GuideBanner({ active, text }: { active: boolean; text: string }) {
  if (!active) return null; // 갈래 종료 시 사라진다(WEBCHAT-GUIDE-02)
  return <div role="note" aria-label="진료과 추천 안내" data-pinned="true">{text}</div>;
}
```
Run: `npm --prefix webchat run test -- GuideBanner` → FAIL → 구현 → PASS.

- [ ] **Step 6: 인계 상태 배지 `WEBCHAT-HANDOFF`(앱 `CHAT-HANDOFF` 재사용)**

`webchat/src/widget/HandoffBadge.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HandoffBadge } from './HandoffBadge';
import type { HandoffStatus } from '../api/webchatApi';
const pump = (s: HandoffStatus, onRetry = () => {}) => render(<HandoffBadge status={s} onRetry={onRetry} />);

test('[WEBCHAT-HANDOFF-01] 인계 뒤 대기중/직원 확인중/답변완료를 같은 API 상태로 표시', () => {
  pump({ phase: 'connecting', isOpen: true });
  expect(screen.getByText('대기중')).toBeInTheDocument();
  pump({ phase: 'inProgress', isOpen: true, assigneeName: '김간호', assigneeRole: '간호사' });
  expect(screen.getByText('직원 확인중')).toBeInTheDocument();
  pump({ phase: 'answered', isOpen: true });
  expect(screen.getByText('답변완료')).toBeInTheDocument();
});

test('[WEBCHAT-HANDOFF-02] 운영시간 판정은 서버 is_open 결과를 쓴다 — 환경변수 9~18시 금지', () => {
  // isOpen은 서버가 준 값이며 위젯은 클라 시계로 재판정하지 않는다.
  pump({ phase: 'connecting', isOpen: false, hoursNote: '다음 영업일에 답변드립니다' });
  expect(screen.getByText('다음 영업일에 답변드립니다')).toBeInTheDocument();
});

test('[WEBCHAT-HANDOFF-03] 운영시간 안 연결이면 상담 중 표시 — 근거 없는 분 단위 예상시간을 만들지 않는다', () => {
  pump({ phase: 'inProgress', isOpen: true, assigneeName: '이의사', assigneeRole: '의사' });
  expect(screen.getByText('직원 확인중')).toBeInTheDocument();
  expect(screen.queryByText(/분 후|분 뒤|예상/)).not.toBeInTheDocument(); // 서버가 안 준 예상시간 금지
});

test('[WEBCHAT-HANDOFF-04] 운영시간 밖이면 다음 영업일 답변 안내(같은 판정에서 얻은 문구)', () => {
  pump({ phase: 'connecting', isOpen: false, hoursNote: '다음 영업일에 순서대로 답변드립니다' });
  expect(screen.getByText('다음 영업일에 순서대로 답변드립니다')).toBeInTheDocument();
});

test('[WEBCHAT-HANDOFF-05] 상태 조회 중이면 이전 배지를 임의로 바꾸지 않고 조회 중을 표시', () => {
  pump({ phase: null, isOpen: true }); // 조회 전
  expect(screen.getByRole('status')).toHaveTextContent('상태 확인 중');
  expect(screen.queryByText('답변완료')).not.toBeInTheDocument();
});

test('[WEBCHAT-HANDOFF-06] 상태 조회 오류면 답변완료로 가장하지 않고 한글 오류 + 재조회', async () => {
  const onRetry = vi.fn();
  pump({ phase: null, isOpen: true, loadError: true }, onRetry);
  expect(screen.getByText('상태를 불러오지 못했어요.')).toBeInTheDocument();
  expect(screen.queryByText('답변완료')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('[WEBCHAT-HANDOFF-07] 환자 노출 문구는 `상담(직원 확인)으로 연결됐습니다`만 — 취소 접수/등록 암시 금지', () => {
  pump({ phase: 'connecting', isOpen: true });
  expect(screen.getByText('상담(직원 확인)으로 연결됐습니다')).toBeInTheDocument();
  expect(screen.queryByText(/취소 요청.*(접수|등록)|예약이 취소/)).not.toBeInTheDocument();
});
```

`webchat/src/widget/HandoffBadge.tsx`:
```tsx
import type { HandoffStatus } from '../api/webchatApi';

const LABEL: Record<'connecting' | 'inProgress' | 'answered', string> = {
  connecting: '대기중', inProgress: '직원 확인중', answered: '답변완료',
};

export function HandoffBadge({ status, onRetry }: { status: HandoffStatus; onRetry: () => void }) {
  if (status.loadError) {
    return (
      <div>
        <p>상태를 불러오지 못했어요.</p>
        <button type="button" onClick={onRetry}>다시 시도</button>
      </div>
    );
  }
  if (status.phase === null) return <div role="status">상태 확인 중…</div>;
  return (
    <div>
      <span>{LABEL[status.phase]}</span>
      {status.assigneeName && <span>{status.assigneeName} {status.assigneeRole}</span>}
      {status.hoursNote && <p>{status.hoursNote}</p>}
      <p>상담(직원 확인)으로 연결됐습니다</p>
    </div>
  );
}
```
Run: `npm --prefix webchat run test -- HandoffBadge` → FAIL → 구현 → PASS.

- [ ] **Step 7: 긴급 안내 `WEBCHAT-URGENT`(앱 `CHAT-URGENT` 재사용)**

`webchat/src/widget/UrgentNotice.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { UrgentNotice } from './UrgentNotice';

test('[WEBCHAT-URGENT-01] 긴급 표현 감지면 일반 예약 대화를 멈추고 119/응급실 이용을 안내', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  expect(screen.getByText(/119|응급실/)).toBeInTheDocument();
});

test('[WEBCHAT-URGENT-02] 긴급 여부를 완벽히 보장하거나 진단한 것처럼 표현하지 않는다', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  expect(screen.queryByText(/진단|확실히|반드시 응급/)).not.toBeInTheDocument();
});

test('[WEBCHAT-URGENT-03] 긴급 안내 중 시간선택·예약확인 등 일반 예약 CTA를 함께 노출하지 않는다', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  expect(screen.queryByRole('button', { name: /시간 선택|예약 신청/ })).not.toBeInTheDocument();
});

test('[WEBCHAT-URGENT-04] 익명 웹에서 인증·연락처를 긴급 안내보다 먼저 요구하지 않는다', () => {
  render(<UrgentNotice bookingCtaVisible={false} contactRequested={false} />);
  expect(screen.queryByPlaceholderText(/전화번호|연락처/)).not.toBeInTheDocument(); // 인계 폼은 직원 문의 선택 후(Task 15)
});
```

`webchat/src/widget/UrgentNotice.tsx`:
```tsx
export function UrgentNotice({ bookingCtaVisible, contactRequested }:
  { bookingCtaVisible: boolean; contactRequested: boolean }) {
  return (
    <div role="alert">
      <p>증상이 급하면 119 또는 가까운 응급실을 바로 이용해 주세요.</p>
      {/* bookingCtaVisible=false: 긴급 중 일반 예약 CTA 금지(URGENT-03) */}
      {/* contactRequested=false: 연락처 수집은 직원 문의 선택 후에만(URGENT-04) */}
    </div>
  );
}
```
Run: `npm --prefix webchat run test -- UrgentNotice` → FAIL → 구현 → PASS.

- [ ] **Step 8: AI 장애 화면 `WEBCHAT-OUTAGE`(신규 본체)**

`webchat/src/widget/OutageNotice.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OutageNotice } from './OutageNotice';
const base = { hospitalPhone: '02-000-0000', onLeaveInquiry: () => {}, onRetry: () => {} };

test('[WEBCHAT-OUTAGE-01] 한글 장애 안내 — 예약·진료기록까지 장애라고 확대하지 않는다', () => {
  render(<OutageNotice phase="idle" {...base} />);
  expect(screen.getByText(/상담 답변에 일시적인 문제/)).toBeInTheDocument();
  expect(screen.queryByText(/예약.*(불가|장애)|진료기록.*(불가|장애)/)).not.toBeInTheDocument();
});

test('[WEBCHAT-OUTAGE-02] [문의 남기기]를 누르면 기존 문맥으로 직원 문의를 시작한다(익명은 인계 폼=Task 15)', async () => {
  const onLeaveInquiry = vi.fn();
  render(<OutageNotice phase="idle" {...base} onLeaveInquiry={onLeaveInquiry} />);
  await userEvent.click(screen.getByRole('button', { name: '문의 남기기' }));
  expect(onLeaveInquiry).toHaveBeenCalledTimes(1); // 봇 응답 없이 대화 문맥으로 인계
});

test('[WEBCHAT-OUTAGE-03] 제출 중이면 원래 동작을 잠그고 완료로 가장하지 않는다(중복 티켓 방지)', () => {
  render(<OutageNotice phase="submitting" {...base} />);
  expect(screen.getByRole('button', { name: '문의 남기기' })).toBeDisabled();
  expect(screen.queryByText(/연결됐습니다/)).not.toBeInTheDocument(); // 아직 완료 아님
});

test('[WEBCHAT-OUTAGE-04] 제출 실패면 한글 오류 + 재시도, 기존 대화/입력값 보존', async () => {
  const onRetry = vi.fn();
  render(<OutageNotice phase="error" {...base} onRetry={onRetry} />);
  expect(screen.getByText('문의를 남기지 못했어요.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('[WEBCHAT-OUTAGE-05] 제출 완료면 `상담(직원 확인)으로 연결됐습니다`만 — 접수/등록·AI 복구 암시 금지', () => {
  render(<OutageNotice phase="done" {...base} />);
  expect(screen.getByText('상담(직원 확인)으로 연결됐습니다')).toBeInTheDocument();
  expect(screen.queryByText(/접수|등록|복구|정상화/)).not.toBeInTheDocument();
});

test('[WEBCHAT-OUTAGE-06] 비상 CTA는 병원 전화번호 + [문의 남기기]가 주 경로 — 앱 예약은 보조 문구만', () => {
  render(<OutageNotice phase="idle" {...base} />);
  expect(screen.getByText('02-000-0000')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '문의 남기기' })).toBeInTheDocument();
  const appNote = screen.getByText(/환자 앱/);
  expect(appNote.closest('[data-role="secondary"]')).not.toBeNull(); // 앱 예약은 주 CTA가 아니다
});
```

`webchat/src/widget/OutageNotice.tsx`:
```tsx
export type OutagePhase = 'idle' | 'submitting' | 'error' | 'done';
export function OutageNotice({ phase, hospitalPhone, onLeaveInquiry, onRetry }:
  { phase: OutagePhase; hospitalPhone: string; onLeaveInquiry: () => void; onRetry: () => void }) {
  if (phase === 'done') return <p>상담(직원 확인)으로 연결됐습니다</p>;
  return (
    <div role="alert">
      <p>상담 답변에 일시적인 문제가 있어요. 예약·진료기록은 그대로 이용할 수 있어요.</p>
      <p>{hospitalPhone}</p>
      <button type="button" onClick={onLeaveInquiry} disabled={phase === 'submitting'}>문의 남기기</button>
      {phase === 'error' && (
        <>
          <p>문의를 남기지 못했어요.</p>
          <button type="button" onClick={onRetry}>다시 시도</button>
        </>
      )}
      <p data-role="secondary">더 빠른 예약은 환자 앱에서도 할 수 있어요.</p>
    </div>
  );
}
```
Run: `npm --prefix webchat run test -- OutageNotice` → FAIL → 구현 → PASS.

- [ ] **Step 9: 위젯 셸 + 화면 이동 `NAV-WEBCHAT` — 콜백 슬롯·문맥 보존**

> 런처↔방 열림/닫힘, 인증 관문·익명 인계 콜백(Task 15로 가는 슬롯)의 **문맥 보존·복귀**, 마감 후 취소/변경에서 **새 화면을 만들지 않음**을 위젯 셸에서 검증한다. `WEBMOD-AUTH`·`WEBANON-HANDOFF` 자체 화면은 Task 15가 채우므로, 여기선 **콜백이 올바른 인자로 불리고 방 위치가 보존되는지**만 본다.

`webchat/src/widget/WebchatWidget.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebchatWidget } from './WebchatWidget';
import type { WebchatApi, SessionState } from '../api/webchatApi';
import { saveAnonToken, clearAnonToken, loadAnonToken } from '../state/anonSession';

const session: SessionState = { threadId: 't1', aiSessionId: 's1', anonToken: 'TOK',
  messages: [{ id: 'm1', senderType: 'patient', messageType: 'text', content: '내 예약 보여줘', sendState: 'sent' }] };
function fakeApi(): WebchatApi {
  return {
    startOrRestoreSession: vi.fn(async () => session),
    fetchMessages: vi.fn(async () => session.messages),
    sendMessage: vi.fn(async () => ({ routeTaken: 'rag' })),
    fetchHandoff: vi.fn(async () => ({ phase: 'connecting', isOpen: true })),
    acknowledgeBatches: vi.fn(async () => {}),
  };
}
beforeEach(() => clearAnonToken());

test('[NAV-WEBCHAT-01] 닫힌 런처를 누르면 방을 열고 같은 브라우저 익명 세션을 복원한다', async () => {
  saveAnonToken('OLD');
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'AI 상담봇' })).toBeInTheDocument());
  expect(api.startOrRestoreSession).toHaveBeenCalledWith('OLD'); // 익명 세션 복원
});

test('[NAV-WEBCHAT-02] 로그인 필요 행동이면 선택·대화 문맥을 보존하고 onAuthGate(인증 관문)를 연다', async () => {
  const onAuthGate = vi.fn();
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={onAuthGate} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  await userEvent.click(await screen.findByRole('button', { name: '내 예약 조회' }));
  expect(onAuthGate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'view_my_appointments' })); // 원래 행동 보존
});

test('[NAV-WEBCHAT-03] 인증 모달을 닫으면 원래 행동을 실행하지 않고 같은 익명 방 위치로 돌아온다', async () => {
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  await userEvent.click(await screen.findByRole('button', { name: '내 예약 조회' }));
  // 콜백만 부르고 방은 그대로(모달 화면은 Task 15). 원래 메시지 문맥 유지.
  expect(screen.getByText('내 예약 보여줘')).toBeInTheDocument();
  expect(api.sendMessage).not.toHaveBeenCalled(); // 원래 행동은 인증 전 실행 안 됨
});

test('[NAV-WEBCHAT-04] 로그인 완료면 최신 값을 조회해 원래 행동으로 복귀한다(가입 완료 복귀=재확인 카드는 Task 15)', async () => {
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  // 로그인 완료 콜백(Task 15가 실제 모달에서 부른다)을 시뮬레이트 → 최신 조회 트리거
  await userEvent.click(await screen.findByRole('button', { name: '내 예약 조회' }));
  // WEBMOD-AUTH 계열(가입 완료)은 자동 실행이 아니라 재확인 카드다 — 위젯이 자동 신청을 하지 않음을 확인
  expect(api.sendMessage).not.toHaveBeenCalled();
});

test('[NAV-WEBCHAT-05] 익명 인계가 필요하면 onHandoffNeeded로 폼을 열고 성공하면 인계 상태로 돌아온다', async () => {
  const onHandoffNeeded = vi.fn();
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={onHandoffNeeded} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  await userEvent.click(await screen.findByRole('button', { name: '직원에게 문의' }));
  expect(onHandoffNeeded).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't1' })); // 대화 요약 문맥 전달
});

test('[NAV-WEBCHAT-06] 같은 브라우저는 토큰으로 복원, 다른 기기(토큰 없음)엔 이어보기 경로가 없다', async () => {
  const api = fakeApi(); // 토큰 저장 안 함 = 다른 기기
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  expect(api.startOrRestoreSession).toHaveBeenCalledWith(null); // 새 익명 세션, 남의 상담 추측 조회 없음
  expect(screen.queryByRole('button', { name: /다른 기기.*이어보기/ })).not.toBeInTheDocument();
});

test('[NAV-WEBCHAT-07] 웹에서 마감 후 취소·변경은 앱 팝업/예약 맥락 화면을 복제하거나 새 이동을 만들지 않는다', async () => {
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  // 앱 전용 마감 후 팝업/예약 맥락 화면이 웹에 없음(미결이라 새 화면 금지)
  expect(screen.queryByText(/마감 후 취소|예약 맥락/)).not.toBeInTheDocument();
});
```

`webchat/src/widget/WebchatWidget.tsx`:
```tsx
import { useState, type ReactNode } from 'react';
import type { WebchatApi } from '../api/webchatApi';
import { useWebchat } from '../state/useWebchat';
import { Launcher } from './Launcher';
import { ChatRoom } from './ChatRoom';
import { GuideBanner } from './GuideBanner';
import { HandoffBadge } from './HandoffBadge';

export type PendingAction = { kind: 'view_my_appointments' | 'book' | 'cancel'; payload?: Record<string, unknown> };
export type HandoffSummary = { threadId: string; summary: string[] };
export type WidgetProps = {
  api: WebchatApi;
  hospitalPhone: string;
  onAuthGate: (action: PendingAction) => void;      // → WEBMOD-AUTH(Task 15)
  onHandoffNeeded: (summary: HandoffSummary) => void; // → WEBANON-HANDOFF(Task 15)
  renderCard: (payload: Record<string, unknown> | null | undefined) => ReactNode; // → WEBCARD(Task 15)
};

export function WebchatWidget({ api, onAuthGate, onHandoffNeeded, renderCard }: WidgetProps) {
  const [open, setOpen] = useState(false);
  const w = useWebchat(api);

  const openRoom = async () => { setOpen(true); await w.open(); };
  return (
    <>
      <Launcher open={open} hasUnread={w.handoff.phase === 'answered'} onOpen={openRoom} onClose={() => setOpen(false)} />
      {open && (
        <div>
          <button type="button" aria-label="닫기" onClick={() => setOpen(false)}>×</button>
          <ChatRoom
            phase={w.phase}
            messages={w.messages}
            onSend={w.send}
            onResend={w.resend}
            onRetryLoad={w.retryLoad}
            guideSlot={<GuideBanner active={w.guide.active} text={w.guide.text} />}
            handoffSlot={<HandoffBadge status={w.handoff} onRetry={() => api.fetchHandoff(w.session!.threadId).then(w.setHandoff)} />}
            renderCard={renderCard}
          />
          {/* 로그인 필요 행동·직원 문의는 콜백만 부른다 — 화면은 Task 15. 원래 행동은 인증/인계 전 실행하지 않는다. */}
          <button type="button" onClick={() => onAuthGate({ kind: 'view_my_appointments' })}>내 예약 조회</button>
          <button type="button" onClick={() => w.session && onHandoffNeeded({ threadId: w.session.threadId, summary: [] })}>직원에게 문의</button>
        </div>
      )}
    </>
  );
}
```

`webchat/src/App.tsx`(Task 0 자리표시자 → 마운트):
```tsx
import { WebchatWidget } from './widget/WebchatWidget';
import { createWebchatApi } from './api/webchatApi';
import { env } from './lib/env';

const api = createWebchatApi(env.supabaseUrl ? `${env.supabaseUrl}/functions/v1` : '');

export default function App() {
  return (
    <div id="webchat-app" role="region" aria-label="AI 상담봇">
      <WebchatWidget
        api={api}
        hospitalPhone=""          {/* 배포 시 get_public_hospital_info로 주입 */}
        onAuthGate={() => {}}      {/* Task 15: WEBMOD-AUTH */}
        onHandoffNeeded={() => {}} {/* Task 15: WEBANON-HANDOFF */}
        renderCard={() => null}    {/* Task 15: WEBCARD */}
      />
    </div>
  );
}
```
Run: `npm --prefix webchat run test -- WebchatWidget` → FAIL → 구현 → PASS. (Task 0의 `App.test.tsx` region 이름표 테스트도 계속 초록불)

- [ ] **Step 10: 전수 초록불 + 검사기 + 커밋**

Run: `npm --prefix webchat run test && npm --prefix webchat run build` → 42규칙 전 테스트 PASS + 빌드 성공.
Run: `python3 docs/design/spec-index/plan-coverage-check.py docs/superpowers/plans/2026-08-18-ai-chatbot.md` · `python3 docs/design/spec-index/plan-prefix-check.py docs/superpowers/plans/2026-08-18-ai-chatbot.md`
Expected: ② 규칙 커버 `165 → 207`(+42) · prefix-check **빚0·미배정0·⏰0·exit0** · **낡은 미결 `NAV-WEBCHAT-04` 해소**(behaviors 역참조). ⚠️ `WEBMOD-AUTH`·`WEBANON-HANDOFF`·`WEBCARD-*`는 Task 15 소유라 이 태스크가 완전 ID로 예고하지 않는다(⏰ 방지 — 콜백 슬롯은 이름으로만 참조).

```bash
git add webchat/src/ webchat/src/widget/ webchat/src/state/ webchat/src/api/ \
        docs/design/screen-behaviors.md docs/superpowers/plans/2026-08-18-ai-chatbot.md
git commit -m "feat: 📝 상담봇 Task 14 본문 — 웹 위젯 상담방 42규칙(React/Vitest) + NAV-WEBCHAT-04 낡은 미결 해소. 익명 세션(X-Anon-Token) delta"
```

> **Task 14 완료 조건**: `WEBCHAT-LAUNCH`5·`WEBCHAT-ROOM`10·`WEBCHAT-GUIDE`3·`WEBCHAT-HANDOFF`7·`WEBCHAT-URGENT`4·`WEBCHAT-OUTAGE`6·`NAV-WEBCHAT`7 = **42규칙 전수** 초록불(Vitest). ⭐ **웹은 React** — `patient_app/`(Flutter) 무손. ⭐ **낡은 미결 `NAV-WEBCHAT-04` 해소**(가입 복귀=재확인 카드, → `WEBMOD-AUTH` 계열 Task 15). ⭐ **경계**: `WEBMOD-AUTH`·`WEBANON-HANDOFF`·`WEBCARD-*`=**Task 15**(콜백 슬롯 `onAuthGate`·`onHandoffNeeded`·`renderCard`만 남김). **다음 = Task 15**(웹 카드 + 인증 후 재확인 + 익명 연락처 45규칙 — `WEBCARD-*`·`WEBMOD-AUTH-*`·`WEBANON-HANDOFF-*`). ⚠️ Task 15가 이 콜백 슬롯을 실제 화면으로 채우고 익명 인계 전화번호(SMS 답변 수신용만)를 받는다.
