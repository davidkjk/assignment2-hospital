# 직원웹 데모 포팅 마스터 계획 (Demo Port)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직원웹 프론트(`frontend/`)를 데모(`demo/src/routes/staff/`)의 "직원 콘솔" 시각 정체성으로 재정렬한다. **셸·공용부품·세 문은 구조째 포팅**(실에 없거나 얇음), **17개 화면은 시각만 폴리시**(실 백엔드 배선·계약·테스트는 유지). 세 문(등록·접수·예약)+PANEL-WORK 등 미배선 기능을 채운다.

**Architecture:** 실 frontend에 **Tailwind v4를 도입**하되 `@theme`로 `tokens.css` 변수를 그대로 노출한다 — 색·크기 원본은 여전히 `design-tokens/tokens.json` 단일본(3단계 환자앱 Flutter가 같은 원본에서 생성, `lint:tokens`가 하드코딩 차단). 데모 컴포넌트가 쓰는 shadcn 계열 클래스(`text-muted-foreground`·`border-border`·`rounded-xl`)를 실 토큰에 매핑해 데모 `_ui`·`StaffShell`·`doors`를 이식 가능하게 만든다. 화면은 배선을 건드리지 않고 공용부품·토큰으로 시각만 통일한다.

**Tech Stack:** React 18 · Vite · TypeScript · React Query 5 · React Router 6 · Supabase Auth · **Tailwind v4(신규 도입, `@tailwindcss/vite`)** · Vitest + Testing Library.

**Spec:** `docs/design/screen-behaviors.md`(규칙 원본, 규칙ID) · `demo/DESIGN-NOTES.md`(직원 콘솔 정체성·기각안) · `demo/src/routes/staff/*`(포팅 소스, 시각 정본) · `docs/superpowers/plans/2026-08-15-staff-web.md:121`(surface 포팅 규약 — 이 계획은 그 규약을 복원한다).

## Global Constraints

- **색·크기 원본 = `design-tokens/tokens.json` → `frontend/src/styles/tokens.css`(생성물).** Tailwind는 `@theme`로 이 변수를 소비만 한다. 임의 hex/px(`bg-[#..]`·`text-[13px]`) 금지 — `npm run lint:tokens`가 CI에서 막는다(규칙 갱신은 Task V0).
- **배선·계약·테스트 유지.** 화면 폴리시 태스크는 react-query·api 계약·마스킹·오프라인·낙관적 잠금·세션 로직을 **바꾸지 않는다.** 시각만 바꾼다. 시각이 크게 바뀐 화면은 그 화면의 UI 테스트만 조정(계약 테스트 불변).
- **직원 콘솔 시각 정체성(`demo/DESIGN-NOTES.md` 「직원 웹」절):** 딥틸 잉크 사이드바 `#0a4a4c`(=`--color-sidebar-ink`)·흰 글자·활성 `bg-white/12`+좌측 3px 흰 바(`SHELL-NAV-06`)·amber 배지 / 각지고 촘촘한 패널(얇은 경계 `border`+미세 그림자·`rounded-xl`) / 업무 밀도(`text-sm`·행 `py-2.5`·섹션 제목 `text-base`) / 헤더 하단 실선(`border-b`, 그림자 아님).
- **아이콘 = SVG `<symbol>`+`<use>`(`shell/icons.svg`) 또는 Phosphor 채움. 이모지 금지.**
- **사용자 대면 문구는 존댓말/한국어. 되돌릴 수 없는 동작은 확인창 안 빨간 버튼. 막다른 길 금지.**

---

## Wave 0 — 시각 기반 (순차: V0 → V1 → V2, 이후 모든 태스크가 소비)

### Task V0: Tailwind v4 도입 + 토큰 정합
**Files:**
- Modify: `frontend/vite.config.ts`(`@tailwindcss/vite` 플러그인), `frontend/package.json`(deps)
- Create: `frontend/src/styles/theme.css`(`@import 'tailwindcss'` + `@theme { --color-*: var(--token) }` 매핑)
- Modify: `frontend/src/styles/tokens.css` 생성원 `design-tokens/tokens.json`(데모에만 있는 값 보강 — 아래)
- Modify: 루트 `lint:tokens` 스크립트(임의 hex/px만 차단, Tailwind 토큰 클래스는 허용)
- Test: `frontend/src/styles/theme.test.ts`(핵심 변수 존재), 기존 `tokens` 테스트 유지

