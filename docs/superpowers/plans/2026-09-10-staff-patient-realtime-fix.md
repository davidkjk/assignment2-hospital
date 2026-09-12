# 직원 ↔ 환자 실시간 소통(사람 상담) 배선 수정 — 진단 + 계획

- 작성일: 2026-09-10
- 상태: 🔵 **계획만**(코드 변경 없음). systematic-debugging Phase 1~2(근본원인·패턴) 완료. Phase 3~4(수정·검증)는 아래 세션 분할로 실행.
- 발단(사용자, 2026-09-10): "웹 상담봇에서 직원과 연결된 뒤 서로 소통이 안 된다(총체적 난국) — 문자가 안 오고, 입력 중 상태도 전달 안 됨. 웹엔 새 대화(리셋)가 없어 못 빠져나온다. 환자앱은 직원→환자가 한 번은 되는데 그 다음부터 안 온다." + 개발 환경이 캐나다(원거리 지연 가능성).
- 선행 정본: 봇 답 스트리밍 설계 = `docs/superpowers/specs/2026-09-09-chatbot-streaming-realtime-design.md`(이 수정은 그 아키텍처를 **사람 답장에도 확장**). 마이그 `00096`(chat_messages realtime publication).
- ⚠️ 이 작업은 **세 트랙에 걸침**(챗봇 백엔드 + 직원웹 + 환자앱 + 웹챗). 진행 상태는 `HANDOFF-chatbot.md`가 허브, 관련 부분은 각 트랙 핸드오프에 포인터.

---

## 1. 근본 원인 (코드 원문 확인 — 추측 아님)

### 문제 1 — 웹챗(익명): 인계 후 직원 메시지가 환자에게 **영영 안 온다** ⭐ 최우선
세 경로가 전부 막힘:
1. **직원 답장이 broadcast되지 않는다.** `realtime_broadcast.broadcast`는 오직 `chat_flow_service.py`(봇 이벤트 bot_typing/delta/done)에서만 호출. 직원 답장 경로 `staff_send_message`(`ticket_service.py`, 라우터 `staff_chat.py:69-74`)는 DB insert + `enqueue_after_reply`(읽음/알림 배칭)만 하고 **broadcast 없음.**
2. **익명 웹챗은 `chat_messages` 테이블 실시간 구독 불가.** RLS `patients_read_own_messages`(00053·00096 주석)는 **로그인 환자**만 허용. 익명 anon 토큰 세션은 SELECT 불가 → 환자앱이 쓰는 `streamThread` 경로가 웹챗엔 원천적으로 없음(설계 spec §3.4 명시).
3. **웹챗은 메시지 본문을 주기적으로 재조회하지 않는다.** `useWebchat.ts`: 8초 폴링은 `refreshHandoff`(인계 **상태**만) 뿐. `reconcileFromServer`(=`fetchMessages`)는 전송 후 fallback 타이머·봇 done(조각없음) 때만. 게다가 **인계 모드**(`ack.routeTaken==='staff'`, `useWebchat.ts:74-79`)에선 fallback도 안 걸고 그냥 return → 재조회 트리거 자체가 사라짐.

→ **결과: 인계 후 환자는 직원 답을 절대 못 봄. 새로고침(재조회)해도 인계 모드라 안 붙음.** = "문자가 오지도 않는다".

### 문제 2 — 웹챗: 직원 typing·상태 표시가 환자앱 대비 빈약
- `useStaffPresence.ts`는 직원 `viewing`만 구독(HandoffBadge가 connecting+viewing일 때 "직원이 확인 중"). **직원 `typing`(입력 중)은 안 들음** → 환자앱 같은 상태 점+문구 변화 없음.
- (반대 방향) 직원웹은 `PatientPresence`(`TicketDetail.tsx:81`)로 환자 typing/viewing 렌더 배선됨. 단 둘 다 꺼지면 **아무것도 안 그림**(PatientPresence.tsx:7) → 신호 미도달 시 직원 화면엔 표시 0. 사용자 "직원웹에 환자 상태가 안 보인다"와 일치 → **실도달 재현 필요**(broadcast가 실제 가는지).

