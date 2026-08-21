# 데모 프론트엔드 — 슬라이스2 병렬 워커 계획

> 2026-08-21. **시연용 클릭 목업(데모 프론트엔드)** 트랙. 실제 구현체가 아니라 "보여주기용 껍데기"다.
> 슬라이스1(로그인→홈→예약 8단계→완료)은 완성됨. 이 계획은 **나머지 환자앱 묶음 5개를 5개 워커가 병렬로** 붙인다.
> 설계: `docs/superpowers/specs/2026-08-21-demo-clickable-mockup-design.md`. 슬라이스1 계획: `docs/superpowers/plans/2026-08-21-demo-frontend-scaffold-slice1.md`.

---

## 공통 헤더 (모든 워커가 먼저 읽는다)

**너는 이 계획서의 배정된 `Worker N` 섹션 하나만 수행한다.** 다른 Worker 섹션은 다른 워커가 맡으므로 건드리지 않는다.

### 이 프로젝트가 무엇인가
- **시연용 데모**다. 실제 Supabase·인증·OTP·예약 로직 **없음**. 버튼이 경로를 바꾸고, 가짜 데이터를 읽어 화면을 보여주는 게 전부.
- **해피패스만** 구현한다. 오프라인·낙관적 잠금·409 충돌·예외 마스킹 등 **눈에 안 보이는 엣지 규칙은 제외**(범위 밖).
- 작업 디렉토리는 `demo/`. 모든 명령은 `cd demo` 후 실행.

### 기술 스택 (슬라이스1과 동일 — 반드시 맞출 것)
- Vite + React 18 + TypeScript + TailwindCSS + **shadcn/ui 기본(회색) 테마** + `lucide-react` 아이콘 + `react-router-dom`.
- 모든 환자 화면은 **`PhoneFrame`(390×844 폰 틀) 안에** 렌더한다: `import { PhoneFrame } from '@/components/PhoneFrame'`.
- 경로 alias `@` = `demo/src`.

### 절대 규칙 (어기면 병합이 깨진다)
1. **자기 폴더 안에만 파일을 만든다**: `demo/src/routes/patient/<배정폴더>/`. 그 폴더의 `routes.tsx`에 있는 배열을 채워 경로를 등록한다(`App.tsx`가 이미 그 배열을 spread하고 있다).
2. **다음은 절대 수정하지 마라**: `demo/src/App.tsx`, `demo/src/main.tsx`, `demo/src/mock/**`, `demo/src/state/**`, `demo/src/components/**`(기존 공용), 다른 워커의 폴더, `demo/src/index.css`, `components.json`, `package.json`. seam은 이미 깔려 있다.
3. **공용 타입은 import만**: `import type { Appointment, Patient, ... } from '@/mock/types'`. 공용 데이터는 `import { initialAppointments, patients, ... } from '@/mock/data'`.
4. **묶음 고유 타입·가짜 데이터는 자기 폴더에** `mockData.ts`로 둔다(공용 `mock/`을 늘리지 않는다).
5. **공용 UI 컴포넌트는 import만**: `@/components/ui/button`(`Button`), `@/components/ui/card`(`Card,CardContent,CardHeader,...`), `@/components/ui/input`(`Input`), `@/components/ui/label`(`Label`), `@/components/ui/progress`(`Progress`). 더 필요하면 **`npx shadcn add` 실행 금지**(components.json 공유 충돌) — 자기 폴더에 작은 컴포넌트로 자작하라.

### 테마 (중요)
- **색을 하드코딩하지 마라.** hex(`#0B6E70` 등)·임의 색 클래스 금지. **shadcn 의미 토큰 클래스만** 사용: `bg-background text-foreground text-muted-foreground bg-muted bg-card border bg-primary text-primary-foreground bg-secondary bg-destructive text-destructive`. (확정 테마는 앱 완성 후 마지막에 index.css 한 곳만 바꿔 전 화면 일괄 적용한다. 그래서 지금 색을 박으면 안 된다.)
- 아이콘은 `lucide-react`만. **이모지 금지**.

