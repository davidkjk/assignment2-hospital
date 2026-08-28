import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { getCalendar, type CalendarData } from '../../api/calendar'
import { usePanel } from '../../components/PanelHost'
import { EmptyState } from '../../components/EmptyState'
import { CalendarNav, formatRange, shiftAnchor, type CalendarMode } from './CalendarNav'
import { DoctorChips, type CalendarDoctor } from './DoctorChips'
import { DayGrid } from './DayGrid'
import { WeekGrid, weekDays } from './WeekGrid'
import { MiniCalendar } from './MiniCalendar'
import { PhoneBookingPanel } from './PhoneBookingPanel'
import { AppointmentPanel } from './AppointmentPanel'
import { buildGridModel, type GridDoctor } from './gridModel'
import { snapTo5min } from './snap'
import { useCalendarRealtime } from './useCalendarRealtime'
import { useZoom } from './useZoom'

// [CAL-*] 예약 캘린더 그릇 — 무엇을(일간/주간)·누구를(의사 필터)·언제를(기간) 보나.
//   ⭐ 이 화면을 여는 이유는 「언제 되나요?」에 답하기 위해서다 — 필요한 건 목록이 아니라 빈 자리의 모양이다.

const MS_PER_DAY = 86_400_000

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

function startOfWeek(anchor: Date): string {
  return weekDays(anchor)[0]
}

/** 주간 범위 응답을 날짜별로 쪼갠다 — WeekGrid는 하루씩 DayGrid로 그린다(같은 부품). */
function splitByDate(data: CalendarData): Map<string, CalendarData> {
  const map = new Map<string, CalendarData>()
  const ensure = (date: string): CalendarData => {
    let d = map.get(date)
    if (!d) {
      d = { appointments: [], blocks: [], affected_appointment_ids: data.affected_appointment_ids, doctors: data.doctors }
      map.set(date, d)
    }
    return d
  }
  for (const a of data.appointments) ensure(a.start.slice(0, 10)).appointments.push(a)
  for (const b of data.blocks) ensure(String(b.date).slice(0, 10)).blocks.push(b)
  return map
}

export interface CalendarPageProps {
  staffKey?: string
  isAdmin?: boolean
  now?: Date
}

