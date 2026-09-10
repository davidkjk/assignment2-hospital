# 상담봇 답변 스트리밍(실시간 채널 밀기) — 설계

- 작성일: 2026-09-09
- 상태: 설계 확정(사용자 승인 2026-09-09) → 구현 계획(writing-plans) 대기
- 관련 메모리: [[project-chatbot-disconnect-not-timeout-streaming]]

## 1. 문제와 근본원인 (실측)

상담봇 답변이 "자주 끊긴다"는 증상. systematic-debugging으로 규명(2026-09-09, 실측 재현):

- **끊김의 정체는 "긴 요청 × 불안정한 모바일 연결"이지, 서버/프록시 타임아웃 버그가 아니다.** 같은 질문을 Railway 직접(14.95s)·Vercel 중계(13.82s) 둘 다 HTTP 200으로 깨끗이 완료. 3층 절단점 전수 확인 결과 **어디에도 자르는 코드가 없음**:
  - 백엔드: timeout 미설정(`backend/app/integrations/langchain_client.py`, max_tokens=2048만).
  - Vercel 중계: 120초 한도(외부 rewrite, `webchat/vercel.json`) — 14초는 여유.
  - 브라우저 fetch: abort/timeout 없음(`webchat/src/api/webchatApi.ts:81`).
- **지연 ~14초는 진짜다.** 원인 = 한 답변에 sonnet-5를 3~4회 순차 호출(안전분류 escalation + 라우팅/이해기 + RAG 생성; 후속질문이면 `rewrite_standalone` 1회 추가 `chat_flow_service.py:137`). 전 호출이 `get_chat_model()` 단일심, 기본 `claude-sonnet-5`(`config.py:38`).
- **답변 텍스트(=흘릴 수 있는 것)는 맨 마지막 RAG 호출에서만 생성된다**(`orchestrator.py` 순서: 안전 watchdog → escalation → intent 사전확인 → 라우팅 → **마지막** rag/agent/intent 답변). 앞 ~8초(escalation+라우팅)엔 흘릴 토큰이 없으므로, 그 구간엔 별도 "생각 중" 신호로 연결을 살려야 한다.

**결론:** 끊김을 없애는 정답은 "요청을 오래 붙들지 않는 것" = 답을 **긴 HTTP 요청이 아니라 실시간 채널로** 전달. 부수 효과로 첫 글자가 1~2초에 흐르는 체감 속도 개선.

## 2. 결정: 실시간 채널 push (기각안 포함)

사용자 결정(2026-09-09): **접근 2 — 이미 있는 실시간 채널로 밀기.**

- **기각 — HTTP 스트리밍(SSE)**: 여전히 긴 요청을 붙들고 있고(흐르긴 함), 두 클라이언트가 각각 스트림 파서를 새로 만들어야 함. 앞 8초 keepalive 별도 필요.
- **기각 — keepalive만**: 가장 작지만 "첫 글자 빨리"(체감 속도) 개선 없음. 여전히 14초 뒤 한 번에.
- **채택 이유**: `chat-typing:<threadId>` broadcast 채널이 **이미 webchat·환자앱 둘 다에 구독되어 있고**(presence/typing), 익명 webchat도 broadcast는 동작함(RLS 테이블 구독은 익명 불가). 긴 HTTP 요청 자체를 제거해 끊김의 근본을 없앰. 기존 "직원 입력 중" UX를 "AI 답하는 중"으로 재사용.

## 3. 아키텍처

### 3.1 데이터 흐름 (바뀐 뒤)

```
POST /chat/messages
  1. 사용자 메시지 저장(멱등: on conflict do nothing) + record_ai_activity
  2. 새로 저장됐으면(중복 아님) 생성 백그라운드 태스크 시작(asyncio.create_task)
  3. HTTP 즉시 반환: { accepted, threadId, userMessageId, gen }   ← ~1초
        │
        └─(백그라운드 태스크, 요청 수명과 분리)────────────────────────
             a. 채널로 bot_typing {on:true} emit (즉시)
             b. orchestrate() 실행(안전·라우팅 무변경)
             c. rag 생성 경로면 astream으로 조각 → bot_delta {gen,seq,text} emit
             d. 완료: 봇 메시지 DB 저장(지금과 동일 chat_flow 로직) +
                bot_done {gen, messageId, routeTaken, card} emit + bot_typing off
```

