# 직원웹 「데모 뼈대 + 실 배선」 병합 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데모(`demo/src/routes/staff/**`)의 화면 코드를 실 프론트(`frontend/`)로 **뼈대째 들여오고**, 실 프론트가 이미 가진 api·인증·마스킹·상태전이 로직을 그 위에 **배선**해, 직원웹 19화면을 「데모만큼 규칙이 살아 있으면서 진짜 서버에 붙은」 상태로 만든다.

**Architecture:** `frontend/`가 제품이고 `demo/`는 **동결된 시각 정본**이다(사용자 확정 2026-08-27). 화면마다 데모 컴포넌트를 `frontend/src/pages/**`로 복사해 뼈대로 삼고, 같은 화면의 기존 실 구현에서 react-query 훅·api 호출·마스킹·낙관적 잠금·역할 가드를 옮겨 심는다. 데모는 절대 수정하지 않는다 — 수정하는 순간 브라우저로 「데모 vs 실」을 대조할 원본이 사라지고, 그 대조가 이 계획의 **유일한 합격 기준**이기 때문이다.

**Tech Stack:** React 18 · Vite 5 · TypeScript · React Query 5 · React Router 6 · Supabase Auth(ES256/JWKS) · Tailwind v4(`@theme`로 `tokens.css` 소비) · `@phosphor-icons/react`(신규) · Vitest + Testing Library + msw.

**Spec:**
- 규칙 원본 = `docs/design/screen-behaviors.md` (규칙ID)
- **화면별 이식 체크리스트 = `docs/design/spec-index/DEMO-PORT-RULE-MAP.md`** ⭐ 이 계획의 Wave 2가 소비하는 실측 지도
- 규칙ID 묶음·갭 = `docs/design/spec-index/SPECINDEX-staff-web.md`
- 데모 검수 이력(반영 완료·미결) = `demo/DEMO-REVIEW-NOTES.md` (E·F·G절)
- 결정 근거·기각안 = `docs/superpowers/specs/2026-07-31-ui-design-decisions.md`
- 살아있는 갭 3건 = `docs/superpowers/STAFF-WEB-EXECUTION-PLAN.md` §9

---

## 0. 이 계획이 뒤집은 것 — 먼저 읽을 것

| 항목 | 처리 |
|---|---|
| `docs/superpowers/plans/2026-08-28-staff-web-demo-port.md` | **폐기.** 「실이 뼈대, 데모는 시각 참고」 전제라 방향이 반대다. 파일 맨 위에 폐기 표시를 남기고 이 계획으로 대체한다. (파일명 날짜 `08-28`은 오기 — 실제 작성일은 2026-08-27.) |
| 커밋 `af95176` Task V0 (Tailwind v4 도입) | **유지.** 데모 className을 그대로 쓰려면 반드시 필요하다. 방향과 무관하게 옳았다. |
| 커밋 `63238b0` Task V1 (`components/staff-ui/` 11개) | **유지하되 Task M1에서 내용을 데모 원본으로 덮어쓴다.** 파일 경로·export 이름은 그대로 두므로 소비처가 깨지지 않는다. revert하지 않는다 — 되돌렸다 다시 만드는 것보다 덮어쓰는 편이 짧고 안전하다. |
| 커밋 `e6c1155` Task V2 (셸) | **유지하되 Task M2에서 데모 `StaffShell.tsx` 구조로 덮어쓴다.** 이유 위와 같다. 실 `navItems.ts`·인증·배지 배선은 남긴다. |
| 워커 산출물 `backend/app/routers/patients.py` + `backend/tests/test_register_patient.py` + `frontend/src/api/registration.ts` (미커밋) | **재활용.** 백엔드는 어느 방향이든 그대로 쓴다 → Task D1이 그대로 커밋한다. |
| 커밋 `cfccba5` 상담봇 7화면 로드맵 문구 | **유지.** 상담봇 운영화면은 4단계 범위이고 이 계획 밖이다. |

---

## 1. ⭐ 합격 기준이 바뀌었다

**옛 기준(폐기): jsdom vitest 통과.** 이것이 Task 4~30에서 실패한 원인이다 — jsdom은 드래그 삽입선·2열 사이드레일·자동 스크롤·세 문 왼쪽 변신을 볼 수 없어서, 워커는 규칙을 테스트 한 줄로 옮기고 화면엔 못 살렸다.

**새 기준: 아래 셋을 모두 만족해야 태스크가 끝난다.**

