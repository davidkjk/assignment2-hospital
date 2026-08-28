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

export interface MiniCalendarProps {
  mode: CalendarMode
  anchorDate: Date
  onPick: (date: string) => void
}

export function MiniCalendar({ mode, anchorDate, onPick }: MiniCalendarProps) {
  const days = monthGrid(anchorDate)
  const month = anchorDate.getMonth()  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 달력 격자의 칸 배치 계산이라 시간대 질문이 아니다.

  return (
    <div className="cal-mini" role="dialog" aria-label="날짜 이동">
      <p className="cal-mini-note" data-testid="mini-unit-note">
        {mode === 'week' ? '누른 날이 든 주로 이동합니다' : '누른 날로 이동합니다'}
      </p>
      <div className="cal-mini-heads">
        {WEEKDAY_HEADS.map((h) => (
          <span key={h} className="cal-mini-head">
            {h}
          </span>
        ))}
      </div>
      <div className="cal-mini-grid">
        {days.map((d) => (
          <button
            key={ymd(d)}
            type="button"
            className={`cal-mini-day${d.getMonth() === month ? '' : ' is-other-month'}`}  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 달력 격자의 칸 배치 계산이라 시간대 질문이 아니다.
            onClick={() => onPick(ymd(d))}
          >
            {d.getDate()}  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 달력 격자의 칸 배치 계산이라 시간대 질문이 아니다.
          </button>
        ))}
      </div>
    </div>
  )
}
