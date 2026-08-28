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
