# 데모 프론트엔드 — 직원웹 slice2 병렬 워커 계획 (2026-08-22)

> **시연용 클릭 목업(데모 프론트엔드)** 트랙. 실제 구현체가 아니라 "보여주기용 껍데기"다.
> 직원웹 척추(로그인→오늘현황→대기목록→접수→환자상세)와 slice2 토대(공용 프리미티브 `_ui.tsx` + 환자 검색)는 이미 완성·커밋됨.
> 이 계획은 **남은 직원웹 화면 16개를 5개 워커가 병렬로** 붙인다. 코디네이터가 라우팅을 병합 때 배선한다.

---

## 공통 헤더 (모든 워커가 먼저 읽는다)

**너는 이 계획서의 배정된 `Worker N` 섹션 하나만 수행한다.** 다른 Worker 섹션은 다른 워커가 맡으므로 건드리지 않는다.

### 이 프로젝트가 무엇인가
- **시연용 데모**다. 실제 Supabase·인증·React Query·마이그레이션 **없음**. 버튼이 경로를 바꾸고, 가짜 데이터를 읽어 화면을 보여주는 게 전부.
- **직원웹은 데스크톱 웹**이다. 폰 프레임 없음. 좌측 딥틸 사이드바(`StaffShell`)가 이미 있고, 네가 만드는 화면은 그 오른쪽 본문에 렌더된다.
- 작업 디렉토리는 `demo/`. 모든 명령은 `cd demo` 후 실행.
- **이 워크트리는 새 체크아웃이라 `demo/node_modules`가 없다.** 맨 처음 한 번 `cd demo && npm install`을 실행한 뒤 tsc/vitest/build를 돌려라.

### 기술 스택 (반드시 맞출 것)
- Vite + React 18 + TypeScript + TailwindCSS v4 + shadcn/ui + `react-router-dom`.
- 아이콘은 **`@/components/icons`에서 named import만** 쓴다(Phosphor 채움). ⛔ `lucide-react` 직접 import 금지, ⛔ 이모지 금지.
  - 사용 가능한 아이콘(이것만 있다): Activity, AlertCircle, AlertTriangle, ArrowLeft, BarChart3, Bell, CalendarCheck2, CalendarClock, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock3, ConfettiIcon, ExternalLink, Eye, EyeOff, FileText, FlagIcon, HelpCircle, History, Home, Hospital, Layers3, LockKeyhole, LogOut, MapPin, MessageCircle, Pencil, Phone, QrCode, SealQuestionIcon, Search, Send, Settings, Settings2, ShieldCheck, Sparkles, Stethoscope, UserPlus, UserRound, UserRoundPlus, UserRoundSearch, Users, X, XCircle.
  - 더 필요한 아이콘이 있으면 위 목록에서 가장 가까운 것으로 대체한다(`icons.tsx`를 수정하지 마라 — 공유 파일).
- 경로 alias `@` = `demo/src`.

### 절대 규칙 (어기면 병합이 깨진다)
1. **자기 폴더 안에만 파일을 만든다** — 아래 배정된 폴더. 다른 워커 폴더·공용 파일을 건드리지 마라.
2. **다음은 절대 수정하지 마라**: `src/App.tsx`, `src/main.tsx`, `src/routes/staff/routes.tsx`, `src/routes/staff/StaffShell.tsx`, `src/routes/staff/_ui.tsx`, `src/routes/staff/mockData.ts`, `src/routes/staff/staffState.tsx`, `src/components/**`, `src/index.css`, `components.json`, `package.json`, 다른 워커의 폴더. **라우팅 등록은 코디네이터가 병합 때 한다** — 너는 화면 컴포넌트 파일만 만들고 named export 하면 된다.
3. **공용 프리미티브는 import만** 한다(직접 만들지 마라 — 화면들이 한 모습이어야 한다):
   ```ts
   import { StaffPage, PageHead, Panel, StatusBadge, Tag, Toolbar, Segmented, EmptyState, StatTile, SearchInput, btnPrimary, btnGhost, btnLink } from '../_ui'   // 폴더 깊이에 맞게 ../ 조정
   import { maskPhone, maskBirth } from '../mockData'
   import { useStaff } from '../staffState'
   ```
   - `Panel`은 각진 촘촘 패널(`border-border/70` + 미세 그림자). `StaffPage`는 본문 래퍼(가운데 정렬 + 데모 꼬리말). `PageHead`는 제목/부제/우측 액션.
   - `StatusBadge status="진료 대기"` 등은 상태 문자열을 색배지로. `btnPrimary/btnGhost`는 버튼 클래스 문자열.