### 정본 대조 절차 (화면 문구·흐름의 진본)
- 정본은 `docs/design/screen-behaviors.md`다. 목업이 아니라 이 규칙이 이긴다.
- 배정된 **줄범위만** `Read`(offset/limit)로 펼쳐 읽어라 — 이 파일은 1MB가 넘으니 통독하지 마라.
- 규칙 문구를 그대로 화면에 반영하되, 데모라 **비가시 엣지 규칙(오프라인·409·잠금 등)은 건너뛴다**. 규칙과 목업이 어긋나면 규칙을 따른다.

### 환자 노출 문구 규칙 (프로젝트 확정 — 반드시 지킬 것)
- 취소·변경 상담 연결 시 **"취소 요청이 접수/등록됐다" 표현 금지.** 오직 **"상담(직원 확인)으로 연결됐다"** 계열 문구만 쓴다.
- 되돌릴 수 없는 동작(탈퇴 등)의 빨간(`destructive`) 버튼은 **확인창 안에서만** 노출한다.

### 패턴 참고 (스타일·구조를 이 파일들과 똑같이 맞춰라)
- `demo/src/routes/patient/Home.tsx` (앱바·카드 목록·빈 상태·하단 버튼 패턴)
- `demo/src/components/AppointmentCard.tsx` (카드 구성)
- `demo/src/routes/patient/book/BookingWizard.tsx` + `steps/Step1Who.tsx` (마법사·단계·뒤로가기 패턴)
- `demo/src/routes/patient/book/useBookingState.ts` (상태 훅 패턴 — 로직 있으면 이렇게 훅+단위테스트)

### 검증 & 커밋 (매 화면/커밋마다)
- `cd demo && npx vitest run` **초록** + `npm run build` **통과** 확인 후 커밋.
- 상태 훅 등 **로직이 있으면 vitest 단위테스트 최소 1개**(빈 테스트 금지, `expect` 실제 단언). 정적 화면은 렌더 스모크 테스트(`data-testid` + `getByTestId`) 권장.
- **자기 폴더 파일만** `git add`. 커밋 메시지 형식은 `feat(demo): <묶음 이름> ...`. 커밋 푸터는 `git log -1`로 슬라이스1 커밋 형식을 확인해 그대로 따른다. 화면이 여럿이면 화면 단위로 여러 커밋 가능.
- 이 워크트리에서 **커밋만** 한다(push 하지 않는다). 다 끝나면 마지막 줄에 `DONE`을 출력한다.
- 각 라우트의 최상위 화면 div에 `data-testid`를 단다(예: `data-testid="appt-detail"`), 통합·테스트에서 찾기 쉽게.

---

## Worker 1 — 묶음 4(예약 상세·변경·취소) + 묶음 8(나의 예약 목록)

**폴더**: `demo/src/routes/patient/appt/` — `routes.tsx`의 `apptRoutes` 배열을 채운다.
**정본 줄범위**: `docs/design/screen-behaviors.md` **3638~3851**(`APPT-* CANCEL-* NAV-APPT-*`) + **4604~4749**(`LIST-* NAV-LIST-*`).

**만들 화면·경로**:
- `/appointments` — **나의 예약 목록**(묶음8): 앞으로 갈 예약만(완료·취소 제외), 본인 우선→이름순. 각 줄 클릭 → `/appt/:id`. 데이터는 `initialAppointments`(`@/mock/data`) 사용. `data-testid="my-appointments"`.
- `/appt/:id` — **예약 상세**(묶음4): 장소·방문이유·상태(주체·시각), QR 있으면 `[QR]`(→`/qr`), `[예약 변경]`·`[예약 취소]` 버튼. `id`로 `initialAppointments`에서 찾고, 없으면 첫 예약으로 폴백(데모). `data-testid="appt-detail"`.
- `/appt/:id/change` — **예약 변경**: 데모는 날짜/시간 다시 고르는 간단 화면 + **변경 전→후 확인창**(`APPT-CHG-*`, 확인창으로 교체됨). 확정 시 완료 안내 → 상세로.
- `/appt/:id/cancel` — **취소(상담 연결)**: 마감 후 취소·변경은 `[상담 채팅 연결]` 버튼. 누른 즉시 **"상담(직원 확인)으로 연결됐어요"** 배지/안내(⚠️ "취소 요청 접수/등록" 문구 절대 금지). `data-testid="appt-cancel"`.

