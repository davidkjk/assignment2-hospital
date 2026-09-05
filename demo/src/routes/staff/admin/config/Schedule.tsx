import { useState } from 'react'
import { AlertTriangle, Pencil, X, Check, CalendarPlus } from '@/components/icons'
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
  type ScheduleException,
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
      <PageHead title="진료 일정 관리" />

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
// 진료과별 색점 + 요일별 총 정원 합계로 "한눈에 보는 현황"을 만든다.
const DEPT_DOT: Record<string, string> = {
  '내과': '#1360A6', '정형외과': '#0B6C4E', '이비인후과': '#196584', '가정의학과': '#6D4F9B',
}
function Overview({ onEdit }: { onEdit: (doctorId: string) => void }) {
  return (
    <div>
      {/* 범례 */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="tabular-nums">09:00–18:00</span> 진료 시간
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="tabular-nums">15분 · 14명</span> 한 칸 길이 · 하루 정원
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="block h-3 w-6 rounded" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(100,116,139,0.16) 0 4px, transparent 4px 8px)' }} /> 휴진
        </span>
        <span className="text-muted-foreground/70">칸을 누르면 그 의사 스케줄로 이동합니다</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-sm font-medium text-muted-foreground">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left">의사</th>
              {weekDays.map((d) => (
                <th key={d} className={`px-3 py-2 text-center ${d === '일' ? 'text-rose-500' : d === '토' ? 'text-sky-600' : ''}`}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scheduleDoctors.map((doc) => (
              <tr key={doc.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/20">
                <td className="sticky left-0 z-10 bg-card px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DEPT_DOT[doc.department] ?? '#94a3b8' }} />
                    <span className="font-medium">{doc.name}</span>
                  </div>
                  <div className="pl-3.5 text-[11px] text-muted-foreground">{doc.department}</div>
                </td>
                {weekDays.map((d) => {
                  const day = doc.week[d]
                  return (
                    <td key={d} className="px-1.5 py-1.5 text-center">
                      <button
                        onClick={() => onEdit(doc.id)}
                        className="w-full rounded-md px-1.5 py-1 hover:bg-primary/10"
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
                            <div className="text-[11px] text-muted-foreground tabular-nums">{day.slotMin}분 · {day.maxPatients}명</div>
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
            <tr className="border-b border-border/70 bg-muted/40 text-sm font-medium text-muted-foreground">
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
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<Department | null>(null)

  const addDept = (name: string) => {
    setDepts((prev) => [...prev, { id: `dep-${Date.now()}`, name, doctorCount: 0, active: true }])
    setAdding(false)
  }
  const renameDept = (id: string, name: string) => {
    setDepts((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)))
    setRenaming(null)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">진료과를 지우는 대신 <b className="font-medium text-foreground">사용 중지</b>합니다. 지난 예약·문진이 진료과 이름을 그대로 씁니다.</p>
        <button className={btnPrimary} onClick={() => setAdding(true)}>진료과 추가</button>
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
                  <button className={`${btnGhost} inline-flex items-center gap-1 px-2.5 py-1`} onClick={() => setRenaming(d)}>
                    <Pencil className="h-3.5 w-3.5" /> 이름 수정
                  </button>
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

      {adding && (
        <NameDialog
          title="진료과 추가"
          label="진료과 이름"
          placeholder="예: 소아청소년과"
          confirmText="추가"
          onConfirm={addDept}
          onClose={() => setAdding(false)}
        />
      )}
      {renaming && (
        <NameDialog
          title="진료과 이름 수정"
          label="진료과 이름"
          initial={renaming.name}
          confirmText="저장"
          note="지난 예약에도 바뀐 이름으로 보입니다."
          onConfirm={(name) => renameDept(renaming.id, name)}
          onClose={() => setRenaming(null)}
        />
      )}

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

// 이름 한 칸만 받는 공용 다이얼로그 (진료과 추가·이름 수정)
function NameDialog({
  title, label, placeholder, initial = '', confirmText, note, onConfirm, onClose,
}: {
  title: string; label: string; placeholder?: string; initial?: string; confirmText: string; note?: string
  onConfirm: (value: string) => void; onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기"><X className="h-4 w-4" /></button>
        </div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
        {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose}>취소</button>
          <button className={btnPrimary} disabled={!value.trim()} onClick={() => onConfirm(value.trim())}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}

// ── 특정 날짜 변경 ──
type ExcDraft = { date: string; who: string; scope: 'day' | 'time'; from: string; to: string; note: string }

function Exceptions() {
  const [rows, setRows] = useState<ScheduleException[]>(scheduleExceptions)
  const [editing, setEditing] = useState<ScheduleException | 'new' | null>(null)

  const upsert = (draft: ExcDraft, id?: string) => {
    const change =
      (draft.scope === 'day' ? '종일 휴진' : `진료 시간 ${draft.from}–${draft.to}`) +
      (draft.note ? ` (${draft.note})` : '')
    if (id) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, date: draft.date, doctor: draft.who, change } : r)))
    } else {
      setRows((prev) => [
        { id: `e-${Date.now()}`, date: draft.date, doctor: draft.who, change, affected: 0 },
        ...prev,
      ])
    }
    setEditing(null)
  }
  const remove = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
    setEditing(null)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">공휴일·학회 등 <b className="font-medium text-foreground">이번 한 번뿐</b>인 변경을 등록합니다. 매주 반복되는 휴진은 의사별 스케줄에서 정합니다.</p>
        <button className={`${btnPrimary} inline-flex items-center gap-1.5`} onClick={() => setEditing('new')}>
          <CalendarPlus className="h-4 w-4" /> 특정 날짜 변경 추가
        </button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="등록된 특정 날짜 변경이 없습니다" hint="공휴일·학회 등 이번 한 번뿐인 변경을 여기서 등록합니다." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {rows.map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-border/60 px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{e.date}</span>
                  {e.doctor === '전체'
                    ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">병원 전체</span>
                    : <span className="text-xs text-muted-foreground">{e.doctor}</span>}
                </div>
                <div className="text-xs text-muted-foreground">{e.change}{e.affected > 0 && <span className="ml-1 text-amber-700">· 예약 {e.affected}건 영향</span>}</div>
              </div>
              <button className={`${btnGhost} inline-flex items-center gap-1 px-2.5 py-1`} onClick={() => setEditing(e)}>
                <Pencil className="h-3.5 w-3.5" /> 수정
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ExceptionDialog
          row={editing === 'new' ? null : editing}
          onSave={(draft) => upsert(draft, editing === 'new' ? undefined : editing.id)}
          onRemove={editing === 'new' ? undefined : () => remove(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ExceptionDialog({
  row, onSave, onRemove, onClose,
}: {
  row: ScheduleException | null
  onSave: (draft: ExcDraft) => void
  onRemove?: () => void
  onClose: () => void
}) {
  const editingTime = row?.change.startsWith('진료 시간')
  const [date, setDate] = useState(row?.date.replace(/\s*\([^)]*\)/, '') ?? '')
  const [who, setWho] = useState(row?.doctor ?? '전체')
  const [scope, setScope] = useState<'day' | 'time'>(editingTime ? 'time' : 'day')
  const [from, setFrom] = useState('09:00')
  const [to, setTo] = useState('13:00')
  const [note, setNote] = useState('')

  const canSave = date.trim().length > 0

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">{row ? '특정 날짜 변경 수정' : '특정 날짜 변경 추가'}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">누가 쉬나</label>
            <select value={who} onChange={(e) => setWho(e.target.value)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40">
              <option value="전체">병원 전체</option>
              {scheduleDoctors.map((d) => <option key={d.id} value={d.name}>{d.name} · {d.department}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">무엇을 바꾸나</label>
            <div className="flex gap-2">
              {(['day', 'time'] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${scope === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  {s === 'day' ? '종일 휴진' : '진료 시간 변경'}
                </button>
              ))}
            </div>
            {scope === 'time' && (
              <div className="mt-2 flex items-center gap-2 tabular-nums">
                <input type="time" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring" />
                <span className="text-muted-foreground">–</span>
                <input type="time" value={to} onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring" />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">메모 (선택)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 추석 연휴 · 학회 참석"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {onRemove
            ? <button className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline" onClick={onRemove}>되돌리기 (이 줄 삭제)</button>
            : <span />}
          <div className="flex gap-2">
            <button className={btnGhost} onClick={onClose}>취소</button>
            <button className={`${btnPrimary} inline-flex items-center gap-1.5`} disabled={!canSave}
              onClick={() => onSave({ date: withDow(date), who, scope, from, to, note })}>
              <Check className="h-4 w-4" /> 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']
function withDow(isoOrLabel: string): string {
  // "2026-09-05" → "2026-09-05 (금)"; 이미 라벨이면 그대로
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoOrLabel.trim())
  if (!m) return isoOrLabel
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${isoOrLabel.trim()} (${DOW[d.getDay()]})`
}

const cellCls = 'w-14 rounded border border-input bg-card px-1.5 py-1 text-center text-sm outline-none focus:border-ring'
