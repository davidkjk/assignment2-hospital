import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  History,
  LockKeyhole,
  Pencil,
  ShieldCheck,
  X,
} from '@/components/icons'
import { EmptyState, PageHead, StaffPage, StatusBadge, btnGhost, btnPrimary } from '../../_ui'

// 병합 되돌림 이력 (/staff/admin/merge-history) — MHIST-*.
// 병합을 만드는 화면이 아니라 이미 발생한 병합을 조회·되돌림하는 별도 화면(결정16).
// 6단계: 목록 → 상세 → 사유(1~200자) → 확인창(읽음 체크) → 완료 / 되돌림불가 잠김.
// 목록 행에 즉시 되돌림 버튼 없음(MHIST-LIST-01). data-testid="staff-merge-history".

type Status = '되돌림 가능' | '되돌림 완료' | '되돌림불가'

interface Event {
  id: string
  mergedAt: string
  actor: string
  rep: { id: string; name: string }
  absorbed: { id: string; name: string }
  status: Status
  lockReason?: string // 되돌림불가 사유
  preserve: { appts: number; qnr: number; records: number; audits: number }
}

const EVENTS: Event[] = [
  { id: 'm1024', mergedAt: '2026.08.21 15:03:20', actor: '한지우', rep: { id: 'P-1041', name: '이수현' }, absorbed: { id: 'P-2277', name: '이수현' }, status: '되돌림 가능', preserve: { appts: 15, qnr: 10, records: 10, audits: 25 } },
  { id: 'm1019', mergedAt: '2026.08.19 11:42:08', actor: '김서연', rep: { id: 'P-0880', name: '박서준' }, absorbed: { id: 'P-1990', name: '박서준' }, status: '되돌림 완료', preserve: { appts: 8, qnr: 5, records: 7, audits: 13 } },
  { id: 'm1007', mergedAt: '2026.08.14 09:20:55', actor: '한지우', rep: { id: 'P-0512', name: '정도현' }, absorbed: { id: 'P-1620', name: '정도현' }, status: '되돌림불가', lockReason: '병합 후 대표 환자에 새 진료기록 3건이 생성되어 계보를 안전하게 분리할 수 없습니다.', preserve: { appts: 20, qnr: 14, records: 12, audits: 30 } },
  { id: 'm0998', mergedAt: '2026.08.11 16:31:12', actor: '김서연', rep: { id: 'P-0333', name: '최유나' }, absorbed: { id: 'P-1450', name: '최유나' }, status: '되돌림 가능', preserve: { appts: 5, qnr: 4, records: 3, audits: 9 } },
]

const STATUS_TONE: Record<Status, 'teal' | 'gray' | 'slate'> = { '되돌림 가능': 'teal', '되돌림 완료': 'gray', '되돌림불가': 'slate' }

