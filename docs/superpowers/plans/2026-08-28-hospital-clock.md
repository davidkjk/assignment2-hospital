# 화면도 병원 시계를 쓰게 — 「지금·오늘」을 읽는 창구 하나로 모으기

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면이 「오늘이 며칠인가 · 지금 몇 시인가」를 **브라우저(창구 PC) 시계**로 묻는 12곳을 **병원 시계(`Asia/Seoul`)** 하나로 바꿔, 서버와 화면이 언제나 같은 날을 말하게 한다.

**Architecture:** 새로 설계하지 않는다. `pages/checkin/CheckinForm.tsx:38~46`이 **이미 같은 문제를 만나 해결해 둔 `kstParts()`**를 `lib/clock.ts`로 끌어올려 공용 창구로 만들고, 나머지 화면이 그것만 쓰게 한다. 서버는 이미 `Asia/Seoul`로 못박혀 있으므로(`backend/app/db/pool.py:29`) **백엔드는 한 줄도 고치지 않는다.**

**Tech Stack:** TypeScript · `Intl.DateTimeFormat`(런타임 내장, 새 의존성 없음) · Vitest.

**Spec:** 이 계획 자체가 근거다(아래 §0). 결정은 `docs/superpowers/specs/2026-07-31-ui-design-decisions.md`의 「화면도 병원 시계를 쓴다」 절에 정본화한다.

## Global Constraints

- **병원 시간대 상수는 한 곳에만 산다** — `lib/clock.ts`의 `HOSPITAL_TZ = 'Asia/Seoul'`. 다른 파일이 `'Asia/Seoul'` 문자열을 직접 쓰면 그것이 곧 회귀다.
- **`new Date()`를 금지하는 것이 아니다.** 절대 순간(경과시간·낙관적 잠금·저장 시각)에는 그대로 쓴다. 금지되는 것은 **그 Date에서 `getHours()`·`getDate()`·`getFullYear()`류를 읽어 「오늘·지금」을 판정하는 것**이다.
- **「오늘」은 `'YYYY-MM-DD'` 문자열로 다룬다.** Date 객체로 만들어 비교하지 않는다 — 로컬 자정과 KST 자정이 달라 같은 병이 되돌아온다. ISO 날짜 문자열은 사전순 = 시간순이라 `<`·`===`로 안전하게 비교된다.
- **계약 불변.** 서버에 보내는 값(`start_at`·`visit_time` 등)의 형식과 의미는 바꾸지 않는다. 이 계획은 **화면이 읽는 쪽**만 고친다.
- **사용자 대면 문구는 한국어 존댓말.** 이 계획은 문구를 바꾸지 않는다(날짜·시각의 **값**만 바로잡는다).
- 한 태스크 = 한 커밋. 각 태스크 끝에 `npx tsc --noEmit && npm run test` GREEN.

---

## 0. 왜 이걸 하나 — 실제로 무엇이 깨졌나

2026-08-28 D4(예약 문 배선) 브라우저 대조에서 **한 화면 안에서 날짜가 갈리는 것**이 관측됐다.

| 누가 | 시간대 | "오늘"이 며칠이라 답했나 |
|---|---|---|
| 백엔드 (`backend/app/db/pool.py:29`) | `Asia/Seoul` **의도적 고정** | 8월 29일 |
| 화면 (`todayIsoLocal()` 등 12곳) | 브라우저 로컬 = 그 PC의 시계 | 8월 28일 |

그 결과 예약 문에서 **왼쪽 일간 캘린더는 8월 28일을 그리는데 위쪽 타일은 서버가 준 8월 29일 숫자**를 보여줬다. 개발 맥이 미 서부라 드러났을 뿐, **원인은 제품에 있다**:

