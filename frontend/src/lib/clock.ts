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

/** 병원 시간대의 UTC 오프셋(분). 대한민국은 1988년 이후 **서머타임이 없어** 늘 +09:00이다.
 *  ⚠️ 이 상수는 이 파일 밖으로 나가지 않는다 — 나가는 순간 시간대 사본이 하나 더 생긴다. */
const HOSPITAL_UTC_OFFSET_MIN = 9 * 60

/** 병원 달력의 「그 날 그 시각」을 실제 순간으로 — 직원이 친 시각을 서버에 보낼 때 쓴다.
 *  ⭐ `new Date(y, m-1, d, hh, mm)`을 쓰면 **그 PC의 시간대**로 해석되어, 창구 PC가 한국이
 *     아니면 저장되는 순간 자체가 틀린다(표시만 틀리는 것과 차원이 다르다). */
export function hospitalInstant(dateIso: string, hh: number, mm: number): Date {
  const [y, m, d] = dateIso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - HOSPITAL_UTC_OFFSET_MIN * 60_000)
}

/** 서버가 준 시각 문자열을 **병원 시각**으로 읽는다.
 *  ⚠️ 서버는 곳에 따라 두 꼴로 준다:
 *    · `2026-08-29T09:00:00` — 오프셋 **없음**. `datetime.combine(slot_date, start_time)`이
 *      만든 **병원 벽시계 시각**이다(`dashboard_service._calendar_bar`). 이걸 `new Date()`로
 *      읽으면 **그 PC 시간대로 해석**되어, 미 서부에서는 예약 막대가 통째로 사라진다
 *      (2026-08-28 Task 8 검증에서 실제로 그랬다).
 *    · `2026-08-29T00:00:00+00:00` — asyncpg가 timestamptz를 UTC로 돌려준 것. 이미 절대 순간이다.
 *  ⭐ 오프셋이 붙어 있으면 그대로 쓰고, 없으면 병원 시각으로 읽는다. */
export function parseHospitalIso(value: string): Date {
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(value)) return new Date(value)
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return new Date(value)
  return hospitalInstant(`${m[1]}-${m[2]}-${m[3]}`, Number(m[4]), Number(m[5]))
}

/** 절대 순간 ISO → 병원 시각 `YYYY.MM.DD HH:mm:ss`. 저장·감사 시각을 표에 그대로 보일 때. */
export function formatHospitalDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOSPITAL_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hour = g('hour') === '24' ? '00' : g('hour') // Intl는 자정을 24로 줄 수 있다
  return `${g('year')}.${g('month')}.${g('day')} ${hour}:${g('minute')}:${g('second')}`
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' → '2026년 8월 29일 (토)'. opts를 주면 Intl로 넘긴다(시간대는 늘 병원). */
export function formatHospitalDate(dateIso: string, opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  if (!opts) return `${y}년 ${m}월 ${d}일 (${WEEKDAY_KO[hospitalWeekday(dateIso)]})`
  return new Intl.DateTimeFormat('ko-KR', { timeZone: HOSPITAL_TZ, ...opts })
    .format(new Date(Date.UTC(y, m - 1, d, 12))) // 정오로 잡아 시간대 이동에도 날짜가 안 밀린다
}