**상세용 보강 데이터**: `appt/mockData.ts`에 예약 id별 `{ place, reason, statusActor, statusAt }` 맵을 둔다(공용 `Appointment`에 없는 필드). `@/mock/data`의 `initialAppointments`와 id로 조인.

**주의**: 홈 카드(`Home.tsx`)에서 상세로 가는 링크는 **코디네이터가 통합 때 붙인다**. 너는 `/appointments` 목록에서 상세로 가는 링크만 자체적으로 연결하면 된다.

---

## Worker 2 — 묶음 5(사전문진)

**폴더**: `demo/src/routes/patient/questionnaire/` — `routes.tsx`의 `questionnaireRoutes` 배열을 채운다.
**정본 줄범위**: `docs/design/screen-behaviors.md` **3884~4070**(`QNR-* NAV-QNR-*`).

**핵심 규칙**: 문항을 **1개씩** 보여주고, 답하면 자동저장(데모는 가짜, 상태에만 반영), **진행률** 표시(`n/전체`), 이어쓰기(중간부터), 마지막에 **최종 확인 → 제출**. 진료 시작 전까지 수정 가능. 읽기 전용 화면에서는 **답 / 미작성 / 미표시**를 구분해 보여준다.

**만들 것**:
- `useQuestionnaireState.ts` — 훅(현재 문항 index, 답 맵, `answer(id,value)`, `next()/back()`, `progress`, `isComplete`). **vitest 단위테스트 최소 1개**(예: 답하면 진행률이 오르고, 필수 미답 시 다음 불가).
- `questionnaire/mockData.ts` — 문항 배열. 유형 섞기: 단일선택·다중선택·예/아니오·자유입력. 예: "오늘 어디가 불편하신가요?"(자유), "통증이 며칠 됐나요?"(단일선택), 복용약 유무(예/아니오) 등 5~8문항.
- `/questionnaire` — 문진 마법사 화면(BookingWizard 패턴 차용: 진행 막대 + 한 문항 + 뒤로/다음). `data-testid="questionnaire"`.
- 마지막 단계: 답 요약 + `[제출]` → 완료 안내 화면.

---

## Worker 3 — 묶음 6(가족)

**폴더**: `demo/src/routes/patient/family/` — `routes.tsx`의 `familyRoutes` 배열을 채운다.
**정본 줄범위**: `docs/design/screen-behaviors.md` **4105~4253**(`FAM-* NAV-FAM-*`).

**핵심 규칙**: 가족 목록(본인 제외, 활성 링크만) + `[가족 추가]`. 추가는 **두 갈래 분기**: ① 신규 프로필 만들기(이름·생년월일·**성별 F/M 필수**·전화는 선택) ② 기존 환자 연결(전화+OTP). 기존 환자 연결에서 **개인정보 열거 방지**: 맞든 틀리든 같은 화면으로 진행. 연결 해제는 예약이 있으면 막고, 정보 수정 안쪽에서 확인. 최대 10명.

**만들 것**:
- `family/mockData.ts` — 가족 목록(관계·성별 포함). `@/mock/data`의 `patients`를 참고하되 이 화면용 확장은 자기 폴더에.
- `/family` — 가족 목록 + `[가족 추가]`. `data-testid="family-list"`.
- `/family/add` — 분기 선택(새 프로필 / 기존 환자 연결).
- `/family/add/new` — 신규 프로필 폼(성별 F/M 라디오 필수). 저장 → 목록으로(가짜 추가는 로컬 state로).
- `/family/add/existing` — 전화+OTP 입력. 확인 → "연결됐어요" 안내(열거 방지 문구). `data-testid` 각각.

---

## Worker 4 — 묶음 7(이력·설정·탈퇴)

**폴더**: `demo/src/routes/patient/settings/` — `routes.tsx`의 `settingsRoutes` 배열을 채운다.
**정본 줄범위**: `docs/design/screen-behaviors.md` **4280~4569**(`HIST-* SET-* NAV-HIST-* NAV-SET-*`).