- 창구 PC의 시계가 하루 틀어져 있으면 **화면과 서버가 다른 날을 말한다.** 직원은 "오늘 예약이 없다"고 읽지만 서버에는 있다.
- 원장이 해외에서 접속하면 같은 일이 벌어진다.
- 자정 경계(`TODAY-DATE-01`·`TODAY-YDAY` 결정 #37)의 「자정에 스스로 넘어간다」가 **어느 자정인지** 정해져 있지 않다.

`CheckinForm.tsx`는 이 병을 이미 한 번 앓고 고쳤다(주석 원문: *"이 병원은 전부 KST로 도니까 시간대를 KST로 못박아 옮긴다 — 러너·기기 TZ에 흔들리지 않는다"*). **이 계획은 그 해법을 나머지 11곳에 퍼뜨리는 일이다.**

### 고칠 곳 12군데 (전수, 2026-08-28 실측)

| # | 파일:줄 | 무엇을 묻나 | 지금 왜 틀리나 |
|---|---|---|---|
| 1 | `shell/doors/doorData.ts:97` `todayIsoLocal()` | 세 문의 오늘 | `getFullYear/getMonth/getDate` |
| 2 | `shell/doors/doorData.ts:211` `pastMinOn()` | 「지난 시각」 경계 | `getHours/getMinutes` + 로컬 자정 비교 |
| 3 | `pages/QueuePage.tsx:395` `nowHHMM()` | 지금 몇 시 | `getHours/getMinutes` |
| 4 | `pages/TodayPage.tsx:307` | 오늘 날짜 머리글 | `Intl`에 `timeZone` 없음 |
| 5 | `pages/calendar/CalendarPage.tsx:58` `now` 기본값 | 캘린더의 오늘 | `new Date()` 로컬 해석 |
| 6 | `pages/calendar/DayGrid.tsx:71` `now` 기본값 | 「지금」 선 | 〃 |
| 7 | `pages/calendar/WeekGrid.tsx:45` `now` 기본값 | 오늘 열 강조 | 〃 |
| 8 | `pages/doctor/DoctorConsolePage.tsx:29` `todayStr()` | 의사 콘솔 오늘 | 로컬 조각 |
| 9 | `pages/walkin/WalkinVisitTimePicker.tsx:37` | 방문 시각 기준 | 로컬 조각 |
| 10 | `components/staff-ui/PeriodSelect.tsx:32` `isoToday()` | 기간 기본값 | `getTimezoneOffset()` 트릭 |
| 11 | `pages/admin/PeriodPicker.tsx:24` `presetRange()` | 기간 프리셋 | 로컬 조각 |
| 12 | `pages/admin/schedule/SchedulePage.tsx:217·220` | 오늘 날짜 | 로컬 조각 |

### 손대지 않을 6군데 (절대 순간 — 시간대와 무관)

`lib/connectivity.tsx:42`(서버 응답 시각) · `pages/calendar/useCalendarRealtime.ts:44`(끊긴 지 얼마나) · `pages/doctor/useAutoSaveDraft.ts:53`·`useDraftStore.ts:35`(저장 시각) · `pages/doctor/DoctorConsolePage.tsx:168`(낙관적 잠금 `toISOString()`) · `pages/checkin/CheckinForm.tsx:63` `slotReached()`(`Date.now()` 비교).

⚠️ 단 `staffFormat.ts:14` `formatLastSignIn()`은 **손대는 쪽**이다(#13으로 Task 6에 든다) — 「오늘 08:57 / 어제 17:26」을 판정하므로 날짜 질문이다.

---

## 1. File Structure

| 파일 | 책임 |
|---|---|
| `frontend/src/lib/clock.ts` **(신설)** | 병원 시계 **유일 창구**. 시간대 상수와 「오늘·지금」을 읽는 함수 전부. |
| `frontend/src/lib/clock.test.ts` **(신설)** | 위의 계약. **시간대를 바꿔가며** 같은 답이 나오는지 못박는다. |
| `frontend/src/pages/checkin/CheckinForm.tsx` | 자기 `kstParts`를 지우고 공용 창구를 쓴다(동작 변화 없음 — 이미 KST였다). |
| 위 표의 나머지 11개 파일 | 로컬 시계 호출을 공용 창구로 교체. |
| `frontend/scripts/lint-clock.mjs` **(신설)** | 재발 방지 — 로컬 시계 조각 읽기를 찾아낸다. |

---

## 2. Task 1: 병원 시계 창구를 만든다

**Files:**
- Create: `frontend/src/lib/clock.ts`
- Create: `frontend/src/lib/clock.test.ts`
- Modify: `frontend/src/pages/checkin/CheckinForm.tsx:34~53`(자기 `kstParts` 제거 → 공용 창구 사용)

**Interfaces:**
- Produces — 이후 모든 태스크가 이것만 쓴다:
  - `HOSPITAL_TZ: 'Asia/Seoul'`
  - `hospitalParts(at?: Date): { y: string; mo: string; d: string; hh: string; mm: string }`
  - `hospitalToday(at?: Date): string` — `'YYYY-MM-DD'`
  - `hospitalHHMM(at?: Date): string` — `'HH:MM'`
  - `hospitalMinutesOfDay(at?: Date): number` — 자정 기준 분(0~1439)
  - `isHospitalToday(dateIso: string, at?: Date): boolean`
  - `hospitalWeekday(dateIso: string): number` — 0=일 … 6=토
  - `addDaysIso(dateIso: string, days: number): string`
  - `formatHospitalDate(dateIso: string, opts?: Intl.DateTimeFormatOptions): string`

- [ ] **Step 1: 실패 테스트를 쓴다**

```ts
// frontend/src/lib/clock.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  addDaysIso, formatHospitalDate, hospitalHHMM, hospitalMinutesOfDay,
  hospitalParts, hospitalToday, hospitalWeekday, isHospitalToday,
} from './clock'

// ⭐ 이 파일의 핵심 계약: **이 코드가 도는 기계의 시간대가 무엇이든 답이 같다.**
//    서버가 `Asia/Seoul`로 못박혀 있으므로(backend/app/db/pool.py:29) 화면도 같은 시계를 봐야
//    한 화면 안에서 날짜가 갈리지 않는다.

afterEach(() => vi.useRealTimers())

/** 2026-08-29 01:20 KST = 2026-08-28 16:20 UTC — 한국은 이미 다음 날인 순간. */
const KST_PAST_MIDNIGHT = new Date('2026-08-28T16:20:00Z')

describe('병원의 오늘 — 기계 시계가 아니라 병원 시계다', () => {
  test('한국이 자정을 넘긴 순간, 기계가 아직 어제여도 오늘은 8월 29일이다', () => {
    expect(hospitalToday(KST_PAST_MIDNIGHT)).toBe('2026-08-29')
  })

  test('지금 몇 시인가도 병원 시계로 답한다', () => {
    expect(hospitalHHMM(KST_PAST_MIDNIGHT)).toBe('01:20')
    expect(hospitalMinutesOfDay(KST_PAST_MIDNIGHT)).toBe(80)
  })

  test('자정 정각은 24시가 아니라 00시다', () => {
    // KST 2026-08-29 00:00 = UTC 2026-08-28 15:00. Intl이 '24'를 주는 경계를 막는다.
    expect(hospitalHHMM(new Date('2026-08-28T15:00:00Z'))).toBe('00:00')
    expect(hospitalMinutesOfDay(new Date('2026-08-28T15:00:00Z'))).toBe(0)
  })

  test('조각으로도 같은 답을 준다', () => {
    expect(hospitalParts(KST_PAST_MIDNIGHT)).toEqual({ y: '2026', mo: '08', d: '29', hh: '01', mm: '20' })
  })
})

describe('오늘인가 — 문자열로 비교한다(Date 자정을 만들지 않는다)', () => {
  test('병원 기준 오늘이면 참', () => {
    expect(isHospitalToday('2026-08-29', KST_PAST_MIDNIGHT)).toBe(true)
  })

  test('기계 기준 오늘(8/28)은 병원에겐 어제다', () => {
    expect(isHospitalToday('2026-08-28', KST_PAST_MIDNIGHT)).toBe(false)
  })
})

describe('날짜 문자열 셈 — 시간대에 흔들리지 않는다', () => {
  test('요일은 로컬 파싱이 아니라 날짜 조각으로 읽는다', () => {
    // new Date('2026-08-29')는 UTC 자정이라 미 서부에서 하루 밀린다. 그 함정을 막는다.
    expect(hospitalWeekday('2026-08-29')).toBe(6) // 토
    expect(hospitalWeekday('2026-08-31')).toBe(1) // 월
  })

  test('며칠 뒤·앞은 달·해를 넘겨도 맞는다', () => {
    expect(addDaysIso('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })

  test('사람이 읽는 날짜로 옮긴다', () => {
    expect(formatHospitalDate('2026-08-29')).toBe('2026년 8월 29일 (토)')
  })
})

describe('인자를 안 주면 진짜 지금을 쓴다', () => {
  test('기본값은 현재 시각이다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(KST_PAST_MIDNIGHT)
    expect(hospitalToday()).toBe('2026-08-29')
    expect(hospitalHHMM()).toBe('01:20')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/lib/clock.test.ts`
Expected: FAIL — `Failed to resolve import "./clock"`

- [ ] **Step 3: 창구를 만든다**

```ts
// frontend/src/lib/clock.ts
// ⭐ 병원 시계 — 화면이 「오늘이 며칠인가 · 지금 몇 시인가」를 묻는 **유일한 창구**.
//
// 왜 기계 시계를 쓰면 안 되나: 서버는 `Asia/Seoul`로 못박혀 있다(`backend/app/db/pool.py:29`).
// 화면만 그 PC의 시계를 믿으면 **한 화면 안에서 날짜가 갈린다** — 2026-08-28 D4 대조에서
// 왼쪽 캘린더는 8/28을, 위쪽 타일은 서버가 준 8/29를 그렸다. 창구 PC 시계가 틀어졌거나
// 해외에서 접속해도 같은 일이 벌어지므로 이것은 개발 환경 문제가 아니라 제품의 결함이다.
//
// ⛔ 이 파일 밖에서 `'Asia/Seoul'`을 직접 쓰지 않는다. 시간대가 하나 더 생기는 순간 병이 돌아온다.
// ⛔ 「오늘」을 Date로 만들어 비교하지 않는다 — 로컬 자정과 병원 자정이 달라 같은 병이 된다.
//    날짜는 'YYYY-MM-DD' 문자열로 다룬다(ISO는 사전순 = 시간순이라 그냥 비교하면 된다).
//
// ✅ 절대 순간(경과시간·저장 시각·낙관적 잠금)에는 `new Date()`를 그대로 쓴다 — 그건 시간대
//    질문이 아니다. 이 창구는 **그 순간을 「병원의 달력·시계」로 읽을 때**만 쓴다.

export const HOSPITAL_TZ = 'Asia/Seoul'

const PARTS_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOSPITAL_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

export interface HospitalParts {
  y: string
  mo: string
  d: string
  hh: string
  mm: string
}

/** 그 순간을 병원 달력·시계의 조각으로. (`CheckinForm`의 `kstParts`를 끌어올린 것) */
export function hospitalParts(at: Date = new Date()): HospitalParts {
  const got = Object.fromEntries(PARTS_FMT.formatToParts(at).map((p) => [p.type, p.value]))
  // ⚠️ hour12:false는 자정을 '24'로 주는 구현이 있다 — 그대로 두면 00:00이 24:00이 된다.
  return { y: got.year, mo: got.month, d: got.day, hh: got.hour === '24' ? '00' : got.hour, mm: got.minute }
}

/** 병원 기준 오늘 — 'YYYY-MM-DD'. */
export function hospitalToday(at: Date = new Date()): string {
  const p = hospitalParts(at)
  return `${p.y}-${p.mo}-${p.d}`
}

/** 병원 기준 지금 — 'HH:MM'. */
export function hospitalHHMM(at: Date = new Date()): string {
  const p = hospitalParts(at)
  return `${p.hh}:${p.mm}`
}

/** 병원 기준 지금이 그 날 자정에서 몇 분째인가(0~1439). 「지난 시각」 경계·지금 선에 쓴다. */
export function hospitalMinutesOfDay(at: Date = new Date()): number {
  const p = hospitalParts(at)
  return Number(p.hh) * 60 + Number(p.mm)
}

/** 그 날짜가 병원 기준 오늘인가. */
export function isHospitalToday(dateIso: string, at: Date = new Date()): boolean {
  return dateIso === hospitalToday(at)
}

/** 'YYYY-MM-DD'의 요일(0=일 … 6=토).
 *  ⚠️ `new Date('2026-08-29')`는 **UTC 자정**이라 서쪽 시간대에서 하루 밀린다 — 조각으로 만든다. */
export function hospitalWeekday(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** 'YYYY-MM-DD'에서 며칠 뒤(음수면 앞). 달·해 넘김은 UTC 셈으로 안전하게. */
export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + days)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' → '2026년 8월 29일 (토)'. opts를 주면 Intl로 넘긴다(시간대는 늘 병원). */
export function formatHospitalDate(dateIso: string, opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  if (!opts) return `${y}년 ${m}월 ${d}일 (${WEEKDAY_KO[hospitalWeekday(dateIso)]})`
  return new Intl.DateTimeFormat('ko-KR', { timeZone: HOSPITAL_TZ, ...opts })
    .format(new Date(Date.UTC(y, m - 1, d, 12))) // 정오로 잡아 시간대 이동에도 날짜가 안 밀린다
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/lib/clock.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: `CheckinForm`이 공용 창구를 쓰게 한다**

`CheckinForm.tsx`에서 지역 `KST` 상수와 `kstParts` 함수(34~46행)를 **지우고** import로 바꾼다. `whenLabel`은 이렇게 된다:

```tsx
import { hospitalParts, hospitalToday } from '../../lib/clock'

function whenLabel(slotAt: string): string {
  const at = new Date(slotAt)
  if (Number.isNaN(at.getTime())) return slotAt
  const s = hospitalParts(at)
  const day = `${s.y}-${s.mo}-${s.d}` === hospitalToday() ? '오늘' : `${Number(s.mo)}월 ${Number(s.d)}일`
  return `${day} ${s.hh}:${s.mm}`
}
```

- [ ] **Step 6: 접수 화면이 안 깨졌는지 확인한다**

Run: `cd frontend && npx vitest run src/pages/checkin/ && npx tsc --noEmit`
Expected: 모두 PASS. **동작은 하나도 안 바뀐다** — 이미 KST였고 창구만 옮겼다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/lib/clock.ts frontend/src/lib/clock.test.ts frontend/src/pages/checkin/CheckinForm.tsx
git commit -m "feat(clock): 병원 시계 창구를 만든다 — CheckinForm이 혼자 갖고 있던 해법을 끌어올린다"
```

---

## 3. Task 2: 세 문(등록·접수·예약)을 병원 시계로

**Files:**
- Modify: `frontend/src/shell/doors/doorData.ts:95~115`(`todayIsoLocal`·`localDate`) · `:205~215`(`pastMinOn`) · `:230~240`(`fmtDate`)
- Modify: `frontend/src/shell/doors/DoorContext.tsx`(호출부 이름 바꿈)
- Modify: `frontend/src/shell/doors/surfaces.tsx`(`MonthPicker`의 오늘 판정)
- Test: `frontend/src/shell/doors/doorData.test.ts`(기존 파일에 더한다)

**Interfaces:**
- Consumes: Task 1의 `hospitalToday`·`hospitalMinutesOfDay`·`hospitalWeekday`·`addDaysIso`·`formatHospitalDate`
- Produces: `todayIsoLocal()`이 **`hospitalToday()`로 대체되어 사라진다**. `pastMinOn(dateIso, at?)`의 두 번째 인자는 `Date`(지금)로 유지된다.

- [ ] **Step 1: 실패 테스트를 쓴다** — `doorData.test.ts` 끝에 더한다

```ts
import { hospitalToday } from '../../lib/clock'

describe('세 문도 병원 시계를 본다', () => {
  const KST_PAST_MIDNIGHT = new Date('2026-08-28T16:20:00Z') // KST 8/29 01:20

  test('[CAL-PAST-01] 「지난 시각」 경계는 병원 시각으로 잰다', () => {
    // 병원은 8/29 01:20 — 그 날의 지난 시각은 80분까지다.
    expect(pastMinOn('2026-08-29', KST_PAST_MIDNIGHT)).toBe(80)
    // 기계가 아직 8/28이어도 병원에겐 지나간 날이다.
    expect(pastMinOn('2026-08-28', KST_PAST_MIDNIGHT)).toBe(24 * 60)
    // 병원 기준 다가올 날에는 지난 시각이 없다.
    expect(pastMinOn('2026-08-30', KST_PAST_MIDNIGHT)).toBe(0)
  })

  test('[CAL-BOOK-03] 문이 잡는 기본 날짜는 병원의 오늘이다', () => {
    expect(hospitalToday(KST_PAST_MIDNIGHT)).toBe('2026-08-29')
  })

  test('요일 표기는 UTC 자정 파싱에 밀리지 않는다', () => {
    expect(fmtDate('2026-08-29')).toBe('8월 29일 (토)')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/shell/doors/doorData.test.ts`
Expected: FAIL — `pastMinOn('2026-08-29', …)`이 로컬 기준이라 다른 수를 준다.

- [ ] **Step 3: `doorData.ts`를 고친다**

`todayIsoLocal`과 `localDate`를 지우고 `clock`을 쓴다:

```ts
import { addDaysIso, formatHospitalDate, hospitalMinutesOfDay, hospitalToday, hospitalWeekday } from '../../lib/clock'

/** [CAL-PAST-01] 그 날에서 「지난 시각」이 어디까지인가(자정 기준 분) — **병원 시계 기준**.
 *  다가올 날은 0, 지나간 날은 하루 전체. */
export function pastMinOn(dateIso: string, at: Date = new Date()): number {
  const today = hospitalToday(at)
  if (dateIso > today) return 0
  if (dateIso < today) return 24 * 60
  return hospitalMinutesOfDay(at)
}

/** '2026-08-29' → '8월 29일 (토)'. 요일은 조각으로 읽는다(UTC 자정 파싱 함정 회피). */
export function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}월 ${Number(d)}일 (${['일','월','화','수','목','금','토'][hospitalWeekday(iso)]})`
}
```

`todayIsoLocal()` export를 지우고, 이 파일 안의 호출을 `hospitalToday()`로 바꾼다.

- [ ] **Step 4: 호출부 3곳을 고친다**

```bash
cd frontend/src
grep -rn "todayIsoLocal\|localDate" --include="*.ts" --include="*.tsx" .
```

나오는 자리를 전부 바꾼다:
- `shell/doors/DoorContext.tsx` — `todayIsoLocal()` → `hospitalToday()` (2곳: `open`의 날짜 기본값, `switchDoor`)
- `shell/doors/panels.tsx` — `todayIsoLocal()` → `hospitalToday()` (`isToday` 판정과 `dateIso` 기본값)
- `shell/doors/surfaces.tsx` — `localDate(todayIsoLocal())` → `hospitalToday()` 문자열 비교로. `MonthPicker`의 `past`·`isToday` 판정을 **문자열 비교**로 바꾼다:

```tsx
const todayIso = hospitalToday()
// …셀마다
const cellIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
const past = cellIso < todayIso
const isToday = cellIso === todayIso
```

`MonthPicker`가 처음 보여줄 달도 `selected`(Date) 대신 `draft.date ?? todayIso`의 앞 7글자로 잡는다.

- [ ] **Step 5: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/shell/doors/ && npx tsc --noEmit`
Expected: 모두 PASS (`BookingDoor.test.tsx`의 `tomorrowIso` 헬퍼도 `addDaysIso(hospitalToday(), 1)`로 바꿔 단순해진다)

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/shell/doors/
git commit -m "fix(doors): 세 문이 병원 시계를 본다 — 창구 PC 시계에 날짜가 흔들리지 않는다"
```

---

## 4. Task 3: `/today`와 `/queue`

**Files:**
- Modify: `frontend/src/pages/TodayPage.tsx:303~309`
- Modify: `frontend/src/pages/QueuePage.tsx:393~397`
- Test: `frontend/src/pages/TodayPage.test.tsx` · `QueuePage.test.tsx`(기존 파일에 더한다)

**Interfaces:** Consumes Task 1의 `hospitalToday`·`hospitalHHMM`·`formatHospitalDate`.

- [ ] **Step 1: 실패 테스트를 쓴다**

```tsx
// TodayPage.test.tsx 에 더한다
test('[TODAY-DATE-01] 머리글 날짜는 병원 시계의 오늘이다 — 창구 PC 시계가 아니다', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-28T16:20:00Z')) // KST 8/29 01:20
  renderTodayPage()
  expect(screen.getByText(/2026년 8월 29일/)).toBeVisible()
  vi.useRealTimers()
})
```

```tsx
// QueuePage.test.tsx 에 더한다
test('[QUEUE-ORDER-*] 「지금」 시각은 병원 시계로 적는다', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-28T16:20:00Z')) // KST 01:20
  expect(nowHHMM()).toBe('01:20')
  vi.useRealTimers()
})
```

⚠️ `nowHHMM`이 export가 아니면 이 태스크에서 export한다(테스트가 볼 수 있어야 한다).

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/pages/TodayPage.test.tsx src/pages/QueuePage.test.tsx`
Expected: FAIL — 로컬 시계라 8월 28일 / 09:20 류가 나온다.

