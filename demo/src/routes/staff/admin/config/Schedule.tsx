import { useState } from 'react'
import { AlertTriangle } from '@/components/icons'
import { StaffPage, PageHead, EmptyState, btnPrimary, btnGhost } from '../../_ui'
import {
  scheduleDoctors,
  departments as initialDepts,
  scheduleExceptions,
  weekDays,
  type DoctorSchedule,
  type DaySchedule,
  type WeekDay,
  type Department,
} from './mockData'

// 진료 일정 관리 (/staff/admin/schedule) — SCHED-*.
// 왼쪽 세로줄 4: 전체 현황(읽는 곳)·진료과 관리·의사별 스케줄(고치는 곳)·특정 날짜 변경.
// 전체 현황 격자는 원본(규칙), 캘린더는 결과. data-testid="staff-schedule".

type Tab = 'overview' | 'departments' | 'weekly' | 'exceptions'
const NAV: { key: Tab; label: string; sub: string }[] = [
  { key: 'overview', label: '전체 현황', sub: '읽는 곳' },
  { key: 'departments', label: '진료과 관리', sub: '' },
  { key: 'weekly', label: '의사별 스케줄', sub: '고치는 곳' },
  { key: 'exceptions', label: '특정 날짜 변경', sub: '' },
]

export function Schedule() {
  const [tab, setTab] = useState<Tab>('overview')
  const [focusDoctor, setFocusDoctor] = useState<string>(scheduleDoctors[0].id)

  const subFor = (k: Tab) =>
    k === 'departments'
      ? `${initialDepts.filter((d) => d.active).length}과`
      : k === 'weekly'
      ? `의사 ${scheduleDoctors.length}명`
      : k === 'exceptions'
      ? `다음 휴무 9/5`
      : NAV.find((n) => n.key === k)!.sub

  return (
    <StaffPage max="max-w-6xl" testid="staff-schedule">
      <PageHead title="진료 일정 관리" sub="평상시 규칙을 정하는 곳입니다 · 실제 예약은 캘린더에서 봅니다" />

      <div className="flex gap-4">
        {/* 왼쪽 세로줄 */}
        <nav className="w-44 shrink-0 space-y-1">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setTab(n.key)}
              className={`w-full rounded-lg px-3 py-2 text-left ${tab === n.key ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
            >
              <div className="text-sm font-medium">{n.label}</div>
              <div className="text-[11px] text-muted-foreground">{subFor(n.key)}</div>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {tab === 'overview' && (
            <Overview onEdit={(id) => { setFocusDoctor(id); setTab('weekly') }} />
          )}
          {tab === 'departments' && <Departments />}
          {tab === 'weekly' && <Weekly focusDoctor={focusDoctor} setFocusDoctor={setFocusDoctor} />}
          {tab === 'exceptions' && <Exceptions />}
        </div>
      </div>
    </StaffPage>
  )
}

// ── 전체 현황 (읽기 전용 격자) ──
function Overview({ onEdit }: { onEdit: (doctorId: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-muted/40 text-[11px] font-medium text-muted-foreground">
            <th className="px-3 py-2 text-left">의사</th>
            {weekDays.map((d) => (
              <th key={d} className="px-3 py-2 text-center">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scheduleDoctors.map((doc) => (
            <tr key={doc.id} className="border-b border-border/60 last:border-b-0">
              <td className="px-3 py-2">
                <div className="font-medium">{doc.name}</div>
                <div className="text-[11px] text-muted-foreground">{doc.department}</div>
              </td>
              {weekDays.map((d) => {
                const day = doc.week[d]
                return (
                  <td key={d} className="px-1.5 py-1.5 text-center">
                    <button
                      onClick={() => onEdit(doc.id)}
                      className="w-full rounded-md px-1.5 py-1 hover:bg-muted"
                      title="눌러서 고치기"
                    >
                      {day.dayOff ? (
                        <span
                          className="block rounded py-1 text-[11px] text-muted-foreground"
                          style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(100,116,139,0.12) 0 5px, transparent 5px 10px)' }}
                        >
                          휴진
                        </span>
                      ) : (
                        <>
                          <div className="tabular-nums">{day.open.slice(0, 5)}–{day.close.slice(0, 5)}</div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">{day.slotMin}분 · {day.maxPatients}명</div>
                        </>
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 의사별 스케줄 (고치는 곳) ──
function Weekly({ focusDoctor, setFocusDoctor }: { focusDoctor: string; setFocusDoctor: (id: string) => void }) {
  const initial = scheduleDoctors.find((d) => d.id === focusDoctor) ?? scheduleDoctors[0]
  const [week, setWeek] = useState<Record<WeekDay, DaySchedule>>(() => ({ ...initial.week }))
  const [dirty, setDirty] = useState(false)
  const doc = scheduleDoctors.find((d) => d.id === focusDoctor) ?? scheduleDoctors[0]

  const switchDoctor = (d: DoctorSchedule) => {
    setFocusDoctor(d.id)
    setWeek({ ...d.week })
    setDirty(false)
  }
  const setDay = (day: WeekDay, up: Partial<DaySchedule>) => {
    setWeek((prev) => ({ ...prev, [day]: { ...prev[day], ...up } }))
    setDirty(true)
  }
  const copyMonday = () => {
    const mon = week['월']
    setWeek((prev) => {
      const next = { ...prev }
      for (const d of weekDays) if (!next[d].dayOff) next[d] = { ...mon, dayOff: next[d].dayOff }
      return next
    })
    setDirty(true)
  }

  return (
    <div>
      {/* 의사 가로줄 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {scheduleDoctors.map((d) => (
          <button
            key={d.id}
            onClick={() => switchDoctor(d)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${d.id === focusDoctor ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
          >
            {d.name} <span className="text-xs text-muted-foreground">{d.department}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-[11px] font-medium text-muted-foreground">
              <th className="px-3 py-2 text-left">요일</th>
              <th className="px-3 py-2 text-center">진료</th>
              <th className="px-3 py-2 text-left">진료 시간</th>
              <th className="px-3 py-2 text-center">한 칸</th>
              <th className="px-3 py-2 text-left">점심시간</th>
              <th className="px-3 py-2 text-center">최대 인원</th>
              <th className="px-3 py-2 text-center">예약 마감</th>
            </tr>
          </thead>
          <tbody>
            {weekDays.map((d) => {
              const day = week[d]
              const locked = day.dayOff
              return (
                <tr key={d} className="border-b border-border/60 last:border-b-0">
                  <td className="px-3 py-2 font-medium">{d}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setDay(d, { dayOff: !day.dayOff })}
                      className={`relative h-5 w-9 rounded-full transition-colors ${day.dayOff ? 'bg-muted' : 'bg-primary'}`}
                      aria-label="진료 여부"
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${day.dayOff ? 'left-0.5' : 'left-4'}`} />
                    </button>
                  </td>
                  {locked ? (
                    <td colSpan={5} className="px-3 py-2 text-muted-foreground">휴진 — 나머지 칸이 잠깁니다</td>
                  ) : (
                    <>
                      <td className="px-3 py-2 tabular-nums">
                        <input value={day.open.slice(0, 5)} onChange={(e) => setDay(d, { open: e.target.value })} className={cellCls} />
                        <span className="mx-1 text-muted-foreground">–</span>
                        <input value={day.close.slice(0, 5)} onChange={(e) => setDay(d, { close: e.target.value })} className={cellCls} />
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{day.slotMin}분</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{day.lunch ?? '—'}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{day.maxPatients}명</td>
                      <td className="px-3 py-2 text-center tabular-nums">{day.bookingDeadline}</td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button className={btnGhost} onClick={copyMonday}>월요일 값을 나머지에</button>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-700">저장되지 않은 변경</span>}
          <button className={`${btnPrimary} disabled:opacity-50`} disabled={!dirty} onClick={() => setDirty(false)}>
            {doc.name} 스케줄 저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 진료과 관리 ──
function Departments() {
  const [depts, setDepts] = useState<Department[]>(initialDepts)
  const [blocked, setBlocked] = useState<Department | null>(null)
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button className={btnPrimary}>진료과 추가</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        {depts.map((d) => (
          <div key={d.id} className={`flex items-center justify-between border-b border-border/60 px-4 py-3 last:border-b-0 ${!d.active ? 'bg-muted/30' : ''}`}>
            <div className="flex items-center gap-2">
              <span className={`font-medium ${!d.active ? 'text-muted-foreground' : ''}`}>{d.name}</span>
              <span className="text-xs text-muted-foreground">의사 {d.doctorCount}명</span>
              {!d.active && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">중지됨</span>}
            </div>
            <div className="flex items-center gap-1.5">
              {d.active ? (
                <>
                  <button className={`${btnGhost} px-2.5 py-1`}>이름 수정</button>
                  <button
                    className="rounded-lg border border-border bg-card px-2.5 py-1 text-sm font-medium text-muted-foreground hover:bg-muted"
                    onClick={() => (d.doctorCount > 0 ? setBlocked(d) : setDepts((prev) => prev.map((x) => (x.id === d.id ? { ...x, active: false } : x))))}
                  >
                    사용 중지
                  </button>
                </>
              ) : (
                <button className={btnGhost} onClick={() => setDepts((prev) => prev.map((x) => (x.id === d.id ? { ...x, active: true } : x)))}>다시 사용</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {blocked && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="flex items-center gap-1.5 text-base font-bold"><AlertTriangle className="h-5 w-5 text-amber-600" /> 사용 중지할 수 없습니다</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              이 진료과에 진료 중인 의사 {blocked.doctorCount}명이 있습니다. 진료과를 꺼도 그 의사에게는 예약이 계속 만들어집니다. 먼저 직원 관리에서 의사를 사용 중지하세요.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setBlocked(null)}>닫기</button>
              <button className={btnPrimary} onClick={() => setBlocked(null)}>직원 관리로 가기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 특정 날짜 변경 ──
function Exceptions() {
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button className={btnPrimary}>특정 날짜 변경 추가</button>
      </div>
      {scheduleExceptions.length === 0 ? (
        <EmptyState title="등록된 특정 날짜 변경이 없습니다" hint="공휴일·학회 등 이번 한 번뿐인 변경을 여기서 등록합니다." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {scheduleExceptions.map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-border/60 px-4 py-3 last:border-b-0">
              <div>
                <div className="font-medium tabular-nums">{e.date}</div>
                <div className="text-xs text-muted-foreground">{e.doctor} · {e.change}</div>
              </div>
              <button className={`${btnGhost} px-2.5 py-1`}>수정</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const cellCls = 'w-14 rounded border border-input bg-card px-1.5 py-1 text-center text-sm outline-none focus:border-ring'
