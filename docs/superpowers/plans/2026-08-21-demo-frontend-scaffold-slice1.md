# 데모 프론트엔드 — 뼈대 + 첫 슬라이스 구현 계획

> **For agentic workers:** 이 계획은 **인라인 실행**(같은 세션, 전체 맥락 보유)을 전제로 쓴다. 각 태스크는 독립 테스트 가능한 산출물로 끝나고, 매 태스크 끝에 커밋한다. 정적 화면의 세부 문구는 태스크에 인용된 `screen-behaviors.md` 줄을 **빌드 시점에** 펼쳐 확인한다(정본 대조 절차, 설계 문서 §8).

**Goal:** 환자 앱을 브라우저에서 처음부터 끝까지 클릭할 수 있는 데모의 뼈대와 첫 수직 슬라이스(로그인 → 홈 → 예약 8단계 → 완료)를 만든다.

**Architecture:** `demo/`에 단일 Vite+React+TS SPA. 화면 가운데 폰 프레임(390×844) 안에 환자 앱을 렌더. `react-router`로 버튼이 경로를 바꾼다. 실제 백엔드 없이 `src/mock/`의 가짜 데이터를 읽고, 예약 완료 같은 "가짜 반응"은 화면 안 임시 상태로 표현한다.

**Tech Stack:** Vite, React 18, TypeScript, TailwindCSS, shadcn/ui(**기본 테마**), react-router, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-demo-clickable-mockup-design.md`

## Global Constraints

- **정본 우선**: 화면 내용·흐름은 `docs/design/screen-behaviors.md`가 진본. 목업 HTML은 레이아웃 참고만. 어긋나면 규칙을 따른다.
- **해피패스만**: 오프라인·409 충돌·예외 마스킹 등 비가시 엣지 규칙은 구현하지 않는다.
- **테마**: shadcn 기본 테마(회색). 딥틸·Pretendard 등 확정 디자인은 이 계획 범위 밖(앱 완성 후 별도).
- **가짜 데이터만**: 실제 Supabase·인증·OTP 없음. 로그인은 버튼으로 홈에 진입시키는 정도.
- **환자 노출 문구 규칙**: "취소 요청 접수/등록" 금지 → "상담(직원 확인)으로 연결됐다"만(이번 슬라이스엔 취소 화면 없음, 확장 대비 기록).
- **커밋**: 태스크마다 1커밋. 커밋 푸터는 저장소 관례 준수.

---

### Task 1: 프로젝트 뼈대 + 폰 프레임 + 라우팅

**Files:**
- Create: `demo/package.json`, `demo/vite.config.ts`, `demo/tsconfig.json`, `demo/tailwind.config.ts`, `demo/postcss.config.js`, `demo/index.html`, `demo/.gitignore`
- Create: `demo/src/main.tsx`, `demo/src/App.tsx`, `demo/src/index.css`, `demo/src/lib/utils.ts`
- Create: `demo/src/components/PhoneFrame.tsx`
- Create: `demo/src/routes/patient/Home.tsx`(임시 placeholder — Task 4에서 채움)
- Test: `demo/src/App.test.tsx`

**Interfaces:**
- Produces: `PhoneFrame`(children을 390×844 틀에 렌더), 라우터 경로 `"/"`(로그인)·`"/home"`·`"/book"` 골격, `cn()` 유틸.

- [ ] **Step 1: Vite React-TS 프로젝트 생성**

```bash
cd /Users/kimjunkee/dev/vcu/assignment2-hospital
npm create vite@latest demo -- --template react-ts
cd demo && npm install
npm install react-router-dom
npm install -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom jsdom
npx tailwindcss init -p
```

- [ ] **Step 2: Tailwind + shadcn 기본 토큰 설정**

`demo/src/index.css`에 Tailwind 지시자와 shadcn 기본 테마 CSS 변수(회색 기본값 — shadcn 공식 `New York`/`Slate` 기본 팔레트)를 넣는다. `tailwind.config.ts`의 `content`에 `./index.html`, `./src/**/*.{ts,tsx}` 포함. `darkMode` 미사용.

- [ ] **Step 3: shadcn 초기화(components.json + 기본 컴포넌트)**

```bash
cd demo && npx shadcn@latest init -d
npx shadcn@latest add button card input label progress
```
(`-d`는 기본값 사용. React Router 환경이므로 프레임워크 프롬프트는 Vite 선택.)

- [ ] **Step 4: PhoneFrame 컴포넌트**

```tsx
// demo/src/components/PhoneFrame.tsx
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-200 p-6">
      <div className="relative h-[844px] w-[390px] overflow-hidden rounded-[2.5rem] border-8 border-neutral-900 bg-white shadow-2xl">
        <div className="h-full w-full overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 라우터 골격**