**Interfaces:**
- Produces: Tailwind 유틸리티가 실 토큰을 소비 — `bg-primary`·`text-muted-foreground`·`border-border`·`rounded-xl`·`bg-sidebar-ink` 등이 데모와 같은 값으로 동작. 이후 모든 포팅 태스크가 데모 className을 거의 그대로 쓴다.

**핵심 매핑(데모 shadcn 이름 → 실 토큰):** `--color-primary`(공통) · `muted-foreground`→`--color-ink-muted` · `foreground`→`--color-ink` · `border`→`--color-divider` · `card`→`--color-surface` · `background`→`--color-bg` · `radius-xl`→`--radius-card` · `text-sm/base`→`--fs-*`. **데모에만 있어 보강할 값:** amber 배지색(`--color-amber-400` 상당), 사이드바 활성 `white/12`, 미세 그림자 `0 1px 2px`(실 `--shadow-card` 재사용 가능).

- [ ] Step 1: `@tailwindcss/vite`·`tailwindcss` 설치, `vite.config.ts`에 플러그인, `main.tsx`에서 `theme.css`를 `tokens.css` 다음 import.
- [ ] Step 2: `theme.css`에 `@theme` 매핑 작성(위 표). 실패 테스트: 렌더 후 `getComputedStyle`로 `--color-primary`·`muted-foreground` 확인.
- [ ] Step 3: `design-tokens/tokens.json`에 보강값 추가 → `tokens.css` 재생성.
- [ ] Step 4: `lint:tokens`를 "토큰 밖 hex/px 리터럴"만 잡도록 갱신. 기존 화면이 통과하는지 확인.
- [ ] Step 5: 전체 프론트 `vitest run`·`tsc --noEmit` GREEN 확인 후 커밋.

### Task V1: 공용 부품 포팅 (`_ui.tsx`)
**Files:**
- Create: `frontend/src/components/staff-ui/`(`StaffPage`·`PageHead`·`Panel`·`StatusBadge`·`Tag`·`Toolbar`·`Segmented`·`SearchInput`·`btnPrimary/Ghost/Link`)
- Modify: 기존 `components/EmptyState.tsx`·`components/StatTile.tsx`와 **중복 해소**(데모 것으로 정합하되 기존 소비처 계약 유지)
- Test: 각 부품 `*.test.tsx`(렌더·variant)

**Interfaces:**
- Consumes: V0 토큰/Tailwind.
- Produces: 화면들이 인라인 style 대신 소비할 공용 부품. `Panel({ title, actions, children })`·`StatusBadge({ status, tone })`·`Segmented<T>({ options, value, onChange })` 등 — **데모 `_ui.tsx`의 시그니처를 그대로 가져오되** 실 프로젝트 컨벤션(named export, 토큰) 적용.

- [ ] Step 1: 데모 `_ui.tsx`를 소스로 각 부품을 실 frontend에 포팅(className은 V0 덕에 대부분 그대로). 실패 테스트 먼저.
- [ ] Step 2: 기존 `EmptyState`·`StatTile` 소비처(테스트로 확인)를 새 통합본에 맞춰 조정.
- [ ] Step 3: vitest·tsc GREEN 커밋.

### Task V2: 셸 포팅 (`StaffShell` → `AppShell`/`Sidebar`/`Header`)
**Files:**
- Modify: `frontend/src/shell/AppShell.tsx`·`Sidebar.tsx`·`Header.tsx`(데모 `StaffShell.tsx` 구조·간격·클래스로)
- Keep: `navItems.ts`(역할표 단일 원본 — SHELL-NAV-01/02 준수, 건드리지 않음)·인증·배지·idle 배선
- Test: 기존 `AppShell.test`·`Sidebar.test`·`Header.test` 정본대로 유지/보강

