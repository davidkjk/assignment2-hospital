import { useState } from 'react'
import { ChevronLeft, ChevronRight } from '@/components/icons'
import { BOOKING_WINDOW_DAYS } from '@/mock/data'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

type MonthCalendarProps = {
  /** 예약 가능한 날짜(YYYY-MM-DD) 집합 — 테두리+선택 가능(BOOK-DATE-02). */
  available: Set<string>
  onSelect: (date: string) => void
  /** 선택 가능한 날 버튼에 붙일 testid(화면마다 다름: 예약='available-date', 변경='change-date'). */
  testIdAvailable: string
  /** 현재 예약 날짜에 점을 찍는다(예약 변경 화면). */
  markedDate?: string
  /** 예약 가능 범위(일). 기본 8주(BOOK-DATE-06). */
  windowDays?: number
}

/**
 * 월 단위 달력(BOOK-DATE-01). 상단 `‹ 2026년 8월 ›`로 달을 넘긴다.
 * - 이전 달: 이번 달이면 비활성(BOOK-DATE-07, 지난 날짜로 갈 이유 없음).
 * - 다음 달: 예약 범위(8주)를 넘는 달이면 비활성 + 이유 한 줄(BOOK-DATE-06, 막다른 길 금지).
 * 예약 4단계와 예약 변경이 같은 달력을 쓴다(APPT-CHG-05).
 */
export function MonthCalendar({
  available,
  onSelect,
  testIdAvailable,
  markedDate,
  windowDays = BOOKING_WINDOW_DAYS,
}: MonthCalendarProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const thisYear = today.getFullYear()
  const thisMonth = today.getMonth()

  // 예약 범위의 마지막 날이 속한 달까지만 넘길 수 있다.
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + windowDays)
  const lastYear = horizon.getFullYear()
  const lastMonth = horizon.getMonth()

  const [view, setView] = useState({ year: thisYear, month: thisMonth })
  const monthIndex = (y: number, m: number) => y * 12 + m
  const canPrev = monthIndex(view.year, view.month) > monthIndex(thisYear, thisMonth)
  const canNext = monthIndex(view.year, view.month) < monthIndex(lastYear, lastMonth)

  const step = (delta: number) => {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const { year, month } = view
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div>
      <div className="mb-4 flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label="이전 달"
          disabled={!canPrev}
          onClick={() => step(-1)}
          className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/5 disabled:pointer-events-none disabled:text-muted-foreground/30"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="min-w-[7rem] text-center text-base font-semibold">
          {year}년 {month + 1}월
        </p>
        <button
          type="button"
          aria-label="다음 달"
          disabled={!canNext}
          onClick={() => step(1)}
          className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/5 disabled:pointer-events-none disabled:text-muted-foreground/30"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-xs font-semibold text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />
          const date = iso(year, month, day)
          const ok = available.has(date)
          const isMarked = date === markedDate
          return (
            <button
              key={date}
              type="button"
              disabled={!ok}
              data-testid={ok ? testIdAvailable : undefined}
              onClick={() => onSelect(date)}
              className={
                'relative aspect-square rounded-full text-sm ' +
                (ok
                  ? 'border-2 border-primary font-bold hover:bg-primary hover:text-primary-foreground'
                  : 'text-muted-foreground/40')
              }
            >
              {day}
              {isMarked && (
                <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* 다음 달로 더 못 넘길 때 이유를 준다(BOOK-DATE-06). */}
      {!canNext && (
        <p className="mt-3 text-center text-xs text-muted-foreground">예약은 8주 뒤까지 가능합니다</p>
      )}
    </div>
  )
}