`demo/src/App.tsx`에 `createBrowserRouter`로 `/`(Login placeholder), `/home`(Home placeholder), `/book`(placeholder) 경로. 각 페이지는 `<PhoneFrame>`로 감싼다. `main.tsx`에서 `<RouterProvider>` 렌더.

- [ ] **Step 6: 스모크 테스트 작성(실패 확인)**

```tsx
// demo/src/App.test.tsx
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from './App';
test('홈 경로가 렌더된다', () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/home'] });
  render(<RouterProvider router={router} />);
  expect(screen.getByTestId('phone-frame')).toBeInTheDocument();
});
```
`App.tsx`는 `routes` 배열을 export하고 `PhoneFrame` 루트에 `data-testid="phone-frame"`를 단다. `vite.config.ts`에 `test: { environment: 'jsdom', setupFiles: './src/setupTests.ts' }` 추가, `setupTests.ts`는 `import '@testing-library/jest-dom'`.

Run: `cd demo && npx vitest run` → 처음엔 FAIL(경로/ testid 미비).

- [ ] **Step 7: 최소 구현으로 통과**

placeholder 페이지들과 testid를 붙여 테스트 통과. Run: `npx vitest run` → PASS. `npm run build`도 통과 확인.

- [ ] **Step 8: 커밋**

```bash
git add demo && git commit -m "feat(demo): Vite+React+Tailwind+shadcn 뼈대·폰 프레임·라우팅"
```

---

### Task 2: 가짜 데이터 모듈

**Files:**
- Create: `demo/src/mock/types.ts`, `demo/src/mock/data.ts`
- Test: `demo/src/mock/data.test.ts`

**Interfaces:**
- Produces:
  - `type Patient = { id: string; name: string; relation: '본인' | string }`
  - `type Department = { id: string; name: string }`
  - `type Doctor = { id: string; deptId: string; name: string; specialty: string; scheduleSummary: string; photoUrl?: string }`
  - `type Slot = { time: string; period: '오전' | '오후' }`
  - `type Appointment = { id: string; patientName: string; deptName: string; doctorName: string; date: string; time: string; status: '예약확정' | '진료대기' | '접수완료'; hasQR: boolean }`
  - `patients: Patient[]`(본인 김순자 + 가족 2명), `departments: Department[]`(내과·정형외과·이비인후과 등 5), `doctorsByDept: Record<string, Doctor[]>`, `availableDatesByDoctor: Record<string, string[]>`, `slotsByDoctorDate: Record<string, Slot[]>`, `initialAppointments: Appointment[]`(2건).

- [ ] **Step 1: 테스트 작성(실패 확인)**

```ts
// demo/src/mock/data.test.ts
import { patients, departments, doctorsByDept, initialAppointments } from './data';
test('본인이 목록 맨 위', () => {
  expect(patients[0].relation).toBe('본인');
});
test('진료과별 의사 목록이 있다', () => {
  expect(doctorsByDept[departments[0].id].length).toBeGreaterThan(0);
});
test('초기 예약이 시각 오름차순', () => {
  const t = initialAppointments.map(a => a.time);
  expect([...t].sort()).toEqual(t);
});
```
Run: `npx vitest run src/mock` → FAIL.

- [ ] **Step 2: data.ts 구현**

`types.ts`에 위 타입, `data.ts`에 실제 예시 값(한글 이름·과·의사·시간). 시각은 `HH:MM`. 본인 맨 위(`HOME-CARD-03` 정렬 근거).

- [ ] **Step 3: 통과 확인 + 커밋**

Run: `npx vitest run src/mock` → PASS.
```bash
git add demo/src/mock && git commit -m "feat(demo): 가짜 데이터 모듈(환자·과·의사·슬롯·예약)"
```

---

### Task 3: 로그인 화면