- [ ] **Step 3: 고친다**

```tsx
// TodayPage.tsx
import { formatHospitalDate, hospitalToday } from '../lib/clock'

// ⚠️ 자정 자동 전환(TODAY-DATE-01)의 「스스로 갱신」은 실시간 구독(TODAY-LIVE-01)이 붙을 때
//    완성된다. 여기서는 마운트 시점 날짜를 그린다 — 단 **병원 자정** 기준이다.
return formatHospitalDate(hospitalToday(), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
```

```tsx
// QueuePage.tsx
import { hospitalHHMM } from '../lib/clock'

export function nowHHMM(): string {
  return hospitalHHMM()
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/pages/TodayPage.test.tsx src/pages/QueuePage.test.tsx && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/pages/TodayPage.tsx frontend/src/pages/QueuePage.tsx frontend/src/pages/TodayPage.test.tsx frontend/src/pages/QueuePage.test.tsx
git commit -m "fix(today,queue): 오늘 날짜와 지금 시각을 병원 시계로 읽는다"
```

---

## 5. Task 4: 예약 캘린더 셋 (`CalendarPage`·`DayGrid`·`WeekGrid`)

**Files:**
- Modify: `frontend/src/pages/calendar/CalendarPage.tsx:58`
- Modify: `frontend/src/pages/calendar/DayGrid.tsx:71`
- Modify: `frontend/src/pages/calendar/WeekGrid.tsx:45`
- Test: 각 파일의 기존 `.test.tsx`

