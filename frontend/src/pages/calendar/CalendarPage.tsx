import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { hospitalHHMM, hospitalToday } from '../../lib/clock'
import { getCalendar, type CalendarData } from '../../api/calendar'
import { usePanel } from '../../components/PanelHost'
import { EmptyState } from '../../components/EmptyState'
import { CalendarNav, formatRange, shiftAnchor, type CalendarMode } from './CalendarNav'
import { DoctorChips, type CalendarDoctor } from './DoctorChips'
import { DayGrid } from './DayGrid'
import { WeekGrid, weekDays } from './WeekGrid'
import { MiniCalendar } from './MiniCalendar'
import { PhoneBookingPanel } from './PhoneBookingPanel'
import { AppointmentPanelLoader } from './AppointmentPanelLoader'
import { buildGridModel, type GridDoctor } from './gridModel'
import { useCalendarRealtime } from './useCalendarRealtime'
import { useZoom } from './useZoom'

// [CAL-*] 예약 캘린더 그릇 — 무엇을(일간/주간)·누구를(의사 필터)·언제를(기간) 보나.
//   ⭐ 이 화면을 여는 이유는 「언제 되나요?」에 답하기 위해서다 — 필요한 건 목록이 아니라 빈 자리의 모양이다.

const MS_PER_DAY = 86_400_000

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`  // clock-ok — anchorDate(병원 오늘로 만든 로컬 Date)를 ISO로 되돌린다. 만든 쪽과 읽는 쪽이 같은 시간대다.
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
      d = {
        appointments: [], blocks: [],
        affected_appointment_ids: data.affected_appointment_ids,
        doctors: data.doctors,
        // 날짜별로 쪼개도 예약 가능 경계는 하루치가 아니라 응답 전체의 것이다(CAL-BOOK-13).
        booking_horizon_date: data.booking_horizon_date,
      }
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

/** 병원의 오늘을 그 날 자정의 Date로 — 격자 좌표 계산이 Date를 쓰기 때문이다.
 *  ⚠️ 「며칠인가」는 병원 시계로 정하고, 만들어진 Date는 좌표용일 뿐이다. */
function hospitalTodayAsDate(at: Date): Date {
  const [y, m, d] = hospitalToday(at).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function CalendarPage({ staffKey = 'staff', isAdmin = false, now = new Date() }: CalendarPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<CalendarMode>('day')
  // [TIME-TZ-01] 캘린더가 처음 여는 날은 **병원의 오늘**이다 — 창구 PC 시계가 아니다.
  const [anchorDate, setAnchorDate] = useState<Date>(() => hospitalTodayAsDate(now))
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
    // ⛔ 오늘 격자의 막대에서 값을 찾지 않는다 — 상담 예약은 대개 미래 날짜라 격자에 없어 패널이
    //    텅 비었다(막다른 길). 로더가 예약 한 건을 뷰와 무관하게 직접 읽어 채운다.
    panel.openPanel({
      title: '예약 상세',
      origin: '/calendar',
      content: <AppointmentPanelLoader appointmentId={appointmentId} onClose={() => panel.closePanel()} />,
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
    setAnchorDate(hospitalTodayAsDate(now))
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

        {/* [CAL-ZOOM-01·02·06] 시간축을 끌어 넓히는 것과 같은 일을 버튼으로도 — 끌기가 익숙지 않은 손을 위해. */}
        <div className="cal-zoom">
          <span className="cal-zoom-hint">시간축을 위아래로 끌면 넓어집니다</span>
          <button type="button" className="cal-zoom-step" aria-label="축소" onClick={() => zoom.dragBy(-24)}>
            −
          </button>
          <button type="button" className="cal-zoom-reset" onClick={zoom.reset}>
            기본 배율
          </button>
          <button type="button" className="cal-zoom-step" aria-label="확대" onClick={() => zoom.dragBy(24)}>
            +
          </button>
        </div>
      </div>

      {miniOpen && (
        <MiniCalendar
          mode={mode}
          anchorDate={anchorDate}
          today={hospitalToday(now)}
          horizonDate={data?.booking_horizon_date}
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
          이 화면은 {hospitalHHMM(realtime.staleSince)} 기준입니다
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
            // startMin은 이미 병원 시각의 「분」이고 DayGrid가 5분 격자에 붙여 준다(CAL-TIME-03).
            // ⛔ new Date(`${date}T${hhmm}`)로 감쌌다 hospitalHHMM으로 되돌리면 창구 PC 시간대(KST가
            //    아닐 수 있다)만큼 시각이 밀린다 — 오후를 눌러도 오전이 들어갔다. 분을 그대로 쓴다.
            openBooking(doctorId, dayDate, hhmm(startMin))
          }}
          onBlockClick={openAppointment}
          onDoctorSettings={(name) => setSearchParams({ doctor: name })}
        />
      )}
    </div>
  )
}
