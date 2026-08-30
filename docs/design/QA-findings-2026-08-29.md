# 직원웹 QA 발견 기록 — 2026-08-29 (Aside + 전수클릭 두 트랙)

> 목적: 자료 유실 방지용 durable 기록(사용자 지시 2026-08-29 새벽). **코드 수정은 내일.**
> 이 파일 = 상세. 상태·다음할일은 `HANDOFF.md` 「손검수 방식」 절.

## 0. 검수 체제 (이번에 확립)

- **🖱️ Aside(AI 브라우저) 판단 패스** — "흐름이 이상한가·위험동작에 확인창 뜨나" 등 **판단**. 단 LLM이라 **모든 버튼이 아니라 표본만** 누름(로그에 "let's move fast" 대목 확인).
- **🔁 결정적 전수클릭 패스(맥락창)** — 화면별 **모든** 클릭요소를 하나씩 눌러 콘솔에러·크래시 잡기. **아직 안 돎**(Aside 끝난 뒤 + 재시드 후 실행 예정). 대상 라우트 목록은 §4.
- **📷 규칙 대조(맥락창)** — real↔demo + 1,400 규칙. Aside엔 이 맥락이 없으니 맥락창 몫.

### ⭐ Aside CLI — 맥락창이 직접 조종 가능 (이번에 설치·검증)
- 설치: `curl -fsSL https://releases.aside.com/install.sh | bash` → `~/.local/bin/aside`(PATH에 있음, v1.26.810.1915).
- 실행: `aside exec [-s fast] [--effort low|…] "지시문"` — 브라우저 열고 클릭·입력·스크린샷, 결과를 **터미널로** 반환. 인증=Aside 로그인 계정(u0, Claude 구독 연결됨). `aside repl "js"`(결정적 조작), `aside mcp`(stdio MCP — 나중에 Claude Code에 물릴 수 있음).
- ⭐ **세션 결과를 파일에서 직접 읽는다**(사용자 복붙 불필요):
  - 인덱스 DB: `~/.aside/u/0/state.db`(sqlite, **읽기전용으로 열 것** `?mode=ro&immutable=1`) — `sessions`(status/model/title), `session_runs`(user_message·final_assistant_message·finished_at·token_usage).
  - 전체 대화: `~/.aside/u/0/sessions/<날짜_세션id>/messages.jsonl`.
- ⚠️ **동시 실행 금지**: Aside GUI 세션과 CLI/헤드리스가 **같은 localhost:5173+공용 DB를 동시에** 건드리면 충돌(서로 데이터 만들고 지움). 한 번에 하나만.

## 1. 🔴 환경 사고 — 로그인 전원 불가 (발견·해결 완료)

- **증상**: admin·reception·doctor 모두 로그인 화면에서 "로그인 정보를 확인해 주세요"로 되튕김. Aside도 사용자 수동도 실패.
- **근본원인**: Supabase 인증 토큰 발급은 **200 정상**인데, 백엔드 `/me`가 **401**. 원인은 **DB `staff` 테이블이 텅 빔**(staff=0, patients=0, appts=0). auth.users 10개는 남아 "비번은 맞는데 되튕김" 헷갈리는 증상.
  - `security.py`: JWT 검증(ES256/JWKS) 통과 후 `select … from staff where auth_user_id=$1` → 행 없음 → 401(계정열거 방지로 문구 동일).
- **원인의 원인**: 이 공용 DB에 백엔드 pytest가 돌면 데모 시드가 지워짐(핸드오프 기존 함정 라인 86 그대로 재발).
- **해결**: `bash supabase/seed-demo.sh` 재적재 → staff=10·patients=154·appts=10510. **세 역할 /me 200 검증 완료**, reception 브라우저 로그인 → `/today` 정상 진입.
- **버그 아님**(환경). 코드 수정 불필요. 재발 방지는 기존 함정 규칙대로.

## 2. Aside QA 판단 패스 — 실행 기록

- 세션 id `rlB5tXA4VuRO0AkA`, 제목 "3역할 전체 화면 QA 테스트 및 버그 리포트", 모델 `claude-code/claude-sonnet-5`(medium).
- 프롬프트 = 맥락창이 준 "모든 버튼·입력·3역할 순회로 오류 잡기"(HANDOFF 손검수 절 참조).
- 1차 실행은 §1 로그인사고로 막힘 → 사용자 "고쳤어 다시 시작해봐" → **2차 실행 중**(이 기록 시점 admin 단계만 끝, reception·doctor 대기).
- ✅ **완료**(run 2 finished, 세션 idle). 3역할 로그인→전체 테스트→로그아웃 마침. **문제 11건**(8건 동작실패/버그, 3건 UX·권한 확인). ⚠️ **아래는 Aside의 주장 — 규칙/코드 대조 전이라 미검증.**

#### Aside 발견 11건 (원문 + 1차 추정)
1. **[관리자] 예약 캘린더** — 겹치는 시간(09:10) 강행 시 정원초과는 잘 막히나(정상), **에러 문구가 "진료 시간 밖에는 예약을 잡을 수 없습니다"로 실제 원인(시간 겹침)과 불일치** → 오해 유발. `추정`: 프론트가 겹침/시간밖 에러를 한 문구로 뭉갬(문구 매핑 버그).
2. **[관리자] 안내 보내기(`/messages`)** — 전체발송·개별발송 **모두 "잠시 후 다시 시도해주세요"로 실패**, 시스템 오류기록에 `/messages` 오류 실제 기록. `추정`: 서버 500(⭐ 아래 공통패턴).
3. **[관리자] 병합 되돌리기(`/admin/merge-history/.../undo`)** — 사유 입력 후 확정 시 **동일 "잠시 후 다시 시도" 실패**, 오류기록에 남음. `추정`: 서버 500(공통패턴).
4. **[관리자] 직원 관리 초대** — 이메일 형식오류("not-an-email")/빈칸으로 "초대" 시 **아무 반응 없음**(에러·성공 문구 둘 다 없음). `추정`: 프론트 검증 누락 + 실패 무피드백.
5. **[관리자] 직원 중지** — 신규초대 직원 "중지" 확정 시 **동일 "잠시 후 다시 시도" 실패**. `추정`: 서버 500(공통패턴).
6. **[관리자] 진료 일정 관리** — 일요일 켜고 정원 99999·필수칸 빈 채 "저장" 시 **에러 없이 조용히 저장 실패**. `추정`: 프론트 검증/실패피드백 누락(+정원 상한 없음?).
7. **[접수] 환자 등록** — 생년월일 "9999-99-99"(없는 날짜)인데 **프론트가 확인창까지 진행**, 등록 실패는 일반 오류만. `추정`: 프론트 날짜 유효성 검증 누락.
8. **[접수] 환자 상세 — ⭐개인정보** — 접수직원 계정인데 "사전문진"은 "담당 의사만 열람"으로 가려지나 **"진료기록"(진단명 등)은 그대로 노출**. `추정`: 접근권한 일관성 — **규칙 대조 필수**(설계상 접수직원이 진료기록 봐도 되나? 개인정보 원칙과 충돌 여부).
9. **[의사] 진료 완료** — 기록 작성 후 "진료 완료" 확정(2회 재현) 시 **확인창은 닫히나 환자 상태가 "진료중"에서 안 바뀜**, 에러도 없음. `추정`: 서버 500 조용히 실패(공통패턴) 또는 상태전이 미반영.
10. **[의사] 환자 검색 — ⭐완전 고장** — "오도현"·"이"·"010" 등 **무엇을 넣어도 항상 0명**. 관리자·접수는 동일어로 정상. `추정`: 의사 역할 검색 RLS/스코프 버그.
11. **[로그인] 비번 사라짐** — 세션 초반 로그인 버튼 클릭 시 비번 값이 사라져 실패했으나 "진행 중 해결". `추정`: **§1 staff 빈 DB 사고와 동일 건일 가능성**(내 재시드로 해소). 별개 비번-클리어 버그인지 재확인.