- **발행 통로**: 백엔드 service_role Supabase 클라이언트(`app/db/admin_client.py`)로 `chat-typing:<threadId>` 채널에 broadcast send. (백엔드→realtime 발행은 신규 능력.)
- **진실의 원천은 DB**: 실시간은 빠른 전달 경로일 뿐. 봇 답은 지금처럼 `chat_messages`(sender_type='bot')에 저장되므로, 실시간을 놓쳐도 재조회로 복구.

### 3.2 채널 이벤트 프로토콜 (both 클라 의존 계약)

기존 채널 `chat-typing:<threadId>`에 이벤트만 추가(**새 채널 금지** — "한 토픽 2채널=한쪽 유실" 규칙, `chat_repository.dart:165`).

| event | payload | 의미 |
|---|---|---|
| `bot_typing` | `{ on: bool }` | AI 답변 생성 중(점 세 개). 기존 typing UX 재사용 |
| `bot_delta` | `{ gen, seq, text }` | 답 텍스트 조각(델타). `gen`=답변 1건 식별 uuid, `seq`=순서. 클라가 누적 |
| `bot_done` | `{ gen, messageId, routeTaken, card }` | 완료. 최종 텍스트·카드는 이 이벤트/ DB가 정본. 스트리밍 텍스트를 최종본으로 확정 |

- `gen`으로 오래된/교차 답변 조각을 구분·폐기. 스트리밍 안 하는 빠른 경로(emergency·handoff·intent DB답·department_guide 카드·agent 예약)는 `bot_typing on` → (델타 없음) → `bot_done`으로 균일 처리.

### 3.3 백엔드 컴포넌트 (공통, 한 번)

- **`realtime_broadcast` (신규, 얇게)**: service_role로 채널에 이벤트 emit. 실패는 삼킴(best-effort — 발행 실패가 DB 저장/응답을 막지 않음).
- **`chat_flow_service` 변경**: `handle_message`를 (1) 사용자 저장+태스크 기동 (2) 백그라운드 `_generate_and_emit`로 분리. 태스크는 **자체 풀 커넥션**을 획득(요청 스코프 커넥션에 의존하지 않음 — 요청이 끊겨도 안전). 봇 메시지 저장 로직(현행 214~294행)은 태스크 안으로 이동, 반환 대신 `bot_done` emit + DB 저장.
- **`rag_service` 변경**: 최종 답 생성을 `ainvoke` → `astream`으로. 조각 콜백을 받아 `bot_delta` emit. astream 미지원/실패 시 `ainvoke` 폴백(1회 whole).
- **무변경**: `safety_watchdog`(앞단 결정적 응급/의료 게이트), `chat_router`/`conversation_understanding`(분류), 멱등키(`clientMessageId`).

### 3.4 클라이언트 컴포넌트

- **webchat(②, 검증 트랙)**: `chat-typing:<threadId>` 채널에서 `bot_typing`/`bot_delta`/`bot_done` 수신 → 대기 봇 말풍선에 델타 누적 렌더 → done에 카드 렌더. HTTP 응답은 더 이상 답을 안 실음(ack) → **fallback**: 실시간 못 받으면 `fetchMessages(threadId)` 재조회로 복구. (webchat은 지금 메시지 실시간 구독이 없음 → 이번에 추가.)
- **환자앱(③, 복제 트랙)**: 이미 `streamThread`(chat_messages insert)·`chat-typing` broadcast 구독 중 → `bot_typing`/`bot_delta` 핸들만 추가. 최종 답은 DB insert로도 도달(이중 안전). 스트리밍 텍스트와 DB 최종본 합치기(같은 messageId면 대체).

