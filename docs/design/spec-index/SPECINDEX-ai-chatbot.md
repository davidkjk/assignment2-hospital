# SPECINDEX — 상담봇 (ai-chatbot 스펙·플랜 재작성 입력)

> 통합 2026-08-15. 이 색인은 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md` / `docs/superpowers/plans/2026-07-27-ai-chatbot.md` 재작성의 **단일 입력**이다.
> 두 부분으로 구성한다. **Part A = 환자 채널**(모바일 앱·웹 상담창), **Part B = 직원 상담·관리자 운영**(티켓·배정·KB·품질·미해결·대시보드).
> 직원 웹 색인(`SPECINDEX-staff-web.md`) Part B §7이 상담봇 운영을 요약하지만, **상세 정본은 이 파일 Part B**다.
> 공용 `00010_` 마이그레이션·3-A 통합 스키마 계약은 각 기능 옆에 표기돼 있다(migration 단계에서 `grep 00010`으로 모은다).
>
> ⚠️ **삭제된 상류 작업본 안내(2026-08-26)**: 이 색인이 인용하는 `.claude/codex-work/**` 경로(특히 `orchestration/3A-schema-requirements-2026-08-13.md`)는 설계 단계의 **상류 작업본**으로 2026-08-26에 삭제됐다. **그 파일의 내용은 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md`의 「상담봇 통합 스키마 — 상세 요구 (3-A, 2026-08-13)」 절에 통째로 병합돼 있다**(줄번호 밀리니 제목으로 grep; §4.1 chat_threads~§4.7 chat_notification_batches 컬럼표·NotificationRecipient 포함) + 이 색인의 「3-A 통합 스키마 공백」표 + 챗봇 플랜 인라인. 재작성·구현에 지장 없다(가장 크게 인용되던 3A-schema는 플랜 Task 1에서 컬럼·enum 허용값·기각 이유까지 인라인 재현 확인). 경로는 **역사적 출처 표시**로만 남으며, 미작성 태스크를 채울 근거는 위 결정로그 절·이 색인을 쓴다.

## 목차
- **Part A — 환자 채널(앱·웹)**: 기능 갭 · 구조 결정(3-A 통합 스키마 7공백) · 화면 설계 · 체크박스 미반영 · 폐기 · 재작성 순서
- **Part B — 직원·관리자 운영**: 0 판정 기준·범위 · 1 기능 갭 · 2 구조 결정 · 3 화면 설계 · 4 결정로그 미체크 항목 · 5 폐기·대체 · 6 연결 문서·재작성 순서 · 7 미결·충돌 요약

---

# Part A — 환자 채널 (앱·웹)

# 상담봇 앱·웹(환자 채널) 결정 색인 — 스펙/플랜 재작성용

> 2026-07-31~2026-08-14 결정 문서와 원문 대조 결과. 담당 범위는 모바일 앱 상담(목업 91~97·119), 웹 위젯(98~103), 익명 웹·등록 환자 채널이다. 직원 웹·관리자 화면은 필요한 연결만 적고 `다른 영역 담당(코5)`으로 표시한다.
>
> 정본·계약 우선순위: 정책·충돌의 최우선 정본은 `docs/design/chatbot-source-of-truth.md`이다. 카드 판단·상태·문구의 계약은 아카이브된 `docs/design/chatbot-card-catalog.md`를 참조하되 충돌 시 정본을 따른다. 현재 화면의 위치·표시·내비게이션 규칙은 `docs/design/screen-behaviors.md`의 `CCARD-*`·관련 규칙이 소비한다. 결정로그와 기존 AI 스펙·플랜은 이 정본·계약에 맞춰 재작성할 비교 대상이다.

## 기능 갭 (스펙·플랜 어긋남)

| 갭# | 요약 | 현황 | 조치 | 스펙/플랜 영향 |
|---|---|---|---|---|
| **#6 / E3** | 마감 후 취소·변경 공통 요청 기록 | 기존 `cancellation_requested_at`·`late_cancellation` 중심이며 변경 공통 필드가 없다. 기존 플랜은 클라이언트가 별도 티켓 API를 호출하는 흐름이다. | `[상담 채팅 연결]`을 유일한 결정지점으로 삼아 즉시 `appointments.support_requested_at`과 `request_type`(`취소`/`변경`)을 기록한다. 희망 일시는 저장하지 않는다. 티켓에는 `appointment_id`를 남긴다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3214`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4275`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4999`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5007`; 화면 `docs/design/screen-behaviors.md:4971-4976`; 기존 스펙 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:229-236`; 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:1584-1601`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3284-3298`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3509-3568` |
| **#7** | 의사 소개 원본 데이터 | 기존 `staff`에는 전공·소개·사진이 없고, AI 스펙은 KB 카테고리와 직원 필드를 함께 가정한다. | `staff.specialty/bio/photo_url`을 공용 원본으로 저장하고 챗봇은 읽기만 한다. 저장·관리 UI는 다른 영역 담당(코2·코3), 챗봇 KB에 같은 소개를 중복 저장하지 않는다. 대상은 신규 migration, `plans/2026-07-27-staff-web.md`·`specs/2026-07-27-staff-web-design.md`의 직원/관리자 태스크, `plans/2026-07-27-patient-app.md` 예약 태스크, 이 챗봇 스펙의 지식관리이며 코4는 참조 계약만 반영한다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3254-3258`; 기존 스펙 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:84-95`, `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:223-227`; 현재 규칙 `docs/design/screen-behaviors.md:3456`; 화면 인벤토리 `docs/design/chatbot-screen-inventory.md:133`; KB 경계 `docs/design/behaviors/chatbot-admin.md:30` |
| **#8** | 챗봇 예약 방문이유 누락 | 기존 `예약제안_카드보내기`는 환자·과·의사·날짜·시간만 받아 `appointments.reason`이 비게 된다. | 방문이유를 한 번 묻고 예약확인 카드에 포함한다. 최대 100자·선택 입력이며 문진 첫 문항의 초기값으로만 복사한다. 이후 예약 방문이유와 문진 답은 독립이다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3260-3264`; 정본 `docs/design/chatbot-source-of-truth.md:24`, `docs/design/chatbot-source-of-truth.md:45-49`; 화면 `docs/design/screen-behaviors.md:4846-4850`; 기존 스펙 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:211-219`; 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:1930-1981`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:2048-2076` |
| **#9** | 진료요일 요약 API 부재 | 원시 의사 일정에서 앱·챗봇이 각자 문장을 만들 위험이 있다. | 서버 단일 함수가 `schedule_summary`를 만들고 앱·웹·챗봇이 같은 값을 소비한다. 일정 원본·관리 화면은 다른 영역 담당(코2·코3)이다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3266-3270`; 정본 `docs/design/chatbot-source-of-truth.md:28-29`; 화면 `docs/design/screen-behaviors.md:4944-4946`, `docs/design/screen-behaviors.md:5241-5243` |
| **#10 / E4** | 예약 중 상담 모드 부재 | 기존 챗봇은 독립 상담방만 있고 예약 2단계의 시트 진입·맥락 전달·복귀 계약이 없다. | 예약 대상 본인/가족 맥락을 시트에 전달하고, 정보성 안내·진료과 추천만 허용한다. 예약·취소·문진 등 행동형 도구는 모두 금지하며 유일한 출구는 `○○과로 계속하기`; 119·응급실 안전 안내만 예외다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3272-3277`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5008`; 정본 `docs/design/chatbot-source-of-truth.md:14`, `docs/design/chatbot-source-of-truth.md:22-23`; 화면 `docs/design/screen-behaviors.md:4950-4961`; 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:2690-2735`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5432-5594`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5671-5777` |
| **#17** | 문진 대상 성별 필드 부재 | 챗봇이 QNR 카드를 재현해도 진료받는 사람 기준 문항 노출을 판단할 공용 계약이 없다. | 문항 구조에 `보일 대상`(`모든 환자`/`여성 환자만`/`남성 환자만`)을 추가하고, 구현 필드명은 별도 스키마 결정으로 확정한다. 서버가 진료받는 사람의 `patients.gender` 기준으로 노출·진행률을 계산하며, 문진 데이터·관리 UI는 다른 영역 담당(코2·코3); 챗봇은 결과와 상태를 재계산하지 않고 소비한다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3303-3308`; 정본 `docs/design/chatbot-source-of-truth.md:57-65`; 화면 `docs/design/screen-behaviors.md:4900-4913`; 기존 스펙 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:238-245` |
| **#18** | 예약 변경 시 문진 연결 손실 | 예약 변경으로 새 `appointment_id`가 생기면 기존 응답이 옛 예약에 남는 공용 데이터 갭이다. | 변경 트랜잭션에서 미완성 답까지 새 예약으로 이동한다. 챗봇 카드가 문진을 직접 복사하지 않고 서버의 새 예약 상태를 읽는다. 다른 영역 담당(코3), 챗봇 연동만 코4다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3309-3316`; 정본 `docs/design/chatbot-source-of-truth.md:62`, `docs/design/chatbot-source-of-truth.md:65`; 화면 `docs/design/screen-behaviors.md:4911-4913` |
| **#20** | `quick_replies` 없음 | 기존 메시지 타입 6종이 모두 실행·확정 카드이며 대화 유도 버튼이 없다. | `message_type=quick_replies`와 버튼 배열을 추가한다. 시작은 앱의 다가오는 예약 유무로 고정 4개, 대화 중은 AI가 안전 규칙을 적용해 3~4개 생성, 실패·로딩 표시는 없고 자유 입력은 항상 유지한다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3326-3330`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5001`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5016`; 정본 `docs/design/chatbot-source-of-truth.md:13`, `docs/design/chatbot-source-of-truth.md:26`, `docs/design/chatbot-source-of-truth.md:66-67`, `docs/design/chatbot-source-of-truth.md:95`; 화면 `docs/design/screen-behaviors.md:4915-4926`; 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:70-169`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:2690-2735`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5671-5777` |
| **#21** | 문진 수정 시점 불일치 | 옛 챗봇 스펙과 플랜은 도착 후 읽기 전용으로 둔다. 현재 결정은 진료 시작 전까지 수정 가능하다. | 앱 문진·챗봇 카드가 `도착/대기 중 수정 가능, 진료중부터 읽기 전용`을 같은 서버 계약으로 사용한다. 문진 서비스는 다른 영역 담당(코3)이다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4788-4795`; 정본 `docs/design/chatbot-source-of-truth.md:25`, `docs/design/chatbot-source-of-truth.md:65`; 화면 `docs/design/screen-behaviors.md:4907`, `docs/design/screen-behaviors.md:4912`; 기존 스펙 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:238-245`; 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:6043-6055` |
| **#24** | 이력에서 문진으로 갈 수 없음 | 문진 조회 API는 있으나 이력·상담 카드에서 연결되는 경로가 없다. | 챗봇은 문진 내용·진행률을 직접 복제하지 않고 환자 앱의 전용 문진/읽기 전용 경로를 연결한다. 이력 API·환자 앱 화면은 다른 영역 담당(코3)이며 직접 대상은 환자 앱 플랜·스펙이다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3357-3361`; 정본 `docs/design/chatbot-source-of-truth.md:62`, `docs/design/chatbot-source-of-truth.md:65`; 화면 `docs/design/screen-behaviors.md:4906-4913`; 직접 대상 `docs/superpowers/plans/2026-07-27-patient-app.md:2944`, `docs/superpowers/plans/2026-07-27-patient-app.md:3954`; 환자 앱 스펙 `docs/superpowers/specs/2026-07-27-patient-app-design.md:72-75`; AI 교차 참고 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5791-6038` |
| **번호 없음** | AI 장애 시 환자 대체 경로 | 옛 스펙은 `문의 남기기`만 적고 앱 예약·전화 우선순위가 불명확했다. | 웹은 전화번호와 `[문의 남기기]`를 주 경로로, 앱 예약은 보조 문구로 둔다. 앱·웹 모두 봇 없이 기존 문맥으로 문의를 만든다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4193-4228`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5006`; 정본 `docs/design/chatbot-source-of-truth.md:37`, `docs/design/chatbot-source-of-truth.md:79`; 화면 `docs/design/screen-behaviors.md:5016-5027`, `docs/design/screen-behaviors.md:5146-5155`; 기존 스펙 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:50-52` |
| **#77·#50·#54 등** | 문진 카드가 의존하는 공용 필드·완료 계약 | 문항 설명, 완료 상태, 문항 수 상·하한 등은 챗봇 카드 자체에서 해결할 수 없다. | QNR 서버 계약이 닫힌 뒤 `CCARD-QNR`는 상태·진행률·전용 화면 진입만 재현한다. 직접 구현하지 않으며 다른 영역 담당(코2·코3)으로 인계한다. | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3883`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3918-3920`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3939-3942`; 화면 `docs/design/screen-behaviors.md:4900-4913`; 카드 계약 `docs/design/chatbot-card-catalog.md:212-250` |

## 구조 결정 (DB·API·상태 전이)

| 결정 | 내용 | 선정 사유 | 영향 범위 | 우선순위 |
|---|---|---|---|---|
| **같은 상담방 루트** | 기존 `chat_conversations`를 `chat_threads`로 통합하고 `ai_chat_sessions`, `support_tickets`, `chat_messages`, `chat_read_states`, `chat_notification_batches`, `anonymous_chat_sessions/contacts`를 연결한다. 메시지는 `thread_id`와 정확히 하나의 AI 세션 또는 티켓을 가진다. | 앱·웹에서 AI와 직원 상담이 한 시간순 피드로 보여야 하고, 종료 후 재문의도 같은 방에서 보존해야 한다. | 3-A 요구 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4327-4344`; 상세 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4371-4465`; 관계 원본 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:31-46`; 기존 스키마 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:57-82`; 기존 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:70-235`; 7건의 공백 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4278-4290` | **최우선** |
| **3-A 실행 순서와 3갈래 체인** | 매 메시지는 `응급 표현 검사 → 인계 감시 → 라우터` 순서로 처리한다. 응급이면 119/응급실 안내 후 종료하고, 인계 6조건이면 현재 갈래를 중단해 인계 체인으로 강제 전환한다. 통과한 메시지만 `RAG 안내형`·`진료과 추천형 문진`·`행동형 에이전트` 중 하나로 분기하며, 실제 예약 실행은 확인 카드가 담당한다. | 인계를 에이전트의 자율 판단에 맡기지 않고 모든 갈래에 안전 감시를 적용해야 하며, 채널이 달라도 같은 백엔드 책임 경계를 사용해야 한다. | 스펙 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:34-42`, `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:50-52`, `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:186-197`; 플랜 아키텍처 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:7`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:16-18`; 구현 경계 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:2429-2443`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:2690-2703` | **최우선** |
| **티켓 생명주기** | `pending → in_progress → answered`만 허용한다. 일반 `[보내기]`는 종료하지 않고 직원의 `[상담 종료]`만 `answered`로 만든다. 완료 티켓은 재개하지 않으며 재문의는 새 티켓과 `previous_ticket_id`를 만든다. | 라이브 상담의 다회 메시지와 종료 경계를 분리하고 실수로 완료 상담을 다시 여는 것을 막는다. | 3-A `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4391-4432`; 화면 `docs/design/screen-behaviors.md:4814-4821`, `docs/design/screen-behaviors.md:4941-4948`; 결정 R2-3A `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5018`; 기존 플랜 폐기 대상 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3294-3298`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3634-3668` | **최우선** |
| **AI 세션 만료와 이어가기** | AI만 마지막 활동 후 30분 무활동 만료. 직원 티켓에는 적용하지 않는다. `[이전 내용 이어서 질문]`은 요약을 가진 새 AI 세션, `[새 질문 시작]`은 문맥 없는 새 세션이다. | 대화 기록은 보존하면서 LLM 컨텍스트를 제한하고, 직원 상담을 AI 타임아웃으로 닫지 않기 위해서다. | 3-A `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4467-4498`; 화면 `docs/design/screen-behaviors.md:4822-4825`; `CHAT-LEN-01` `docs/design/screen-behaviors.md:4824`; 기존 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:2690-2735` 재작성 | **최우선** |
| **단일 메시지 원장과 카드 스냅샷** | `chat_messages`에 `message_type + payload jsonb` 또는 동등한 카드 이벤트/결과를 저장하고, `client_message_id`로 재전송 멱등성을 보장한다. 시스템 경계는 `chat_events` 또는 `system` 메시지 유형으로 보존한다. | 카드·직원 연결·종료·만료를 과거 상담 복원 시 재현해야 하며, 단순 `content`만으로는 불가능하다. | 결정로그 통합 공백 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4284-4289`; 3-A 메시지 계약 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4433-4465`; 카드 계약 `docs/design/screen-behaviors.md:4783-4787`, `docs/design/screen-behaviors.md:4840-4926` | **최우선** |
| **등록 환자와 익명 웹 소유권 분리** | `owner_type=patient` 또는 `anonymous_web`을 명시하고, 익명 브라우저 토큰은 해시만 저장한다. 전화번호가 환자와 같아도 `patient_id`로 자동 연결하지 않는다. | 익명 웹의 전화번호는 직원 답변 SMS용 연락처일 뿐 본인확인·다른 기기 복원 수단이 아니다. | 3-A `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4500-4535`; 원본 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:202-237`; 화면 `docs/design/screen-behaviors.md:5110-5111`, `docs/design/screen-behaviors.md:5136-5144`, `docs/design/screen-behaviors.md:5261-5266`; MR2-01 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5080` | **최우선** |
| **알림 수신 대상 추상화** | 등록 환자와 익명 연락처를 `NotificationRecipient`로 추상화하고, 배칭·dispatcher·재시도·`notification_log`는 공통으로 쓴다. 익명은 `anonymous_session_id + anonymous_contact_id`, 채널은 SMS, 분류는 `transactional`이다. | `patients`에 가짜 행을 만들거나 기존 환자를 추측 매칭하지 않으면서 같은 알림 품질과 멱등성을 보장한다. | 3-A `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4554-4651`; 원본 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:288-353`; 화면 `docs/design/screen-behaviors.md:4826`, `docs/design/screen-behaviors.md:5242`; 기존 알림 플랜은 다른 영역 담당(코5) | **최우선** |
| **미확인 직원 답변 배칭** | 사용자가 상담방을 보지 않을 때 연속 직원 답변을 한 배치로 묶어 한 번만 알리고, 확인 후 새 답변은 새 배치로 만든다. 담당 배정·상태 변경만으로는 알리지 않는다. | SMS·푸시 중복을 줄이고 앱·웹의 미읽음 상태를 같은 기준으로 만든다. | 3-A `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4554-4584`; 원본 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:256-286`; 화면 `docs/design/screen-behaviors.md:4826`, `docs/design/screen-behaviors.md:5101`, `docs/design/screen-behaviors.md:5242` | **높음** |
| **예약-티켓 직접 연결** | `support_tickets.appointment_id` nullable FK를 추가한다. 마감 후 취소·변경 티켓은 공통 지원 요청 필드와 함께 예약을 직접 가리킨다. | 함수 인자만으로는 어느 예약 상담인지 DB가 보장하지 못한다. | 통합 공백 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4286`; E3 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4275`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5007`; 기존 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:1600-1601`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:2334-2338`은 재작성 대상 | **높음** |
| **공용 운영시간 판정** | 앱·웹이 환경변수 `9~18시`나 로컬 계산을 쓰지 않고 `is_open(at)`의 서버 결과를 소비한다. 상담봇은 직원 웹 `SCHED-HOURS-*`, `SCHED-EXC-*`를 읽기만 한다. | 예약·상담·다음 영업일 문구가 채널별로 달라지는 것을 막고 운영시간 이중 원본을 없앤다. | MR2-05 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5084`; 화면 `docs/design/screen-behaviors.md:4944-4946`, `docs/design/screen-behaviors.md:5241-5243`; 기존 플랜의 `is_business_hours` `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3284-3313`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3502-3507`는 폐기·대체 |
| **카드 판단 재사용** | `예약취소_카드보내기`는 `CANCEL-*`, `사전문진_카드보내기`는 `QNR-*`의 판단·상태·문구·실행 결과를 재현한다. 카드가 예약 가능성·충돌·문진 진행률을 자체 계산하지 않는다. | 채팅이라는 그릇이 달라도 앱과 다른 결과를 보이면 예약·취소·문진 데이터가 갈라진다. | `HANDOFF.md:261`; 정본 `docs/design/chatbot-source-of-truth.md:39-67`; 화면 `docs/design/screen-behaviors.md:4783-4787`, `docs/design/screen-behaviors.md:4830-4913`; 카드 사전 `docs/design/chatbot-card-catalog.md:7-22` |
| **제한 자료 안전 경계** | 일반 자료는 RAG로 답하되 제한 주제는 병원 원문을 별도 블록에 그대로 표시하고 생성문에 섞지 않는다. 질문 전체가 제한 주제면 제한 문구와 `[직원 연결]`만 표시한다. | 제한 문구의 의미 변형·AI 덧붙임을 막으면서 무관한 일반 안내까지 차단하지 않는다. | A3 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5001`; 정본 `docs/design/chatbot-source-of-truth.md:15`, `docs/design/chatbot-source-of-truth.md:94`; 기존 스펙 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:191-197`; 플랜 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:1984-1997` |

### 3-A 통합 스키마 공백 7건

> **테이블 수 표기 주의:** 핸드오프는 신규 테이블을 7개로 요약하지만, 3-A 관계 원본 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:31-43`에는 `chat_threads`, `ai_chat_sessions`, `support_tickets`, `chat_messages`, `chat_read_states`, `chat_notification_batches`, `anonymous_chat_sessions`, `anonymous_chat_contacts`의 8개 명칭이 나온다. 7건은 스키마 공백 수이며, 테이블 7개라는 표현은 익명 연락처·보조 관계를 어떻게 분류할지 확정한 뒤 사용한다.

| 공백 | 재작성 때 넣을 계약 | 근거/상태 |
|---|---|---|
| 1. 통합 스키마 | `chat_conversations`와 `chat_threads`를 하나의 정본으로 통합하고 앱·웹 채널, 현재 갈래, AI·티켓 경계, 활동 시각, 소유권을 보존 | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4284`; `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:430-438` — 플랜 재작성 |
| 2. 카드 미보존 | `message_type + payload jsonb` 버전 스냅샷 또는 카드 이벤트/결과 테이블 | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4285`; `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:438` — 플랜 재작성 |
| 3. 예약-티켓 FK | `support_tickets.appointment_id` nullable FK | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4286`; `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:439` — 플랜 재작성 |
| 4. 품질 검토 상태 | 상담 단위의 검토 상태·검토 관리자·검토 시각과 미검토 우선 정렬 | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4287`; `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:440` — B3의 `quality_review`는 다른 영역 담당(코5) |
| 5. 과거 답변 근거 | 실제 FK와 당시 순서·유사도·가능한 원문 스냅샷을 가진 `chat_message_sources` 동등 계약 | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4288`; `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:441` — 플랜 재작성 |
| 6. 시스템 경계 | 직원 연결·담당 변경·상담 종료·AI 만료·새 AI 시작을 `chat_events` 또는 `system` 메시지로 시간순 보존 | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4289`; `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:442` — 플랜 재작성 |
| 7. 보존·파기 | `retention_class`와 6개 보존 클래스, 법정 강제값·병원 방침값·파기 배치를 분리. 기술자가 임의 TTL을 정하지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4290`; `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:443`, `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:449-462` — 방침 FINAL, 플랜 재작성 BLOCKED |

## 화면 설계 결정 (선택지 해소 → 규칙으로 반영됨)

| 규칙 ID 묶음 | 핵심 선택 | 연관 갭 | 근거 |
|---|---|---|---|
| `CHAT-TAB-*` · `CHAT-ROOM-*` | 앱 하단 5번째 탭은 `AI 상담`; 환자 노출 이름은 `AI 상담봇`. AI·직원 메시지·카드를 하나의 시간순 피드에 넣고 자유 입력은 항상 유지한다. 카드에는 넓은 세로형·상단 꼬리표·강화 테두리/배경을 쓰되 임의 아이콘·좌측 바는 추가하지 않는다. | #20, 3-A 단일 타임라인 | 화면 `docs/design/screen-behaviors.md:4781-4805`; 정본 `docs/design/chatbot-source-of-truth.md:7-15`; R2-1 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5015` |
| `CHAT-GUIDE-*` · `CHAT-ROOM-SAFE/VISUAL-*` | 진료과 추천 중 `진단이 아니라 진료과 안내입니다`를 고정하고, 의료 안내/일반 병원 안내는 색이 아닌 작은 머리말 `진료 안내`/`병원 이용 안내`로 구분한다. | 안전 요구사항, #10 | 화면 `docs/design/screen-behaviors.md:4804-4805`, `docs/design/screen-behaviors.md:4928-4935`; R2-3A-Q2 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5027`; 요구사항 `docs/고객요구사항.txt:360-371`, `docs/고객요구사항.txt:477-479` |
| `CCARD-TIME-*` · `CCARD-BOOKCONF-*` · `CCARD-BOOKDONE-*` | 실제 서버 가용시간·충돌 결과를 카드에 반영한다. 예약확인 카드에는 대상·과·의사·일시·방문이유·장소를 묶고, 예약 중 상담 시트에서는 시간·확인·완료 카드를 보내지 않는다. | #8, #10 | 화면 `docs/design/screen-behaviors.md:4828-4862`; 정본 `docs/design/chatbot-source-of-truth.md:45-51`; 카드 계약 `docs/design/chatbot-card-catalog.md:69-125` |
| `BOOK-DOC-08/09` · `MR2-04` | 예약 3단계에서 선택 대상은 의사다. 선택된 환자(본인/가족)는 제목 아래 작고 차분한 맥락 라벨로만 표시하고, 의사 행을 주 선택지로 강조한다. 의사별 `다음 가능 시간`은 표시하지 않는다. | #7, MR2-04 | 화면 `docs/design/screen-behaviors.md:3457-3458`; 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5083`; 목업 95 `docs/design/mockups/95-chatbot-app-bookbot-sheet.html:11` |
| `CCARD-CANCELCONF-*` · `CCARD-CANCELDONE-*` · `CCARD-CANCELREJ-*` | 마감 전/생성 후 30분 이내만 확인 카드로 즉시 취소한다. 마감 후에는 카드/API를 직접 호출하지 않고 `LATEFLOW-POP`으로 보낸다. 취소 확정 전에는 취소 완료·접수 표현을 금지하고, 반려 시 직원 사유·정상 예약·QR·다시 문의를 유지한다. | #6 | 화면 `docs/design/screen-behaviors.md:4864-4898`; 정본 `docs/design/chatbot-source-of-truth.md:52-56`; 카드 계약 `docs/design/chatbot-card-catalog.md:127-211` |
| `CCARD-QNR-*` · `WEBCARD-QNR-*` | QNR 카드는 문항을 채팅에 나열하지 않고 상태·서버 진행률·전용 문진 화면 진입만 제공한다. 기존 답이 없는 0문항은 `작성할 문진이 없습니다`만 표시하고, 기존 답이 있으면 과거 답의 `[내용 보기]` 읽기 전용 경로를 유지한다. 앱은 진료 시작 전 보기/수정, 진료중부터 보기만; 웹은 환자 앱 경로만 안내한다. 취소 뒤 답은 읽기 전용 보존하며 자동 복사하지 않는다. | #17, #18, #21, #24 | 화면 `docs/design/screen-behaviors.md:4900-4913`, `docs/design/screen-behaviors.md:5210-5217`; R2-5 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5020`; 정본 `docs/design/chatbot-source-of-truth.md:57-65` |
| `CCARD-QUICK-*` | 시작 시 다가오는 예약 유무로 고정 4개를 선택하고, 대화 중 성공 시에만 안전한 추천 3~4개를 표시한다. 생성 중·실패는 표시하지 않고 자유 입력을 계속 연다. 버튼 문장은 그대로 환자 말풍선으로 저장한다. | #20 | 화면 `docs/design/screen-behaviors.md:4915-4926`; R2-2 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5016`; 정본 `docs/design/chatbot-source-of-truth.md:66-67`; 카드 계약 `docs/design/chatbot-card-catalog.md:252-281` |
| `BOOKBOT-SHEET-*` · `NAV-CHATAPP-02` | 예약 2단계 위에서 시트를 열고 본인/가족 맥락을 유지한다. 정보성 안내·진료과 추천만 제공하고 `○○과로 계속하기`로 3단계에 값을 돌려준다. X/스와이프는 선택값을 잃지 않는다. | #10 / E4 | 화면 `docs/design/screen-behaviors.md:4950-4961`, `docs/design/screen-behaviors.md:5044`; 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3272-3277`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5008`; 정본 `docs/design/chatbot-source-of-truth.md:22-23` |
| `LATEFLOW-POP-*` · `LATEFLOW-CHAT-*` · `LATEFLOW-APPT-*` | 팝업의 `[상담 채팅 연결]`이 유일한 결정지점이며 즉시 기록·배지·예약 맥락 상담방 진입. 처리 중에는 닫기/연결을 잠그고 실패·시간초과 시 다시 활성화한다. 상담방은 예약 유지 사실만 설명하고 확인 카드를 재표시하지 않는다. | #6 | 화면 `docs/design/screen-behaviors.md:4964-5001`, `docs/design/screen-behaviors.md:5047-5048`; A1/E3 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4999`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5007`; 정본 `docs/design/chatbot-source-of-truth.md:30-33`, `docs/design/chatbot-source-of-truth.md:76-77` |
| `CHAT-ROOM-LIVE-*` · `CHAT-HANDOFF-*` · `CHAT-ROOM-END-*` | 직원 라이브 상담은 같은 방·같은 피드에서 진행한다. 상태는 `직원 연결 중 → 직원 상담 중 → 상담 종료`; 일반 답변 전송은 종료가 아니다. 직원 `[상담 종료]`만 `answered`를 만들고, 종료 후 AI 이어가기/새 질문을 제공한다. | 3-A | 화면 `docs/design/screen-behaviors.md:4814-4826`, `docs/design/screen-behaviors.md:4937-4948`; R2-3A `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5018`; 원본 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:19-27`, `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:93-118` |
| `CHAT-ROOM-RETICKET-*` · `CHAT-ROOM-AI-EXPIRE-*` · `CHAT-LEN-01` | AI만 30분 무활동 만료. 직원 상담은 만료하지 않는다. 종료 티켓 재개 대신 새 티켓을 만들고, 긴 대화에는 하드 차단 대신 소프트 넛지를 둔다. 실제 메시지/토큰 한도와 요약 대 절단은 플랜 확인 필요다. | 3-A, MR2-08 | 화면 `docs/design/screen-behaviors.md:4819-4825`; `CHAT-LEN-01` `docs/design/screen-behaviors.md:4824`; MR2-08 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5087`; 원본 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:169-200` |
| `CHAT-HISTORY-*` · `NAV-CHATAPP-09/10` | 콜드스타트 딥링크 뒤로가기는 `CHAT-HISTORY`; 상담방 상단 `이전 상담` 아이콘도 `CHAT-HISTORY`로 이동하며 목록에서 뒤로가면 상담방으로 돌아온다. | MR2-02, B1 | 화면 `docs/design/screen-behaviors.md:5003-5014`, `docs/design/screen-behaviors.md:5051-5052`; 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5002`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5081`; `NAV-CHATAPP-10`은 반드시 유지 |
| `CHAT-URGENT-*` · `CHAT-URGENT-EXC-01` | 긴급 표현이면 예약·진료과 추천을 중단하고 119/응급실을 우선 안내한다. 분류를 확정하지 못한 예외의 제목은 `안내`, 본문은 `상담봇이 긴급 여부를 확인하지 못했습니다. 온라인 상담이나 예약을 계속하지 말고, 119에 연락하거나 가까운 응급실을 이용하세요.`로 고정한다. | 안전 공통 | 화면 `docs/design/screen-behaviors.md:5029-5037`; 역대조-1 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5038`; 요구사항 `docs/고객요구사항.txt:364-371` |
| `WEBCHAT-LAUNCH-*` · `WEBCHAT-ROOM-*` · `NAV-WEBCHAT-06` | 닫힌 런처에는 미읽음 숫자 대신 작은 점만 표시한다. 같은 브라우저 익명 토큰은 복원하지만 다른 기기 이어보기는 제공하지 않는다. | MR2-01, B4 | 화면 `docs/design/screen-behaviors.md:5093-5116`, `docs/design/screen-behaviors.md:5101`, `docs/design/screen-behaviors.md:5261-5266`; 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5005`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5080`; 원본 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:202-214` |
| `WEBMOD-AUTH-*` · `WEBCARD-BOOKCONF-03` | 인증 완료 뒤 예약·취소를 자동 실행하지 않는다. 최신 대상·슬롯을 서버에서 재검증한 재확인 카드를 다시 표시하고 환자가 `[신청]` 또는 `[취소]`를 누른다. | MR2-03 | 화면 `docs/design/screen-behaviors.md:5127-5130`, `docs/design/screen-behaviors.md:5175`; 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5082`; 정본 `docs/design/chatbot-source-of-truth.md:48` |
| `WEBANON-HANDOFF-*` · `WEBCHAT-HANDOFF-*` | 익명 웹 전화번호는 선택 입력이며 직원 답변 SMS 수신용으로만 쓴다. 같은 브라우저 토큰으로 복원하고, 번호가 없으면 런처의 미읽음 점으로 재방문을 안내한다. 미확인 연속 답변은 한 번만 배칭한다. | MR2-01, 3-A | 화면 `docs/design/screen-behaviors.md:5132-5144`, `docs/design/screen-behaviors.md:5236-5247`; R2-3A-Q3 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5028`; 원본 `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:216-237`, `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:256-310` |
| `WEBCHAT-OUTAGE-*` · `WEBCHAT-URGENT-*` | 웹 AI 장애의 주 CTA는 전화와 `[문의 남기기]`; 앱 예약은 보조 안내다. 긴급 안내는 인증·연락처 수집보다 먼저 보여준다. | B5 | 화면 `docs/design/screen-behaviors.md:5146-5155`, `docs/design/screen-behaviors.md:5255`; 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5006`; 정본 `docs/design/chatbot-source-of-truth.md:37`, `docs/design/chatbot-source-of-truth.md:79` |
| **공통 A2/A3/B2/B3** | A2는 이전 KB 버전을 `[편집]` 폼에 채우고 별도 `[승인]` 뒤 재임베딩·감사 기록. A3는 제한 원문 별도 블록. B2는 오답 신고 저장 후 원래 상담/티켓 상세와 스크롤로 복귀. B3는 `BADINBOX-REVIEW`, `source='quality_review'`로 보낸다. A2/B3 처리함·관리자 화면은 다른 영역 담당(코5)이다. | A2, A3, B2, B3 | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4999-5004`; 정본 `docs/design/chatbot-source-of-truth.md:15`, `docs/design/chatbot-source-of-truth.md:94`; B2 환자 채널 연결은 `docs/design/screen-behaviors.md:5393`, `docs/design/screen-behaviors.md:5397`, `docs/design/screen-behaviors.md:5489`; 관리자 규칙은 다른 영역 담당(코5), 상세 대상은 **대상 미확인** |
| **공통 E3/B5/A1** | E3는 취소·변경을 같은 지원 요청·상담방·배지 흐름으로 묶고, A1은 추가 확인 카드를 제거한다. B5는 장애 때 같은 직원 문의 문맥을 사용한다. | E3, 번호 없음 장애 갭 | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4999`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5006-5007`; 정본 `docs/design/chatbot-source-of-truth.md:30-37`; 화면 `docs/design/screen-behaviors.md:4971-4989`, `docs/design/screen-behaviors.md:5020-5026`, `docs/design/screen-behaviors.md:5150-5155` |

## 기존 체크박스 미반영분

결정로그에 남은 `- [ ]` 중 이 영역에 직접 영향을 주는 항목이다. 공용 DB·문진·알림 구현은 해당 담당을 함께 표시한다.

| 줄 | 항목 | 상태 | 필요 조치 |
|---|---|---|---|
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3214`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4275` | #6/E3 공통 `support_requested_at`·`request_type` | ⏳ 구조 결정 완료, migration·서비스 반영 대기 | AI 스펙의 `cancellation_requested_at`·전용 대기열 문구 제거, `LATEFLOW-*`와 공용 예약 API를 연결 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3260-3264` | #8 챗봇 방문이유 | ⏳ 미반영 | 도구 입력·대화 한 번 묻기·`CCARD-BOOKCONF` 여섯 항목을 스펙/플랜에 반영 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3272-3277` | #10 예약 중 상담 모드 | ⏳ 미반영 | `BOOKBOT-SHEET` 맥락·금지 도구·`○○과로 계속하기`를 AI 스펙/플랜/앱 예약 태스크에 반영 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3326-3330` | #20 빠른답변 | ⏳ 정책·화면 규칙은 있으나 타입·API·앱/웹 구현 미반영 | `quick_replies`, 시작 고정 묶음, 동적 3~4개, 조용한 실패를 백엔드·앱·웹에 공통 반영 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4276` | B3 `quality_review` source | ⏳ 미반영, 다른 영역 담당(코5) | 챗봇은 `BADINBOX-REVIEW`로 보내는 API 계약만 소비하고 관리자 처리함은 코5가 반영 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4788-4795` | #21 문진 수정 시점 | ⏳ 공용 문진 담당(코3) 반영 필요 | 챗봇 카드가 진료 시작 전 수정 가능·진료중 읽기 전용을 재계산하지 않고 서버 결과로 표시 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4796-4801` | #25 취소요청 대기열 폐지 | ⏳ 직원 웹 문서 정리 담당(코5), 챗봇 스펙 문구는 코4 영향 | `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:234`의 대기열 문구를 상담 문의함·예약 캘린더 흐름으로 교체. 티켓 생성은 유지 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4806-4807` | #26 마감 후 변경·#28 버튼 문구 | ⏳ 화면 규칙 반영 확인 필요 | `LATEFLOW-POP-CHANGE-01`과 `[상담 채팅 연결]`을 AI 스펙/플랜의 옛 취소 전용 문구와 대조 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4125` | `BusyButton` 적용 대상에 상담 메시지 보내기 | ⏳ 환자 앱 구현 대기 | `CHAT-ROOM-SEND-01~03` 및 웹 전송 중 잠금·재전송과 함께 반영 |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3303-3316`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3357-3361` | #17/#18/#24 문진 노출·예약 변경·이력 연결 | ⏳ 다른 영역 담당(코3) | 코4는 QNR 카드의 서버 계약·앱 경로만 색인하고 공용 문진 저장/이력 구현은 넘김 |

## 폐기 결정 — 기존 스펙·플랜에서 지울 것

| 대상 | 내용 | 폐기 근거 | 줄번호 |
|---|---|---|---|
| `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:57-82`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:70-235` | `chat_conversations` 단일 상태(`bot/handed_over/closed`)와 `conversation_id` 중심의 옛 스키마 | `chat_threads`·AI 세션·티켓·단일 메시지 원장으로 통합 | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4284-4289`; 3-A `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:29-46` |
| `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:234-236`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:1600-1601`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:2334-2338` | 마감 후 `cancellation_requested_at` 기록, `late_cancellation` 전용 대기열, `summary_staff_todo`의 승인/반려 대기열 문구 | E3 공통 지원 요청·A1 즉시 상담 연결·전용 `/cancellation-requests` 폐지. 티켓 자체와 예약 맥락은 유지 | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4230-4255`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4999`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5007`; 정본 `docs/design/chatbot-source-of-truth.md:30-33`; 문서 정리 지시 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4796-4801` |
| `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3291-3298`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3502-3668`; `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:258-264` | 직원이 일반 답변을 보내면 티켓이 `answered`가 되고 상담방이 bot으로 복귀하는 흐름 | 일반 `[보내기]`는 상담 중 메시지일 뿐이며 `[상담 종료]`만 `answered`; 종료 뒤 새 AI/새 티켓 분기 | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5018`; 화면 `docs/design/screen-behaviors.md:4814-4825`, `docs/design/screen-behaviors.md:4941-4943`; 3-A `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:93-118` |
| `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5439-5452`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5587-5594`; `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:242-245` | 웹 `QuestionnaireCard`가 문항·답변을 직접 편집·저장하고 앱/웹 동일 문진을 제공 | R2-5: 웹은 문진 UI를 만들지 않고 환자 앱 경로만 안내; 앱 QNR는 상태·진행률·전용 화면 진입 카드 | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5020`; 화면 `docs/design/screen-behaviors.md:4900-4913`, `docs/design/screen-behaviors.md:5210-5217`; 플랜 대체 고지 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:6043-6047` |
| `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3291-3293`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3502-3507` | 설정의 평일 고정 `is_business_hours()`와 `settings.business_hour_start/end` | 직원 스케줄·점심·특정일 예외를 포함한 서버 단일 `is_open(at)` | MR2-05 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5084`; 화면 `docs/design/screen-behaviors.md:4944-4946`, `docs/design/screen-behaviors.md:5241-5243` |
| `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:63`, `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:264`; `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5450`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5587`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5593` | 전화번호로 익명 웹의 다른 기기 상담을 복원하거나 연락처를 환자 계정처럼 쓰는 해석 | MR2-01: 같은 브라우저 토큰 복원만 유지, 전화번호는 직원 답변 SMS용 | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5080`; 화면 `docs/design/screen-behaviors.md:5110-5111`, `docs/design/screen-behaviors.md:5138-5144`, `docs/design/screen-behaviors.md:5265-5266`; 3-A `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:230-237` |
| `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:217-219`, `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:79`; `docs/superpowers/plans/2026-07-27-ai-chatbot.md:1617-1627` | 6개 메시지 유형만 존재하고 `quick_replies`가 없는 모델 | #20 및 R2-2에 따라 `quick_replies`를 확장. 기존 예약·취소·문진 카드의 판단은 삭제하지 않고 공용 규칙으로 재연결 | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3326-3330`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5016`; 화면 `docs/design/screen-behaviors.md:4915-4926` |
| 목업 118의 상담봇 운영시간 편집·목업 109 별도 캘린더 | 상담봇이 운영시간을 직접 편집하거나 마감 후 상담용 별도 캘린더를 갖는 흐름 | 운영시간은 직원 웹 원본 read-only, 109는 예약 캘린더에 흡수. 화면 자체는 다른 영역 담당(코5) | MR2-05 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5084`, MR2-10 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5089`; 앱·웹 소비 규칙 `docs/design/screen-behaviors.md:4944-4946`, `docs/design/screen-behaviors.md:5241-5243` |
| `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5679-5681`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5773-5776` 및 옛 문진 카드 저장 계약 | 옛 앱 플랜이 채팅 카드에서 문진 문항을 직접 편집·저장하고 도착 후 잠금 | 현재 `CCARD-QNR`는 QNR 상태·전용 앱 경로를 재현하고 진료 시작 전까지 수정 가능. 공용 QNR 저장은 코3 | 결정로그 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4788-4795`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5020`; 화면 `docs/design/screen-behaviors.md:4902-4913` |

## 주요 링크

- **이 색인의 원본 브리프**: `.claude/codex-work/briefs/SPECINDEX-common.md:12-32`, `.claude/codex-work/briefs/SPECINDEX-4-chatbot-app-web.md:5-24`
- **현재 정본**: `docs/design/chatbot-source-of-truth.md:1-109`, `docs/design/screen-behaviors.md:4777-5266`
- **카드 계약/아카이브**: `docs/design/chatbot-card-catalog.md:1-294` — 카드 계약을 확인한다. 정책 충돌은 `docs/design/chatbot-source-of-truth.md:1-5`를 우선하고, 현재 화면 위치·표시 규칙은 `docs/design/screen-behaviors.md:4783-4926`의 `CCARD-*`를 소비
- **결정로그 핵심**: `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4991-5089`(A1~E4, R2, MR2), `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4273-4290`, `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4298-4705`(3-A)
- **3-A 아카이브 원본**: `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:19-46`, `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:48-71`, `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:73-200`, `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:202-237`, `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:256-353`, `.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:390-418`
- **기존 기준선**: `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:12-52`, `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:55-180`, `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:207-264`, `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:266-282`
- **기존 실행 플랜**: `docs/superpowers/plans/2026-07-27-ai-chatbot.md:70-235`(옛 DB), `docs/superpowers/plans/2026-07-27-ai-chatbot.md:1584-2205`(도구), `docs/superpowers/plans/2026-07-27-ai-chatbot.md:2429-3224`(감시·오케스트레이션), `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3284-3675`(티켓), `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5432-5600`(웹), `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5671-5780`(앱), `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5791-6060`(교차), `docs/superpowers/plans/2026-07-27-ai-chatbot.md:6177-6517`(상태 UI), `docs/superpowers/plans/2026-07-27-ai-chatbot.md:7010-7057`(KB)
- **요구사항 원문**: `docs/고객요구사항.txt:339-410`, `docs/고객요구사항.txt:414-453`, `docs/고객요구사항.txt:475-480`, `docs/고객요구사항.txt:492-514`
- **핸드오프 핵심**: `HANDOFF.md:258-265` — 화면보다 신규 테이블 7개·3갈래 체인·인계 감시와 카드 규칙 재사용이 중심임을 확인

## 재작성 순서 제안

1. **정본·규칙 잠금** — `docs/design/chatbot-source-of-truth.md`, `docs/design/chatbot-card-catalog.md`, `docs/design/screen-behaviors.md`의 `CHAT-*`, `CCARD-*`, `WEBANON-*`, `WEBMOD-*`, `NAV-CHATAPP-*`, `LATEFLOW-*`, `RETICKET-*`를 먼저 입력으로 고정한다. 카드 충돌은 `docs/design/chatbot-source-of-truth.md`를 우선한다. 특히 A1/E3/E4, MR2-01~04·08, 긴급 `CHAT-URGENT-EXC-01`, `CHAT-LEN-01`의 미결값을 분리한다.
2. **AI 스펙 재작성** — `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md`의 옛 `chat_conversations`와 `support_tickets` 스키마·상태 전이, 마감 후 취소, 웹 문진, 답변 즉시 종료를 걷어내고, `support_tickets`는 `chat_threads`에 연결된 현재 티켓 모델로 보존·재작성한다. 3-A의 티켓/AI 세션 경계·익명 수신대상·카드 payload·시스템 이벤트를 기준으로 다시 쓴다. A2/A3/B3는 코5 관리자 기능과의 API 경계만 남긴다.
3. **DB·보안·알림 계약** — 플랜 Task 1·3을 통합 스키마 7건과 3-A의 enum/FK/RLS/Realtime/커서 복구/익명 토큰 해시/`notification_log` 공통 dispatcher로 재작성한다. `support_tickets.appointment_id`, `client_message_id`, 열린 티켓·활성 AI 세션·열린 알림 배치의 partial unique를 포함한다.
4. **서비스·상태 전이** — Task 9~12·14를 방문이유·예약 중 상담 모드·응급 예외·3-A 인계 감시·직원 라이브·[상담 종료]·재문의 새 티켓·30분 AI 만료·quick replies 기준으로 재작성한다. 3-A 원자성 수용 조건 12개(`.claude/codex-work/orchestration/3A-schema-requirements-2026-08-13.md:390-405`)를 테스트 목록으로 옮긴다.
5. **환자 채널 구현 계획** — 앱 Task 19와 웹 Task 18을 각각 구현하되 API·카드 판단은 공유한다. 앱은 `CHAT-HISTORY`, FCM/Realtime, QNR 앱 경로를 사용하고 웹은 같은 브라우저 토큰·`WEBMOD-AUTH-08` 재확인·익명 선택 전화/SMS·런처 점·장애 주 CTA를 사용한다. 옛 `QuestionnaireCard` 직접 저장과 전화번호 기반 다른 기기 복원은 넣지 않는다.
6. **교차 검증·인계** — 코3에 문진 상태/문항 대상/예약 변경 연결/이력 경로, 코5에 직원 상담 종료·알림 dispatcher·KB 승인/품질 처리함·취소 대기열 폐지를 전달한다. 마지막으로 아래 옛 표현을 검색해 남은 충돌을 제거한다: `chat_conversations`, `cancellation_requested_at`, `취소 요청이 접수`, `답변완료`(일반 보내기 의미), `QuestionnaireCard`, `is_business_hours`, `다른 기기`.


---

# Part B — 직원 상담·관리자 운영

# SPECINDEX — 상담봇 직원 상담·관리자 운영

작성일: 2026-08-14  
범위: 직원 상담 관리 목업 104~109, 관리자 지식·품질 관리 목업 110~118. 티켓함·티켓 상세·배정·답변·종료, `/today`·캘린더 지원 상태, 지식 승인·이력·제한 문구, 미해결 질문·오답·품질·예시·질문 순위·챗봇 통계를 다룬다.

## 0. 판정 기준과 범위 경계

- 기준 순서는 요구사항 원문 → 최신 결정로그 → `docs/design/chatbot-source-of-truth.md`와 `docs/design/screen-behaviors.md` → 화면 inventory → 옛 스펙/플랜이다. 상담봇 정본은 옛 스펙과 충돌하면 우선한다(`docs/design/chatbot-source-of-truth.md:1-5`). 목업은 구현 진본이 아니며, 목업 109·116·118의 낡은 구조는 대량 갱신하지 않고 아래 폐기 표식만 남긴다(`HANDOFF.md:92-98`).
- 요구사항 3.8은 관리자 지식의 승인 전 비공개·승인·수정 이력과 금지 문구를 요구하고, 3.9는 직원 상담 문의·답변 전달·미해결 목록을 요구한다(`docs/고객요구사항.txt:188-211`).
- 기능·DB·API의 다른 코드 담당은 추적만 하고 이 인덱스에서 구현하지 않는다. 표의 `다른 영역 담당(코N)`은 해당 항목의 실행 주체가 아니다.
- 공통 출력물 규칙: 모든 결정은 원문 줄번호를 붙이고, 기존 스펙/플랜의 영향 위치가 아직 단일 위치로 특정되지 않으면 `대상 미확인`으로 표시한다.

## 1. 기능 갭

| 갭# | 요약 | 현황 | 조치 | 스펙/플랜 영향 |
|---|---|---|---|---|
| G-01 | D4의 `/today` 환자별 상담 행·티켓함 분할 작업공간·캘린더 양방향 이동 | 최신 화면 규칙에는 반영됐지만, 플랜에는 `support_tickets.appointment_id`, `appointments.support_requested_at/request_type`, `/today` 조회, 왕복 내비가 없다. `get_today_summary`는 `pending_inquiries_count: 0` 하드코딩이다. | migration·티켓-예약 FK·원자 상태 전이는 **다른 영역 담당(코2)**과 겹치며, `/today`·문의함·캘린더 화면과 context 복원은 이 영역에서 색인한다. 독립 취소/변경 수치카드는 만들지 않는다. | `HANDOFF.md:114-116`, `HANDOFF.md:156`; `docs/design/screen-behaviors.md:539-544,5292-5307,5480-5504`; `docs/superpowers/plans/2026-07-27-staff-web.md:1810-1928,4032`; `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3284-3610,5791-6042` |
| G-02 | 마감 후 취소·변경 공통 요청 데이터 | 결정된 공통 필드가 아직 `00010_` migration 대기다. 희망 일시는 저장하지 않는다. | `cancellation_requested_at` 대신 `support_requested_at`과 `request_type`을 추가하고, [상담 채팅 연결] 즉시 기록·배지·`/today`·캘린더 ⚠ 조회를 연결한다. 전용 대기열은 되살리지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4188-4191,4255-4259,4273-4276`; `docs/superpowers/specs/2026-07-27-staff-web-design.md:106-117`; `docs/superpowers/plans/2026-07-27-staff-web.md:5403-5425` |
| G-03 | 3-A 통합 스키마 7개 공백 | 기존 `chat_conversations`와 새 `chat_threads`가 분리돼 있고, 카드 payload·예약-티켓 FK·품질 검토 완료 상태·답변 근거 스냅샷·시스템 이벤트·보존기간 계약이 기존 플랜에 일관되게 없다. | 7개 공백을 단일 schema section으로 옮긴 뒤 migration→RLS→서비스 조회 순서로 플랜을 다시 쓴다. 보존기간은 법무 게이트를 별도 표시하고 임의 숫자를 추가하지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4278-4294`; 상세 요구 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4298-4675,4747-4760`; 기존 모델 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:55-143`; 기존 Task 3 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:423-659` |
| G-04 | 티켓 상태·배정·답변·종료 계약이 옛 모델 | 옛 플랜의 `claim_ticket`은 승패를 반환하지 않고, `answer_ticket`은 발송과 동시에 `answered` 처리한다. 최신 결정은 자동 배정 원자성, 정상 발송은 `in_progress` 유지, 별도 `[상담 종료]`만 `answered`다. | `claim_ticket`·`send_message`·`close_ticket`의 DB/API 계약은 **다른 영역 담당(코2)**과 겹치며, 직원 콘솔의 목록 이탈·상태 문구·보내기/종료 화면은 이 영역에서 색인한다. 재문의 새 티켓·종료 후 재개 금지도 재작성한다. | `HANDOFF.md:114`; `docs/design/screen-behaviors.md:5292-5359`; `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3284-3300,3572-3610`; `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:123-143` |
| G-05 | 관리자 품질·미해결 화면의 상태 계약 누락 | HANDOFF가 `QUALITY-REPORT-10/11`, `QAEX-LIST-10`, `UNRES-CLUSTER-04`, `BADRPT`의 로딩·오류·재시도를 누락 후보로 지적했다. 현재 정본 규칙에는 상태가 정리돼 있으므로 플랜·구현 체크리스트의 미반영이 갭이다. | 각 목록의 loading/empty/error/retry, 계약 부재 시 “현재 집계할 수 없음”, 원문 실패 시 수정 금지를 API·화면·테스트에 명시한다. | `HANDOFF.md:77-78`; `docs/design/screen-behaviors.md:5379-5397,5564-5627`; `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3698-4297,5126-5431` |
| G-06 | 승인 자료의 오승인 복구와 제한 문구 검색 격리 | 요구사항은 승인 전 비공개·승인·수정 이력을 요구한다. 제한 주제는 “이 문구만 그대로” 별도 블록으로 보여야 하며, 일반 주제가 함께 검색되면 일반 자료 답변은 유지한다. 질문 전체가 제한 주제일 때만 제한 문구와 직원 연결만 보인다. | 수정 이력에서 이전 버전을 다시 편집하고 재승인하는 경로, 승인·재임베딩 성공 전 기존 승인본 유지, 제한 문구를 생성문·일반 근거와 분리하는 응답 계약을 작성한다. | `HANDOFF.md:262-265`; `docs/고객요구사항.txt:188-200`; `docs/design/chatbot-source-of-truth.md:15`; `docs/design/screen-behaviors.md:5528-5562`; `docs/superpowers/plans/2026-07-27-ai-chatbot.md:785-793` |
| G-07 | 직원·관리자 플랜이 최신 사이드바와 화면 흡수 결정을 모름 | 최신 IA는 상담봇 4번째 그룹이며, 관리자 대시보드는 별도 최상위 메뉴가 아니다. 목업 116은 117에 흡수되고 109는 캘린더 64/65 상태에 흡수됐다. | `SHELL-NAV-01/02/04`, `NAV-ADM`, `BOTSTAT-DASH`, `SUPPORT-CAL-*`를 플랜 라우트·권한·테스트의 기준으로 삼고 옛 메뉴/라우트를 제거한다. | `docs/design/screen-behaviors.md:77-86,5649-5682`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5074-5089`; `docs/superpowers/plans/2026-07-27-ai-chatbot.md:5126-5431,6521-6658` |

### 기능 갭에서 제외하거나 타 코드에 넘기는 항목

- 결정로그 #8 예약 사유, #10 예약 진행 중 채팅 모드, #20 빠른 답변 버튼은 상담봇 환자 앱/웹 채널의 값·대화 UX가 주 담당이다. **다른 영역 담당(코4)**. 이 영역은 직원 티켓에 전달·표시되는 계약만 소비한다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3260-3278,3323-3327`).
- 병원 운영시간 저장·수정과 문자 사용 설정은 직원 웹 설정의 주 담당이다. **다른 영역 담당(코2)**. 상담봇은 `SCHED-HOURS/EXC`를 읽기만 한다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5074-5089`; `docs/design/chatbot-source-of-truth.md:29,83`).
- 역할 포함관계와 전역 감사·권한의 기초는 공통 직원 웹/인증 영역이다. **다른 영역 담당(코2/코3)**. 여기서는 `SHELL-NAV`와 티켓·KB별 접근 규칙만 소비한다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3627-3633`; `docs/design/screen-behaviors.md:104-114`).

## 2. 구조 결정

| 결정 | 내용 | 선정 사유 | 영향 범위 | 우선순위 |
|---|---|---|---|---|
| SD-01 통합 대화 루트 | `chat_threads`가 앱·웹의 하나의 대화 루트가 되고 `chat_messages`가 AI·환자·직원·시스템 이벤트의 단일 시간순 timeline이 된다. AI 세션·지원 티켓은 같은 thread 안에서 경계를 가진다. | 직원이 앱 대화와 인계 이후 답변을 별도 기록으로 보지 않으며, 직원 연결·종료·AI 만료를 시간순으로 복원해야 한다. | DB, message API, Realtime cursor, 직원 상세/채팅 로그, 익명 웹 | P0 |
| SD-02 티켓 생명주기 | `pending → in_progress → answered`; 일반 직원 발송은 종료가 아니고 `[상담 종료]`만 `closed_by/closed_at`과 함께 `answered`로 만든다. 종료 티켓은 재오픈하지 않고 재문의는 새 티켓이다. | “답변 전달”과 “상담 종료”를 분리해야 목록 탭과 환자 알림 상태가 어긋나지 않는다. | `support_tickets`, `send_message`, `close_ticket`, inbox/detail, notifications | P0 |
| SD-03 원자 배정 | 상세 열기가 pending 티켓을 자동 배정한다. 경쟁에서 진 직원은 상세를 보지 않고 목록에 남으며 “이미 다른 직원이 맡았어요”를 본다. 별도 담당지정 버튼은 두지 않고 배정 후 재배정만 허용한다. | 동시 클릭에서 두 직원이 같은 티켓을 조작하는 것을 막고, 최신 D3·R2-3 흐름을 보장한다. | claim API, inbox row, detail, RLS/transaction, tests | P0 |
| SD-04 예약 맥락 직접 연결 | `support_tickets.appointment_id` nullable FK를 두고 `appointments.support_requested_at`·`request_type`으로 취소/변경 요청을 공통 표현한다. 희망 일시는 저장하지 않는다. | 텍스트 요약이나 함수 인자만으로는 어느 예약의 상담인지 보장할 수 없고, `/today`·캘린더·티켓함을 원자적으로 동기화할 수 없다. | migration, staff today/calendar/panel, ticket summary, late-flow | P0 |
| SD-05 익명 수신자 모델 | 익명 웹은 환자 계정으로 자동 매칭하지 않는다. 동일 브라우저 token으로만 이어보고, 전화번호는 선택적 SMS 수신대상으로 암호화 보관한다. | 다른 기기 자동 이어보기와 환자 개인정보 혼입을 막는다. | `chat_threads`, anonymous contact, notification dispatcher, RLS | P0 |
| SD-06 근거·카드·시스템 이벤트 보존 | 카드 메시지는 `message_type + payload` 버전 스냅샷을 보존하고, 답변 근거는 당시 chunk/title/body snapshot을 보존한다. 시스템 경계는 `chat_events` 또는 system message로 남긴다. | 지식 재임베딩·문구 수정 뒤에도 과거 답변과 직원 인계 사유를 재현해야 한다. | messages, sources, KB re-embed, QA/quality detail, audit | P1 |
| SD-07 알림 배칭 | 연속된 직원 답변의 미읽음은 한 배치로 묶고 확인 전 새 알림을 만들지 않는다. 로그인 환자와 익명 전화 수신자는 공통 recipient abstraction과 동일 `notification_log`/재시도 계약을 쓴다. | 직원 발송 여러 건이 환자에게 알림 폭탄이 되는 것을 막고, 재시도 중복을 제거한다. | notification batch/log, patient/anonymous delivery, staff reply | P1 |
| SD-08 품질 검토 상태 | 오답 신고가 없어도 상담 단위에 “검토 완료”를 저장할 수 있어야 하며, 미검토 우선·최신 우선 정렬을 계약한다. 품질 교정은 바로 KB 공개가 아니라 bad inbox를 거쳐 승인한다. | “문제없음”과 “아직 안 봄”을 구분하고, 품질 리뷰의 승인 관문을 유지한다. | quality review, bad inbox, KB revision/approval, dashboard | P0 |
| SD-09 보존·파기 | 3-A 통합 스키마의 6개 데이터군과 익명정보·알림·읽음 상태의 보존 정책은 확정 결정으로 기록하되, 법적 근거와 직원 웹 #14와의 정합을 별도 게이트로 둔다. | 구현자가 의료·개인정보 법정기간을 임의로 정하면 안 된다. | retention job, DB policy, audit, legal review | P1 / 법무 게이트 |

근거: `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4308-4315,4330-4675,4747-4760`; `docs/design/screen-behaviors.md:5292-5359`; `docs/고객요구사항.txt:337-370,414-453,492-514`.

## 3. 화면 설계 결정

| 묶음 | Rule ID | 핵심 선택 | 관련 갭 | 근거 |
|---|---|---|---|---|
| 셸/권한 | `SHELL-NAV-01/02/04`, `NAV-ADM-*` | 직원·관리자 사이드바는 업무/기록/설정/상담봇의 canonical 4그룹. 진료 화면은 standalone이고 관리자는 진료 화면을 갖지 않는다. 축소형 사이드바는 없다. | G-07 | `docs/design/screen-behaviors.md:77-86,5669-5682`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5086` |
| 티켓함 | `TICKET-INBOX-TAB-01`, `TICKET-INBOX-ROW-01`, `TICKET-INBOX-ORDER-02`, `TICKET-INBOX-LOAD/ERR/LIVE` | 왼쪽 목록+오른쪽 넓은 작업공간 분할. 선택은 자동 배정·상태 전이를 한 원자 동작으로 하고, 순서는 `created_at ASC, id ASC`다. 경쟁 패자는 목록에 남는다. | G-01, G-04 | `docs/design/screen-behaviors.md:5292-5307`; D2/D3 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5032-5072` |
| 티켓 상세 | `TICKET-DETAIL-LAYOUT-01`, `TICKET-DETAIL-SUM-01/02`, `TICKET-DETAIL-ASSIGN-02`, `TICKET-DETAIL-REPLY-*`, `TICKET-DETAIL-CLOSE-SEP-01` | 배정→인계 요약 5항목→전체 대화→답변 입력/보내기→별도 `[상담 종료]`. 요약은 환자 질문·확인 정보·이미 안내한 내용·미해결 이유·직원 확인 사항을 모두 표시하고 값이 없으면 만들어내지 않는다. 보내기 성공은 `in_progress`이고 실패는 입력을 보존한다. 답변 전용 버튼과 최초 담당지정 전용 버튼은 없다. | G-04, G-05 | `docs/design/screen-behaviors.md:5313-5315,5321,5327-5353`; `HANDOFF.md:77,94,114`; `docs/고객요구사항.txt:393-401`; old targets `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:255-287`, `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3284-3300` |
| 오늘/캘린더/패널 | `TODAY-RESCHED-23~28`, `SUPPORT-TODAY-*`, `SUPPORT-CAL-*`, `SUPPORT-PANEL-*` | 독립 취소/변경 수치카드 대신 `/today`의 “확인 필요한 예약” 환자별 행에 상담·변경 상태를 통합한다. 캘린더 ⚠와 기존 패널이 예약 처리를 담당하며, 티켓함은 전체 대화용이다. 선택한 ticket/calendar context를 양방향 복원한다. ⭐ **화면 구현은 직원웹 Task 14가 소유**한다(`SUPPORT-CAL-*` 14개 — 2026-08-15 정리). 이 플랜은 **티켓 쪽 계약만** 갖는다. ⏳ **단, `SUPPORT-CAL-DUP-01`(한 예약에 상담 기록이 여럿일 때 ⚠ 대표 선정)은 여기서 정한다** — `support_tickets` 상태·담당 모델에 달려 있다. 원장 `spec-index/HANDOVERS.md`, `plan-prefix-check.py`가 받을 때까지 경고한다 | G-01, G-02 | `docs/design/screen-behaviors.md:539-544,5417-5478`; `HANDOFF.md:156`; D4 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5032-5072` |
| 지원 내비 | `NAV-STFSUP-02/08/13/14` | today→calendar→panel, today→ticket inbox, ticket detail→calendar를 오갈 때 같은 티켓·예약 context와 목록 필터/스크롤을 복원한다. dedicated `/cancellation-requests`는 없다. | G-01, G-02 | `docs/design/screen-behaviors.md:5480-5504`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4228-4253` |
| KB 목록/편집/이력 | `KBADM-LIST-*`, `KBADM-EDITOR-03~17`, `KBADM-HISTORY-*` | draft 저장은 비공개. 승인 시 re-chunk/re-embed가 성공하기 전 기존 승인본을 유지한다. 이전 버전 수정은 새 승인 필요하고 이력은 남긴다. | G-06 | `docs/design/screen-behaviors.md:5514-5562`; `docs/고객요구사항.txt:188-200`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4995-5008` |
| 제한 답변 | `KBADM-EDITOR-03/04` | 체크박스 문구는 정확히 `상담봇이 직접 답변하지 않고 이 문구만 그대로 보여줍니다`. 제한 문구는 봇 생성 텍스트 밖 별도 블록이며, 일반 자료와 함께 걸리면 일반 주제는 답하고 제한 주제만 원문으로 표시한다. 질문 전체가 제한이면 그 문구와 `[직원 연결]`만 보인다. | G-06 | `docs/design/screen-behaviors.md:5532-5536`; `docs/design/chatbot-source-of-truth.md:15`; `HANDOFF.md:262-265` |
| 미해결/오답 | `UNRES-CLUSTER-04`, `UNRES-CLUSTER-07~11`, `BADRPT-*` | 자동 클러스터는 질문을 섞을 수 있다는 안내를 표시한다. 0건과 계약 부재를 구분하고, 빈 상태·로딩·오류·재시도·원문 실패를 각각 둔다. 오답 교정은 bad inbox/KB 승인 흐름으로 간다. | G-05, G-06 | `docs/design/screen-behaviors.md:5379-5397,5564-5595`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4275-4276` |
| 품질/예시 | `QUALITY-REPORT-02/04/05~12`, `QAEX-LIST-10` | 품질 목록+우측 상세 패널(B3)을 쓰며, 20건 단위·미검토 우선. 품질 교정은 `quality_review`로 bad inbox에 보내고 적용/반려 후 KB 승인한다. 원문을 못 읽으면 수정하지 않는다. | G-05, G-06 | `docs/design/screen-behaviors.md:5597-5627`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5010-5020` |
| 순위/통계 | `QTOP-RANK-*`, `BOTSTAT-DASH-*` | 성공 여부와 관계없이 질문을 집계하되 클러스터 혼합 가능성을 표시한다. 앱/직원/챗봇 비율을 분리하고, 유효한 0과 계약 부재를 구분한다. CSV·드릴다운·마스킹·감사 로그를 제공한다. | G-03, G-05 | `docs/design/screen-behaviors.md:5629-5666`; `docs/design/chatbot-source-of-truth.md:36,82,98` |
| MR2 흡수 | `AD-069`, `TICKET-DETAIL-LAYOUT-01`, `SUPPORT-CAL-*` | MR2-06의 mockup 116은 117 dashboard에 흡수, MR2-09는 상세 레이아웃/종료 분리, MR2-10의 mockup 109는 캘린더 64/65 상태에 흡수한다. | G-07 | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5074-5089`; `docs/design/screen-behaviors.md:5313,5435-5454` |

## 4. 결정로그의 기존 미체크 항목과 처리 상태

| 줄 | 항목 | 상태 | 필요 조치/담당 경계 |
|---|---|---|---|
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3214,4275` | #6 마감 후 취소·변경 공통 요청 칸 / E3 migration | 기능 갭과 체크박스 모두 미체크. 화면 규칙은 확정됐지만 migration/API가 대기 | G-02로 플랜·migration에 반영. 직원 today/calendar 소비 계약은 이 범위. |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4273-4276` | `00010_` E3 + 품질 bad inbox `source=quality_review` | 미체크 | E3 migration, B3 source·조회·표시·상태를 함께 반영. |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3260-3264` | #8 예약 사유 | `- [ ]` 미체크/다른 영역 | **다른 영역 담당(코4)**. 직원 티켓/예약 상세에 값이 전달되는 필드만 계약 확인. |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3272-3277` | #10 예약 진행 중 채팅 모드 | `- [ ]` 미체크/다른 영역 | **다른 영역 담당(코4)**. 직원 인계 시 action tool을 만들지 않는 E4 경계만 유지. |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3326-3330` | #20 챗봇 빠른 답변 | `- [ ]` 미체크/다른 영역 | **다른 영역 담당(코4)**. 직원 콘솔의 빠른 답변 UI로 확장하지 않는다. |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4796-4801` | #25 전용 취소요청 대기열 폐지에 따른 문서 정리 | 미체크 | 직원 스펙 섹션 10 삭제, 직원 플랜 Task 16 폐기/재작성, AI 스펙의 대기열 문구 제거. |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4806-4807` | #26 마감 후 변경 분기 / #28 상담 버튼 문구 | 미체크/다른 영역 혼합 | 환자 앱 문서가 주 대상(**다른 영역 담당(코4)**). 직원은 `request_type`과 `[상담 채팅 연결]` 결과를 소비. |
| `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3627-3633` | #114 역할 포함관계 | 미체크/공통 | **다른 영역 담당(코2/코3)**. 이 인덱스는 `SHELL-NAV`와 티켓·KB 권한 표만 링크한다. |

주의: 3-A 통합 스키마 공백 7건은 체크박스가 아니라 “플랜 재작성” 표로 기록돼 있다. 따라서 미체크 항목과 별개로 G-03·SD-01~09의 구현 계약으로 추적한다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4278-4294`).

### 후반 결정 전수 경계

공통 브리프가 요구한 후반 결정은 담당 여부를 명시적으로 판정했다. 아래에서 `다른 영역 담당(코N)`은 이 인덱스의 구현 대상이 아니며, 현재 결정로그 해당 절에 개별 항목이 없는 번호는 `대상 미확인`으로 남긴다(`.claude/codex-work/briefs/SPECINDEX-common.md:28-29`).

| 결정군 | 이 영역 판정 | 스펙/플랜 영향 또는 근거 |
|---|---|---|
| AD-050 | **다른 영역 담당(코2/코3)** — 관리자 문진 답변 비열람. 챗봇 KB/품질 화면은 환자 문진 답변을 소비하지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3121,3178`; 현재 권한 규칙 `docs/design/screen-behaviors.md:1591`; 직원 환자상세 범위 `docs/superpowers/specs/2026-07-27-staff-web-design.md:69-75` |
| AD-051 | **다른 영역 담당(코2/코4)** — 예약 자동확정 기본값. 상담봇 통계는 예약 유입원 값을 소비할 뿐 설정을 소유하지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3179`; `docs/design/screen-behaviors.md:1327,2375` |
| AD-055 | **다른 영역 담당(코2/코3)** — 직원 세션 무활동 30분. 상담봇 운영 화면은 공통 로그인 복귀만 소비한다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3124`; `docs/design/screen-behaviors.md:2318-2323,5495` |
| AD-059 | **다른 영역 담당(코2/코3)** — 가족 연결 본인확인 자동분기. 환자 상세의 상담 문의 카드는 가족 연결 권한을 만들지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3174-3189`; `docs/design/screen-behaviors.md:1568` |
| AD-062~064 | **다른 영역 담당(코3)** — 의사 콘솔 열 너비·의사 메모·진료문구. 챗봇은 의사 소개 원본만 읽고 진료 콘솔을 수정하지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3180-3182`; `docs/design/screen-behaviors.md:1717-1814` |
| AD-065~066 | **다른 영역 담당(코2/코3)** — 문진 버전 불변성·식별. 관리자 챗봇 KB 이력과 문진 템플릿 이력을 섞지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3183-3184`; `docs/design/screen-behaviors.md:1988-2062` |
| AD-067~068 | **다른 영역 담당(코2/코3)** — 자동 알림 토큰·알림 정책 위치. 직원 답변 알림의 배칭/로그는 SD-07로 소비하지만 문자 설정 UI는 소유하지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3185-3186`; `docs/design/screen-behaviors.md:2354-2390` |
| AD-069 | **이 영역 포함** — 직원웹 canonical sidebar와 상담봇 그룹. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3187,5086`; `docs/design/screen-behaviors.md:83-86` |
| AD-070~071 | AD-070은 **공통 셸 토큰 담당(코2/코3)**, AD-071은 반영 감사 메타기록이다. 상담봇 화면은 공용 밀도 토큰을 소비하고 별도 토큰을 만들지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:3188-3189`; 공용 셸 대상 `docs/design/screen-behaviors.md:77-86`. 별도 old spec/plan target은 **대상 미확인**. |
| AD-052~054, AD-056~058, AD-060~061 | `active-ledger.md:113~132`에서 확인 완료 — 전부 **감사 사이클 진행기록**(감사 착수·판정, 워커 모델 운용, 작업본 배정)이며 새 설계 결정이 아니다. | **스펙 영향 없음.** git 결정로그가 AD-051→AD-062로 건너뛴 것은 의도된 처리(진행기록 미승격). 알맹이 있는 두 건은 이미 git 정본에 반영됨: AD-055 #27 세션 30분=결정로그:3124, AD-059 가족 자동분기=`screen-behaviors.md` `PTDET-FAMILY-03`:1568. |

| 결정군 | 이 영역 판정 | 스펙/플랜 영향 또는 근거 |
|---|---|---|
| 역대조-1 | **다른 영역 담당(코4)** — 앱 긴급 분류 실패 문구. 직원 콘솔은 완성된 안전 문구를 소비하지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5038`; `docs/design/screen-behaviors.md:5037` |
| D2/역대조-2 · D3/역대조-3 · D4/역대조-4·4B | **운영화면은 이 영역 포함, DB/API는 다른 영역 담당(코2)** — 티켓 접수순·원자 자동배정·`/today` 환자 행·분할 작업공간·양방향 내비. 본문 G-01/G-04와 화면 표에서 처리. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5039-5041,5045`; `docs/design/screen-behaviors.md:5294,5488-5497` |
| 역대조-5 | **이 영역 포함** — 기존 예약 패널 닫기 `✕`는 처리 완료가 아니다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5042`; `docs/design/screen-behaviors.md:5478` |
| 역대조-6 | **다른 영역 담당(코4)** — 앱 마감 후 연결 처리 중 잠금. 직원 화면은 서버 결과와 상태만 소비한다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5043`; `docs/design/screen-behaviors.md:4972-4975` |
| 역대조-7 | **이 영역 포함** — 관리자 안내자료·미해결·질문순위에 새 검색을 만들지 않고 필터·스크롤만 복원한다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5044`; `docs/design/screen-behaviors.md:5526,5572-5573,5641` |

| 결정군 | 이 영역 판정 | 스펙/플랜 영향 또는 근거 |
|---|---|---|
| R2-0·R2-1·R2-2·R2-5 | **다른 영역 담당(코4/공통 디자인)** — 오류색·환자 카드 레이아웃·빠른답변·문진 표현. 직원/관리자 화면은 결과 상태만 소비한다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5014-5017,5020`; 빠른답변 경계 `docs/design/chatbot-source-of-truth.md:13` |
| R2-3 | **이 영역 포함** — 직원/관리자 상세는 전체 화면이 원칙이며, 티켓함 분할 화면·품질 패널은 명시적 예외다. 복귀 시 검색 가능한 목록의 필터/검색어/스크롤을 복원하고, 검색 없는 세 관리자 목록은 필터/스크롤만 복원한다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5017,5030`; `docs/design/screen-behaviors.md:5313,5480-5504,5526,5572,5641` |
| R2-3A | **운영화면은 이 영역 포함, 생명주기·DB/API는 다른 영역 담당(코2)과 겹침** — 직원 연결 후 같은 상담방 timeline, 30분 AI 만료, 별도 종료, 재문의 새 티켓, 알림 배칭. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5018,5026-5028`; `docs/design/screen-behaviors.md:5316-5354` |
| R2-4 | **이 영역 포함** — 품질 리포트 목록+우측 패널, 미검토 우선·20건, B3 처리함 이동. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5019`; `docs/design/screen-behaviors.md:5597-5612` |

| 결정군 | 이 영역 판정 | 스펙/플랜 영향 또는 근거 |
|---|---|---|
| MR2-01 | **이 영역 포함/공통** — 익명 직원 상담의 same-browser token·선택 전화번호 SMS만 유지하고 다른 기기 이어보기는 만들지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5080`; `docs/design/screen-behaviors.md:5346-5348`; SD-05 |
| MR2-02~04 | **다른 영역 담당(코4)** — 이전 상담 진입·인증 후 재확인·예약 의사 선택. 직원/관리자 콘솔에는 새 예약 UX를 만들지 않는다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5081-5083`; 챗봇 직원 화면은 `docs/design/chatbot-screen-inventory.md:65-93` 범위만 소비 |
| MR2-05 | **다른 영역 담당(코2)** — 운영시간 편집 폐기, 직원웹 시간 원본을 상담봇이 읽기만 한다. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5084`; `docs/design/chatbot-source-of-truth.md:29,83` |
| MR2-06·07·09·10 | **이 영역 포함** — 116→117 흡수, AD-069 사이드바, 티켓 상세 send/close 분리, 109→64/65 캘린더 흡수. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5085-5089`; `docs/design/screen-behaviors.md:5313,5435-5454` |
| MR2-08 | **다른 영역 담당(코4)/플랜 연계** — `CHAT-LEN-01` UX 넛지는 챗봇 채널 공통이고 실제 한도·요약/절단 계약은 AI 플랜 재작성 대상. | `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5087`; `docs/design/screen-behaviors.md:4824`; 실제 한도 플랜 target은 **대상 미확인** |

## 5. 폐기·대체 결정

| 폐기 대상 | 삭제/수정 위치 | 대체 결정과 근거 |
|---|---|---|
| 전용 `/cancellation-requests` 대기열 | `docs/superpowers/specs/2026-07-27-staff-web-design.md:106-117`; `docs/superpowers/plans/2026-07-27-staff-web.md:5403-6127`; AI 스펙의 late cancellation 대기열 문구 `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:180-265` | 새 화면은 0개. `/today` 환자 행, 캘린더 ⚠+기존 패널, 상담 문의함으로 역할을 나눈다. 동일 요청이 두 큐에 중복되는 문제 때문이다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4228-4253`). |
| `cancellation_requested_at` 단일 취소 필드 | `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:229-245`; `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3284-3300`; `docs/superpowers/plans/2026-07-27-staff-web.md:5403-5425`의 기존 필드·서비스 참조 | `support_requested_at + request_type` 공통 구조. 희망 일시는 저장하지 않는다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4188-4191`). |
| 독립 취소·변경 수치카드 | 직원 스펙 today 절 `docs/superpowers/specs/2026-07-27-staff-web-design.md:29-37,106-117`; 직원 플랜 `docs/superpowers/plans/2026-07-27-staff-web.md:1810-1928,5843-5880` | **독립 `취소 요청 N`·`변경 요청 N` 카드는 폐기**하고 `/today` 환자별 행으로 통합한다. 일반 pending 상담의 `확인 필요 상담 문의` count는 유지한다. 이는 “수치카드 전면 폐기”라는 HANDOFF 요약을 독립 취소/변경 카드 폐기로 구체화한 최신 규칙 해석이다(`HANDOFF.md:115-116,156`; `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5041`; `docs/design/screen-behaviors.md:5421-5427,5430`). |
| 옛 3그룹/관리자 최상위 사이드바 | old spec/plan route·mockup의 `SHELL-NAV` 참조 | `AD-069`, `SHELL-NAV-01/02/04` 4그룹으로 통일. 목업 30장 일괄 수정은 하지 않고 낡음 표식만 유지한다(`HANDOFF.md:92-98`; `docs/design/screen-behaviors.md:77-86`). |
| mockup 116 독립 대시보드 | mockup 116 및 별도 top-menu/route 계획 | mockup 117 dashboard에 흡수, 별도 top menu를 만들지 않는다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5085`). |
| mockup 109 독립 상담 화면 | mockup 109 및 독립 route 계획 | 캘린더 64/65의 `SUPPORT-CAL-*` 상태로 흡수한다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5083-5089`; `docs/design/screen-behaviors.md:5435-5454`). |
| mockup 118 운영시간 편집 | mockup 118의 편집 UI | 직원 웹 `SCHED-HOURS/EXC`가 단일 source; 상담봇 관리자 화면은 읽기 전용이다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5084`; `docs/design/chatbot-source-of-truth.md:29,83`). |
| `answer_ticket` 한 번으로 발송=종료 | `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3284-3300,3572-3610`; old AI spec `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:123-143` | `send_message`와 `close_ticket` 분리. 정상 발송은 `in_progress`, 별도 종료만 `answered`다(`docs/design/screen-behaviors.md:5313-5331`). |
| 품질 화면에서 즉시 KB 적용 | old quality implementation `docs/superpowers/plans/2026-07-27-ai-chatbot.md:3698-4297` | B3: quality review → bad inbox → 적용/반려 → KB editor 승인/re-embed. |
| 익명 웹 다른 기기 이어보기 | MR2-01 관련 old web/chatbot flow | same-browser token만 유지하고 전화번호는 SMS용 선택 입력이다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:5080`; `docs/design/chatbot-source-of-truth.md:7-15`). |

## 6. 연결 문서와 재작성 순서

### 필수 연결 문서

1. 요구사항: `docs/고객요구사항.txt:188-224,337-370,414-453,475-514`.
2. 결정 정본: `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4188-4294,4995-5089` 및 3-A 상세 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4298-4675`.
3. 화면 정본: `docs/design/screen-behaviors.md:5292-5682`.
4. 챗봇 해석·source-of-truth: `docs/design/chatbot-source-of-truth.md:3-15,17-41,69-107`.
5. 화면 목록·흐름: `docs/design/chatbot-screen-inventory.md:65-114`.
6. 기존 챗봇 스펙/플랜: `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md:55-368`; `docs/superpowers/plans/2026-07-27-ai-chatbot.md:423-659,785-793,3284-4297,4934-7009`.
7. 직원 today/환자 상세/폐기 큐 플랜: `docs/superpowers/plans/2026-07-27-staff-web.md:1810-1928,2635-2898,4032,5403-6127,7518-7578`.
8. 작업 순서와 누락 판정: `HANDOFF.md:34-47,77-83,92-116,156,262-265`.

### 권장 재작성 순서

1. **결정 정본 고정** — G-01~G-07, SD-01~09, 폐기 목록을 AI 챗봇 spec/plan의 상단 계약으로 옮긴다.
2. **DB/migration** — 통합 thread/message/ticket 모델, `appointment_id`, E3 공통 요청 필드, 품질 검토 상태, source snapshot, system event, 익명 수신자, notification batch를 한 migration 계열로 정리한다.
3. **서버 계약** — 원자 claim 승패, `created_at,id` 정렬·pagination, ticket lifecycle, calendar/today 조회, loading/error/contract-absent 응답, 승인·re-embed transaction을 작성한다.
4. **직원 화면** — inbox split workspace, detail send/close 분리, today patient-row, calendar/panel, 양방향 context 복원을 반영하고 old cancellation queue route/task를 제거한다.
5. **관리자 화면** — KB draft/approval/history/restricted, unresolved, bad inbox, quality B3, examples, ranking, dashboard를 상태별로 재작성한다. mockup 116/109/118은 독립 화면으로 되살리지 않는다.
6. **권한·알림·감사** — `SHELL-NAV` role matrix, 환자/익명 알림 배칭, source/audit/마스킹을 연결한다. 전역 권한 기초는 **다른 영역 담당(코2/코3)**으로 넘긴다.
7. **검증** — 모든 rule ID를 플랜에 연결하고, 각 목록의 0/loading/error/retry/contract-absent, race loser, close separation, no duplicate queue, source failure, restricted-only response를 API·화면 테스트로 확인한다.

### 대상 미확인 목록

- 기존 AI 플랜 Task 5의 KB 함수 계약은 `docs/superpowers/plans/2026-07-27-ai-chatbot.md:785-793`으로 확인했다. 다만 승인 transaction의 실제 migration 파일·RLS 정책·API route는 현재 플랜에 별도 구현 파일로 고정되지 않아 해당 세부 target은 **대상 미확인**이다.
- 3-A 통합 스키마의 실제 migration 파일명·API 라우트명은 결정로그가 요구사항만 확정하고 구현 파일을 만들지 않았으므로 **대상 미확인**이다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4302-4304`).
- 품질 검토 상태의 구체 테이블/enum 이름은 **대상 미확인**이다. `answer_feedback`을 그대로 확장할지 상담 단위 review table을 둘지는 플랜 재작성에서 SD-08과 함께 결정한다(`docs/superpowers/specs/2026-07-31-ui-design-decisions.md:4287`).

## 7. 미결·충돌 요약

이 색인은 최신 결정과 폐기·대체 내용을 반영한 현재 기준표다. 다만 아래 항목은 아직 구현 완료나 원문 정합화가 끝나지 않았으므로 미결 상태로 유지한다. ⚠️ 여기서 "미결"은 **결정 미결이 아니라 스펙·플랜 재작성·구현 단계에서 확정할 것**(migration 파일명·API·enum·필드명)과 **아직 안 지운 옛 레거시 문서**를 뜻한다. 결정로그 상 결정은 모두 완료됐다.

### 원문 간 충돌 — 최신 정본 우선

| 항목 | 현재 정본 | 충돌하는 옛 문서·계약 | 상태 |
|---|---|---|---|
| 취소요청 대기열 | `/cancellation-requests` 폐지, `/today`·캘린더 패널·상담함으로 분리 | 옛 staff/AI spec·plan의 전용 대기열 | 폐기 표시만 완료, 옛 문서 재작성 필요 |
| 취소 데이터 | `support_requested_at + request_type`, 희망 일시 미저장 | `cancellation_requested_at` 단일 필드 | 대체 결정 완료, migration/API 미완료 |
| 답변·종료 | 일반 `[보내기]`는 `in_progress`, `[상담 종료]`만 `answered` | 옛 `answer_ticket`의 발송=종료 | 폐기 표시 완료, 플랜 재작성 필요 |
| 품질 교정 | `quality_review → bad inbox → 반영/반려 → KB 승인` | 옛 플랜의 즉시 KB 적용 | 폐기 표시 완료, review 저장 모델 미확정 |
| 익명 재방문 | same-browser token만 유지, 전화번호는 선택 SMS | 전화번호 기반 다른 기기 이어보기 | 폐기 표시 완료 |

### 구현 대상 미확인

- 3-A 통합 schema의 migration 파일명, RLS 정책, API route가 없다.
- `support_tickets.appointment_id`, `appointments.support_requested_at/request_type`의 실제 migration target이 없다.
- quality review 상태를 `answer_feedback`에 둘지 별도 상담 단위 table/enum으로 둘지 정해지지 않았다.
- KB 승인·재임베딩 transaction의 실제 migration/RLS/API target이 없다.
- MR2-08의 실제 메시지·토큰 한도와 요약/절단 방식이 정해지지 않았다.
- AD-052~054, AD-056~058, AD-060~061은 `active-ledger.md:113~132` 대조 결과 감사 진행기록으로 확인됨 — 스펙 영향 없음(위 §4 후반결정 표 참조). AD-059의 알맹이(가족 자동분기)는 `screen-behaviors.md:1568`에 이미 반영됨.
- 옛 `/cancellation-requests` route와 Task 16의 실제 삭제 target이 단일 파일로 특정되지 않았다.

### 해석으로 남은 부분

- 독립 `취소 요청 N`·`변경 요청 N` 카드를 폐기하고 일반 pending 상담 count를 유지한다는 것은 최신 화면 규칙에 맞춘 색인의 구체화 해석이다. HANDOFF의 “수치카드 전면 폐기”와 문구를 다시 정합화할 필요가 있다.
- SD-09의 3-A 보존 6개 데이터군은 확정됐지만, 읽음 상태를 별도 보존 클래스로 정의한 원문은 없다.
- G-05의 옛 플랜·구현 체크리스트 미반영은 누락 후보로는 확인되지만, 모든 플랜 체크리스트를 원문 줄 단위로 입증한 것은 아니다.

따라서 이 색인은 **최신 정본·폐기 결정·미결 사항을 함께 기록한 색인**이며, 위 target과 충돌이 해결되기 전에는 구현 완료 기준으로 사용하지 않는다.