**Files:**
- Create: `demo/src/routes/patient/Login.tsx`
- Modify: `demo/src/App.tsx`(경로 `/` → Login)

**정본 참고:** `screen-behaviors.md:2746~2992`(묶음 1). **데모 단순화**: 실제 인증·OTP 없이 `[로그인]` 버튼이 `/home`으로 이동. 가입 흐름은 이번 슬라이스 범위 밖(버튼만 두고 비활성 또는 안내).

**Interfaces:** Consumes: 라우터. Produces: `/` 경로에서 `[로그인]` → `navigate('/home')`.

- [ ] **Step 1: Login.tsx 구현** — 병원명·로고 자리, `[로그인]` 큰 버튼, 아래 `회원가입`(이번 데모 비활성 안내). `useNavigate`로 `/home` 이동. shadcn `Button`.
- [ ] **Step 2: 라우팅 연결 + 수동 확인** — `npm run dev`로 `/`에서 버튼 클릭 시 홈 이동. 스모크 테스트에 로그인→홈 이동 1건 추가.

```tsx
test('로그인 버튼이 홈으로 보낸다', async () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  render(<RouterProvider router={router} />);
  await userEvent.click(screen.getByRole('button', { name: /로그인/ }));
  expect(screen.getByTestId('home-screen')).toBeInTheDocument();
});
```
Run: `npx vitest run` → PASS.

- [ ] **Step 3: 커밋** — `git commit -m "feat(demo): 로그인 화면(→홈)"`

---

### Task 4: 홈 화면

**Files:**
- Create: `demo/src/routes/patient/Home.tsx`, `demo/src/components/AppointmentCard.tsx`, `demo/src/routes/patient/QrFullscreen.tsx`
- Modify: `demo/src/App.tsx`(경로 `/home`, `/qr`)

**정본 참고:** `screen-behaviors.md:3027~3336`(홈·카드·QR), `NAV-HOME-*`(3398~3426). **해피패스 요소**: 상단 앱바(종·톱니), 가장 가까운 하루치 예약 카드 목록(시각 오름차순, 본인→가족), 각 카드에 `[QR]`(있는 예약만), 하단/상단 `[+ 진료 예약하기]`. 0건이면 빈 상태 + `[+ 진료 예약하기]`(`NAV-HOME-14`).

**Interfaces:** Consumes: `initialAppointments`, `AppointmentCard`. Produces: `/home`(`data-testid="home-screen"`), 카드 클릭 없음(상세는 범위 밖), `[QR]`→`/qr`, `[+ 진료 예약하기]`→`/book`, 종·톱니는 이번 슬라이스에선 자리만(비활성 또는 토스트).

- [ ] **Step 1: AppointmentCard** — 시각·환자명·과·의사·상태 배지. `hasQR`면 `[QR]` 버튼(`NAV-HOME-02`).
- [ ] **Step 2: Home.tsx** — 앱바 + 카드 목록(props로 예약 배열 받음, 정렬은 데이터가 이미 정렬) + `[+ 진료 예약하기]`(`navigate('/book')`). 빈 상태 분기.
- [ ] **Step 3: QrFullscreen** — 큰 QR 자리(가짜 이미지/블록) + `[닫기]`→홈. 밝기 원복 등 엣지는 생략(범위 밖).
- [ ] **Step 4: 테스트** — 홈에 카드가 2건 렌더되고 `[+ 진료 예약하기]`가 `/book`으로 이동. Run: `npx vitest run` → PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(demo): 홈 화면·예약 카드·QR 전체화면"`

---

### Task 5: 예약 마법사 골격 + 단계 상태(핵심 로직)

**Files:**
- Create: `demo/src/routes/patient/book/BookingWizard.tsx`, `demo/src/routes/patient/book/useBookingState.ts`, `demo/src/routes/patient/book/steps/Step1Who.tsx`
- Modify: `demo/src/App.tsx`(경로 `/book`)
- Test: `demo/src/routes/patient/book/useBookingState.test.ts`

**정본 참고:** `BOOK-NAV-01~10`(3468~3480), `BOOK-WHO-*`(3506~3517). **핵심 규칙**: 한 화면 한 질문(8화면), 진행 표시 `N단계 / 8단계 · 이름`(`BOOK-NAV-02`), 뒤로 한 단계씩(`BOOK-NAV-04`), **앞 단계 값을 바꾸면 그 뒤 선택값 전부 버림**(`BOOK-NAV-05`), 값 안 고르면 다음 불가(`BOOK-NAV-07`).

