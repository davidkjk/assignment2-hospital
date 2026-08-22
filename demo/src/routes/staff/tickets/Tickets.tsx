import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, MessageCircle, Sparkles, UserRound, Check, AlertTriangle } from '@/components/icons'
import { StaffPage, PageHead, Segmented, EmptyState, btnPrimary, btnGhost } from '../_ui'
import {
  INITIAL_TICKETS,
  ticketsForStatus,
  ACTIVE_STAFF,
  type Ticket,
  type TicketStatus,
  type TicketMessage,
} from './mockData'

// 문의 티켓함 (/staff/tickets) — TICKET-INBOX-* · TICKET-DETAIL-*.
// 분할 화면: 왼쪽 티켓 목록(상태 탭 3개) + 오른쪽 넓은 상세 작업공간.
// 새 문의 행 선택 → 그 직원에게 배정 + pending→in_progress + 상세 열림 (TICKET-DETAIL-OPEN-01).
// 상세 순서: 담당 이관 → 인계 요약 5항목 → 전체 대화 → 답변+보내기 → (분리) 상담 종료.
// [상담 종료]는 확인창 안에서만(TICKET-DETAIL-CLOSE-02). data-testid="staff-tickets".

const ME = '김서연' // 로그인 직원 (데모)
const STATUS_LABEL: Record<TicketStatus, string> = {
  pending: '직원 연결 중',
  in_progress: '직원 상담 중',
  answered: '상담 종료',
}
const TABS: { key: TicketStatus; label: string }[] = [
  { key: 'pending', label: '새 문의' },
  { key: 'in_progress', label: '처리 중' },
  { key: 'answered', label: '답변 완료' },
]

export function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>(INITIAL_TICKETS)
  const [tab, setTab] = useState<TicketStatus>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = ticketsForStatus(tickets, tab)
  const selected = tickets.find((t) => t.id === selectedId) ?? null

  const openTicket = (t: Ticket) => {
    if (t.status === 'pending') {
      // 선택과 동시에 배정 + pending→in_progress (TICKET-DETAIL-OPEN-01)
      setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: 'in_progress', assignee: ME } : x)))
      setTab('in_progress')
    }
    setSelectedId(t.id)
  }

  const patch = (id: string, up: Partial<Ticket>) =>
    setTickets((prev) => prev.map((x) => (x.id === id ? { ...x, ...up } : x)))

  return (
    <StaffPage max="max-w-full" testid="staff-tickets" footer={false}>
      <PageHead title="문의 티켓함" sub="상담봇이 직원에게 넘긴 문의를 맡아 답합니다" />

      <div className="flex gap-4" style={{ height: 'calc(100vh - 11rem)' }}>
        {/* 왼쪽: 상태 탭 + 목록 */}
        <div className="flex w-96 shrink-0 flex-col">
          <Segmented
            options={TABS}
            value={tab}
            onChange={(k) => setTab(k)}
            count={(k) => tickets.filter((t) => t.status === k).length}
          />
          <div className="mt-2 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {rows.length === 0 ? (
              <EmptyState title={`${TABS.find((t) => t.key === tab)?.label} 문의가 없습니다`} hint="다른 탭을 확인해 보세요." />
            ) : (
              rows.map((t) => (
                <TicketRow key={t.id} t={t} active={t.id === selectedId} onClick={() => openTicket(t)} />
              ))
            )}
          </div>
        </div>

        {/* 오른쪽: 상세 작업공간 */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {selected ? (
            <TicketDetail
              key={selected.id}
              t={selected}
              onReassign={(name) => patch(selected.id, { assignee: name })}
              onReply={(msg) => patch(selected.id, { messages: [...selected.messages, msg] })}
              onClose={() => patch(selected.id, { status: 'answered' })}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={<MessageCircle className="h-6 w-6" />}
                title="문의를 선택하세요"
                hint="왼쪽에서 문의를 고르면 대화와 인계 요약이 여기에 열립니다."
              />
            </div>
          )}
        </div>
      </div>
    </StaffPage>
  )
}

function TicketRow({ t, active, onClick }: { t: Ticket; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        active ? 'border-primary bg-primary/5' : 'border-border/70 bg-card hover:bg-muted'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium">{t.question}</span>
        {t.unread && <span className="mt-1 shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-medium text-white">새 메시지</span>}
      </div>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.handoffReason}</p>
      {t.bookingType && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">{t.bookingType}</span>
          <span className="text-[11px] text-muted-foreground">{t.bookingSummary}</span>
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{t.createdLabel}</span>
        <span>{t.assignee ?? '미배정'}</span>
      </div>
    </button>
  )
}