**Interfaces:** Consumes `hospitalToday`·`hospitalMinutesOfDay`.

⭐ **이 셋은 이미 `now`를 prop으로 받는다**(테스트가 시각을 주입하려고 그렇게 만들어 뒀다). 따라서 **기본값만 바꾸고 내부에서 `now`를 읽는 방식을 고친다.** prop 계약은 그대로 두므로 기존 테스트가 안 깨진다.

- [ ] **Step 1: 실패 테스트를 쓴다** — `DayGrid.test.tsx`에 더한다

```tsx
test('[CAL-TIME-01] 「지금」 선은 병원 시계 위치에 그린다', () => {
  // KST 10:30 = UTC 01:30. 기계가 미 서부여도 선은 10:30 자리다.
  render(<DayGrid {...baseProps} now={new Date('2026-08-29T01:30:00Z')} />)
  const line = screen.getByTestId('now-line')
  expect(line).toHaveAttribute('data-minute', String(10 * 60 + 30))
})
```

⚠️ `now-line`에 `data-minute`이 없으면 이 태스크에서 붙인다(테스트가 위치를 볼 유일한 방법이다).

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/pages/calendar/DayGrid.test.tsx`
Expected: FAIL — 로컬 기준 분이 나온다.

- [ ] **Step 3: 셋을 고친다**

각 파일에서 `now`로부터 시·분·날짜를 꺼내는 자리를 바꾼다:

```tsx
import { hospitalMinutesOfDay, hospitalToday } from '../../lib/clock'

