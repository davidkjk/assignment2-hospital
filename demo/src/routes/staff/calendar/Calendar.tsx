import { useMemo, useState } from 'react'
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
  PX_PER_MIN,
  calendarDoctors,
  calendarOffHours,
  calendarAppointments,
  patientSearchResults,
  type CalendarDoctor,
  type CalendarAppointment,
} from './mockData'

// 예약 캘린더 (/staff/calendar) — CAL-*, SUPPORT-CAL-*.
// 하루 보기: 세로축=시각, 가로=의사 열 (CAL-VIEW-01·03). 격자가 아니라 시간표 —
// 블록 위·아래 끝이 시작·종료 시각, 길이에 비례 (CAL-TIME-02).
// ⭐ 이 화면의 주인공 = "빈 자리의 모양": 칠해지지 않은 곳이 곧 빈 시간(CAL-WEEK-03),
//    이어진 빈 구간을 점선 블록 한 덩어리로 "빈 시간 09:40–10:00"처럼 적는다(CAL-SLOT-01).
// data-testid="staff-calendar".

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const fmt = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
const BASE = toMin(WIN_START)
const END = toMin(WIN_END)
const HEIGHT = (END - BASE) * PX_PER_MIN
const top = (t: number) => (t - BASE) * PX_PER_MIN

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

  // 빈 구간 채우기 (CAL-SLOT-01: 이어진 빈 곳은 한 덩어리)
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

  return (
    <StaffPage max="max-w-full" testid="staff-calendar">
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
          <Chip active={!dept && selectedDocs.size === calendarDoctors.length} onClick={showAll}>
            전체
          </Chip>
          <span className="mx-0.5 h-4 w-px bg-border" />
          {departments.map((d) => (
            <Chip key={d} active={dept === d} onClick={() => setDept(dept === d ? null : d)}>
              {d}
            </Chip>
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

      {/* 격자 + 사이드패널 — 패널이 열리면 격자를 밀어서 좁힌다 (CAL-PANEL-02, ⛔덮지 않음) */}
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <div className="flex min-w-max">
            {/* 시간축 눈금 */}
            <TimeGutter />
            {visibleDocs.map((doc) => (
              <DoctorColumn
                key={doc.id}
                doc={doc}
                onAppt={(a) => setPanel({ mode: 'appt', appt: a })}
                onGap={(t) => setPanel({ mode: 'book', doctorId: doc.id, time: t })}
                activeId={panel?.mode === 'appt' ? panel.appt.id : undefined}
              />
            ))}
          </div>
        </div>

        {panel?.mode === 'appt' && (
          <ApptPanel
            appt={panel.appt}
            onClose={() => setPanel(null)}
            onCancel={() => setConfirmCancel(panel.appt)}
          />
        )}
        {panel?.mode === 'book' && (
          <BookPanel doctorId={panel.doctorId} time={panel.time} onClose={() => setPanel(null)} />
        )}
      </div>

      {confirmCancel && (
        <CancelConfirm appt={confirmCancel} onClose={() => setConfirmCancel(null)} onDone={() => {
          setConfirmCancel(null)
          setPanel(null)
        }} />
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

function TimeGutter() {
  const labels: number[] = []
  for (let t = BASE; t <= END; t += 30) labels.push(t)
  return (
    <div className="relative w-14 shrink-0 border-r border-border/70" style={{ height: HEIGHT + 34 }}>
      <div className="h-[34px] border-b border-border/70" />
      <div className="relative" style={{ height: HEIGHT }}>
        {labels.map((t) => (
          <div key={t} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" style={{ top: top(t) }}>
            {fmt(t)}
          </div>
        ))}
      </div>
    </div>
  )
}

function DoctorColumn({
  doc,
  onAppt,
  onGap,
  activeId,
}: {
  doc: CalendarDoctor
  onAppt: (a: CalendarAppointment) => void
  onGap: (t: number) => void
  activeId?: string
}) {
  const segments = useMemo(() => buildColumn(doc), [doc])
  // 30분 눈금 가로선
  const gridLines: number[] = []
  for (let t = BASE; t <= END; t += 30) gridLines.push(t)

  return (
    <div className="w-48 shrink-0 border-r border-border/70 last:border-r-0">
      {/* 열 머리 — 이름 + 진료과·진료시간 + 색 밑줄 (CAL-NAME-02) */}
      <div className="h-[34px] border-b border-border/70 px-3 py-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">{doc.name}</span>
          <span className="text-[11px] text-muted-foreground">{doc.department} · {doc.slotMinutes}분</span>
        </div>
        <div className="mt-1 h-0.5 rounded-full" style={{ background: doc.ink }} />
      </div>

      <div className="relative bg-muted/20" style={{ height: HEIGHT }}>
        {/* 눈금 가로선 (읽기 보조) */}
        {gridLines.map((t) => (
          <div key={t} className="pointer-events-none absolute left-0 right-0 border-t border-border/40" style={{ top: top(t) }} />
        ))}

        {segments.map((seg, i) => {
          const h = (seg.end - seg.start) * PX_PER_MIN
          const style = { top: top(seg.start), height: h - 1 }

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
                style={{
                  ...style,
                  backgroundImage:
                    'repeating-linear-gradient(45deg, rgba(100,116,139,0.10) 0 6px, transparent 6px 12px)',
                }}
              >
                <span className="tabular-nums">{seg.offKind} {fmt(seg.start)}–{fmt(seg.end)}</span>
              </div>
            )
          }

          // 예약 블록 (CAL-COLOR-14: 중간 톤 면 + 진한 글자)
          const a = seg.appt!
          const active = a.id === activeId
          return (
            <button
              key={i}
              onClick={() => onAppt(a)}
              title={`${a.patientName} · ${a.start}–${a.end} · ${a.status}`}
              className={`absolute left-1 right-1 overflow-hidden rounded-md px-2 py-1 text-left transition-shadow ${
                active ? 'ring-2 ring-primary ring-offset-1' : 'hover:brightness-[0.97]'
              }`}
              style={{ ...style, background: doc.fill, color: doc.ink, boxShadow: '0 1px 0 #fff' }}
            >
              {a.support && (
                <span className="absolute right-1 top-1 text-amber-600" title={`${a.support.type} · 확인 필요`}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
              )}
              <div className="truncate text-xs font-semibold leading-tight">{a.patientName}</div>
              {h >= 30 && (
                <div className="mt-0.5 truncate text-[10px] leading-tight opacity-80">
                  {a.status === '예약신청' ? '신청 · 미확정' : a.status}
                </div>
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
    <aside className="w-80 shrink-0 rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
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
      <Field label="진료">
        {doc.department} / {doc.name}
      </Field>
      <Field label="시각">
        <span className="tabular-nums">{appt.start}–{appt.end}</span>
      </Field>
      <Field label="상태">
        <StatusBadge status={appt.status} />
      </Field>
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
        <button className={`${btnGhost} flex-1 justify-center`} onClick={onCancel}>
          예약 취소
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        예약 변경은 격자에서 새 빈 시간을 눌러 고릅니다. 취소는 확인창에서 한 번 더 묻습니다.
      </p>
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
                    <button
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => setPicked(p)}
                    >
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
        {time != null ? (
          <span className="tabular-nums">{fmt(time)}부터</span>
        ) : (
          <span className="text-muted-foreground">격자의 빈 곳을 눌러 시간을 고르세요</span>
        )}
      </Field>
      <Field label="예약 이유">
        <input
          placeholder="전화로 들은 증상을 적습니다"
          className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
      </Field>

      <button className={`${btnPrimary} mt-2 w-full justify-center disabled:opacity-50`} disabled={!picked || time == null}>
        예약 저장
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground">
        저장 전에 환자·의사·시각을 한 번 더 확인합니다.
      </p>
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
