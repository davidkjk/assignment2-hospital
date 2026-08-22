import { getAvailableDates } from '@/mock/data'
import { MonthCalendar } from '@/components/MonthCalendar'
import type { StepProps } from '../BookingWizard'

// 4단계 — 날짜(BOOK-DATE-*). 월 달력(‹ ›로 8주 범위까지 넘김). 예약 가능일만 테두리+선택 가능.
export function Step4Date({ wizard }: { wizard: StepProps }) {
  const { state, setField, next } = wizard
  const available = new Set(state.doctor ? getAvailableDates(state.doctor.id) : [])

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">언제 방문하시겠어요?</h1>

      <MonthCalendar
        available={available}
        testIdAvailable="available-date"
        onSelect={(date) => {
          setField('date', date)
          next()
        }}
      />

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
