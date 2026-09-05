import { useEffect, useRef, useState } from 'react'
import { hospitalMinutesOfDay, hospitalToday } from '../../lib/clock'
import iconSpriteUrl from '../../shell/icons.svg?url'
import { SlotBlock, type SlotDescriptor, type SlotWarning } from './SlotBlock'
import { TimeAxis } from './TimeAxis'
import { buildDayColumn, type PositionedSlot } from './layout'

// [CAL-TIME-01] 「HH:MM」 — TimeAxis와 같은 규칙(공용 헬퍼가 없어 각자 둔다).
function hhmm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
import type { GridAppointment, GridBlock, GridDoctor } from './gridModel'

// [CAL-VIEW-05] 일간·주간이 같은 부품이다 — 주간은 이 열을 폭만 좁혀 하루 칸 안에 여럿 놓는다(WeekGrid).
//   세로축은 오직 시각(CAL-VIEW-01) · 블록 위·아래 끝이 시작·종료 시각이다.

/** 그 날의 상태 — 오늘이면 현재 분, 어제 이전이면 지난 날짜.
 *  ⭐ 「오늘」도 「지금」도 **병원 시계**다(`TIME-TZ-01`) — 창구 PC 시계로 재면 지금 선이
 *     엉뚱한 높이에 그려지고, 어느 날이 「지난 날짜」인지도 하루 어긋난다.
 *  ⚠️ 날짜 비교는 문자열로 한다(ISO는 사전순 = 시간순) — Date 자정을 만들면 로컬 자정과
 *     병원 자정이 갈려 같은 병이 되돌아온다. */
function dayTense(date: string, now: Date): { nowMin: number | null; isPastDate: boolean } {
  const today = hospitalToday(now)
  if (date === today) return { nowMin: hospitalMinutesOfDay(now), isPastDate: false }
  return { nowMin: null, isPastDate: date < today }
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

  // [CAL-PAST-05] 열 때 지금 선이 보이게 아래로 내려간다 — 지금을 위에서 1/3 지점에.
  //   ⭐ 일간 단독일 때만(주간은 바깥 cal-week-grid가 스크롤 컨테이너라 각 날은 스크롤하지 않는다).
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (compact || hideAxis) return
    const el = scrollRef.current
    if (!el || nowMin == null) return
    // 레이아웃이 끝난 다음 프레임에 스크롤한다 — 마운트 직후엔 clientHeight가 아직 0이라 안 내려간다.
    const id = requestAnimationFrame(() => {
      el.scrollTop = Math.max(0, (nowMin - windowStartMin) * pxPerMinute - el.clientHeight / 3)
    })
    return () => cancelAnimationFrame(id)
    // 최초 1회만 — 배율을 바꿀 때 스크롤이 튀지 않게 의존성을 비운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function warningsFor(appointmentId: string): SlotWarning[] | undefined {
    const w: SlotWarning[] = []
    if (affectedIds?.has(appointmentId)) w.push('affected')
    if (overlapIds?.has(appointmentId)) w.push('overlap')
    if (supportIds?.has(appointmentId)) w.push('support')
    return w.length ? w : undefined
  }

  return (
    <div className="cal-day-grid" data-testid="day-grid" data-scroll="horizontal" ref={scrollRef}>
      {!hideAxis && (
        <TimeAxis
          startHour={startHour}
          endHour={endHour}
          hourHeight={hourHeight}
          onDragBy={onAxisDragBy ?? (() => {})}
          nowMin={nowMin}
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
          // [CAL-TIME-03] 빈 시간(넓은 뷰)은 호버로 5분 스냅 미리보기를 보여주고, 그 스냅 시각으로 연다.
          //   주간(compact)은 시각을 찍지 않으므로(CAL-WEEK-10) 아래 일반 경로를 탄다.
          if (desc.kind === 'empty' && !compact && onEmptyClick) {
            return (
              <EmptySlot
                key={slot.key}
                slot={slot}
                block={filled}
                pxPerMinute={pxPerMinute}
                onPick={(startMin) => onEmptyClick(doctor.id, startMin)}
              />
            )
          }
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
              <SlotBlock block={filled} compact={compact} />
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

/** [CAL-TIME-03] 빈 시간 블록 — 호버하면 커서 높이를 5분 격자에 붙여 파란 시각을 미리 보여주고,
 *  누르면 그 스냅 시각으로 전화예약을 연다(구간 시작 고정이 아니라 5분 단위 어디든). */
function EmptySlot({
  slot,
  block,
  pxPerMinute,
  onPick,
}: {
  slot: PositionedSlot
  block: SlotDescriptor
  pxPerMinute: number
  onPick: (startMin: number) => void
}) {
  const [hoverMin, setHoverMin] = useState<number | null>(null)
  const spanMin = Math.round(slot.height / pxPerMinute)
  const maxStart = slot.startMin + Math.max(0, spanMin - 5)
  // 데모와 같은 셈(CAL-TIME-03): 구간 시작 + 커서의 구간 내 offset → 5분 반올림 → [시작, 끝−5]로 clamp.
  const snap = (clientY: number, rectTop: number) => {
    const raw = slot.startMin + (clientY - rectTop) / pxPerMinute
    const snapped = Math.round(raw / 5) * 5
    return Math.max(slot.startMin, Math.min(maxStart, snapped))
  }
  return (
    <div
      className="cal-slot-pos"
      data-hovering={hoverMin != null ? '1' : undefined}
      data-start={slot.startMin}
      role="button"
      tabIndex={0}
      style={{ position: 'absolute', top: slot.top, height: slot.height, left: 0, right: 0 }}
      onMouseMove={(e) => setHoverMin(snap(e.clientY, e.currentTarget.getBoundingClientRect().top))}
      onMouseLeave={() => setHoverMin(null)}
      onClick={(e) => onPick(snap(e.clientY, e.currentTarget.getBoundingClientRect().top))}
    >
      <SlotBlock block={block} />
      {hoverMin != null && (
        <span
          className="cal-empty-hover"
          data-testid="empty-hover"
          style={{ top: (hoverMin - slot.startMin) * pxPerMinute }}
        >
          <span className="cal-empty-hover-time">{hhmm(hoverMin)}</span>
          <span className="cal-empty-hover-line" />
        </span>
      )}
    </div>
  )
}
