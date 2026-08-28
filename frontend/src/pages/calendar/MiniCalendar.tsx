import type { CalendarMode } from './CalendarNav'

// [CAL-NAV-06][CAL-NAV-07] 작은 달력 — 잡는 단위가 보기마다 다르고, 그 차이를 글자로 적어 둔다.
//   ⛔ 안 적으면 주간에서 6일을 눌렀는데 주가 통째로 바뀌는 것이 고장으로 읽힌다.

const WEEKDAY_HEADS = ['월', '화', '수', '목', '금', '토', '일']
const MS_PER_DAY = 86_400_000

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 달력 격자의 칸 배치 계산이라 시간대 질문이 아니다.
}

/** 그 달의 1일이 앉을 요일(월=0)부터, 6주치 날짜 격자. */
function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 달력 격자의 칸 배치 계산이라 시간대 질문이 아니다.
  const lead = (first.getDay() + 6) % 7 // 월요일 시작  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 달력 격자의 칸 배치 계산이라 시간대 질문이 아니다.
  const start = new Date(first.getTime() - lead * MS_PER_DAY)
  return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * MS_PER_DAY))
}

/** 두 ISO 날짜(yyyy-mm-dd)의 「몇 월」 — 8주 범위 표시(N월–M월)에 쓴다. */
function monthOf(iso: string): number {
  return Number(iso.slice(5, 7))
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
  const days = monthGrid(anchorDate)
  const month = anchorDate.getMonth()  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 달력 격자의 칸 배치 계산이라 시간대 질문이 아니다.

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
        {WEEKDAY_HEADS.map((h) => (
          <span key={h} className="cal-mini-head">
            {h}
          </span>
        ))}
      </div>
      <div className="cal-mini-grid">
        {days.map((d) => {
          const iso = ymd(d)
          // [CAL-BOOK-13] 예약 가능 범위(오늘~horizon) 밖은 고를 수 없다. ISO는 사전순=시간순이라 문자열로 잰다.
          const outOfRange = (today != null && iso < today) || (horizonDate != null && iso > horizonDate)
          const isToday = today != null && iso === today
          return (
            <button
              key={iso}
              type="button"
              disabled={outOfRange}
              className={
                'cal-mini-day' +
                (d.getMonth() === month ? '' : ' is-other-month') +  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 달력 격자의 칸 배치 계산이다.
                (isToday ? ' is-today' : '')
              }
              onClick={() => onPick(iso)}
            >
              {d.getDate()}  {/* clock-ok — 격자 칸 배치 계산 */}
            </button>
          )
        })}
      </div>
    </div>
  )
}