**Interfaces:** Produces:
- `type BookingState = { step: number; who?: Patient; dept?: Department; doctor?: Doctor; date?: string; time?: string; reason?: string }`
- `useBookingState()` → `{ state, setField(key, value), next(), back(), stepName }`. `setField`는 **해당 단계 이후 필드를 초기화**한다(`BOOK-NAV-05`). `stepName`은 `['대상','진료과','의사','날짜','시간','방문이유','최종확인','완료'][step-1]`.

- [ ] **Step 1: 테스트 작성(실패 확인)** — 로직만 단위 테스트.

```ts
import { renderHook, act } from '@testing-library/react';
import { useBookingState } from './useBookingState';
test('의사를 바꾸면 날짜·시간이 초기화된다(BOOK-NAV-05)', () => {
  const { result } = renderHook(() => useBookingState());
  act(() => { result.current.setField('doctor', d1); result.current.setField('date', '2026-08-25'); result.current.setField('time', '10:00'); });
  act(() => { result.current.setField('doctor', d2); });
  expect(result.current.state.date).toBeUndefined();
  expect(result.current.state.time).toBeUndefined();
});
test('진행 표시 이름이 단계와 맞는다', () => {
  const { result } = renderHook(() => useBookingState());
  expect(result.current.stepName).toBe('대상');
});
```
Run: `npx vitest run book` → FAIL.

- [ ] **Step 2: useBookingState 구현** — 필드 순서 배열을 두고 `setField(key)` 시 그 key 이후 필드를 지운다. `next()`는 현재 단계 필수값 있을 때만 `step+1`.
- [ ] **Step 3: BookingWizard + Step1Who** — 진행 막대(shadcn `Progress`) + `N단계 / 8단계 · {stepName}` + 뒤로 버튼(`BOOK-NAV-04`, 1단계에서 뒤로는 마법사 나가기 `BOOK-KEEP-05`) + 본문 슬롯. Step1: `누구의 예약인가요?`(`BOOK-WHO-04`) + `본인 + 가족` 목록 + `+ 가족 추가하기`(이번 데모 비활성 안내). 선택 시 `next()`.
- [ ] **Step 4: 통과 확인** — Run: `npx vitest run book` → PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(demo): 예약 마법사 골격·단계 상태·1단계(대상)"`

---

### Task 6: 예약 2·3단계 (진료과·의사)

**Files:**
- Create: `demo/src/routes/patient/book/steps/Step2Dept.tsx`, `Step3Doctor.tsx`
- Modify: `BookingWizard.tsx`(단계 스위치)

**정본 참고:** `BOOK-DEPT-*`(3522~3524), `BOOK-DOC-*`(3543~3551). **요소**: 2단계 진료과 이름 목록(우측 `›`) + 맨 아래 `어느 과인지 모르겠어요`(데모: 상담 시트 대신 안내 토스트로 축약, `BOOK-BOT-*`는 범위 밖으로 표기). 3단계 의사 가로 줄(원형 사진/이니셜 + 이름 → 진료시간 → 분야, `BOOK-DOC-03`), 사진 없으면 이니셜 원(`BOOK-DOC-05`).

- [ ] **Step 1: Step2Dept** — `doctorsByDept` 키로 과 목록 렌더, 선택 시 `setField('dept')`+`next()`.
- [ ] **Step 2: Step3Doctor** — 선택된 과의 의사 목록, 세 줄 구성. 선택 시 `setField('doctor')`+`next()`. 상단 대상 보조 라벨(`BOOK-DOC-08`, 차분하게).
- [ ] **Step 3: 수동 확인 + 커밋** — `npm run dev`로 과→의사 진행 확인. `git commit -m "feat(demo): 예약 2·3단계(진료과·의사)"`

---

### Task 7: 예약 4·5단계 (날짜·시간)

**Files:**
- Create: `demo/src/routes/patient/book/steps/Step4Date.tsx`, `Step5Time.tsx`
- Modify: `BookingWizard.tsx`