export function CalendarPage({ staffKey = 'staff', isAdmin = false, now = new Date() }: CalendarPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<CalendarMode>('day')
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null)
  const [miniOpen, setMiniOpen] = useState(false)
  const zoom = useZoom(staffKey)
  const panel = usePanel()

  const from = mode === 'week' ? startOfWeek(anchorDate) : ymd(anchorDate)
  const to = mode === 'week' ? weekDays(anchorDate)[5] : ymd(anchorDate)
  const doctorIdsKey = selectedDoctorIds.join(',')

  const query = useQuery({
    queryKey: ['calendar', from, to, doctorIdsKey],
    queryFn: () => getCalendar({ from, to, doctorIds: selectedDoctorIds.length ? selectedDoctorIds : null }),
  })
  const data = query.data

  const realtime = useCalendarRealtime(() => void query.refetch())

  // 카탈로그 → 격자 열 의사 + 진료과.
  const dayDate = ymd(anchorDate)
  const model = useMemo(() => (data ? buildGridModel(data, dayDate) : null), [data, dayDate])
  const gridDoctors: GridDoctor[] = model?.doctors ?? []
  const chipDoctors: CalendarDoctor[] = gridDoctors.map((d) => ({
    id: d.id,
    name: d.name,
    departmentId: d.departmentName ?? '',
    departmentName: d.departmentName ?? '',
    slotMinutes: d.slotMinutes,
    paletteIndex: d.paletteIndex,
  }))
  const departments = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of gridDoctors) if (d.departmentName) seen.set(d.departmentName, d.departmentName)
    return Array.from(seen, ([id, name]) => ({ id, name }))
  }, [gridDoctors])

  // ── 패널 열기 ─────────────────────────────────────────────────────────────
  function openBooking(doctorId: string, date: string, time: string) {
    panel.openPanel({
      title: '전화 예약',
      origin: '/calendar',
      content: (
        <PhoneBookingPanel
          doctors={gridDoctors}
          initial={{ doctorId, date, time }}
          onSaved={() => {
            panel.closePanel()
            void query.refetch()
          }}
          onPickTimeOnCalendar={() => {
            setMode('day')
            setAnchorDate(new Date(date))
          }}
        />
      ),
    })
  }

  function openAppointment(appointmentId: string) {
    const bar = data?.appointments.find((a) => a.appointment_id === appointmentId)
    const doc = gridDoctors.find((d) => d.id === bar?.doctor_id)
    panel.openPanel({
      title: '예약 상세',
      origin: '/calendar',
      content: (
        <AppointmentPanel
          appointment={{
            appointmentId,
            patientLabel: bar?.name ?? '환자',
            statusLabel: bar?.status ?? '',
            doctorLabel: doc ? `${doc.departmentName ?? ''} / ${doc.name}`.replace(/^ \/ /, '') : '',
            timeLabel: bar ? `${bar.start.slice(0, 10)} ${bar.start.slice(11, 16)}` : '',
          }}
          onClose={() => panel.closePanel()}
        />
      ),
    })
  }

  // [NAV-QUEUE-07][NAV-TODAY-06][CAL-PANEL-06] 밖에서 ?appointment=&panel=open으로 들어오면 패널이 열린 채로.
  const deepLinkAppointment = searchParams.get('appointment')
  useEffect(() => {
    if (deepLinkAppointment && data) openAppointment(deepLinkAppointment)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkAppointment, data])

  // ── 네비게이션 ────────────────────────────────────────────────────────────
  function goToday() {
    setAnchorDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  }
  function openDay(date: string) {
    setMode('day')
    setAnchorDate(new Date(date))
  }

  return (
    <div className="cal-page">
      <div className="cal-toolbar">
        {/* [CAL-VIEW] 무엇을 보나 — 일간·주간 토글. 주간으로 바꿔도 의사를 자동으로 좁히지 않는다(CAL-VIEW-08). */}
        <div className="cal-view-toggle" role="group" aria-label="보기">
          <button type="button" aria-pressed={mode === 'day'} onClick={() => setMode('day')}>
            일간
          </button>
          <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>
            주간
          </button>
        </div>

        <CalendarNav
          mode={mode}
          anchorDate={anchorDate}
          onPrev={() => setAnchorDate((a) => shiftAnchor(mode, a, -1))}
          onNext={() => setAnchorDate((a) => shiftAnchor(mode, a, 1))}
          onToday={goToday}
          onOpenCalendar={() => setMiniOpen((o) => !o)}
        />

        <button type="button" className="cal-zoom-reset" onClick={zoom.reset}>
          기본 배율
        </button>
      </div>

      {miniOpen && (
        <MiniCalendar
          mode={mode}
          anchorDate={anchorDate}
          onPick={(date) => {
            setAnchorDate(new Date(date))
            setMiniOpen(false)
          }}
        />
      )}

      <DoctorChips
        doctors={chipDoctors}
        departments={departments}
        selectedDoctorIds={selectedDoctorIds}
        selectedDepartmentId={selectedDepartmentId}
        onToggleDoctor={(id) =>
          setSelectedDoctorIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
        }
        onSelectAll={() => setSelectedDoctorIds([])}
        onSelectDepartment={setSelectedDepartmentId}
      />

      {/* [CAL-LIVE-03] 연결이 끊기면 격자 위에 주의색 배너와 기준 시각. */}
      {realtime.staleSince && (
        <div role="status" className="cal-stale-banner">
          이 화면은 {hhmm(realtime.staleSince.getHours() * 60 + realtime.staleSince.getMinutes())} 기준입니다
        </div>
      )}

      {query.isError ? (
        <EmptyState kind="error" screen="캘린더" onRetry={() => void query.refetch()} />
      ) : !data || !model ? (
        <p className="cal-loading">불러오는 중…</p>
      ) : mode === 'week' ? (
        <WeekGrid
          anchorDate={anchorDate}
          doctors={gridDoctors}
          dataByDate={splitByDate(data)}
          hourHeight={zoom.hourHeight}
          now={now}
          onOpenDay={openDay}
          onLaneClick={(doctorId, date) => openBooking(doctorId, date, '')}
          onBlockClick={openAppointment}
        />
      ) : (
        <DayGrid
          date={dayDate}
          doctors={gridDoctors}
          appointmentsByDoctor={model.appointmentsByDoctor}
          blocksByDoctor={model.blocksByDoctor}
          affectedIds={new Set(data.affected_appointment_ids)}
          hourHeight={zoom.hourHeight}
          now={now}
          isAdmin={isAdmin}
          onAxisDragBy={zoom.dragBy}
          onEmptyClick={(doctorId, startMin) => {
            const snapped = snapTo5min(new Date(`${dayDate}T${hhmm(startMin)}:00`))
            openBooking(doctorId, dayDate, hhmm(snapped.getHours() * 60 + snapped.getMinutes()))
          }}
          onBlockClick={openAppointment}
          onDoctorSettings={(name) => setSearchParams({ doctor: name })}
        />
      )}
    </div>
  )
}
