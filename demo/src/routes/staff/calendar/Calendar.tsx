import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  Search,
  MessageCircle,
} from '@/components/icons'
import { StaffPage, PageHead, StatusBadge, btnPrimary, btnGhost, btnLink } from '../_ui'
import { maskBirth } from '../mockData'
import {
  WIN_START,
  WIN_END,
  PX_PER_MIN_DEFAULT,
  PX_PER_MIN_MIN,
  PX_PER_MIN_MAX,
  calendarDoctors,
  calendarOffHours,
  calendarAppointments,
  patientSearchResults,
  type CalendarDoctor,
  type CalendarAppointment,
} from './mockData'

// 예약 캘린더 (/staff/calendar) — CAL-*, SUPPORT-CAL-*.
// 하루 종일(09–18) 시간표: 세로축=시각, 가로=의사 열. 칠해지지 않은 곳이 빈 시간(CAL-WEEK-03).
// 지금 선 + 현재 시각으로 자동 스크롤(CAL-PAST-05) · 시간축 드래그로 늘리기(CAL-ZOOM-*).
// data-testid="staff-calendar".

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const BASE = toMin(WIN_START)
const END = toMin(WIN_END)
const GUTTER = 56 // 시간축 너비(px)

interface Segment {
  kind: 'appt' | 'off' | 'gap'
  start: number
  end: number
  appt?: CalendarAppointment
  offKind?: '휴진' | '점심시간'
}

/** 한 의사의 하루를 위→아래 순서 조각으로: 예약·휴진/점심·빈 시간 */
function buildColumn(doc: CalendarDoctor): Segment[] {
  const busy: Segment[] = []
  calendarAppointments
    .filter((a) => a.doctorId === doc.id)
    .forEach((a) => busy.push({ kind: 'appt', start: toMin(a.start), end: toMin(a.end), appt: a }))
  calendarOffHours
    .filter((o) => o.doctorId === doc.id)
    .forEach((o) => busy.push({ kind: 'off', start: toMin(o.start), end: toMin(o.end), offKind: o.kind }))
  busy.sort((x, y) => x.start - y.start)

  const out: Segment[] = []
  let cursor = BASE
  for (const seg of busy) {
    if (seg.start > cursor) out.push({ kind: 'gap', start: cursor, end: seg.start })
    out.push(seg)
    cursor = Math.max(cursor, seg.end)
  }
  if (cursor < END) out.push({ kind: 'gap', start: cursor, end: END })
  return out
}

type Panel =
  | { mode: 'appt'; appt: CalendarAppointment }
  | { mode: 'book'; doctorId?: string; time?: number }
  | null