// 이전: now.getHours() * 60 + now.getMinutes()
const nowMin = hospitalMinutesOfDay(now)

// 이전: `${now.getFullYear()}-…`
const todayIso = hospitalToday(now)
```

기본값도 바꾼다: `now = new Date()`는 **그대로 둔다**(절대 순간을 받는 것이 맞다). 바뀌는 것은 **그 순간을 읽는 방식**이다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/pages/calendar/ && npx tsc --noEmit`
Expected: 107건+ PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/pages/calendar/
git commit -m "fix(calendar): 지금 선과 오늘 열을 병원 시계로 잡는다"
```

---

## 6. Task 5: 의사 콘솔과 워크인

**Files:**
- Modify: `frontend/src/pages/doctor/DoctorConsolePage.tsx:29`(`todayStr`)
- Modify: `frontend/src/pages/walkin/WalkinVisitTimePicker.tsx:37`
- Test: 각 파일의 기존 테스트

**Interfaces:** Consumes `hospitalToday`·`hospitalParts`.

⚠️ **`DoctorConsolePage.tsx:168`은 손대지 않는다** — `new Date().toISOString()`은 낙관적 잠금의 절대 순간이라 시간대 질문이 아니다.

- [ ] **Step 1: 실패 테스트를 쓴다**

```tsx
// DoctorConsolePage.test.tsx 에 더한다
test('[DOCTOR-START-01] 의사 콘솔이 부르는 「오늘」은 병원의 오늘이다', () => {
  expect(todayStr(new Date('2026-08-28T16:20:00Z'))).toBe('2026-08-29')
})
```

```tsx
// WalkinVisitTimePicker.test.tsx 에 더한다
test('[QUEUE-WALK-14] 「지금」이 가리키는 시각은 병원 시계다', () => {
  const at = new Date('2026-08-28T16:20:00Z') // KST 01:20
  render(<WalkinVisitTimePicker now={at} onChange={() => {}} />)
  expect(screen.getByText(/01:20/)).toBeVisible()
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/pages/doctor/DoctorConsolePage.test.tsx src/pages/walkin/`
Expected: FAIL

- [ ] **Step 3: 고친다**

```tsx
// DoctorConsolePage.tsx
import { hospitalToday } from '../../lib/clock'
function todayStr(d = new Date()): string {
  return hospitalToday(d)
}
```

```tsx
// WalkinVisitTimePicker.tsx — `base`에서 시·분을 꺼내는 자리를 조각으로
import { hospitalParts } from '../../lib/clock'
const p = hospitalParts(now ?? new Date())
// 이전: base.getHours() / base.getMinutes()  →  Number(p.hh) / Number(p.mm)
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run src/pages/doctor/ src/pages/walkin/ && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/pages/doctor/DoctorConsolePage.tsx frontend/src/pages/walkin/
git commit -m "fix(doctor,walkin): 의사 콘솔의 오늘과 워크인의 지금을 병원 시계로"
```

---

## 7. Task 6: 관리자 화면 넷

**Files:**
- Modify: `frontend/src/components/staff-ui/PeriodSelect.tsx:29~35`(`isoToday`)
- Modify: `frontend/src/pages/admin/PeriodPicker.tsx:24`(`presetRange`)
- Modify: `frontend/src/pages/admin/schedule/SchedulePage.tsx:215~222`
- Modify: `frontend/src/pages/admin/staff/staffFormat.ts:14`(`formatLastSignIn`)
- Test: 각 파일의 기존 테스트

**Interfaces:** Consumes `hospitalToday`·`hospitalParts`·`addDaysIso`.

- [ ] **Step 1: 실패 테스트를 쓴다**

```ts
// staffFormat.test.ts 에 더한다
test('「오늘·어제」 판정은 병원 자정을 기준으로 한다', () => {
  const now = new Date('2026-08-28T16:20:00Z')       // KST 8/29 01:20
  const signedIn = new Date('2026-08-28T15:30:00Z')  // KST 8/29 00:30 — 병원 기준 같은 날
  expect(formatLastSignIn(signedIn.toISOString(), now)).toBe('오늘 00:30')
})
```

```ts
// PeriodSelect.test.tsx / PeriodPicker.test.ts 에 더한다
test('기간 기본값의 「오늘」은 병원의 오늘이다', () => {
  const at = new Date('2026-08-28T16:20:00Z')
  expect(presetRange('today', at)).toEqual({ from: '2026-08-29', to: '2026-08-29' })
})
```

⚠️ `presetRange`의 두 번째 인자는 지금 `today = new Date()`다. **인자 이름을 `at`으로 바꾸고 의미를 「지금」으로 통일**한다(날짜가 아니라 순간을 받는다).

- [ ] **Step 2: 실패를 확인한다**

Run: `cd frontend && npx vitest run src/pages/admin/ src/components/staff-ui/`
Expected: FAIL

- [ ] **Step 3: 넷을 고친다**

```ts
// PeriodSelect.tsx
import { hospitalToday } from '../../lib/clock'
function isoToday(): string { return hospitalToday() }
```

```ts
// PeriodPicker.tsx — 로컬 조각 대신 문자열 셈
import { addDaysIso, hospitalToday } from '../../lib/clock'
export function presetRange(key: PresetKey, at: Date = new Date()): { from: string; to: string } {
  const today = hospitalToday(at)
  // 각 프리셋을 addDaysIso(today, -N) 꼴로 계산한다. Date 산술을 쓰지 않는다.
}
```

```ts
// SchedulePage.tsx — 217·220행의 로컬 오늘을 hospitalToday()로
// staffFormat.ts — d/now의 조각을 hospitalParts로 읽고, 날짜 비교는 문자열로
import { hospitalParts, hospitalToday, addDaysIso } from '../../../lib/clock'
export function formatLastSignIn(iso: string, now: Date = new Date()): string {
  const p = hospitalParts(new Date(iso))
  const dayIso = `${p.y}-${p.mo}-${p.d}`
  const time = `${p.hh}:${p.mm}`
  const today = hospitalToday(now)
  if (dayIso === today) return `오늘 ${time}`
  if (dayIso === addDaysIso(today, -1)) return `어제 ${time}`
  return `${Number(p.mo)}월 ${Number(p.d)}일 ${time}`
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 전체 GREEN

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/pages/admin/ frontend/src/components/staff-ui/PeriodSelect.tsx
git commit -m "fix(admin): 기간 기본값과 마지막 접속 표기를 병원 시계로"
```

---

## 8. Task 7: 재발 방지 — 검사기

**Files:**
- Create: `frontend/scripts/lint-clock.mjs`
- Modify: `frontend/package.json`(`"lint:clock"` 스크립트)

**Interfaces:** Produces `npm run lint:clock` — 위반이 있으면 exit 1.

**왜 필요한가:** 이 병은 **조용히 돌아온다.** 새 화면이 `new Date().getHours()`를 쓰면 아무 테스트도 안 깨지고, 개발자의 기계가 한국이면 몇 달간 안 보인다. 토큰 검사기(`design-tokens/lint-tokens.mjs`)와 같은 자리다.

- [ ] **Step 1: 검사기를 쓴다**

```js
// frontend/scripts/lint-clock.mjs
// ⭐ 「지금·오늘」을 기계 시계로 읽는 자리를 찾아낸다 — 병원 시계는 `lib/clock.ts` 하나뿐이다.
//    이 병은 테스트로는 안 잡힌다: 개발자의 기계가 한국이면 몇 달간 안 보이고,
//    창구 PC 시계가 틀어진 병원에서만 조용히 하루가 어긋난다.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.argv[2] ?? 'src'
const ALLOW = ['src/lib/clock.ts', 'src/lib/clock.test.ts']

// Date에서 **로컬 달력 조각**을 꺼내는 읽기 — 이것이 시간대 질문이다.
const BAD = /\.(getHours|getMinutes|getFullYear|getMonth|getDate|getDay|getTimezoneOffset)\s*\(/
// Intl에 timeZone을 안 준 것 — 기본값이 기계 시간대다.
const INTL = /new Intl\.DateTimeFormat\((?![^)]*timeZone)/
// 시간대 상수의 두 번째 사본.
const TZ = /'Asia\/Seoul'|"Asia\/Seoul"/

const hits = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { walk(p); continue }
    if (!/\.tsx?$/.test(p)) continue
    const rel = relative('.', p)
    if (ALLOW.includes(rel)) continue
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return
      const why = BAD.test(line) ? '기계 달력 조각' : INTL.test(line) ? 'timeZone 없는 Intl' : TZ.test(line) ? '시간대 상수 사본' : null
      if (why) hits.push(`${rel}:${i + 1} [${why}] ${line.trim().slice(0, 90)}`)
    })
  }
}
walk(ROOT)