**Interfaces:**
- Consumes: V0 토큰·V1 부품·기존 `NAV_ITEMS`·`useAuth`·`useMessagesBadge`.
- Produces: 세 문(`[＋ 등록]·[＋ 접수]·[＋ 예약]`) 헤더 자리(패널 본체는 Wave 1 D2~D5) · 딥틸 잉크 사이드바 · 헤더 실선.

- [ ] Step 1: Sidebar를 데모대로(딥틸 잉크·브랜드 워드마크·그룹·활성 3px 바·amber 배지). 기존 `SHELL-NAV` 테스트 GREEN 유지.
- [ ] Step 2: Header를 데모대로(왼쪽 화면 제목·오른쪽 역할칩·로그아웃 확인창·구분선+넓은 여백·세 문). `SHELL-HDR-01~05` 테스트.
- [ ] Step 3: AppShell 인라인 style 제거→Tailwind. 세 문 `door` 상태는 유지(패널 본체는 D2에서 교체). PanelHost·OfflineBanner·IdleBanner 마운트 유지.
- [ ] Step 4: vitest·tsc GREEN 커밋.

---

## Wave 1 — 세 문 + 백엔드 (V2 위 + 백엔드)

### Task D1: 백엔드 환자 등록 라우터 + 프론트 api
**Files:** Modify `backend/app/routers/patients.py`(POST) · Create `frontend/src/api/registration.ts` · Test `backend/tests/.../test_register_patient.py`
**Interfaces:** Consumes `patient_service.register_patient(name,birth_date,gender,phone,staff,conn)->UUID`·`find_by_phone_and_birthdate(phone,birth_date,staff,conn)->UUID|None`(**이미 존재**). Produces `POST /patients {name,gender,birth_date,phone} -> {patient_id}` + `GET /patients/duplicate-check?phone&birth_date`(소프트 중복, `SHELL-DOOR-03`).
- [ ] Step 1: 라우터 실패 테스트(등록 → 201·patient_id / 중복조회 → 후보). Step 2: `require_role`(접수·관리자) + 서비스 호출. Step 3: 프론트 `registerPatient`·`checkDuplicate` api. Step 4: 백엔드+프론트 GREEN 커밋. **⚠️ 마이그레이션 불필요**(patients 테이블 존재, INSERT만) — 클린DB 회귀는 Wave 종료 시.

### Task D2: 세 문 셸 + PANEL-WORK 인프라 (`doors/` 포팅)
**Files:** Create `frontend/src/shell/doors/`(`DoorContext.tsx`·`doorData.ts`·`panels.tsx`·`surfaces.tsx` — 데모 포팅) · Modify `AppShell.tsx`(placeholder aside → door 시스템)
**Interfaces:** Consumes V2 셸·PanelHost. Produces 세 문 패널 프레임 + **왼쪽 화면 변신**(`SHELL-DOOR-06`·`PANEL-WORK-01/02`·`PANEL-LIVE-05/06`): 칸 누르면 왼쪽이 검색표/캘린더/월달력으로. 가짜데이터 자리는 D3~D5가 실 api로 채움.
- [ ] 데모 `doors/*` 4파일 포팅(Tailwind 그대로) → 실 셸에 마운트. 패널 하나만(`PANEL-ONE-01`)·✕ 안 묻고 닫힘(`PANEL-LIVE-06`). 왼쪽 변신 프레임 테스트. 커밋.

### Task D3: 등록 문 (`SHELL-DOOR-03/05`)
신원 폼(이름·성별·생년월일 8자리 자동서식·전화) → D1 `registerPatient`. 소프트 중복 "혹시 이분?"(막지 않음). 등록 뒤 `[예약 잡기]`·`[바로 접수]` 이음. **의존 D1·D2.**

### Task D4: 접수 문 (`SHELL-DOOR-04`·`CHKIN-*`·`QUEUE-WALK`)
예약 있으면 기존 `CheckInPage`(QR·예약번호) 흡수, 없으면 **당일방문**: `searchPatients`→의사 배정→`createAppointment(walkin_visit_time)`. 도착/진료대기 두 갈래(`CHKIN-RESULT-01/03`). **의존 D2.**