### 문제 3 — 웹챗: 새 대화/리셋 없음 → 못 빠져나옴
- 환자앱엔 `startFreshSession(fresh:true)`·`resumeWithSummary`(chat_repository.dart)로 새 대화. **웹챗 `open()`은 토큰으로 기존 세션 복원만** — 새 대화 어포던스·리셋 없음.

### 문제 4 — 환자앱: 직원 답이 한 번은 오는데 그 다음부터 안 옴
- 배선(`streamThread` DB stream → `mergeLiveRows`, chat_room_controller.dart:295)은 **정적으론 반복 수신이 맞음**(Supabase `.stream()`이 전체 목록 재emit, id로 dedup, staff/system만 병합).
- 정적 분석으로 안 잡히는 **런타임 증상** → 실기기 계측 재현 필요. 후보 가설: ⑴ Supabase realtime 재연결 후 재emit 누락 ⑵ 원거리(캐나다) 지연으로 인한 소켓 드롭 ⑶ 세션 재발급 시 provider family 키 변경으로 구독 교체.

---

## 2. 결정: 직원 메시지 전달 방식 (채택 = A + 안전망)

**A. 직원 답장도 broadcast (추천)** — `staff_send_message` 후 같은 `chat-typing:<threadId>` 채널에 `staff_message` 이벤트를 민다(봇 스트리밍과 동형). 웹챗·환자앱 둘 다 이 이벤트를 수신해 즉시 피드에 붙인다. DB가 정본, 실시간은 빠른 전달.
- 장점: 익명 웹챗도 즉시 수신(broadcast는 anon 가능) · 기존 봇 스트리밍 구조/채널 재사용(새 채널 금지 규칙 준수) · 사람/봇 전달 경로 통일 · 지연 없음.
- 단점: 새 이벤트 계약 1개 추가 + 양 클라 수신 배선.

**B. 웹챗 메시지 폴링** — 인계 모드에서 `fetchMessages` 주기 폴링. 장점=백엔드 무변경·최단순. 단점=최대 폴링주기만큼 지연, 봇/사람 경로 비대칭, 낭비. → **기각(주경로로는)**.

**안전망(둘 다)**: broadcast 놓침 대비, 웹챗 인계 모드에서 `staff_message` 수신 시 or 저빈도 폴링으로 `reconcileFromServer` 한 번. DB가 정본이므로 유실돼도 복구.

> 근거: 봇 스트리밍 설계 spec §3.1 "진실의 원천은 DB, 실시간은 빠른 전달 경로" 원칙을 사람 답장에 그대로 확장. 채널·재조회 폴백 규칙 재사용.

---

## 3. 세션 분할 (파일 경계로 나눠 병렬 가능 — 계약은 세션 1이 먼저 확정)

각 세션 시작 시: 자기 트랙 핸드오프 + 이 문서 재독 · **UI 세션은 `frontend-design` 스킬 먼저 invoke**(사용자 지시) · 버그 세션은 `systematic-debugging` · 격리 워크트리(`using-git-worktrees`) · 완료 전 `verification-before-completion`.

> **진행(2026-09-10)**: ✅ **세션1·2·3 완료·커밋** — 세션1·2=브랜치 `worktree-staff-reply-broadcast`(base `0d5fe33`, 7커밋; ①문자안옴·②입력중표시·③리셋 해소, 웹챗 vitest 182/182). **세션3**=워크트리 `.claude/worktrees/patient-realtime`(브랜치 `debug/patient-realtime-oncewonly`, 커밋 `83e396a`; ④"한 번만 오고 끊김" 재구독+재조회로 해소, 채팅 255 통과). 남음=**세션4(직원웹)·머지(e2e 눈확인, 이때 [RT-DIAG] 제거)·배포검증**. 새 관찰 ⑤(익명 인계 이름 인라인표시·전화 SMS 배포설정 의존)=`docs/research/2026-09-10-anon-handoff-name-sms-check.md`. ⚠️ **세션 작업은 워크트리에서** — 메인 트리는 챗봇/문서 커밋이 공유 HEAD로 써서 거기서 브랜치 checkout하면 남의 커밋이 얹힌다(2026-09-10 겪음).

