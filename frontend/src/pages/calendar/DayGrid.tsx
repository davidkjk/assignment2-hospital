import { useState } from 'react'
import iconSpriteUrl from '../../shell/icons.svg?url'
import { SlotBlock, type SlotWarning } from './SlotBlock'
import { TimeAxis } from './TimeAxis'
import { buildDayColumn, type PositionedSlot } from './layout'
import type { GridAppointment, GridBlock, GridDoctor } from './gridModel'

// [CAL-VIEW-05] 일간·주간이 같은 부품이다 — 주간은 이 열을 폭만 좁혀 하루 칸 안에 여럿 놓는다(WeekGrid).
//   세로축은 오직 시각(CAL-VIEW-01) · 블록 위·아래 끝이 시작·종료 시각이다.

const MS_PER_DAY = 86_400_000

function todayStr(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

/** 그 날의 상태 — 오늘이면 현재 분, 어제 이전이면 지난 날짜. */
function dayTense(date: string, now: Date): { nowMin: number | null; isPastDate: boolean } {
  const t = todayStr(now)
  if (date === t) return { nowMin: nowMinutes(now), isPastDate: false }
  const [y, m, d] = date.split('-').map(Number)
  const dayStart = new Date(y, m - 1, d).getTime()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return { nowMin: null, isPastDate: dayStart < todayStart }
}

export interface DayGridProps {
  date: string
  doctors: GridDoctor[]
  appointmentsByDoctor: Map<string, GridAppointment[]>
  blocksByDoctor: Map<string, GridBlock[]>
  affectedIds?: Set<string>
  overlapIds?: Set<string>
  supportIds?: Set<string>
  hourHeight: number
  startHour?: number
  endHour?: number
  now?: Date
  /** 저장 전 자리표(CAL-BOOK-04) — 다른 직원에게는 안 보인다(CAL-RACE-01). */
  hold?: { doctorId: string; startMin: number; endMin: number; taken?: boolean } | null
  /** 관리자면 열 머리에 ⚙(그 의사의 /admin/staff로 가는 길, CAL-COLOR-04). */
  isAdmin?: boolean
  /** 좁은 레인이면(주간) 열 머리·글자를 접는다. */
  compact?: boolean
  /** 주간은 시간축을 왼쪽 한 번만 그린다 — 각 날 칸은 축을 숨긴다(CAL-VIEW-05, 같은 부품 재사용). */
  hideAxis?: boolean
  /** 좁은 레인(주간)에서 칸 전체를 눌러 패널을 연다(CAL-WEEK-10) — 시각은 찍지 않는다. */
  onLaneClick?: (doctorId: string, date: string) => void
  onEmptyClick?: (doctorId: string, startMin: number) => void
  onBlockClick?: (appointmentId: string) => void
  onPastEmptyClick?: (date: string) => void
  onAxisDragBy?: (deltaPx: number) => void
  onDoctorSettings?: (doctorName: string) => void
}

export function DayGrid({
  date,
  doctors,
  appointmentsByDoctor,
  blocksByDoctor,
  affectedIds,
  overlapIds,
  supportIds,
  hourHeight,
  startHour = 9,
  endHour = 18,
  now = new Date(),
  hold = null,
  isAdmin = false,
  compact = false,
  hideAxis = false,
  onEmptyClick,
  onBlockClick,
  onLaneClick,
  onPastEmptyClick,
  onAxisDragBy,
  onDoctorSettings,
}: DayGridProps) {
  const windowStartMin = startHour * 60
  const windowEndMin = endHour * 60
  const pxPerMinute = hourHeight / 60
  const { nowMin, isPastDate } = dayTense(date, now)

  // [CAL-PAST-01·03] 지난 빈 곳을 눌렀을 때의 안내(막다른 길 금지 — 해결 경로를 함께 준다).
  const [pastHint, setPastHint] = useState(false)

  function warningsFor(appointmentId: string): SlotWarning[] | undefined {
    const w: SlotWarning[] = []
    if (affectedIds?.has(appointmentId)) w.push('affected')
    if (overlapIds?.has(appointmentId)) w.push('overlap')
    if (supportIds?.has(appointmentId)) w.push('support')
    return w.length ? w : undefined
  }

  return (
    <div className="cal-day-grid" data-testid="day-grid" data-scroll="horizontal">
      {!hideAxis && (
        <TimeAxis
          startHour={startHour}
          endHour={endHour}
          hourHeight={hourHeight}
          onDragBy={onAxisDragBy ?? (() => {})}
        />
      )}
      <div className="cal-columns" style={{ display: 'flex' }}>
        {doctors.map((doc) => {
          const slots = buildDayColumn({
            doctorId: doc.id,
            appointments: appointmentsByDoctor.get(doc.id) ?? [],
            blocks: blocksByDoctor.get(doc.id) ?? [],
            windowStartMin,
            windowEndMin,
            pxPerMinute,
            nowMin,
            isPastDate,
            warningsFor,
          })
          return (
            <DoctorColumn
              key={doc.id}
              doctor={doc}
              slots={slots}
              date={date}
              windowStartMin={windowStartMin}
              pxPerMinute={pxPerMinute}
              nowMin={nowMin}
              hold={hold?.doctorId === doc.id ? hold : null}
              isAdmin={isAdmin}
              compact={compact}
              onLaneClick={onLaneClick}
              onEmptyClick={onEmptyClick}
              onBlockClick={onBlockClick}
              onPastEmptyClick={() => {
                setPastHint(true)
                onPastEmptyClick?.(date)
              }}
              onDoctorSettings={onDoctorSettings}
            />
          )
        })}
      </div>
      {pastHint && (
        <div role="status" className="cal-past-hint">
          {isPastDate ? (
            <>
              <span>지난 날짜입니다</span>
              <button type="button" onClick={() => onPastEmptyClick?.(date)}>
                지난 날 방문 기록
              </button>
            </>
          ) : (
            <>
              <span>이미 지난 시간입니다</span>
              <button type="button">당일 방문 등록</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface DoctorColumnProps {
  doctor: GridDoctor
  slots: PositionedSlot[]
  date: string
  windowStartMin: number
  pxPerMinute: number
  nowMin: number | null
  hold: { startMin: number; endMin: number; taken?: boolean } | null
  isAdmin: boolean
  compact: boolean
  onLaneClick?: (doctorId: string, date: string) => void
  onEmptyClick?: (doctorId: string, startMin: number) => void
  onBlockClick?: (appointmentId: string) => void
  onPastEmptyClick?: () => void
  onDoctorSettings?: (doctorName: string) => void
}

function DoctorColumn({
  doctor,
  slots,
  date,
  windowStartMin,
  pxPerMinute,
  nowMin,
  hold,
  isAdmin,
  compact,
  onLaneClick,
  onEmptyClick,
  onBlockClick,
  onPastEmptyClick,
  onDoctorSettings,
}: DoctorColumnProps) {
  const columnHeight = slots.reduce((max, s) => Math.max(max, s.top + s.height), 0)
  // [CAL-WEEK-10] 좁은 레인(주간)에서는 시각을 찍지 않는다 — 칸 전체 클릭이 패널을 연다.
  const laneClick = compact && onLaneClick ? () => onLaneClick(doctor.id, date) : undefined

  return (
    <div
      className="cal-column"
      data-testid={`column-${doctor.id}`}
      style={{ flex: 1, minWidth: compact ? 19 : 120 }}
      onClick={laneClick}
      role={laneClick ? 'button' : undefined}
    >
      {/* [CAL-NAME-02] 열 머리 — 이름 · 진료과 · 진료시간. 좁으면(주간) 성 한 자만. */}
      <div className="cal-column-head" data-testid={`head-${doctor.id}`}>
        {compact ? (
          <span className="cal-lane-head">{doctor.name.slice(0, 1)}</span>
        ) : (
          <span className="cal-column-name">
            {doctor.name}
            {doctor.departmentName ? ` ${doctor.departmentName}` : ''} {doctor.slotMinutes}분
          </span>
        )}
        {isAdmin && !compact && (
          <button
            type="button"
            className="cal-column-gear"
            aria-label={`${doctor.name} 설정`}
            onClick={() => onDoctorSettings?.(doctor.name)}
          >
            <svg aria-hidden="true" width="14" height="14">
              <use href={`${iconSpriteUrl}#settings`} />
            </svg>
          </button>
        )}
      </div>

      <div className="cal-column-body" style={{ position: 'relative', height: columnHeight }}>
        {slots.map((slot) => {
          const desc = slot.descriptor
          const filled = desc.kind === 'booked' ? { ...desc, paletteIndex: doctor.paletteIndex } : desc
          const clickable = compact
            ? // 주간: 시각을 찍지 않는다 — 예약 블록만 상세로, 빈 곳은 레인 클릭이 받는다.
              desc.kind === 'booked' && slot.appointmentId
              ? () => onBlockClick?.(slot.appointmentId!)
              : undefined
            : desc.kind === 'empty' ? () => onEmptyClick?.(doctor.id, slot.startMin) :
              desc.kind === 'past-empty' ? onPastEmptyClick :
              desc.kind === 'booked' && slot.appointmentId ? () => onBlockClick?.(slot.appointmentId!) :
              undefined
          return (
            <div
              key={slot.key}
              className="cal-slot-pos"
              style={{ position: 'absolute', top: slot.top, height: slot.height, left: 0, right: 0 }}
              onClick={clickable}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              data-start={slot.startMin}
            >
              <SlotBlock block={filled} />
            </div>
          )
        })}
        {hold && (
          // [CAL-BOOK-04] 저장 전 자리표 — 내 화면에만 뜬다. 다른 예약이 들어오면 「방금 찼습니다」로 바뀐다.
          <div
            className={`cal-hold${hold.taken ? ' is-taken' : ''}`}
            data-testid="hold-slot"
            style={{
              position: 'absolute',
              top: (hold.startMin - windowStartMin) * pxPerMinute,
              height: (hold.endMin - hold.startMin) * pxPerMinute,
              left: 0,
              right: 0,
            }}
          >
            {hold.taken ? '⚠ 방금 찼습니다' : '이 자리'}
          </div>
        )}
        {nowMin != null && (
          <div
            className="cal-now-line"
            data-testid="now-line"
            style={{ position: 'absolute', top: (nowMin - windowStartMin) * pxPerMinute, left: 0, right: 0 }}
          />
        )}
      </div>
    </div>
  )
}
