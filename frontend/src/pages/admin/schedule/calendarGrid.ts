// [SCHED-EXC-01·02] 「특정 날짜 변경」 왼쪽 월간 달력의 격자를 만든다.
//   ⭐ 순수 함수다 — 그 달의 날들 + 앞뒤 이웃 달 며칠(빈칸 없이 격자를 채운다)을 6주(42칸)로.
//   ⚠️ 시간대에 오염되지 않게 UTC로만 계산한다(getUTC* — lib/clock 규칙이 로컬 조각을 막는다).
//      날짜만 다루므로 UTC 자정끼리의 하루(86,400,000ms) 덧셈은 DST와 무관하게 정확하다.

export interface CalendarDay {
  date: string // "2026-08-17"
  label: string // 일(day number)
  inMonth: boolean
  hasException: boolean // 등록된 변경이 있는 날만 ●(SCHED-EXC-02)
}

const DAY_MS = 86_400_000

function iso(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param year  네 자리 연도
 * @param month 1~12
 * @param exceptionDays 변경이 등록된 날("YYYY-MM-DD") 집합 — ●를 찍는다
 */
export function buildMonthGrid(
  year: number,
  month: number,
  exceptionDays: ReadonlySet<string>,
): CalendarDay[] {
  // 그 달 1일의 요일(월=0 … 일=6). getUTCDay는 일=0이라 +6 %7로 월요일 시작으로 돌린다.
  const firstWeekdayMon = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  // 격자 첫 칸 = 1일에서 요일만큼 앞으로(이웃 달로 넘어갈 수 있다).
  const startMs = Date.UTC(year, month - 1, 1 - firstWeekdayMon)

  const cells: CalendarDay[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(startMs + i * DAY_MS)
    const date = iso(d)
    cells.push({
      date,
      label: String(d.getUTCDate()),
      inMonth: d.getUTCMonth() === month - 1,
      hasException: exceptionDays.has(date),
    })
  }
  return cells
}
