import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  AlertTriangle,
  X,
  Search,
  MessageCircle,
} from '@/components/icons'
import { StatusBadge, btnPrimary, btnGhost, btnLink } from '../_ui'
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
function buildColumn(doc: CalendarDoctor, appts: CalendarAppointment[]): Segment[] {
  const busy: Segment[] = []
  appts
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

// 오늘의 현황에서 [예약·상담 보기]/[예약 옮기기]로 넘어올 때 오른쪽에 여는 읽기용 컨텍스트 패널.
type CtxPanel = { kind: 'support' | 'reschedule'; name: string; dept: string; doctor: string; time: string; reason: string }

// 날짜 이동 — 오늘 기준. 데이터엔 날짜가 없으므로 오늘만 정본, 다른 날은 재현용 부분집합.
// 앱 전역 기준: 2026-08-22 = 금(요일 인덱스 5). 타임존에 흔들리지 않게 UTC로 날짜를 세고 요일은 산술로.
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const TODAY_DOW = 5 // 금
function dowOf(offset: number) {
  return ((TODAY_DOW + (offset % 7)) + 7) % 7
}
function dateLabel(offset: number) {
  const d = new Date(Date.UTC(2026, 7, 22) + offset * 86400000)
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DOW[dowOf(offset)]})`
}
const BOOK_AHEAD_DAYS = 56 // 8주
function dayNumOf(offset: number) {
  return new Date(Date.UTC(2026, 7, 22) + offset * 86400000).getUTCDate()
}
function monthNumOf(offset: number) {
  return new Date(Date.UTC(2026, 7, 22) + offset * 86400000).getUTCMonth() + 1
}

/** 날짜 선택 달력 — 오늘부터 8주 앞까지 (요구사항: 최대 8주 예약)
    팝오버는 fixed로 띄운다 — StaffShell 본문이 overflow-y-auto라 absolute면 아래쪽 주가 잘린다(anchor 기준 배치). */
function DatePicker({ selected, onPick, onClose, anchor }: { selected: number; onPick: (o: number) => void; onClose: () => void; anchor: DOMRect | null }) {
  const start = -dowOf(0) // 오늘이 든 주의 일요일
  const cells: number[] = []
  for (let k = 0; k < 63; k++) cells.push(start + k) // 9주 격자
  const pos = anchor ? { top: anchor.bottom + 4, left: anchor.left } : { top: 0, left: 0 }
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 w-64 rounded-xl border border-border bg-card p-3 shadow-xl" style={pos}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">날짜 선택</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{monthNumOf(0)}월 – {monthNumOf(BOOK_AHEAD_DAYS)}월 · 8주</span>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-muted-foreground">
          {DOW.map((d, i) => (
            <div key={d} className={i === 0 ? 'text-rose-500' : i === 6 ? 'text-sky-600' : ''}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-0.5">
          {cells.map((o) => {
            const inRange = o >= 0 && o <= BOOK_AHEAD_DAYS
            const today = o === 0
            const sel = o === selected
            return (
              <button
                key={o}
                disabled={!inRange}
                onClick={() => onPick(o)}
                className={`h-8 rounded-md text-xs tabular-nums transition-colors ${
                  !inRange ? 'text-muted-foreground/25' : sel ? 'bg-primary font-semibold text-primary-foreground' : today ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted'
                }`}
              >
                {dayNumOf(o)}
              </button>
            )
          })}
        </div>
        <button className="mt-2 w-full rounded-md border border-border py-1 text-xs font-medium text-muted-foreground hover:bg-muted" onClick={() => onPick(0)}>오늘로</button>
      </div>
    </>
  )
}
function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff
  return h
}
/** 그 날의 예약 — 오늘은 정본 전체, 다른 날은 요일 기반 부분집합(도착·상담 표시는 오늘만) */
function apptsForOffset(offset: number): CalendarAppointment[] {
  if (offset === 0) return calendarAppointments
  const dow = dowOf(offset)
  if (dow === 0) return [] // 일요일 병원 휴무
  const density = dow === 6 ? 35 : 60 // 토요일은 한산
  return calendarAppointments
    .filter((a) => hashStr(a.id + ':' + offset) % 100 < density)
    .map((a) => ({
      ...a,
      status: a.status === '도착' ? '예약확정' : a.status,
      support: undefined,
    }))
}

export function Calendar() {
  const departments = useMemo(() => Array.from(new Set(calendarDoctors.map((d) => d.department))), [])
  const [dept, setDept] = useState<string | null>(null)
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set(calendarDoctors.map((d) => d.id)))
  const [panel, setPanel] = useState<Panel>(null)
  const [confirmCancel, setConfirmCancel] = useState<CalendarAppointment | null>(null)
  const [pxPerMin, setPxPerMin] = useState(PX_PER_MIN_DEFAULT)
  const [dayOffset, setDayOffset] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerRect, setPickerRect] = useState<DOMRect | null>(null)
  const dateBtnRef = useRef<HTMLButtonElement>(null)
  const togglePicker = () => {
    if (!pickerOpen) setPickerRect(dateBtnRef.current?.getBoundingClientRect() ?? null)
    setPickerOpen((v) => !v)
  }
  const navigate = useNavigate()
  const location = useLocation()
  const [ctx, setCtx] = useState<CtxPanel | null>(() => (location.state as { panel?: CtxPanel } | null)?.panel ?? null)
  // 컨텍스트로 넘어오면 그 의사 열만 보이게 한다(캘린더 맥락). 명단에 없으면 전체 그대로.
  useEffect(() => {
    if (!ctx) return
    const d = calendarDoctors.find((x) => x.name === ctx.doctor)
    if (d) {
      setDept(d.department)
      setSelectedDocs(new Set([d.id]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const isToday = dayOffset === 0
  const dayAppts = useMemo(() => apptsForOffset(dayOffset), [dayOffset])

  // 현재 시각(오늘 기준) — 지금 선 · 자동 스크롤용. 오늘이고 창 안일 때만.
  const nowMin = useMemo(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  }, [])
  const nowInWindow = isToday && nowMin >= BASE && nowMin <= END

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
    // main(스크롤 컨테이너)을 flex로 꽉 채워 카드가 창 높이에 맞게 늘고, 잘리지 않게 한다
    // (예약 진입은 빈칸 클릭 CAL-SLOT-06 · 헤더 [＋ 예약] 문 F-4 — 화면 자체 [전화 예약] 버튼은 두지 않는다 F-2)
    <div data-testid="staff-calendar" className="flex h-full min-h-0 flex-col px-6 py-5">
      {/* 날짜 이동 + 진료과/의사 필터 (CAL-DOC-01·04·CAL-NAV) */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        {/* 꺽쇠는 날짜 양쪽, 오늘 버튼은 왼쪽. 배지는 두지 않아(폭이 변하면 뒤 칩들이 밀린다) */}
        <div className="relative flex items-center gap-1">
          <button
            className={`${btnGhost} px-2.5 py-1 disabled:opacity-40`}
            disabled={isToday}
            onClick={() => { setDayOffset(0); setPanel(null) }}
          >
            오늘
          </button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button className="rounded-md p-1.5 hover:bg-muted" aria-label="이전 날" onClick={() => { setDayOffset((o) => o - 1); setPanel(null) }}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          {/* 날짜를 누르면 달력이 열려 8주 앞까지 고른다 · 폭 고정으로 뒤 칩이 안 밀림 */}
          <button
            ref={dateBtnRef}
            className="inline-flex w-[196px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm font-semibold tabular-nums hover:bg-muted"
            onClick={togglePicker}
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {dateLabel(dayOffset)}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button className="rounded-md p-1.5 hover:bg-muted" aria-label="다음 날" onClick={() => { setDayOffset((o) => o + 1); setPanel(null) }}>
            <ChevronRight className="h-4 w-4" />
          </button>
          {pickerOpen && (
            <DatePicker
              selected={dayOffset}
              anchor={pickerRect}
              onPick={(o) => { setDayOffset(o); setPanel(null); setPickerOpen(false) }}
              onClose={() => setPickerOpen(false)}
            />
          )}
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

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {/* 배율 조절 줄 (CAL-ZOOM-06 [기본 배율]) */}
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5 text-xs text-muted-foreground">
            <span>
              {isToday
                ? (nowInWindow ? <>지금 <b className="font-semibold text-rose-600 tabular-nums">{fmt(nowMin)}</b> 기준으로 열렸습니다</> : '오늘 진료 시간 밖입니다')
                : <>예약 {dayAppts.length}건</>}
            </span>
            <span className="flex items-center gap-1">
              <span className="mr-1 hidden sm:inline">시간축을 위아래로 끌면 넓어집니다</span>
              <button onClick={() => bump(-1)} className="rounded-md border border-border px-2 py-0.5 hover:bg-muted" aria-label="축소">−</button>
              <button onClick={() => setPxPerMin(PX_PER_MIN_DEFAULT)} className="rounded-md border border-border px-2 py-0.5 hover:bg-muted">기본 배율</button>
              <button onClick={() => bump(1)} className="rounded-md border border-border px-2 py-0.5 hover:bg-muted" aria-label="확대">+</button>
            </span>
          </div>

          {/* 스크롤 영역 (세로=시간, 가로=의사 많으면 스크롤) — 카드가 창 높이를 채우게 flex-1 */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
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
                    appts={dayAppts}
                    pxPerMin={pxPerMin}
                    height={height}
                    onAppt={(a) => { setPanel({ mode: 'appt', appt: a }); setCtx(null) }}
                    onGap={(t) => { setPanel({ mode: 'book', doctorId: doc.id, time: t }); setCtx(null) }}
                    activeId={panel?.mode === 'appt' ? panel.appt.id : undefined}
                  />
                ))}

                {/* 지금 선 (CAL-PAST-05) — 열 위에 가로선 */}
                {nowInWindow && (
                  <div className="pointer-events-none absolute z-10" style={{ top: yOf(nowMin), left: GUTTER, right: 0 }}>
                    <div className="relative h-px bg-rose-500">
                      <span className="absolute -top-2 -left-[52px] rounded bg-rose-500 px-1 py-0.5 text-[11px] font-medium tabular-nums text-white">{fmt(nowMin)}</span>
                      <span className="absolute -top-1 left-0 h-2 w-2 -translate-x-1/2 rounded-full bg-rose-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {ctx && !panel && (
          <TodayContextPanel ctx={ctx} onClose={() => setCtx(null)} onOpenTicket={() => navigate('/staff/tickets')} />
        )}
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
    </div>
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
        {labels.map((t, i) => {
          // 첫 라벨(09:00)은 위로 당기면 열 머리글에 가려진다 → 상단 정렬. 나머지는 눈금 중앙.
          const first = i === 0
          return (
            <div
              key={t}
              className={`absolute right-2 text-[11px] tabular-nums text-muted-foreground ${first ? '' : '-translate-y-1/2'}`}
              style={{ top: (t - BASE) * pxPerMin + (first ? 1 : 0) }}
            >
              {fmt(t)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DoctorColumn({
  doc,
  appts,
  pxPerMin,
  height,
  onAppt,
  onGap,
  activeId,
}: {
  doc: CalendarDoctor
  appts: CalendarAppointment[]
  pxPerMin: number
  height: number
  onAppt: (a: CalendarAppointment) => void
  onGap: (t: number) => void
  activeId?: string
}) {
  const segments = useMemo(() => buildColumn(doc, appts), [doc, appts])
  const gridLines: number[] = []
  for (let t = BASE; t <= END; t += 30) gridLines.push(t)
  const y = (t: number) => (t - BASE) * pxPerMin

  // 빈 시간 안에서 누른 지점을 5분 격자에 붙인다 (CAL-TIME-03)
  const [hover, setHover] = useState<{ gap: number; min: number } | null>(null)
  const snapInGap = (e: React.PointerEvent | React.MouseEvent, seg: Segment) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const raw = seg.start + (e.clientY - rect.top) / pxPerMin
    const snapped = Math.round(raw / 5) * 5
    return Math.max(seg.start, Math.min(Math.max(seg.start, seg.end - 5), snapped))
  }

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
            const showHover = hover?.gap === i
            return (
              <button
                key={i}
                onPointerMove={(e) => setHover({ gap: i, min: snapInGap(e, seg) })}
                onPointerLeave={() => setHover((prev) => (prev?.gap === i ? null : prev))}
                onClick={(e) => onGap(snapInGap(e, seg))}
                title={`빈 시간 ${fmt(seg.start)}–${fmt(seg.end)} · 눌러서 5분 단위로 예약`}
                className="absolute left-1 right-1 overflow-hidden rounded-md border border-dashed border-border text-[11px] text-muted-foreground/70 hover:border-primary/60 hover:bg-primary/5"
                style={style}
              >
                {h >= 22 && !showHover && (
                  <span className="flex h-full items-center justify-center tabular-nums">빈 시간 {fmt(seg.start)}–{fmt(seg.end)}</span>
                )}
                {showHover && (
                  <span className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 items-center gap-1 px-1" style={{ top: (hover.min - seg.start) * pxPerMin }}>
                    <span className="rounded bg-primary px-1 py-0.5 text-[11px] font-medium text-primary-foreground tabular-nums">{fmt(hover.min)}</span>
                    <span className="h-px flex-1 bg-primary/70" />
                  </span>
                )}
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
        <button onClick={onClose} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" /> 닫기
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

// 오늘의 현황 → [예약·상담 보기] / [예약 옮기기]로 넘어왔을 때의 읽기용 패널.
// 상담: 캘린더 맥락 옆에 상담 요약만(대화 전체는 문의함). 옮기기: 옮길 예약 + 빈칸 클릭 안내.
function TodayContextPanel({
  ctx,
  onClose,
  onOpenTicket,
}: {
  ctx: CtxPanel
  onClose: () => void
  onOpenTicket: () => void
}) {
  const supportType = ctx.reason.split('·')[0].trim() // '취소 상담' / '변경 상담'
  const isCancel = supportType.includes('취소')

  if (ctx.kind === 'support') {
    return (
      <PanelShell title="예약 · 상담" onClose={onClose}>
        <Field label="환자"><span className="font-medium">{ctx.name}</span></Field>
        <Field label="예약"><span className="tabular-nums">{ctx.time}</span> · {ctx.dept} · {ctx.doctor}</Field>
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> {supportType}
          </div>
          <dl className="mt-2 space-y-1.5 text-xs">
            <div><dt className="text-amber-900/60">연결</dt><dd className="mt-0.5 text-amber-900">오늘 09:12</dd></div>
            <div><dt className="text-amber-900/60">담당</dt><dd className="mt-0.5 text-amber-900">직원 확인 중</dd></div>
            <div>
              <dt className="text-amber-900/60">요약 (읽기 전용)</dt>
              <dd className="mt-0.5 text-amber-900">
                {isCancel ? '마감 후 취소 문의가 들어와 직원 확인이 필요합니다.' : '예약 시간 변경을 요청해 직원 확인이 필요합니다.'}
              </dd>
            </div>
          </dl>
        </div>
        <p className="text-[11px] text-muted-foreground">대화 전체와 답장은 문의함에서 봅니다. 이 패널은 읽기 전용입니다.</p>
        <button className={`${btnPrimary} mt-3 w-full justify-center`} onClick={onOpenTicket}>
          <MessageCircle className="h-4 w-4" /> 상담 전체 보기
        </button>
      </PanelShell>
    )
  }

  return (
    <PanelShell title="예약 옮기기" onClose={onClose}>
      <Field label="옮길 예약"><span className="font-medium">{ctx.name}</span></Field>
      <Field label="현재"><span className="tabular-nums">{ctx.time}</span> · {ctx.dept} · {ctx.doctor}</Field>
      <Field label="사유">{ctx.reason}</Field>
      <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-2.5 text-xs leading-relaxed text-foreground/80">
        격자에서 <b>{ctx.doctor}</b> 열의 <b>빈 시간</b>을 눌러 새 시각으로 옮기세요. 옮기면 환자에게 변경 안내가 나갑니다.
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">옮기지 않고 취소하거나 그대로 둘 수도 있습니다(오늘의 현황에서).</p>
    </PanelShell>
  )
}

function BookPanel({ doctorId, time, onClose }: { doctorId?: string; time?: number; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<{ name: string; birth: string; phone: string } | null>(null)
  const doc = calendarDoctors.find((d) => d.id === doctorId)
  const q = query.trim()
  const qDigits = q.replace(/\D/g, '')
  const results = q
    ? patientSearchResults.filter(
        (p) =>
          p.name.includes(q) ||
          p.birth.includes(q) ||
          (qDigits.length > 0 && p.phone.replace(/\D/g, '').includes(qDigits)),
      )
    : []

  return (
    <PanelShell title="새 예약" onClose={onClose}>
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
          <div>
            {/* 아이콘은 입력칸만 감싸는 relative 안에 둔다(결과 목록까지 감싸면 아이콘이 아래로 밀린다) */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 · 생년월일 · 전화번호"
                className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
              />
            </div>
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