### 세션 1 — 백엔드: 직원 답장 broadcast (계약 확정, 먼저) ✅ 완료
- `staff_send_message`(ticket_service.py) 성공 후 `realtime_broadcast.broadcast(thread_id, "staff_message", {...})`. payload = 저장된 메시지의 {id, content, senderType:'staff', createdAt, (staff_name?)}. best-effort(발행 실패가 저장/응답 안 막음).
- (선택) 직원 typing은 이미 클라 간 broadcast(useTypingChannel)로 감 → 서버 관여 불필요. 확인만.
- 테스트: 단위(mock broadcast 호출됨·payload 형태·발행 실패 삼킴·멱등 재전송은 1회). 공용 DB pytest 금지.
- 파일: `backend/app/services/chat/ticket_service.py`, `realtime_broadcast.py`, 테스트 `backend/tests/`.
- ⚠️ 백엔드 push=Railway 프로덕션 즉시 반영.

### 세션 2 — 웹챗 수신 + 상태 UI + 새 대화/리셋 (frontend-design) ✅ 완료
- `useStaffPresence.ts`: `staff_message` 수신 핸들 + 직원 `typing` 수신 추가.
- `useWebchat.ts`: `staff_message` → 피드에 직원 말풍선 추가(중복 방지 id 기준) + 인계 모드 안전망(수신 시/저빈도 폴링으로 reconcile). 인계 모드에서 재조회가 도는지 확인.
- 상태 UI(환자앱 파리티): 직원 "입력 중/확인 중" 상태 점+문구. **[브레인스토밍 결정]** 환자앱과 얼마나 동일하게.
- 새 대화/리셋: **[브레인스토밍 결정 — 사용자 본인이 "리셋 필요한가" 물음]** ⑴ 위치·라벨(예: 헤더 "새 상담"), ⑵ 기존 대화 유지+새 방 vs 완전 초기화, ⑶ 인계(사람 상담) 중일 때 노출 여부. 백엔드는 세션 새로 발급 엔드포인트 필요(환자앱 `fresh` 파리티 확인).
- 검증: vitest + 헤드리스 크롬 눈확인(tools/shot) + **실도달은 실 2인 e2e**(단위는 realtime 못 잡음, spec §5).
- 파일: `webchat/src/widget/useStaffPresence.ts`·`WebchatWidget.tsx`·`HandoffBadge.tsx`, `webchat/src/state/useWebchat.ts`, `webchat/src/api/webchatApi.ts`.

### 세션 3 — 환자앱 "한 번만 되고 끊김" (systematic-debugging) ✅ 수정 완료 (2026-09-10, 워크트리 `.claude/worktrees/patient-realtime` = 브랜치 `debug/patient-realtime-oncewonly`, base `9a69f93`)
- **근본원인(코드로 확정)**: Supabase `SupabaseStreamBuilder`는 채널이 `closed` 되면 스트림 컨트롤러를 **영구히 닫는다**(supabase 2.16.1 `supabase_stream_builder.dart:216-217`). 앱 `bindLive`는 `onDone`(닫힘)에 **재구독하지 않아** 직원 답이 '구독 중' 한 번만 오고 그 뒤로 영영 안 왔다. 모바일 백그라운드 등으로 채널이 닫히면 발생. **네트워크 blip은 원인 아님**(채널 `errored`→재조인→전체 재조회로 `realtime_client`가 스스로 복구 — `_onConnClose`→`_triggerChanError`, 코드로 배제). realtime publication(00096)은 적용 확인(`backend/scripts/realtime_diag.py`).
- **수정(`CHAT-ROOM-LIVE-RESUB-01`, 커밋 `83e396a`)**: `bindLive`가 스트림 하나 대신 **스트림 팩토리**를 받아, `onDone`(채널 closed) 시 ① DB 재조회(놓친 직원 답 회복·막다른 길 방지) ② 재구독(이후 실시간 회복). 연속 닫힘은 2^n초(최대 30초) 백오프, 정상 수신 시 리셋. `dispose`가 재구독 타이머 정리. `onError`(일시)는 라이브러리 자체 복구에 맡김.
- **검증**: TDD(실패 테스트 먼저 → 구현) — 채팅 단위 **255 통과**, `flutter analyze` 무경고.
- ⚠️ **남음**: ⑴ `[RT-DIAG]` 계측 로그는 머지-e2e 실기기 확인용으로 남겨둠 → **머지 직전 제거**(단, `realtime_diag.py`·수정 본체는 유지). ⑵ 규칙 `CHAT-ROOM-LIVE-RESUB-01`을 `screen-behaviors.md`에 반영(현재 코드 주석엔 있음). ⑶ 실기기 2인 확인은 **머지 단계 e2e 눈확인**에 흡수(직원 2~3연속 답장·중간 백그라운드 → 다 도달하는지).
- 파일: `patient_app/lib/features/chat/chat_room_controller.dart`(bindLive→팩토리·`_subscribeLive`/`_onLiveClosed`)·`chat_repository.dart`(streamThread, 현재 [RT-DIAG] 포함).