export function MergeHistory() {
  const navigate = useNavigate()
  const [events, setEvents] = useState(EVENTS)
  const [view, setView] = useState<'list' | 'detail' | 'reason' | 'done'>('list')
  const [selId, setSelId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [read, setRead] = useState(false)

  const sel = events.find((e) => e.id === selId) ?? null

  function open(e: Event) { setSelId(e.id); setView('detail'); setReason(''); setConfirming(false); setRead(false) }
  function backToList() { setView('list'); setSelId(null); setReason(''); setConfirming(false); setRead(false) }
  function confirmUndo() {
    if (!sel) return
    setEvents((cur) => cur.map((e) => (e.id === sel.id ? { ...e, status: '되돌림 완료' } : e)))
    setConfirming(false)
    setView('done')
  }

  return (
    <StaffPage testid="staff-merge-history" max="max-w-[1100px]">
      <PageHead title="병합 이력" sub="이미 처리한 병합을 확인하고 필요하면 관리자가 직접 되돌립니다" />

      {view === 'list' && (
        events.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            <EmptyState icon={<History className="h-6 w-6" />} title="병합 되돌림 이력이 없습니다" hint="중복 환자 후보 화면에서 병합을 처리하면 여기에 기록됩니다" />
            <div className="flex justify-center pb-6">
              <button onClick={() => navigate('/staff/admin/patient-merge-candidates')} className={btnGhost}>병합 후보 보기</button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                  <th className="w-[170px] px-4 py-2.5 font-semibold">병합 시각</th>
                  <th className="w-[96px] px-4 py-2.5 font-semibold">실행자</th>
                  <th className="px-4 py-2.5 font-semibold">대표 · 병합된 대상</th>
                  <th className="w-[120px] px-4 py-2.5 font-semibold">상태</th>
                  <th className="w-[104px] px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {events.map((e) => (
                  <tr key={e.id} className="align-middle transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{e.mergedAt}</td>
                    <td className="px-4 py-3">{e.actor}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{e.rep.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{e.rep.id}</span>
                        <span className="text-muted-foreground">←</span>
                        <span>{e.absorbed.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{e.absorbed.id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={e.status} tone={STATUS_TONE[e.status]} /></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => open(e)} className="text-xs font-medium text-primary hover:underline">상세 보기</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'detail' && sel && <Detail event={sel} onBack={backToList} onReview={() => setView('reason')} onOpenPatient={(id) => navigate(`/staff/patients/${id}`)} />}

      {view === 'reason' && sel && (
        <ReasonStep
          event={sel}
          reason={reason}
          onReason={setReason}
          onBack={() => setView('detail')}
          onContinue={() => setConfirming(true)}
        />
      )}

      {view === 'done' && sel && <DoneStep event={sel} reason={reason} onBack={backToList} />}

      {confirming && sel && (
        <ConfirmDialog event={sel} reason={reason} read={read} onRead={setRead} onCancel={() => setConfirming(false)} onConfirm={confirmUndo} />
      )}
    </StaffPage>
  )
}

// ── 2단계 상세 (MHIST-DETAIL-*) + 6단계 잠김 (MHIST-LOCK-*) ──
function Detail({ event, onBack, onReview, onOpenPatient }: { event: Event; onBack: () => void; onReview: () => void; onOpenPatient: (id: string) => void }) {
  const locked = event.status !== '되돌림 가능'
  const P = event.preserve
  const preserveRows = [
    { Icon: CalendarDays, label: '예약', n: P.appts },
    { Icon: ClipboardList, label: '문진 응답', n: P.qnr },
    { Icon: FileText, label: '진료기록', n: P.records },
    { Icon: ShieldCheck, label: '열람 감사', n: P.audits },
  ]
  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> 이력으로</button>

      <section className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" />병합 이벤트 {event.id}</h3>
          <StatusBadge status={event.status} tone={STATUS_TONE[event.status]} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">병합 시각</dt><dd className="tabular-nums">{event.mergedAt}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">실행자</dt><dd>{event.actor}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">대표 환자</dt><dd className="font-medium">{event.rep.name} <span className="text-xs tabular-nums text-muted-foreground">{event.rep.id}</span></dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">병합된 대상</dt><dd>{event.absorbed.name} <span className="text-xs tabular-nums text-muted-foreground">{event.absorbed.id}</span></dd></div>
        </dl>
      </section>

      {/* 보존 상태 read-only (MHIST-DETAIL-02) */}
      <section className="mt-3 rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <h4 className="text-sm font-semibold">원본 보존 상태</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">원본 레코드는 삭제되지 않았고 대표가 계보를 따라 함께 읽습니다.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {preserveRows.map((r) => (
            <div key={r.label} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><r.Icon className="h-3.5 w-3.5" />{r.label}</div>
              <div className="mt-0.5 text-lg font-bold tabular-nums">{r.n}<span className="ml-0.5 text-xs font-normal text-muted-foreground">건 보존</span></div>
            </div>
          ))}
        </div>
      </section>

      {/* 분기 (MHIST-DETAIL-03) */}
      {locked ? (
        <section className="mt-3 rounded-xl border border-border/70 bg-muted/30 p-4">
          <div className="flex items-start gap-2">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <div className="font-semibold">{event.status === '되돌림 완료' ? '이미 되돌림 처리됨' : '되돌릴 수 없는 병합입니다'}</div>
              <div className="mt-0.5 text-muted-foreground">{event.lockReason ?? '이 병합은 이미 되돌림 처리되어 다시 되돌릴 수 없습니다.'}</div>
            </div>
          </div>
          {event.status === '되돌림불가' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => onOpenPatient(event.absorbed.id)} className={btnGhost}><ExternalLink className="h-4 w-4" /> 대상 환자 열기</button>
              <button className={btnGhost}><Pencil className="h-4 w-4" /> 감사메모 저장</button>
            </div>
          )}
        </section>
      ) : (
        <div className="mt-4 flex justify-end">
          <button onClick={onReview} className={btnGhost}><History className="h-4 w-4" /> 되돌림 검토</button>
        </div>
      )}
    </div>
  )
}

// ── 3단계 사유 입력 (MHIST-REASON-*) ──
function ReasonStep({ event, reason, onReason, onBack, onContinue }: { event: Event; reason: string; onReason: (v: string) => void; onBack: () => void; onContinue: () => void }) {
  const len = reason.length
  const valid = len >= 1 && len <= 200
  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> 상세로</button>
      <section className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <h3 className="text-sm font-semibold">되돌림 사유</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{event.rep.name}({event.rep.id}) ← {event.absorbed.name}({event.absorbed.id}) 병합을 왜 되돌리는지 남깁니다. 이 사유는 감사 기록에 함께 저장됩니다.</p>
        <textarea
          value={reason}
          onChange={(e) => onReason(e.target.value.slice(0, 200))}
          rows={3}
          placeholder="예 · 다른 사람으로 확인되어 정정"
          className="mt-3 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{len === 0 ? '사유를 입력해 주세요' : ''}</span>
          <span className={`tabular-nums ${len >= 200 ? 'text-rose-600' : 'text-muted-foreground'}`}>{len}/200</span>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onBack} className={btnGhost}>취소</button>
          <button onClick={onContinue} disabled={!valid} className={btnPrimary}>확인으로 계속</button>
        </div>
      </section>
    </div>
  )
}