1. **브라우저 대조** — 코디네이터가 `demo/`(로컬 `npm run dev` 또는 https://demo-pi-inky-72.vercel.app)와 실 화면을 **같은 폭으로 나란히 열어** 스크린샷으로 대조한다. 「비슷하다」가 아니라 **다른 곳을 하나씩 적어** 의도한 차이(실 데이터·실 상태)인지 판정한다.
2. **규칙ID 체크** — `DEMO-PORT-RULE-MAP.md`의 해당 화면 절에서 ①이식 후보 ②데모만 표기 ③양쪽 무표기 세 목록을 **한 줄씩 소진**하고, 각 항목을 `완료 / 이미 됨 / 해당 없음(사유) / 이월(갭번호)` 중 하나로 판정해 태스크 로그에 남긴다.
3. **테스트 GREEN** — `npm run test`(vitest)·`tsc --noEmit`·백엔드 `pytest`. ⚠️ `npm run lint:tokens`는 **2026-08-27 현재 이미 빨간불**(HEAD에서도 exit=1, 236건 — 대부분 주석의 `⭐⛔⚠️`를 「이모지 금지」로 잡는 오탐 + `theme.css` 별칭을 모르는 `NEW_TOKEN` 허용목록)이다. 따라서 **「통과」가 아니라 「내 변경으로 새로 빨개진 줄이 없는지」**만 본다(`git stash` 전후 건수 비교). 검사기 자체 수정은 아래 §8 별도 할 일. 단 **테스트는 회귀 가드일 뿐 합격 판정자가 아니다.** 시각이 바뀌어 깨진 UI 테스트는 정본 규칙에 맞춰 고치되, **계약 테스트(api 호출 형태·권한·마스킹)는 절대 약화시키지 않는다.**

## Global Constraints

- **색·크기 원본은 `design-tokens/tokens.json` 하나다.** Tailwind는 `frontend/src/styles/theme.css`의 `@theme inline`으로 이를 별칭할 뿐이다. 임의 hex/px(`bg-[#0a4a4c]`·`text-[13px]`) 금지. 검사기는 **리포 루트** `npm run lint:tokens`(=`node design-tokens/lint-tokens.mjs frontend/src`)이나 지금은 오탐으로 빨간불이라 **증감만** 본다(§1-3). 데모에만 있는 값이 필요하면 `tokens.json`에 추가하고 `tokens.css`를 재생성한다.
- **`demo/`는 읽기 전용.** 어떤 태스크도 `demo/` 아래 파일을 수정하지 않는다. 데모에서 버그를 발견하면 고치지 말고 `demo/DEMO-REVIEW-NOTES.md`에 적을 것을 코디에게 보고한다.
- **계약 불변.** api 경로·요청 본문·권한 가드(`require_role`)·마스킹 경계·낙관적 잠금·세션 만료 처리는 실 구현 것을 그대로 쓴다. 데모의 목데이터 흐름을 실 계약보다 우선하지 않는다.
- **아이콘 = `@phosphor-icons/react` 채움(Solid), `frontend/src/components/icons.tsx` 경유(`DISP-ICON-03`). 이모지 금지.**
- **사용자 대면 문구는 한국어 존댓말.** 되돌릴 수 없는 동작의 빨간 버튼은 확인창 안에서만. 막다른 길 금지. 환자 노출 문구에 "취소 요청이 접수/등록됐다" 금지 → "상담(직원 확인)으로 연결됐다".
- **당분간 이 작업은 맥락을 가진 창이 직접 한다**(사용자 결정 2026-08-27: paseo 워커 위임 중단). 바닥(Wave 0)과 패턴을 세우는 첫 화면 2~3개를 끝낸 뒤에 위임을 다시 검토한다. 아래 「워커」 표현은 **위임을 재개했을 때의 규율**로 남겨 둔 것이다.
- 위임을 재개하면: **공용 파일은 워커가 건드리지 않는다**(`App.tsx`·`main.tsx`·`navItems.ts`·`shell/*`·`package.json`). 필요하면 태스크 로그에 「코디 배선 TODO」로 남기고 코디가 붙인다.
- **한 태스크 = 한 커밋.** 커밋 전 코디가 세 겹 판정(브라우저 대조·규칙ID 체크·테스트)을 한다.

---

## 2. 화면마다 네 가지 병합 — Wave 2 공통 절차

**Wave 2의 모든 화면 태스크는 아래 6단계를 그대로 실행한다.** 화면별 태스크 절에는 이 절차의 「입력」(어떤 파일·어떤 규칙 목록·무엇을 조심할지)만 적는다.

- [ ] **단계 1 — 데모를 먼저 브라우저로 본다**
  `cd demo && npm run dev` 후 해당 화면을 연다. **코드를 읽기 전에 화면을 먼저 본다.** 탭·버튼·빈 상태·호버·드래그를 실제로 눌러 보고, 무엇이 살아 있는지 3~5줄로 적는다. (이 단계를 건너뛴 것이 Task 4~30 실패의 원인이다.)

- [ ] **단계 2 — 데모 컴포넌트를 실로 복사한다**
  데모 파일을 `frontend/src/pages/<화면>/`으로 복사한다. 복사 직후 고칠 것은 **다음 넷뿐**이다:
  1. `@/components/icons` → `../../components/icons` (Task M0가 `@` alias를 깔면 그대로 둬도 된다)
  2. 데모 `mockData.ts` import → 단계 3에서 실 훅으로 교체할 자리에 `// TODO(배선)` 주석
  3. `_ui.tsx` import → `../../components/staff-ui`
  4. 라우트 경로 `/staff/...` → 실 라우트(`/today`·`/queue`·…)
  **레이아웃·className·간격·조건분기는 한 글자도 바꾸지 않는다.** 바꾸고 싶으면 그 이유를 태스크 로그에 적고 코디에게 물어본다.

- [ ] **단계 3 — 실 로직을 이식한다**
  같은 화면의 기존 실 구현(`frontend/src/pages/**`의 옛 파일)을 열어, 목데이터가 있던 자리에 **react-query 훅·api 함수·마스킹·역할 가드·낙관적 잠금·에러/오프라인 분기**를 옮겨 심는다. 옛 실 파일은 이식이 끝나면 삭제하고, 그 파일의 **계약 테스트는 새 컴포넌트를 가리키도록 옮긴다**(삭제 금지).

- [ ] **단계 4 — 규칙ID를 소진한다**
  `docs/design/spec-index/DEMO-PORT-RULE-MAP.md`에서 이 화면 절을 열어 ①②③ 세 목록을 한 줄씩 판정한다. 판정할 때 **규칙 원문을 `screen-behaviors.md`에서 그 ID로 grep해 읽는다**(통독 금지 — 색인이 진입점). 결과를 태스크 로그에 목록으로 남긴다.

- [ ] **단계 5 — 데모 검수 이력을 확인한다**
  `demo/DEMO-REVIEW-NOTES.md`를 이 화면 이름으로 grep한다. E·F·G절에 사용자가 이미 판정한 항목(예: F-7 페이지 설명문 제거, G-9 11px 하한, G-2 도착/진료대기 두 버튼)이 있으면 **그 판정을 그대로 따른다.** 여기 적힌 것을 다시 설계하지 않는다.

- [ ] **단계 6 — 검증 후 보고**
  `cd frontend && npx tsc --noEmit && npm run test` GREEN. 그 다음 코디에게 넘길 로그를 쓴다: ①데모와 다른 점 목록 ②규칙ID 판정표 ③이월·미결 ④코디 배선 TODO(공용 파일). **코디가 브라우저로 대조한 뒤에 커밋한다.**

---

## 3. Wave 0 — 가로 인프라 (순차 M0 → M1 → M2 → M3)

> 화면 단위로만 자르면 셸·공용부품·세 문 같은 **가로 장치가 아무 태스크에도 안 잡혀** 미배선으로 남는다(2026-08-28 교훈). 그래서 먼저 독립 태스크로 세운다.

### Task M0: 포팅 환경 정합 (데모 코드가 실에서 그대로 컴파일되게)

**Files:**
- Modify: `frontend/package.json` (`@phosphor-icons/react` 추가)
- Modify: `frontend/vite.config.ts` (`resolve.alias` 에 `@` → `./src`)
- Modify: `frontend/tsconfig.json` (`compilerOptions.paths` 에 `"@/*": ["./src/*"]`)
- Create: `frontend/src/components/icons.tsx` (데모 `demo/src/components/icons.tsx` 114줄 복사)
- Create: `frontend/src/components/icons.test.tsx`
- Modify: `frontend/src/styles/theme.css` (아래 실측에서 빠진 매핑만)

**Interfaces:**
- Produces: `@/…` 절대 import가 동작. `import { Stethoscope, CalendarDays, … } from '@/components/icons'` — 데모 staff 코드가 쓰는 아이콘 이름 49개가 실에서 같은 이름으로 해석된다. 이후 모든 포팅 태스크가 이것을 전제한다.

**왜 이 태스크가 먼저인가(실측):** `demo/src/routes/staff/**`의 외부 import는 `react`(30) · `@/components/icons`(29) · `react-router-dom`(16) · `vitest`(3) **뿐**이다. `@base-ui/react`·`shadcn`·`cva`는 staff 화면에서 쓰지 않고, React 19 전용 API(`use()`·form action·ref-as-prop)도 쓰지 않는다(hooks는 `createContext/useContext/useEffect/useMemo/useRef/useState`만). react-router 사용 API는 `NavLink·Outlet·useLocation·useNavigate·useParams·useSearchParams`로 전부 v6 호환이다. **즉 아이콘 한 줄과 `@` alias만 해결하면 데모 staff 코드는 React 18에서 그대로 돈다.**

- [ ] **Step 1: 실패 테스트를 쓴다**

```tsx
// frontend/src/components/icons.test.tsx
import { render } from '@testing-library/react'
import { Stethoscope, CalendarDays, UserRoundPlus } from '@/components/icons'

// DISP-ICON-03 — 직원 콘솔 아이콘은 '채움(Solid)' 벡터다. 이모지·아웃라인 금지.
it('데모와 같은 이름으로 채움 아이콘을 내보낸다', () => {
  const { container } = render(<><Stethoscope /><CalendarDays /><UserRoundPlus /></>)
  expect(container.querySelectorAll('svg')).toHaveLength(3)
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/components/icons.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/icons"`

- [ ] **Step 3: 의존성과 alias를 넣는다**

```bash
cd frontend && npm i @phosphor-icons/react@^2.1.10
```

`frontend/vite.config.ts` 의 `defineConfig({...})` 안에 추가:

```ts
import path from 'node:path'
// …
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
```

`frontend/tsconfig.json` 의 `compilerOptions` 에 추가:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 4: 아이콘 모듈을 복사한다**

```bash
cp demo/src/components/icons.tsx frontend/src/components/icons.tsx
```

파일 맨 위 주석은 그대로 둔다(왜 lucide가 아니라 Phosphor인지의 근거가 거기 있다).

- [ ] **Step 5: 테스트 통과를 확인한다**

Run: `cd frontend && npx vitest run src/components/icons.test.tsx && npx tsc --noEmit`
Expected: PASS · tsc 오류 0

- [ ] **Step 6: 데모 클래스가 실 토큰으로 풀리는지 확인한다**

`frontend/src/styles/theme.css`는 이미 `primary·primary-wash·foreground·muted-foreground·background·card·border·destructive·warn·muted·sidebar-ink·font-logo`를 매핑한다. 데모 staff 코드에서 쓰는 색 클래스를 전수로 뽑아 **매핑에 없는 것만** 추가한다:

```bash
grep -rho 'bg-[a-z-]*\|text-[a-z-]*\|border-[a-z-]*' demo/src/routes/staff/ | sort -u > /tmp/demo-classes.txt
```

Tailwind 기본 팔레트(`amber-*`·`white`·`slate-*`)는 그대로 두고, **의미색(브랜드·상태)** 만 `tokens.json`에 추가한 뒤 `tokens.css`를 재생성한다.

- [ ] **Step 7: 전체 회귀와 커밋**

Run: `cd frontend && npm run test && npx tsc --noEmit`
Expected: 기존 테스트 전부 GREEN(이 태스크는 기존 화면을 건드리지 않는다)

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.json frontend/src/components/icons.tsx frontend/src/components/icons.test.tsx frontend/src/styles/theme.css design-tokens/tokens.json frontend/src/styles/tokens.css
git commit -m "port(staff-web): M0 — 포팅 환경 정합(Phosphor 아이콘·@ alias·토큰 매핑 보강)"
```

---

### Task M1: 공용 부품을 데모 `_ui.tsx` 원본으로 교체

**Files:**
- Modify(덮어쓰기): `frontend/src/components/staff-ui/StaffPage.tsx` · `PageHead.tsx` · `Panel.tsx` · `StatusBadge.tsx` · `Tag.tsx` · `Toolbar.tsx` · `Segmented.tsx` · `SearchInput.tsx` · `EmptyState.tsx` · `StatTile.tsx` · `buttons.ts`
- Create: `frontend/src/components/staff-ui/PeriodSelect.tsx` (**실에 없는 부품** — 데모 `_ui.tsx:55`)
- Modify: `frontend/src/components/staff-ui/index.ts` (`PeriodSelect` export 추가)
- Modify: 각 `*.test.tsx` (데모 실제 마크업에 맞춰 조정)

**Interfaces:**
- Consumes: M0의 Tailwind 매핑·아이콘.
- Produces: 데모와 **바이트 단위로 같은 마크업**을 내는 공용 부품 11+1개. Wave 2의 모든 화면이 이것을 소비한다. export 이름은 기존 그대로(`StaffPage`·`PageHead`·`Panel`·`StatusBadge`·`Tag`·`Toolbar`·`Segmented`·`SearchInput`·`EmptyState`·`StatTile`·`btnPrimary`·`btnGhost`·`btnLink`) + 신규 `PeriodSelect`.

**왜 덮어쓰는가:** V1은 데모를 「참고」해 다시 만든 것이라 마크업이 미묘하게 다르다. 화면 19개가 이 부품 위에 얹히므로, 부품이 1px 다르면 19화면이 전부 1px 다르다. 데모 원본을 진실로 삼는다.

- [ ] **Step 1: 데모 원본을 읽고 부품별로 자른다**
  `demo/src/routes/staff/_ui.tsx`(295줄)를 열어 12개 export를 파일별로 나눈다. **함수 본문·className·기본값을 그대로 옮긴다.**

- [ ] **Step 2: `PeriodSelect`의 실패 테스트를 먼저 쓴다** (실에 없던 부품이므로 TDD)

```tsx
// frontend/src/components/staff-ui/PeriodSelect.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PeriodSelect } from './PeriodSelect'

// PERIOD-BOX-01~04 — 기간 선택은 7/30/90일·1년·전체. '직접 지정'은 제거됐다(DEMO-REVIEW-NOTES G절).
it('최근 1년을 고를 수 있고 직접 지정은 없다', async () => {
  render(<PeriodSelect initial="최근 7일" />)
  await userEvent.click(screen.getByRole('button', { name: /최근 7일/ }))
  expect(screen.getByRole('option', { name: '최근 1년' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: '직접 지정' })).toBeNull()
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/components/staff-ui/PeriodSelect.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 12개 부품을 데모 원본 내용으로 쓴다** (`PeriodSelect` 포함, `index.ts`에 export 추가)

- [ ] **Step 5: 기존 부품 테스트를 데모 마크업에 맞춘다**
  깨진 테스트는 **정본 규칙 기준으로** 고친다. 「테스트가 통과하도록 데모 마크업을 바꾸는」 방향은 금지 — 그러면 V1의 실수를 반복한다.

- [ ] **Step 6: 검증**

Run: `cd frontend && npx vitest run src/components/staff-ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/components/staff-ui
git commit -m "port(staff-web): M1 — 공용 부품을 데모 _ui.tsx 원본으로 교체(+PeriodSelect 신설)"
```

---

### Task M2: 셸을 데모 `StaffShell.tsx` 구조째로 교체

**Files:**
- Modify(덮어쓰기): `frontend/src/shell/Sidebar.tsx` · `Header.tsx` · `AppShell.tsx`
- Modify: `frontend/src/shell/AccountMenu.tsx` (데모 헤더 역할칩 드롭다운 구조로)
- Keep(수정 금지): `frontend/src/shell/navItems.ts`(역할표 단일 원본) · `auth/*` · `NavBadge.tsx` · `IdleBanner.tsx` · `ChangePasswordPanel.tsx`
- Modify: `frontend/src/shell/AppShell.test.tsx` · `Sidebar.test.tsx` · `Header.test.tsx`

**Interfaces:**
- Consumes: M0 아이콘 · M1 부품 · 기존 `NAV_ITEMS`/`NAV_GROUPS`/`navItemForPath` · `useAuth` · `useIdleLogout` · `useMessagesBadge` · `ConnectivityProvider`/`OfflineBanner` · `PanelProvider`/`PanelHost` · `ServerEffects`.
- Produces: 딥틸 잉크 사이드바(`--color-sidebar-ink`)·활성 좌측 3px 흰 바·amber 배지 / 헤더 하단 실선 / 헤더 오른쪽 역할칩→계정 메뉴 / **세 문 버튼 3개 자리**(`[＋ 등록]`·`[＋ 접수]`·`[＋ 예약]`, 본체는 M3). Wave 2 화면들이 이 셸 안에서 렌더된다.

> ✅ **M2 완료(`4dc4568`) — 이 절의 전제가 일부 뒤집혔다.** 규칙 원문을 대조하니 **셸에 한해서는 실 구현이 데모보다 정본에 가까웠다.**
> `SHELL-HDR-01`(헤더=병원명) · `SHELL-NAV-08`(아이콘 모드+툴팁) · `SHELL-HDR-01/05`(세 문 `＋` 라벨·구분선) 셋 모두 **실이 맞고 데모가 이탈**이며,
> `navItems.ts`는 데모 `GROUPS`와 항목·그룹·순서·권한이 완전 일치했다. 그래서 「구조째 덮어쓰기」가 아니라 **어긋난 곳만** 가져왔다(AccountMenu·ChangePasswordPanel의 인라인 style → 데모 마크업, AppShell 레이아웃, 사이드바 활성/호버 값·높이).
> ⭐ **교훈**: 「데모가 뼈대」는 화면(Wave 2)에서 참이고, **셸·공용 규칙에서는 실이 앞설 수 있다.** Wave 2의 각 화면 태스크도 규칙 원문을 먼저 대조한 뒤에 어느 쪽이 정본인지 판정할 것.

**주의 — 데모와 실이 어긋나는 지점 3곳(반드시 실 쪽을 유지):**
1. **역할표**: 데모 `StaffShell.tsx`의 `GROUPS` 상수가 아니라 실 `navItems.ts`를 쓴다(`SHELL-NAV-01/02/03`의 단일 원본). 데모의 그룹 순서·라벨(`업무 → 기록 → 상담봇 관리 → 설정`)이 정본이므로 **`navItems.ts`가 이와 다르면 `navItems.ts`를 정본에 맞춰 고친다.**
2. **헤더 왼쪽**: 정본 `SHELL-HDR-01`은 병원명, 데모는 화면 제목이다. `DEMO-REVIEW-NOTES` E-9/E-4가 **「정본 반영 검토 대기」**로 남긴 미결이다 → **이번 태스크에서는 현행 실 구현(사이드바=병원명 / 본문 `<h1>`=화면 제목)을 유지**하고, 데모처럼 헤더로 올리는 것은 코디가 사용자에게 확인한 뒤 별도로 한다. 태스크 로그에 미결로 남긴다.
3. **접수 진입**: 정본은 사이드바 라우트, 데모는 헤더 `[QR 접수]` 패널이다(E-7, 반영 검토 대기). **이번엔 둘 다 살려 둔다** — 사이드바 항목을 지우지 않고 헤더 버튼을 추가한다. 막다른 길이 생기지 않는다.

- [ ] **Step 1: 데모 셸을 브라우저로 본다** (사이드바 접힘·활성 표시·배지·역할칩 드롭다운·세 문 버튼)
- [ ] **Step 2: `Sidebar.tsx`를 데모 마크업으로 덮어쓴다.** 데이터는 `NAV_ITEMS`/`NAV_GROUPS`, 배지는 `NavBadge`. 기존 `SHELL-NAV-*`·`NAV-SHELL-*` 테스트를 **약화 없이** GREEN으로 되돌린다.
- [ ] **Step 3: `Header.tsx`를 데모 마크업으로 덮어쓴다.** 세 문 버튼 3개(`onStart`)·역할칩→`AccountMenu`(비밀번호 변경 `SHELL-PW-01/03/04`·로그아웃 확인창 `SHELL-ME-03`).
- [ ] **Step 4: `AppShell.tsx`의 인라인 `style` 임시 패널을 걷어낸다.** `PanelProvider`·`PanelHost`·`OfflineBanner`·`IdleBanner`·`ServerEffects` 마운트는 그대로 유지한다. `door` state는 M3가 `DoorProvider`로 교체할 수 있게 남긴다.
- [ ] **Step 5: 검증** — `npx vitest run src/shell && npx tsc --noEmit` GREEN.
- [ ] **Step 6: 코디 브라우저 대조** — 데모 `/staff/today`와 실 `/today`의 셸(사이드바 폭·색·활성 표시·헤더 높이·구분선)을 스크린샷으로 대조.
- [ ] **Step 7: 커밋**

```bash
git add frontend/src/shell
git commit -m "port(staff-web): M2 — 셸을 데모 StaffShell 구조로 교체(역할표·인증·배지는 실 배선 유지)"
```

---

### Task M3: 세 문 + PANEL-WORK 인프라 (`doors/` 포팅)

**Files:**
- Create: `frontend/src/shell/doors/DoorContext.tsx` (데모 121줄) · `panels.tsx` (488줄) · `surfaces.tsx` (347줄)
- Modify: `frontend/src/shell/AppShell.tsx` (`DoorProvider` 감싸기 · `DoorRegion` 마운트 · `workSurfaceFor` 로 본문 변신)
- Create: `frontend/src/shell/doors/doors.test.tsx`

**Interfaces:**
- Consumes: M2 셸(헤더 세 문 버튼) · M1 부품 · `PanelHost`.
- Produces: `useDoors()` — `{ open(kind), close(), active }`. `DoorRegion` = 오른쪽 패널 하나만(`PANEL-ONE-01`), `✕`는 묻지 않고 닫힘(`PANEL-LIVE-06`), 배경 클릭으로 닫히지 않음(`PANEL-LIVE-01/05`). `workSurfaceFor(active)` = **왼쪽 본문 변신**(`SHELL-DOOR-06`·`PANEL-WORK-01/02/03`) — 칸을 누르면 왼쪽이 검색표/일간 캘린더/월 달력으로 바뀐다. 패널 안의 실 데이터는 D2~D4가 채운다.

**왜 별도 태스크인가:** 세 문과 「왼쪽 변신」은 **화면 어디에도 속하지 않는 가로 장치**다. 지난 라운드에서 "공통 패널 태스크에서 연결"로 이월됐는데 그런 태스크가 목록에 없어 끝내 미배선으로 남았다.

> ✅ **M3 구현 완료** — `frontend/src/shell/doors/` 4파일(`doorData.ts` 279 · `DoorContext.tsx` 130 · `surfaces.tsx` 350 · `panels.tsx` 500) + `AppShell.tsx` 마운트 + `doors.test.tsx` 9건. `vitest run` 775건·`tsc --noEmit` GREEN.
>
> **⚠️ 계획과 달랐던 점 4가지(전부 실 쪽 사정):**
> 1. **파일이 3개가 아니라 4개다.** 데모 `doors/`는 `doorData.ts`(133줄)를 함께 쓰고, 그것이 다시 데모 `calendar/mockData`를 참조한다. 데모 캘린더 목데이터 전체를 끌어오지 않으려고 **필요한 부분(의사 8명·휴진/점심·하루 예약)만 `doorData.ts` 안으로 옮겨 자립**시켰다.
> 2. **문 이름을 실에 맞췄다** — 데모 `'reserve'` → 실 `'appointment'`. 헤더 세 버튼의 단일 원본(`navItems.ts`의 `START_DOORS`)이 이미 이 이름을 쓰고 있어, **M2의 교훈(셸에선 실이 정본에 가깝다)**대로 실을 따랐다.
> 3. **⭐ 그릇이 둘이 됐다 — 이월 결정 1건.** 실에는 이미 앱 전체에 하나뿐인 패널 그릇 `components/PanelHost.tsx`가 있고 **6개 화면이 그것을 쓴다**(캘린더·환자검색·안내보내기·진료화면·환자상세). 데모 `DoorRegion`은 자기 `<aside>`를 따로 그린다 → 그대로 두면 **패널이 둘 동시에 뜰 수 있어 `PANEL-ONE-01` 위반.** 이번엔 **데모 마크업을 살리되 상태를 서로 닫도록 배선**했다(문을 열면 `closePanel()`, 소비 화면이 패널을 열면 문이 닫힌다 — `doors.test.tsx`가 양방향 다 가드). **두 그릇을 하나로 합칠지는 S1에서 한 번 정해 19화면에 일괄 적용**한다(M2가 남긴 `StaffPage` 래퍼 이월과 같은 자리에서 결정).
> 4. **없는 토큰 2건을 교정**(M2의 `--color-accent` 건과 같은 유형): 데모 `shadow-[var(--elevation-card)]` → 실에 없음, 실이 모달에 쓰는 `--shadow-card`로. 데모 하드코딩 `shadow-[0_1px_2px_rgba(16,45,50,0.04)]` → **실에 정확히 같은 값의 `--shadow-panel`이 있어** 토큰으로. 의사 색 8쌍의 하드코딩 hex도 정본 팔레트 토큰(`--doctor-palette-*`, `CAL-COLOR-12`)으로 바꿨다.
>
> **접수 문 「예약 확인」 갈래는 자리표시자다** — 데모는 `checkin/CheckinForm`을 공유하지만 실의 `pages/checkin/CheckInPage.tsx`는 이미 `findByCode`·`transitionStatus`로 배선된 **라우트 전체화면**이라, 380px 패널에 넣는 일은 계획대로 **Task D3**가 한다.
>
> **`lint:tokens` 증감**: 293 → 304(+11). 전부 **오탐 또는 데모 원본**이다 — 주석의 `⚠️⛔⭐`를 잡는 `EMOJI` 규칙 10건(§8의 알려진 오탐) + 휴진·점심 **빗금 패턴**의 `repeating-linear-gradient(rgba(...))` 1건(대응 토큰 없음, 데모 원본 그대로).
>
> ✅ **Step 7 완료(2026-08-28)** — 크롬 확장이 붙지 않아 **헤드리스 크롬으로 실 화면에 로그인해 촬영하는 스크립트**를 만들어(`tools/shot/`) 데모 배포본과 나란히 대조했다. **세 문의 왼쪽 변신·패널은 데모와 일치.** ⭐ 대신 그 대조에서 **더 큰 것이 드러났다** — 「포팅했는데 딴판」의 원인은 M3가 아니라 **기반 CSS 4건**(preflight 미도입·기본 `border-color`가 글자색·`html` 17px 아님·웹폰트 미로드)이었고, 딸려서 **딥틸 사이드바 글자가 안 보이던 버그**도 나왔다(커밋 `a20f3f6`·`789f1b8`). Wave 2 화면 포팅 전에 **기반 레이어를 먼저 대조할 것**.

- [x] **Step 1: 데모에서 세 문을 실제로 눌러 본다.**(소스로 확정: 등록·접수는 열어도 왼쪽 그대로 / 예약만 열자마자 환자 검색표 → 환자 고르면 환자 카드 → 의사 고르면 그 의사 일간 캘린더 → 날짜 칸은 월 달력) 세 버튼 각각에서 오른쪽 패널과 **왼쪽 본문이 무엇으로 바뀌는지** 적는다.
- [x] **Step 2: 실패 테스트를 쓴다**

```tsx
// frontend/src/shell/doors/doors.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderShell } from '../../test/renderShell'

// PANEL-ONE-01 — 앱 전체에 「만드는 중」 패널은 하나뿐이다.
it('예약 문을 열면 등록 문 패널이 닫힌다', async () => {
  renderShell({ role: 'receptionist' })
  await userEvent.click(screen.getByRole('button', { name: /등록/ }))
  await userEvent.click(screen.getByRole('button', { name: /예약/ }))
  expect(screen.getAllByRole('complementary')).toHaveLength(1)
})

// PANEL-LIVE-06 — ✕는 묻지 않고 닫힌다.
it('✕는 확인창 없이 닫는다', async () => {
  renderShell({ role: 'receptionist' })
  await userEvent.click(screen.getByRole('button', { name: /등록/ }))
  await userEvent.click(screen.getByRole('button', { name: '✕ 닫기' }))
  expect(screen.queryByRole('complementary')).toBeNull()
})
```

- [x] **Step 3: 실패 확인**(8/8 FAIL) — Run `npx vitest run src/shell/doors` → FAIL(모듈 없음)
- [x] **Step 4: 데모 `doors/` 파일을 복사하고 import만 고친다.** 목데이터를 쓰는 자리에 `// TODO(D2·D3·D4 배선)` 주석을 남긴다.
- [x] **Step 5: `AppShell.tsx`에 `DoorProvider`·`DoorRegion`·`workSurfaceFor`를 붙인다.** M2에서 남긴 `door` state를 `useDoors()`로 교체한다.
- [x] **Step 6: 검증** — `npx vitest run` 775건 GREEN · `npx tsc --noEmit` 통과.
- [x] **Step 7: 코디 브라우저 대조**(2026-08-28 완료 — 크롬 확장이 안 붙어 **헤드리스 크롬 스크립트**(`tools/shot/`)로 실 로그인 후 촬영해 데모와 대조. 세 문 각각의 왼쪽 변신이 데모와 일치) — 세 문 각각에서 **왼쪽 변신이 데모와 같은지**가 이 태스크의 핵심 판정 포인트다.
- [ ] **Step 8: 커밋**

```bash
git add frontend/src/shell
git commit -m "port(staff-web): M3 — 세 문·PANEL-WORK 왼쪽 변신 인프라 포팅"
```

---

## 4. Wave 1 — 세 문 배선 (M3 이후)

### Task D1: 백엔드 환자 등록 라우터 (미커밋 산출물 정리·커밋)

**Files:**
- Modify: `backend/app/routers/patients.py` (이미 작업본 존재)
- Create: `backend/tests/test_register_patient.py` (이미 작업본 존재)
- Create: `frontend/src/api/registration.ts` (이미 작업본 존재)
- Modify: `backend/app/main.py` (라우터 등록 확인 — 코디)

**Interfaces:**
- Consumes: `patient_service.register_patient(name, birth_date, gender, phone, staff, conn) -> UUID` · `find_by_phone_and_birthdate(phone, birth_date, staff, conn) -> UUID | None` (둘 다 기존).
- Produces: `POST /patients {name, gender, birth_date, phone} -> {patient_id}` · `GET /patients/duplicate-check?phone&birth_date -> {patient_id: UUID | null}` (소프트 중복, `SHELL-DOOR-03`). 프론트: `registerPatient(body): Promise<{patient_id: string}>` · `checkDuplicate(phone, birthDate)`.
  - ⚠️ **계약 정정(2026-08-28)**: 원래 계획은 `{candidates: [...]}`(목록)였으나 **작업본·데모 둘 다 「후보 하나」**다 — 데모 `findDuplicate()`도 한 명만 돌려주고, 화면 문구도 *"혹시 **{이름}** 님 아니세요?"*로 **한 사람을 지목**한다(`SHELL-DOOR-03`). 목록을 주면 화면이 「누구를 지목할지」를 또 정해야 해 규칙에 없는 판단이 생긴다. → **단수 유지**.

- [ ] **Step 1: 작업본을 읽고 규칙과 대조한다** — `SHELL-DOOR-03`(소프트 중복은 **막지 않는다**)·`require_role`(접수직원·관리자만, 의사 403)·계정 열거 방지.
- [ ] **Step 2: 격리 테스트** — Run: `cd backend && pytest tests/test_register_patient.py -v` → PASS
- [ ] **Step 3: 전체 회귀** — Run: `cd backend && pytest -q`
  ⚠️ 손검수용 로컬 DB에는 돌리지 않는다(teardown이 시드를 지운다). 클린 DB에서 돌리거나, 오염되면 `seed_demo`를 재적재한다.
- [ ] **Step 4: 커밋**

```bash
git add backend/app/routers/patients.py backend/tests/test_register_patient.py frontend/src/api/registration.ts backend/app/main.py
git commit -m "feat(staff-web): D1 — 환자 등록 라우터 + 소프트 중복 조회 + 프론트 api"
```

### Task D2: 등록 문 배선 (`SHELL-DOOR-03/05`)

**Files:** Modify `frontend/src/shell/doors/panels.tsx`(등록 패널) · Create `frontend/src/shell/doors/RegisterDoor.test.tsx`
**Interfaces:** Consumes D1 `registerPatient`·`checkDuplicate`, M3 `useDoors`. Produces 등록 완료 후 `[예약 잡기]`·`[바로 접수]` 이음(다음 문으로 넘김, 막다른 길 금지).
- [ ] 데모 등록 패널의 신원 폼(이름·성별·생년월일 8자리 자동서식·전화)을 그대로 두고 제출만 `registerPatient`로 배선. 소프트 중복은 "혹시 이분인가요?" 목록으로 보여주되 **진행을 막지 않는다**(`SHELL-DOOR-03`). 실패 테스트 → 배선 → GREEN → 커밋.

### Task D3: 접수 문 배선 (`SHELL-DOOR-04`·`CHKIN-*`·`QUEUE-WALK-*`)

**Files:** Modify `frontend/src/shell/doors/panels.tsx`(접수 패널) · 기존 `frontend/src/pages/checkin/*` 로직 흡수 · Create `CheckinDoor.test.tsx`
**Interfaces:** Consumes `findByCode`(예약번호·QR) · `searchPatients` · `createAppointment` · `transitionStatus`, M3 `useDoors`. Produces 예약 있으면 결과 카드, 없으면 **당일방문** 생성(`walkin_visit_time`).
- [ ] 데모 `CheckinForm.tsx`의 **두 버튼 모델**을 그대로 유지한다 — `[진료 대기]`·`[도착]` **순서 고정**, 예약시각보다 이른가(`early`)로 **색만 이동**(DEMO-REVIEW-NOTES G-2·G-8, 사용자 확정 2026-08-23). 「도착 처리 후 예약시각이 되면 시스템이 자동으로 진료 대기로 올린다」가 확정 모델이다. 실패 테스트 → 배선 → GREEN → 커밋.

### Task D4: 예약 문 배선 (`SHELL-DOOR-02`·`CAL-BOOK-*`·`PANEL-WORK-02`)

**Files:** Modify `frontend/src/shell/doors/panels.tsx`·`surfaces.tsx`(예약 패널 + 왼쪽 일간 캘린더 변신) · 기존 `pages/calendar/PhoneBookingPanel.tsx` 로직 흡수 · Create `BookingDoor.test.tsx`
**Interfaces:** Consumes `createPhoneAppointment` · `getCalendar`(빈 시간) · `searchPatients`, M3 `workSurfaceFor`. Produces 환자→의사(대기인원 `QUEUE-WALK-08b`)→날짜·시각(왼쪽 캘린더에서 5분 스냅 클릭)→사유→저장 확인(`QUEUE-SAME-01` 같은 날 중복 경고).
- [ ] 실패 테스트 → 배선 → GREEN → 커밋.

---

## 5. Wave 2 — 화면 19개 4단 병합 (M0~M3 이후, 그룹 안에서 병렬)

> **모든 태스크가 §2의 6단계 공통 절차를 그대로 실행한다.** 아래에는 태스크별 입력만 적는다.
> **병렬 규율**: 한 태스크는 자기 `pages/<화면>/` 폴더와 자기 테스트만 건드린다. 공용 파일(`App.tsx`·`shell/*`·`api/*`·`components/*`)이 필요하면 **고치지 말고** 태스크 로그에 「코디 배선 TODO」로 남긴다.

### 그룹 A — 핵심 시연 (먼저)

| Task | 화면 | 데모 원본(뼈대) | 실 원본(로직) | 규칙 | 이식 후보 |
|---|---|---|---|---:|---:|
| S1 | `/today` | `today/Today.tsx` (363줄) | `pages/TodayPage.tsx` | 90 | 23 |
| S2 | `/queue` | `queue/Queue.tsx` (535줄) | `pages/QueuePage.tsx` | 134 | 28 |
| S3 | `/calendar` | `calendar/Calendar.tsx` (754줄) | `pages/calendar/*` (18파일) | 146 | **76** |
| S4 | `/patients/:id` | `patient/PatientDetail.tsx` (328줄) | `pages/patient/*` (14파일) | 64 | 27 |
| S5 | `/patients` | `patients/PatientSearch.tsx` (188줄) | `pages/patients/*` (6파일) | 56 | 31 |

**S1 `/today`** — Consumes `getTodaySummary()`(`TodayTiles`·`LongWaitRow`·`NeedsAttentionRow`·`NotArrivedRow`·`YesterdayUnfinishedRow`·`DoctorWaitingRow`) · `transitionStatus` · `rescheduleAppointment`/`listAffected`.
조심할 것: ①데모의 **넓은 화면 2열 + 오른쪽 sticky 레일**은 정본 `TODAY-LAY-01`(세로)과 다르다 — E-6 「정본 반영 검토 대기」이므로 **데모대로 두고** 미결로 보고한다. ②「그대로 두기」 도장은 동작별 문구(확인함/취소함/마감함/진료 대기로 보냄, G-4). ③`TODAY-YDAY`(자정 경계 #37)·`TODAY-NOSHOW`·`TODAY-DOC-01` 백엔드 데이터는 Task 13b에서 붙였는지 확인하고, 없으면 이월로 보고한다.

**S2 `/queue`** — Consumes `getQueue()`(`QueueTab`·`QueueTabCounts`·`QueueRow`) · `transitionStatus` · `reorderQueue`(사유 필수) · `setUrgentFlag` · `revealContact`.
조심할 것: ①탭 이름은 **「미도착」**(G-3 사용자 확정, 「아직 안 옴」 아님). ②미도착 행의 두 버튼은 **위치 고정·색만 이동**(G-2). ③DnD 삽입선은 jsdom이 못 본다 → **브라우저에서만 판정**. ④`QUEUE-WALK-*` 43건 중 실 표기 11건뿐 — 이식 후보 목록을 특히 꼼꼼히 소진한다.

**S3 `/calendar`** — Consumes `getCalendar()`(`CalendarBar`·`CalendarBlock`·`CalendarDoctorCatalog`) · `createPhoneAppointment` · `rescheduleAppointment` · `useCalendarRealtime`.
조심할 것: **이 화면이 최대 난이도다**(이식 후보 76건, 실 18파일). ①같은 `appointment id` 유지·서버 검증 후 충돌 복구 UI(`CAL-RACE-*`)는 실 로직을 반드시 가져온다. ②데모의 세공(날짜 팝오버 `fixed`·5분 스냅 호버·지금 선·**열 때 현재 시각으로 자동 스크롤**(E-8)·`whitespace-nowrap w-[196px]` 날짜 버튼·header `z-30`)은 전부 사용자 검수 결과다 — 하나도 잃지 않는다. ③실 구현은 FullCalendar를 쓰는데 **데모는 자체 격자**다. 데모 격자를 뼈대로 삼고 FullCalendar 의존을 제거하되, `gridModel.ts`·`layout.ts`·`snap.ts`의 **순수 로직과 그 테스트는 살려서 재사용**한다.

**S4 `/patients/:id`** — Consumes `getPatientDetail`·`getPatientVisits`·`getPatientMedicalRecords`·`getPatientFamily`·`getPatientNotes`/`addPatientNote`·`getQuestionnaire`·`revealContact`·`verifyFamilyEligibility`.
조심할 것: ①**역할 분리**(G-6) — 의사에게는 `[전화번호 변경]`·`[가족 연결 추가]`를 숨긴다(`canEditContact = !isDoctor`, `SHELL-NAV-03`·`ROLE-DOC-02`). 내부 메모는 의사도 추가 가능(`PTDET-NOTE-02`). ②접수직원은 문진 **내용**을 볼 수 없다(결정 #2·#14). ③전체화면 route다 — 사이드패널 아님(`MASK-DETAIL-01`·`NAV-SHELL-10`).

**S5 `/patients`** — Consumes `searchPatients`(`SearchMatch`·`SearchTodayStatus`) · `revealContact`.
조심할 것: ①의사에게는 **「환자 상세」만** 노출(대기목록 보기 없음, G-6·`SHELL-NAV-03`). ②검색·번호 보기·대량 열람은 **각각 감사**(`SEARCH-LOG-*`, 결정 #11). ③`SEARCH-LOG-06`은 **살아있는 갭**(N 판정 미결, 실행플랜 §9) — 재설계하지 말고 그대로 이월.

### 그룹 B — 의사·발송·접수·로그인

| Task | 화면 | 데모 원본 | 실 원본 | 규칙 | 이식 후보 |
|---|---|---|---|---:|---:|
| S6 | `/doctor/console` | `doctor/DoctorConsole.tsx` (413줄) | `pages/doctor/*` (17파일) | 65 | 36 |
| S7 | `/messages` | `messages/Messages.tsx` (517줄) | `pages/messages/*` (10파일) | 132 | 38 |
| S8 | `/checkin` | `checkin/CheckinForm.tsx` (204줄) | `pages/checkin/*` (6파일) | 22 | 16 |
| S9 | `/login` | `auth/Login.tsx` (125줄) | `pages/LoginPage.tsx`·`PasswordReset*` | 11 | 4 |

**S6 `/doctor/console`** — Consumes `getDoctorQueue` · `transitionStatus` · `undoStatus` · `saveDraft`/`completeRecord`/`reviseRecord`/`getRecordByAppointment`/`listRevisions` · `listPhrases` 외 · `useAutoSaveDraft`/`useDraftStore`.
조심할 것: ①**진료 중 되돌리기 없음**(`DOCTOR-START-03` 역전이 부재, G절). ②로그인 직후 자동선택 없음 → "환자를 고르세요"(`DOCTOR-START-01`). ③완료 후 `[수정]`은 사유 필수(`DOCTOR-RECORD-08`). ④**진료기록 작성 칸이 위, 과거 기록이 아래**(G-7 사용자 정정) — 정본 `DOCTOR-HISTORY-01`의 「오른쪽 위」와 어긋나므로 **정본 반영 대기**로 보고한다(고치지 말 것). ⑤자동저장 디바운스·세션 만료 배너(#30)는 실 `useAutoSaveDraft`를 가져온다.

**S7 `/messages`** — Consumes `getMessages`·`sendMessage`·`cancelScheduled`·`getFailedList`·`getBadgeCount`·`markHandled`.
조심할 것: ①「전 환자에게 보내기」는 **주 버튼 금지, 보조 버튼/칩**(F-5, 되돌릴 수 없고 비용 큼 — `SEND-ALL-04` 미리보기가 안전장치). ②안내 보내기 행 클릭 = **보낸 것은 열람만 / 예약해 둔 것은 열람+`발송 취소`. 직접 편집 없음**(F-5 확정 A). ③재시도는 원본을 덮어쓰지 않고 **새 시도 레코드**(`SEND-RETRY-*`). ④실패 수신자만 재시도(결정 #30).

**S8 `/checkin`** — Consumes `findByCode` · `transitionStatus` · `QrScanner`. D3와 **시각·버튼 모델을 공유**한다(두 버튼 순서 고정·색만 이동). `CHKIN-CODE-07`(예약번호를 모르는 환자의 갈 길)을 반드시 확인 — 막다른 길 금지.

**S9 `/login`** — Consumes `AuthProvider`·`PasswordResetRequestPage`/`PasswordResetNewPage`. **계정 열거 방지**(맞든 틀리든 같은 화면, `core/security.py:43` 문구). 세션 = 무활동 30분(결정 #27, 절대 만료 아님).

### 그룹 C — 관리 화면 (밀도·표 중심, 병렬도 높음)

| Task | 화면 | 데모 원본 | 실 원본 | 규칙 | 이식 후보 |
|---|---|---|---|---:|---:|
| S10 | `/admin/schedule` | `admin/config/Schedule.tsx` (544줄) | `pages/admin/schedule/*` (16파일) | 144 | **82** |
| S11 | `/admin/settings` | `admin/config/HospitalSettings.tsx` (268줄) | `pages/admin/settings/*` (9파일) | 91 | 40 |
| S12 | `/admin/staff` | `admin/config/StaffAdmin.tsx` (271줄) | `pages/admin/staff/*` (13파일) | 42 | 37 |
| S13 | `/admin/questionnaires` | `admin/config/Questionnaires.tsx` (259줄) | `pages/admin/questionnaires/*` | 44 | 30 |
| S14 | `/admin/access-logs` | `admin/record/AccessLogs.tsx` (342줄) | `pages/admin/AccessLogPage.tsx` 외 | 36 | 16 |
| S15 | `/admin/stats` | `admin/record/Stats.tsx` (321줄) | `pages/admin/StatsPage.tsx` 외 | 29 | 15 |
| S16 | `/admin/errors` | `admin/record/Errors.tsx` (159줄) | `pages/admin/errors/*` | 27 | 10 |
| S17 | `/admin/patient-merge-candidates` | `admin/record/MergeCandidates.tsx` (409줄) | `pages/admin/merge/*` | 37 | 20 |
| S18 | `/admin/merge-history` | `admin/record/MergeHistory.tsx` (306줄) | `pages/admin/merge-history/*` | 35 | 30 |

**S10 `/admin/schedule`** — Consumes `scheduleAdmin` 객체(주간 규칙 원자 저장·overview grid·진료과 CRUD·`resolve_day`).
조심할 것: ①**이식 후보 82건 = 그룹 C 최대.** 데모는 규칙 표기가 1건뿐이라 실 로직 대부분을 가져와야 한다. ②7일 저장은 **원자적**, 부분 저장 금지, 충돌은 version mismatch로 재조회(#92~#97). ③영향 예약 **0건이면 팝업 없음**(#90). ④저장 자체는 **환자에게 통지하지 않는다**(#88, 통지는 `/today`에서 직원이). ⑤데모의 요일별 총정원 tfoot 제거·진료과/특정날짜 다이얼로그는 사용자 검수 결과다(G절).

**S11 `/admin/settings`** — Consumes `getSettings`·`saveSettings`·`previewCancellation`. 운영시간은 **schedule이 단일 소스** — settings에 중복 편집칸을 만들지 않는다(#33). SMS 열만 조건부 잠금, 행 전체 잠금 금지(#126). 토큰(이름·날짜·시각)은 발송 시 치환(AD-067).

**S12 `/admin/staff`** — Consumes `staffApi`(초대·목록·활성/비활성·`DeactivationImpact`·의사 프로필·팔레트). 비활성화 전 **영향 예약 수만 미리 보고**, 확정 시 확인 필요 큐로 이동(#10, 자동 취소·재배정 없음). 데모 검수: 좌 목록·우 초대 패널 **카드 윗선 정렬**(F-8).

**S13 `/admin/questionnaires`** — Consumes `questionnaireAdmin`. ①**불변 버전** — 되돌리기 버튼은 일부러 없다(`QADM-VERSION-04`). ②과거 버전 미리보기는 **읽기 전용 문항 목록 + `[이 버전을 편집기로 복사]`**(F-9, 막다른 길 해소). ③상태는 **승인됨/임시저장 2개**(G절 C항, 「승인 대기」 없음). ④관리자·접수직원은 **답변 내용 비열람**(#14, DB RLS도 차단).

**S14 `/admin/access-logs`** — Consumes `getAccessLogs`. 관리자 전용·목록 masked·stable sort. `ALOG-LIST-13` 상세 payload는 **DB 칸이 없어 이월된 항목**(Task 13 BLOCKED) — 재설계 말고 이월 확인만.

**S15 `/admin/stats`** — Consumes `getStats`·`getStatsBy`·`getStatsDetail`·`logStatsExport`. ①화면 숫자는 억제하지 않고 **CSV만 k<5 억제**(#21). ②드릴다운 명단은 masked·행 클릭으로 상세 이동, **드릴다운/CSV만 감사**(#22·#24). ③데모 드릴다운 목데이터가 5줄뿐이라 "상세 명단"이 빈약했다(F-6) — 실 데이터가 붙으면 자연 해소되나, **전체 건수 표시 + 스크롤**인지 확인한다.

**S16 `/admin/errors`** — Consumes `getErrorLogs`. **안전 요약 기본 + redacted 기술 상세**(#20). 서비스 장애와 수신자별 발송 실패는 **다른 화면·다른 로그**(#19).

**S17 `/admin/patient-merge-candidates`** — Consumes `patientMergeApi`. ①비교→검토→확인 **3단계 + 읽음 체크**(#18). ②병합 화면에서 **즉시 undo하지 않는다**(되돌림은 `/admin/merge-history`에서). ③버튼 이름은 **"대표 검토"**(F-8). ④병합 불가 카드에 **「환자 상세 열기」 새 탭**(ExternalLink) — 병합 화면을 떠나지 않게. ⑤데모 목데이터의 모순 2건(박서준 `records:1`+`lastVisit:''`, 최유나 두 계정 같은 번호)은 **실 데이터가 붙으면 사라진다** — 다만 헤더가 `left.phone` 하나만 보여 번호 차이를 뭉개던 문제는 남으므로 **전화번호를 기록 A/B 카드 각각에** 표시한다(F-8).

**S18 `/admin/merge-history`** — Consumes `getMergeHistory`·`getMergeEvent`·`undoMerge`·`saveMergeAuditNote`·`statusBadge`. ①**이식 후보 30/35 = 데모가 거의 표기하지 않은 화면.** ②관리자만 `[되돌림]`, **이미 열람된 기록은 되돌림 불가** 고지(#16). ③「감사메모 저장」은 정본 근거가 없어 **제거 또는 뜻 명확화가 확인 대기**(F-8) — 임의로 지우지 말고 코디에게 보고한다.

---

## 6. 종료 게이트 (Wave 2 완료 후)

- [ ] **클린 DB 전체 회귀 1회** — 누적 마이그레이션 + D1. `supabase db reset` 전에 다른 세션이 멈춰도 되는지 사용자 신호를 받는다.
- [ ] **19화면 브라우저 순회** — 데모와 실을 같은 폭으로 나란히 두고 한 화면씩. 역할 3개(admin·reception·doctor1) 각각으로 로그인해 사이드바·권한 차이를 확인.
- [ ] **`DEMO-PORT-RULE-MAP.md` 판정 집계** — 화면별 「완료/이미 됨/해당 없음/이월」 수를 표로. **이월 항목은 갭 번호를 붙여** `STAFF-WEB-EXECUTION-PLAN.md` §9에 합류시킨다.
- [ ] **정본 반영 대기 목록 처리** — 이 계획이 「데모대로 두고 미결로 보고」한 것들(E-6 오늘 2열 · E-7 접수 헤더 패널 · E-9/E-4 헤더 제목 · G-7 의사 화면 배치 · F-8 반려/기간선택/감사메모)을 사용자와 **하나씩** 확정하고, 확정한 것은 `screen-behaviors.md`(무엇)와 결정로그(왜 + 기각 사유) **두 곳에** 심는다. 뒤집힌 옛 서술에는 역참조를 박는다.
- [ ] **손검수** — 사용자 검수는 여기서 한 번에(중간에 멈춰 검수 제안하지 않는다).

---

## 7. Self-Review (작성자)

**1. 스펙 커버리지**
- 직원웹 활성 route 18개(SPECINDEX Part B 「B안」) + `/checkin`을 세 문과 분리 계산 → Wave 2 S1~S18 + Wave 1 D2~D4로 **전부 태스크가 있다.**
- 가로 인프라(셸·공용부품·세 문·왼쪽 변신·아이콘·토큰)는 Wave 0 M0~M3로 **독립 태스크화**했다 — 지난 라운드 실패 원인 정면 대응.
- 상담봇 운영 7화면(`bot/*`·`tickets/*`·`chatlog/*`)은 **4단계 범위 밖**이라 제외했다(커밋 `cfccba5`의 로드맵 문구 유지). 데모에는 있으나 실 백엔드가 없다.
- 살아있는 갭 3건(#128 의사 도착화면 · 백엔드 계약갭 2건 · `SEARCH-LOG-06`)은 이 계획이 **해소하지 않는다** — S5·S1의 「이월 보고」로 흘려보내고 정본은 실행플랜 §9에 둔다.

**2. 자리표시자 스캔** — "적절히 처리"·"TBD"·"Task N과 비슷하게" 없음. 공통 절차는 §2에 **실행 가능한 6단계로 한 번 전개**했고, 화면 태스크는 그 절차의 입력(파일·규칙 목록·조심할 것)만 준다.

**3. 타입 정합** — Wave 2의 Consumes에 적은 함수·타입 이름은 `frontend/src/api/*.ts`의 실제 export를 그대로 옮긴 것이다(2026-08-27 실측).

**4. 남은 위험**
- **S3 `/calendar`**: FullCalendar(실) ↔ 자체 격자(데모)의 교체가 이 계획 최대 위험. 순수 로직 3파일과 그 테스트를 살리는 것으로 완충했으나, 태스크를 쪼개야 할 수도 있다 — 워커가 착수 후 판단해 코디에게 보고한다.
- **데모 목데이터 ↔ 실 응답 모양 차이**: 데모 컴포넌트가 기대하는 필드가 실 DTO에 없을 수 있다. 그때 **데모 컴포넌트의 화면을 줄이지 말고** api 어댑터를 한 겹 두거나 백엔드 확장을 이월로 보고한다.
- **회귀 규모**: 화면 19개를 갈아끼우면 기존 UI 테스트가 대량으로 깨진다. **계약 테스트는 절대 약화하지 않고**, 시각 테스트만 정본 기준으로 고친다 — 이 경계를 코디가 커밋 전마다 확인한다.

---

## 8. 알려진 문제 (이 계획과 나란히 처리)

| 문제 | 상태 | 처리 |
|---|---|---|
| `npm run lint:tokens`가 HEAD에서도 실패(236건) | **원래 빨간불** — M0에서 확인 | 오탐 두 종: ①`EMOJI` 규칙이 **주석의 `⭐⛔⚠️`**까지 잡는다(CLAUDE.md의 「이모지 금지」는 화면 아이콘 이야기) ②`NEW_TOKEN` 허용목록이 하드코딩이라 `theme.css`의 shadcn 별칭(`foreground`·`card`·`input`·`ring`…)과 `primary-wash`를 모른다. → **검사기를 고칠 것**: 허용목록을 `tokens.json`에서 파생시키고, EMOJI는 주석 줄 제외 또는 규칙 삭제. 그때까지 게이트는 「증감만」. |
| `--color-primary-wash`가 생성물에만 손으로 존재했음 | ✅ **M0에서 해소** | 커밋 `c08bea9`이 `tokens.css`(생성물)를 직접 편집해 넣었던 값. 토큰을 재생성하면 사이드바 활성 배경이 조용히 사라질 상태였다. `tokens.json`으로 승격했다. |
| `CheckInPage.test.tsx` "예약번호 조회 중 버튼 비활성" 플레이크 | 관찰됨(재현 1/3) | 96파일 병렬 전체 실행에서만 간헐 실패, 단독 실행은 항상 통과. **전체 회귀가 1건 실패하면 그 파일을 단독으로 재실행**해 판별할 것. 고치려면 `findByRole` 뒤 `toBeDisabled` 대신 `waitFor`로 감쌀 것. |