**정본 참고:** `BOOK-DATE-*`(3557~3565), `BOOK-TIME-*`(3589~3596). **요소**: 4단계 월 달력, 예약 가능일만 테두리·나머지 흐린 숫자(`BOOK-DATE-02~03`), 범례 `예약 가능`/`진료 없음`. 5단계 오전/오후 두 덩어리 3열 격자, 가능 시간만 표시(`BOOK-TIME-02`), 덩어리 제목 옆 남은 자리 수(`BOOK-TIME-03`). 데모는 `availableDatesByDoctor`/`slotsByDoctorDate`에서 읽는다.

- [ ] **Step 1: Step4Date** — 간단한 월 격자(당월 고정으로 축약 가능), 가능일만 선택 가능, 선택 시 `setField('date')`+`next()`.
- [ ] **Step 2: Step5Time** — 오전/오후 격자, 슬롯 선택 시 `setField('time')`+`next()`.
- [ ] **Step 3: 수동 확인 + 커밋** — `git commit -m "feat(demo): 예약 4·5단계(날짜·시간)"`

---

### Task 8: 예약 6·7·8단계 (이유·최종확인·완료) + 홈 반영

**Files:**
- Create: `demo/src/routes/patient/book/steps/Step6Why.tsx`, `Step7Confirm.tsx`, `Step8Done.tsx`
- Modify: `BookingWizard.tsx`, `App.tsx`/홈 상태(완료된 예약을 홈 목록에 추가하는 가짜 반응)
- Test: `demo/src/routes/patient/book/wizard.flow.test.tsx`

**정본 참고:** `BOOK-WHY-*`(3602~3606), `BOOK-NAV-08`(3477, 완료에서 뒤로는 마법사 아님 → 홈). **요소**: 6단계 자유 입력 100자 + `건너뛰기`(`BOOK-WHY-03`) + 안내 상자(`BOOK-WHY-04`). 7단계 고른 값 요약 + `[신청]`/`[확정]`. 8단계 완료 결과 화면 + `[홈으로]`. 완료 시 새 예약을 홈 목록에 추가(가짜 반응).

**상태 공유:** 완료된 예약을 홈에 반영하려면 앱 수준 상태가 필요. `App.tsx`에 `appointments` state(초기값 `initialAppointments`)를 두고 `addAppointment`를 context/prop으로 내려 Home과 Wizard가 공유.

- [ ] **Step 1: Step6/7/8 구현**
- [ ] **Step 2: 홈 반영 상태 배선** — 완료 시 `addAppointment(state로 조립한 Appointment)`.
- [ ] **Step 3: 엔드투엔드 흐름 테스트(실패→통과)**

```tsx
test('로그인→홈→예약 8단계→완료 후 홈에 예약이 1건 늘어난다', async () => {
  // memoryRouter '/'에서 시작해 각 단계 클릭, 완료 후 /home에서 카드 수 +1
});
```
Run: `npx vitest run` → 전체 PASS.

- [ ] **Step 4: 빌드 확인 + 커밋** — `npm run build` PASS. `git commit -m "feat(demo): 예약 6·7·8단계·완료·홈 반영(첫 슬라이스 완성)"`

---

## 세션 종료 시

- `HANDOFF.md`에 "데모 뼈대+슬라이스1 완료, 다음=나머지 묶음(상세·문진·가족·설정·알림함) 또는 병렬 워커 분할" 기록.
- 배포(Vercel)와 확정 테마는 앱 전체 완성 후 별도 단계.

## Self-Review 메모

- **Spec coverage**: 설계 §5의 묶음 1·2·3(로그인·홈/QR·예약 8단계)이 Task 3~8에 대응. 묶음 0/4~8은 명시적으로 이후 세션(범위 밖)으로 남김 — 의도된 슬라이스 분할.
- **Type consistency**: `Appointment`·`Patient`·`Doctor` 등 Task 2에서 정의한 타입을 Task 4·5·8이 그대로 사용. 마법사 상태 `BookingState`는 Task 5에서 정의, 6~8에서 소비.
- **No placeholder**: 정적 화면 세부 문구는 인용된 `screen-behaviors.md` 줄을 빌드 시 펼쳐 확인(정본 대조 절차). 테스트가 있는 로직(마법사 상태·흐름)은 실제 코드 포함.
