import iconSpriteUrl from '../../shell/icons.svg?url'

// [CAL-NAV-*] 언제를 보나 — [‹][›]는 보는 단위만큼 움직이고(CAL-NAV-03), 기간 글자 자체가 버튼이라
//   누르면 작은 달력이 열린다(CAL-NAV-04, ⛔ 별도 [달력] 아이콘을 두지 않는다). [오늘]로 돌아온다(CAL-NAV-08).

export type CalendarMode = 'day' | 'week'

const MS_PER_DAY = 86_400_000

/** 그 날이 속한 주의 월요일(병원은 일요일 휴무라 주는 월~토 6일). */
function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())  // clock-ok — anchorDate는 CalendarPage가 병원 오늘로 만든 로컬 Date다. 그 Date를 로컬로 읽는 것은 일관되며, 여기서 하는 일은 주·달 이동 좌표 계산뿐이다.
  const back = (d.getDay() + 6) % 7 // 월=0 … 일=6  // clock-ok — anchorDate는 CalendarPage가 병원 오늘로 만든 로컬 Date다. 그 Date를 로컬로 읽는 것은 일관되며, 여기서 하는 일은 주·달 이동 좌표 계산뿐이다.
  return new Date(d.getTime() - back * MS_PER_DAY)
}

/** 화살표 이동 — 일간은 하루, 주간은 한 주(7일 뒤 같은 요일). */
export function shiftAnchor(mode: CalendarMode, anchor: Date, dir: 1 | -1): Date {
  const step = mode === 'week' ? 7 : 1
  return new Date(anchor.getTime() + dir * step * MS_PER_DAY)
}

/** 기간 라벨 — 일간은 그 하루, 주간은 월~토(같은 달이면 끝은 일자만). */
export function formatRange(mode: CalendarMode, anchor: Date): string {
  if (mode === 'day') {
    return `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월 ${anchor.getDate()}일`  // clock-ok — anchorDate는 CalendarPage가 병원 오늘로 만든 로컬 Date다. 그 Date를 로컬로 읽는 것은 일관되며, 여기서 하는 일은 주·달 이동 좌표 계산뿐이다.
  }
  const start = mondayOf(anchor)
  const end = new Date(start.getTime() + 5 * MS_PER_DAY) // 토요일
  const head = `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일`  // clock-ok — anchorDate는 CalendarPage가 병원 오늘로 만든 로컬 Date다. 그 Date를 로컬로 읽는 것은 일관되며, 여기서 하는 일은 주·달 이동 좌표 계산뿐이다.
  if (start.getMonth() === end.getMonth()) {  // clock-ok — anchorDate는 CalendarPage가 병원 오늘로 만든 로컬 Date다. 그 Date를 로컬로 읽는 것은 일관되며, 여기서 하는 일은 주·달 이동 좌표 계산뿐이다.
    return `${head} – ${end.getDate()}일`  // clock-ok — anchorDate는 CalendarPage가 병원 오늘로 만든 로컬 Date다. 그 Date를 로컬로 읽는 것은 일관되며, 여기서 하는 일은 주·달 이동 좌표 계산뿐이다.
  }
  return `${head} – ${end.getMonth() + 1}월 ${end.getDate()}일`  // clock-ok — anchorDate는 CalendarPage가 병원 오늘로 만든 로컬 Date다. 그 Date를 로컬로 읽는 것은 일관되며, 여기서 하는 일은 주·달 이동 좌표 계산뿐이다.
}

export interface CalendarNavProps {
  mode: CalendarMode
  anchorDate: Date
  onPrev(): void
  onNext(): void
  onToday(): void
  onOpenCalendar(): void
}

export function CalendarNav({ mode, anchorDate, onPrev, onNext, onToday, onOpenCalendar }: CalendarNavProps) {
  return (
    <div className="cal-nav">
      <button type="button" className="cal-nav-arrow" aria-label="이전" onClick={onPrev}>
        <svg aria-hidden="true" width="16" height="16">
          <use href={`${iconSpriteUrl}#calendar`} />
        </svg>
        ‹
      </button>
      {/* 기간 글자 자체가 버튼 — 누르면 작은 달력이 열린다(CAL-NAV-04). */}
      <button type="button" className="cal-nav-range" onClick={onOpenCalendar}>
        {formatRange(mode, anchorDate)} ▾
      </button>
      <button type="button" className="cal-nav-arrow" aria-label="다음" onClick={onNext}>
        ›
      </button>
      <button type="button" className="cal-nav-today" onClick={onToday}>
        오늘
      </button>
    </div>
  )
}