## 4. 오류·재연결·안전 (기존 규칙 준수)

- **한 채널 규칙**: 기존 열린 채널에 이벤트만 추가(신규 채널 0).
- **`BTN-TIME-01`(앱이 임의로 안 끊음)**: 클라 타임아웃 미도입 — 규칙 준수.
- **실시간 놓침/재연결**: DB가 정본. webchat=`fetchMessages`, 환자앱=`streamThread`로 재조회 복구. broadcast는 fire-and-forget(놓친 조각은 재전송 안 함) → 최종본은 DB로 보장.
- **요청 끊김 안전**: 생성은 `create_task`로 요청과 분리 → POST가 죽어도 생성·저장·emit 지속. ⭐ 끊김을 죽이는 핵심.
- **중복 제출**: 사용자 메시지 insert가 `on conflict (client_message_id) do nothing`. **새로 저장된 경우에만** 생성 태스크 기동 → 연타/재시도로 답이 2번 나지 않음.
- **안전 게이트**: orchestrate 앞단 결정적 watchdog 무변경 → 응급·자살·직원요청 즉시 인계 그대로.

## 5. 테스트 전략

- **백엔드 단위**: realtime_broadcast(mock send) / `_generate_and_emit`가 요청 취소돼도 완주·DB 저장(shield/create_task) / 멱등(중복 POST는 태스크 1회) / astream 실패→ainvoke 폴백 / 안전 게이트 무회귀(응급·직원요청은 생성 전 종료). 전부 mock LLM.
- **프론트 단위**: webchat 봇 typing→델타 누적→done 카드 렌더 / 실시간 실패 시 fetchMessages 폴백 / gen 불일치 조각 폐기.
- **e2e(실도달)**: realtime 실도달은 **실기기 2인 e2e로만 확정**(단위는 realtime 못 잡음 — 기존 typing/presence 교훈, `ui-design-decisions.md:5860`). webchat 웹 + 환자앱 실기기에서 답 스트리밍·끊김 재현(불안정 연결 시늉) 확인.

## 6. 단계 (파일 경계)

1. **① 백엔드 발행기 + 생성 분리**(공통): `realtime_broadcast`(신규), `chat_flow_service`·`rag_service` 변경, `/chat/messages` ack 반환. 단위 테스트.
2. **② webchat 수신**(검증): 채널 구독 + 델타 렌더 + fetchMessages 폴백. 단위 + 웹 눈확인.
3. **③ 환자앱 수신**(복제): bot_typing/delta 핸들 추가. 단위 + 골든 + 실기기.

각 단계 커밋 분리. ①②로 "끊김 사라짐" 검증 후 ③ 복제. 백엔드 push=Railway 프로덕션 즉시 반영 주의.

## 7. 범위 밖 (YAGNI)

- **분류 모델 Haiku 교체**(지연 14→7초 단축)는 별도 작업 — 이번은 "전달 방식"만. 회귀 골든셋(triage 8건 `e6a7162`)과 함께 후속.
- **통합 3→2**(커밋 `e820c38` 미푸시)도 별도.
- 문자 단위 초미세 스트리밍 아님(적당한 조각). 지속 잡큐 아님(인프로세스 태스크, 이 규모 허용 — 재시작 시 그 턴 답 유실은 재전송으로 복구).
- 스트리밍 부분 텍스트 DB 저장 안 함(최종본만 저장, 지금과 동일).

## 8. 반영 절차 (구현 시)

- 새 화면 규칙을 `docs/design/screen-behaviors.md`에 추가: `CHAT-STREAM-01`(봇 답 스트리밍 전달)·`CHAT-STREAM-FALLBACK-01`(실시간 놓침 시 DB 재조회) 등. 결정 근거는 본 문서 참조(역참조).
- 트랙 핸드오프(`HANDOFF-chatbot.md`)에 단계별 상태 기록.