4. **묶음 고유 가짜 데이터·타입은 자기 폴더에** `mockData.ts`로 둔다.

### 시각 정체성 — 직원 콘솔 (중요, 환자앱과 다르다)
- **색은 shadcn 의미 토큰 클래스만.** hex 하드코딩 ⛔. 쓰는 토큰: `bg-background text-foreground text-muted-foreground bg-muted bg-card border border-border border-input bg-primary text-primary-foreground text-primary bg-primary/10`. 상태 색은 `StatusBadge`가 처리.
- **패널 = 각지고 촘촘하게**(폭신한 환자앱 카드 아님): `Panel` 프리미티브를 써라. 직접 그릴 땐 `rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]`.
- **업무 밀도**: 본문 기준 글자 `text-sm`, 촘촘한 간격, 표/목록은 `divide-y divide-border/60`.
- **기준 화면을 그대로 본떠라**: `src/routes/staff/patients/PatientSearch.tsx`(검색·목록·배지·빈상태·상태별 동작), `src/routes/staff/patient/PatientDetail.tsx`(2열 섹션 그리드·읽기전용 표·내부메모 추가), `src/routes/staff/today/Today.tsx`(2열+사이드 레일·타일). 새 시각 언어를 발명하지 마라.

### 정본 대조 절차 (화면 문구·흐름의 진본)
- 정본은 `docs/design/screen-behaviors.md`다(1MB+, 통독 금지). **배정된 줄 범위만** `Read`(offset/limit) 또는 `grep -n`으로 펼쳐 읽어라.
- 규칙 ID(`STAT-METRIC-01` 등)의 「동작」 열을 화면에 반영하되, **데모라 비가시 엣지 규칙은 건너뛴다**: `*-LIVE-*`(Realtime), `*-ERR-*`/`*-STATE-*`/`*-LOAD-*`(오류·로딩·재시도), `*-RACE-*`/`*-EXC-*`(동시성·예외), 세션 만료. 이런 것 대신 **정상 흐름 UI**(정상 목록·정상 버튼·빈 상태·상태별 표시)만 만든다.
- 규칙과 목업이 어긋나면 **규칙이 이긴다**.

### 환자 노출·안전 문구 규칙 (프로젝트 확정 — 반드시)
- 취소·변경 상담 연결 시 **"취소 요청이 접수/등록됐다" 표현 금지.** 오직 **"상담(직원 확인)으로 연결됐다/직원 확인 중"** 계열만.
- **되돌릴 수 없는 동작**(상담 종료·병합 확정·직원 정지 등)의 확정 버튼은 **확인창 안에서만** 노출한다.
- **마스킹**: 목록 화면의 전화·생년월일은 `maskPhone`/`maskBirth`로 가린다. 단건 상세는 전체 노출.
- **개인정보 열거 방지**·**막다른 길 금지**(막을 땐 해결 경로 함께).