#### ⭐ Aside가 짚은 공통 패턴 (최우선 검증)
- **"확인 모달은 정상 → 실제 서버 쓰기가 조용히 실패(`잠시 후 다시 시도해주세요`)"가 4곳 반복**: #2 안내발송 · #3 병합되돌리기 · #5 직원중지 · #9 진료완료. **시스템 오류기록(`/admin/errors`)에 실제 서버오류로 확인됨.**
- ⚠️ **내 1차 가설(미검증)**: 이 4건은 개별 버그가 아니라 **환경 문제일 수 있음** — (a) **uvicorn이 stale**(핸드오프: `--reload` 없이 뜸, 최근 커밋/마이그 이후 재시작 안 했으면 쓰기경로 500) 또는 (b) **최근 마이그(00071·00072)가 로컬 DB에 미적용**. **내일 먼저 `/admin/errors` 원문·서버 재시작·마이그 상태부터 확인** → 그러면 4건이 한 번에 풀릴 수 있음. 코드 버그로 단정 말 것.

#### Aside "정상 확인" (참고)
관리자: 오늘현황·대기·예약캘린더 기본·환자검색/상세·상담봇 플레이스홀더5·통계·접근기록·오류기록·직원초대(정상케이스)·일정관리 현황·문진표·병원설정. 접수: 메뉴권한제한·등록/접수·대기/캘린더/검색·안내(화면). 의사: 진료화면 전반.

### admin 단계 관찰(중간, 대부분 "정상"):
- 빈 제출→검증문구 OK · 잘못된 자격→"로그인 정보를 확인해 주세요" 에러 OK
- 예약 상세 열기·"예약 취소" 확인창 흐름 · 예약 패널 환자검색·정원초과 슬롯 시도 · 빈 슬롯 클릭
- "전 환자에게 보내기" 위험동작 확인창 · CSV 다운로드 OK
- 감사로그 불변(immutability) 안내 OK · 병합이력·되돌리기 OK
- ❓ 후속확인: 대시보드에 **"확인 필요 상담 문의 현재 집계할 수 없음"** — 상담봇(4단계) 미구현이라 예상되나, 문구/처리 적절한지 규칙 대조 대상.

## 3. 다음 액션 (내일)

1. Aside 2차 실행 완료 대기(백그라운드 감시 중) → **최종 리포트 §2에 추가**.
2. **결정적 전수클릭 패스** 작성·실행(§4 라우트, 로그인은 폼 타이핑=tools/shot 방식). 실행 전 Aside 종료 확인 + 실행 후 재시드.
3. Aside·전수클릭 발견을 **1,400 규칙·원래 계획과 대조** → 진짜 버그만 추림.
4. **버그 수정**(내일). 각 건 규칙ID·재현·원인 파일 명시.

## 4. 직원웹 전체 라우트 (전수클릭 대상)

관리자: `/admin/access-logs` `/admin/errors` `/admin/merge-history`(+`/:mergeEventId`) `/admin/patient-merge-candidates` `/admin/questionnaires` `/admin/schedule` `/admin/settings` `/admin/staff` `/admin/stats`
공통/접수: `/today` `/queue` `/checkin` `/calendar` `/patients`(+`/:id`) `/messages` `/login` `/reset-password`(+`/new`)
의사: `/doctor/console`(+`/:appointmentId`)
상담봇(4단계 미구현, 참고): `/bot/overview` `/bot/knowledge` `/bot/quality` `/bot/reports` `/bot/unresolved` `/tickets` `/chatlog`

## 5. 전수클릭 크롤러 결과 (맥락창 자체 헤드리스, 2026-08-29 새벽)

- 방식: 3역할 로그인 → 라우트별 **모든 버튼 클릭(모달 확인까지)+입력 이상값(퍼징)** → 콘솔에러·서버 4xx/5xx·크래시만 수집. 리포트 원본 `scratchpad/crawl-report.json`(125건). **AI 모델 안 씀(공짜).**
- ⚠️ **커버리지 한계**: **admin만 제대로 돎.** reception 약함(nav_timeout — admin 크롤이 DB 헤집음 추정), **doctor 커버리지 0**(login_fail — 반복 로그인 레이트리밋/훼손 추정). → **재실행 필요**(개선점 아래).

### 🔴 확정 버그 (원문 대조 완료)
- **`GET /admin/hours` 404 · `GET /admin/closures` 405** (진료 일정 화면, ×13씩). 프론트 `frontend/src/api/scheduleAdmin.ts:82-83`이 목록조회로 호출하나, 백엔드 `backend/app/routers/schedule_admin.py`엔 **`PUT /hours/{weekday}`(164)·`POST /closures`(176)만 있고 GET 라우트 없음**. 테스트(`SchedulePage.test.tsx:32,44`)는 이 GET을 mock → **원래 있어야 하는데 빠진 엔드포인트.** 결과: 일정 화면이 운영시간·휴진일을 못 불러옴. **= Aside #6.** **수정(내일): 백엔드에 `GET /hours`·`GET /closures` 추가.**

### 🟡 경미 / 확인
- `POST /staff/{id}/resend-invite` **409**(이미 수락한 계정 재초대) — 문구 "재초대에 실패…이미 수락한 계정일 수 있습니다"로 **정상 처리**. pageerror로 잡혔으나 UX상 OK. = Aside 직원관리 관련.
- `/admin/staff` React 경고 "mix shorthand style property during rerender" — 스타일 경고(경미, 코드품질).

### ⚪ 잡음 (버그 아님 — 기록만)
- `reqfail ERR_NETWORK_CHANGED ×54` — 전부 vite `/src/*.tsx` 모듈. **크롤러가 버튼마다 리로드해서** 진행 중 요청이 취소된 것. 실제 앱 문제 아님.