if (hits.length) {
  console.error(`병원 시계를 안 쓰는 자리 ${hits.length}건 — lib/clock.ts의 창구를 쓰세요.\n`)
  hits.forEach((h) => console.error('  ' + h))
  process.exit(1)
}
console.log('병원 시계 검사 통과')
```

- [ ] **Step 2: 돌려서 남은 위반을 확인한다**

Run: `cd frontend && node scripts/lint-clock.mjs src`
Expected: Task 2~6에서 안 고친 자리만 나온다. **테스트 파일의 의도적 사용**(시각 주입)은 `ALLOW`에 더하거나 해당 줄에 `// clock-ok` 주석을 허용하도록 검사기를 넓힌다.

- [ ] **Step 3: 0건이 될 때까지 남은 자리를 고친다**

§0의 「손대지 않을 6군데」는 `.getHours()`류를 안 쓰므로 원래 안 걸린다. 걸린다면 그 자리가 실제로 시간대 질문이었던 것이니 고친다.

- [ ] **Step 4: `package.json`에 스크립트를 더한다**

```json
"lint:clock": "node scripts/lint-clock.mjs src"
```

- [ ] **Step 5: 커밋**

```bash
git add frontend/scripts/lint-clock.mjs frontend/package.json
git commit -m "chore(clock): 기계 시계 사용을 잡는 검사기 — 이 병은 테스트로 안 잡힌다"
```

