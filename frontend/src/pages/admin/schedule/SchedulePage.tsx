import { useMemo, useState, type CSSProperties } from 'react'
import { hospitalToday } from '../../../lib/clock'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { RequireRole } from '../../../auth/RequireRole'
import { ADMIN_ONLY } from '../../../auth/roles'
import { EmptyState } from '../../../components/EmptyState'
import { scheduleAdmin } from '../../../api/scheduleAdmin'
import { SideRail, type RailItem } from './SideRail'
import { OverviewGrid } from './OverviewGrid'
import { DoctorWeekTable, type WeekPreview } from './DoctorWeekTable'
import { DepartmentList } from './DepartmentList'
import { DateExceptionPanel } from './DateExceptionPanel'
import { HospitalHoursTable } from './HospitalHoursTable'
import { useDirtyMap } from './useDirtyMap'
import { hhmm, type HospitalHoursRow, type WeekRow } from './types'

// [SCHED-TAB-01] 왼쪽 세로줄 다섯 줄 + 오른쪽 내용. 첫 줄은 늘 「전체 현황」(SCHED-TAB-02, 마지막 줄 기억 안 함).
//   격자 칸을 누르면 「의사별 스케줄」로 옮겨가며 그 의사·그 요일이 골라진 채 열린다(SCHED-GRID-03).
// [SCHED-TAB-05] 관리자가 아니면 화면 자체가 보이지 않는다(RequireRole).

export function SchedulePage() {
  return (
    <RequireRole roles={ADMIN_ONLY}>
      <ScheduleInner />
    </RequireRole>
  )
}

function ScheduleInner() {
  const navigate = useNavigate()
  const [active, setActive] = useState<RailItem>('전체 현황') // 늘 전체 현황부터(SCHED-TAB-02)
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null)
  const [focusedWeekday, setFocusedWeekday] = useState<number | null>(null)
  const dirty = useDirtyMap()

  const overviewQ = useQuery({ queryKey: ['schedule-overview'], queryFn: scheduleAdmin.overview })
  const deptsQ = useQuery({ queryKey: ['departments', 'all'], queryFn: () => scheduleAdmin.departments(true) })
  const hoursQ = useQuery({ queryKey: ['hospital-hours'], queryFn: scheduleAdmin.getHours })
  const closuresQ = useQuery({ queryKey: ['hospital-closures'], queryFn: scheduleAdmin.listClosures })

  const overview = overviewQ.data ?? []
  const departments = deptsQ.data ?? []
  const hours = normaliseHours(hoursQ.data)
  const closures = closuresQ.data ?? []

  const doctors = overview.map((d) => ({ id: d.doctor_id, name: d.name, department: d.department }))
  const serverWeek = useMemo(
    () => Object.fromEntries(overview.map((d) => [d.doctor_id, d.days])),
    [overview],
  )
  const activeDoctorsByDept = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const dept of departments) {
      map[dept.id] = overview.filter((o) => o.department === dept.name).map((o) => o.name)
    }
    return map
  }, [departments, overview])

  const selected = selectedDoctorId ?? doctors[0]?.id ?? ''

  const subtitles = [
    '읽는 곳',
    `${departments.filter((d) => d.is_active).length}과`,
    `의사 ${doctors.length}명`,
    nextClosureLabel(closures),
    hoursSummary(hours),
  ]

  function goEdit(doctorId: string, weekday: number) {
    setSelectedDoctorId(doctorId)
    setFocusedWeekday(weekday)
    setActive('의사별 스케줄')
  }

  async function onPreview(doctorId: string, _rows: WeekRow[]): Promise<WeekPreview> {
    const dry = (await scheduleAdmin.regenerate(doctorId, true)) as Record<string, number>
    return {
      affected: [],
      slotRemoved: Number(dry.removed ?? 0),
      slotAdded: Number(dry.added ?? 0),
    }
  }
  async function onCommit(doctorId: string, rows: WeekRow[]): Promise<{ affected: number }> {
    await scheduleAdmin.saveWeek(doctorId, rows)
    return { affected: 0 }
  }

  return (
    <main style={styles.page} aria-labelledby="sched-title">
      <h1 id="sched-title" style={styles.title}>
        진료 일정 관리
      </h1>
      <div style={styles.body}>
        <SideRail
          active={active}
          onSelect={setActive}
          subtitles={subtitles}
          weeklyDirty={dirty.dirtyDoctors.length > 0}
        />
        <section style={styles.content} aria-label={active}>
          {active === '전체 현황' && (
            <OverviewGrid doctors={overview} onCellClick={goEdit} onGoToStaff={() => navigate('/admin/staff')} />
          )}
          {active === '진료과 관리' && (
            <DepartmentList
              departments={departments}
              activeDoctorsByDept={activeDoctorsByDept}
              onCreate={async (name) => {
                await scheduleAdmin.createDepartment(name)
                await deptsQ.refetch()
              }}
              onRename={async (id, name) => {
                await scheduleAdmin.renameDepartment(id, name)
                await deptsQ.refetch()
              }}
              onDeactivate={async (id) => {
                await scheduleAdmin.deactivateDepartment(id)
                await deptsQ.refetch()
              }}
              onReactivate={async (id) => {
                await scheduleAdmin.reactivateDepartment(id)
                await deptsQ.refetch()
              }}
              onGoToStaff={() => navigate('/admin/staff')}
            />
          )}
          {active === '의사별 스케줄' &&
            (doctors.length === 0 ? (
              <EmptyState kind="zero" message="아직 등록된 의사가 없습니다" action={<button type="button" onClick={() => navigate('/admin/staff')} style={styles.link}>의사 관리로 가기</button>} />
            ) : (
              <DoctorWeekTable
                doctors={doctors}
                selectedDoctorId={selected}
                onSelectDoctor={(id) => {
                  setSelectedDoctorId(id)
                  setFocusedWeekday(null)
                }}
                serverWeek={serverWeek}
                dirty={dirty}
                focusedWeekday={focusedWeekday}
                onPreview={onPreview}
                onCommit={onCommit}
              />
            ))}
          {active === '특정 날짜 변경' && (
            <DateExceptionPanel
              monthLabel={monthLabelNow()}
              calendarDays={[]}
              selectedDate={todayIso()}
              onSelectDate={() => {}}
              dayDoctors={[]}
              dayExceptions={[]}
              onSave={async () => ({ affected: 0 })}
              onRevert={async () => {}}
            />
          )}
          {active === '병원 운영시간' && (
            <HospitalHoursTable
              hours={hours}
              mismatch={null}
              onSave={async (rows) => {
                for (const r of rows) {
                  if (r.is_closed || !r.open_time || !r.close_time) continue
                  await scheduleAdmin.saveHours(r.weekday, {
                    open_time: r.open_time,
                    close_time: r.close_time,
                    lunch_start: r.lunch_start,
                    lunch_end: r.lunch_end,
                  })
                }
                return {}
              }}
              onRefetch={() => void hoursQ.refetch()}
              onGoToWeekly={(id) => {
                setSelectedDoctorId(id)
                setActive('의사별 스케줄')
              }}
            />
          )}
        </section>
      </div>
    </main>
  )
}