function TicketDetail({
  t,
  onReassign,
  onReply,
  onClose,
}: {
  t: Ticket
  onReassign: (name: string) => void
  onReply: (msg: TicketMessage) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const readOnly = t.status === 'answered'
  const isMedical = t.reason === 'medical_judgment'

  const send = () => {
    if (!draft.trim()) return
    onReply({ id: `m${Date.now()}`, sender: '직원', text: draft.trim(), time: '지금' })
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col">
      {/* ① 담당 이관 (맨 위) — TICKET-DETAIL-LAYOUT-01 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${readOnly ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
          {STATUS_LABEL[t.status]}
        </span>
        <span className="text-sm text-muted-foreground">담당</span>
        {readOnly ? (
          <span className="text-sm font-medium">{t.assignee ?? '미배정'}</span>
        ) : (
          <>
            <select
              value={t.assignee ?? ''}
              onChange={(e) => onReassign(e.target.value)}
              className="h-8 rounded-lg border border-input bg-card px-2 text-sm outline-none focus:border-ring"
            >
              {ACTIVE_STAFF.map((s) => (
                <option key={s.id} value={s.name}>{s.name} · {s.role}</option>
              ))}
            </select>
            <button className={`${btnGhost} py-1.5`}>이관</button>
            {isMedical && (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" /> 의료 판단 — 담당 의사에게 전달하세요
              </span>
            )}
          </>
        )}
        {t.bookingType && (
          <button className={`${btnGhost} ml-auto py-1.5`} onClick={() => navigate('/staff/calendar')}>
            <CalendarDays className="h-4 w-4" /> 캘린더에서 예약 처리
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* ② 인계 요약 5항목 — 없으면 "없음" (TICKET-DETAIL-SUM-*) */}
        <section className="rounded-xl border border-border/70 bg-muted/20 p-3">
          <h3 className="mb-2 text-sm font-semibold">인계 요약</h3>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SummaryItem label="환자가 궁금해한 내용" value={t.summary.question} />
            <SummaryItem label="상담봇이 확인한 정보" value={t.summary.confirmed} />
            <SummaryItem label="이미 안내한 내용" value={t.summary.guided} />
            <SummaryItem label="해결되지 않은 이유" value={t.summary.unresolved} />
            <SummaryItem label="직원이 확인할 사항" value={t.summary.staffCheck} />
          </dl>
          {t.contactNote && <p className="mt-2 text-xs text-muted-foreground">{t.contactNote}</p>}
        </section>

        {/* ③ 전체 대화 (시간순, 발신 주체 구분) */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">전체 대화</h3>
          <div className="space-y-2">
            {t.messages.map((m) => (
              <Bubble key={m.id} m={m} />
            ))}
          </div>
        </section>
      </div>

      {/* ④ 답변 입력 + 보내기 / ⑤ (분리) 상담 종료 */}
      {readOnly ? (
        <div className="border-t border-border/70 px-4 py-3 text-center text-sm text-muted-foreground">
          상담이 종료된 문의입니다 · 읽기 전용
        </div>
      ) : (
        <div className="border-t border-border/70 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder="환자에게 보낼 답변을 적습니다"
              className="min-w-0 flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
            <button className={btnPrimary} onClick={send} disabled={!draft.trim()}>보내기</button>
          </div>
          {/* 되돌릴 수 없는 [상담 종료]는 [보내기]와 분리 (TICKET-DETAIL-CLOSE-SEP-01) */}
          <div className="mt-3 flex items-center justify-between border-t border-dashed border-border/60 pt-3">
            <span className="text-xs text-muted-foreground">상담이 끝났다면 종료합니다. 종료하면 다시 열 수 없습니다.</span>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              onClick={() => setConfirmClose(true)}
            >
              상담 종료
            </button>
          </div>
        </div>
      )}

      {confirmClose && (
        <CloseConfirm hasDraft={!!draft.trim()} onSendFirst={() => { send(); setConfirmClose(false) }} onClose={() => setConfirmClose(false)} onDone={() => { onClose(); setConfirmClose(false) }} />
      )}
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className={`text-sm ${value ? '' : 'text-muted-foreground'}`}>{value ?? '없음'}</dd>
    </div>
  )
}

function Bubble({ m }: { m: TicketMessage }) {
  const isStaff = m.sender === '직원'
  const tone =
    m.sender === 'AI'
      ? 'bg-violet-50 text-violet-900'
      : m.sender === '직원'
      ? 'bg-primary text-primary-foreground'
      : 'bg-muted text-foreground'
  const Icon = m.sender === 'AI' ? Sparkles : UserRound
  return (
    <div className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${tone}`}>
        <div className={`mb-0.5 flex items-center gap-1 text-[11px] ${isStaff ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          {!isStaff && <Icon className="h-3 w-3" />}
          {m.sender} · {m.time}
        </div>
        <p className="text-sm leading-snug">{m.text}</p>
      </div>
    </div>
  )
}

function CloseConfirm({
  hasDraft,
  onSendFirst,
  onClose,
  onDone,
}: {
  hasDraft: boolean
  onSendFirst: () => void
  onClose: () => void
  onDone: () => void
}) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h3 className="text-base font-bold">상담을 종료할까요?</h3>
        <p className="mt-2 text-sm text-muted-foreground">종료하면 이 문의는 다시 열 수 없습니다. 더 물어볼 것이 있으면 새 문의로 이어집니다.</p>
        {hasDraft && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>작성 중인 답변이 있습니다. 먼저 보낼까요?</span>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose}>돌아가기</button>
          {hasDraft && <button className={btnGhost} onClick={onSendFirst}><Check className="h-4 w-4" /> 먼저 보내기</button>}
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700" onClick={onDone}>
            상담 종료
          </button>
        </div>
      </div>
    </div>
  )
}