**핵심 규칙**: 지난 예약 **이력**(취소·부도·미확정 포함, 완료뿐 아님), 20건씩 `[더 보기]`로 이어받기(데모는 가짜), 각 항목 펼치면 문진/안내 요약. **설정 허브** 하위: 알림 설정(끌 수 있는 토글), 비밀번호 변경, 병원 정보(전화 `tel:` 링크·주소→지도 링크), **탈퇴**. 탈퇴는 예약이 있으면 차단하고 보관 고지. 민감 동작 전 **재인증**. 되돌릴 수 없는 탈퇴의 빨간(`destructive`) 버튼은 **확인창 안에서만**.

**만들 것**:
- `settings/mockData.ts` — 지난 예약 이력 목록(상태 다양: 진료완료/환자취소/병원취소/예약부도/미확정), 설정 항목.
- `/history` — 이력 목록 + `[더 보기]` + 항목 펼침. `data-testid="history"`.
- `/settings` — 설정 허브(알림·비밀번호·병원정보·탈퇴 진입). `data-testid="settings"`.
- `/settings/notifications` — 알림 종류별 토글(끌 수 있게). `/settings/password` — 비밀번호 변경 폼. `/settings/hospital` — 병원 정보(전화·지도 링크). `/settings/withdraw` — 탈퇴(예약 있으면 차단 안내 / 없으면 확인창 안 빨간 버튼).

---

## Worker 5 — 묶음 2 잔여(알림함 + 예약 카드 10종 상태)

**폴더**: `demo/src/routes/patient/notifications/` — `routes.tsx`의 `notificationsRoutes` 배열을 채운다.
**정본 줄범위**: `docs/design/screen-behaviors.md` **3027~3336**(`HOME-* CARD-* QR-* NOTI-* NAV-HOME-*`). 특히 `CARD-*`(카드 10종 상태)와 `NOTI-*`(알림함).

**핵심 규칙**: **알림함** — 받은 알림 목록, 열면 읽음 처리(데모는 로컬 state), 안 읽은 건 강조. **예약 카드 10종 상태** — 예약 상태별로 카드 모양·배지가 다르다. 정본 `CARD-*`에서 **정확한 상태 목록**을 확인해 그 상태들을 한 화면에 모아 보여주는 **상태 모음판(갤러리)**을 만든다(시연·QA용). 상태 예: 예약신청·예약확정·도착·진료대기·진료중·진료완료·환자취소·병원취소·예약부도·미확정 등.

**만들 것**:
- `notifications/mockData.ts` — 알림 목록(읽음/안읽음), 카드 10종 상태 예시 예약 배열(상태 타입은 자기 폴더에서 확장 — 공용 `mock/types.ts` 수정 금지).
- `notifications/StatusCard.tsx` — 상태별 배지·문구가 다른 카드 컴포넌트(기존 `AppointmentCard`는 수정 금지라 자기 폴더에 자작. 기존 것을 참고만).
- `/notifications` — 알림함. `data-testid="notifications"`.
- `/cards` — 카드 10종 상태 갤러리(각 상태 카드 나열 + 상태명 라벨). `data-testid="card-gallery"`.

---

## 코디네이터(통합) 메모 — 워커가 읽을 필요 없음
- 각 워크트리 완료 후 코디네이터가 순서대로 병합(격리 폴더라 충돌 0). 그 뒤 진입점 연결(홈 종 아이콘→`/notifications`, 홈 톱니→`/settings`, 홈 카드 클릭→`/appt/:id`, 예약 흐름/상세→`/questionnaire`, 홈/설정→`/family`, `/appointments`)을 코디네이터가 `App.tsx`·`Home.tsx`·`AppointmentCard.tsx`에서 한 번에 배선한다.
- 전체 `vitest run`·`npm run build`·수동 라우팅 확인 후 슬라이스2 완료 커밋.
- 확정 테마(딥틸 `#0B6E70`·Pretendard·Solid 아이콘)와 Vercel 배포는 그다음 별도 단계.
