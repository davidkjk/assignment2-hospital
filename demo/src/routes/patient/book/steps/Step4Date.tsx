import { getAvailableDates } from '@/mock/data'
import type { StepProps } from '../BookingWizard'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// 4단계 — 날짜(BOOK-DATE-*). 월 달력. 예약 가능일만 테두리+선택 가능, 나머지는 흐린 숫자.
export function Step4Date({ wizard }: { wizard: StepProps }) {
  const { state, setField, next } = wizard
  const available = new Set(state.doctor ? getAvailableDates(state.doctor.id) : [])

  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">언제 방문하시겠어요?</h1>
      <p className="mb-4 text-center text-base font-semibold">
        {year}년 {month + 1}월
      </p>

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
          return (
            <button
              key={date}
              disabled={!ok}
              onClick={() => {
                setField('date', date)
                next()
              }}
              className={
                'aspect-square rounded-full text-sm ' +
                (ok
                  ? 'border-2 border-primary font-bold hover:bg-primary hover:text-primary-foreground'
                  : 'text-muted-foreground/40')
              }
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* 범례(BOOK-DATE-04) */}
      <div className="mt-5 flex justify-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-primary" /> 예약 가능
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-muted" /> 진료 없음
        </span>
      </div>
    </div>
  )
}
