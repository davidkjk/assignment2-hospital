import { addDaysIso, hospitalParts, hospitalToday, hospitalWeekday } from '../../../lib/clock'
// [STAFF-LIST-07·STAFF-DEACT-04] 직원 화면의 시각 어휘 — 절대 시각만, 상대 시각(「10분 전」) 금지.
// OFF-BAN-03·04의 어휘를 그대로 쓴다: 오늘/어제 + HH:MM, 날짜가 넘어가면 날짜를 앞에.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** `오늘 08:57` · `어제 17:26` · `8월 6일 17:26`. */
export function formatLastSignIn(iso: string, now: Date = new Date()): string {
  // ⭐ 「오늘·어제」는 **병원 자정**을 기준으로 가른다(`TIME-TZ-01`) — 그 PC 자정으로 재면
  //    한국 새벽에 접속한 기록이 「어제」로 적힌다. 날짜 비교는 문자열로.
  const p = hospitalParts(new Date(iso))
  const dayIso = `${p.y}-${p.mo}-${p.d}`
  const time = `${p.hh}:${p.mm}`
  const today = hospitalToday(now)
  if (dayIso === today) return `오늘 ${time}`
  if (dayIso === addDaysIso(today, -1)) return `어제 ${time}`
  return `${Number(p.mo)}월 ${Number(p.d)}일 ${time}`
}

/** `8월 14일` — 초대 보낸 날짜. 서버가 준 순간을 **병원 달력**으로 읽는다(`TIME-TZ-01`). */
export function formatInvitedDate(iso: string): string {
  const p = hospitalParts(new Date(iso))
  return `${Number(p.mo)}월 ${Number(p.d)}일`
}

/** `8월 14일 (금) 09:30` — 영향 예약 한 건. 이름·전화 없이 날짜·요일·시각만(STAFF-DEACT-04). */
export function formatImpactTime(entry: { date: string; time: string }): string {
  // ⚠️ `new Date('2026-08-14T00:00:00')`은 **로컬 파싱**이라 요일이 시간대에 흔들린다.
  //    날짜 문자열은 조각으로 읽는다(`hospitalWeekday`).
  const [, mo, d] = entry.date.split('-').map(Number)
  const time = entry.time.slice(0, 5)
  return `${mo}월 ${d}일 (${WEEKDAYS[hospitalWeekday(entry.date)]}) ${time}`
}