// ── 4단계 확인창 (MHIST-CONFIRM-*) — 읽음 체크 후에만 파괴 버튼 ──
function ConfirmDialog({ event, reason, read, onRead, onCancel, onConfirm }: { event: Event; reason: string; read: boolean; onRead: (v: boolean) => void; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="undo-title" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--elevation-card)]">
        <div className="mb-1 flex items-start justify-between">
          <h2 id="undo-title" className="text-lg font-bold">병합을 되돌릴까요?</h2>
          <button onClick={onCancel} className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <dl className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">대표 · 대상</dt><dd className="font-medium">{event.rep.name} {event.rep.id} ← {event.absorbed.name} {event.absorbed.id}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">병합 시각</dt><dd className="tabular-nums">{event.mergedAt}</dd></div>
          <div><dt className="text-muted-foreground">되돌림 사유</dt><dd className="mt-0.5">{reason}</dd></div>
        </dl>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>원본 예약·문진·진료기록·감사 기록은 지우지 않고 계보 연결만 끊습니다. <strong className="font-semibold">병합 당시 이미 열람된 기록은 되돌릴 수 없습니다.</strong> 되돌림도 별도 감사 기록으로 남습니다.</span>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={read} onChange={(e) => onRead(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
          <span>보존 범위·열람 제한·감사 잔존 안내를 읽고 이해했습니다.</span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className={btnGhost}>취소</button>
          <button onClick={onConfirm} disabled={!read} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
            <History className="h-4 w-4" /> 되돌림 확정
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 5단계 완료 (MHIST-DONE-*) ──
function DoneStep({ event, reason, onBack }: { event: Event; reason: string; onBack: () => void }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-6 text-center shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div>
      <h3 className="mt-3 text-base font-bold">되돌림 완료</h3>
      <p className="mt-1 text-sm text-muted-foreground">{event.rep.name} {event.rep.id} ← {event.absorbed.name} {event.absorbed.id} 병합의 계보 연결을 끊었습니다.</p>
      <dl className="mx-auto mt-4 max-w-sm space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-left text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">처리 시각</dt><dd className="tabular-nums">방금</dd></div>
        <div className="flex items-center gap-1.5"><dt className="text-muted-foreground">사유</dt><dd>{reason}</dd></div>
      </dl>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-emerald-600" />원본 예약·문진·진료기록·기존 감사 행은 그대로 보존되고, 되돌림도 별도 감사 기록으로 남았습니다.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={onBack} className={btnPrimary}>이력으로 돌아가기</button>
      </div>
    </section>
  )
}
