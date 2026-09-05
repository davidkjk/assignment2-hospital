import { DayGrid } from './DayGrid'
import { TimeAxis } from './TimeAxis'
import type { GridDoctor } from './gridModel'
import type { CalendarData } from '../../api/calendar'
import { buildGridModel } from './gridModel'
import { hospitalMinutesOfDay, hospitalToday } from '../../lib/clock'

// [CAL-VIEW-05][CAL-VIEW-09] 주간은 일간을 폭만 좁힌 것 — 같은 부품(DayGrid)을 하루마다 compact로 쓴다.
//   ⛔ 30분 칸 격자로 다시 그리지 않는다(그러면 15분·30분 예약이 똑같아 보이고 표현을 둘 배운다).
//   ⭐ 시간축은 6일 **바깥에 공용 거터로 한 번**만 둔다(2026-08-31). 예전엔 첫 날 DayGrid 안에 넣어
//      월요일 칸만 축 폭(56px)만큼 좁아지고 화~토와 레인이 어긋났다(사용자 지적) — 축을 빼면 6일이 같다.
//   ⭐ 레인은 **의사 수 × 최소폭**으로 고정한다 — max-content가 아니라 고정폭이라 예약 있는 날만
//      넓어지던 버그(토요일)가 사라지고, 8명이면 6일이 화면을 넘겨 **가로로 스크롤**된다(CAL-WEEK-07 훑는 곳).

const MS_PER_DAY = 86_400_000
const DAY_LABELS = ['월', '화', '수', '목', '금', '토']
/** 주간 레인 하나의 최소 폭(px). 8명이면 한 날 = 8×이 값이라 6일이 넘쳐 가로 스크롤된다. */
const WEEK_LANE_MIN = 44

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
  /** 전체 카탈로그 기준 고정 색 지도(L11) — 모든 날의 buildGridModel에 넘겨 색을 필터와 무관하게. */
  palette?: Map<string, number>
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
  palette,
  onOpenDay,
  onLaneClick,
  onBlockClick,
}: WeekGridProps) {
  const days = weekDays(anchorDate)
  const today = hospitalToday(now)
  // 이번 주에 오늘이 있으면 공용 축에 지금 시각을 표시(모든 날 같은 시각이라 한 번만).
  const nowMin = days.includes(today) ? hospitalMinutesOfDay(now) : null
  // 한 날 칸의 최소 폭 = 의사 수 × 레인 최소폭. 이 값을 넘으면 6일이 화면을 넘겨 가로 스크롤된다.
  const dayMinWidth = Math.max(1, doctors.length) * WEEK_LANE_MIN

  return (
    <div className="cal-week-grid" data-testid="week-grid">
      {/* 공용 시간축 — 6일 바깥에 한 번. sticky라 가로로 스크롤해도 왼쪽에 남는다. */}
      <TimeAxis startHour={startHour} endHour={endHour} hourHeight={hourHeight} onDragBy={() => {}} nowMin={nowMin} />
      {days.map((date, i) => {
        const data = dataByDate.get(date)
        const model = data ? buildGridModel(data, date, palette) : { doctors, appointmentsByDoctor: new Map(), blocksByDoctor: new Map() }
        // 카탈로그는 공통(모든 날 같은 의사 열) — 응답의 의사가 비면 상위가 준 doctors를 쓴다.
        const laneDoctors = model.doctors.length ? model.doctors : doctors
        return (
          <div
            key={date}
            className="cal-week-day"
            data-testid={`day-cell-${date}`}
            style={{ minWidth: dayMinWidth }}
          >
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
              hideAxis
              onLaneClick={onLaneClick}
              onBlockClick={onBlockClick}
            />
          </div>
        )
      })}
    </div>
  )
}