---

## 9. Task 8: 정본화와 브라우저 확인

**Files:**
- Modify: `docs/design/screen-behaviors.md`(공용 규칙 절)
- Modify: `docs/superpowers/specs/2026-07-31-ui-design-decisions.md`(결정 + 기각안)
- Modify: `tools/shot/*.mjs`(D4에서 이미 `TZ: 'Asia/Seoul'`을 넣었다 — **주석을 갱신**해 「이제 코드가 스스로 병원 시계를 쓰므로 이건 브라우저 표시 확인용」임을 남긴다)

- [ ] **Step 1: 규칙을 심는다** — `screen-behaviors.md`에 신설

```markdown
| `TIME-TZ-01` 🆕 | ⭐ 「지금·오늘」은 **병원 시계**다 | 항상 | 화면이 날짜·시각을 판정할 때 쓰는 시계는 **`Asia/Seoul` 하나**다(`lib/clock.ts`가 유일 창구). ⛔ **창구 PC의 시계를 믿지 않는다** — 서버는 이미 KST로 못박혀 있어(`app/db/pool.py`), 화면만 로컬을 쓰면 **한 화면 안에서 날짜가 갈린다**(2026-08-28 D4 대조에서 왼쪽 캘린더 8/28 · 위쪽 타일 8/29). PC 시계가 틀어졌거나 해외 접속이면 실제 병원에서도 같은 일이 난다 | 2026-08-28 결정 |
| `TIME-TZ-02` 🆕 | 〃 무엇은 그대로 두나 | 경과시간·저장 시각·낙관적 잠금 | **절대 순간**은 시간대 질문이 아니다 — `new Date()`를 그대로 쓴다. 금지되는 것은 **그 순간에서 로컬 달력 조각(`getHours`·`getDate`류)을 꺼내 오늘·지금을 판정하는 것**이다 | 〃 · `lint:clock` |
```

