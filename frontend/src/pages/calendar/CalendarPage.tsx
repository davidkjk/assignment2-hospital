import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { hospitalHHMM, hospitalToday } from '../../lib/clock'
import { getCalendar, getCalendarDoctors, type AppointmentDetailData, type CalendarData } from '../../api/calendar'
import { rescheduleAppointment } from '../../api/schedule'
import { usePanel } from '../../components/PanelHost'
import { EmptyState } from '../../components/EmptyState'
import { CalendarNav, formatRange, shiftAnchor, type CalendarMode } from './CalendarNav'
import { DoctorChips, type CalendarDoctor } from './DoctorChips'
import { DayGrid } from './DayGrid'
import { WeekGrid, weekDays } from './WeekGrid'
import { MiniCalendar } from './MiniCalendar'
import { AppointmentPanelLoader } from './AppointmentPanelLoader'
import { ReschedulePanel } from './ReschedulePanel'
import { useDoors } from '../../shell/doors/DoorContext'
import { buildGridModel, assignPalette, type GridDoctor } from './gridModel'
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

/** 예약 상세의 '진료과 / 의사' 한 줄 — 앞뒤 빈 슬래시를 다듬는다(로더의 doctorLabel과 같은 규칙). */
function apptDoctorLabel(d: AppointmentDetailData): string {
  return `${d.department_name ?? ''} / ${d.doctor_name ?? ''}`.replace(/^ \/ /, '').replace(/ \/ $/, '')
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
  // [L1][CAL-PANEL-02][CAL-RACE-03] 변경(reschedule) 모드 — 한 예약을 안고 왼쪽 격자에서 새 시각을 고른다.
  //   chosen=고른 새 시각(왼쪽 빈칸 클릭으로 채움), priorDoctorIds=변경 전 의사 필터(끝나면 복구).
  const [reschedule, setReschedule] = useState<{
    appointmentId: string
    patientLabel: string
    doctorId: string
    doctorLabel: string
    chosen: { date: string; time: string } | null
    priorDoctorIds: string[]
    actionError: string | null
  } | null>(null)
  const zoom = useZoom(staffKey)
  const panel = usePanel()
  const doors = useDoors()

  // [L4] 작은 달력은 바깥을 누르면 닫힌다 — 토글(.cal-nav-range)은 제외해 재클릭이 닫자마자 다시 여는 이중토글을 막는다.
  useEffect(() => {
    if (!miniOpen) return
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (t.closest('.cal-mini') || t.closest('.cal-nav-range')) return
      setMiniOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [miniOpen])

  const from = mode === 'week' ? startOfWeek(anchorDate) : ymd(anchorDate)
  const to = mode === 'week' ? weekDays(anchorDate)[5] : ymd(anchorDate)
  const doctorIdsKey = selectedDoctorIds.join(',')

  const query = useQuery({
    queryKey: ['calendar', from, to, doctorIdsKey],
    queryFn: () => getCalendar({ from, to, doctorIds: selectedDoctorIds.length ? selectedDoctorIds : null }),
  })
  const data = query.data

  const realtime = useCalendarRealtime(() => void query.refetch())

  // ⭐ 칩·색 팔레트·진료과 목록의 기준은 **필터와 무관한 전체 의사 카탈로그**다(L11) — 이걸 격자(필터됨)에서
  //    만들면 한 명 고르는 순간 나머지 칩이 사라져 다른 의사를 더 못 고르는 순환이 된다.
  const catalogQ = useQuery({ queryKey: ['calendar-doctors'], queryFn: getCalendarDoctors })
  const fullCatalog = catalogQ.data ?? []
  // 전체 카탈로그 순서로 고정한 색 지도 — 격자 열도 이 색을 쓰게 넘겨 필터에 따라 색이 흔들리지 않게 한다.
  const paletteMap = useMemo(() => assignPalette(fullCatalog), [fullCatalog])

  const dayDate = ymd(anchorDate)
  const model = useMemo(
    () => (data ? buildGridModel(data, dayDate, paletteMap) : null),
    [data, dayDate, paletteMap],
  )
  const gridDoctors: GridDoctor[] = model?.doctors ?? []
  const chipDoctors: CalendarDoctor[] = fullCatalog.map((d) => ({
    id: d.id,
    name: d.name,
    departmentId: d.department_name ?? '',
    departmentName: d.department_name ?? '',
    slotMinutes: d.slot_minutes ?? 0,
    paletteIndex: paletteMap.get(d.id) ?? 0,
  }))
  const departments = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of fullCatalog) if (d.department_name) seen.set(d.department_name, d.department_name)
    return Array.from(seen, ([id, name]) => ({ id, name }))
  }, [fullCatalog])

  // ── 패널 열기 ─────────────────────────────────────────────────────────────
  // [CAL-BOOK-01] 캘린더 빈칸에서 여는 예약 — 헤더 「예약」 문과 **같은 하나**를 쓴다(2026-08-31 통합,
  //   사용자 지시). 캘린더 전용 패널을 따로 두지 않는다: 의사·날짜(·시각)를 프리필하고 시각 칸을 켠
  //   채로 열어, 남은 건 환자뿐이고 시각은 왼쪽 일간 캘린더에서 다시 눌러 바꿀 수 있다(지적 1·2).
  function openBooking(doctorId: string, date: string, time: string) {
    const gd = gridDoctors.find((d) => d.id === doctorId)
    doors.openBookingAt(
      {
        id: doctorId,
        name: gd?.name ?? '',
        department: gd?.departmentName ?? '',
        slotMinutes: gd?.slotMinutes,
        paletteIndex: gd?.paletteIndex,
      },
      date,
      time || undefined,
    )
  }

  function openAppointment(appointmentId: string) {
    // ⛔ 오늘 격자의 막대에서 값을 찾지 않는다 — 상담 예약은 대개 미래 날짜라 격자에 없어 패널이
    //    텅 비었다(막다른 길). 로더가 예약 한 건을 뷰와 무관하게 직접 읽어 채운다.
    panel.openPanel({
      title: '예약 상세',
      origin: '/calendar',
      content: (
        <AppointmentPanelLoader
          appointmentId={appointmentId}
          onClose={() => panel.closePanel()}
          onDone={() => {
            panel.closePanel()
            void query.refetch()
          }}
          onReschedule={startReschedule}
        />
      ),
    })
  }

  // ── 예약 변경(reschedule) ──────────────────────────────────────────────────
  // [L1][CAL-PANEL-02][TODAY-RESCHED-05] [예약 변경]을 누르면 이 예약을 안고 변경 모드로 들어간다 —
  //   그 의사 열로 격자를 좁히고 날짜를 그 예약의 날로 맞춰, 왼쪽에서 새 빈칸을 고르게 한다.
  function startReschedule(d: AppointmentDetailData) {
    const date = d.start ? d.start.slice(0, 10) : hospitalToday(now)
    setMode('day')
    // ⚠️ new Date('YYYY-MM-DD')는 UTC 자정 파싱이라 창구 시간대만큼 하루가 밀린다 — Y/M/D를 로컬로 짜서
    //    격자가 그 예약의 날을 정확히 연다(hospitalTodayAsDate와 같은 규칙).
    const [y, m, dd] = date.split('-').map(Number)
    setAnchorDate(new Date(y, m - 1, dd))
    setSelectedDoctorIds((prior) => {
      setReschedule({
        appointmentId: d.appointment_id,
        patientLabel: d.patient.name ?? '환자',
        doctorId: d.doctor_id,
        doctorLabel: apptDoctorLabel(d),
        chosen: null,
        priorDoctorIds: prior,
        actionError: null,
      })
      return [d.doctor_id]
    })
  }

  function exitReschedule() {
    setReschedule((r) => {
      if (r) setSelectedDoctorIds(r.priorDoctorIds) // 변경 전 의사 필터로 되돌린다
      return null
    })
  }

  const reschedMut = useMutation({
    mutationFn: (v: { id: string; newStartAt: string; reason: string }) =>
      rescheduleAppointment(v.id, { new_start_at: v.newStartAt, reason: v.reason }),
    onSuccess: () => {
      exitReschedule()
      panel.closePanel()
      void query.refetch()
    },
    // [CAL-RACE-03·04][G1] 막다른 길 대신 이유 — 시각만 비우고 사유·패널은 지킨다(다시 할 일은 「빈칸 하나」).
    onError: () =>
      setReschedule((r) =>
        r ? { ...r, chosen: null, actionError: '방금 다른 직원이 이 자리를 잡았습니다. 왼쪽에서 다른 빈 시각을 골라 주세요.' } : r,
      ),
  })

  // 변경 모드가 켜지거나(chosen·오류가 바뀌면) 패널을 그 상태로 다시 그린다 — 사유는 ReschedulePanel 안에
  //   살아 있어(같은 자리 재조정) 다시 그려도 잃지 않는다. 왼쪽 빈칸 클릭으로 chosen이 바뀌면 여기서 반영된다.
  useEffect(() => {
    if (!reschedule) return
    const chosenLabel = reschedule.chosen ? `${reschedule.chosen.date} ${reschedule.chosen.time}` : null
    panel.openPanel({
      title: '예약 변경',
      origin: '/calendar',
      content: (
        <ReschedulePanel
          patientLabel={reschedule.patientLabel}
          doctorLabel={reschedule.doctorLabel}
          chosenTimeLabel={chosenLabel}
          actionError={reschedule.actionError}
          busy={reschedMut.isPending}
          onCancel={() => {
            exitReschedule()
            panel.closePanel()
          }}
          onSubmit={(reason) => {
            if (!reschedule.chosen) return
            reschedMut.mutate({
              id: reschedule.appointmentId,
              newStartAt: `${reschedule.chosen.date}T${reschedule.chosen.time}:00`,
              reason,
            })
          }}
        />
      ),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reschedule, reschedMut.isPending])

  // 변경 모드에서 패널을 ✕로 닫으면(=panel이 비면) 모드도 함께 끝낸다 — 안 그러면 위 effect가 다시 연다.
  useEffect(() => {
    if (reschedule && !panel.panel) exitReschedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.panel])

  /** 변경 모드에서 왼쪽 격자의 빈칸을 누르면 새 시각으로 채운다(그 의사 열만 받는다). */
  function pickRescheduleSlot(doctorId: string, date: string, time: string) {
    setReschedule((r) => (r && r.doctorId === doctorId ? { ...r, chosen: { date, time }, actionError: null } : r))
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
          palette={paletteMap}
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
            // 변경 모드면 빈칸이 새 예약 문이 아니라 그 예약의 새 시각으로 들어간다(CAL-PANEL-02).
            if (reschedule) pickRescheduleSlot(doctorId, dayDate, hhmm(startMin))
            else openBooking(doctorId, dayDate, hhmm(startMin))
          }}
          // 변경 모드에서는 다른 막대를 눌러 패널을 갈아엎지 않는다 — 지금 옮기는 예약에 집중한다.
          onBlockClick={reschedule ? undefined : openAppointment}
          onDoctorSettings={(name) => setSearchParams({ doctor: name })}
        />
      )}
    </div>
  )
}