function normaliseHours(rows: HospitalHoursRow[] | undefined): HospitalHoursRow[] {
  if (rows && rows.length === 7) return rows
  const byDay = new Map((rows ?? []).map((r) => [r.weekday, r]))
  return Array.from({ length: 7 }, (_, w) =>
    byDay.get(w) ?? {
      weekday: w,
      is_closed: w === 6, // 기본: 일요일 휴무
      open_time: w === 6 ? null : '09:00:00',
      close_time: w === 6 ? null : '18:00:00',
      lunch_start: w === 6 ? null : '12:00:00',
      lunch_end: w === 6 ? null : '13:00:00',
    },
  )
}

function nextClosureLabel(closures: { closure_date: string }[]): string {
  if (closures.length === 0) return '등록된 휴무 없음'
  const sorted = [...closures].sort((a, b) => a.closure_date.localeCompare(b.closure_date))
  const [, m, d] = sorted[0].closure_date.split('-')
  return `다음 휴무 ${Number(m)}/${Number(d)}`
}

function hoursSummary(hours: HospitalHoursRow[]): string {
  const weekday = hours.find((h) => h.weekday === 0)
  const sunday = hours.find((h) => h.weekday === 6)
  const weekdayPart = weekday && !weekday.is_closed ? `평일 ${hhmm(weekday.open_time)}~${hhmm(weekday.close_time)}` : '평일 미설정'
  const sundayPart = sunday?.is_closed ? '일요일 휴무' : '일요일 진료'
  return `${weekdayPart} / ${sundayPart}`
}

/** [TIME-TZ-01] 오늘·이번 달은 **병원 시계**다 — `toISOString()`은 UTC라 한국 오전에
 *  전날로 적히고, `getMonth()`는 그 PC의 달이다. */
function todayIso(): string {
  return hospitalToday()
}
function monthLabelNow(): string {
  const [y, m] = hospitalToday().split('-').map(Number)
  return `${y}년 ${m}월`
}

const styles: Record<string, CSSProperties> = {
  page: { padding: 20, maxWidth: 1100, margin: '0 auto' },
  title: { margin: '0 0 16px', fontSize: 'var(--fs-xl)', color: 'var(--color-ink)' },
  body: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  content: { flex: 1, minWidth: 0 },
  link: { border: 'none', background: 'var(--color-primary)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' },
}