- [ ] **Step 2: 결정 문서에 근거를 남긴다** — 「화면도 병원 시계를 쓴다(2026-08-28)」 절을 만들고 ①관측된 증상 ②기각안(*"개발 맥의 시간대를 서울로 바꾼다"* — 사람이 매번 신경 써야 하고 제품 결함은 그대로 남는다 / *"화면만 시간여행 시계를 넣는다"* — 서버는 DB `current_date`로 판정하므로 화면만 옮기면 더 크게 어긋난다) ③채택안을 적는다.

- [ ] **Step 3: 브라우저로 확인한다**

⭐ **이 태스크의 진짜 합격 판정이다.** 촬영 스크립트에서 `TZ: 'Asia/Seoul'`을 **일부러 빼고** 돌려, 기계가 미 서부여도 화면이 병원 날짜를 그리는지 본다.

```bash
cd tools/shot
# TZ 주입을 뺀 사본으로 돌린다 — 코드가 스스로 병원 시계를 쓰면 결과가 같아야 한다.
S=/tmp/clockcheck node shot-booking.mjs notz 김지민
```

기대: 날짜 칸·일간 캘린더 머리글·「오늘의 현황」 머리글이 **모두 서버와 같은 날**을 말한다.

- [ ] **Step 4: 커밋**

```bash
git add docs/ tools/shot/
git commit -m "docs(clock): TIME-TZ-01·02 정본화 — 화면도 병원 시계를 쓴다"
```

---

## 10. 이 계획이 하지 않는 것

- **백엔드는 한 줄도 안 고친다.** 이미 `Asia/Seoul`로 못박혀 있고, 그것이 옳다.
- **시간여행(임의 시각 주입)은 넣지 않는다.** Task 1의 모든 함수가 `at?: Date`를 받으므로 **테스트에서는 이미 시간여행이 된다.** 화면 전체를 임의 시각으로 돌리는 것은 서버(DB `current_date`)가 따라오지 못해 오히려 어긋나므로, 필요해지면 **백엔드까지 함께** 별도 계획으로 다룬다.
- **시드를 늘리지 않는다.** 3일치 → 8주치는 캘린더 주간·달 이동 검수를 위한 **별개 과제**다(어긋남과 무관).
- **자정 자동 전환(`TODAY-DATE-01`)을 구현하지 않는다.** 이 계획은 「어느 자정인가」만 정한다. 「스스로 넘어간다」는 실시간 구독(`TODAY-LIVE-01`)이 붙을 때 완성된다.
