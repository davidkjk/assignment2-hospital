import type { CalendarMode } from './CalendarNav'

// [CAL-NAV-06][CAL-NAV-07] 작은 달력 — 잡는 단위가 보기마다 다르고, 그 차이를 글자로 적어 둔다.
//   ⛔ 안 적으면 주간에서 6일을 눌렀는데 주가 통째로 바뀌는 것이 고장으로 읽힌다.
// [L8] 예약 가능 범위(오늘~horizon, ≈8주)를 처음부터 한눈에 — 월 격자 하나만 그려 다음 달로 못 넘어가던
//   문제(L3)를 없앤다. today·horizon이 있으면 그 범위의 주들을 죽 펼치고, 없으면(로딩 중) 종전 월 격자로 물러난다.

const WEEKDAY_HEADS = ['월', '화', '수', '목', '금', '토', '일']
const MS_PER_DAY = 86_400_000

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`  // clock-ok — 달력 격자의 칸 배치 계산이라 시간대 질문이 아니다.
}

/** ISO(yyyy-mm-dd)를 로컬 Date로. 격자 배치 계산용이라 시간대 무관. */
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)  // clock-ok — 격자 배치 계산
}

/** 그 날짜가 든 주의 월요일. */
function mondayOf(d: Date): Date {
  const lead = (d.getDay() + 6) % 7 // 월=0  // clock-ok — 격자 배치 계산
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - lead)  // clock-ok — 격자 배치 계산
}

/** 두 ISO 날짜(yyyy-mm-dd)의 「몇 월」 — 8주 범위 표시(N월–M월)에 쓴다. */
function monthOf(iso: string): number {
  return Number(iso.slice(5, 7))
}

/**
 * 화면에 펼칠 주(週)들. 각 주는 월요일~일요일 7칸.
 * - 범위 모드(today·horizon 있음): 오늘이 든 주 ~ horizon이 든 주까지 죽 편다.
 * - 물러선 모드: anchor 달의 6주 격자(종전 동작).
 */
function buildWeeks(anchor: Date, today?: string, horizonDate?: string): Date[][] {
  let start: Date
  let endMonday: Date
  if (today && horizonDate) {
    start = mondayOf(parseIso(today))
    endMonday = mondayOf(parseIso(horizonDate))
  } else {
    start = mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1))  // clock-ok — 격자 배치 계산
    endMonday = new Date(start.getTime() + 5 * 7 * MS_PER_DAY) // 6주
  }
  const weeks: Date[][] = []
  for (let t = start.getTime(); t <= endMonday.getTime(); t += 7 * MS_PER_DAY) {
    weeks.push(Array.from({ length: 7 }, (_, i) => new Date(t + i * MS_PER_DAY)))
  }
  return weeks
}

export interface MiniCalendarProps {
  mode: CalendarMode
  anchorDate: Date
  onPick: (date: string) => void
  /** 병원 오늘(ISO) — 오늘을 강조하고, 예약 가능 범위의 시작으로 삼는다. */
  today?: string
  /** 예약 가능한 마지막 날(ISO, `booking_horizon_date`) — 이 너머 날짜는 고를 수 없다(CAL-BOOK-13). */
  horizonDate?: string
}

export function MiniCalendar({ mode, anchorDate, onPick, today, horizonDate }: MiniCalendarProps) {
  const rangeMode = today != null && horizonDate != null
  const weeks = buildWeeks(anchorDate, today, horizonDate)
  const anchorMonth = anchorDate.getMonth()  // clock-ok — 격자 배치 계산

  // 월이 바뀌는 주에만 왼쪽 여백에 「N월」을 적는다 — 여러 달을 죽 펼쳐도 어느 달인지 길잡이가 된다.
  // 한 주가 두 달에 걸치면 목요일이 속한 달을 그 주의 대표 달로 삼는다.
  let lastLabeled = -1

  return (
    <div className="cal-mini" role="dialog" aria-label="날짜 이동">
      <p className="cal-mini-note" data-testid="mini-unit-note">
        {mode === 'week' ? '누른 날이 든 주로 이동합니다' : '누른 날로 이동합니다'}
        {/* ⭐ 화면이 「8주」를 박지 않는다(갭 #47) — 서버가 준 horizon으로 범위를 적는다. */}
        {today && horizonDate && (
          <span className="cal-mini-range" data-testid="mini-range">
            {' '}· 예약 {monthOf(today)}월–{monthOf(horizonDate)}월
          </span>
        )}
      </p>
      <div className="cal-mini-heads">
        <span className="cal-mini-monthcol" aria-hidden="true" />
        {WEEKDAY_HEADS.map((h) => (
          <span key={h} className="cal-mini-head">
            {h}
          </span>
        ))}
      </div>
      <div className="cal-mini-weeks">
        {weeks.map((week) => {
          const repMonth = week[3].getMonth() // 목요일  // clock-ok — 격자 배치 계산
          const showLabel = repMonth !== lastLabeled
          if (showLabel) lastLabeled = repMonth
          return (
            <div className="cal-mini-week" key={ymd(week[0])}>
              <span className="cal-mini-monthcol">{showLabel ? `${repMonth + 1}월` : ''}</span>
              {week.map((d) => {
                const iso = ymd(d)
                // [CAL-BOOK-13] 예약 가능 범위(오늘~horizon) 밖은 고를 수 없다. ISO는 사전순=시간순이라 문자열로 잰다.
                const outOfRange = (today != null && iso < today) || (horizonDate != null && iso > horizonDate)
                const isToday = today != null && iso === today
                // 물러선 모드에서만 anchor 달 밖 날짜를 흐리게(범위 모드는 disabled로 이미 구분된다).
                const otherMonth = !rangeMode && d.getMonth() !== anchorMonth  // clock-ok — 격자 배치 계산
                return (
                  <button
                    key={iso}
                    type="button"
                    data-iso={iso}
                    disabled={outOfRange}
                    className={
                      'cal-mini-day' +
                      (otherMonth ? ' is-other-month' : '') +
                      (isToday ? ' is-today' : '')
                    }
                    onClick={() => onPick(iso)}
                  >
                    {d.getDate()}  {/* clock-ok — 격자 칸 배치 계산 */}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