### ⛔ 크롤러가 검증 못 한 것 (내일 확인)
- Aside #2(안내발송)·#3(병합 되돌리기)·#5(직원 중지)·#9(진료 완료)의 "서버 조용한 실패"는 **크롤러가 해당 confirm까지 못 눌러 재현 안 됨**(admin http 에러엔 이 엔드포인트들 안 나옴). → **`/admin/errors`(error_logs 테이블) 원문 조회로 Aside가 본 실제 서버오류 확인**, 또는 재크롤.
- doctor 전체(#10 검색 완전고장 포함) — 크롤러 커버리지 0. Aside 판단만 있음.

### 크롤러 개선점 (재실행 전)
1. **버튼마다 라우트 리로드 → 느림·ERR_NETWORK_CHANGED 유발**. 한 번 로드 후 Escape로 모달 닫으며 진행, URL 이탈 시만 리로드.
2. **역할마다 클린 DB에서** 시작(앞 역할 크롤이 DB 훼손 → 뒤 역할 페이지 로드 실패). 역할 사이 재시드 또는 3역할 3프로세스.
3. **findings 파일 증분 저장**(라우트마다) — timeout 종료해도 유실 없게.
4. 반복 로그인 레이트리밋 회피(로그인 사이 간격/세션 재사용).

## 6. 크롤2 재실행 결과 (2026-08-29 낮, 개선 크롤러 + 환경 정상화)

> 환경 3점 정상화 확인(마이그 00070·71·72 적용 · uvicorn stale 아님 · 시드 정상). `system_error_log`는 시드 픽스처(Aside 오독). 상세 = HANDOFF 「⭐ 갱신(2026-08-29 낮)」.

- ✅ **#10 의사검색 403 — 해소(2026-08-29)**: **결정 불필요였다** — 규칙(`SHELL-NAV-03`·`DOCTOR-SHELL-01` 의사 메뉴에 환자 검색) + 요구사항 L153(의사 본인 환자 조회) + **기존 RLS `doctor_can_read_scoped_patients`(00005:244)** + `search_patients`가 RLS 경유 커넥션(`acquire_as`)까지 **만장일치로 (b)를 이미 구현**해 둠. 막던 건 라우터 `require_role`뿐. **수정**: `GET /patients`(검색)·`GET /patients/{id}`(상세)에 `"doctor"` 추가 → RLS가 본인 담당으로 자동 스코프. `ROLE-DOC-02` "자기 것만"은 화면 차단이 아니라 RLS 스코프란 뜻. **라이브 검증**: 오도현 3명 중 doctor1 담당 2명만 검색에 뜨고(403→200), 비담당 1명은 상세 404(admin은 200) = 열거 안전·누수 없음. 낡은 테스트(`test_목록은_접수직원과_관리자만_연다`가 403 못박음)를 규칙대로 정정 + 상세 404 테스트 추가.
- 🟠 **#6 hours/closures GET 누락(확정)**: admin 전 라우트서 `GET /admin/hours`404·`/admin/closures`405. 백엔드 `schedule_admin.py`에 PUT/POST만, GET 없음. **단 일정 전체현황 화면은 정상 렌더** → 영향은 휴진일·운영시간 **편집**에 국한 추정. 전역 컴포넌트가 prefetch.
- 🟡 staff 재초대 409 + pageerror — "이미 수락한 계정" 문구로 처리됨, 콘솔만 오염(프론트가 에러 throw).
- ⚪ **#2·#3·#5·#9(어제 "조용한 실패") = 정상환경 크롤서 500 안 남** → 빈시드 환경 + Aside 오독 유력. (단 #3·#5·#9는 상태의존이라 완전 배제는 못 함.)
- ✅ 시각 트랙(스크린샷 27장): **깨진 화면 없음**. 리포트=`scratchpad/crawl2-report.json`, 샷=`scratchpad/shots/`.

## 7. 라이브 손검수 발견 — 사용자 브라우저 직접 (2026-08-29 낮, 캘린더 집중)

> 사용자가 실 Chrome으로 캘린더를 돌며 실시간 발견. **원인은 확인된 만큼만, 수정은 한 바퀴 후 일괄.** 규칙대조 후 진짜버그만 추림.

- 🟠 **L1 [캘린더] 예약 취소·변경 미배선 — 취소 해소(2026-08-29 밤), 변경(reschedule)은 잔여**: 근본원인은 `AppointmentPanelLoader.tsx`가 `AppointmentPanel`에 **`onCancel`·`onReschedule`를 안 넘김**(`onClose`만)이었다. `openAppointment`가 캘린더 예약 여는 **유일 경로**라 모든 취소/변경이 무동작. 규칙대조 완료 = `CAL-PANEL-01`이 취소·변경 실행 화면이 맞음(설계결정 아님).
  - ✅ **취소 배선 완료**: 취소 API는 새로 만들 필요 없었다 — 기존 `transitionStatus`(`api/appointments.ts`)를 `new_status='병원취소'`로 재사용. ① 백엔드 `get_appointment_detail`에 낙관잠금값 `updated_at` 추가(없어서 취소가 `expected_updated_at`을 못 채웠다) ② 로더가 `useMutation`으로 병원취소 전이 → 성공 시 `onDone`(패널 닫고 `query.refetch()`로 취소된 막대 제거) ③ 실패 시 패널 `actionError` 인라인 안내(G1 — 무동작 대신 이유). **검증**: 프론트 vitest(CalendarPage 취소 end-to-end + 캘린더 124/124) + tsc 0 + lint:clock + **라이브 curl**(GET 상세 updated_at 실림·PATCH 병원취소 200·예약확정→병원취소 전이) + 백엔드 pytest(CI, `test_CAL_PANEL_01_..._updated_at`).
  - ⏳ **변경(reschedule)은 잔여 — 별도 흐름**: 백엔드(`POST /appointments/{id}/reschedule`)·프론트 API(`rescheduleAppointment`)는 이미 있으나, "**캘린더 격자에서 새 시간 고르기**"(`SUPPORT-PANEL-CHANGE-01`·`CAL-PANEL-02/03`) 상호작용 모드가 미구현이라 로더가 `onReschedule`을 아직 안 넘긴다(=[예약 변경] 버튼은 여전히 무동작, 단 **이전에도 무동작이라 회귀 아님**). `DayGrid.onEmptyClick(doctorId, startMin)` 인프라는 이미 있음 — reschedule 모드 상태 + 확인 팝업(`NAV-APPT-09`) + 사유 수집만 얹으면 됨. 다음 태스크.
- ℹ️ **L2 [캘린더] "변경상담/취소상담" 배지 = 설계**(버그 아님): 환자앱/상담봇의 변경·취소 요청이 상담연결된 것(`SUPPORT-CAL-*`, "담당 미배정"=미인수). 단 **L1 때문에 처리 자체가 안 됨**.
- ✅ **L3 [캘린더] 미니캘린더 월 이동 불가 — 해소(2026-08-29, L8과 함께)**: 원인 확정 — `MiniCalendar`가 anchor 달의 6주 격자 하나만 그리고 월 네비 버튼이 없어, 트레일링 날짜로만 한 달씩 겨우 넘어갔다. L8 결정(범위 전체 펼치기)으로 근본 해소 — 아래 L8 참조.
- ✅ **L4 [캘린더] 미니캘린더 바깥클릭 미닫힘 — 해소(2026-08-29 밤 세션5)**: `CalendarPage`에 `miniOpen` 동안 document mousedown 핸들러 추가 — `.cal-mini`/`.cal-nav-range` 바깥을 누르면 닫는다(토글 제외로 재클릭 이중토글 방지). 헤드리스 재현(열림→바깥클릭→닫힘) 확인.
- ✅ **L5 [캘린더] nav 버튼 hover 피드백 없음 — 해소(2026-08-29 밤 세션5)**: hover 배경은 있었으나 `--color-done-bg`(#F5F7F8)라 흰 배경과 구분이 안 됐다. `--color-primary-wash`로 또렷하게 + `cursor:pointer`(없었음) + transition 추가.
- 🟡 **L6 [캘린더] "오늘" 버튼 버튼처럼 안 보이고 작동 의심**: `goToday()`는 존재(`CalendarPage:152` setAnchorDate(hospitalTodayAsDate(now))). 이미 오늘 보는 중이면 무변화일 수 있어 재현조건 확인 필요 + 버튼 스타일링.
- 🟡 **L7 [캘린더] 의사 "전체 선택" + 주간뷰 → 깨짐 — 재현 불가·현재 정상(2026-08-29 재조사)**: 헤드리스로 admin 로그인→`/calendar`→`주간`→전체 과/전체 의사 상태를 **1600px·1280px 두 폭**에서 캡처(`repro-l7.mjs`) — 둘 다 월~토 6열이 깔끔히 렌더되고 예약카드·`지난 시간`·`점심시간`이 정상, 잘림·겹침 붕괴 없음. **코드 변경 없음**(증상 못 봄 → 추측 수정 금지). L14처럼 사용자 라이브 관찰 시점의 **L34 DB 훼손 상태**였을 가능성. 낮 시간 실 Chrome(밴쿠버 TZ)에서 재현되면 그때 원인 추적.
- ✅ **L8 [예약가능 범위 한눈에] — 구현(사용자 결정 2026-08-29, 「8주 전체를 한눈에」 택함)**: `MiniCalendar`를 **월 격자 → 범위 펼침**으로 재작성. today·horizon이 있으면 **오늘이 든 주부터 horizon이 든 주까지** 주 단위로 죽 펴고(≈9주), 왼쪽 여백에 달이 바뀌는 자리마다 `N월` 길잡이(목요일 기준). 오늘 이전·horizon 이후는 disabled(`CAL-BOOK-13` 유지), 오늘 강조 유지. 로딩 중(horizon 없음)엔 종전 6주 격자로 물러남. 버튼에 `data-iso` 부여로 테스트 견고화. 팝오버 폭 256→280, 세로 스크롤 안전망. **검증**: MiniCalendar 6/6·캘린더 125/125·tsc·clock 통과 + 헤드리스 스샷(`real-calendar-mini.png`)에서 8월 24→10월 25 한 화면·월 길잡이·과거 비활성 확인. ⚠️ **범위(8주)를 관리자가 바꾸는 창구**는 별개 미결(HANDOFF 「예약 가능 기간」)로 남음 — 이건 표시만.
- ✅ **L9 [자유텍스트 패널 오버플로우] — 해소(2026-08-29 밤 세션5)**: 공백 없는 긴 문자열(URL·경로) 입력 시 패널 틀이 깨질 수 있던 자유텍스트 표시 지점 3곳에 `overflowWrap:'anywhere'` 추가 — `AllPatientsPreviewDialog`(발송 미리보기), `ContextPanel.reason`(의사 진료 사유), `NoteSection.content`(환자 내부 메모). LockedEventPanel `reason`은 서버 고정 문구라 제외. **검증**: 관련 57/57 · tsc 0. ⚠️ CSS 방어라 정상 데이터로는 무해, 병리적 긴 문자열에서만 효과.
- ✅ **L10 [캘린더] 이전 버튼 달력 아이콘 겹침 — 해소(2026-08-29 밤 세션5)**: 이전(‹) 버튼 안 `<svg><use #calendar></svg>` 제거(안 쓰는 import도 정리). ⭐ 파일 주석·규칙 `CAL-NAV-04`(⛔ 별도 달력 아이콘 금지)와도 일치. 헤드리스 확인(이전버튼 svg=0).
- ✅ **L11 [캘린더] 의사 칩 선택 시 나머지 칩 사라짐 — 해소(2026-08-29)**: 원인은 `chipDoctors`가 필터된 격자(`model.doctors`)에서 만들어져, 한 명 고르면 API가 그 사람만 반환 → 칩도 그만 남는 순환. **수정**: 백엔드 `GET /calendar/doctors`(필터 무관 전체 활성 의사) 신설 → 프론트 `getCalendarDoctors` 별도 쿼리로 칩·진료과·색 팔레트의 기준을 전체 카탈로그로. ⭐ **덤으로 색 흔들림도 고침** — 팔레트가 배열 위치(`assignPalette`)로 배정돼 필터 시 색이 바뀌던 것을, 전체 카탈로그 기준 고정 팔레트를 `buildGridModel`/`WeekGrid`에 주입해 격자 열 색도 필터와 무관하게. 회귀 테스트 CalendarPage `[L11]` + 백엔드 2건. 11/11·23/23 통과.
- 🔴 **L12 [안내 보내기] 환자 검색·선택이 오른쪽 좁은 패널에서 열림 = 규칙 위반**: 규칙 `SEND-BOX-03`·`SEND-WHO-03`은 "받는 사람 칸을 누르면 **왼쪽이 「고르는 도구」/검색 표가 된다**"(워크인 등록 패널과 같은 장치)로 못박음. 현재 구현은 오른쪽 슬라이드 패널 안에서 검색 → **본 화면(왼쪽)으로 옮겨야 함.** = 사용자 지적과 규칙 일치.
- 🔴 **L13 [안내 보내기] 받는 사람 다중선택 불가("1명 선택됨") = 규칙 위반**: `SEND-BOX-03` "목록이면 그 목록에 **체크칸**" → **다중선택이 원래 설계**. 현재 1명만 = 규칙 미달. 구현 난이도 낮음(체크박스 표준). 단 임의 대량(3,000명)은 `SEND-WHO-04` 「전 환자에게 보내기」로 분리돼 있으니, 검색표 다중선택은 **소수 여러 명**용. `PICK-*`(목록 다중선택 전역규칙)도 참조.
- ✅ **L14 [통계 드릴다운 명단] 행 클릭 → 환자상세 이동 — 재현 불가·현재 정상(2026-08-29 밤 재조사)**: 원 가설(`r.patient_id`가 응답에 없어 `/patients/undefined`)은 **라이브 증거로 반증됨**. ① 백엔드 4개 드릴다운(booked·cancelled·no_show·wait) 전부 `patient_row_dto(patient_id=r["for_patient_id"], …)`로 **항상 patient_id를 채움**(`dto.py:63`) — 라이브 `GET /stats/detail?metric=booked` 응답 첫 행에 `patient_id:"43afaa9f-…"` 확인. ② 헤드리스 재현(`tools/shot/repro-l14.mjs`): stats→드릴다운→첫 행 클릭 → URL이 `/patients/43afaa9f-…`(유효 UUID)로 이동, 환자상세(김지민 본인·예약방문이력) **완전 렌더**. `/patients/undefined` 아님. → **코드 변경 없음**(증상 고치기 금지). 사용자 라이브 관찰 시점은 L34 DB 훼손 상태였을 가능성.
- 🟡 **L15 [통계 드릴다운 명단] 항상 20건 · 더보기 없음**: 서버 페이지 20건 고정(설계, `patients`·`mergeHistory` 동일). `DrilldownModal:36` `partial` 감지는 있으나 **다음 페이지 로드(더보기/무한스크롤) UI 부재**로 20에서 멈춤. → 페이징 보강 필요(또는 명단 성격상 20 제한이 맞는지 규칙 확인).
- ✅ **L16 [통계 드릴다운 명단] 시각이 UTC ISO 원본 노출 — 해소(2026-08-29)**: `DrilldownModal.tsx` `when`을 `formatHospitalDateTime(row.occurred_at)`로 감쌈(`2026-08-29T…Z` → `2026.08.29 …` 병원 시각). 테스트 4/4.
- 🟠 **L17 [운영통계 드릴다운 전반] 예약·취소·예약부도·실제방문 명단 모두 동일 증상**: 전부 같은 `DrilldownModal` → **L14(행 안 눌림)·L15(20건만)·L16(시각)이 네 차원 전부에 해당.** 하나 고치면 다 해소. "원래 의도?"에 대한 답 = 행클릭은 버그(L14), 20건은 페이징 규칙 확인(L15).
- ✅ **L18 [접근 기록 /admin/access-logs] "환자 찾기" 이름 검색 안 됨 — 해소(2026-08-29 밤 세션5)**: 근본원인 = `LogFilterBar`의 `if (term.length < 2)` 가드가 **한 글자 검색을 통째로 차단**. "조"·"김"처럼 **한국 성씨는 한 글자**라 흔한 검색인데 막혔다. ⚠️ 메인 환자 검색(`useSearchPatients`)은 **빈 값만** 막고 한 글자도 찾는데 이 필터만 2자를 요구한 **불일치**. 규칙 `SEARCH-RUN-03`("한 글자마다 찾지 않는다")은 **디바운스**(매 타건 검색 금지) 뜻이지 2자 최소가 아니다. **수정**: 가드를 `term === ''`(빈 값만)로 낮추고 디바운스를 180ms→**400ms**(메인과 같은 `SEARCH-RUN-01`, 감사 로그 폭주 방지)로 통일. **검증**: vitest 7/7(한 글자 "김" 결과 노출 회귀 추가) + AccessLogPage 10/10 + tsc 0 + **헤드리스 재현**(수정 전 한 글자 listbox=false → 수정 후 true, 결과 클릭 시 필터칩·건수 정상). ⚠️ 원래 추정(onChange 미배선/서버쿼리 미반영)은 **오진** — 배선·서버 모두 정상, 최소 길이 가드가 원인이었다.
- 🟡 **L19 [접근 기록] 상단 설명 문구 스타일 정돈 안 됨**(사용자 표현 "정리 안 됨 = 스타일"): "이 기록은 삭제/수정 불가" + "검색은 실행 1회당 한 줄…" 안내 블록들의 시각적 정돈 필요. CSS.
- ✅ **L20 [병합 후보] 버튼 구성 — 해소(2026-08-29)**: ① **버그 확정·수정** — 후보 카드 행마다 `[대표 검토]`가 붙어 2인 그룹에 2개가 됐다. 규칙 `MERGE-LIST-05`(후보 카드 → `[대표 검토]`)와 데모(`CandidateCard` 카드당 1개)가 **만장일치로 카드당 하나**. 목록의 `[대표 검토]`는 **비교 화면을 여는 진입일 뿐**이고 대표 지정은 비교 화면 안에서(`MERGE-REVIEW-01`)라 행마다 둘 이유가 없다 → 버튼을 카드 푸터로 이동, `rows[0]↔rows[1]` 비교 진입. ② **채택 안 함** — `[다시 확인]`을 비교 중 숨기자는 제안은 **규칙 `MERGE-STATE-02`와 충돌**(비교 중 재조회로 최신 후보를 다시 읽되 비교 상태는 지우지 않는 동시성 안전장치를 의도 설계). 원문 대조로 확인해 현행 유지. ③ 데모와의 차이는 ①로 해소. 테스트 `[MERGE-LIST-05][L20]` 1개 단언 + 병합 29/29.
- ✅ **L21 [병합 완료 결과 화면] "병합 이력 화면" 링크 스타일 — 해소(2026-08-29 밤 세션5)**: `MergeCandidatesPage.tsx`의 `historyLink`가 raw `<Link>`(청록·fontWeight 700)라 옆 `[후보 목록으로]` 버튼(`recheck`, 테두리 고스트)과 튀게 달랐다. 두 액션은 같은 무게(이동)이므로 `historyLink`를 `recheck`와 동일한 테두리 고스트 버튼(height 32·border·ink색·weight 600)으로 통일. **검증**: merge 29/29 · tsc 0. (병합 완료 후에만 보이는 화면이라 헤드리스 캡처 대신 형제 버튼 스타일 일치로 확인.)
- ✅ **L22 [병합 이력] 되돌림 확정 → "잠시 후 다시 시도" 실패 = Aside #3 — 해소(2026-08-29 밤, 마이그 00074)**: **진짜 500이 맞았다**(프론트 처리 아님). 근본원인 = `patient_merges`에 **authenticated UPDATE grant·정책이 없음**. undo는 `update patient_merges set undone_at=…`인데 00044가 `select/insert`만 grant하고 UPDATE RLS 정책도 안 만들어(되돌림 API는 Task 26에서 나중에 추가돼 권한이 안 따라옴), 라이브에서 `permission denied for table patient_merges`(system_error_log 실측)로 500. **L34/00073(schedule 예외 DELETE grant)과 똑같은 「쓰기 경로에 grant/policy 누락」 구조.** **수정 00074**: `grant update … to authenticated` + `admin_can_undo_patient_merges`(for update using/with check `private.is_admin()`) — grant만 주면 RLS가 UPDATE를 무음 0행 거부하므로 둘 다 필요. ⭐ **왜 테스트가 못 잡았나**: `test_merge_undo.py`가 전부 `conn=db_conn`(오너 롤) 주입으로 grant/RLS를 우회 → 실 배포 갭 은폐. **회귀 방어**: `test_routers_integration.py::test_MHIST_DONE_01_merge_undo_via_real_grant_path_returns_200` 추가(committed_conn+실 HTTP+acquire_as). **검증**: 라이브 curl POST undo → 500→**200**(`status:"undone"`) + `undone_at`·`undo_reason` 채워짐 + `patient_merge_undo` 감사 1건 + 상태 undoable→undone + 재적재 후 grant 유지 확인.
- ✅ **L16b [병합 되돌림 모달] 병합 시각 UTC 원본 노출 — 해소(2026-08-29)**: `UndoConfirmDialog.tsx:85`만 `event.merged_at` 원본을 그대로 썼음(자매 `MergeEventDetail`은 이미 포맷 적용). `formatHospitalDateTime`로 감쌈. ⭐ G4 전수 grep에서 `RecordPanel.tsx:212 revised_at`도 원본 노출이라 함께 수정.
- ✅ **L23 [전일 미완료 목록] 줄바꿈 — 해소(2026-08-29)**: 원인 — 시각 레일이 `w-14`(56px)인데 전일 행만 `8/29 09:30`(날짜+시각)이라 토큰 중간에서 못나게 접혔다. **수정**(사용자 지시 「한 줄로, 칸 넓혀」): 전일 행만 레일 폭을 넓혀(`w-14`→`w-[88px]`) **「8/29 09:30」을 한 줄로**(날짜 작게·시각 굵게, `whitespace-nowrap`). 시각만인 다른 행은 종전 폭 유지. `TODAY-YDAY-03`의 「날짜 함께 표시」 준수. 검증: TodayPage 23/23·tsc·헤드리스 스샷(`today-l23.png`)에서 한 줄·정보 한 줄 확인.
- 🟡 **L24 [대기목록 /queue 상태별 뷰] 빈 상태 안내 부재 + 의사 폰트**: ① 상태별 뷰가 데이터 0건일 때 **EmptyState 없이 텅 빔** → "자료 있어야 나오나?" 혼란(막다른 느낌). ⚠️ 단 현재 0건은 재시드 직후 오늘 대기 없음이라 데이터 상태일 수 있음(빈 안내만 추가하면 해소). ② "의사" 라벨/셀렉트 폰트 스타일 이상.
- ✅ **L25 [직원 관리] 좌우 윗선 정렬 — 이미 해소(측정 확인 2026-08-29)**: `StaffAdminPage` `styles.right`에 `marginTop:42`(필터칩 30+gap 12만큼)로 오른쪽 초대 패널을 내려 첫 직원 카드와 윗선을 맞춰 둔 상태. 헤드리스 bounding box 측정으로 **첫 카드 top 143 = 오른쪽 패널 top 143** 확인. 코드 변경 불필요(finding만 미갱신이었음).
- 🟠 **L26 [직원 관리] 의사 8명 전부 "초대함·아직 안 들어옴"(미수락) 표시 — 실제론 로그인 됨**: doctor1은 크롤에서 로그인 성공(활성)인데 목록엔 미수락. "활성 10" 카운트와도 불일치. **시드의 수락상태(invited/accepted) 값 또는 판정 로직 문제 추정.** ⚠️ 시드 데이터 이슈일 수 있어 실배포 시드와 대조 필요. 원인 확인 대상.
- ✅ **L27 [캘린더 색 고르개(PalettePicker, 직원 프로필)] — 해소(2026-08-29)**: ⚠️ 화면 귀속 정정 — settings가 아니라 **직원 프로필의 색 고르개**다(색은 `CAL-COLOR-01·04`상 프로필에서만 바꾼다). ① **칩 폭 고정 통일**(`minWidth 34`→`width 62`) — 「사용중」이 붙어도 폭이 안 변한다. ② **애매한 12px 점(●)→또렷한 「띠」 막대**(20×10) — `CAL-COLOR-12`의 「면 색+띠 색」을 그대로 보여 무슨 색인지 바로 읽힌다. 「사용중」은 `CAL-COLOR-07`대로 유지하되 칩 안에서만 채운다. 검증: PalettePicker 12/12 + 헤드리스 스샷(`palette-l27.png`)에서 균일 폭·띠·사용중 라벨 확인.
- 🟠 **L28 [전역] 텍스트-only 버튼이 공통 컴포넌트 없이 제각각 = 근본 문제**: 예) 의사 프로필 "사진 지우기"(`DoctorProfilePanel.tsx` `styles.deletePhoto` 인라인). **전역 grep 결과 `link` 클래스 버튼은 `cal-cancel-link` 1개뿐** — 나머지 텍스트버튼(deletePhoto·병합이력 링크 L21 등)은 **표준 클래스 없이 개별 인라인 스타일**이라 한 번에 못 잡힘. **버튼 스타일 표준(공용 버튼 컴포넌트) 부재가 근본.** 사용자: 텍스트버튼 말고 명확한 버튼 방식 원함. → **전역 버튼 스타일 통일 과제**(각 화면 버튼 전수 필요, grep 불가). ✅ **해소(2026-08-30, `289cec6`)** — 공용 `staff-ui/TextButton`(tone='link'/'quiet', hover 밑줄) 신설 후 **11파일 13버튼 통일**(DoctorProfilePanel 사진지우기·MergeEventDetail·HospitalHoursTable·RecipientField×2·PickBar×2·ComparePanel·ErrorLogPage·AccessLogPage·LogTable·MessagesPage×2·FailedListPanel). 테두리 ghost·탭·클릭행은 텍스트-링크가 아니라 제외. 신화면(Tailwind)은 `btnLink` 유지. 검증 tsc 0·908/908·헤드리스 눈대조. ⚠️ **G3의 나머지**(L46 네이티브 폼·L35·41·45·47 화면군 리스킨·타이포 토큰)는 별건으로 남음 — L28만 떼어 완료.
- ✅ **L29+L30 [의사 프로필] 저장 무동작 — 해소(2026-08-29 밤)**: 근본원인은 **실제 API 500**이었다(G1 (c)). ⚠️ 「save 미배선 의심」은 오진 — save는 배선돼 있었고 서버가 500을 냈는데 **BusyButton이 에러를 삼켜** 무동작으로 보였다. **진짜 원인**: 라우터(`app/routers/staff.py`)와 서비스(`app/services/staff_profile.py`)가 **각자 `_UNSET = object()` 센티널을 따로** 정의 → 서비스의 `is not _UNSET` 검사가 라우터 센티널을 못 알아봐, 안 보낸 칸(bio·color)까지 UPDATE에 실어 asyncpg가 `$3: expected str, got object`로 거부. **수정**: ① 라우터의 별도 `_UNSET` 제거, 보낸 칸만 `**fields`로 넘겨 서비스 기본값이 채우게(seam 제거) ② 프론트 `DoctorProfilePanel` — 성공 시 `저장했습니다.`(role=status), 실패 시 인라인 `actionError`(role=alert), 「떠날 때 묻기」 [저장]도 실패면 안 떠남(조용한 데이터 손실 금지). ⭐ **G1 (c) 처방 확장** = BusyButton 삼킴을 화면 쪽 try/catch로 잡아 이유를 보인다. **검증**: 라우터 회귀 테스트(`test_staff_profile_router.py` — 서비스 단위 테스트는 서비스 센티널만 써서 이 seam을 못 잡았다) + 프론트 vitest 3건(성공 flash·500 인라인·떠날때묻기 미이탈) + tsc·lint:clock + **라이브 curl**(specialty/bio/color 각각 200·저장 확인) + **헤드리스 눈대조**(저장 후 「저장했습니다.」 렌더).
- ℹ️ **참고 [의사 프로필] 소개글 저장 목적지(규칙 확인)**: `screen-behaviors.md:1957`·`1995` — 소개글=`staff.bio`, **환자앱 의사카드(`BOOK-DOC-01~07`) + 상담봇 지식/안내자료(`KBADM-EDITOR-02`)가 읽음**. 단 3·4단계 미구현이라 **지금은 저장만, 읽는 쪽 없음**. (사용자 질문 답)
- ℹ️ **참고 [직원 초대 메일] 미구현 아님 — 환경 설정 건**: `staff_service.py:41` `invite_user_by_email`로 Supabase Auth가 발송 호출. 로컬은 외부 발송 X, **메일 캐처 Inbucket/Mailpit `http://127.0.0.1:54324`에 잡힘**(거기서 열람 가능). 실배포는 Supabase SMTP 설정하면 실발송. (사용자 질문 답)
- ✅ **L31 [직원 사용중지 모달] 긴 영향예약 목록에 하단 버튼 밀림 — 해소(2026-08-29 밤 세션5)**: 영향예약 126건이 내부 스크롤 없이 다 나열돼 [사용 중지] 버튼이 화면 밖으로 밀렸다(= Aside #5 "직원 중지 조용한 실패"의 진짜 원인 — 실패가 아니라 버튼 미접근). **수정**: `DeactivateDialog`의 영향 예약 목록(`styles.times`)에 `maxHeight:38vh · overflowY:auto` — 목록만 내부 스크롤되고 [취소]·[사용 중지]는 늘 보인다. 공유 `ConfirmDialog`엔 손대지 않고 이 모달만 스코프. **검증**: DeactivateDialog 14/14 · tsc 0 · **헤드리스**(126건 모달에서 확정버튼 bottom 718<900 뷰포트 안·스샷 확인). ⚠️ **G2 전역 패턴은 남음**: 다른 긴 모달·패널(L9 등)도 같은 처방 필요(전역 점검 과제).
- ⚪ **L32 [직원 관리] "QA테스트직원" = 어제 Aside 초대 테스트 잔여물**: 재시드가 이 계정 안 지움(auth.users 잔존) → staff=11(정상 10 + 잔여 1). 앱 버그 아님, 클린 재시드 미완. 검수 혼란 방지 위해 삭제 권장. L26 "활성 10 불일치"의 일부 원인.

- ✅ **L33 [진료 일정관리 - 진료과 사용중지] "사용 중지" 확정 무동작 — 해소(2026-08-29 밤)**: G1 (c) 실제 API 실패+피드백 부재. `DepartmentList`의 확인창 `onConfirm`이 **`void onDeactivate(id)`로 결과를 버려**, 서버가 400(`이 진료과에 진료 중인 의사가 있어…`, context.active_doctors)을 내도 확인창만 닫히고 무동작으로 보였다. ⚠️ 원래는 클라 사전판정(`activeDoctorsByDept`, overview 파생)이 활성의사 있으면 confirm 전에 blocking 창을 띄운다 — 하지만 **overview가 비면(L34 DB 훼손·overviewQ 실패·레이스) 0명으로 보여 confirm까지 가고**, 서버 400을 버려 무음이 됐다(데모 4개 진료과 모두 활성의사 2명이라 전부 차단 대상). **수정**: 서버가 권위 — `onDeactivate` 실패를 잡아 `active_doctors` context가 있으면 **blocking 창으로 갈 길**(`SCHED-DEPT-05`, 직원 관리로 가기), 그 밖의 실패는 **인라인 `actionError`**로(막다른 길 대신 이유). 클라 사전판정은 1차 방어로 유지(defense-in-depth). **검증**: vitest 7/7(서버 400→blocking·500→alert 회귀 2건 추가) + tsc 0 + schedule 67/67 + 라이브(내과 deactivate → 400 active_doctors 실측). ⭐ **G1 (c) 패턴 처방** = `void mutation()`으로 결과 버리지 말고 ApiError.context로 갈 길/문구 제공.
- ✅ **L34 [진료 일정관리 - 특정 날짜 변경/휴진일 `DateExceptionPanel`] 달력 깨짐 + 저장/되돌리기 무동작 — 해소(2026-08-29, 2단계)**: ⚠️ **원인이 #6이 아니었다** — `SchedulePage.tsx`가 이 패널에 **모든 props를 stub**(`calendarDays={[]}`·`onSave` no-op·`onSelectDate={()=>{}}`)으로 넘겨 껍데기만 렌더된 것(패널 컴포넌트 자체는 이미 완성·테스트됨). #6(GET hours/closures)는 별개로 1단계에서 이미 해소. **2단계 실배선**: ① 백엔드 신설 — `GET /admin/schedule/exceptions?date=`(그날 예외+의사목록, `SCHED-EXC-05·07·11`), `GET .../exception-days?year=&month=`(달력 ● `SCHED-EXC-02`), `POST .../exceptions`(저장 한 창구, affected 반환 `SCHED-EXC-15`), `DELETE .../exceptions/{id}`(되돌리기 `SCHED-EXC-14`, uuid=의사예외/`hospital:날짜`=병원휴무) ② 영향예약 계산은 `ACTIVE_STATUSES` 재사용, 병원 휴무는 「나온다」고 덮은 의사(is_closed=false override)를 뺀다(`SCHED-EXC-09·11`) ③ 프론트 `calendarGrid.ts`(UTC 순수함수 월간격자) + `SchedulePage` 실배선 ④ **마이그 `00073`** — `doctor_schedule_exceptions`에 빠져 있던 authenticated DELETE grant(라이브 되돌리기가 500 permission denied였다). **검증**: 프론트 vitest(calendarGrid 4·SchedulePage 배선 2·패널 8) + 백엔드 pytest 작성(CI) + **라이브 curl 전 흐름**(저장→affected 8 실측·되돌리기 200·원복 확인).
- ✅ **L35 [진료 일정관리 화면군 전체] "옛날 UI" — 해소(2026-08-29 `2849df1`)**: 병원 운영시간뿐 아니라 진료과·특정날짜·의사스케줄·전체현황·SideRail까지 5개 패널 일괄 리스킨. 네이티브 체크박스→`Checkbox`, 라디오→`Radio`(신설), 시각칸→`TIME_FIELD_CLASS`, 텍스트칸→`TextField`, 버튼→`btnPrimary/btnGhost`, 타이포→위계 토큰, SideRail 폭·keep-all. ⚠️ **스크린샷 눈대조는 DB 안정 후 이월**(리스킨 중 환자 앱 작업으로 로그인/DB 불안정 — tsc+110테스트로 검증).
- ✅ **L36 [병원 운영시간] "월요일 값을 나머지에" 복사가 토요일 제외 = 로직 버그 — 해소(2026-08-29)**: 원인은 규칙 `SCHED-HOURS-12`가 「화~금만(토·일 제외)」로 좁혀 있었고 코드(`HospitalHoursTable.copyMonday`)가 그대로 `weekday 1..4`. 사용자 결정 「토요일 포함」에 따라 `1..5`(화~토, 일요일만 제외)로 수정 + 규칙 `SCHED-HOURS-12` 갱신 + 테스트 12/12. `SCHED-WEEK-07`·`SET-HOSP-05`(토요일 운영)와 정합.
- ✅ **L37·L38 [의사별 스케줄] 마커 미소멸 — 해소(2026-08-29 밤 세션5)**: 빨간 점·행 배경색 = 고친 항목 강조 마커(✅ 사용자 의도 확인, 마커 자체는 버그 아님). ⚠️ **마커가 안 사라진 진짜 원인 = G1 (c) 실패 피드백 부재**: `DoctorWeekTable`의 `handleSave`/`commit`에 **try/catch가 전혀 없어**, `saveWeek`/`regenerate`가 500나면 에러가 삼켜지고 `dirty.reset()`이 안 불려 ●가 남고 무동작으로 보였다. 게다가 확인창 `onConfirm={() => void commit(...)}`은 L33과 같은 **결과 버림** 구조. ⭐ **라이브 실측으론 배선·API 모두 정상**(GET week 200·regenerate dry 200·PUT week 200 saved:1) — 사용자가 본 무동작은 QA 당시 DB churn(hospital_hours 0·스케줄 흔들림) 때 saveWeek/regenerate 500이 삼켜진 것. **수정**: handleSave·commit을 try/catch로 감싸 실패 시 ①확인창은 닫되 ②●·고친 값은 남기고 ③`actionError`(role=alert, 프로필과 동일 danger 토큰) 표시. 성공 경로(reset+status 노트)는 그대로. **검증**: vitest 17/17(직접·확인창 경유 실패 2건 추가, 마커 잔존 단언) + schedule 71/71 + tsc 0 + 라이브 PUT 200 + 헤드리스 레이아웃 확인.
- ✅ **L39 [문진표 관리] 3열 윗선 정렬 — 확인(2026-08-29)**: `QuestionnaireAdminPage` `styles.grid`가 이미 `alignItems:'start'`라 세 열(진료과·편집기·버전) 컨테이너 상단이 같은 격자선에서 시작. 잔여 인상 차이는 각 열 첫 요소(테두리 카드 vs 라벨 텍스트)의 내부 여백 차이로, 개별 정렬 버그가 아니라 G3 리스킨(공용 카드/컬럼 헤더) 범위. 새 변경 없음.
- 🟠 **L40 [문진표 관리] 기본 문진 데이터 시딩 미비 + 진료과명 이상 + 버전 부족**: ① "나딩" 진료과 "문진 없음", 진료과명이 "나딩"·"내과네요" 등 이상(테스트/플레이스홀더 데이터로 보임). ② 각 문진표가 **v1 하나뿐** → **버전 기록 기능을 시연·확인하려면 시드에 여러 버전(v1·v2…) 필요**. 시드 데이터 정비 필요(진료과명·기본 문진표·버전 히스토리).
- ✅ **L41 [문진표 관리 - 질문 카드] "옛날 UI" — 해소(2026-08-29 `0cb57eb`)**: textarea→`TextArea`, 셀렉트 2종→`Select`(딥틸 쉐브론), 체크박스→`Checkbox`, "q1" 라벨→딥틸 배지(primary-wash pill), 저장/추가→공용 버튼, 폰트 위계 매핑. 헤드리스 눈대조 완료. ⚠️ 위로/아래로/삭제 등 인라인 소형 버튼은 그대로 둠(2차 폴리시 대상).
- ✅ **L42 [병원 설정 /admin/settings] UI 통일성 다수 — 해소(2026-08-29, G3 시범 `e52fb3d`+후속)**: ① 저장/되돌리기 → **우하단 sticky 액션 바**로 이동(진료일정과 통일, `HSET-SAVE-01`·`HSET-MSG-31` 개정). ② 폰트 → 위계 토큰(제목·섹션·본문·캡션). ③ "24" 숫자칸 → 테두리 있는 `NumberField`(편집 가능 명확). ④ 카드 폭 → 본문 `max-width 920`. 〈원래 지적〉 ① 좌상단 vs 우하단 불일치 · ② 폰트 유독 큼 · ③ 입력칸 편집성 안 보임 · ④ 카드 폭 과다.
- ✅ **L43 [병원 설정 - 대기실 운영] 컨트롤 가시성 — 해소(2026-08-29 `e52fb3d`)**: 체크박스 → 딥틸 커스텀 `Checkbox`, "30" → 테두리 있는 `NumberField`(편집 가능 명확). 〈원래〉 체크박스 용도 불명확 · 숫자 편집성 안 보임(L42-③ 동일).
- ✅ **L44 [병원 설정 - 문자 발송] 폰트·용어·카드폭 — 해소(2026-08-29 `e52fb3d`)**: ① 폰트 → 위계 토큰. ② "(폴백)" 삭제("앱을 안 쓰는 환자에게만"). ③ 셀렉트·수신거부 칸을 프리미티브로, 본문 폭 제한. 〈원래〉 폰트 불일치 · "폴백" 전문용어 · 카드 폭 과다.
- ✅ **L45 [병원 설정 - 자동 알림] 디자인 미적용 — 해소(2026-08-29 `e52fb3d`)**: 네이티브 textarea → `TextArea`(딥틸 테두리), "문자도 발송" 체크박스 → `Checkbox`, 토큰 알약칩. ⚠️ **같은 계열의 L35(운영시간)·L41(문진)은 아직** — 화면군 리스킨 남음.

- 🟠 **L46 [전역] 네이티브 체크박스·폼 요소가 커스텀 없이 서비스 전역 노출**: ⚠️ **Tailwind는 설치돼 있으나**(`@tailwindcss/vite`,`tailwindcss`) **shadcn 없고 공용 폼 컴포넌트 없음** → `type="checkbox"`·`select`·`input`이 네이티브 기본 모양으로 8곳+ (NotificationSettings·WaitingRoom·HospitalHoursTable·DateExceptionPanel·문진·병합 등). 사용자: "모든 체크가 동일한데 별로, 전체에 나온다". → **공용 커스텀 체크박스/셀렉트/인풋 컴포넌트 1벌 만들어 전역 치환**(Tailwind 활용). G3 근본 해결책. ⏳ **부분 해소(2026-08-29 `e52fb3d`)**: 공용 프리미티브 `staff-ui/fields.tsx`(TextField·NumberField·Checkbox·Select·TextArea) 신설 + **병원 설정 전 탭 치환 완료**. **남은 치환처**: HospitalHoursTable·DateExceptionPanel·DoctorWeekTable(일정), 문진 카드, 병합 등 — 화면군 리스킨 때 같은 프리미티브로.
- ✅ **L47 [병원 설정 - 병원 정보] 입력칸 안 보임 — 해소(2026-08-29 `e52fb3d`)**: 주소·대표전화 → 테두리 있는 `TextField` + 예시 placeholder(preflight가 테두리를 0으로 리셋해 안 보였던 것). 〈원래〉 라벨만 있고 입력칸 안 보임.
- ✅ **L48 [병원 설정] 탭 → 단일 스크롤 제안 — 각하(사용자 결정 2026-08-29)**: 사용자가 **현재 탭 구조 유지**를 택함(섹션이 시각적으로 명확히 구분되고 각 영역이 독립적). 코드 변경 없음.
- ⚪ **L49 [병원 설정 - 좌측 카테고리 목록] ✅ 목록 자체는 OK(사용자 정정)**: 카테고리 목록 자체는 괜찮음. **문제는 각 카테고리의 "내용"(설정 폼)** → 이미 L42~48에 기록됨. L49는 별도 이슈 아님.
- 🟡 **L50 [직원 관리 카드] "해당 없음" 의미 불명확**: 비의사(관리자·접수) 카드에 "마지막 로그인 02:47 · 해당 없음". "해당 없음"은 **소속 진료과 없음** 표시로 추정되나 맥락 없이 붙어 혼란. 문구/표시 방식 개선(비의사는 진료과 칸 자체를 빼거나 명확히).
- ✅ **L52 [진료 일정 관리 - 병원 운영시간] 표가 카드 없이 맨 배경에 떠 있음 — 해소(2026-08-29 밤 세션5, 사용자 지시)**: 같은 화면의 다른 탭(전체현황·의사별 스케줄 등)은 모두 흰 테두리 카드로 감싸는데 `HospitalHoursTable`만 bare `<div>`였다. 표를 `tableCard`(border+radius+surface+shadow)로 감싸 형제 탭과 시각 통일. **검증**: HospitalHoursTable 12/12 · tsc 0 · 헤드리스 눈대조(카드 적용 확인).
- ✅ **L51 [시드 갭] `hospital_hours` 표가 시드에 없음 — 해소(2026-08-29 밤 세션5)**: `00041`은 표만 만들고 기본 행을 안 넣어, 클린 리셋 시 0행 → 「진료 일정 관리」 사이드바 부제·상담봇 "지금 문 열렸나" 판정이 **프론트 하드코딩 기본값(09:00~18:00)으로 폴백**해 "하드코딩처럼" 보였다(= 사용자 지적 "작은 글자가 하드코딩인 거 같은데"의 원인 — 부제는 실은 `hoursSummary(hours)`에 연동돼 있고, DB가 비어 폴백한 것). **수정**: `seed_demo.sql §4b`에 `hospital_hours` 6행(월~금 09~18·점심 12~13, 토 09~13, 일요일은 행 부재=휴무) `ON CONFLICT (weekday) DO NOTHING`으로 추가 — 기존 저장값은 보존하고 빈 DB에서만 채운다. **검증**: INSERT 구문 라이브 실행(`INSERT 0 0`, 기존 6행 보존) + 현재 DB엔 이미 6행 있어 부제가 실제값 "평일 09:00~22:00" 표시 확인(헤드리스). ⚠️ 예약 시각 검증은 여전히 `doctor_schedule_rules` 기준(별개).

### ⭐ UI 수정 방침 (사용자 지시 2026-08-29)
- **UI/디자인 수정 시 반드시 `frontend-design:frontend-design` 스킬을 호출**한 뒤 작업한다(메모리 [[feedback-frontend-worker-brief-must-include-design-lens]] 원칙과 일치). G3·L35·L41·L42~47 등 스타일·리스킨 작업 전 이 스킬 먼저.
- **폼 요소는 Tailwind가 이미 있으니** 공용 커스텀 컴포넌트(체크박스·셀렉트·인풋·토글)를 1벌 만들어 전역 치환하는 게 근본 해결(L46).

## 8. ⭐ 전역 패턴 (개별 L을 묶음 — 수정도 이 단위로)

> 사용자 직관("많은 곳이 이런 식이다")으로 드러난 것들. 화면 하나씩 고치기 전에 **패턴 단위로** 고쳐야 재발 안 함.

- 🔴🔴 **G1 [최우선] 저장/확정 버튼 조용한 무동작 (전역)**: 여러 화면에서 `[저장]`·`[확정]` 눌러도 반응 없음. 사례 = **L1**(예약 취소·변경), **L22**(병합 되돌림), **L29·L30**(의사 프로필), 병원설정·캘린더색 저장, + 어제 Aside **#2**(안내발송)·**#5**(직원중지 — 실은 L31 버튼 미접근일 수도)·**#9**(진료완료)도 이 계열 의심. **원인 세 갈래**: (a) **핸들러 미배선**(onSave/onCancel `undefined` — L1 확정) · (b) **성공 피드백 부재**로 됐는지 모름(L29) · (c) **실제 API 실패**(L22). → 크롤3 `silent_write` 감지가 (a)(c) 자동 검출. **모든 저장/확정 버튼의 배선·피드백 전수 점검**.
  - ✅ **해소분(2026-08-29 밤)**: L1 취소·L22·L33·L34 + **L29·L30(의사 프로필)** = (c)+(b) 해소. 프로필은 라우터↔서비스 이중 `_UNSET` seam 500이 근본. **⭐ (c) 공통 교훈**: BusyButton은 onClick 에러를 삼키므로(finally만) **화면 쪽 save()가 try/catch로 잡아** flash(성공)·actionError(실패)를 보여야 한다. 라우터 seam 버그는 **서비스 단위 테스트로 안 잡히니 라우터 경유 테스트**를 함께 둘 것.
  - ✅ **병원설정(`/admin/settings`) 저장·되돌리기 — 해소(2026-08-29 밤 세션5)**: ⚠️ crawl3 dead-click은 **오탐**이었다 — 크롤러가 **변경 없이** 눌러 `dirtyCount===0` early-return을 무동작으로 오인. **라이브 실측으로 배선·API 정상 확인**(PUT `/admin/settings` 200·version 증가, 변경 후 저장·되돌리기 모두 동작). 진짜 갭은 **(b) 성공 피드백 부재** 하나 — 저장돼도 「저장하지 않은 변경」 배지만 조용히 사라져 프로필과 불일치. **수정**: doSave 성공 시 `저장했습니다.`(role=status, 프로필과 동일 primary-wash flash), 다시 고치기 시작하면 지움. **검증**: vitest 19/19(성공 flash·재편집 시 소멸 회귀 추가) + tsc 0 + 라이브 PUT 200 + 헤드리스 눈대조(flash 렌더 확인).
  - ✅ **의사별 스케줄 [저장] — 해소(2026-08-29 밤 세션5)**: L37·L38 참조. try/catch+actionError로 (c) 마감. 배선·API는 정상이었고 실패 피드백만 없었다.
  - ✅ **캘린더색 저장 — 이미 해소(L29·L30 프로필 수정 b4da03c에 포함, 세션5 실측 확인)**: 규칙상 색은 **`/admin/staff` 프로필에서만** 바꾼다(CAL-COLOR-01·04). `DoctorProfilePanel.save`가 `calendar_color_index`(팔레트 번호, CAL-COLOR-09)를 바뀐 칸만 PATCH하고 성공 flash·실패 actionError를 이미 가짐. **라이브 실측**: `PATCH /staff/{id}/profile {calendar_color_index}` 200·값 반영·복원 확인. 별도 코드 변경 불필요.
  - 🏁 **G1 전부 해소** — 남은 G1 없음(모든 저장/확정 버튼 배선·피드백·API 점검 완료).
- 🟠 **G2 모달·패널 내부 스크롤 부재 (전역)**: 긴 내용에서 하단 버튼 잘림. 사례 = **L31**(직원중지 126건), **L9**(긴 텍스트 오버플로우). → 모달·패널에 `max-height`+`overflow:auto`, 액션 버튼 sticky 처리 전역 점검.
- 🔴🔴 **G3 [최우선·서비스 전반] 디자인 시스템 일관성 부재 — ⭐ 사용자 종합 판단**: "전체적으로 폰트 크기·스타일 정리가 안 돼 있다. 서비스 전반의 문제다." 화면마다 폰트 스케일·스페이싱·컴포넌트 스타일이 제각각 → "다른 앱 같은" 느낌. **근본 해결 3단계**: ① 타이포/스페이싱 **토큰(스케일) 정립** ② **공용 컴포넌트 1벌**(버튼·텍스트버튼·체크박스·셀렉트·인풋·토글·카드 — Tailwind 활용, L46) ③ **화면군 일괄 리스킨**. 개별 사례 = **L10·L19·L21·L27·L28**(텍스트버튼/스타일) · **L35·L41·L45·L47**(옛날UI 화면군) · **L42·L43·L44**(설정화면 폰트·컨트롤 가시성·통일) · **L46**(네이티브 폼). ⚠️ 개별 화면 땜질 말고 **토큰+컴포넌트부터**. `frontend-design` 스킬 필수.
  - ⭐ **G3-a 타이포 위계 지시(사용자 2026-08-29)**: 폰트 통일 시 **「상위 개념은 크고 굵게 / 하위는 작고 가늘게」의 위계**를 명확히 둘 것. 크기만이 아니라 **굵기도 상위/하위로 나눈다.** 지금은 화면마다 폰트 크기·굵기가 뒤섞여 정돈 안 된 느낌 → 위계 토큰(예: `--fs-title`/`--fs-section`/`--fs-body`/`--fs-caption` + weight 짝)을 정립하고 「제목·섹션·본문·캡션」 레벨을 화면 전역에 일관 적용. ① 토큰 스케일 정립 단계에서 이 위계를 설계에 반영한다.
- 🟠 **G4 시각 UTC 원본 노출 (전역)**: `formatHospitalDateTime` 누락. 사례 = **L16**(드릴다운)·**L16b**(되돌림 모달). → 시각 렌더 지점 전수 grep(`occurred_at`·`requested_at`·`created_at` 직접 출력) + 크롤3 `raw_utc_time` 결과로 보강.
- 🟡 **G5 빈 상태·정렬·줄바꿈 다듬기 (전역)**: **L23**(줄바꿈)·**L24**(빈 상태)·**L25**(윗선 정렬). 개별이나 마감 품질 묶음.
