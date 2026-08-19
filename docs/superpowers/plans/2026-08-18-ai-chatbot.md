# 4단계: AI 상담봇(앱·웹·직원·관리자) 구현 플랜 — **재작성본**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 각 태스크는 TDD(실패 테스트 → 구현 → 통과)로 진행한다.
>
> ⚠️ **이 파일은 `plans/2026-07-27-ai-chatbot.md`(7,000줄 이상)를 대체한다.** 옛 파일은 삭제하지 않고 **재작성의 입력**으로 남긴다(태스크 구조·`R*` 정합성 표시의 원본). 충돌하면 **이 파일이 정본**이다.
>
> 📌 **작성 상태**: 이 파일은 현재 **스켈레톤**(헤더 + Global Constraints + File Structure)이다. 태스크 본문(`test('[규칙ID] …')` 문장)은 아직 비어 있고, 세션마다 한 태스크씩 채운다.

**Goal:** AI 상담봇을 **환자 채널(앱·웹)과 직원·관리자 운영** 두 축으로 구현하고, 그에 필요한 백엔드(3-A 통합 대화 스키마·서비스·오케스트레이션·마이그레이션)를 1단계 FastAPI 위에 추가한다. **화면 규칙 505개를 태스크의 실패 테스트 문장으로 옮기는 것**이 이 재작성의 목적이다(전체 518 중 `SUPPORT-CAL-*` 13개는 직원웹 Task 14 소유 → whitelist).

**Architecture:** 백엔드는 1단계의 `acquire_as`/`AppError` 패턴을 그대로 재사용해 상담봇 서비스·라우터·오케스트레이션을 추가한다. 대화는 **`chat_threads`(앱·웹의 단일 대화 루트) + `chat_messages`(AI·환자·직원·시스템 이벤트의 단일 시간순 원장)** 위에서 흐르고, AI 세션(`ai_chat_sessions`)과 지원 티켓(`support_tickets`)은 같은 thread 안에서 경계를 가진다. 매 메시지는 **응급 표현 검사 → 인계 감시 → 라우터**(RAG 안내형·진료과 추천형·행동형 에이전트)의 3갈래 체인으로 처리한다. 프론트는 **① 앱**(`patient_app/` Flutter — 3단계 스캐폴딩·위젯 재사용, 하단 5번째 탭 `AI 상담`) **② 웹 위젯**(신규 프로젝트 — 익명·등록 환자 채널) **③ 직원·관리자**(`staff_web/` — 2단계 스캐폴딩 재사용, 티켓함·상세·KB·품질·통계)의 세 채널이다.

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
| **0** | 스캐폴딩 — **웹 위젯 신규 프론트 프로젝트**(스택 확정) + 챗봇 백엔드 모듈 디렉토리 + LLM/RAG·테스트 하네스. 앱은 `patient_app/`·직원은 `staff_web/` 스캐폴딩 재사용 | — | 🆕 신설 |
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