### 세션 4 — 직원웹: 환자 상태 실도달 확인/수정 + 신청자 이름 배지 ✅ 코드 완료 (2026-09-10, 워크트리 `.claude/worktrees/staff-ticket-realtime` = 브랜치 `worktree-staff-ticket-realtime`, base `de327bb`)
- **근본원인(원문 확정)**: `support_tickets`가 `supabase_realtime` publication에 **한 번도 등록된 적 없음**(00039=예약3종·00096=chat_messages만; grep으로 확인). 그런데 직원웹 `useTicketsRealtime`(문의함 목록)·`useTicketDetailRealtime.ts:25`(상세)가 이 테이블을 postgres_changes(event '*')로 구독 → publication에 없어 초기 스냅샷 뒤 새 문의(INSERT)·담당/상태 변경(UPDATE)이 영영 미도달 = 새로고침해야 보임. `00096`(chat_messages)과 완전히 같은 구멍.
- **수정 ①(실도달)**: 마이그 `00100_support_tickets_realtime`(멱등 가드, `alter publication supabase_realtime add table support_tickets`). 로컬 적용·검증(적용 전 0→후 등록·replica_identity=default). `TICKET-DETAIL-LIVE-02`에 전제 역참조·대장 반영. ⚠️ **원격 미적용 — 배포/머지 시 db push**(다른 대기 마이그와 함께).
  - ※ 환자 입력중/보는중(`PatientPresence`)은 broadcast라 publication 무관 — 세션2·3의 broadcast 배선이 정본, 실도달은 머지 e2e에서 눈확인.
- **수정 ②(신청자 배지, `TICKET-DETAIL-APPLICANT-01`)**: 사용자 결정=헤더 배지(옵션1). 백엔드가 이미 만든 `상담 신청자: {이름}` 시스템 body를 프론트에서 접두만 벗겨(`applicantName` in TicketConversation.tsx) 헤더 pill로 끌어올림(사람 아이콘+`신청자 {이름}`, 익명 인계 티켓만). 백엔드/DTO/마이그 무변경.
- **검증**: 티켓 vitest 88 통과(+APPLICANT-01·02 2건)·tsc 0. ⚠️ **배지 라이브 눈확인은 머지 단계 e2e에 흡수**(현 시드에 익명 인계 티켓 0건이라 배지가 뜰 데이터가 없음 — 웹챗 익명 인계가 실제 익명 티켓을 만드는 e2e 지점에서 자연히 뜬다).
- 파일: `supabase/migrations/00100_*` · `frontend/src/pages/tickets/TicketDetail.tsx`·`TicketConversation.tsx`(+`.test.tsx`) · `MIGRATION-LEDGER.md`·`screen-behaviors.md`.

---

## 4. 유지(불변) · 반영 절차
- **한 채널 규칙**: 전부 기존 `chat-typing:<threadId>`에 이벤트만 추가(새 채널 금지 — "한 토픽 2채널=한쪽 유실" 버그, chat_repository.dart:152).
- **DB 정본**: 실시간 놓쳐도 재조회로 복구. broadcast는 fire-and-forget.
- **안전 게이트·멱등·`BTN-TIME-01`(클라 임의 타임아웃 금지)** 무변경.
- 규칙 신설 시 `screen-behaviors.md`(예: `WEBCHAT-STAFF-MSG-01`·`WEBCHAT-STAFF-TYPING-01`·`WEBCHAT-NEW-01`) + 결정 근거는 이 문서 역참조.