### 검증 & 커밋 (매 화면/커밋마다)
- `cd demo && npx tsc --noEmit -p tsconfig.app.json` **통과** + `npm run build` **통과** 확인 후 커밋.
- 로직 함수(필터·정렬·집계 등)가 있으면 **vitest 단위테스트 최소 1개**(빈 테스트 금지, 실제 `expect`). 정적 화면은 렌더 스모크(`data-testid` + `getByTestId`)를 권장.
- 각 화면 최상위 div에 `data-testid`를 단다(파일 헤더 주석에 명시).
- **자기 폴더 파일만** `git add`. 커밋 메시지 `feat(demo): 직원웹 <화면묶음> ...`. 커밋 푸터는 아래 두 줄을 그대로:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01K5WCCu3w835NuKNEXg95W5
  ```
- 이 워크트리에서 **커밋만** 한다(push·병합 금지). 다 끝나면 마지막 줄에 `DONE`을 출력한다.
- **컴포넌트는 반드시 named export**(`export function Tickets() {...}`). 코디네이터가 그 이름으로 routes.tsx에 배선한다.

---

## Worker A — 문의 티켓함 + 전체 상담 기록

**폴더**: `src/routes/staff/tickets/`, `src/routes/staff/chatlog/`
**만들 파일·export**:
- `tickets/Tickets.tsx` → `export function Tickets()` · `data-testid="staff-tickets"`
- `chatlog/Chatlog.tsx` → `export function Chatlog()` · `data-testid="staff-chatlog"`
- 각 폴더 `mockData.ts`(티켓·상담 가짜 데이터)

**정본 줄범위**(grep로 재확인): 문의 티켓함 `TICKET-INBOX-*` **5381~5401**, 티켓 상세 `TICKET-DETAIL-*` **5402~5452**, 전체 상담 기록 `CHATLOG-LIST-*` **5453~5472**, (참고) 오답 신고 `BADRPT-FORM-*` 5473~5491.

**① 문의 티켓함(`Tickets`)** — **분할 화면**(왼쪽 티켓 목록 + 오른쪽 넓은 상세 작업공간). 정상 흐름:
- 상태 탭 3개: `새 문의`(pending)·`처리 중`(in_progress)·`답변 완료`(answered) — `Segmented`로. 탭별 건수 표시(0건도). 접수순(오래된 먼저).
- 왼쪽 목록 행: 환자 질문 요약·인계 이유·접수시각·현재 담당자(미배정이면 `미배정`). 예약 상담 티켓이면 `취소 상담`/`변경 상담` 태그 + 짧은 예약 요약.
- **새 문의 행 선택** → 그 직원에게 배정되고 `처리 중`으로 옮겨지며(데모는 로컬 state) 오른쪽 상세를 연다.
- 오른쪽 상세(`TICKET-DETAIL-*`): 위→아래 순서 = **담당 이관**(활성 직원 드롭다운 + `[이관]`) → **인계 요약 5항목**(`환자가 궁금해한 내용`·`상담봇이 확인한 정보`·`이미 안내한 내용`·`해결되지 않은 이유`·`직원이 확인할 사항`, 값 없으면 "없음") → **전체 대화**(AI·환자·직원 말풍선 시간순, 발신 주체 구분) → **답변 작성 입력칸 + `[보내기]`** → 그와 **분리해서** `[상담 종료]`. 상태 라벨: pending=`직원 연결 중`, in_progress=`직원 상담 중`, answered=`상담 종료`.
- **`[상담 종료]`는 확인창 안에서만** 실행(되돌릴 수 없음). 미전송 답변이 있으면 "먼저 보낼까요?" 경고 함께.
- 예약 상담 티켓 상세엔 `[캘린더에서 예약 처리]` 버튼(데모는 `/staff/calendar`로 navigate).
- 빈 탭: "그 상태의 문의가 없습니다".

**② 전체 상담 기록(`Chatlog`)** — 앱+웹 상담을 한 목록에:
- 채널 필터(앱/웹)·갈래 필터(`route_taken`: AI 해결/직원 연결/예약 상담 등)를 `Segmented`나 칩으로. 목록 행: 채널·갈래·질문 요약·시각.
- 행 클릭 → 오른쪽 패널이나 확장으로 **상담 원문·AI 답변·답변 근거**(승인 근거 자료명, 없으면 "근거 자료 없음"). 봇 답변에 `[잘못된 답변 신고]` 버튼(데모는 안내 토스트/간단 폼).
- 0건 필터 결과: "조건에 맞는 상담 기록이 없습니다".

---

## Worker B — 예약 캘린더 + 안내 보내기 + 의사 콘솔

**폴더**: `src/routes/staff/calendar/`, `src/routes/staff/messages/`, `src/routes/staff/doctor/`
**만들 파일·export**:
- `calendar/Calendar.tsx` → `export function Calendar()` · `data-testid="staff-calendar"`
- `messages/Messages.tsx` → `export function Messages()` · `data-testid="staff-messages"`
- `doctor/DoctorConsole.tsx` → `export function DoctorConsole()` · `data-testid="doctor-console"`
- 각 폴더 `mockData.ts`

**정본 줄범위**: 예약 캘린더 `CAL-*` **903~1010**, 전화예약 패널 `CAL-BOOK-*` **990~1076**, 취소·변경 상담 경고 `SUPPORT-CAL-*` **5528~5548** · 안내 보내기 `SEND-*` **346~470**, 여러 명 고르기 `PICK-*` 312~345 · 의사 콘솔 `DOCTOR-*` **1768~1900**.

**① 예약 캘린더(`Calendar`)** — 하루 보기(의사 열):
- 상단: 날짜 이동(`‹ 오늘 ›`)·진료과/의사 필터. 본문 = **시간 행(30분 간격) × 의사 열** 격자. 각 예약은 색 블록(환자명·시각·상태). 취소·변경 상담이 걸린 예약엔 모서리에 `⚠`(`AlertTriangle`) + `취소 상담`/`변경 상담` 구분.
- 블록 클릭 → 오른쪽 **사이드 패널**(예약 상세: 환자·시각·상태·`[예약 변경]`·`[예약 취소]`, 상담 경고면 `직원 확인 중` 표시 + 상담 맥락 보기). 취소/변경 확정은 확인창 안에서.
- 오른쪽 상단 `[+ 전화 예약]` → 사이드 패널로 전화예약(환자 찾기=한 칸 통합검색 재현, 시간은 격자에서 고르기). 데모는 간단히.

**② 안내 보내기(`Messages`)** — `SEND-*`:
- 화면 = **위 「예약해 둔 것」 구역 + 아래 「보낸 것」 구역**(예약해 둔 것 0건이면 그 구역 사라지고 「보낸 것」만). 각 행: 종류·내용·보낸 직원·채널·시각·대상 수·발송 결과. 맨 아래 `자동 발송 41건 보기 ›` 접힘 줄.
- `[+ 새로 보내기]` → 오른쪽 패널(받는 사람 비어 있음 → 검색으로 추가 or `전 환자에게 보내기`(확인 필요) · 내용 작성 · 채널 · `[지금 보내기]`/`[예약 발송]`).
- `대상 N명` 클릭 → 명단(이름·번호 마스킹·그 사람 발송 결과).

**③ 의사 콘솔(`DoctorConsole`)** — `DOCTOR-*`(로그인 의사 계정용, 데모는 항상 표시):
- 3단 or 2단: 왼쪽 **오늘 대기 목록**(내 환자, 순번), 가운데/오른쪽 **현재 환자 컨텍스트**(방문 이유·사전문진 요약·과거 진료기록 읽기전용·내부 메모) + **진료기록 작성칸**(작성 → `[진료 완료]`). 되돌리기(진료중→도착 등)는 회색 버튼. 진료문구(자주 쓰는 소견) 빠른 삽입 칩.

---

## Worker C — 관리자 기록 5화면 (읽는 화면 위주)

**폴더**: `src/routes/staff/admin/record/` (모든 파일 이 한 폴더 안)
**만들 파일·export**(전부 named export, `data-testid`는 파일명 소문자-kebab):
- `Stats.tsx` → `Stats` · `staff-stats`
- `AccessLogs.tsx` → `AccessLogs` · `staff-access-logs`
- `MergeCandidates.tsx` → `MergeCandidates` · `staff-merge-candidates`
- `MergeHistory.tsx` → `MergeHistory` · `staff-merge-history`
- `Errors.tsx` → `Errors` · `staff-errors`
- `mockData.ts`(다섯 화면 공용 가짜 데이터)

**정본 줄범위**: 운영 통계 `STAT-*` **2307~2380**, 접근 기록 `ALOG-*` **1997~2078**, 중복 환자 후보 `MERGE-*` **2156~2240**, 병합 되돌림 이력 `MHIST-*` **2536~2600**, 시스템 오류 `ERRADM-*` **2241~2306**.

- **운영 통계(`Stats`)**: 기간 선택 + 지표 타일(`StatTile`: 예약/방문/취소/부도/완료/상담 등, 요구사항 3.2) + 유입원/상태 분포(간단 막대) + `[CSV 내려받기]`(감사 남는다는 안내) + **소수 집계 보호**(k<5는 `표시 억제` 문구). 드릴다운 목록은 마스킹.
- **접근 기록(`AccessLogs`)**: 「누가·언제·무엇을·왜」 감사 목록. 필터(기간·직원·유형). **번호 열람**과 **검색**을 구분 표시. 마스킹 해제·대량 열람에 표시 경계. 목록 행: 시각·직원·대상·동작(번호 펼침/검색/상세 열람)·사유.
- **중복 환자 후보(`MergeCandidates`)**: 후보 쌍 목록(이름·생년·전화·기록건수). 행 열면 **두 후보 비교**(나란히). **3단계 확인 + 읽음 체크 + 확인창**(비가역·원본 보존 안내). 대표 선택.
- **병합 되돌림 이력(`MergeHistory`)**: 지난 병합 목록(언제·누가·두 환자·되돌림 여부). 관리자 직접 되돌림 진입(별도 감사 사건 안내).
- **시스템 오류(`Errors`)**: 기간 필터 + 오류 목록(시각·유형·안전 요약). 상세는 **안전 요약 + redaction된 기술 상세**(개인정보 없음). 알림 발송 실패는 이중기록 경계 표시.

---

## Worker D — 관리자 설정 4화면

**폴더**: `src/routes/staff/admin/config/`
**만들 파일·export**:
- `StaffAdmin.tsx` → `StaffAdmin` · `staff-admin-staff`
- `Schedule.tsx` → `Schedule` · `staff-schedule`
- `Questionnaires.tsx` → `Questionnaires` · `staff-questionnaires`
- `HospitalSettings.tsx` → `HospitalSettings` · `staff-hospital-settings`
- `mockData.ts`

**정본 줄범위**: 직원 관리 `STAFF-*` **1901~1996**(⚠️ `STAFF-LOGIN-*`(로그인)과 다른 화면, `/admin/staff`), 진료 일정 `SCHED-*` **1168~1342** + 일정 변경 여파 `SCHED-*`(변경) 1461~, 병원 설정 `HSET-*` **1343~1460** + `HSETX-*` 2444~, 문진표 관리 `QADM-*` **2079~2155**.

- **직원 관리(`StaffAdmin`)**: 직원 목록(이름·역할·진료과·상태 활성/휴직/정지). `[직원 추가]` 폼. 역할 배지. **의사 비활성화 시 「확인 필요」 큐**(그 의사의 앞으로 예약을 손봐야 함) 안내. 정지 같은 위험 동작은 확인창 안에서.
- **진료 일정(`Schedule`)**: 주간 격자(요일 × 의사/진료과) 근무·휴진 표시. 휴진 등록 시 **영향받는 예약** 개수 안내. `[휴진 등록]`·`[근무 추가]`. 목업 67·69.
- **문진표 관리(`Questionnaires`)**: 진료과별 문진 문항 목록. **불변 버전**(발행되면 읽기전용 보존, 수정은 새 버전) — 버전 배지·`[새 버전 만들기]`. 문항 편집(추가/순서). 발행 확인창.
- **병원 설정(`HospitalSettings`)**: 좌측 하위 탭(예약 규칙·대기실 운영·문자 발송·병원 정보·알림). 각 탭 폼(토글·입력). `[저장]`은 변경 있을 때만 활성. 끌 수 있는 스위치.

---

## Worker E — 상담봇 관리자 5화면

**폴더**: `src/routes/staff/bot/`
**만들 파일·export**:
- `Knowledge.tsx` → `Knowledge` · `bot-knowledge` (안내자료 목록·편집·수정이력)
- `Unresolved.tsx` → `Unresolved` · `bot-unresolved` (미해결 질문 모아보기)
- `Reports.tsx` → `Reports` · `bot-reports` (오답 신고 처리함)
- `Quality.tsx` → `Quality` · `bot-quality` (상담 품질 리포트 + 참고 예시)
- `Overview.tsx` → `Overview` · `bot-overview` (상담봇 처리 현황 = 지표 + 많이 들어온 질문 순위)
- `mockData.ts`

**정본 줄범위**: 안내자료 `KBADM-LIST-*` **5607~5620**·`KBADM-EDITOR-*` **5621~5642**·`KBADM-HISTORY-*` **5643~5656**, 미해결 `UNRES-CLUSTER-*` **5657~5672**, 오답 처리함 `BADINBOX-REVIEW-*` **5673~5689**, 품질 `QUALITY-REPORT-*` **5690~5706** + 참고 예시 `QAEX-LIST-*` **5707~5721**, 처리 현황 `BOTSTAT-DASH-*`·`QTOP-RANK-*` **5722~5761**, 화면 이동 `NAV-ADM-*` 5762~.

- **안내자료(`Knowledge`)**: 병원 안내자료(KB) 목록(제목·상태 공개/검토 중/임시저장·수정일). 행 열면 편집기(제목·본문·`[승인 요청]`/`[승인]`). **승인 전 비공개**·**승인 성공 전 기존본 유지** 안내. 수정이력 탭(누가·언제·무엇을).
- **미해결 질문(`Unresolved`)**: 상담봇이 답 못 한 질문을 유사도로 묶은 클러스터 목록(대표 질문·건수). **자동 묶음 한계 안내 항상 표시**. 클러스터 열면 예시 질문들 + `[안내자료로 답 만들기]`.
- **오답 처리함(`Reports`)**: 직원이 신고한 오답 목록(신고 출처 `realtime_report`/`quality_review` 구분·대상 답변·올바른 안내·상태). 처리(반영/보류). **승인 전 미반영** 안내.
- **품질 리포트(`Quality`)**: 기간별 상담 품질 지표(해결률·직원 연결률·평균 응답 등 타일) + 예시 대화 목록 + **참고 예시 관리**(향후 유사 질문 예시로 사용 체크된 것들).
- **처리 현황(`Overview`)**: 운영 지표 타일(총 상담·AI 해결·직원 연결·미해결) + **많이 들어온 질문 순위**(TOP N, 자동 유사도 묶음 한계 안내, `현재 집계할 수 없음`은 계약 부재만) + 유입원 3분류(앱/웹/직원). CSV는 k=5 미만 억제.

---

## 코디네이터(통합) 메모 — 워커가 읽을 필요 없음
- 각 워크트리 완료 후 코디네이터가 순서대로 병합(격리 폴더라 충돌 0). 그 뒤 `routes/staff/routes.tsx`의 자리표시자 `p('...')`를 각 화면 컴포넌트 import+element로 교체하고, StaffShell nav는 이미 전 경로를 담고 있으니 손대지 않는다.
- 전체 `npx tsc --noEmit -p tsconfig.app.json`·`npm run build`·수동 라우팅 확인 후 slice2 완료 커밋.
- 데모 안내 포털·확정 테마 인터뷰·Vercel 배포는 그다음 별도 단계.

---

## ⭐ 2차 재작업 — 품질 기준 (Claude 워커, 2026-08-22)

> 1차(codex)는 동작은 맞으나 밋밋했다. 이번엔 **Claude가 처음부터 다시** 짓는다. 기존 파일은 **넘어야 할 바닥**이지 복제 대상이 아니다. `frontend-design` 스킬을 먼저 호출해 그 렌즈로 짓되, **직원 콘솔의 확립된 정체성(딥틸 잉크 사이드바·각진 촘촘 패널·업무 밀도)은 유지**한다 — 화면마다 튀는 게 아니라 **한 시스템으로 세련되게**.

**반드시 올릴 것**:
1. **시각 위계 또렷하게** — 섹션 제목·부제·본문·보조문의 크기/굵기/색 대비를 분명히. 한 화면 안에서 무엇이 먼저 눈에 들어오는지 의도적으로.
2. **간격 리듬 일관** — 패널 간·섹션 간·행 간 간격을 4의 배수로 통일. 답답하지도 헐겁지도 않게.
3. **정보 밀도 있는 실데이터** — 목록은 8~15행, 상태·값이 다양하게(빈 상태도 한 번은 보여줄 수 있게). 숫자는 `tabular-nums`, 정렬 맞춤.
4. **정본 규칙 더 넓게 반영** — 배정 섹션의 「동작」 열을 빠짐없이(비가시 엣지만 제외). 특히 화면의 **핵심 안전장치**(마스킹·감사 안내·확인창·유사도 한계·k<5 억제·되돌리기 등)를 실제 UI로.
5. **마감 디테일** — hover 상태, 포커스 링, 빈 상태 안내(할 일 제시), 아이콘 정렬, 배지 색 일관, 표 헤더 고정감. 막다른 길 0.
6. **절제** — 화려한 히어로·과한 애니메이션 금지. 담백하되 정밀하게(업무 도구). `prefers-reduced-motion` 존중.

**기존 파일 처리**: 자기 폴더의 기존 화면 파일을 **덮어써서 다시 쓴다**(또는 지우고 새로. 단 파일명·export명·경로는 계획서 그대로 유지 — 코디네이터 배선이 그 이름에 의존한다). `data-testid`는 **반드시** 최상위 div에 단다(1차에서 상담봇 화면이 빠뜨렸다).

**검증·커밋은 1차와 동일**(tsc+build 통과, 자기 폴더만 add, 끝에 DONE).