export function Calendar() {
  const departments = useMemo(() => Array.from(new Set(calendarDoctors.map((d) => d.department))), [])
  const [dept, setDept] = useState<string | null>(null)
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set(calendarDoctors.map((d) => d.id)))
  const [panel, setPanel] = useState<Panel>(null)
  const [confirmCancel, setConfirmCancel] = useState<CalendarAppointment | null>(null)
  const [pxPerMin, setPxPerMin] = useState(PX_PER_MIN_DEFAULT)

  // 현재 시각(오늘 기준) — 지금 선 · 자동 스크롤용. 창 밖이면 선을 숨긴다.
  const nowMin = useMemo(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  }, [])
  const nowInWindow = nowMin >= BASE && nowMin <= END

  const scrollRef = useRef<HTMLDivElement>(null)
  const height = (END - BASE) * pxPerMin
  const yOf = (t: number) => (t - BASE) * pxPerMin

  // 열 때 현재 시각이 보이게 아래로 내려간다 (사용자 요청) — 지금 선을 위에서 1/3 지점에.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = nowInWindow ? yOf(nowMin) - el.clientHeight / 3 : 0
    el.scrollTop = Math.max(0, target)
    // 최초 1회만 (배율 바꿀 때 튀지 않게)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleDocs = calendarDoctors.filter(
    (d) => (!dept || d.department === dept) && selectedDocs.has(d.id),
  )

  const toggleDoc = (id: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next.size === 0 ? new Set(calendarDoctors.map((d) => d.id)) : next
    })
  }
  const showAll = () => {
    setDept(null)
    setSelectedDocs(new Set(calendarDoctors.map((d) => d.id)))
  }

  // 시간축 드래그로 1시간 높이 조절 (CAL-ZOOM-01) — 아래로 끌면 넓어진다.
  const startZoomDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startPpm = pxPerMin
    const onMove = (ev: PointerEvent) => {
      const next = startPpm + (ev.clientY - startY) * 0.02
      setPxPerMin(Math.min(PX_PER_MIN_MAX, Math.max(PX_PER_MIN_MIN, next)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const bump = (dir: 1 | -1) =>
    setPxPerMin((p) => Math.min(PX_PER_MIN_MAX, Math.max(PX_PER_MIN_MIN, p + dir * 0.4)))

  return (
    <StaffPage max="max-w-full" testid="staff-calendar" footer={false}>
      <PageHead
        title="예약 캘린더"
        sub="시간표에서 빈 자리를 보고 전화로 예약을 잡습니다 · 칠해지지 않은 곳이 빈 시간입니다"
        action={
          <button className={btnPrimary} onClick={() => setPanel({ mode: 'book' })}>
            <CalendarPlus className="h-4 w-4" /> 전화 예약
          </button>
        }
      />

      {/* 날짜 이동 + 진료과/의사 필터 (CAL-DOC-01·04) */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <button className="rounded-md p-1.5 hover:bg-muted" aria-label="이전 날">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className={`${btnGhost} px-2.5 py-1`}>오늘</button>
          <button className="rounded-md p-1.5 hover:bg-muted" aria-label="다음 날">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-1 text-sm font-semibold tabular-nums">2026년 8월 22일 (금)</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={!dept && selectedDocs.size === calendarDoctors.length} onClick={showAll}>전체</Chip>
          <span className="mx-0.5 h-4 w-px bg-border" />
          {departments.map((d) => (
            <Chip key={d} active={dept === d} onClick={() => setDept(dept === d ? null : d)}>{d}</Chip>
          ))}
          <span className="mx-0.5 h-4 w-px bg-border" />
          {calendarDoctors
            .filter((d) => !dept || d.department === dept)
            .map((d) => (
              <Chip key={d.id} active={selectedDocs.has(d.id)} onClick={() => toggleDoc(d.id)}>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: d.ink }} />
                {d.name}
              </Chip>
            ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {/* 배율 조절 줄 (CAL-ZOOM-06 [기본 배율]) */}
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5 text-xs text-muted-foreground">
            <span>
              {nowInWindow ? <>지금 <b className="font-semibold text-rose-600 tabular-nums">{fmt(nowMin)}</b> 기준으로 열렸습니다</> : '오늘 진료 시간 밖입니다'}
            </span>
            <span className="flex items-center gap-1">
              <span className="mr-1 hidden sm:inline">시간축을 위아래로 끌면 넓어집니다</span>
              <button onClick={() => bump(-1)} className="rounded-md border border-border px-2 py-0.5 hover:bg-muted" aria-label="축소">−</button>
              <button onClick={() => setPxPerMin(PX_PER_MIN_DEFAULT)} className="rounded-md border border-border px-2 py-0.5 hover:bg-muted">기본 배율</button>
              <button onClick={() => bump(1)} className="rounded-md border border-border px-2 py-0.5 hover:bg-muted" aria-label="확대">+</button>
            </span>
          </div>

          {/* 스크롤 영역 (세로=시간, 가로=의사 많으면 스크롤) */}
          <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 15rem)' }}>
            <div className="min-w-max">
              {/* 열 머리 — 위에 고정 */}
              <div className="sticky top-0 z-20 flex bg-card">
                <div className="sticky left-0 z-30 border-b border-r border-border/70 bg-card" style={{ width: GUTTER }} />
                {visibleDocs.map((doc) => (
                  <div key={doc.id} className="w-48 shrink-0 border-b border-r border-border/70 px-3 py-1.5 last:border-r-0">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold">{doc.name}</span>
                      <span className="text-[11px] text-muted-foreground">{doc.department} · {doc.slotMinutes}분</span>
                    </div>
                    <div className="mt-1 h-0.5 rounded-full" style={{ background: doc.ink }} />
                  </div>
                ))}
              </div>

              {/* 본문 — 시간축 + 의사 열 + 지금 선 */}
              <div className="relative flex">
                <TimeGutter pxPerMin={pxPerMin} height={height} onZoomDrag={startZoomDrag} />
                {visibleDocs.map((doc) => (
                  <DoctorColumn
                    key={doc.id}
                    doc={doc}
                    pxPerMin={pxPerMin}
                    height={height}
                    onAppt={(a) => setPanel({ mode: 'appt', appt: a })}
                    onGap={(t) => setPanel({ mode: 'book', doctorId: doc.id, time: t })}
                    activeId={panel?.mode === 'appt' ? panel.appt.id : undefined}
                  />
                ))}

                {/* 지금 선 (CAL-PAST-05) — 열 위에 가로선 */}
                {nowInWindow && (
                  <div className="pointer-events-none absolute z-10" style={{ top: yOf(nowMin), left: GUTTER, right: 0 }}>
                    <div className="relative h-px bg-rose-500">
                      <span className="absolute -top-2 -left-[52px] rounded bg-rose-500 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white">{fmt(nowMin)}</span>
                      <span className="absolute -top-1 left-0 h-2 w-2 -translate-x-1/2 rounded-full bg-rose-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {panel?.mode === 'appt' && (
          <ApptPanel appt={panel.appt} onClose={() => setPanel(null)} onCancel={() => setConfirmCancel(panel.appt)} />
        )}
        {panel?.mode === 'book' && (
          <BookPanel doctorId={panel.doctorId} time={panel.time} onClose={() => setPanel(null)} />
        )}
      </div>

      {confirmCancel && (
        <CancelConfirm appt={confirmCancel} onClose={() => setConfirmCancel(null)} onDone={() => { setConfirmCancel(null); setPanel(null) }} />
      )}
    </StaffPage>
  )
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}

function TimeGutter({ pxPerMin, height, onZoomDrag }: { pxPerMin: number; height: number; onZoomDrag: (e: React.PointerEvent) => void }) {
  const labels: number[] = []
  for (let t = BASE; t <= END; t += 30) labels.push(t)
  return (
    <div
      className="sticky left-0 z-[5] shrink-0 cursor-ns-resize border-r border-border/70 bg-card"
      style={{ width: GUTTER, height }}
      onPointerDown={onZoomDrag}
      title="위아래로 끌어 시간축을 넓히거나 좁힙니다"
    >
      <div className="relative" style={{ height }}>
        {labels.map((t) => (
          <div key={t} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" style={{ top: (t - BASE) * pxPerMin }}>
            {fmt(t)}
          </div>
        ))}
      </div>
    </div>
  )
}

function DoctorColumn({
  doc,
  pxPerMin,
  height,
  onAppt,
  onGap,
  activeId,
}: {
  doc: CalendarDoctor
  pxPerMin: number
  height: number
  onAppt: (a: CalendarAppointment) => void
  onGap: (t: number) => void
  activeId?: string
}) {
  const segments = useMemo(() => buildColumn(doc), [doc])
  const gridLines: number[] = []
  for (let t = BASE; t <= END; t += 30) gridLines.push(t)
  const y = (t: number) => (t - BASE) * pxPerMin

  return (
    <div className="w-48 shrink-0 border-r border-border/70 last:border-r-0">
      <div className="relative bg-muted/20" style={{ height }}>
        {gridLines.map((t) => (
          <div key={t} className="pointer-events-none absolute left-0 right-0 border-t border-border/40" style={{ top: y(t) }} />
        ))}

        {segments.map((seg, i) => {
          const h = (seg.end - seg.start) * pxPerMin
          const style = { top: y(seg.start), height: h - 1 }

          if (seg.kind === 'gap') {
            return (
              <button
                key={i}
                onClick={() => onGap(seg.start)}
                title={`빈 시간 ${fmt(seg.start)}–${fmt(seg.end)} · 눌러서 예약`}
                className="group absolute left-1 right-1 flex items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground/70 hover:border-primary/60 hover:bg-primary/5 hover:text-primary"
                style={style}
              >
                {h >= 22 && <span className="tabular-nums">빈 시간 {fmt(seg.start)}–{fmt(seg.end)}</span>}
              </button>
            )
          }

          if (seg.kind === 'off') {
            return (
              <div
                key={i}
                className="absolute left-1 right-1 flex items-start rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground"
                style={{ ...style, backgroundImage: 'repeating-linear-gradient(45deg, rgba(100,116,139,0.10) 0 6px, transparent 6px 12px)' }}
              >
                {h >= 20 && <span className="tabular-nums">{seg.offKind} {fmt(seg.start)}–{fmt(seg.end)}</span>}
              </div>
            )
          }

          const a = seg.appt!
          const active = a.id === activeId
          return (
            <button
              key={i}
              onClick={() => onAppt(a)}
              title={`${a.patientName} · ${a.start}–${a.end} · ${a.status}`}
              className={`absolute left-1 right-1 flex items-center gap-1 overflow-hidden rounded-md px-1.5 py-0.5 text-left transition-shadow ${
                active ? 'ring-2 ring-primary ring-offset-1' : 'hover:brightness-[0.97]'
              }`}
              style={{ ...style, background: doc.fill, color: doc.ink, boxShadow: '0 1px 0 #fff' }}
            >
              {/* 한 줄로 — 좁은 높이에서도 글자가 안 잘리게 (사용자 지적) */}
              <span className="truncate text-[11px] font-semibold leading-none">{a.patientName}</span>
              <span className="shrink-0 truncate text-[10px] leading-none opacity-70">
                {a.status === '예약신청' ? '신청' : a.status}
              </span>
              {a.support && (
                <span className="ml-auto shrink-0 text-amber-600" title={`${a.support.type} · 확인 필요`}>
                  <AlertTriangle className="h-3 w-3" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside className="w-80 shrink-0 self-start rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기">
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}

function ApptPanel({ appt, onClose, onCancel }: { appt: CalendarAppointment; onClose: () => void; onCancel: () => void }) {
  const doc = calendarDoctors.find((d) => d.id === appt.doctorId)!
  return (
    <PanelShell title="예약 상세" onClose={onClose}>
      <Field label="환자">
        <span className="font-medium">{appt.patientName}</span>{' '}
        <span className="text-muted-foreground tabular-nums">{maskBirth(appt.patientBirth)}</span>
      </Field>
      <Field label="진료">{doc.department} / {doc.name}</Field>
      <Field label="시각"><span className="tabular-nums">{appt.start}–{appt.end}</span></Field>
      <Field label="상태"><StatusBadge status={appt.status} /></Field>
      <Field label="예약 이유">{appt.reason}</Field>

      {appt.support && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> 직원 확인 중 · {appt.support.type}
          </div>
          <p className="mt-1 text-xs text-amber-900/80">{appt.support.context}</p>
          <button className={`${btnLink} mt-1.5 inline-flex items-center gap-1`}>
            <MessageCircle className="h-3.5 w-3.5" /> 상담 채팅 열기
          </button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button className={`${btnGhost} flex-1 justify-center`}>예약 변경</button>
        <button className={`${btnGhost} flex-1 justify-center`} onClick={onCancel}>예약 취소</button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">예약 변경은 격자에서 새 빈 시간을 눌러 고릅니다. 취소는 확인창에서 한 번 더 묻습니다.</p>
    </PanelShell>
  )
}

function BookPanel({ doctorId, time, onClose }: { doctorId?: string; time?: number; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<{ name: string; birth: string; phone: string } | null>(null)
  const doc = calendarDoctors.find((d) => d.id === doctorId)
  const results = query.trim()
    ? patientSearchResults.filter((p) => p.name.includes(query.trim()) || p.phone.includes(query.trim()))
    : []

  return (
    <PanelShell title="전화 예약" onClose={onClose}>
      <Field label="환자 찾기">
        {picked ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
            <span>
              <span className="font-medium">{picked.name}</span>{' '}
              <span className="text-xs text-muted-foreground tabular-nums">{maskBirth(picked.birth)}</span>
            </span>
            <button className={btnLink} onClick={() => setPicked(null)}>바꾸기</button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 · 생년월일 · 전화번호"
              className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
            {results.length > 0 && (
              <ul className="mt-1.5 overflow-hidden rounded-lg border border-border">
                {results.map((p) => (
                  <li key={p.id}>
                    <button className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setPicked(p)}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{maskBirth(p.birth)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Field>

      <Field label="담당 의사">{doc ? `${doc.department} / ${doc.name}` : '격자에서 의사 열을 고르세요'}</Field>
      <Field label="날짜">2026년 8월 22일 (금)</Field>
      <Field label="시간">
        {time != null ? <span className="tabular-nums">{fmt(time)}부터</span> : <span className="text-muted-foreground">격자의 빈 곳을 눌러 시간을 고르세요</span>}
      </Field>
      <Field label="예약 이유">
        <input placeholder="전화로 들은 증상을 적습니다" className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
      </Field>

      <button className={`${btnPrimary} mt-2 w-full justify-center disabled:opacity-50`} disabled={!picked || time == null}>예약 저장</button>
      <p className="mt-2 text-[11px] text-muted-foreground">저장 전에 환자·의사·시각을 한 번 더 확인합니다.</p>
    </PanelShell>
  )
}

function CancelConfirm({ appt, onClose, onDone }: { appt: CalendarAppointment; onClose: () => void; onDone: () => void }) {
  const [ack, setAck] = useState(false)
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h3 className="text-base font-bold">예약을 취소할까요?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{appt.patientName}</span> 님의{' '}
          <span className="tabular-nums">{appt.start}–{appt.end}</span> 예약입니다. 취소하면 되돌릴 수 없고, 환자에게 취소 안내가 나갑니다.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
          <span>위 내용을 확인했습니다.</span>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose}>돌아가기</button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-40"
            disabled={!ack}
            onClick={onDone}
          >
            예약 취소
          </button>
        </div>
      </div>
    </div>
  )
}
