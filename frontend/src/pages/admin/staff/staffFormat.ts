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
  const d = new Date(iso)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay(d, now)) return `오늘 ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `어제 ${time}`
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${time}`
}

/** `8월 14일` — 초대 보낸 날짜. */
export function formatInvitedDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** `8월 14일 (금) 09:30` — 영향 예약 한 건. 이름·전화 없이 날짜·요일·시각만(STAFF-DEACT-04). */
export function formatImpactTime(entry: { date: string; time: string }): string {
  const d = new Date(`${entry.date}T00:00:00`)
  const time = entry.time.slice(0, 5)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]}) ${time}`
}
