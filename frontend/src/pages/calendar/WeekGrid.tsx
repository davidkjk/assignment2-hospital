import { DayGrid } from './DayGrid'
import type { GridDoctor } from './gridModel'
import type { CalendarData } from '../../api/calendar'
import { buildGridModel } from './gridModel'

// [CAL-VIEW-05][CAL-VIEW-09] 주간은 일간을 폭만 좁힌 것 — 같은 부품(DayGrid)을 하루마다 compact로 쓴다.
//   ⛔ 30분 칸 격자로 다시 그리지 않는다(그러면 15분·30분 예약이 똑같아 보이고 표현을 둘 배운다).
//   시간축은 왼쪽에 한 번만(첫 날 DayGrid), 나머지 날은 hideAxis.

const MS_PER_DAY = 86_400_000
const DAY_LABELS = ['월', '화', '수', '목', '금', '토']

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 주의 시작(월요일)을 세는 좌표 계산이다.
}

/** 그 날이 든 주의 월~토 6일. 병원은 일요일 휴무. */
export function weekDays(anchor: Date): string[] {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 주의 시작(월요일)을 세는 좌표 계산이다.
  const monday = new Date(d.getTime() - ((d.getDay() + 6) % 7) * MS_PER_DAY)  // clock-ok — anchor는 병원 오늘로 만든 로컬 Date다. 주의 시작(월요일)을 세는 좌표 계산이다.
  return Array.from({ length: 6 }, (_, i) => ymd(new Date(monday.getTime() + i * MS_PER_DAY)))
}

export interface WeekGridProps {
  anchorDate: Date
  doctors: GridDoctor[]
  /** 날짜별 응답(CalendarPage가 주간 범위를 한 번에 받아 날짜로 쪼갠다). */
  dataByDate: Map<string, CalendarData>
  hourHeight: number
  startHour?: number
  endHour?: number
  now?: Date
  onOpenDay?: (date: string) => void
  onLaneClick?: (doctorId: string, date: string) => void
  onBlockClick?: (appointmentId: string) => void
}

export function WeekGrid({
  anchorDate,
  doctors,
  dataByDate,
  hourHeight,
  startHour = 9,
  endHour = 18,
  now = new Date(),
  onOpenDay,
  onLaneClick,
  onBlockClick,
}: WeekGridProps) {
  const days = weekDays(anchorDate)

  return (
    <div className="cal-week-grid" data-testid="week-grid" style={{ display: 'flex' }}>
      {days.map((date, i) => {
        const data = dataByDate.get(date)
        const model = data ? buildGridModel(data, date) : { doctors, appointmentsByDoctor: new Map(), blocksByDoctor: new Map() }
        // 카탈로그는 공통(모든 날 같은 의사 열) — 응답의 의사가 비면 상위가 준 doctors를 쓴다.
        const laneDoctors = model.doctors.length ? model.doctors : doctors
        return (
          <div key={date} className="cal-week-day" data-testid={`day-cell-${date}`} style={{ display: 'flex', flexDirection: 'column' }}>
            {/* [CAL-NAV-01] 날짜 머리를 누르면 그 날의 일간으로 간다(토글도 함께 넘어간다). */}
            <button type="button" className="cal-week-day-head" onClick={() => onOpenDay?.(date)}>
              {DAY_LABELS[i]} {date.slice(5).replace('-', '/')}
            </button>
            <DayGrid
              date={date}
              doctors={laneDoctors}
              appointmentsByDoctor={model.appointmentsByDoctor}
              blocksByDoctor={model.blocksByDoctor}
              hourHeight={hourHeight}
              startHour={startHour}
              endHour={endHour}
              now={now}
              compact
              hideAxis={i > 0}
              onLaneClick={onLaneClick}
              onBlockClick={onBlockClick}
            />
          </div>
        )
      })}
    </div>
  )
}