### Task D5: 예약 문 (`SHELL-DOOR-02`·`CAL-BOOK-*`·`PANEL-WORK-02`)
기존 `PhoneBookingPanel`을 door 패널로: 환자→의사(대기인원 `QUEUE-WALK-08b`)→날짜·시각(왼쪽 일간 캘린더 변신)→사유→저장 확인(`QUEUE-SAME-01`). `createPhoneAppointment` 배선. **의존 D2.**

---

## Wave 2 — 화면 시각 폴리시 (V0·V1·V2 위, 병렬 가능, **배선·계약 불변**)

> 각 화면 태스크의 균일 절차: ① 데모 대응 화면을 시각 정본으로 열어 대조 → ② 실 화면의 **인라인/혼재 스타일을 V1 공용부품·V0 토큰으로 교체**(구조·간격·분해를 데모에 맞춤) → ③ react-query·api·마스킹·상태 로직은 **그대로** → ④ 시각 크게 바뀐 부분만 UI 테스트 조정, 계약 테스트 유지 → ⑤ `frontend-design` 렌즈로 밀도·정렬 점검 → ⑥ tsc·vitest GREEN 커밋.

**그룹 A — 핵심 시연(우선):**
- Task S1 `/today` (데모 `today/Today.tsx`) — 타일·2열 사이드 레일(DEMO E-6).
- Task S2 `/queue` (`queue/Queue.tsx`) — 7탭·순번칩·DnD 삽입선(DEMO E-5).
- Task S3 `/calendar` (`calendar/Calendar.tsx`) — 일/주·의사색·지금선(DEMO E-8). ⚠️ 실 2008줄, 시각만.
- Task S4 `/patients/:id` (`patient/PatientDetail.tsx`) — 헤더·2열 섹션.
- Task S5 `/patients` (`patients/PatientSearch.tsx`).

**그룹 B — 의사·발송·접수:**
- Task S6 `/doctor/console` (`doctor/DoctorConsole.tsx`) — 3단 밀도.
- Task S7 `/messages` (`messages/Messages.tsx`) — 제1문·발송 패널.
- Task S8 `/checkin` (`checkin/CheckinForm.tsx`) — D4와 시각 공유.

**그룹 C — 관리(밀도·표):**
- Task S9 `/admin/stats`(`admin/record/Stats.tsx`) · S10 `/admin/access-logs`(`AccessLogs.tsx`) · S11 `/admin/errors`(`Errors.tsx`) · S12 `/admin/patient-merge-candidates`(`MergeCandidates.tsx`) · S13 `/admin/merge-history`(`MergeHistory.tsx`) · S14 `/admin/schedule`(`admin/config/Schedule.tsx`) · S15 `/admin/staff`(`StaffAdmin.tsx`) · S16 `/admin/questionnaires`(`Questionnaires.tsx`) · S17 `/admin/settings`(`HospitalSettings.tsx`).

---

## 순서·의존 요약
1. **Wave 0 순차**: V0 → V1 → V2 (기반, 반드시 먼저).
2. **Wave 1**: D1(백엔드, V0와 병렬 가능) → D2 → {D3·D4·D5 병렬}.
3. **Wave 2**: V0·V1·V2 완료 후 화면들 병렬(그룹 A 우선). D 체인과도 병렬 가능.
4. **종료**: 클린 DB 전체 회귀(누적 마이그 + D1) 1회 + 손검수.

## Self-Review 메모(작성자)
- **Spec 커버리지**: 셸·공용부품·세 문·17화면 모두 태스크 있음. 상담봇 7항목=4단계 범위밖(이미 문구 처리, `cfccba5`).
- **Tailwind 도입이 옛 "Tailwind 안 씀" 결정과 충돌?** → 아니오. 원본은 여전히 `tokens.json`, Tailwind는 소비 레이어, `lint:tokens`는 하드코딩만 차단. Flutter 공유 불변.
- **위험**: V0(토큰 매핑 누락 시 화면 깨짐) → V0에서 기존 전 화면 vitest GREEN 게이트. D2(왼쪽 변신) → 데모가 설계 완성, 포팅.
- **미결(코디↔사용자)**: 화면 폴리시를 "데모 구조째 교체"까지 갈지, "시각만 조정"에 그칠지는 화면별 배선 무게에 따라 워커가 판단(계약 불변이 상한선).
